import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DOMParser} from '@xmldom/xmldom';
import midiFile from 'midi-file';

const PPQ = 960;
const EPSILON = 1e-7;
const MOVEMENTS = [
  {name: 'I', start: 0, count: 295, beats: 4, beatType: 4, bpm: 132},
  {name: 'III', start: 295, count: 243, beats: 2, beatType: 2, bpm: 192},
];
const MEASURE_COUNT = MOVEMENTS.reduce((sum, movement) => sum + movement.count, 0);
const pitchBases = {C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11};
const typeQuarterLengths = {
  maxima: 32, long: 16, breve: 8, whole: 4, half: 2, quarter: 1,
  eighth: 0.5, '16th': 0.25, '32nd': 0.125, '64th': 0.0625,
  '128th': 0.03125, '256th': 0.015625,
};
const dynamicVelocities = {pppp: 20, ppp: 28, pp: 40, p: 52, mp: 66, mf: 80, f: 96, ff: 110, fff: 122, ffff: 126};

const children = (parent, name) => Array.from(parent?.childNodes ?? []).filter(node =>
  node.nodeType === 1 && (!name || node.nodeName === name));
const one = (parent, name) => children(parent, name)[0];
const text = (parent, name) => one(parent, name)?.textContent?.trim();
const descendants = (parent, name) => Array.from(parent?.getElementsByTagName(name) ?? []);
const numberText = (parent, name, fallback = undefined) => {
  const value = text(parent, name);
  return value === undefined ? fallback : Number(value);
};
const addIssue = (issues, code, message, details = {}) => issues.push({code, message, ...details});

function parseXml(xml) {
  const parserErrors = [];
  const document = new DOMParser({errorHandler: {
    warning: message => parserErrors.push(`warning: ${message}`),
    error: message => parserErrors.push(`error: ${message}`),
    fatalError: message => parserErrors.push(`fatal: ${message}`),
  }}).parseFromString(xml, 'application/xml');
  if (parserErrors.length || document.documentElement?.nodeName !== 'score-partwise') {
    throw new Error(`MusicXML inválido: ${parserErrors.join('; ') || 'raiz score-partwise ausente'}`);
  }
  return document;
}

function durationFromType(note, duration, issues, location) {
  const type = text(note, 'type');
  if (!type) return;
  const base = typeQuarterLengths[type];
  if (!base) {
    addIssue(issues, 'UNKNOWN_NOTE_TYPE', `Tipo de nota não reconhecido: ${type}.`, location);
    return;
  }
  let expected = base;
  for (let dot = 1; dot <= children(note, 'dot').length; dot++) expected += base / (2 ** dot);
  const modification = one(note, 'time-modification');
  if (modification) {
    const actual = numberText(modification, 'actual-notes');
    const normal = numberText(modification, 'normal-notes');
    if (!(actual > 0 && normal > 0)) {
      addIssue(issues, 'INVALID_TIME_MODIFICATION', 'Time-modification inválido.', location);
      return;
    }
    expected *= normal / actual;
  }
  if (Math.abs(expected - duration) > EPSILON) {
    addIssue(issues, 'TYPE_DURATION_MISMATCH', 'A duração MusicXML não corresponde ao tipo, pontos e quiáltera.',
      {...location, durationQuarters: duration, typeDurationQuarters: expected, type});
  }
}

function readTempoDirection(direction, divisions, measureIndex, partId, onset, issues) {
  const sound = one(direction, 'sound');
  const staff = numberText(direction, 'staff', 1);
  const voice = text(direction, 'voice') || null;
  const words = descendants(direction, 'words').map(node => node.textContent?.trim()).filter(Boolean).join(' ');
  const dynamicsElement = descendants(direction, 'dynamics')[0];
  const dynamicName = dynamicsElement ? children(dynamicsElement)[0]?.nodeName : undefined;
  let velocity = dynamicName ? dynamicVelocities[dynamicName] : undefined;
  if (sound?.hasAttribute('dynamics')) {
    const soundDynamics = Number(sound.getAttribute('dynamics'));
    if (Number.isFinite(soundDynamics)) velocity = Math.max(1, Math.min(127, Math.round(soundDynamics * 1.27)));
  }
  const offset = numberText(direction, 'offset', 0) / Math.max(1, divisions);
  const directionOnset = onset + offset;
  const tempos = [];
  if (sound?.hasAttribute('tempo')) {
    const bpm = Number(sound.getAttribute('tempo'));
    if (Number.isFinite(bpm) && bpm > 0) tempos.push({measureIndex, onset: directionOnset, bpm, source: 'musicxml-sound', partId});
    else addIssue(issues, 'INVALID_TEMPO', 'A direção sound contém tempo inválido.', {partId, measureIndex});
  }
  const metronome = descendants(direction, 'metronome')[0];
  if (metronome && !tempos.length) {
    const perMinute = numberText(metronome, 'per-minute');
    const unit = text(metronome, 'beat-unit');
    const unitLength = typeQuarterLengths[unit];
    const dots = children(metronome, 'beat-unit-dot').length;
    if (perMinute > 0 && unitLength) {
      let beatLength = unitLength;
      for (let dot = 1; dot <= dots; dot++) beatLength += unitLength / (2 ** dot);
      tempos.push({measureIndex, onset: directionOnset, bpm: perMinute * beatLength, source: 'musicxml-metronome', partId});
    } else {
      addIssue(issues, 'INVALID_METRONOME', 'A marcação de metrônomo não tem unidade/valor numérico utilizável.', {partId, measureIndex});
    }
  }
  return {measureIndex, onset: directionOnset, staff, voice, words, velocity, tempos};
}

function parsePart(partNode, declaration, partIndex, issues) {
  const partId = partNode.getAttribute('id') || '';
  const measures = [];
  const state = {divisions: 0, beats: 4, beatType: 4, transpose: null};
  let transposeWasDeclared = false;
  let pitchedEvents = 0;
  let cueEvents = 0;
  let cuePitchedNotes = 0;
  let graceNotes = 0;
  let typeDurationChecks = 0;

  for (const [measureIndex, measureNode] of children(partNode, 'measure').entries()) {
    const label = measureNode.getAttribute('number') || String(measureIndex + 1);
    let cursor = 0;
    let anchor = 0;
    let eventIndex = 0;
    const events = [];
    const directions = [];

    for (const item of children(measureNode)) {
      if (item.nodeName === 'attributes') {
        if (text(item, 'divisions') !== undefined) {
          state.divisions = numberText(item, 'divisions');
          if (!(state.divisions > 0 && Number.isFinite(state.divisions))) {
            addIssue(issues, 'INVALID_DIVISIONS', 'Divisions deve ser positivo.', {partId, measureIndex, measure: label});
          }
        }
        if (text(item, 'staves') !== undefined && numberText(item, 'staves') !== 1) {
          addIssue(issues, 'STAFF_COUNT', 'Cada parte deve declarar exatamente uma pauta.', {partId, measureIndex, measure: label, staves: text(item, 'staves')});
        }
        for (const staffDetails of children(item, 'staff-details')) {
          const staffNumber = numberText(staffDetails, 'staff-number', Number(staffDetails.getAttribute('number') || 1));
          if (staffNumber !== 1) addIssue(issues, 'STAFF_DETAILS_INDEX', 'staff-details declara uma segunda pauta.', {partId, measureIndex, measure: label, staff: staffNumber});
        }
        for (const clef of children(item, 'clef')) {
          const clefNumber = Number(clef.getAttribute('number') || 1);
          if (clefNumber !== 1) addIssue(issues, 'CLEF_STAFF_INDEX', 'Clef declara uma segunda pauta.', {partId, measureIndex, measure: label, staff: clefNumber});
        }
        const time = one(item, 'time');
        if (time) {
          state.beats = numberText(time, 'beats');
          state.beatType = numberText(time, 'beat-type');
          if (!(state.beats > 0 && state.beatType > 0)) {
            addIssue(issues, 'INVALID_METER', 'Compasso MusicXML inválido.', {partId, measureIndex, measure: label});
          }
        }
        for (const transpose of children(item, 'transpose')) {
          const diatonic = numberText(transpose, 'diatonic');
          const chromatic = numberText(transpose, 'chromatic');
          const octaveChange = numberText(transpose, 'octave-change', 0);
          transposeWasDeclared = true;
          state.transpose = {diatonic, chromatic, octaveChange};
          if (diatonic !== -2 || chromatic !== -3 || octaveChange !== 0) {
            addIssue(issues, 'UNEXPECTED_TRANSPOSITION', 'A transposição deve ser diatonic=-2, chromatic=-3, sem mudança de oitava.',
              {partId, measureIndex, measure: label, transpose: state.transpose});
          }
        }
        continue;
      }
      if (item.nodeName === 'backup' || item.nodeName === 'forward') {
        if (!(state.divisions > 0)) {
          addIssue(issues, 'DIVISIONS_MISSING', 'Backup/forward encontrado antes de divisions.', {partId, measureIndex, measure: label});
          continue;
        }
        const units = numberText(item, 'duration');
        if (!(units >= 0 && Number.isFinite(units))) {
          addIssue(issues, 'INVALID_CURSOR_DURATION', 'Duração de backup/forward inválida.', {partId, measureIndex, measure: label});
          continue;
        }
        cursor += (item.nodeName === 'backup' ? -1 : 1) * units / state.divisions;
        if (cursor < -EPSILON) addIssue(issues, 'NEGATIVE_CURSOR', 'Cursor MusicXML ficou negativo.', {partId, measureIndex, measure: label, cursor});
        anchor = cursor;
        continue;
      }
      if (item.nodeName === 'direction') {
        directions.push(readTempoDirection(item, state.divisions || 1, measureIndex, partId, cursor, issues));
        continue;
      }
      if (item.nodeName === 'sound' && item.hasAttribute('tempo')) {
        const bpm = Number(item.getAttribute('tempo'));
        const tempos = [];
        if (Number.isFinite(bpm) && bpm > 0) tempos.push({measureIndex, onset: cursor, bpm, source: 'musicxml-measure-sound', partId});
        else addIssue(issues, 'INVALID_TEMPO', 'O sound de compasso contém tempo inválido.', {partId, measureIndex, measure: label});
        directions.push({measureIndex, onset: cursor, staff: 1, words: '', velocity: undefined, tempos, partId, directSound: true});
        continue;
      }
      if (item.nodeName !== 'note') continue;

      const staff = numberText(item, 'staff', 1);
      if (staff !== 1) addIssue(issues, 'STAFF_INDEX', 'Nota fora da única pauta da parte.', {partId, measureIndex, measure: label, staff});
      const cue = Boolean(one(item, 'cue'));
      const grace = Boolean(one(item, 'grace'));
      const chord = Boolean(one(item, 'chord'));
      const rest = Boolean(one(item, 'rest'));
      const voice = text(item, 'voice') || '1';
      if (!(state.divisions > 0)) addIssue(issues, 'DIVISIONS_MISSING', 'Nota encontrada antes de divisions.', {partId, measureIndex, measure: label});
      const durationUnits = numberText(item, 'duration', grace ? 0 : NaN);
      const duration = grace ? 0 : durationUnits / Math.max(1, state.divisions);
      if (!(duration > 0 && Number.isFinite(duration)) && !grace) {
        addIssue(issues, 'INVALID_NOTE_DURATION', 'Nota/pausa sem duração positiva.', {partId, measureIndex, measure: label, eventIndex: eventIndex + 1});
      }
      const onset = chord ? anchor : cursor;
      const pitchNode = one(item, 'pitch');
      let writtenPitch = null;
      let pitchStep = null;
      let pitchAlter = 0;
      if (pitchNode) {
        pitchStep = text(pitchNode, 'step');
        const octave = numberText(pitchNode, 'octave');
        pitchAlter = numberText(pitchNode, 'alter', 0);
        if (!Object.hasOwn(pitchBases, pitchStep) || !Number.isFinite(octave) || !Number.isFinite(pitchAlter)) {
          addIssue(issues, 'INVALID_PITCH', 'Pitch deve ter step, octave e alter numéricos válidos.', {partId, measureIndex, measure: label});
        } else {
          writtenPitch = 12 * (octave + 1) + pitchBases[pitchStep] + pitchAlter;
          pitchedEvents++;
          if (!Number.isInteger(writtenPitch)) addIssue(issues, 'MICROTONAL_PITCH_UNSUPPORTED', 'O MIDI padrão não representa alteração fracionária de semitom.',
            {partId, measureIndex, measure: label, writtenPitch});
        }
      } else if (!rest) {
        addIssue(issues, 'UNSUPPORTED_UNPITCHED_NOTE', 'Nota sem pitch/rest (por exemplo, unpitched) não é suportada neste exportador.', {partId, measureIndex, measure: label});
      }
      if (cue) cueEvents++;
      if (cue && writtenPitch !== null) cuePitchedNotes++;
      if (grace && !cue) graceNotes++;
      if (!grace) {
        durationFromType(item, duration, issues, {partId, measureIndex, measure: label, eventIndex: eventIndex + 1});
        if (text(item, 'type')) typeDurationChecks++;
      }
      const tieTypes = new Set([
        ...children(item, 'tie').map(node => node.getAttribute('type')),
        ...descendants(item, 'tied').map(node => node.getAttribute('type')),
      ]);
      const tieStart = tieTypes.has('start');
      const tieStop = tieTypes.has('stop');
      for (const tieType of tieTypes) if (!['start', 'stop'].includes(tieType)) {
        addIssue(issues, 'INVALID_TIE_TYPE', 'Tie deve ter type start ou stop.', {partId, measureIndex, measure: label, type: tieType});
      }
      const articulations = descendants(item, 'articulations').flatMap(node => children(node).map(child => child.nodeName));
      const slurs = descendants(item, 'slur').map(node => ({type: node.getAttribute('type'), number: node.getAttribute('number') || '1'}));
      if (tieTypes.size && !writtenPitch) addIssue(issues, 'TIE_WITHOUT_PITCH', 'Tie encontrado em evento sem pitch.', {partId, measureIndex, measure: label});
      const transposition = state.transpose;
      if (writtenPitch !== null && !transposition) {
        addIssue(issues, 'TRANSPOSITION_MISSING', 'A parte não declarou transposição antes da primeira nota.', {partId, measureIndex, measure: label});
      }
      const event = {
        id: `${partId}-m${measureIndex + 1}-e${++eventIndex}`,
        partId, partIndex, measureIndex, measure: label, staff, voice, onset, duration,
        rest, cue, grace, chord, writtenPitch, pitch: writtenPitch === null || !transposition ? null : writtenPitch + transposition.chromatic + 12 * transposition.octaveChange,
        pitchStep, pitchAlter, tieStart, tieStop, articulations, slurs,
      };
      events.push(event);
      if (!chord && !grace) {
        anchor = cursor;
        cursor += duration;
      }
    }

    const measureDuration = state.beats * 4 / state.beatType;
    const expectedMovement = MOVEMENTS.find(movement => measureIndex >= movement.start && measureIndex < movement.start + movement.count);
    if (expectedMovement && (state.beats !== expectedMovement.beats || state.beatType !== expectedMovement.beatType)) {
      addIssue(issues, 'UNEXPECTED_METER', `O movimento ${expectedMovement.name} deve estar em ${expectedMovement.beats}/${expectedMovement.beatType}.`,
        {partId, measureIndex, measure: label, beats: state.beats, beatType: state.beatType});
    }
    if (Math.abs(measureDuration - 4) > EPSILON) {
      addIssue(issues, 'MEASURE_NOT_FOUR_QUARTERS', 'Cada compasso deve durar quatro semínimas.', {partId, measureIndex, measure: label, durationQuarters: measureDuration});
    }
    const navigation = readNavigation(measureNode);
    measures.push({index: measureIndex, label, beats: state.beats, beatType: state.beatType, duration: measureDuration,
      events, directions, navigation});
  }

  const knownVoices = new Set(measures.flatMap(measure => measure.events)
    .filter(event => !event.cue && !event.grace).map(event => event.voice));
  if (!knownVoices.size) addIssue(issues, 'NON_CUE_COVERAGE_MISSING', 'A parte não contém nenhuma voz não-cue para validar/executar.', {partId});
  for (const measure of measures) validateMeasureCoverage(measure.events, measure.duration, issues, partId, measure.index, measure.label, knownVoices);
  if (!transposeWasDeclared) addIssue(issues, 'TRANSPOSITION_MISSING', 'A parte nunca declarou a transposição MusicXML exigida.', {partId});
  if (measures.length !== MEASURE_COUNT) addIssue(issues, 'MEASURE_COUNT', `Cada parte deve conter ${MEASURE_COUNT} compassos.`, {partId, actual: measures.length, expected: MEASURE_COUNT});
  validateMeasureLabels(measures, partId, issues);
  validateTiesAndSlurs(measures, partId, issues);
  return {id: partId, name: text(declaration, 'part-name') || partId, partIndex, measures, pitchedEvents,
    cueEvents, cuePitchedNotes, graceNotes, typeDurationChecks};
}

function validateMeasureLabels(measures, partId, issues) {
  if (measures.length !== MEASURE_COUNT) return;
  const prefixed = measures.every((measure, index) => {
    const movement = MOVEMENTS.find(item => index >= item.start && index < item.start + item.count);
    if (!movement) return false;
    return measure.label === `${movement.name}-${index - movement.start + 1}`;
  });
  const restarted = measures.every((measure, index) => {
    const movement = MOVEMENTS.find(item => index >= item.start && index < item.start + item.count);
    return movement && measure.label === String(index - movement.start + 1);
  });
  const global = measures.every((measure, index) => measure.label === String(index + 1));
  if (!prefixed && !restarted && !global) {
    addIssue(issues, 'MEASURE_LABEL_SEQUENCE', 'Os números devem ser I-n/III-n, reiniciar por movimento ou ser globais e sequenciais.', {partId});
  }
}

function validateMeasureCoverage(events, measureDuration, issues, partId, measureIndex, label, knownVoices = []) {
  const byVoice = new Map([...knownVoices].map(voice => [voice, []]));
  for (const event of events) {
    if (event.cue || event.grace || event.chord) continue;
    const spans = byVoice.get(event.voice) ?? [];
    spans.push({start: event.onset, end: event.onset + event.duration, id: event.id});
    byVoice.set(event.voice, spans);
  }
  for (const [voice, spans] of byVoice) {
    if (!spans.length) addIssue(issues, 'NON_CUE_COVERAGE_MISSING', 'A voz não tem nenhum evento não-cue neste compasso.',
      {partId, measureIndex, measure: label, voice});
    spans.sort((a, b) => a.start - b.start || a.end - b.end);
    let covered = 0;
    for (const span of spans) {
      if (span.start > covered + EPSILON) addIssue(issues, 'VOICE_GAP', 'Há lacuna temporal na cobertura não-cue da voz.',
        {partId, measureIndex, measure: label, voice, from: covered, to: span.start});
      if (span.start < covered - EPSILON) addIssue(issues, 'VOICE_OVERLAP', 'Há eventos não-cue sobrepostos na mesma voz (excluídos tons de acorde).',
        {partId, measureIndex, measure: label, voice, from: span.start, to: covered});
      covered = Math.max(covered, span.end);
    }
    if (covered < measureDuration - EPSILON) addIssue(issues, 'VOICE_SHORT', 'A cobertura não-cue da voz não chega ao fim do compasso.',
      {partId, measureIndex, measure: label, voice, actual: covered, expected: measureDuration});
    if (covered > measureDuration + EPSILON) addIssue(issues, 'VOICE_EXCESS', 'A cobertura não-cue da voz excede o compasso.',
      {partId, measureIndex, measure: label, voice, actual: covered, expected: measureDuration});
  }
}

function readNavigation(measureNode) {
  const navigation = {forward: false, backward: false, times: 2, endingStarts: [], endingStops: []};
  for (const barline of children(measureNode, 'barline')) {
    for (const repeat of children(barline, 'repeat')) {
      if (repeat.getAttribute('direction') === 'forward') navigation.forward = true;
      if (repeat.getAttribute('direction') === 'backward') {
        navigation.backward = true;
        navigation.times = Number(repeat.getAttribute('times') || 2);
      }
    }
    for (const ending of children(barline, 'ending')) {
      const numbers = (ending.getAttribute('number') || '').split(/[^0-9]+/).filter(Boolean).map(Number);
      if (ending.getAttribute('type') === 'start') navigation.endingStarts.push(numbers);
      else if (ending.getAttribute('type') === 'stop' || ending.getAttribute('type') === 'discontinue') navigation.endingStops.push(numbers);
    }
  }
  return navigation;
}

function validateTiesAndSlurs(measures, partId, issues) {
  const openTies = new Map();
  const openSlurs = new Map();
  const events = measures.flatMap(measure => measure.events).sort((a, b) => a.measureIndex - b.measureIndex || a.onset - b.onset);
  for (const event of events) {
    if (event.writtenPitch !== null && !event.rest) {
      const tieKey = `${event.cue ? 'cue' : 'main'}:${event.voice}:${event.writtenPitch}`;
      if (event.tieStop) {
        const prior = openTies.get(tieKey);
        const absolute = event.measureIndex * 4 + event.onset;
        if (!prior) addIssue(issues, 'TIE_STOP_WITHOUT_START', 'Tie stop sem início anterior compatível.',
          {partId, measure: event.measure, event: event.id, voice: event.voice, writtenPitch: event.writtenPitch});
        else if (Math.abs(prior.end - absolute) > EPSILON) addIssue(issues, 'TIE_NOT_CONTIGUOUS', 'As extremidades do tie não são contíguas.',
          {partId, measure: event.measure, event: event.id, expectedOnset: prior.end, actualOnset: absolute, voice: event.voice, writtenPitch: event.writtenPitch});
        if (prior) openTies.delete(tieKey);
      }
      if (event.tieStart) {
        if (openTies.has(tieKey) && !event.tieStop) addIssue(issues, 'TIE_START_DUPLICATE', 'Novo tie start antes de encerrar o tie anterior.',
          {partId, measure: event.measure, event: event.id, voice: event.voice, writtenPitch: event.writtenPitch});
        openTies.set(tieKey, {end: event.measureIndex * 4 + event.onset + event.duration, event: event.id});
      }
    }
    for (const slur of event.slurs) {
      const key = `${event.voice}:${slur.number}`;
      if (slur.type === 'stop') {
        if (!openSlurs.delete(key)) addIssue(issues, 'SLUR_STOP_WITHOUT_START', 'Slur stop sem início correspondente.',
          {partId, measure: event.measure, event: event.id, voice: event.voice, number: slur.number});
      } else if (slur.type === 'start') {
        if (openSlurs.has(key)) addIssue(issues, 'SLUR_START_DUPLICATE', 'Slur start duplicado antes do stop.',
          {partId, measure: event.measure, event: event.id, voice: event.voice, number: slur.number});
        openSlurs.set(key, event.id);
      } else {
        addIssue(issues, 'INVALID_SLUR_TYPE', 'Slur deve ter type start ou stop.', {partId, measure: event.measure, event: event.id, type: slur.type});
      }
    }
  }
  for (const [key, tie] of openTies) addIssue(issues, 'TIE_START_UNCLOSED', 'Tie start sem stop correspondente.', {partId, key, event: tie.event});
  for (const [key, event] of openSlurs) addIssue(issues, 'SLUR_UNCLOSED', 'Slur sem stop correspondente.', {partId, key, event});
}

export function parseScore(xml) {
  const document = parseXml(xml);
  const root = document.documentElement;
  const issues = [];
  const partNodes = children(root, 'part');
  const declarations = children(one(root, 'part-list'), 'score-part');
  const declarationById = new Map(declarations.map(declaration => [declaration.getAttribute('id'), declaration]));
  if (partNodes.length !== 2) addIssue(issues, 'PART_COUNT', 'O arquivo deve conter exatamente duas partes independentes.', {actual: partNodes.length, expected: 2});
  if (declarations.length !== 2) addIssue(issues, 'PART_DECLARATION_COUNT', 'part-list deve declarar exatamente as duas partes.', {actual: declarations.length, expected: 2});
  if (declarationById.size !== declarations.length) addIssue(issues, 'DUPLICATE_PART_DECLARATION', 'IDs de score-part devem ser únicos.');
  const ids = partNodes.map(part => part.getAttribute('id'));
  if (new Set(ids).size !== ids.length) addIssue(issues, 'DUPLICATE_PART_ID', 'IDs das partes devem ser únicos.', {ids});
  const parts = partNodes.map((part, index) => {
    const declaration = declarationById.get(part.getAttribute('id'));
    if (!declaration) addIssue(issues, 'PART_DECLARATION_MISSING', 'Não existe score-part correspondente ao part.', {partId: part.getAttribute('id')});
    return parsePart(part, declaration ?? part, index, issues);
  });
  if (parts.length === 2 && parts[0].measures.length === parts[1].measures.length) {
    for (let index = 0; index < parts[0].measures.length; index++) {
      const first = parts[0].measures[index];
      const second = parts[1].measures[index];
      if (first.label !== second.label) addIssue(issues, 'PART_MEASURE_ALIGNMENT', 'As partes não estão alinhadas no mesmo compasso.', {measureIndex: index, part1: first.label, part2: second.label});
      if (first.beats !== second.beats || first.beatType !== second.beatType) addIssue(issues, 'PART_METER_ALIGNMENT', 'As partes têm métricas divergentes.',
        {measureIndex: index, part1: `${first.beats}/${first.beatType}`, part2: `${second.beats}/${second.beatType}`});
      const nav1 = JSON.stringify(first.navigation);
      const nav2 = JSON.stringify(second.navigation);
      if (nav1 !== nav2) addIssue(issues, 'PART_REPEAT_ALIGNMENT', 'As partes têm navegação/repetições divergentes.', {measureIndex: index});
    }
  }
  const tempoPolicyField = descendants(one(root, 'identification'), 'miscellaneous-field')
    .find(field => field.getAttribute('name') === 'midi-tempo-policy');
  const tempoPolicyContext = tempoPolicyField?.textContent?.trim() || '';
  const editorialTempoFromMetadata = /editorial/i.test(tempoPolicyContext) && /tempo/i.test(tempoPolicyContext);
  const sourceNumericTempoAbsentFromPdf = /no numerical tempo supplied in pdf/i.test(tempoPolicyContext);
  return {document, parts, issues, measuresPerPart: parts.map(part => part.measures.length), expectedMeasures: MEASURE_COUNT,
    numericTempoEvents: parts.flatMap(part => part.measures.flatMap(measure => measure.directions.flatMap(direction => direction.tempos))),
    tempoWords: parts.flatMap(part => part.measures.flatMap(measure => measure.directions.filter(direction => direction.words).map(direction => ({partId: part.id, measureIndex: measure.index, text: direction.words})))),
    tempoPolicyContext, editorialTempoFromMetadata, sourceNumericTempoAbsentFromPdf,
    counts: {
      parts: parts.length,
      measuresPerPart: parts.map(part => part.measures.length),
      writtenPitchedEventsPerPart: parts.map(part => part.pitchedEvents),
      cueEventsPerPart: parts.map(part => part.cueEvents),
      cuePitchedNotesPerPart: parts.map(part => part.cuePitchedNotes),
      actualGraceNotesPerPart: parts.map(part => part.graceNotes),
      typeDurationChecksPerPart: parts.map(part => part.typeDurationChecks),
    }};
}


export function performedOrder(measures) {
  const groups = [];
  const forwards = [];
  for (const measure of measures) {
    if (measure.navigation.forward) forwards.push(measure.index);
    if (measure.navigation.backward) groups.push({start: forwards.pop() ?? 0, end: measure.index,
      times: Math.max(2, measure.navigation.times || 2), pass: 1});
  }
  const endingNumbers = new Map();
  let activeEnding = null;
  for (const measure of measures) {
    if (measure.navigation.endingStarts.length) activeEnding = measure.navigation.endingStarts.flat();
    if (activeEnding) endingNumbers.set(measure.index, activeEnding);
    if (measure.navigation.endingStops.length) activeEnding = null;
  }
  const order = [];
  for (let index = 0, guard = 0; index < measures.length; guard++) {
    if (guard > 20_000) throw new Error('A navegação de repetição não terminou.');
    const endingGroup = groups.find(group => group.end === index);
    const ending = endingNumbers.get(index);
    const group = groups.find(candidate => index >= candidate.start && index <= candidate.end) ||
      [...groups].reverse().find(candidate => candidate.end < index);
    if (!ending || ending.includes(group?.pass ?? 1)) order.push(index);
    if (endingGroup && endingGroup.pass < endingGroup.times) {
      endingGroup.pass++;
      index = endingGroup.start;
    } else index++;
  }
  return order;
}

function sourceTempoMap(parsed, issues) {
  const byPosition = new Map();
  for (const tempo of parsed.numericTempoEvents) {
    const key = `${tempo.measureIndex}:${tempo.onset.toFixed(7)}`;
    const current = byPosition.get(key);
    if (current && Math.abs(current.bpm - tempo.bpm) > EPSILON) {
      addIssue(issues, 'CONFLICTING_TEMPOS', 'As partes declaram tempos diferentes no mesmo ponto.',
        {measureIndex: tempo.measureIndex, onset: tempo.onset, firstBpm: current.bpm, secondBpm: tempo.bpm});
    } else if (!current) byPosition.set(key, tempo);
  }
  return [...byPosition.values()].sort((a, b) => a.measureIndex - b.measureIndex || a.onset - b.onset);
}

export function buildPerformance(parsed) {
  const issues = [];
  const firstPart = parsed.parts[0];
  const order = performedOrder(firstPart.measures);
  const sourceTempos = sourceTempoMap(parsed, issues);
  const notes = [];
  const tempos = [];
  const meters = [];
  const markers = [];
  let quarter = 0;
  let editorialMetronome = false;
  const tieMaps = parsed.parts.map(() => new Map());
  const velocitiesByPart = parsed.parts.map(() => new Map([['1', 80]]));
  const movementStarts = new Set(MOVEMENTS.map(movement => movement.start));
  const startTempoKeys = new Set(sourceTempos.filter(tempo => tempo.onset <= EPSILON).map(tempo => tempo.measureIndex));
  for (const movement of MOVEMENTS) {
    if (!startTempoKeys.has(movement.start)) editorialMetronome = true;
  }
  if (parsed.editorialTempoFromMetadata) editorialMetronome = true;

  for (const measureIndex of order) {
    const measure = firstPart.measures[measureIndex];
    const movement = MOVEMENTS.find(item => measureIndex >= item.start && measureIndex < item.start + item.count);
    if (!movement) {
      addIssue(issues, 'MOVEMENT_MAP', 'Compasso não pertence a um movimento configurado.', {measureIndex});
      continue;
    }
    if (movementStarts.has(measureIndex)) {
      const hasSourceTempoAtStart = sourceTempos.some(tempo => tempo.measureIndex === measureIndex && tempo.onset <= EPSILON);
      if (!hasSourceTempoAtStart) tempos.push({q: quarter, bpm: movement.bpm, source: 'editorial-default', movement: movement.name});
      markers.push({q: quarter, text: `Movimento ${movement.name}`});
    }
    for (const tempo of sourceTempos.filter(item => item.measureIndex === measureIndex)) {
      tempos.push({q: quarter + tempo.onset, bpm: tempo.bpm, source: tempo.source, movement: movement.name});
    }
    meters.push({q: quarter, numerator: measure.beats, denominator: measure.beatType});

    for (const part of parsed.parts) {
      const partMeasure = part.measures[measureIndex];
      const directionEvents = partMeasure.directions.slice().sort((a, b) => a.onset - b.onset);
      const events = partMeasure.events.slice().sort((a, b) => a.onset - b.onset || Number(a.chord) - Number(b.chord));
      const graceByPrincipal = new Map();
      for (const event of events) {
        if (event.cue || !event.grace) continue;
        const key = `${event.voice}:${event.onset.toFixed(7)}`;
        const group = graceByPrincipal.get(key) ?? [];
        group.push(event);
        graceByPrincipal.set(key, group);
      }
      const playedGraceGroups = new Set();
      const tieMap = tieMaps[part.partIndex];
      const velocities = velocitiesByPart[part.partIndex];

      for (const event of events) {
        if (event.cue || event.grace || event.rest || event.writtenPitch === null) continue;
        const absolute = quarter + event.onset;
        const pitch = event.pitch;
        if (!Number.isInteger(pitch) || pitch < 0 || pitch > 127) {
          addIssue(issues, 'MIDI_PITCH_RANGE', 'Altura transposta está fora do intervalo MIDI 0–127.', {partId: part.id, measure: event.measure, event: event.id, pitch});
          continue;
        }
        const matchingDynamics = directionEvents.filter(direction => direction.staff === 1 &&
          (!direction.voice || direction.voice === event.voice) && direction.onset <= event.onset && direction.velocity > 0);
        if (matchingDynamics.length) velocities.set(event.voice, matchingDynamics.at(-1).velocity);
        const graceKey = `${event.voice}:${event.onset.toFixed(7)}`;
        const graceGroup = graceByPrincipal.get(graceKey) ?? [];
        const graceLength = graceGroup.length ? Math.min(0.125, event.duration / 4) : 0;
        if (graceGroup.length && !playedGraceGroups.has(graceKey)) {
          if (event.onset > EPSILON) {
            const graceStart = absolute - graceLength;
            const previous = [...notes].reverse().find(note => note.partIndex === part.partIndex && note.voice === event.voice &&
              !note.grace && note.start < absolute - EPSILON && note.end > graceStart + EPSILON);
            if (previous && !previous.tieOpen) previous.end = graceStart;
            for (const [graceIndex, grace] of graceGroup.entries()) {
              if (!Number.isInteger(grace.pitch) || grace.pitch < 0 || grace.pitch > 127) {
                addIssue(issues, 'MIDI_GRACE_PITCH_RANGE', 'Altura da grace note está fora do intervalo MIDI.', {partId: part.id, measure: grace.measure, event: grace.id});
                continue;
              }
              notes.push({partId: part.id, partIndex: part.partIndex, voice: grace.voice, pitch: grace.pitch,
                start: graceStart + graceIndex * graceLength / graceGroup.length,
                end: graceStart + (graceIndex + 1) * graceLength / graceGroup.length,
                velocity: velocities.get(event.voice) ?? 80, ids: [grace.id], grace: true});
            }
          } else {
            for (const [graceIndex, grace] of graceGroup.entries()) {
              if (!Number.isInteger(grace.pitch) || grace.pitch < 0 || grace.pitch > 127) {
                addIssue(issues, 'MIDI_GRACE_PITCH_RANGE', 'Altura da grace note está fora do intervalo MIDI.', {partId: part.id, measure: grace.measure, event: grace.id});
                continue;
              }
              notes.push({partId: part.id, partIndex: part.partIndex, voice: grace.voice, pitch: grace.pitch,
                start: absolute + graceIndex * graceLength / graceGroup.length,
                end: absolute + (graceIndex + 1) * graceLength / graceGroup.length,
                velocity: velocities.get(event.voice) ?? 80, ids: [grace.id], grace: true});
            }
          }
          playedGraceGroups.add(graceKey);
        }

        const tieKey = `${event.voice}:${pitch}`;
        const tied = tieMap.get(tieKey);
        if (event.tieStop) {
          if (!tied || Math.abs(tied.notatedEnd - absolute) > EPSILON) {
            addIssue(issues, 'PERFORMANCE_TIE_MISMATCH', 'Tie stop não conecta com a nota MIDI anterior.', {partId: part.id, measure: event.measure, event: event.id});
          } else {
            tied.notatedEnd = absolute + event.duration;
            tied.end = tied.notatedEnd;
            tied.ids.push(event.id);
            if (event.tieStart) tied.tieOpen = true;
            else { tied.tieOpen = false; tieMap.delete(tieKey); }
            continue;
          }
        }
        const isTied = event.tieStart || event.tieStop;
        let gate = 1;
        if (event.articulations.includes('staccato')) gate = 0.5;
        if (event.articulations.includes('staccatissimo')) gate = 0.25;
        if (isTied) gate = 1;
        const velocity = Math.min(127, (velocities.get(event.voice) ?? 80) + (event.articulations.includes('accent') ? 10 : 0));
        const delay = event.onset <= EPSILON ? graceLength : 0;
        const start = absolute + delay;
        const end = start + Math.max(0, event.duration - delay) * gate;
        const note = {partId: part.id, partIndex: part.partIndex, voice: event.voice, pitch, start, end,
          notatedEnd: absolute + event.duration, velocity, ids: [event.id], grace: false, tieOpen: Boolean(event.tieStart)};
        notes.push(note);
        if (event.tieStart) tieMap.set(tieKey, note);
      }
      for (const [key, graceGroup] of graceByPrincipal) {
        if (!playedGraceGroups.has(key)) addIssue(issues, 'GRACE_WITHOUT_PRINCIPAL', 'Grace notes não-cue sem nota principal no mesmo ponto/voz.',
          {partId: part.id, measure: partMeasure.label, voice: graceGroup[0]?.voice});
      }
    }
    quarter += measure.duration;
  }
  for (let partIndex = 0; partIndex < parsed.parts.length; partIndex++) {
    const tieMap = tieMaps[partIndex];
    for (const [key, note] of tieMap) addIssue(issues, 'PERFORMANCE_TIE_UNCLOSED', 'Tie de execução ficou sem encerramento.',
      {partId: parsed.parts[partIndex].id, key, events: note.ids});
  }
  tempos.sort((a, b) => a.q - b.q || a.bpm - b.bpm);
  const editorialTempoNotes = MOVEMENTS.map(movement => ({movement: movement.name,
    bpm: movement.bpm, sourceNumericAtStart: startTempoKeys.has(movement.start),
    sourceWords: parsed.tempoWords.some(entry => entry.measureIndex >= movement.start && entry.measureIndex < movement.start + movement.count),
    editorialDefaultUsed: !startTempoKeys.has(movement.start),
    editorialRateMarkedInMusicXmlMetadata: parsed.editorialTempoFromMetadata,
    sourceNumericTempoAbsentFromPdf: parsed.sourceNumericTempoAbsentFromPdf}));
  return {order, notes, tempos, markers, meters, duration: quarter, issues,
    editorialMetronome, editorialTempoNotes, gracePolicy: 'Grace notes não-cue são tocadas; o grupo ocupa até 0,125 semínima antes da nota principal, encurtando a nota anterior quando possível, ou a nota principal no início de compasso.',
    articulationPolicy: 'Durações notadas preservadas; staccato=50%, staccatissimo=25%, tie sempre sustentado até o stop.'};
}

function deltaTrack(events, lastTick) {
  const sorted = events.slice().sort((a, b) => a.tick - b.tick || a.priority - b.priority);
  let prior = 0;
  const track = sorted.map(({tick, priority, ...event}) => {
    const deltaTime = tick - prior;
    prior = tick;
    return {...event, deltaTime};
  });
  track.push({deltaTime: Math.max(0, lastTick - prior), meta: true, type: 'endOfTrack'});
  return track;
}

function ascii(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, ' ');
}

export function makeMidi(performance, partNames = ['Clarinet I', 'Clarinet II']) {
  const tick = quarter => Math.round(quarter * PPQ);
  const endTick = tick(performance.duration);
  const conductor = [{tick: 0, priority: 0, meta: true, type: 'trackName', text: 'Mozart - Clarinetes I e II'}];
  for (const tempo of performance.tempos) {
    if (!(tempo.bpm > 0)) throw new Error(`Tempo MIDI inválido: ${tempo.bpm}`);
    conductor.push({tick: tick(tempo.q), priority: 0, meta: true, type: 'setTempo', microsecondsPerBeat: Math.round(60_000_000 / tempo.bpm)});
  }
  for (const marker of performance.markers) conductor.push({tick: tick(marker.q), priority: 1, meta: true, type: 'marker', text: ascii(marker.text)});
  let priorMeter = '';
  for (const meter of performance.meters) {
    const signature = `${meter.numerator}/${meter.denominator}`;
    if (signature === priorMeter) continue;
    priorMeter = signature;
    conductor.push({tick: tick(meter.q), priority: 1, meta: true, type: 'timeSignature', numerator: meter.numerator,
      denominator: meter.denominator, metronome: 24, thirtyseconds: 8});
  }
  const tracks = [deltaTrack(conductor, endTick)];
  for (const partIndex of [0, 1]) {
    const channel = partIndex;
    const events = [{tick: 0, priority: 0, meta: true, type: 'trackName', text: ascii(partNames[partIndex] || `Clarinet ${partIndex + 1}`)},
      {tick: 0, priority: 0, channel, type: 'programChange', programNumber: 71},
      {tick: 0, priority: 0, channel, type: 'controller', controllerType: 10, value: partIndex === 0 ? 48 : 80}];
    for (const note of performance.notes.filter(item => item.partIndex === partIndex)) {
      if (!Number.isInteger(note.pitch) || note.pitch < 0 || note.pitch > 127 || !(note.end > note.start)) {
        throw new Error(`Nota MIDI inválida em ${note.partId ?? partIndex}: pitch=${note.pitch}, ${note.start}..${note.end}`);
      }
      const start = tick(note.start);
      const end = Math.max(start + 1, tick(note.end));
      events.push({tick: start, priority: 2, channel, type: 'noteOn', noteNumber: note.pitch, velocity: note.velocity});
      events.push({tick: end, priority: 1, channel, type: 'noteOff', noteNumber: note.pitch, velocity: 0});
    }
    tracks.push(deltaTrack(events, endTick));
  }
  return Buffer.from(midiFile.writeMidi({header: {format: 1, numTracks: 3, ticksPerBeat: PPQ}, tracks}));
}

export function verifyMidi(buffer, performance, partNames = ['Clarinet I', 'Clarinet II']) {
  const midi = midiFile.parseMidi(buffer);
  const issues = [];
  if (midi.header.format !== 1) addIssue(issues, 'MIDI_FORMAT', 'O MIDI deve ser formato 1.', {actual: midi.header.format});
  if (midi.header.ticksPerBeat !== PPQ) addIssue(issues, 'MIDI_PPQ', 'PPQ inesperado.', {actual: midi.header.ticksPerBeat, expected: PPQ});
  if (midi.tracks.length !== 3) addIssue(issues, 'MIDI_TRACK_COUNT', 'Esperadas três pistas: conductor e duas partes.', {actual: midi.tracks.length});
  const actual = [];
  const programs = [];
  const trackNames = [];
  const conductorTempos = [];
  const conductorMeters = [];
  let checkedNoteOns = 0;
  let checkedNoteOffs = 0;

  for (const [trackIndex, track] of midi.tracks.entries()) {
    let tick = 0;
    const open = new Map();
    let trackName;
    for (const event of track) {
      tick += event.deltaTime;
      if (event.type === 'trackName') trackName = event.text;
      if (trackIndex === 0 && event.type === 'setTempo') conductorTempos.push({tick, microsecondsPerBeat: event.microsecondsPerBeat});
      if (trackIndex === 0 && event.type === 'timeSignature') conductorMeters.push({tick, numerator: event.numerator, denominator: event.denominator});
      if (trackIndex === 0 && (event.type === 'noteOn' || event.type === 'noteOff')) {
        addIssue(issues, 'MIDI_CONDUCTOR_HAS_NOTES', 'A pista conductor não pode conter notas.', {trackIndex, tick});
      }
      if (trackIndex > 0 && event.type === 'programChange') programs.push({trackIndex, channel: event.channel, programNumber: event.programNumber});
      if (trackIndex > 0 && event.channel !== undefined && event.channel !== trackIndex - 1) {
        addIssue(issues, 'MIDI_CHANNEL_TRACK_MISMATCH', 'Mensagem MIDI usa canal diferente da parte independente.',
          {trackIndex, expectedChannel: trackIndex - 1, actualChannel: event.channel, tick, eventType: event.type});
      }
      if (trackIndex === 0 || !['noteOn', 'noteOff'].includes(event.type)) continue;
      const expectedPartIndex = trackIndex - 1;
      const expectedChannel = expectedPartIndex;
      if (event.channel !== expectedChannel) {
        addIssue(issues, 'MIDI_CHANNEL_TRACK_MISMATCH', 'Canal MIDI não corresponde à pista independente da parte.',
          {trackIndex, expectedChannel, actualChannel: event.channel, tick});
        continue;
      }
      const key = `${event.channel}:${event.noteNumber}`;
      if (event.type === 'noteOn' && event.velocity > 0) {
        checkedNoteOns++;
        const queue = open.get(key) ?? [];
        queue.push({partIndex: expectedPartIndex, pitch: event.noteNumber, start: tick, trackIndex});
        open.set(key, queue);
      } else {
        checkedNoteOffs++;
        const queue = open.get(key);
        if (!queue?.length) {
          addIssue(issues, 'MIDI_ORPHAN_NOTE_OFF', 'Note-off MIDI sem note-on correspondente.', {trackIndex, channel: event.channel, pitch: event.noteNumber, tick});
          continue;
        }
        const started = queue.shift();
        if (!queue.length) open.delete(key);
        actual.push({...started, end: tick});
      }
    }
    trackNames.push(trackName ?? null);
    for (const [key, queue] of open) {
      for (const note of queue) addIssue(issues, 'MIDI_UNCLOSED_NOTE', 'Note-on MIDI sem note-off correspondente.', {trackIndex, key, start: note.start});
    }
  }

  for (const partIndex of [0, 1]) {
    const entry = programs.find(program => program.trackIndex === partIndex + 1);
    const count = programs.filter(program => program.trackIndex === partIndex + 1).length;
    if (!entry || count !== 1 || entry.channel !== partIndex || entry.programNumber !== 71) {
      addIssue(issues, 'MIDI_INSTRUMENT_PROGRAM', 'Cada pista instrumental deve usar GM Clarinet program 71 e o canal 0/1 correspondente.',
        {partIndex, expectedChannel: partIndex, expectedProgram: 71, actualPrograms: programs.filter(program => program.trackIndex === partIndex + 1)});
    }
  }
  const expectedTempos = performance.tempos.map(tempo => ({tick: Math.round(tempo.q * PPQ), microsecondsPerBeat: Math.round(60_000_000 / tempo.bpm)}))
    .map(event => `${event.tick}:${event.microsecondsPerBeat}`).sort();
  const actualTempoSignatures = conductorTempos.map(event => `${event.tick}:${event.microsecondsPerBeat}`).sort();
  if (JSON.stringify(actualTempoSignatures) !== JSON.stringify(expectedTempos)) {
    addIssue(issues, 'MIDI_TEMPO_EVENTS', 'Eventos de tempo da pista conductor não correspondem à política de tempo.',
      {expected: expectedTempos, actual: actualTempoSignatures});
  }
  let priorMeter = '';
  const expectedMeters = [];
  for (const meter of performance.meters) {
    const signature = `${meter.numerator}/${meter.denominator}`;
    if (signature === priorMeter) continue;
    priorMeter = signature;
    expectedMeters.push(`${Math.round(meter.q * PPQ)}:${signature}`);
  }
  const actualMeterSignatures = conductorMeters.map(event => `${event.tick}:${event.numerator}/${event.denominator}`);
  if (JSON.stringify(actualMeterSignatures) !== JSON.stringify(expectedMeters)) {
    addIssue(issues, 'MIDI_METER_EVENTS', 'Métricas da pista conductor não correspondem aos compassos MusicXML.',
      {expected: expectedMeters, actual: actualMeterSignatures});
  }
  const expected = performance.notes.map(note => ({partIndex: note.partIndex, pitch: note.pitch,
    start: Math.round(note.start * PPQ), end: Math.max(Math.round(note.start * PPQ) + 1, Math.round(note.end * PPQ))}));
  const signature = note => `${note.partIndex}:${note.pitch}:${note.start}:${note.end}`;
  const actualSignatures = actual.map(signature).sort();
  const expectedSignatures = expected.map(signature).sort();
  if (JSON.stringify(actualSignatures) !== JSON.stringify(expectedSignatures)) {
    addIssue(issues, 'MIDI_EVENT_MISMATCH', 'MIDI diverge das notas esperadas em parte/pista, altura, início ou duração.',
      {expectedCount: expected.length, actualCount: actual.length,
        missing: expectedSignatures.filter(item => !actualSignatures.includes(item)).slice(0, 20),
        unexpected: actualSignatures.filter(item => !expectedSignatures.includes(item)).slice(0, 20)});
  }
  for (const [partIndex, expectedName] of partNames.entries()) {
    const actualName = trackNames[partIndex + 1];
    if (expectedName && actualName !== ascii(expectedName)) addIssue(issues, 'MIDI_TRACK_NAME', 'Nome da pista instrumental inesperado.', {partIndex, expected: ascii(expectedName), actual: actualName});
  }
  if (trackNames[0] !== 'Mozart - Clarinetes I e II') addIssue(issues, 'MIDI_CONDUCTOR_NAME', 'Nome da pista conductor inesperado.', {actual: trackNames[0]});
  return {status: issues.length ? 'failed' : 'passed', ppq: midi.header.ticksPerBeat, format: midi.header.format,
    tracks: midi.tracks.length, conductorTrack: 0, instrumentalTracks: [1, 2], channels: [0, 1],
    gmProgram: 71, checkedNoteOns, checkedNoteOffs, checkedPitches: actual.length, checkedDurations: actual.length,
    checkedTempoEvents: conductorTempos.length, checkedMeterChanges: conductorMeters.length,
    errors: issues, gracePolicy: performance.gracePolicy, articulationPolicy: performance.articulationPolicy};
}

function reportCounts(parsed, performance) {
  return {
    parts: parsed.parts.length,
    measuresPerPart: parsed.parts.map(part => part.measures.length),
    durationQuartersPerPart: parsed.parts.map(part => part.measures.reduce((sum, measure) => sum + measure.duration, 0)),
    writtenPitchedEventsPerPart: parsed.parts.map(part => part.pitchedEvents),
    cueEventsPerPart: parsed.parts.map(part => part.cueEvents),
    cuePitchedNotesPerPart: parsed.parts.map(part => part.cuePitchedNotes),
    actualGraceNotesPerPart: parsed.parts.map(part => part.graceNotes),
    typeDurationChecksPerPart: parsed.parts.map(part => part.typeDurationChecks),
    nonCueMidiNotesPerPart: parsed.parts.map(part => performance.notes.filter(note => note.partIndex === part.partIndex && !note.grace).length),
    graceMidiNotesPerPart: parsed.parts.map(part => performance.notes.filter(note => note.partIndex === part.partIndex && note.grace).length),
    tiesPerPart: parsed.parts.map(part => {
      const events = part.measures.flatMap(measure => measure.events);
      return {starts: events.filter(event => event.tieStart).length, stops: events.filter(event => event.tieStop).length,
        mergedConnections: performance.notes.filter(note => note.partIndex === part.partIndex && note.ids.length > 1).length};
    }),
    slursPerPart: parsed.parts.map(part => {
      const slurs = part.measures.flatMap(measure => measure.events.flatMap(event => event.slurs));
      return {starts: slurs.filter(slur => slur.type === 'start').length, stops: slurs.filter(slur => slur.type === 'stop').length};
    }),
    coverageChecksPerPart: parsed.parts.map(part => part.measures.reduce((sum, measure) =>
      sum + new Set(measure.events.filter(event => !event.cue && !event.grace && !event.chord).map(event => event.voice)).size, 0)),
    performedMeasures: performance.order.length,
    performedDurationQuarters: performance.duration,
  };
}

async function writeJson(reportPath, report) {
  if (!reportPath) return;
  await fs.mkdir(path.dirname(path.resolve(reportPath)), {recursive: true});
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

export async function exportAndValidate({xmlPath, midiPath, reportPath}) {
  if (!xmlPath || !midiPath) throw new Error('Uso da API: exportAndValidate({xmlPath, midiPath, reportPath}).');
  const report = {status: 'failed', xmlPath: path.resolve(xmlPath), midiPath: path.resolve(midiPath), errors: [], counts: null};
  try {
    const xml = await fs.readFile(xmlPath, 'utf8');
    const parsed = parseScore(xml);
    report.counts = {parts: parsed.counts.parts, measuresPerPart: parsed.counts.measuresPerPart,
      writtenPitchedEventsPerPart: parsed.counts.writtenPitchedEventsPerPart,
      cueEventsPerPart: parsed.counts.cueEventsPerPart, cuePitchedNotesPerPart: parsed.counts.cuePitchedNotesPerPart,
      actualGraceNotesPerPart: parsed.counts.actualGraceNotesPerPart, typeDurationChecksPerPart: parsed.counts.typeDurationChecksPerPart};
    report.errors = parsed.issues;
    if (parsed.issues.length) throw new Error(`MusicXML validation failed (${parsed.issues.length} issues).`);

    const partNames = parsed.parts.map(part => part.name);
    const performance = buildPerformance(parsed);
    if (performance.issues.length) {
      report.errors = performance.issues;
      throw new Error(`Performance validation failed (${performance.issues.length} issues).`);
    }
    const midi = makeMidi(performance, partNames);
    const midiValidation = verifyMidi(midi, performance, partNames);
    if (midiValidation.status !== 'passed') {
      report.errors = midiValidation.errors;
      throw new Error(`MIDI round-trip validation failed (${midiValidation.errors.length} issues).`);
    }
    await fs.mkdir(path.dirname(path.resolve(midiPath)), {recursive: true});
    await fs.writeFile(midiPath, midi);
    report.status = 'passed';
    report.errors = [];
    report.counts = reportCounts(parsed, performance);
    report.editorialMetronome = performance.editorialMetronome;
    report.tempoPolicy = performance.editorialTempoNotes;
    report.tempoPolicyContext = parsed.tempoPolicyContext || null;
    report.sourceNumericTempoAbsentFromPdf = parsed.sourceNumericTempoAbsentFromPdf;
    report.numericTempoEvents = performance.tempos.filter(tempo => tempo.source !== 'editorial-default').length;
    report.sourceTempoWords = parsed.tempoWords;
    report.cuePolicy = 'Todos os eventos cue, inclusive grace cue, são omitidos do MIDI e da cobertura rítmica.';
    report.midiValidation = midiValidation;
    report.gracePolicy = performance.gracePolicy;
    report.articulationPolicy = performance.articulationPolicy;
    report.musicalFidelity = 'Valida a coerência estrutural e os eventos exportados; não compara as notas com o PDF nem certifica fidelidade musical.';
    await writeJson(reportPath, report);
    return report;
  } catch (error) {
    if (!report.errors.length) report.errors = [{code: 'EXPORT_FAILED', message: error.message}];
    report.status = 'failed';
    try { await writeJson(reportPath, report); } catch (reportError) {
      error.message += ` Relatório também não pôde ser gravado: ${reportError.message}`;
    }
    error.report = report;
    throw error;
  }
}

function readFlags(args) {
  const flags = {};
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (!['--xml', '--midi', '--report'].includes(arg)) throw new Error(`Argumento desconhecido: ${arg}`);
    const value = args[++index];
    if (!value || value.startsWith('--')) throw new Error(`Valor ausente após ${arg}.`);
    flags[arg.slice(2)] = value;
  }
  if (!flags.xml || !flags.midi) throw new Error('Uso: node export-midi.mjs --xml arquivo.musicxml --midi arquivo.mid [--report arquivo.json]');
  return flags;
}

async function main() {
  try {
    const flags = readFlags(process.argv.slice(2));
    const report = await exportAndValidate({xmlPath: flags.xml, midiPath: flags.midi, reportPath: flags.report});
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } catch (error) {
    const report = error.report;
    process.stderr.write(`${JSON.stringify(report ?? {status: 'failed', errors: [{message: error.message}]}, null, 2)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) await main();


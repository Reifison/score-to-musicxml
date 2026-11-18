import { DOMParser } from '@xmldom/xmldom';

const MAX_XML_BYTES = 32 * 1024 * 1024;
const ELEMENT_NODE = 1;

const DURATIONS = new Map([
  ['maxima', 32], ['long', 16], ['longa', 16], ['breve', 8], ['whole', 4],
  ['half', 2], ['quarter', 1], ['eighth', 0.5], ['16th', 0.25], ['32nd', 0.125],
  ['64th', 0.0625], ['128th', 0.03125], ['256th', 0.015625], ['512th', 0.0078125],
  ['1024th', 0.00390625],
]);

const SOURCE_MEASURE_SAFE = new Set([
  'voice', 'eid', 'LayoutBreak', 'startRepeat', 'endRepeat', 'Marker', 'Jump',
  'vspacerFixed', 'irregular', 'stretch', 'Number', 'SystemLock', 'Break',
]);
const SOURCE_VOICE_SAFE = new Set([
  'Chord', 'Rest', 'Tuplet', 'endTuplet', 'eid', 'Clef', 'KeySig', 'TimeSig',
  'Tempo', 'Dynamic', 'HairPin', 'StaffText', 'SystemText', 'Text', 'Harmony',
  'Marker', 'Jump', 'BarLine', 'startRepeat', 'endRepeat', 'Beam', 'Slur',
  'Glissando', 'Ottava', 'Volta', 'Pedal', 'Fermata', 'RehearsalMark',
  'LayoutBreak', 'SystemLock', 'InstrumentChange', 'Symbol', 'Bracket', 'Spanner',
  'Breath', 'PlayTechAnnotation', 'Segment', 'location', 'Location',
]);
const SOURCE_CHORD_SAFE = new Set([
  'eid', 'linkedMain', 'durationType', 'dots', 'Note', 'BeamMode', 'StemDirection',
  'Articulation', 'Spanner', 'Tremolo', 'Hook', 'Fingering', 'Lyrics', 'Tuplet',
  'playEventType', 'playEvent', 'veloType', 'velocity', 'offset', 'acciaccatura',
  'appoggiatura', 'TremoloSingleChord', 'Arpeggio', 'Ornament', 'Stem', 'Beam',
  'staffMove', 'grace', 'noStem', 'NoteType', 'small', 'staffMove',
]);
const SOURCE_NOTE_SAFE = new Set([
  'eid', 'linkedMain', 'pitch', 'tpc', 'tpc2', 'Fingering', 'Spanner', 'Tie',
  'Accidental', 'head', 'velocity', 'play', 'onTimeType', 'offTimeType', 'staffMove',
  'fixed', 'mirror', 'line', 'ghost', 'visible', 'color', 'offset', 'NoteType',
  'Instrument', 'Articulation', 'symbol', 'userDotPosition', 'dotPosition', 'dot',
  'NoteDot', 'dead', 'tie', 'concertPitch',
]);
const SOURCE_REST_SAFE = new Set([
  'eid', 'linkedMain', 'durationType', 'dots', 'Articulation', 'Spanner', 'offset',
  'Tuplet', 'small', 'visible', 'duration', 'NoteDot', 'BeamMode',
]);
const SOURCE_SPANNER_TYPES = new Set(['Slur', 'Tie', 'Volta', 'Glissando', 'HairPin', 'GradualTempoChange', 'TextLine', 'Ottava']);
const MUSICXML_MEASURE_SAFE = new Set([
  'attributes', 'note', 'backup', 'forward', 'direction', 'direction-type', 'barline',
  'print', 'sound', 'harmony', 'figured-bass', 'listening', 'grouping', 'bookmark',
  'link', 'extension',
]);
const MUSICXML_NOTE_SAFE = new Set([
  'chord', 'grace', 'cue', 'pitch', 'unpitched', 'rest', 'duration', 'tie',
  'instrument', 'footnote', 'level', 'voice', 'type', 'dot', 'accidental',
  'time-modification', 'stem', 'notehead', 'staff', 'beam', 'notations', 'lyric',
  'play', 'listen', 'listen', 'arpeggiate', 'non-arpeggiate', 'fermata',
]);

const elements = node => Array.from(node?.childNodes ?? []).filter(child => child.nodeType === ELEMENT_NODE);
const named = (node, name) => elements(node).filter(child => child.nodeName === name);
const first = (node, name) => named(node, name)[0] ?? null;
const value = node => node?.textContent?.trim() ?? '';
const childText = (node, name) => value(first(node, name));
const attr = (node, name) => {
  const raw = node?.getAttribute?.(name) ?? null;
  return raw === '' ? null : raw;
};
const numeric = raw => raw === '' || raw === null || raw === undefined ? null : Number.isFinite(Number(raw)) ? Number(raw) : null;
const boolAttribute = (node, name, yes = 'yes') => attr(node, name) === yes;
const elementNames = node => elements(node).map(child => child.nodeName);

function parseXml(xml, label) {
  if (typeof xml !== 'string') throw new TypeError(`${label} precisa ser texto XML`);
  if (Buffer.byteLength(xml, 'utf8') > MAX_XML_BYTES) throw new Error(`${label} excede 32 MiB`);
  const errors = [];
  const document = new DOMParser({ errorHandler: {
    warning: message => errors.push(String(message)),
    error: message => errors.push(String(message)),
    fatalError: message => errors.push(String(message)),
  } }).parseFromString(xml, 'application/xml');
  if (errors.length || !document.documentElement) throw new Error(`${label} XML inválido: ${errors.slice(0, 2).join('; ')}`);
  return document;
}

function rawNode(node, depth = 0) {
  if (!node || depth > 8) return null;
  return {
    tag: node.nodeName,
    attributes: Array.from(node.attributes ?? []).reduce((out, item) => ({ ...out, [item.name]: item.value }), {}),
    text: elements(node).length ? undefined : value(node).slice(0, 300),
    children: elements(node).map(child => rawNode(child, depth + 1)),
  };
}

function addUnsupported(list, code, details = {}) {
  const key = JSON.stringify([code, details]);
  if (!list.some(item => item._key === key)) list.push({ code, ...details, _key: key });
}

function publicUnsupported(list) {
  return list.map(({ _key, ...item }) => item);
}

function rational(numerator, denominator = 1) {
  let n = BigInt(numerator);
  let d = BigInt(denominator);
  if (d === 0n) throw new Error('denominador racional zero');
  if (d < 0n) { n = -n; d = -d; }
  const gcd = (a, b) => b === 0n ? (a < 0n ? -a : a) : gcd(b, a % b);
  const divisor = gcd(n, d) || 1n;
  return { n: n / divisor, d: d / divisor };
}

function addRational(a, b) {
  if (a === null || b === null) return null;
  return rational(a.n * b.d + b.n * a.d, a.d * b.d);
}

function multiplyRational(a, b) {
  if (a === null || b === null) return null;
  return rational(a.n * b.n, a.d * b.d);
}

function rationalString(value) {
  return value === null ? null : value.d === 1n ? String(value.n) : `${value.n}/${value.d}`;
}

function rationalNumber(value) {
  return value === null ? null : Number(value.n) / Number(value.d);
}

function numericRational(value) {
  if (!Number.isFinite(value)) return null;
  const precision = 1000000;
  return rational(Math.round(value * precision), precision);
}

function durationFactor(dots) {
  const count = Math.max(0, Math.trunc(dots ?? 0));
  return rational((2 ** (count + 1)) - 1, 2 ** count);
}

function dotsValue(node, tag = 'dots') {
  const raw = childText(node, tag);
  if (raw === '') return 0;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 4 ? parsed : null;
}

function durationBase(durationType) {
  const value = DURATIONS.get(durationType);
  return value === undefined ? null : numericRational(value);
}

function durationWithNotation(durationType, dots, tupletScale = rational(1, 1)) {
  const base = durationBase(durationType);
  if (base === null || dots === null) return null;
  return multiplyRational(multiplyRational(base, durationFactor(dots)), tupletScale);
}

function pitchSpellingFromTpc(rawTpc) {
  const tpc = numeric(rawTpc);
  if (!Number.isInteger(tpc)) return null;
  const q = tpc - 14;
  const letters = ['C', 'G', 'D', 'A', 'E', 'B', 'F'];
  const residue = ((q % 7) + 7) % 7;
  const step = letters[residue];
  const baseQ = step === 'F' ? -1 : residue;
  const alter = (q - baseQ) / 7;
  if (!Number.isInteger(alter) || Math.abs(alter) > 4) return null;
  return { step, alter };
}

function midiPitch({ step, alter, octave }) {
  const natural = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[step];
  if (natural === undefined || !Number.isInteger(octave) || !Number.isFinite(alter)) return null;
  return (octave + 1) * 12 + natural + alter;
}

function writtenOctaveFromPitchAndSpelling(pitch, spelling) {
  const naturalPitchClass = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[spelling?.step];
  if (!Number.isInteger(pitch) || naturalPitchClass === undefined || !Number.isInteger(spelling.alter)) return null;
  const octaveNumerator = pitch - naturalPitchClass - spelling.alter;
  if (octaveNumerator % 12 !== 0) return null;
  return octaveNumerator / 12 - 1;
}

function collectSourceTranspositions(score, unsupported) {
  const transpositions = [];
  const scoreConcertPitch = childText(score, 'concertPitch');
  if (scoreConcertPitch !== '') addUnsupported(unsupported, 'concert-pitch-semantics-unverified', { value: scoreConcertPitch });
  for (const [partIndex, part] of named(score, 'Part').entries()) {
    for (const instrument of named(part, 'Instrument')) {
      const raw = {
        diatonic: numeric(childText(instrument, 'transposeDiatonic')),
        chromatic: numeric(childText(instrument, 'transposeChromatic')),
        octave: numeric(childText(instrument, 'transposeOctave')),
      };
      if (Object.values(raw).some(value => value !== null)) {
        transpositions.push({ partIndex: partIndex + 1, ...raw });
        if (Object.values(raw).some(value => value !== null && value !== 0)) {
          addUnsupported(unsupported, 'source-instrument-transposition-semantics-unverified', { partIndex: partIndex + 1, transposition: raw });
        }
      }
    }
  }
  return { transpositions, scoreConcertPitch: scoreConcertPitch || null };
}

function scanSourceLocations(score, unsupported) {
  const relationshipLinks = [];
  const spannerTypes = {};
  const visit = node => {
    for (const child of elements(node)) {
      if (child.nodeName === 'Spanner') {
        const type = attr(child, 'type');
        const key = type ?? '(missing)';
        spannerTypes[key] = (spannerTypes[key] ?? 0) + 1;
        if (!type || !SOURCE_SPANNER_TYPES.has(type)) {
          addUnsupported(unsupported, 'source-spanner-type-unrecognized', { type, raw: rawNode(child) });
        }
        if (type === 'Ottava') {
          addUnsupported(unsupported, 'source-ottava-written-pitch-semantics-unverified', { type, raw: rawNode(child) });
        }
      }
      if (['Location', 'location', 'tick', 'ticks'].includes(child.nodeName)) {
        const parentName = child.parentNode?.nodeName ?? null;
        const grandparentName = child.parentNode?.parentNode?.nodeName ?? null;
        const inSpannerLink = parentName === 'next' || parentName === 'prev'
          ? grandparentName === 'Spanner'
          : false;
        const directVoiceLocation = child.nodeName.toLowerCase() === 'location' && parentName === 'voice';
        if (child.nodeName.toLowerCase() === 'location' && inSpannerLink) {
          relationshipLinks.push({ direction: parentName, raw: rawNode(child), context: 'Spanner endpoint relationship; excluded from note onset/duration' });
        } else if (!directVoiceLocation) {
          addUnsupported(unsupported, 'source-location-timing-semantics-unverified', { tag: child.nodeName, context: parentName, raw: rawNode(child) });
        }
      }
      visit(child);
    }
  };
  visit(score);
  return { relationshipLinks, spannerTypes };
}

function sourceMeasureRestDuration(raw) {
  const match = String(raw ?? '').trim().match(/^(-?\d+)\s*\/\s*(\d+)$/);
  if (!match) return null;
  const numerator = Number(match[1]);
  const denominator = Number(match[2]);
  if (numerator < 0 || denominator <= 0) return null;
  return rational(numerator * 4, denominator);
}

function sourceVoiceLocationOffset(node) {
  const childNodes = elements(node);
  const fractionNodes = childNodes.filter(child => child.nodeName === 'fractions');
  const measureNodes = childNodes.filter(child => child.nodeName === 'measures');
  if (fractionNodes.length !== 1 || childNodes.some(child => !['fractions', 'measures'].includes(child.nodeName))) return null;
  if (measureNodes.length > 1 || (measureNodes.length === 1 && numeric(value(measureNodes[0])) !== 0)) return null;
  const fraction = value(fractionNodes[0]).match(/^(-?\d+)\s*\/\s*(\d+)$/);
  if (!fraction || Number(fraction[2]) <= 0) return null;
  // MSCX fractions are whole-note fractions; normalize to the parser's quarter-length unit.
  return rational(BigInt(fraction[1]) * 4n, BigInt(fraction[2]));
}

function sourcePartStaffMap(score, staffNodes, unsupported) {
  const parts = named(score, 'Part');
  const idToIndex = new Map(staffNodes.map((staff, index) => [attr(staff, 'id') ?? String(index + 1), index]));
  const staffMap = new Map();
  let nextStaffIndex = 0;
  const partRows = parts.map((part, partIndex) => {
    const staffNodesForPart = named(part, 'Staff');
    const staffRefs = staffNodesForPart.map((staff, localIndex) => attr(staff, 'id') ?? attr(staff, 'eid') ?? String(nextStaffIndex + localIndex + 1));
    const staffIndexes = [];
    staffNodesForPart.forEach((staff, localIndex) => {
      const id = attr(staff, 'id') ?? attr(staff, 'eid') ?? null;
      const globalIndex = id === null ? nextStaffIndex : idToIndex.get(id);
      if (globalIndex === undefined) {
        addUnsupported(unsupported, 'source-part-staff-reference-unresolved', { partIndex: partIndex + 1, staffId: id ?? staffRefs[localIndex] });
        nextStaffIndex++;
        return;
      }
      staffIndexes.push(globalIndex);
      staffMap.set(globalIndex, { partIndex: partIndex + 1, localStaff: localIndex + 1, staffId: attr(staffNodes[globalIndex], 'id') ?? staffRefs[localIndex] });
      nextStaffIndex++;
    });
    return { partIndex: partIndex + 1, staffIds: staffRefs, staffCount: staffRefs.length, measureCount: null };
  });
  if (!parts.length) {
    staffNodes.forEach((staff, index) => {
      staffMap.set(index, { partIndex: index + 1, localStaff: 1, staffId: attr(staff, 'id') ?? String(index + 1) });
      partRows.push({ partIndex: index + 1, staffIds: [attr(staff, 'id') ?? String(index + 1)], staffCount: 1, measureCount: null });
    });
    addUnsupported(unsupported, 'source-part-structure-missing');
  }
  for (let index = 0; index < staffNodes.length; index++) {
    if (!staffMap.has(index)) {
      addUnsupported(unsupported, 'source-staff-not-associated-with-part', { staffIndex: index + 1, staffId: attr(staffNodes[index], 'id') ?? null });
    }
  }
  return { parts: partRows, staffMap };
}

function parseTupletDefinition(node) {
  const actual = numeric(childText(node, 'actualNotes'));
  const normal = numeric(childText(node, 'normalNotes'));
  const id = childText(node, 'eid') || attr(node, 'id') || null;
  if (!(actual > 0) || !(normal > 0) || !id) return null;
  return { id, actualNotes: actual, normalNotes: normal, scale: rational(normal, actual) };
}

function unsupportedUnknownChildren(parent, allowed, unsupported, scope, context = {}) {
  for (const child of elements(parent)) {
    if (!allowed.has(child.nodeName)) {
      addUnsupported(unsupported, 'unknown-event-related-source-element', {
        scope, tag: child.nodeName, ...context, raw: rawNode(child),
      });
    }
  }
}

/**
 * Extracts the native MuseScore event stream without using instrument names or clefs to infer pitch.
 * Ambiguous features stay in `unsupported` and are never promoted into a score.
 */
export function parseMuseScoreNativeEvents(xml) {
  const document = parseXml(xml, 'MSCX');
  const museScore = document.documentElement.nodeName === 'museScore' ? document.documentElement : first(document, 'museScore');
  const score = first(museScore, 'Score');
  if (!score) throw new Error('MSCX não contém museScore/Score');

  const unsupported = [];
  const staffNodes = named(score, 'Staff');
  const { parts, staffMap } = sourcePartStaffMap(score, staffNodes, unsupported);
  const transpositionInfo = collectSourceTranspositions(score, unsupported);
  const sourceMarkup = scanSourceLocations(score, unsupported);
  const sourceEvents = [];
  const sourceMeasures = [];
  const sourceVoiceTopology = [];
  const sourceMeasureCounts = [];
  const sourceVoiceLocationOffsets = [];
  const sourceOutOfScopeModifiers = [];
  let noteCount = 0;
  let restCount = 0;

  for (const [staffIndex, staff] of staffNodes.entries()) {
    const staffLocation = staffMap.get(staffIndex) ?? { partIndex: null, localStaff: null, staffId: attr(staff, 'id') ?? null };
    const measures = named(staff, 'Measure');
    sourceMeasureCounts.push({ staffIndex: staffIndex + 1, staffId: staffLocation.staffId, partIndex: staffLocation.partIndex, localStaff: staffLocation.localStaff, count: measures.length });
    for (const [measureIndex, measure] of measures.entries()) {
      const sourceMeasureNumber = attr(measure, 'number') ?? attr(measure, 'no') ?? null;
      const irregular = named(measure, 'irregular').length > 0;
      const stretchRaw = childText(measure, 'stretch');
      const stretch = numeric(stretchRaw);
      unsupportedUnknownChildren(measure, SOURCE_MEASURE_SAFE, unsupported, 'measure', { staffIndex: staffIndex + 1, measureIndex: measureIndex + 1 });
      const voices = named(measure, 'voice');
      sourceVoiceTopology.push({
        staffIndex: staffIndex + 1,
        staffId: staffLocation.staffId,
        partIndex: staffLocation.partIndex,
        localStaff: staffLocation.localStaff,
        measureIndex: measureIndex + 1,
        sourceMeasureNumber,
        voiceNodeCount: voices.length,
        voiceSlots: voices.map((voice, voiceIndex) => ({ voiceOrdinal: voiceIndex + 1, eventCount: named(voice, 'Chord').length + named(voice, 'Rest').length })),
      });
      sourceMeasures.push({
        staffIndex: staffIndex + 1,
        staffId: staffLocation.staffId,
        partIndex: staffLocation.partIndex,
        localStaff: staffLocation.localStaff,
        measureIndex: measureIndex + 1,
        sourceMeasureNumber,
        irregular,
        stretch,
        voiceNodeCount: voices.length,
      });

      for (const [voiceIndex, voice] of voices.entries()) {
        const voiceOrdinal = voiceIndex + 1;
        unsupportedUnknownChildren(voice, SOURCE_VOICE_SAFE, unsupported, 'voice', {
          staffIndex: staffIndex + 1, measureIndex: measureIndex + 1, voiceOrdinal,
        });
        let cursor = rational(0, 1);
        let cursorKnown = true;
        const tupletStack = [];
        let measureRestSeen = false;
        for (const item of elements(voice)) {
          if (item.nodeName.toLowerCase() === 'location') {
            const context = { staffIndex: staffIndex + 1, measureIndex: measureIndex + 1, voiceOrdinal };
            const offset = sourceVoiceLocationOffset(item);
            if (offset === null) {
              addUnsupported(unsupported, 'source-location-timing-semantics-unverified', { ...context, raw: rawNode(item) });
              cursorKnown = false;
            } else if (cursorKnown) {
              cursor = addRational(cursor, offset);
            }
            sourceVoiceLocationOffsets.push({
              partIndex: staffLocation.partIndex,
              localStaff: staffLocation.localStaff,
              staffIndex: staffIndex + 1,
              measureIndex: measureIndex + 1,
              sourceMeasureNumber,
              voiceOrdinal,
              offsetQ: offset === null ? null : rationalString(offset),
              raw: rawNode(item),
            });
            continue;
          }
          if (item.nodeName === 'Tuplet') {
            addUnsupported(unsupported, 'tuplet-semantics-unverified', {
              staffIndex: staffIndex + 1, measureIndex: measureIndex + 1, voiceOrdinal, raw: rawNode(item),
            });
            const definition = parseTupletDefinition(item);
            if (definition) tupletStack.push(definition);
            else cursorKnown = false;
            // The ratio is preserved as raw evidence, but we do not apply MuseScore's
            // tuplet linkage rules until those semantics are checked against official code.
            cursorKnown = false;
            continue;
          }
          if (item.nodeName === 'endTuplet') {
            const endId = childText(item, 'eid') || null;
            if (!tupletStack.length || (endId && tupletStack.at(-1).id !== endId)) {
              addUnsupported(unsupported, 'tuplet-boundary-unresolved', {
                staffIndex: staffIndex + 1, measureIndex: measureIndex + 1, voiceOrdinal, endId,
              });
              cursorKnown = false;
            } else tupletStack.pop();
            continue;
          }
          if (item.nodeName === 'Chord') {
            const context = { staffIndex: staffIndex + 1, measureIndex: measureIndex + 1, voiceOrdinal };
            unsupportedUnknownChildren(item, SOURCE_CHORD_SAFE, unsupported, 'chord', context);
            const durationType = childText(item, 'durationType') || null;
            const dots = dotsValue(item);
            const isGrace = named(item, 'acciaccatura').length > 0 || named(item, 'appoggiatura').length > 0 || named(item, 'grace').length > 0;
            const graceType = named(item, 'acciaccatura').length ? 'acciaccatura' : named(item, 'appoggiatura').length ? 'appoggiatura' : isGrace ? 'grace' : null;
            const pitches = [];
            for (const note of named(item, 'Note')) {
              unsupportedUnknownChildren(note, SOURCE_NOTE_SAFE, unsupported, 'note', context);
              const pitch = numeric(childText(note, 'pitch'));
              const tpc = numeric(childText(note, 'tpc'));
              const tpc2Raw = childText(note, 'tpc2');
              const tpc2 = numeric(tpc2Raw);
              const spellingFromTpc = pitchSpellingFromTpc(tpc);
              const spellingFromTpc2 = tpc2Raw === '' ? null : pitchSpellingFromTpc(tpc2);
              const spelling = tpc2Raw === '' ? spellingFromTpc : null;
              const octave = spellingFromTpc ? writtenOctaveFromPitchAndSpelling(pitch, spellingFromTpc) : null;
              const expectedMidi = spellingFromTpc && octave !== null ? midiPitch({ ...spellingFromTpc, octave }) : null;
              if (!Number.isInteger(pitch) || !Number.isInteger(tpc) || !spellingFromTpc) {
                addUnsupported(unsupported, 'source-note-pitch-fields-incomplete', { ...context, pitch, tpc, tpc2 });
              } else if (tpc2Raw === '' && (octave === null || expectedMidi !== pitch)) {
                addUnsupported(unsupported, 'source-pitch-tpc-inconsistent', { ...context, pitch, tpc, derivedOctave: octave, expectedMidi, spelling });
              }
              if (tpc2Raw !== '') addUnsupported(unsupported, 'tpc2-semantics-unverified', { ...context, tpc, tpc2 });
              pitches.push({ pitch, tpc, tpc2: tpc2Raw === '' ? null : tpc2, spelling, spellingFromTpc, spellingFromTpc2, octave });
              noteCount++;
            }
            if (!pitches.length) addUnsupported(unsupported, 'source-chord-without-notes', context);
            const duration = isGrace ? rational(0, 1) : tupletStack.length ? null : durationWithNotation(durationType, dots);
            if (!isGrace && duration === null) {
              if (!tupletStack.length) addUnsupported(unsupported, 'source-duration-unrecognized', { ...context, durationType, dots });
              cursorKnown = false;
            }
            for (const modifier of ['Arpeggio', 'Ornament', 'Tremolo', 'TremoloSingleChord']) {
              for (const element of named(item, modifier)) sourceOutOfScopeModifiers.push({
                ...context, tag: modifier, raw: rawNode(element), scope: 'performance-or-ornamentation-excluded-from-written-event-encoding',
              });
            }
            const onset = cursorKnown ? cursor : null;
            sourceEvents.push({
              partIndex: staffLocation.partIndex,
              localStaff: staffLocation.localStaff,
              staffIndex: staffIndex + 1,
              staffId: staffLocation.staffId,
              measureIndex: measureIndex + 1,
              sourceMeasureNumber,
              voiceOrdinal,
              kind: 'note',
              onsetQ: rationalString(onset),
              durationQ: rationalString(duration),
              onset: rationalNumber(onset),
              duration: rationalNumber(duration),
              durationType,
              dots,
              tupletRatio: tupletStack.length ? tupletStack.map(item => ({ id: item.id, actualNotes: item.actualNotes, normalNotes: item.normalNotes })) : null,
              grace: isGrace,
              graceType,
              measureRest: false,
              pitches: pitches.sort((a, b) => `${a.spelling?.step}:${a.spelling?.alter}:${a.octave}:${a.pitch}`.localeCompare(`${b.spelling?.step}:${b.spelling?.alter}:${b.octave}:${b.pitch}`)),
              rawEventId: childText(item, 'eid') || null,
            });
            if (cursorKnown && !isGrace) cursor = addRational(cursor, duration);
            continue;
          }
          if (item.nodeName === 'Rest') {
            const context = { staffIndex: staffIndex + 1, measureIndex: measureIndex + 1, voiceOrdinal };
            unsupportedUnknownChildren(item, SOURCE_REST_SAFE, unsupported, 'rest', context);
            const durationType = childText(item, 'durationType') || null;
            const dots = dotsValue(item);
            const measureRest = durationType === 'measure' || boolAttribute(item, 'measure');
            const rawMeasureDuration = childText(item, 'duration');
            const duration = measureRest
              ? tupletStack.length ? null : sourceMeasureRestDuration(rawMeasureDuration)
              : tupletStack.length ? null : durationWithNotation(durationType, dots);
            if (duration === null && (measureRest || !tupletStack.length)) {
              if (measureRest) addUnsupported(unsupported, 'source-measure-rest-duration-unavailable', { ...context, durationType, rawDuration: rawMeasureDuration || null });
              else addUnsupported(unsupported, 'source-rest-duration-unrecognized', { ...context, durationType, dots });
              cursorKnown = false;
            }
            const onset = cursorKnown ? cursor : null;
            if (measureRest && (cursor.n !== 0n || measureRestSeen)) {
              addUnsupported(unsupported, 'source-measure-rest-not-at-measure-start', context);
            }
            measureRestSeen ||= measureRest;
            sourceEvents.push({
              partIndex: staffLocation.partIndex,
              localStaff: staffLocation.localStaff,
              staffIndex: staffIndex + 1,
              staffId: staffLocation.staffId,
              measureIndex: measureIndex + 1,
              sourceMeasureNumber,
              voiceOrdinal,
              kind: 'rest',
              onsetQ: rationalString(onset),
              durationQ: rationalString(duration),
              onset: rationalNumber(onset),
              duration: rationalNumber(duration),
              durationType,
              sourceMeasureDuration: rawMeasureDuration || null,
              dots,
              tupletRatio: tupletStack.length ? tupletStack.map(entry => ({ id: entry.id, actualNotes: entry.actualNotes, normalNotes: entry.normalNotes })) : null,
              grace: false,
              graceType: null,
              measureRest,
              pitches: [],
              rawEventId: childText(item, 'eid') || null,
            });
            restCount++;
            if (cursorKnown && duration !== null) cursor = addRational(cursor, duration);
            if (measureRest && elements(voice).some((node, index) => index > elements(voice).indexOf(item) && ['Chord', 'Rest'].includes(node.nodeName))) {
              addUnsupported(unsupported, 'event-after-measure-rest', context);
              cursorKnown = false;
            }
            continue;
          }
          if (!SOURCE_VOICE_SAFE.has(item.nodeName)) {
            addUnsupported(unsupported, 'unknown-event-related-source-element', {
              scope: 'voice', staffIndex: staffIndex + 1, measureIndex: measureIndex + 1, voiceOrdinal, raw: rawNode(item),
            });
          }
        }
        if (tupletStack.length) {
          addUnsupported(unsupported, 'tuplet-open-at-measure-end', { staffIndex: staffIndex + 1, measureIndex: measureIndex + 1, voiceOrdinal, ids: tupletStack.map(item => item.id) });
        }
      }
    }
  }

  return {
    format: 'musescore-xml',
    programVersion: childText(museScore, 'programVersion') || null,
    parts: parts.map(part => {
      const counts = sourceMeasureCounts.filter(staff => staff.partIndex === part.partIndex).map(staff => staff.count);
      return { ...part, measureCount: counts.length ? Math.max(...counts) : 0 };
    }),
    staffCount: staffNodes.length,
    measureCounts: sourceMeasureCounts,
    measures: sourceMeasures,
    voiceTopology: sourceVoiceTopology,
    events: sourceEvents,
    noteCount,
    restCount,
    eventCount: sourceEvents.length,
    transpositions: transpositionInfo.transpositions,
    scoreConcertPitch: transpositionInfo.scoreConcertPitch,
    sourceRelationshipLinks: sourceMarkup.relationshipLinks,
    sourceSpannerTypes: sourceMarkup.spannerTypes,
    sourceVoiceLocationOffsets,
    sourceOutOfScopeModifiers,
    unsupported: publicUnsupported(unsupported),
  };
}

function musicXmlTranspose(attributes, partId, measureIndex, unsupported) {
  const records = [];
  for (const attributesNode of named(attributes, 'attributes')) {
    for (const transpose of named(attributesNode, 'transpose')) {
      const record = {
        partId,
        measureIndex,
        staff: numeric(attr(transpose, 'number')) ?? 1,
        diatonic: numeric(childText(transpose, 'diatonic')) ?? 0,
        chromatic: numeric(childText(transpose, 'chromatic')) ?? 0,
        octaveChange: numeric(childText(transpose, 'octave-change')) ?? 0,
        double: childText(transpose, 'double') || null,
      };
      records.push(record);
      if (record.diatonic !== 0 || record.chromatic !== 0 || record.octaveChange !== 0 || record.double) {
        addUnsupported(unsupported, 'musicxml-transposition-semantics-unverified', record);
      }
    }
  }
  return records;
}

function checkMusicXmlNoteChildren(note, unsupported, context) {
  for (const child of elements(note)) {
    if (!MUSICXML_NOTE_SAFE.has(child.nodeName)) {
      addUnsupported(unsupported, 'unknown-event-related-musicxml-note-element', {
        ...context, tag: child.nodeName, raw: rawNode(child),
      });
    }
  }
}

function xmlNotePitch(note) {
  const pitch = first(note, 'pitch');
  if (!pitch) return null;
  const step = childText(pitch, 'step');
  const alter = numeric(childText(pitch, 'alter')) ?? 0;
  const octave = numeric(childText(pitch, 'octave'));
  if (!/^[A-G]$/.test(step) || !Number.isInteger(octave) || !Number.isFinite(alter)) return null;
  return { step, alter, octave, midi: midiPitch({ step, alter, octave }) };
}

function xmlTimeModification(note, unsupported, context) {
  const tm = first(note, 'time-modification');
  if (!tm) return { ratio: null, actualNotes: null, normalNotes: null };
  const actualNotes = numeric(childText(tm, 'actual-notes'));
  const normalNotes = numeric(childText(tm, 'normal-notes'));
  if (!(actualNotes > 0) || !(normalNotes > 0)) {
    addUnsupported(unsupported, 'musicxml-time-modification-incomplete', { ...context, raw: rawNode(tm) });
    return { ratio: null, actualNotes, normalNotes };
  }
  addUnsupported(unsupported, 'tuplet-semantics-unverified', { ...context, source: 'musicxml-time-modification', actualNotes, normalNotes });
  return { ratio: rationalString(rational(normalNotes, actualNotes)), actualNotes, normalNotes };
}

function normalizeXmlVoice(rawVoice, localStaff, unsupported, context) {
  const parsed = Number(rawVoice);
  if (!Number.isInteger(parsed) || parsed < 1) {
    addUnsupported(unsupported, 'musicxml-voice-label-unmapped', { ...context, voiceLabel: rawVoice });
    return null;
  }
  const impliedStaff = Math.floor((parsed - 1) / 4) + 1;
  const voiceOrdinal = ((parsed - 1) % 4) + 1;
  if (impliedStaff !== localStaff) {
    addUnsupported(unsupported, 'musicxml-voice-label-staff-mismatch', { ...context, voiceLabel: rawVoice, localStaff, impliedStaff, voiceOrdinal });
    return null;
  }
  return voiceOrdinal;
}

/** Reads staff-aware MusicXML events, including backup/forward and chord onsets. */
export function parseMusicXmlNativeEvents(xml) {
  const document = parseXml(xml, 'MusicXML');
  const root = document.documentElement;
  if (root.nodeName !== 'score-partwise') throw new Error('MusicXML não é score-partwise');
  const unsupported = [];
  if (root.getElementsByTagName('location').length || root.getElementsByTagName('Location').length) {
    addUnsupported(unsupported, 'musicxml-location-semantics-unverified');
  }
  const partNames = new Map();
  for (const part of named(first(root, 'part-list'), 'score-part')) {
    partNames.set(attr(part, 'id'), childText(part, 'part-name') || null);
  }
  const parts = [];
  const events = [];
  const measures = [];
  const voiceTopology = [];
  const transpositions = [];
  let noteCount = 0;
  let restCount = 0;

  for (const [partIndex, part] of named(root, 'part').entries()) {
    const partId = attr(part, 'id') ?? `P${partIndex + 1}`;
    const partMeasures = named(part, 'measure');
    let divisions = null;
    let staves = 1;
    const partVoiceLabels = new Map();
    for (const [measureIndex, measure] of partMeasures.entries()) {
      let cursor = rational(0, 1);
      let cursorKnown = true;
      let chordAnchor = null;
      let explicitMeasureStaves = null;
      for (const child of elements(measure)) {
        if (!MUSICXML_MEASURE_SAFE.has(child.nodeName)) {
          addUnsupported(unsupported, 'unknown-event-related-musicxml-measure-element', {
            partId, measureIndex: measureIndex + 1, tag: child.nodeName, raw: rawNode(child),
          });
        }
        if (child.nodeName === 'attributes') {
          const divisionsValue = numeric(childText(child, 'divisions'));
          if (divisionsValue !== null) divisions = divisionsValue;
          const stavesValue = numeric(childText(child, 'staves'));
          if (stavesValue !== null) {
            staves = Math.max(staves, stavesValue);
            explicitMeasureStaves = stavesValue;
          }
          transpositions.push(...musicXmlTranspose({ childNodes: [child] }, partId, measureIndex + 1, unsupported));
        }
        if (child.nodeName === 'direction') {
          for (const shift of Array.from(child.getElementsByTagName('octave-shift'))) {
            addUnsupported(unsupported, 'musicxml-octave-shift-semantics-unverified', {
              partId, measureIndex: measureIndex + 1, raw: rawNode(shift),
            });
          }
        }
        if (child.nodeName === 'backup' || child.nodeName === 'forward') {
          if (!(divisions > 0)) {
            addUnsupported(unsupported, 'musicxml-divisions-missing', { partId, measureIndex: measureIndex + 1, tag: child.nodeName });
            cursorKnown = false;
            chordAnchor = null;
            continue;
          }
          const ticks = numeric(childText(child, 'duration'));
          if (ticks === null || ticks < 0) {
            addUnsupported(unsupported, 'musicxml-cursor-duration-invalid', { partId, measureIndex: measureIndex + 1, tag: child.nodeName, ticks });
            cursorKnown = false;
          } else if (cursorKnown) {
            const delta = rational(ticks, divisions);
            cursor = child.nodeName === 'backup'
              ? addRational(cursor, rational(-delta.n, delta.d))
              : addRational(cursor, delta);
          }
          chordAnchor = null;
          continue;
        }
        if (child.nodeName !== 'note') continue;
        const rawStaff = childText(child, 'staff') || '1';
        const localStaff = numeric(rawStaff);
        const rawVoice = childText(child, 'voice') || '1';
        const context = { partId, measureIndex: measureIndex + 1, staff: localStaff, voiceLabel: rawVoice };
        if (!Number.isInteger(localStaff) || localStaff < 1) {
          addUnsupported(unsupported, 'musicxml-staff-invalid', context);
          cursorKnown = false;
          chordAnchor = null;
          continue;
        }
        staves = Math.max(staves, localStaff);
        const voiceOrdinal = normalizeXmlVoice(rawVoice, localStaff, unsupported, context);
        if (voiceOrdinal !== null) {
          const key = `${localStaff}:${voiceOrdinal}`;
          if (!partVoiceLabels.has(key)) partVoiceLabels.set(key, new Set());
          partVoiceLabels.get(key).add(rawVoice);
        }
        checkMusicXmlNoteChildren(child, unsupported, context);
        const isChordMember = named(child, 'chord').length > 0;
        const graceNode = first(child, 'grace');
        const isGrace = Boolean(graceNode);
        const restNode = first(child, 'rest');
        const measureRest = restNode ? boolAttribute(restNode, 'measure') : false;
        const kind = restNode ? 'rest' : 'note';
        const divisionsValid = divisions > 0;
        const durationTicks = numeric(childText(child, 'duration'));
        const durationR = isGrace ? rational(0, 1) : divisionsValid && durationTicks !== null ? rational(durationTicks, divisions) : null;
        if (!isGrace && durationR === null) addUnsupported(unsupported, 'musicxml-note-duration-unavailable', { ...context, durationTicks, divisions });
        if (isGrace && graceNode && ['make-time', 'steal-time-previous', 'steal-time-following'].some(name => attr(graceNode, name) !== null)) {
          addUnsupported(unsupported, 'musicxml-grace-timing-modifier-unverified', { ...context, graceAttributes: rawNode(graceNode).attributes });
        }
        if (first(child, 'cue')) addUnsupported(unsupported, 'musicxml-cue-note-semantics-unverified', context);
        const timeModification = xmlTimeModification(child, unsupported, context);
        const dots = named(child, 'dot').length;
        const durationType = childText(child, 'type') || null;
        let onset = cursorKnown ? cursor : null;
        if (isChordMember) {
          if (!chordAnchor || chordAnchor.localStaff !== localStaff || chordAnchor.rawVoice !== rawVoice) {
            addUnsupported(unsupported, 'musicxml-chord-anchor-unresolved', { ...context });
            onset = null;
          } else {
            onset = chordAnchor.onset;
            if (chordAnchor.durationQ !== rationalString(durationR) || chordAnchor.kind !== kind || chordAnchor.grace !== isGrace || chordAnchor.measureRest !== measureRest) {
              addUnsupported(unsupported, 'musicxml-chord-member-metadata-differs', { ...context });
            }
          }
        }
        if (kind === 'rest' && isChordMember) addUnsupported(unsupported, 'musicxml-rest-marked-as-chord-member', context);
        const spelling = kind === 'note' ? xmlNotePitch(child) : null;
        if (kind === 'note' && !spelling) {
          addUnsupported(unsupported, first(child, 'unpitched') ? 'musicxml-unpitched-event-unmapped' : 'musicxml-note-pitch-incomplete', context);
        }
        const eventData = {
          partId,
          partIndex: partIndex + 1,
          partName: partNames.get(partId) ?? null,
          localStaff,
          measureIndex: measureIndex + 1,
          musicXmlMeasureNumber: attr(measure, 'number') ?? null,
          implicit: attr(measure, 'implicit') ?? null,
          voiceOrdinal,
          voiceLabel: rawVoice,
          kind,
          onsetQ: rationalString(onset),
          durationQ: rationalString(durationR),
          onset: rationalNumber(onset),
          duration: rationalNumber(durationR),
          durationType: measureRest ? 'measure' : durationType,
          dots,
          tupletRatio: timeModification.ratio,
          tupletActualNotes: timeModification.actualNotes,
          tupletNormalNotes: timeModification.normalNotes,
          grace: isGrace,
          graceType: isGrace ? 'grace' : null,
          measureRest,
          pitches: spelling ? [{ step: spelling.step, alter: spelling.alter, octave: spelling.octave, midi: spelling.midi }] : [],
        };
        if (kind === 'note') noteCount++;
        if (isChordMember) {
          chordAnchor.event.pitches.push(...eventData.pitches);
          chordAnchor.event.chordNoteCount += 1;
        } else {
          eventData.chordNoteCount = kind === 'note' ? 1 : 0;
          events.push(eventData);
          chordAnchor = { event: eventData, onset, durationQ: rationalString(durationR), kind, localStaff, rawVoice, grace: isGrace, measureRest };
          if (kind === 'rest') restCount++;
          if (!isGrace && durationR !== null && cursorKnown) cursor = addRational(cursor, durationR);
          if (measureRest && (rationalNumber(onset) !== 0 || elements(measure).some((node, index) => index > elements(measure).indexOf(child) && node.nodeName === 'note'))) {
            addUnsupported(unsupported, 'musicxml-measure-rest-cursor-shape-unverified', context);
          }
        }
      }
      measures.push({
        partIndex: partIndex + 1,
        partId,
        measureIndex: measureIndex + 1,
        musicXmlMeasureNumber: attr(measure, 'number') ?? null,
        implicit: attr(measure, 'implicit') ?? null,
        divisions,
        staves: explicitMeasureStaves ?? staves,
      });
    }
    parts.push({ partIndex: partIndex + 1, id: partId, name: partNames.get(partId) ?? null, measureCount: partMeasures.length, staffCount: staves });
    for (const [key, labels] of partVoiceLabels) {
      const [localStaff, voiceOrdinal] = key.split(':').map(Number);
      for (const [measureIndex, measure] of partMeasures.entries()) {
        const used = events.some(event => event.partIndex === partIndex + 1 && event.localStaff === localStaff && event.voiceOrdinal === voiceOrdinal && event.measureIndex === measureIndex + 1);
        voiceTopology.push({ partIndex: partIndex + 1, partId, localStaff, voiceOrdinal, voiceLabels: [...labels].sort(), measureIndex: measureIndex + 1, presentWithEvents: used });
      }
    }
  }

  for (const event of events) event.pitches.sort((a, b) => `${a.step}:${a.alter}:${a.octave}:${a.midi}`.localeCompare(`${b.step}:${b.alter}:${b.octave}:${b.midi}`));
  return { format: 'musicxml', parts, measures, voiceTopology, events, noteCount, restCount, eventCount: events.length, transpositions, unsupported: publicUnsupported(unsupported) };
}

function canonicalPitch(pitch) {
  if (!pitch) return null;
  const spelling = pitch.spelling ?? pitch;
  return `${spelling.step}:${spelling.alter}:${pitch.octave}`;
}

function eventSignature(event) {
  return JSON.stringify([
    event.kind,
    (event.pitches ?? []).map(canonicalPitch).sort(),
    event.onsetQ,
    event.durationQ,
    event.grace,
    event.measureRest,
    event.dots,
    event.durationType,
    event.tupletRatio,
  ]);
}

function eventGroupKey(event) {
  return JSON.stringify([event.partIndex, event.localStaff, event.measureIndex, event.voiceOrdinal]);
}

function compareEventPair(expected, actual) {
  const fields = [
    ['kind', expected.kind, actual.kind],
    ['pitches', (expected.pitches ?? []).map(canonicalPitch).sort(), (actual.pitches ?? []).map(canonicalPitch).sort()],
    ['onsetQ', expected.onsetQ, actual.onsetQ],
    ['durationQ', expected.durationQ, actual.durationQ],
    ['grace', expected.grace, actual.grace],
    ['measureRest', expected.measureRest, actual.measureRest],
    ['dots', expected.dots, actual.dots],
    ['durationType', expected.durationType, actual.durationType],
    ['tupletRatio', expected.tupletRatio, actual.tupletRatio],
  ];
  return fields.filter(([, a, b]) => JSON.stringify(a) !== JSON.stringify(b)).map(([field, expectedValue, actualValue]) => ({ field, expected: expectedValue, actual: actualValue }));
}

function compareEventStreams(expected, actual) {
  const groups = new Map();
  for (const [side, stream] of [['source', expected], ['candidate', actual]]) {
    for (const event of stream) {
      const key = eventGroupKey(event);
      if (!groups.has(key)) groups.set(key, { source: [], candidate: [] });
      groups.get(key)[side].push(event);
    }
  }
  let exact = 0;
  let changed = 0;
  let missing = 0;
  let extra = 0;
  const differences = [];
  for (const [key, group] of groups) {
    const remaining = [...group.candidate];
    const unmatched = [];
    for (const event of group.source) {
      const index = remaining.findIndex(candidate => eventSignature(event) === eventSignature(candidate));
      if (index === -1) unmatched.push(event);
      else { remaining.splice(index, 1); exact++; }
    }
    for (const event of unmatched) {
      if (!remaining.length) {
        missing++;
        differences.push({ kind: 'missing', source: event, candidate: null });
        continue;
      }
      const sameKind = remaining.map((candidate, index) => ({ candidate, index })).filter(row => row.candidate.kind === event.kind);
      const pool = sameKind.length ? sameKind : remaining.map((candidate, index) => ({ candidate, index }));
      pool.sort((a, b) => {
        const onsetA = a.candidate.onset === null || event.onset === null ? Infinity : Math.abs(a.candidate.onset - event.onset);
        const onsetB = b.candidate.onset === null || event.onset === null ? Infinity : Math.abs(b.candidate.onset - event.onset);
        return onsetA - onsetB || a.index - b.index;
      });
      const selected = pool[0];
      remaining.splice(selected.index, 1);
      const fields = compareEventPair(event, selected.candidate);
      if (!fields.length) exact++;
      else {
        changed++;
        differences.push({ kind: 'changed', source: event, candidate: selected.candidate, fields });
      }
    }
    extra += remaining.length;
    for (const candidate of remaining) differences.push({ kind: 'extra', source: null, candidate });
  }
  return { exact, changed, missing, extra, differentEventCount: changed + missing + extra, differences };
}

function structuralCompatibility(source, candidate, unsupported) {
  if (source.parts.length !== candidate.parts.length) {
    addUnsupported(unsupported, 'part-count-mismatch', { source: source.parts.length, candidate: candidate.parts.length });
    return;
  }
  for (const sourcePart of source.parts) {
    const candidatePart = candidate.parts[sourcePart.partIndex - 1];
    if (!candidatePart || sourcePart.staffCount !== candidatePart.staffCount) {
      addUnsupported(unsupported, 'part-staff-count-mismatch', {
        partIndex: sourcePart.partIndex, source: sourcePart.staffCount, candidate: candidatePart?.staffCount ?? null,
      });
    }
    if (candidatePart && sourcePart.measureCount !== candidatePart.measureCount) {
      addUnsupported(unsupported, 'measure-count-mismatch-unmapped', {
        partIndex: sourcePart.partIndex, source: sourcePart.measureCount, candidate: candidatePart.measureCount,
      });
    }
  }
}

/** Compares only complete, supported event streams. Scores remain null by design. */
export function compareNativeAndMusicXmlEvents(source, candidate) {
  const unsupported = [];
  structuralCompatibility(source, candidate, unsupported);
  for (const item of source.unsupported ?? []) addUnsupported(unsupported, item.code, item);
  for (const item of candidate.unsupported ?? []) addUnsupported(unsupported, item.code, item);
  const comparison = unsupported.length ? null : compareEventStreams(source.events, candidate.events);
  return {
    status: unsupported.length ? 'unsupported' : 'compared',
    comparison,
    scoreOutOf10: null,
    globalGrades: null,
    approvedForFinalDelivery: false,
    trainingEligible: false,
    humanApproved: false,
    independentPdfReference: false,
    equivalentToPdf: false,
    unsupported: publicUnsupported(unsupported),
  };
}

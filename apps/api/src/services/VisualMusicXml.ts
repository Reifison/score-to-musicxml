import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import type { VisualCorrectionProposal, VisualNoteValue } from "./SourceVisualReviewTypes.js";

export type VisualParsedEvent = VisualNoteValue & {
  noteIndex: number;
  onset: number;
  voice: string;
  staff: number;
  chord: boolean;
  grace: boolean;
  kindChangeSafe: boolean;
  pitchChangeSafe: boolean;
};

export type VisualParsedMeasure = {
  partIndex: number;
  partId: string;
  measureIndex: number;
  measure: string;
  events: VisualParsedEvent[];
  /** Editing a duration here could shift another voice or chord. */
  simpleRhythm: boolean;
  /** Printed note type, dots and tuplet ratio agree with the encoded duration when present. */
  rhythmNotationValid: boolean;
};

const children = (node: Node, name?: string): Element[] => Array.from(node.childNodes).filter((child): child is Element =>
  child.nodeType === 1 && (!name || (child as Element).localName === name || child.nodeName === name));
const first = (node: Node, name: string): Element | undefined => children(node, name)[0];
const value = (node: Node, name: string): string | undefined => first(node, name)?.textContent?.trim() || undefined;
const numberValue = (node: Node, name: string): number | undefined => {
  const raw = value(node, name);
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const quarterUnitsByType: Record<string, number> = {
  maxima: 32, long: 16, breve: 8, whole: 4, half: 2, quarter: 1, eighth: 0.5,
  "16th": 0.25, "32nd": 0.125, "64th": 0.0625, "128th": 0.03125,
  "256th": 0.015625, "512th": 0.0078125, "1024th": 0.00390625
};

function noteRhythmNotationMatches(note: Element, duration: number): boolean {
  const type = value(note, "type");
  if (!type) return true;
  const base = quarterUnitsByType[type];
  if (!base) return false;
  const dotCount = children(note, "dot").length;
  let dottedMultiplier = 1;
  for (let index = 1; index <= dotCount; index++) dottedMultiplier += 1 / 2 ** index;
  const timeModification = first(note, "time-modification");
  let tupletMultiplier = 1;
  if (timeModification) {
    const actualNotes = numberValue(timeModification, "actual-notes");
    const normalNotes = numberValue(timeModification, "normal-notes");
    if (!actualNotes || !normalNotes || !Number.isSafeInteger(actualNotes) || !Number.isSafeInteger(normalNotes)) return false;
    tupletMultiplier = normalNotes / actualNotes;
  }
  return Math.abs(base * dottedMultiplier * tupletMultiplier - duration) <= 0.000001;
}

function documentOf(xml: string): Document {
  if (xml.length > 16 * 1024 * 1024 || /<!ENTITY\b/i.test(xml)) throw new Error("MusicXML visual inválido ou grande demais.");
  const errors: string[] = [];
  const document = new DOMParser({ errorHandler: {
    warning: (message) => errors.push(String(message)),
    error: (message) => errors.push(String(message)),
    fatalError: (message) => errors.push(String(message))
  } }).parseFromString(xml, "application/xml");
  if (errors.length || document.documentElement?.localName !== "score-partwise") throw new Error("MusicXML visual inválido.");
  return document;
}

export function parseVisualMusicXml(xml: string): VisualParsedMeasure[] {
  const document = documentOf(xml);
  const result: VisualParsedMeasure[] = [];
  for (const [partIndex, part] of children(document.documentElement, "part").entries()) {
    const partId = part.getAttribute("id") ?? "";
    if (!partId) throw new Error("Parte sem identidade no MusicXML.");
    let divisions: number | undefined;
    let keyFifths = 0;
    for (const [measureIndex, measure] of children(part, "measure").entries()) {
      const events: VisualParsedEvent[] = [];
      let onset = 0;
      let priorOnset = 0;
      let noteIndex = 0;
      let simpleRhythm = true;
      let rhythmNotationValid = true;
      for (const item of children(measure)) {
        if (item.localName === "attributes") {
          if (first(item, "divisions")) {
            divisions = numberValue(item, "divisions");
            if (!divisions || !Number.isSafeInteger(divisions) || divisions <= 0) throw new Error("Divisões inválidas no MusicXML.");
          }
          for (const key of children(item, "key")) {
            const fifths = numberValue(key, "fifths");
            if (fifths === undefined || !Number.isInteger(fifths) || fifths < -7 || fifths > 7) throw new Error("Armadura não verificável no MusicXML.");
            keyFifths = fifths;
          }
        } else if (item.localName === "backup" || item.localName === "forward") {
          simpleRhythm = false;
          const duration = numberValue(item, "duration");
          if (!divisions || duration === undefined || !Number.isSafeInteger(duration) || duration < 0) {
            throw new Error("Deslocamento de voz inválido no MusicXML.");
          }
          onset += (item.localName === "backup" ? -1 : 1) * duration / divisions;
        } else if (item.localName === "note") {
          const grace = Boolean(first(item, "grace"));
          const chord = Boolean(first(item, "chord"));
          if (grace || chord) simpleRhythm = false;
          const pitch = first(item, "pitch");
          const rest = first(item, "rest");
          const durationRaw = numberValue(item, "duration");
          const duration = grace && durationRaw === undefined ? 0 : divisions && durationRaw !== undefined ? durationRaw / divisions : NaN;
          const eventOnset = chord ? priorOnset : onset;
          if ((!grace && (!Number.isFinite(duration) || duration <= 0)) || (grace && (!Number.isFinite(duration) || duration < 0))
            || !Number.isFinite(eventOnset) || eventOnset < 0) {
            throw new Error("Tempo do evento não verificável no MusicXML.");
          }
          const staff = first(item, "staff") ? numberValue(item, "staff") : 1;
          if (!staff || !Number.isSafeInteger(staff) || staff < 1 || staff > 64) throw new Error("Pauta inválida no MusicXML.");
          const voice = first(item, "voice") ? value(item, "voice") : "1";
          if (!voice) throw new Error("Voz inválida no MusicXML.");
          if (voice.length > 32) throw new Error("Voz inválida no MusicXML.");
          const base = { noteIndex, onset: eventOnset, voice, staff,
            chord, grace, kindChangeSafe: !["notations", "tie", "beam", "accidental", "stem"].some((name) => first(item, name)),
            pitchChangeSafe: !first(item, "accidental") && keyFifths === 0,
            duration, type: value(item, "type"), dots: children(item, "dot").length };
          if (!grace && Number.isFinite(duration)) {
            if (!noteRhythmNotationMatches(item, duration)) rhythmNotationValid = false;
            if (first(item, "time-modification")) simpleRhythm = false;
          }
          if (rest && !pitch) events.push({ ...base, kind: "rest" });
          else if (pitch && !rest) {
            const step = value(pitch, "step");
            const alter = first(pitch, "alter") ? numberValue(pitch, "alter") : 0;
            const octave = numberValue(pitch, "octave");
            if (!step || !/^[A-G]$/.test(step) || octave === undefined || !Number.isInteger(octave) || octave < 0 || octave > 9
              || alter === undefined || !Number.isInteger(alter) || alter < -2 || alter > 2) throw new Error("Altura ilegível no MusicXML.");
            events.push({ ...base, kind: "note", step: step as VisualNoteValue["step"], alter, octave });
          } else throw new Error("Evento visual não suportado no MusicXML.");
          if (!chord) priorOnset = onset;
          if (!chord && !grace && Number.isFinite(duration)) onset += duration;
          noteIndex++;
        }
      }
      result.push({ partIndex, partId, measureIndex, measure: measure.getAttribute("number") ?? String(measureIndex + 1),
        events, simpleRhythm, rhythmNotationValid });
    }
  }
  return result;
}

function comparable(value: VisualNoteValue): string {
  return JSON.stringify({ kind: value.kind, step: value.step, alter: value.alter ?? 0, octave: value.octave,
    duration: value.duration, type: value.type, dots: value.dots ?? 0 });
}

/** Apply only a user-selected, version-checked replacement; insertion/deletion remains a manual edit. */
export function applyVisualCorrection(xml: string, proposal: VisualCorrectionProposal, direction: "accept" | "undo"): string {
  if (!proposal.applicable || !proposal.before || !proposal.after) throw new Error("Proposta sem alteração segura aplicável.");
  const document = documentOf(xml);
  const part = children(document.documentElement, "part")[proposal.partIndex];
  const measure = part && children(part, "measure")[proposal.measureIndex];
  const note = measure && children(measure, "note")[proposal.noteIndex];
  if (!part || part.getAttribute("id") !== proposal.partId || !measure || !note || measure.getAttribute("number") !== proposal.measure) {
    throw new Error("A localização da proposta mudou.");
  }
  const parsed = parseVisualMusicXml(xml).find((item) => item.partIndex === proposal.partIndex && item.measureIndex === proposal.measureIndex);
  const current = parsed?.events.find((item) => item.noteIndex === proposal.noteIndex);
  const expected = direction === "accept" ? proposal.before : proposal.after;
  const target = direction === "accept" ? proposal.after : proposal.before;
  if (!current || comparable(current) !== comparable(expected)) throw new Error("O evento mudou desde a proposta.");
  if (!Number.isFinite(target.duration) || target.duration <= 0) throw new Error("Duração inválida.");
  if (current.grace || current.chord) throw new Error("Graça ou acorde requer edição musical manual.");
  const rhythmChange = target.duration !== current.duration;
  if (rhythmChange) throw new Error("Mudança isolada de duração pode deslocar eventos seguintes ou alterar o fechamento do compasso; revisão manual necessária.");
  if (target.type !== current.type || (target.dots ?? 0) !== (current.dots ?? 0)) {
    throw new Error("Alteração de tipo rítmico ou pontuação exige revisão manual.");
  }
  if (target.kind !== current.kind && (first(note, "notations") || first(note, "tie") || first(note, "beam") || first(note, "accidental"))) {
    throw new Error("Troca de nota e pausa com notação associada requer edição manual.");
  }
  if (target.kind === "note" && (!target.step || !Number.isInteger(target.octave) || target.octave! < 0 || target.octave! > 9)) {
    throw new Error("Altura proposta inválida.");
  }
  if (target.kind === "note" && (!Number.isInteger(target.alter ?? 0) || (target.alter ?? 0) < -2 || (target.alter ?? 0) > 2)) {
    throw new Error("Acidente proposto inválido.");
  }
  if ((current.step !== target.step || current.octave !== target.octave || (current.alter ?? 0) !== (target.alter ?? 0))
    && (!current.pitchChangeSafe || (current.alter ?? 0) !== 0 || (target.alter ?? 0) !== 0)) {
    throw new Error("Alteração de altura com armadura ou acidente exige revisão manual.");
  }
  let divisions: number | undefined;
  for (const prior of children(part, "measure").slice(0, proposal.measureIndex + 1)) {
    for (const attr of children(prior, "attributes")) if (first(attr, "divisions")) divisions = numberValue(attr, "divisions");
  }
  const rawDuration = divisions ? target.duration * divisions : NaN;
  if (!Number.isSafeInteger(rawDuration) || rawDuration <= 0) throw new Error("Duração incompatível com as divisões do MusicXML.");
  const create = (name: string, content: string): Element => {
    const node = document.createElement(name);
    node.appendChild(document.createTextNode(content));
    return node;
  };
  const oldPitch = first(note, "pitch");
  const oldRest = first(note, "rest");
  if (oldPitch) note.removeChild(oldPitch);
  if (oldRest) note.removeChild(oldRest);
  if (target.kind === "rest") note.insertBefore(document.createElement("rest"), note.firstChild);
  else {
    const pitch = document.createElement("pitch");
    pitch.appendChild(create("step", target.step!));
    if (target.alter !== undefined && target.alter !== 0) pitch.appendChild(create("alter", String(target.alter)));
    pitch.appendChild(create("octave", String(target.octave)));
    note.insertBefore(pitch, note.firstChild);
  }
  const duration = first(note, "duration");
  if (!duration) throw new Error("Evento sem duração editável.");
  duration.textContent = String(rawDuration);
  const printedType = first(note, "type");
  if (target.type && printedType) printedType.textContent = target.type;
  else if (target.type && !printedType) {
    const next = children(note).find((element) => ["stem", "notehead", "staff", "beam", "notations", "lyric"].includes(element.localName));
    note.insertBefore(create("type", target.type), next ?? null);
  }
  const dots = children(note, "dot");
  for (const dot of dots) note.removeChild(dot);
  const dotFollower = children(note).find((element) => ["accidental", "time-modification", "stem", "notehead", "staff", "beam", "notations", "lyric"].includes(element.localName));
  for (let index = 0; index < (target.dots ?? 0); index++) note.insertBefore(document.createElement("dot"), dotFollower ?? null);
  return new XMLSerializer().serializeToString(document);
}

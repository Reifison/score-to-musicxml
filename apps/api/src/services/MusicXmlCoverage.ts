import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import type { ConversionCoverage, PageCoverage, ScoreType } from "../domain.js";
import { AppError } from "../errors/AppError.js";

type ParsedPart = { id: string; name: string; key: string; element: Element; staves: number[]; clefs: Array<{ staff: number; sign: string }>; voices: string[] };
type ParsedPage = { document: Document; parts: ParsedPart[] };

const direct = (parent: Node, name: string): Element[] => Array.from(parent.childNodes).filter((node): node is Element => node.nodeType === 1 && node.nodeName === name);
const textOf = (parent: Element, tag: string): string => parent.getElementsByTagName(tag).item(0)?.textContent?.trim() ?? "";
const canonicalName = (value: string): string => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function parsePage(xml: string): ParsedPage {
  const errors: string[] = [];
  const document = new DOMParser({ errorHandler: { warning: () => undefined, error: (message) => errors.push(String(message)), fatalError: (message) => errors.push(String(message)) } }).parseFromString(xml, "application/xml");
  const root = document.documentElement;
  if (errors.length || root?.nodeName !== "score-partwise") throw new AppError(422, "MusicXML gerado é inválido.", "OMR_INVALID_XML");
  const list = direct(root, "part-list")[0];
  const declarations = list ? direct(list, "score-part") : [];
  const bodies = direct(root, "part");
  if (!declarations.length && !bodies.length) throw new AppError(422, "Nenhuma parte foi reconhecida nesta página.", "OMR_PAGE_EMPTY");
  if (declarations.length !== bodies.length) throw new AppError(422, "O MusicXML não contém partes instrumentais completas.", "OMR_PART_INTEGRITY");
  const names = new Map(declarations.map((part) => [part.getAttribute("id") ?? "", textOf(part, "part-name") || textOf(part, "part-abbreviation")]));
  const byId = new Map(declarations.map((part) => [part.getAttribute("id") ?? "", part]));
  const parts = bodies.map((element, index) => {
    const id = element.getAttribute("id") ?? "";
    if (!id || !names.has(id)) throw new AppError(422, "Parte instrumental sem declaração correspondente.", "OMR_PART_INTEGRITY");
    const declaredInstrumentIds = new Set(direct(byId.get(id)!, "score-instrument").map((instrument) => instrument.getAttribute("id") ?? ""));
    const usedInstrumentIds = Array.from(element.getElementsByTagName("note")).flatMap((note) => direct(note, "instrument").map((instrument) => instrument.getAttribute("id") ?? ""));
    if (declaredInstrumentIds.has("") || usedInstrumentIds.some((instrumentId) => !declaredInstrumentIds.has(instrumentId))) {
      throw new AppError(422, "Nota referencia instrumento sem declaração correspondente.", "OMR_PART_INTEGRITY");
    }
    const declaredName = names.get(id) ?? "";
    const name = declaredName || `Parte ${index + 1}`;
    const staffReferences = Array.from(element.getElementsByTagName("staff")).map((node) => Number(node.textContent)).filter((number) => Number.isInteger(number) && number > 0);
    const declaredStaves = Array.from(element.getElementsByTagName("staves")).map((node) => Number(node.textContent)).filter((number) => Number.isInteger(number) && number > 0);
    const staves = [...new Set([...staffReferences, ...declaredStaves.flatMap((count) => Array.from({ length: count }, (_, staff) => staff + 1))])].sort((a, b) => a - b);
    if (!staves.length) staves.push(1);
    const clefs = Array.from(element.getElementsByTagName("clef")).map((node) => ({ staff: Number(node.getAttribute("number") || "1"), sign: textOf(node, "sign") }));
    const voices = [...new Set(Array.from(element.getElementsByTagName("voice")).map((node) => node.textContent?.trim() || "1"))];
    if (!voices.length) voices.push("1");
    const key = bodies.length === 1 ? "single" : canonicalName(declaredName);
    return { id, name, key, element, staves, clefs, voices };
  });
  if (new Set(parts.map((part) => part.id)).size !== parts.length) throw new AppError(422, "IDs de partes instrumentais duplicados.", "OMR_PART_INTEGRITY");
  return { document, parts };
}

function validateRequired(page: ParsedPage, scoreType: ScoreType): void {
  const { parts } = page;
  if (scoreType === "guitar_duo") {
    if (parts.length !== 2 || parts.some((part) => part.staves.length !== 1 || part.staves[0] !== 1 || part.clefs.length === 0 || part.clefs.some((clef) => clef.sign !== "G"))) {
      throw new AppError(422, "Uma página do duo perdeu um violão, uma pauta ou uma clave de sol.", "OMR_PART_INTEGRITY");
    }
    if (!parts[0].key || !parts[1].key || parts[0].key === parts[1].key) {
      throw new AppError(422, "Não é possível distinguir com segurança Violão 1 e Violão 2 entre páginas.", "OMR_PART_IDENTITY_AMBIGUOUS");
    }
  } else if (scoreType === "piano") {
    if (parts.length !== 1 || parts[0].staves.join(",") !== "1,2") {
      throw new AppError(422, "Uma página de piano perdeu uma das duas pautas.", "OMR_STAFF_INTEGRITY");
    }
    if (![1, 2].every((staff) => parts[0].clefs.some((clef) => clef.staff === staff && clef.sign))) {
      throw new AppError(422, "Uma página de piano não identifica a clave de cada pauta.", "OMR_STAFF_INTEGRITY");
    }
    const used = new Set(Array.from(parts[0].element.getElementsByTagName("note")).map((note) => textOf(note, "staff") || "1"));
    if (!used.has("1") || !used.has("2")) throw new AppError(422, "Uma página de piano não contém eventos nas duas pautas.", "OMR_STAFF_INTEGRITY");
  } else if (parts.length !== 1 || parts[0].staves.length !== 1) {
    throw new AppError(422, "A página não preservou a parte e a pauta obrigatórias.", "OMR_PART_INTEGRITY");
  }
  if (parts.some((part) => !direct(part.element, "measure").length || direct(part.element, "measure").some((measure) => measure.getElementsByTagName("note").length === 0))) {
    throw new AppError(422, "Parte instrumental contém compasso sem notas ou pausas reconhecidas.", "OMR_PART_INTEGRITY");
  }
}

export function inspectMusicXml(xml: string, page: number, scoreType: ScoreType): { coverage: PageCoverage; parsed: ParsedPage } {
  const parsed = parsePage(xml);
  validateRequired(parsed, scoreType);
  return { parsed, coverage: { page, status: "processed", parts: parsed.parts.map((part) => ({ id: part.id, name: part.name, staffCount: part.staves.length, staves: part.staves, clefs: part.clefs, voices: part.voices })) } };
}

function removeRedundantChordBeams(measure: Element): void {
  let chordRoot: Element | null = null;
  for (const event of Array.from(measure.childNodes).filter((node): node is Element => node.nodeType === 1)) {
    if (event.nodeName === "backup" || event.nodeName === "forward") {
      chordRoot = null;
      continue;
    }
    if (event.nodeName !== "note") continue;
    if (!direct(event, "chord").length) {
      chordRoot = event;
      continue;
    }
    const beams = direct(event, "beam");
    if (!beams.length) continue;
    const rootBeams = chordRoot ? direct(chordRoot, "beam") : [];
    const sameEvent = chordRoot
      && (textOf(chordRoot, "voice") || "1") === (textOf(event, "voice") || "1")
      && (textOf(chordRoot, "staff") || "1") === (textOf(event, "staff") || "1")
      && textOf(chordRoot, "duration") === textOf(event, "duration");
    const allRedundant = beams.every((beam) => rootBeams.some((rootBeam) =>
      rootBeam.getAttribute("number") === beam.getAttribute("number") && rootBeam.textContent?.trim() === beam.textContent?.trim()
    ));
    if (!sameEvent || !allRedundant) {
      throw new AppError(422, "Feixes de notas em acorde não podem ser associados com segurança.", "OMR_PART_INTEGRITY");
    }
    for (const beam of beams) event.removeChild(beam);
  }
}

const ACCIDENTAL_INSERT_BEFORE = ["time-modification", "stem", "notehead", "notehead-text", "staff", "beam", "notations", "lyric", "play", "listen"];

type PitchedMeasureNote = {
  note: Element;
  step: string;
  staff: string;
  octave: number;
  alter: number;
  accidental?: string;
  accidentalEditorial: boolean;
};

function standardAccidentalForAlter(alter: number): string | undefined {
  if (alter === -2) return "flat-flat";
  if (alter === -1) return "flat";
  if (alter === 0) return "natural";
  if (alter === 1) return "sharp";
  if (alter === 2) return "double-sharp";
  return undefined;
}

function alterForStandardAccidental(accidental: string): number | undefined {
  if (accidental === "flat-flat") return -2;
  if (accidental === "flat") return -1;
  if (accidental === "natural") return 0;
  if (accidental === "sharp") return 1;
  if (accidental === "double-sharp") return 2;
  return undefined;
}

function readPitchedMeasureNote(note: Element): PitchedMeasureNote | undefined {
  if (direct(note, "grace").length || direct(note, "unpitched").length) return undefined;
  const pitch = direct(note, "pitch")[0];
  if (!pitch) return undefined;
  const step = direct(pitch, "step")[0]?.textContent?.trim().toUpperCase() ?? "";
  const octaveText = direct(pitch, "octave")[0]?.textContent?.trim() ?? "";
  const octave = Number(octaveText);
  if (!step || !Number.isInteger(octave)) return undefined;
  const alterElement = direct(pitch, "alter")[0];
  const alterText = alterElement?.textContent?.trim() ?? "";
  const alter = alterElement && !alterText ? Number.NaN : alterElement ? Number(alterText) : 0;
  if (!Number.isInteger(alter) || !standardAccidentalForAlter(alter)) return undefined;
  const accidentalElement = direct(note, "accidental")[0];
  const accidental = accidentalElement?.textContent?.trim().toLowerCase() || undefined;
  return {
    note,
    step,
    staff: direct(note, "staff")[0]?.textContent?.trim() || "1",
    octave,
    alter,
    accidental,
    accidentalEditorial: accidentalElement?.getAttribute("editorial")?.trim().toLowerCase() === "yes"
  };
}

function insertAccidentalGlyph(note: Element, glyph: string): void {
  const accidental = note.ownerDocument.createElement("accidental");
  accidental.setAttribute("parentheses", "yes");
  accidental.setAttribute("editorial", "yes");
  accidental.textContent = glyph;
  const before = ACCIDENTAL_INSERT_BEFORE
    .map((name) => direct(note, name)[0])
    .find((element): element is Element => Boolean(element));
  note.insertBefore(accidental, before ?? null);
}

/**
 * Gives a note its own written accidental when another octave in the same
 * measure/staff/step explicitly establishes a different standard alteration.
 * This is a render-compatibility glyph only; pitch and duration stay intact.
 */
function addCrossOctaveAccidentals(root: Element): number {
  let notesAdjusted = 0;
  for (const part of direct(root, "part")) {
    for (const measure of direct(part, "measure")) {
      const notes = Array.from(measure.getElementsByTagName("note"))
        .map(readPitchedMeasureNote)
        .filter((note): note is PitchedMeasureNote => Boolean(note));
      const byStaffAndStep = new Map<string, PitchedMeasureNote[]>();
      for (const note of notes) {
        const key = `${note.staff}:${note.step}`;
        const group = byStaffAndStep.get(key) ?? [];
        group.push(note);
        byStaffAndStep.set(key, group);
      }

      for (const group of byStaffAndStep.values()) {
        const explicitAccidentals = group.filter((note) => {
          if (!note.accidental || note.accidentalEditorial) return false;
          const accidentalAlter = alterForStandardAccidental(note.accidental);
          return accidentalAlter !== undefined && accidentalAlter === note.alter;
        });
        if (!explicitAccidentals.length) continue;
        for (const note of group) {
          if (note.accidental) continue;
          const hasCrossOctaveConflict = explicitAccidentals.some((explicit) =>
            explicit.octave !== note.octave && explicit.alter !== note.alter
          );
          if (!hasCrossOctaveConflict) continue;
          const glyph = standardAccidentalForAlter(note.alter);
          if (!glyph) continue;
          insertAccidentalGlyph(note.note, glyph);
          notesAdjusted += 1;
        }
      }
    }
  }
  return notesAdjusted;
}

function getOrCreateIdentification(root: Element): Element {
  const existing = direct(root, "identification")[0];
  if (existing) return existing;
  const identification = root.ownerDocument.createElement("identification");
  const insertionBefore = ["defaults", "credit", "part-list", "part"]
    .flatMap((name) => direct(root, name))
    .sort((left, right) => Array.prototype.indexOf.call(root.childNodes, left) - Array.prototype.indexOf.call(root.childNodes, right))[0];
  root.insertBefore(identification, insertionBefore ?? null);
  return identification;
}

function recordCrossOctaveAccidental(root: Element, notesAdjusted: number): void {
  if (!notesAdjusted) return;
  const document = root.ownerDocument;
  const identification = getOrCreateIdentification(root);
  let miscellaneous = direct(identification, "miscellaneous")[0];
  if (!miscellaneous) {
    miscellaneous = document.createElement("miscellaneous");
    identification.appendChild(miscellaneous);
  }
  if (direct(miscellaneous, "miscellaneous-field").some((field) => field.getAttribute("name") === "score-to-musicxml:cross-octave-accidental-v1")) return;
  const field = document.createElement("miscellaneous-field");
  field.setAttribute("name", "score-to-musicxml:cross-octave-accidental-v1");
  field.textContent = JSON.stringify({ notesAdjusted, pitchesChanged: false, renderCompatibility: true });
  miscellaneous.appendChild(field);
}

function labelSelectedGuitars(root: Element, scoreType: ScoreType): void {
  if (scoreType !== "guitar_solo" && scoreType !== "guitar_duo") return;
  const list = direct(root, "part-list")[0];
  const declarations = list ? direct(list, "score-part") : [];
  if (declarations.length !== (scoreType === "guitar_duo" ? 2 : 1)) return;
  const metadata = declarations.map((part) => {
    const nameElement = direct(part, "part-name")[0];
    const name = canonicalName(nameElement?.textContent?.trim() ?? "");
    const partNamePlaceholder = /^voice(?: oohs)?(?: [12])?$/.test(name);
    const partNameGuitar = /(?:^| )(?:guitar|violao)(?: |$)/.test(name);
    const number = name.match(/ ([12])$/)?.[1];
    const scoreInstruments = direct(part, "score-instrument");
    const midiInstruments = direct(part, "midi-instrument");
    if (!nameElement || scoreInstruments.length !== 1 || midiInstruments.length !== 1) return null;
    if (scoreInstruments[0].getAttribute("id") !== midiInstruments[0].getAttribute("id")) return null;
    const instrumentNameElement = direct(scoreInstruments[0], "instrument-name")[0];
    const instrumentName = canonicalName(instrumentNameElement?.textContent?.trim() ?? "");
    const instrumentPlaceholder = instrumentName === "voice oohs";
    const alreadyGuitar = /(?:^| )(?:guitar|violao)(?: |$)/.test(instrumentName);
    if (!instrumentNameElement || !(instrumentPlaceholder || alreadyGuitar)) return null;
    const sound = direct(scoreInstruments[0], "instrument-sound")[0];
    if (sound && !/^voice(?: |$)/.test(canonicalName(sound.textContent?.trim() ?? ""))) return null;
    const program = direct(midiInstruments[0], "midi-program")[0];
    if (instrumentPlaceholder && program?.textContent?.trim() !== "54") return null;
    return { part, nameElement, partNamePlaceholder, partNameGuitar, number, scoreInstrument: scoreInstruments[0], instrumentNameElement, midiInstrument: midiInstruments[0], program, instrumentPlaceholder, alreadyGuitar, sound };
  });
  if (metadata.some((item) => !item)) return;
  if (scoreType === "guitar_duo" && (metadata.some((item) => !item?.number || (!item.partNamePlaceholder && !item.partNameGuitar))
    || new Set(metadata.map((item) => item?.number)).size !== 2)) return;
  const software = Array.from(root.getElementsByTagName("software")).some((node) => /^Audiveris\s+\d/i.test(node.textContent?.trim() ?? ""));
  for (const item of metadata) {
    if (!item) continue;
    // A declared user profile plus an Audiveris instrument placeholder identifies conventional guitar notation.
    // Part names are labels only: a tempo such as "Lento." must not block the explicit profile.
    const body = direct(root, "part").find((part) => part.getAttribute("id") === item.part.getAttribute("id"));
    const clefs = body ? Array.from(body.getElementsByTagName("clef")) : [];
    const singleStaff = Boolean(body && Array.from(body.getElementsByTagName("staves")).every((node) => node.textContent?.trim() === "1")
      && Array.from(body.getElementsByTagName("staff")).every((node) => node.textContent?.trim() === "1"));
    const staffDetails = body ? Array.from(body.getElementsByTagName("staff-details")) : [];
    const hasTablature = staffDetails.some((details) => details.getElementsByTagName("staff-tuning").length > 0
      || Array.from(details.getElementsByTagName("staff-type")).some((node) => /tab/i.test(node.textContent?.trim() ?? ""))
      || Array.from(details.getElementsByTagName("staff-lines")).some((node) => Number(node.textContent?.trim()) > 5));
    const hasExplicitConflict = Boolean(body && (body.getElementsByTagName("transpose").length > 0
      || body.getElementsByTagName("octave-shift").length > 0
      || body.getElementsByTagName("unpitched").length > 0
      || body.getElementsByTagName("instrument-change").length > 0
      || hasTablature));
    const plainGStaff = Boolean(body && clefs.length && clefs.every((clef) => (!clef.hasAttribute("number") || clef.getAttribute("number") === "1")
      && textOf(clef, "sign") === "G" && textOf(clef, "line") === "2" && !clef.getElementsByTagName("clef-octave-change").length));
    // Keep the prior safe metadata labeling for an explicit Voice placeholder,
    // even when a source already carries a transpose. The existing transpose
    // remains byte-for-byte in place; only a strong no-conflict profile may add
    // the missing guitar octave declaration.
    const metadataStructureSafe = Boolean(body && software && item.instrumentPlaceholder && singleStaff && plainGStaff
      && !hasTablature && !root.getElementsByTagName("concert-score").length && !root.getElementsByTagName("for-part").length
      && !body.getElementsByTagName("octave-shift").length
      && !body.getElementsByTagName("unpitched").length
      && !body.getElementsByTagName("instrument-change").length);
    const strongProfile = metadataStructureSafe && !hasExplicitConflict;
    const knownPlaceholder = item.partNamePlaceholder || item.partNameGuitar;
    if (!strongProfile && !(knownPlaceholder && metadataStructureSafe)) continue;
    const label = scoreType === "guitar_duo" ? `Violão ${item.number}` : "Violão";
    item.nameElement.textContent = label;
    const abbreviation = direct(item.part, "part-abbreviation")[0];
    if (abbreviation && (scoreType === "guitar_solo" || /^voice(?: oohs)?(?: [12])?$/.test(canonicalName(abbreviation.textContent?.trim() ?? "")))) abbreviation.textContent = label;
    if (!metadataStructureSafe) continue;
    item.instrumentNameElement.textContent = "Acoustic Guitar (nylon)";
    if (item.sound) item.scoreInstrument.removeChild(item.sound);
    if (item.program) item.program.textContent = "25";
    else {
      const program = root.ownerDocument.createElement("midi-program");
      program.textContent = "25";
      const next = direct(item.midiInstrument, "volume")[0] ?? direct(item.midiInstrument, "pan")[0] ?? null;
      item.midiInstrument.insertBefore(program, next);
    }
    if (strongProfile) {
      const firstMeasure = direct(body!, "measure")[0];
      const attributes = firstMeasure && direct(firstMeasure, "attributes")[0];
      if (attributes && !body!.getElementsByTagName("transpose").length) {
        const transpose = root.ownerDocument.createElement("transpose");
        for (const [name, value] of [["diatonic", "0"], ["chromatic", "0"], ["octave-change", "-1"]]) {
          const element = root.ownerDocument.createElement(name); element.textContent = value; transpose.appendChild(element);
        }
        attributes.insertBefore(transpose, direct(attributes, "directive")[0] ?? direct(attributes, "measure-style")[0] ?? null);
        recordGuitarTransposition(root, body!.getAttribute("id") ?? "", scoreType);
      }
    }
  }
}

function recordGuitarTransposition(root: Element, partId: string, scoreType: ScoreType): void {
  const document = root.ownerDocument;
  const identification = getOrCreateIdentification(root);
  let miscellaneous = direct(identification, "miscellaneous")[0];
  if (!miscellaneous) { miscellaneous = document.createElement("miscellaneous"); identification.appendChild(miscellaneous); }
  const field = document.createElement("miscellaneous-field");
  field.setAttribute("name", "score-to-musicxml:guitar-transposition-v1");
  field.textContent = JSON.stringify({ partId, profile: scoreType, before: "undeclared", afterSemitones: -12,
    evidence: "explicit_user_profile_and_audiveris_voice_placeholder", writtenPitchesChanged: false });
  miscellaneous.appendChild(field);
}

export function mergeVerifiedPages(input: Array<{ page: number; xml: string }>, scoreType: ScoreType, coverage: ConversionCoverage, scoreTypeSelected = false): string {
  const inspected = input.map(({ page, xml }) => inspectMusicXml(xml, page, scoreType));
  if (!inspected.length) throw new AppError(422, "Nenhuma página reconhecida.", "OMR_ALL_PAGES_FAILED");
  const first = inspected[0].parsed;
  const baseline = first.parts;
  const root = first.document.documentElement;
  const serializer = new XMLSerializer();
  const firstMeasure = direct(baseline[0].element, "measure")[0];
  const measureStart = firstMeasure?.getAttribute("number") === "0" && firstMeasure.getAttribute("implicit") === "yes" ? 0 : 1;
  for (const destination of baseline) direct(destination.element, "measure").forEach((measure, index) => {
    removeRedundantChordBeams(measure);
    measure.setAttribute("number", String(index + measureStart));
  });
  for (const current of inspected.slice(1)) {
    const incoming = current.parsed.parts;
    if (incoming.length !== baseline.length) throw new AppError(422, "Partes instrumentais mudaram entre páginas.", "OMR_PART_INTEGRITY");
    const byName = new Map(incoming.map((part) => [part.key, part]));
    if (byName.size !== incoming.length || new Set(baseline.map((part) => part.key)).size !== baseline.length) {
      throw new AppError(422, "Identidade das partes entre páginas é ambígua.", "OMR_PART_IDENTITY_AMBIGUOUS");
    }
    for (const destination of baseline) {
      const source = byName.get(destination.key);
      if (!source || source.staves.join(",") !== destination.staves.join(",")) throw new AppError(422, "Uma parte ou pauta mudou entre páginas.", "OMR_PART_INTEGRITY");
      const destinationDeclaration = direct(root, "part-list")[0] && direct(direct(root, "part-list")[0], "score-part").find((part) => part.getAttribute("id") === destination.id);
      const sourceList = direct(current.parsed.document.documentElement, "part-list")[0];
      const sourceDeclaration = sourceList && direct(sourceList, "score-part").find((part) => part.getAttribute("id") === source.id);
      const destinationIds = destinationDeclaration ? direct(destinationDeclaration, "score-instrument").map((instrument) => instrument.getAttribute("id") ?? "") : [];
      const sourceIds = sourceDeclaration ? direct(sourceDeclaration, "score-instrument").map((instrument) => instrument.getAttribute("id") ?? "") : [];
      for (const measure of direct(source.element, "measure")) {
        const copy = first.document.importNode(measure, true) as Element;
        removeRedundantChordBeams(copy);
        const references = Array.from(copy.getElementsByTagName("note")).flatMap((note) => direct(note, "instrument"));
        if (references.length && (sourceIds.length !== 1 || destinationIds.length !== 1)) {
          throw new AppError(422, "Não é possível associar instrumentos de uma parte entre páginas com segurança.", "OMR_PART_INTEGRITY");
        }
        for (const reference of references) reference.setAttribute("id", destinationIds[0]);
        copy.setAttribute("number", String(direct(destination.element, "measure").length + measureStart));
        destination.element.appendChild(copy);
      }
    }
  }
  if (coverage.missingPages.length || coverage.uncertainPages?.length) {
    const credit = first.document.createElement("credit");
    credit.setAttribute("page", "1");
    const words = first.document.createElement("credit-words");
    const notes = [
      coverage.missingPages.length ? `páginas ausentes: ${coverage.missingPages.join(", ")}` : null,
      coverage.uncertainPages?.length ? `classificação pendente: ${coverage.uncertainPages.join(", ")}` : null
    ].filter(Boolean).join("; ");
    words.appendChild(first.document.createTextNode(`RESULTADO PARCIAL — ${notes}. Confira com o original.`));
    credit.appendChild(words);
    root.insertBefore(credit, direct(root, "part-list")[0] ?? root.firstChild);
  }
  if (scoreTypeSelected) labelSelectedGuitars(root, scoreType);
  recordCrossOctaveAccidental(root, addCrossOctaveAccidentals(root));
  return serializer.serializeToString(first.document);
}

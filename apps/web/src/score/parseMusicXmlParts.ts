/** The stable, display-safe metadata extracted from one MusicXML part. */
export type MusicXmlPart = {
  partId: string;
  order: number;
  label: string;
  instrumentName?: string;
  midiChannel?: number;
  midiProgram?: number;
  hasPlayableNotes: boolean;
};

export type MusicXmlParseErrorCode = "INVALID_MUSICXML";

export class MusicXmlParseError extends Error {
  readonly code: MusicXmlParseErrorCode;

  constructor(message = "O arquivo MusicXML está vazio ou inválido.") {
    super(message);
    this.name = "MusicXmlParseError";
    this.code = "INVALID_MUSICXML";
  }
}

const MAX_LABEL_LENGTH = 120;

function localName(element: Element): string {
  return (element.localName || element.tagName.split(":").pop() || "").toLowerCase();
}

function childrenByName(parent: Element, name: string): Element[] {
  return Array.from(parent.children).filter((child) => localName(child) === name);
}

function descendantsByName(parent: Element, name: string): Element[] {
  return Array.from(parent.getElementsByTagName("*"))
    .filter((element) => localName(element) === name);
}

function firstText(parent: Element, name: string): string | undefined {
  const element = descendantsByName(parent, name)[0];
  const value = element?.textContent?.replace(/\s+/g, " ").trim();
  return value || undefined;
}

function firstInteger(parent: Element, name: string): number | undefined {
  const text = firstText(parent, name);
  if (!text || !/^[+-]?\d+$/.test(text)) return undefined;
  const value = Number(text);
  return Number.isSafeInteger(value) ? value : undefined;
}

function normalizeMidiChannel(value: number | undefined): number | undefined {
  return value !== undefined && value >= 1 && value <= 16 ? value - 1 : undefined;
}

function normalizeMidiProgram(value: number | undefined): number | undefined {
  return value !== undefined && value >= 1 && value <= 128 ? value - 1 : undefined;
}

function safeLabel(partName: string | undefined, instrumentName: string | undefined, order: number): string {
  const source = partName || instrumentName || `Faixa ${order}`;
  // Text is rendered as text by the UI, nevertheless remove controls and cap
  // length here so malformed/hostile XML cannot create unusable labels.
  const clean = source.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  return (clean || `Faixa ${order}`).slice(0, MAX_LABEL_LENGTH).trim() || `Faixa ${order}`;
}

function hasPlayableNotes(part: Element): boolean {
  return descendantsByName(part, "note").some((note) => !descendantsByName(note, "rest").length);
}

/**
 * Reads the ordered score-part catalog without relying on a MusicXML prefix.
 * The parser deliberately returns every declared part; callers can use
 * `hasPlayableNotes` to build the reproducible subset.
 */
export function parseMusicXmlParts(musicXml: string): MusicXmlPart[] {
  if (typeof musicXml !== "string" || !musicXml.trim()) throw new MusicXmlParseError();

  const document = new DOMParser().parseFromString(musicXml, "application/xml");
  const root = document.documentElement;
  const parserError = Array.from(document.getElementsByTagName("parsererror")).length > 0;
  if (!root || parserError || !["score-partwise", "score-timewise"].includes(localName(root))) {
    throw new MusicXmlParseError();
  }

  const partList = descendantsByName(root, "part-list")[0];
  if (!partList) return [];
  const declarations = childrenByName(partList, "score-part");
  const scoreParts = descendantsByName(root, "part");
  return declarations.map((declaration, index) => {
    const partId = declaration.getAttribute("id")?.trim() || `part-${index + 1}`;
    const instrumentName = firstText(declaration, "instrument-name");
    const partName = firstText(declaration, "part-name");
    const midiInstrument = descendantsByName(declaration, "midi-instrument")[0] || declaration;
    const part = scoreParts.find((candidate) => candidate.getAttribute("id")?.trim() === partId);
    return {
      partId,
      order: index,
      label: safeLabel(partName, instrumentName, index + 1),
      ...(instrumentName ? { instrumentName } : {}),
      ...(normalizeMidiChannel(firstInteger(midiInstrument, "midi-channel")) !== undefined
        ? { midiChannel: normalizeMidiChannel(firstInteger(midiInstrument, "midi-channel")) } : {}),
      ...(normalizeMidiProgram(firstInteger(midiInstrument, "midi-program")) !== undefined
        ? { midiProgram: normalizeMidiProgram(firstInteger(midiInstrument, "midi-program")) } : {}),
      hasPlayableNotes: part ? hasPlayableNotes(part) : false
    };
  });
}

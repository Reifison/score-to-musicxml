import { DOMParser } from "@xmldom/xmldom";
import { inspectMusicXmlRhythm } from "./MusicXmlRhythm.js";
import { inspectMusicXmlVoiceRhythm, type VoiceCheck } from "./MusicXmlVoiceRhythm.js";
import { inspectMusicXmlNotationIntegrity } from "./MusicXmlNotationIntegrity.js";

export type MusicXmlValidationIssue = {
  code: string;
  severity: "warning" | "error";
  message: string;
  partId?: string;
  partName?: string;
  measure?: string;
  page?: number;
  staff?: number;
  voice?: string;
  differences?: string[];
  candidateIds?: number[];
};

export type MusicXmlValidation = {
  version: 1;
  issues: MusicXmlValidationIssue[];
  checkedMeasures: number;
  skippedMeasures: number;
  voiceCheckedMeasures: number;
  voiceSkippedMeasures: number;
  voiceChecks: VoiceCheck[];
  requiresReview: boolean;
  limitations: string[];
};

const children = (parent: Node, name: string): Element[] => Array.from(parent.childNodes)
  .filter((node): node is Element => node.nodeType === 1 && ((node as Element).localName || node.nodeName) === name);
const descendants = (parent: Element, name: string): Element[] => Array.from(parent.getElementsByTagName(name));
const label = (value: string): string => value.trim().toLowerCase();
const pitchLimit = "As alturas e a correspondência das notas com a imagem original não foram verificadas.";

/** Read only the version declared by the generated MusicXML, never a configured or assumed version. */
export function audiverisVersionOf(xml: string): string | null {
  try {
    const document = new DOMParser().parseFromString(xml, "application/xml");
    const versions = Array.from(document.getElementsByTagName("encoding"))
      .flatMap((encoding) => Array.from(encoding.getElementsByTagName("software")))
      .map((software) => software.textContent?.trim().match(/^Audiveris\s+(\d+(?:\.\d+){1,3}(?:[-+.][A-Za-z0-9]+)*)$/i)?.[1] ?? null)
      .filter((version): version is string => version !== null);
    return versions.length && new Set(versions).size === 1 ? versions[0] : null;
  } catch { return null; }
}

/** Internal MusicXML consistency only; never an estimate of transcription accuracy. */
export function inspectMusicXmlValidation(xml: string, options: { scope?: "score" | "page" } = {}): MusicXmlValidation {
  const pageFragment = options.scope === "page";
  const rhythm = inspectMusicXmlRhythm(xml);
  const voiceRhythm = inspectMusicXmlVoiceRhythm(xml);
  const issues: MusicXmlValidationIssue[] = rhythm.issues.map((issue) => ({
    code: issue.kind === "invalid-position" ? "RHYTHM_INVALID_POSITION" : issue.kind === "short" ? "RHYTHM_SHORT" : "RHYTHM_LONG",
    severity: "warning",
    message: issue.kind === "invalid-position"
      ? `Compasso ${issue.measure}: há vozes antes do início do compasso; confira a fonte.`
      : `Compasso ${issue.measure}: duração ${issue.actualQuarterBeats} de ${issue.expectedQuarterBeats} tempos de semínima; confira a fonte.`,
    partId: issue.partId,
    measure: issue.measure
  }));
  issues.push(...voiceRhythm.issues);
  const parseErrors: string[] = [];
  let document: Document | undefined;
  try {
    document = new DOMParser({ errorHandler: {
      warning: (message) => parseErrors.push(String(message)),
      error: (message) => parseErrors.push(String(message)),
      fatalError: (message) => parseErrors.push(String(message))
    } }).parseFromString(xml, "application/xml");
  } catch { parseErrors.push("parse-failed"); }
  const root = document?.documentElement;
  if (parseErrors.length || !root || (root.localName || root.nodeName) !== "score-partwise") {
    issues.push({ code: "XML_UNREADABLE", severity: "error", message: "O MusicXML não pôde ser analisado para validação interna." });
    return { version: 1, issues, checkedMeasures: rhythm.checkedMeasures, skippedMeasures: rhythm.skippedMeasures,
      voiceCheckedMeasures: voiceRhythm.checkedMeasures, voiceSkippedMeasures: voiceRhythm.skippedMeasures, voiceChecks: voiceRhythm.voiceChecks,
      requiresReview: true, limitations: [pitchLimit] };
  }

  const parts = children(root, "part");
  issues.push(...inspectMusicXmlNotationIntegrity(document!, options));
  const accidentalSemitones: Record<string, number> = {
    natural: 0, sharp: 1, flat: -1, "double-sharp": 2, "sharp-sharp": 2, "flat-flat": -2,
    "natural-sharp": 1, "natural-flat": -1
  };
  for (const part of parts) for (const measure of children(part, "measure")) for (const note of children(measure, "note")) {
    const pitch = children(note, "pitch")[0];
    const accidental = children(note, "accidental")[0]?.textContent?.trim() ?? "";
    if (!pitch || !Object.hasOwn(accidentalSemitones, accidental)) continue;
    const alter = Number(children(pitch, "alter")[0]?.textContent?.trim() ?? "0");
    if (!Number.isFinite(alter) || alter === accidentalSemitones[accidental]) continue;
    issues.push({ code: "ACCIDENTAL_PITCH_CONFLICT", severity: "warning", partId: part.getAttribute("id") ?? undefined,
      measure: measure.getAttribute("number") ?? "?", voice: children(note, "voice")[0]?.textContent?.trim() || "1",
      staff: Number(children(note, "staff")[0]?.textContent ?? "1"),
      message: "O acidente impresso e a alteração da altura codificada discordam; confira a nota na fonte antes de editar." });
  }
  for (const field of descendants(root, "miscellaneous-field")) if (field.getAttribute("name") === "score-to-musicxml:guitar-transposition-v1") {
    issues.push({ code: "GUITAR_TRANSPOSITION_NORMALIZED", severity: "warning",
      message: "A oitava sonora do violão foi declarada pelo perfil escolhido e metadados Audiveris; as alturas escritas foram preservadas. Confira a convenção na fonte." });
  }
  if (!parts.some((part) => children(part, "measure").length > 0)) issues.push({ code: "ZERO_MEASURES", severity: "error", message: "O MusicXML não contém compassos em partes instrumentais." });
  const globalSegnos = new Map<string, Set<string>>();
  let globalFineCount = 0;
  for (const part of parts) for (const measure of children(part, "measure")) {
    const number = measure.getAttribute("number") || "?";
    for (const sound of descendants(measure, "sound")) {
      const segno = label(sound.getAttribute("segno") ?? "");
      if (segno) globalSegnos.set(segno, new Set([...(globalSegnos.get(segno) ?? []), number]));
      const fine = label(sound.getAttribute("fine") ?? "");
      if (fine && fine !== "no") globalFineCount++;
    }
  }
  let explicitPickups = 0;
  for (const part of parts) {
    const partId = part.getAttribute("id") ?? undefined;
    const measures = children(part, "measure");
    const openEndings = new Map<string, string>();
    let forwardRepeat: string | undefined;
    const dalSegnos: Array<{ target: string; measure: string; alFine: boolean }> = [];

    for (const measure of measures) {
      const number = measure.getAttribute("number") || "?";
      if (measure.getAttribute("implicit") === "yes" && measure.getAttribute("number") === "0") explicitPickups++;

      // MusicXML barlines may occur on either edge of a measure; preserve their document order.
      for (const barline of children(measure, "barline")) {
        for (const ending of children(barline, "ending")) {
          const key = label(ending.getAttribute("number") ?? "");
          const type = ending.getAttribute("type");
          if (!key) {
            issues.push({ code: "ENDING_NUMBER_MISSING", severity: "warning", message: `Casa de repetição sem número no compasso ${number}.`, partId, measure: number });
            continue;
          }
          if (type === "start") {
            if (openEndings.has(key)) issues.push({ code: "ENDING_START_DUPLICATE", severity: "warning", message: `Casa ${key} iniciada novamente sem fechamento no compasso ${number}.`, partId, measure: number });
            openEndings.set(key, number);
          } else if (type === "stop" || type === "discontinue") {
            if (!openEndings.delete(key) && !pageFragment) issues.push({ code: "ENDING_CLOSE_WITHOUT_START", severity: "warning", message: `Casa ${key} encerrada sem início no compasso ${number}.`, partId, measure: number });
          }
        }
        for (const repeat of children(barline, "repeat")) {
          const direction = repeat.getAttribute("direction");
          if (direction === "forward") {
            if (forwardRepeat) issues.push({ code: "REPEAT_FORWARD_NESTED", severity: "warning", message: `Repetição iniciada no compasso ${number} antes do fechamento da iniciada em ${forwardRepeat}.`, partId, measure: number });
            forwardRepeat = number;
          } else if (direction === "backward") {
            // A backward repeat without a forward marker means repeat from the beginning.
            forwardRepeat = undefined;
          }
        }
      }
      for (const sound of descendants(measure, "sound")) {
        const dalSegno = label(sound.getAttribute("dalsegno") ?? "");
        const directionWords = sound.parentNode?.nodeType === 1
          ? descendants(sound.parentNode as Element, "words").map((word) => word.textContent ?? "").join(" ")
          : "";
        if (dalSegno) dalSegnos.push({ target: dalSegno, measure: number, alFine: /\b(?:d\s*\.?\s*s\s*\.?|dal\s+segno)\s*al\s+fine\b/i.test(directionWords) });
      }
    }
    if (!pageFragment) {
      for (const [number, start] of openEndings) issues.push({ code: "ENDING_UNCLOSED", severity: "warning", message: `Casa ${number} iniciada no compasso ${start} sem stop/discontinue.`, partId, measure: start });
      if (forwardRepeat) issues.push({ code: "REPEAT_FORWARD_UNCLOSED", severity: "warning", message: `Repetição iniciada no compasso ${forwardRepeat} sem retorno.`, partId, measure: forwardRepeat });
    }
    for (const { target, measure, alFine } of dalSegnos) {
      const matching = globalSegnos.get(target) ?? new Set<string>();
      if (matching.size > 1 || (!pageFragment && matching.size === 0)) issues.push({
        code: matching.size ? "DAL_SEGNO_AMBIGUOUS" : "DAL_SEGNO_TARGET_MISSING",
        severity: "warning",
        message: matching.size ? `D.S. do compasso ${measure} encontra mais de um segno ${target}.` : `D.S. do compasso ${measure} não encontra segno ${target}.`,
        partId,
        measure
      });
      if (!pageFragment && alFine && globalFineCount === 0) issues.push({ code: "DAL_SEGNO_FINE_MISSING", severity: "warning", message: `D.S. al Fine do compasso ${measure} não encontra marca Fine codificada.`, partId, measure });
    }
  }
  if (rhythm.skippedMeasures > explicitPickups) issues.push({
    code: "RHYTHM_UNCHECKED",
    severity: "warning",
    message: `${rhythm.skippedMeasures - explicitPickups} compasso(s) ficaram sem verificação rítmica além de anacruses explícitas.`
  });
  return {
    version: 1,
    issues,
    checkedMeasures: rhythm.checkedMeasures,
    skippedMeasures: rhythm.skippedMeasures,
    voiceCheckedMeasures: voiceRhythm.checkedMeasures,
    voiceSkippedMeasures: voiceRhythm.skippedMeasures,
    voiceChecks: voiceRhythm.voiceChecks,
    requiresReview: issues.length > 0 || rhythm.skippedMeasures > explicitPickups,
    limitations: [pitchLimit, ...(pageFragment ? ["Referências de navegação entre páginas serão verificadas após a junção."] : [])]
  };
}

import type { MusicXmlValidationIssue } from "./MusicXmlValidation.js";

type IntegrityOptions = { scope?: "score" | "page" };

type NoteEvent = {
  partId: string;
  partName?: string;
  measure: string;
  onset: number | null;
  voice: string | null;
  staff: number | null;
  pitch: string | null;
  durationUnits: number | null;
  grace: boolean;
  soundTies: Set<string>;
  notationTies: Set<string>;
};

type OpenTie = {
  event: NoteEvent;
  pitch: string;
};

const elementName = (node: Element): string => node.localName || node.nodeName;

const direct = (parent: Node, name: string): Element[] => Array.from(parent.childNodes)
  .filter((node): node is Element => node.nodeType === 1 && elementName(node as Element) === name);

const descendants = (parent: Node, name: string): Element[] => {
  const result: Element[] = [];
  for (const node of Array.from(parent.childNodes)) {
    if (node.nodeType !== 1) continue;
    const element = node as Element;
    if (elementName(element) === name) result.push(element);
    result.push(...descendants(element, name));
  }
  return result;
};

const firstDirect = (parent: Node, name: string): Element | undefined => direct(parent, name)[0];

const textOf = (parent: Node, name: string): string => firstDirect(parent, name)?.textContent?.trim() ?? "";

const numberOf = (value: string): number | null => {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};

const positiveNumberOf = (value: string): number | null => {
  const number = numberOf(value);
  return number !== null && number > 0 ? number : null;
};

const displayContext = (event: { measure: string; partId: string; partName?: string }): string =>
  `Parte ${event.partName || event.partId}, compasso ${event.measure}`;

const issue = (
  code: string,
  message: string,
  context: { partId?: string; partName?: string; measure?: string; staff?: number; voice?: string }
): MusicXmlValidationIssue => ({ code, severity: "warning", message, ...context });

function noteVoice(note: Element): string {
  return textOf(note, "voice") || "1";
}

function noteStaff(note: Element): number | null {
  const value = textOf(note, "staff");
  if (!value) return 1;
  const staff = Number(value);
  return Number.isInteger(staff) && staff > 0 ? staff : null;
}

function notePitch(note: Element): string | null {
  const pitch = firstDirect(note, "pitch");
  if (!pitch) return null;
  const step = textOf(pitch, "step");
  const octave = textOf(pitch, "octave");
  if (!step || !octave) return null;
  return `${step}|${textOf(pitch, "alter") || "0"}|${octave}`;
}

function tieTypes(note: Element, name: "tie" | "tied"): Set<string> {
  const elements = name === "tie" ? direct(note, name) : descendants(note, name);
  return new Set(elements
    .map((element) => element.getAttribute("type")?.trim().toLowerCase() ?? "")
    .filter((type) => type === "start" || type === "stop"));
}

function navigationTokens(text: string): string[] {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase()
    .replace(/[^a-z]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function hasTokenSequence(tokens: string[], ...sequence: string[]): boolean {
  return tokens.some((_, index) => sequence.every((token, offset) => tokens[index + offset] === token));
}

function hasEnabledAttribute(element: Element, name: string): boolean {
  const value = element.getAttribute(name)?.trim().toLowerCase() ?? "";
  return value !== "" && !["no", "false", "0"].includes(value);
}

function navigationWordsIssue(
  code: string,
  text: string,
  partId: string,
  partName: string | undefined,
  measure: string
): MusicXmlValidationIssue {
  return issue(code, `${displayContext({ partId, partName, measure })}: a indicação textual “${text.trim()}” não está codificada no MusicXML.`, {
    partId,
    partName,
    measure
  });
}

function inspectNavigation(
  direction: Element,
  partId: string,
  partName: string | undefined,
  measure: string,
  pageFragment: boolean,
  fineEncoded: boolean
): MusicXmlValidationIssue[] {
  const words = descendants(direction, "words").map((element) => element.textContent ?? "").join(" ").trim();
  if (!words) return [];

  const tokens = navigationTokens(words);
  const hasDaCapo = tokens.includes("dacapo") || hasTokenSequence(tokens, "d", "c") || hasTokenSequence(tokens, "da", "capo");
  const hasDalSegno = tokens.includes("dalsegno") || hasTokenSequence(tokens, "d", "s") || hasTokenSequence(tokens, "dal", "segno");
  const hasAlFine = tokens.includes("alfine") || hasTokenSequence(tokens, "al", "fine");
  if (!hasDaCapo && !hasDalSegno) return [];

  const sounds = descendants(direction, "sound");
  const issues: MusicXmlValidationIssue[] = [];
  if (hasDaCapo && !sounds.some((sound) => hasEnabledAttribute(sound, "dacapo"))) {
    issues.push(navigationWordsIssue("NAVIGATION_WORDS_UNENCODED", words, partId, partName, measure));
  }
  if (hasDalSegno && !sounds.some((sound) => hasEnabledAttribute(sound, "dalsegno"))) {
    issues.push(navigationWordsIssue("NAVIGATION_WORDS_UNENCODED", words, partId, partName, measure));
  }
  if (!pageFragment && hasDaCapo && hasAlFine && !fineEncoded) {
    issues.push(issue(
      "DA_CAPO_FINE_MISSING",
      `${displayContext({ partId, partName, measure })}: D.C. al Fine não encontra uma marca Fine codificada.`,
      { partId, partName, measure }
    ));
  }
  return issues;
}

function streamKey(event: NoteEvent): string | null {
  if (!event.voice || event.staff === null) return null;
  return `${event.partId}\0${event.staff}\0${event.voice}`;
}

function tiePairIssues(
  event: NoteEvent,
  openTies: Map<string, OpenTie[]>,
  pageFragment: boolean
): MusicXmlValidationIssue[] {
  if (event.onset === null || !event.pitch) return [];
  const key = streamKey(event);
  if (!key) return [];

  const types = new Set([...event.soundTies, ...event.notationTies]);
  if (!types.size) return [];
  const queue = openTies.get(key) ?? [];
  const issues: MusicXmlValidationIssue[] = [];
  if (types.has("stop")) {
    const exactIndex = queue.findIndex((open) => open.pitch === event.pitch);
    if (exactIndex >= 0) {
      queue.splice(exactIndex, 1);
    } else if (queue.length === 1) {
      issues.push(issue(
        "TIE_END_PITCH_MISMATCH",
        `${displayContext(event)}: o fim da ligadura está em outra altura que o início.`,
        { partId: event.partId, partName: event.partName, measure: event.measure, staff: event.staff ?? undefined, voice: event.voice ?? undefined }
      ));
      queue.splice(0, 1);
    } else if (queue.length === 0 && !pageFragment) {
      issues.push(issue(
        "TIE_ORPHAN",
        `${displayContext(event)}: ligadura terminada sem início verificável.`,
        { partId: event.partId, partName: event.partName, measure: event.measure, staff: event.staff ?? undefined, voice: event.voice ?? undefined }
      ));
    }
  }
  if (types.has("start")) queue.push({ event, pitch: event.pitch });
  if (queue.length) openTies.set(key, queue);
  else openTies.delete(key);
  return issues;
}

function closeOpenTies(
  openTies: Map<string, OpenTie[]>,
  pageFragment: boolean
): MusicXmlValidationIssue[] {
  if (pageFragment) return [];
  const issues: MusicXmlValidationIssue[] = [];
  for (const queue of openTies.values()) {
    for (const open of queue) {
      issues.push(issue(
        "TIE_ORPHAN",
        `${displayContext(open.event)}: ligadura iniciada sem fim verificável.`,
        { partId: open.event.partId, partName: open.event.partName, measure: open.event.measure, staff: open.event.staff ?? undefined, voice: open.event.voice ?? undefined }
      ));
    }
  }
  return issues;
}

/**
 * Read-only checks for notation structures beyond the existing rhythm
 * validators. The DOM is never modified and unknown MusicXML symbols are ignored.
 */
export function inspectMusicXmlNotationIntegrity(
  document: Document,
  options: IntegrityOptions = {}
): MusicXmlValidationIssue[] {
  const root = document.documentElement;
  if (!root || elementName(root) !== "score-partwise") return [];

  const pageFragment = options.scope === "page";
  const partNames = new Map(descendants(root, "score-part")
    .map((part) => [part.getAttribute("id") ?? "", textOf(part, "part-name")]));
  const fineEncoded = descendants(root, "sound").some((sound) => hasEnabledAttribute(sound, "fine"));
  const issues: MusicXmlValidationIssue[] = [];

  for (const part of direct(root, "part")) {
    const partId = part.getAttribute("id") ?? "";
    const partName = partNames.get(partId) || undefined;
    let divisions: number | null = null;
    const openTies = new Map<string, OpenTie[]>();

    for (const measure of direct(part, "measure")) {
      const measureNumber = measure.getAttribute("number") || "?";
      let cursor = 0;
      let cursorKnown = true;
      let chordAnchor: NoteEvent | null = null;

      for (const element of Array.from(measure.childNodes).filter((node): node is Element => node.nodeType === 1)) {
        const name = elementName(element);
        if (name === "attributes") {
          const nextDivisions = positiveNumberOf(textOf(element, "divisions"));
          if (nextDivisions !== null) divisions = nextDivisions;
          chordAnchor = null;
          continue;
        }

        if (name === "backup" || name === "forward") {
          const units = numberOf(textOf(element, "duration"));
          const delta = units !== null && divisions !== null ? units / divisions : null;
          if (delta === null || !cursorKnown) cursorKnown = false;
          else cursor += name === "backup" ? -delta : delta;
          chordAnchor = null;
          continue;
        }

        if (name === "direction") {
          issues.push(...inspectNavigation(element, partId, partName, measureNumber, pageFragment, fineEncoded));
          continue;
        }

        if (name !== "note") {
          // Layout, direction, and extension elements do not consume onset and
          // may legally occur between the notes in a chord group.
          continue;
        }

        const grace = direct(element, "grace").length > 0;
        const chord = direct(element, "chord").length > 0;
        const durationText = textOf(element, "duration");
        const durationUnits = numberOf(durationText);
        const onset = cursorKnown ? cursor : null;
        const event: NoteEvent = {
          partId,
          partName,
          measure: measureNumber,
          onset,
          voice: noteVoice(element),
          staff: noteStaff(element),
          pitch: notePitch(element),
          durationUnits,
          grace,
          soundTies: tieTypes(element, "tie"),
          notationTies: tieTypes(element, "tied")
        };

        if (grace && durationUnits !== null && durationUnits > 0) {
          issues.push(issue(
            "GRACE_METRIC_DURATION",
            `${displayContext(event)}: nota de graça contém duração métrica ${durationText}; a duração deve permanecer ausente.`,
            { partId, partName, measure: measureNumber, staff: event.staff ?? undefined, voice: event.voice ?? undefined }
          ));
        }

        if (event.soundTies.size || event.notationTies.size) {
          const sound = [...event.soundTies].sort().join(",");
          const notation = [...event.notationTies].sort().join(",");
          if (sound !== notation) {
            issues.push(issue(
              "TIE_SOUND_NOTATION_MISMATCH",
              `${displayContext(event)}: as marcações tie e tied não têm os mesmos tipos (${sound || "ausente"} / ${notation || "ausente"}).`,
              { partId, partName, measure: measureNumber, staff: event.staff ?? undefined, voice: event.voice ?? undefined }
            ));
          }
          issues.push(...tiePairIssues(event, openTies, pageFragment));
        }

        if (chord) {
          if (!chordAnchor) {
            issues.push(issue(
              "CHORD_UNANCHORED",
              `${displayContext(event)}: membro de acorde não tem uma nota-âncora imediatamente anterior.`,
              { partId, partName, measure: measureNumber, staff: event.staff ?? undefined, voice: event.voice ?? undefined }
            ));
          } else {
            if (event.voice !== chordAnchor.voice) {
              issues.push(issue(
                "CHORD_CROSS_VOICE_STAFF",
                `${displayContext(event)}: membro de acorde muda de voz em relação à âncora.`,
                { partId, partName, measure: measureNumber, staff: event.staff ?? undefined, voice: event.voice ?? undefined }
              ));
            }
            if (event.grace !== chordAnchor.grace) {
              issues.push(issue(
                "CHORD_GRACE_ANCHOR_MISMATCH",
                `${displayContext(event)}: membro de acorde de graça e âncora não têm o mesmo tipo.`,
                { partId, partName, measure: measureNumber, staff: event.staff ?? undefined, voice: event.voice ?? undefined }
              ));
            }
            if (!event.grace && !chordAnchor.grace && event.durationUnits !== null && chordAnchor.durationUnits !== null && event.durationUnits > chordAnchor.durationUnits) {
              issues.push(issue(
                "CHORD_MEMBER_DURATION_EXCEEDS_ANCHOR",
                `${displayContext(event)}: a duração do membro de acorde excede a duração da nota-âncora.`,
                { partId, partName, measure: measureNumber, staff: event.staff ?? undefined, voice: event.voice ?? undefined }
              ));
            }
          }
        } else {
          chordAnchor = event;
        }

        if (!chord && !grace) {
          const delta = durationUnits !== null && divisions !== null ? durationUnits / divisions : null;
          if (delta === null || !cursorKnown) cursorKnown = false;
          else cursor += delta;
        }
      }
    }
    issues.push(...closeOpenTies(openTies, pageFragment));
  }

  return issues;
}

import { createHash } from "node:crypto";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

const MIDI_ACCIDENTAL_PROVENANCE = "score-to-musicxml:midi-accidental-guard-v1";

const directChildren = (parent: Node, name: string): Element[] =>
  Array.from(parent.childNodes).filter((node): node is Element => node.nodeType === 1 && node.nodeName === name);

const accidentalForAlter = (alter: number): string | undefined => {
  if (alter === -2) return "flat-flat";
  if (alter === -1) return "flat";
  if (alter === 0) return "natural";
  if (alter === 1) return "sharp";
  if (alter === 2) return "double-sharp";
  return undefined;
};

const isMatchingAccidental = (value: string, expected: string): boolean => {
  const normalized = value.trim().toLowerCase();
  if (normalized === expected) return true;
  // "double-flat" was emitted by an older render-copy revision. It is
  // accepted as a legacy input alias, then canonicalized below for XSD output.
  if (expected === "flat-flat" && normalized === "double-flat") return true;
  return false;
};

function decorateRenderAccidentals(document: Document): { changed: number; eligible: number } {
  let changed = 0;
  let eligible = 0;
  for (const note of Array.from(document.getElementsByTagName("note"))) {
    // Grace-note accidentals are renderer-specific ornaments; leave them untouched.
    if (directChildren(note, "grace").length > 0) continue;
    const pitch = directChildren(note, "pitch")[0];
    if (!pitch) continue;
    const alterElement = directChildren(pitch, "alter")[0];
    const rawAlter = alterElement?.textContent?.trim() ?? "";
    if (alterElement && !rawAlter) continue;
    const alter = alterElement ? Number(rawAlter) : 0;
    if (!Number.isFinite(alter) || !Number.isInteger(alter)) continue;
    const expected = accidentalForAlter(alter);
    // Microtones and accidentals outside the standard MusicXML set remain untouched.
    if (!expected) continue;
    eligible += 1;
    const existing = directChildren(note, "accidental")[0];
    if (existing) {
      if (expected === "flat-flat" && existing.textContent?.trim().toLowerCase() === "double-flat") {
        existing.textContent = expected;
        changed += 1;
        continue;
      }
      if (!isMatchingAccidental(existing.textContent ?? "", expected)) {
        existing.textContent = expected;
        changed += 1;
      }
      continue;
    }
    const accidental = document.createElement("accidental");
    accidental.textContent = expected;
    const before = ["time-modification", "stem", "notehead", "notehead-text", "staff", "beam", "notations", "lyric", "play", "listen"]
      .map((name) => directChildren(note, name)[0]).find((element): element is Element => Boolean(element));
    note.insertBefore(accidental, before ?? null);
    changed += 1;
  }
  return { changed, eligible };
}

function recordAccidentalProvenance(document: Document, stats: { changed: number; eligible: number }): void {
  if (stats.eligible === 0) return;
  const existing = Array.from(document.getElementsByTagName("miscellaneous-field"))
    .find((field) => field.getAttribute("name") === MIDI_ACCIDENTAL_PROVENANCE);
  if (existing) return;
  let identification = document.getElementsByTagName("identification").item(0);
  if (!identification) {
    identification = document.createElement("identification");
    const root = document.documentElement;
    // MusicXML keeps identification before defaults/credit/part-list/part.
    // Insert before the earliest of those direct children so existing headers
    // retain their schema order instead of placing identification after them.
    const insertionBefore = root
      ? ["defaults", "credit", "part-list", "part"]
        .flatMap((name) => directChildren(root, name))
        .sort((left, right) => {
          const leftIndex = Array.prototype.indexOf.call(root.childNodes, left);
          const rightIndex = Array.prototype.indexOf.call(root.childNodes, right);
          return leftIndex - rightIndex;
        })[0]
      : null;
    root?.insertBefore(identification, insertionBefore ?? null);
  }
  let miscellaneous = directChildren(identification, "miscellaneous")[0];
  if (!miscellaneous) {
    miscellaneous = document.createElement("miscellaneous");
    identification.appendChild(miscellaneous);
  }
  const field = document.createElement("miscellaneous-field");
  field.setAttribute("name", MIDI_ACCIDENTAL_PROVENANCE);
  field.textContent = JSON.stringify({
    renderCopyOnly: true,
    pitchAlterAuthoritative: true,
    standardAccidentals: ["flat-flat", "flat", "natural", "sharp", "double-sharp"],
    notesChecked: stats.eligible,
    notesAdjusted: stats.changed
  });
  miscellaneous.appendChild(field);
}

/** Render-only IDs establish note identity without using a renderer's pitch as evidence.
 * The authoritative export and its revision hash remain untouched.
 */
export function identifyMusicXmlNotesForMidi(xml: string): string {
  const errors: string[] = [];
  const document = new DOMParser({ errorHandler: {
    warning: (message) => errors.push(String(message)),
    error: (message) => errors.push(String(message)),
    fatalError: (message) => errors.push(String(message))
  } }).parseFromString(xml, "application/xml");
  if (errors.length || document.documentElement?.nodeName !== "score-partwise") throw new Error("Invalid source MusicXML identity");
  const used = new Set<string>();
  for (const element of Array.from(document.getElementsByTagName("*"))) {
    const id = element.getAttribute("id") || element.getAttribute("xml:id");
    if (!id) continue;
    used.add(id);
  }
  const noteIds = new Set<string>();
  for (const note of Array.from(document.getElementsByTagName("note"))) {
    const id = note.getAttribute("id") || note.getAttribute("xml:id");
    if (note.getAttribute("id") && note.getAttribute("xml:id") && note.getAttribute("id") !== note.getAttribute("xml:id")) {
      throw new Error("Conflicting source MusicXML note identity");
    }
    if (!id) continue;
    if (noteIds.has(id)) throw new Error("Duplicate source MusicXML note identity");
    noteIds.add(id);
  }
  const prefix = `midi-src-${createHash("sha256").update(xml).digest("hex").slice(0, 16)}`;
  Array.from(document.getElementsByTagName("note")).forEach((note, index) => {
    if (note.getAttribute("id")) {
      note.removeAttribute("xml:id");
      return;
    }
    if (note.getAttribute("xml:id")) {
      note.setAttribute("id", note.getAttribute("xml:id")!);
      note.removeAttribute("xml:id");
      return;
    }
    let id = `${prefix}-n${index}`;
    while (used.has(id)) id += "x";
    note.setAttribute("id", id); used.add(id);
  });
  const accidentalStats = decorateRenderAccidentals(document);
  recordAccidentalProvenance(document, accidentalStats);
  return new XMLSerializer().serializeToString(document);
}

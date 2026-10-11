import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DOMParser } from "@xmldom/xmldom";
// Verovio 6 publishes JavaScript ESM entrypoints without TypeScript declarations.
// @ts-expect-error -- runtime entrypoint declared in package exports
import { VerovioToolkit } from "verovio/esm";
// @ts-expect-error -- runtime entrypoint declared in package exports
import createVerovioModule from "verovio/wasm";
import { identifyMusicXmlNotesForMidi } from "../utils/musicXmlMidiIdentity.js";

let verovioModule: Promise<unknown> | undefined;

async function renderMidi(xml: string): Promise<Buffer> {
  verovioModule ??= createVerovioModule();
  const toolkit = new VerovioToolkit(await verovioModule);
  try {
    toolkit.setOptions({ breaks: "none", inputFrom: "xml" });
    expect(toolkit.loadData(xml)).toBeTruthy();
    return Buffer.from(toolkit.renderToMIDI().replaceAll(/\s/g, ""), "base64");
  } finally {
    toolkit.destroy();
  }
}

function readVlq(buffer: Buffer, offset: number): { value: number; next: number } {
  let value = 0;
  let next = offset;
  do {
    const byte = buffer[next++];
    if (byte === undefined) throw new Error("MIDI VLQ truncado");
    value = (value << 7) | (byte & 0x7f);
    if (next - offset > 4) throw new Error("MIDI VLQ inválido");
    if (!(byte & 0x80)) return { value, next };
  } while (next < buffer.length);
  throw new Error("MIDI VLQ truncado");
}

function noteOnsAt(buffer: Buffer, targetTick: number): number[] {
  const pitches: number[] = [];
  let offset = 14;
  while (offset + 8 <= buffer.length) {
    if (buffer.toString("ascii", offset, offset + 4) !== "MTrk") throw new Error("MIDI track inválida");
    const length = buffer.readUInt32BE(offset + 4);
    const end = offset + 8 + length;
    let cursor = offset + 8;
    let tick = 0;
    let runningStatus = 0;
    while (cursor < end) {
      const delta = readVlq(buffer, cursor);
      cursor = delta.next;
      tick += delta.value;
      let status = buffer[cursor++];
      if (status === undefined) throw new Error("MIDI status truncado");
      if (status < 0x80) {
        cursor -= 1;
        status = runningStatus;
      } else if (status < 0xf0) {
        runningStatus = status;
      }
      if (status === 0xff) {
        cursor += 1;
        const size = readVlq(buffer, cursor);
        cursor = size.next + size.value;
      } else if (status === 0xf0 || status === 0xf7) {
        const size = readVlq(buffer, cursor);
        cursor = size.next + size.value;
      } else {
        const type = status & 0xf0;
        const dataLength = type === 0xc0 || type === 0xd0 ? 1 : 2;
        const pitch = buffer[cursor];
        const velocity = dataLength === 2 ? buffer[cursor + 1] : undefined;
        if (type === 0x90 && velocity && tick === targetTick && pitch !== undefined) pitches.push(pitch);
        cursor += dataLength;
      }
    }
    offset = end;
  }
  return pitches;
}

describe("MIDI source note identity", () => {
  it("places render accidentals before notehead text and listen, and uses one ID attribute", () => {
    for (const tail of ['<notehead-text><display-text>x</display-text></notehead-text>', '<listen><wait/></listen>']) {
      const xml = `<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Teste</part-name></score-part></part-list><part id="P1"><measure number="1"><note xml:id="source-note"><pitch><step>E</step><alter>-2</alter><octave>4</octave></pitch><duration>1</duration><type>quarter</type>${tail}</note></measure></part></score-partwise>`;
      const copy = identifyMusicXmlNotesForMidi(xml);
      const note = new DOMParser().parseFromString(copy, "application/xml").getElementsByTagName("note").item(0)!;
      const names = Array.from(note.childNodes).filter((node) => node.nodeType === 1).map((node) => node.nodeName);
      expect(names).toEqual(["pitch", "duration", "type", "accidental", tail.includes("notehead-text") ? "notehead-text" : "listen"]);
      expect(note.getAttribute("id")).toBe("source-note");
      expect(note.hasAttribute("xml:id")).toBe(false);
      expect(note.getElementsByTagName("accidental").item(0)?.textContent).toBe("flat-flat");
      expect(xml).toContain('xml:id="source-note"');
      expect(xml).not.toContain("<accidental>");
    }
  });
  const source = '<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><note id="existing"><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note><note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration></note><note><grace/><pitch><step>G</step><octave>4</octave></pitch></note></measure></part></score-partwise>';
  it("adds deterministic unique IDs only in the render copy and preserves note contents", () => {
    const identified = identifyMusicXmlNotesForMidi(source);
    expect(identified).toEqual(identifyMusicXmlNotesForMidi(source));
    const before = new DOMParser().parseFromString(source, "application/xml");
    const after = new DOMParser().parseFromString(identified, "application/xml");
    const beforeNotes = Array.from(before.getElementsByTagName("note"));
    const notes = Array.from(after.getElementsByTagName("note"));
    expect(notes[0].getAttribute("id")).toBe("existing");
    expect(new Set(notes.map((note) => note.getAttribute("id"))).size).toBe(3);
    expect(notes.map((note) => note.getElementsByTagName("pitch").item(0)?.textContent)).toEqual(beforeNotes.map((note) => note.getElementsByTagName("pitch").item(0)?.textContent));
    expect(notes.map((note) => note.getElementsByTagName("duration").item(0)?.textContent)).toEqual(beforeNotes.map((note) => note.getElementsByTagName("duration").item(0)?.textContent));
    expect(notes[0].getElementsByTagName("accidental").item(0)?.textContent).toBe("natural");
    expect(notes[1].getElementsByTagName("accidental").item(0)?.textContent).toBe("natural");
    expect(notes[2].getElementsByTagName("accidental").item(0)).toBeNull();
    expect(identified).toContain('name="score-to-musicxml:midi-accidental-guard-v1"');
    expect(source).not.toContain("midi-src-");
    expect(identifyMusicXmlNotesForMidi(identified)).toEqual(identified);
  });
  it("insere a identificação antes do primeiro cabeçalho estrutural existente", () => {
    const source = '<score-partwise version="4.0"><defaults/><credit page="1"><credit-words>Título</credit-words></credit><part-list><score-part id="P1"><part-name>Teste</part-name></score-part></part-list><part id="P1"><measure number="1"><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note></measure></part></score-partwise>';
    const identified = identifyMusicXmlNotesForMidi(source);
    const document = new DOMParser().parseFromString(identified, "application/xml");
    const names = Array.from(document.documentElement.childNodes).filter((node) => node.nodeType === 1).map((node) => node.nodeName);
    expect(names).toEqual(["identification", "defaults", "credit", "part-list", "part"]);
  });

  it("rejects malformed or duplicate source IDs rather than inventing a mapping", () => {
    expect(() => identifyMusicXmlNotesForMidi(source.replace("<note><chord/>", '<note id="existing"><chord/>'))).toThrow("Duplicate");
    expect(() => identifyMusicXmlNotesForMidi(source.replace('id="existing"><pitch>', 'xml:id="existing"><pitch>').replace("<note><chord/>", '<note xml:id="existing"><chord/>'))).toThrow("Duplicate");
    expect(() => identifyMusicXmlNotesForMidi("<score-partwise><part></score-partwise>")).toThrow();
  });

  it("corrige a cópia de renderização para alter explícito e preserva microtons e graças", () => {
    const source = `<score-partwise><part-list><score-part id="P1"><part-name>Teste</part-name></score-part></part-list><part id="P1"><measure number="1">
      <note><pitch><step>E</step><alter>1</alter><octave>3</octave></pitch><duration>1</duration><accidental>flat</accidental></note>
      <note><pitch><step>B</step><alter>-2</alter><octave>3</octave></pitch><duration>1</duration><accidental>double-flat</accidental></note>
      <note><pitch><step>F</step><alter>0.5</alter><octave>4</octave></pitch><duration>1</duration><accidental>quarter-sharp</accidental></note>
      <note><grace/><pitch><step>G</step><alter>1</alter><octave>4</octave></pitch><accidental>flat</accidental></note>
    </measure></part></score-partwise>`;
    const identified = identifyMusicXmlNotesForMidi(source);
    const notes = Array.from(new DOMParser().parseFromString(identified, "application/xml").getElementsByTagName("note"));
    expect(notes.map((note) => note.getElementsByTagName("accidental").item(0)?.textContent ?? null)).toEqual(["sharp", "flat-flat", "quarter-sharp", "flat"]);
    expect(identified).toContain('"pitchAlterAuthoritative":true');
    expect(source).not.toContain("midi-accidental-guard-v1");
  });

  it("usa o excerto real Adelita para impedir a propagação do sustenido de E5 para E3 entre vozes", async () => {
    const source = readFileSync(new URL("./fixtures/adelita/new-conversion.musicxml", import.meta.url), "utf8");
    const identified = identifyMusicXmlNotesForMidi(source);
    const document = new DOMParser().parseFromString(identified, "application/xml");
    const measureNine = Array.from(document.getElementsByTagName("measure")).find((measure) => measure.getAttribute("number") === "9");
    const e3 = Array.from(measureNine?.getElementsByTagName("note") ?? []).find((note) => note.getElementsByTagName("voice").item(0)?.textContent?.trim() === "3");
    const e5 = Array.from(measureNine?.getElementsByTagName("note") ?? []).find((note) => note.getElementsByTagName("voice").item(0)?.textContent?.trim() === "1");
    expect(e3?.getElementsByTagName("accidental").item(0)?.textContent).toBe("natural");
    expect(e5?.getElementsByTagName("accidental").item(0)?.textContent).toBe("sharp");
    const midi = await renderMidi(identified);
    const attacks = noteOnsAt(midi, 6000);
    expect(attacks).toContain(52);
    expect(attacks).toContain(79);
    expect(attacks).not.toContain(53);
  });

  it("mantém os bytes MIDI da reconversão Adelita já revisada", async () => {
    const source = readFileSync(new URL("../../../../source-ledgers/adelita-2026-10-10/reviewed.musicxml", import.meta.url), "utf8");
    const before = await renderMidi(source);
    const after = await renderMidi(identifyMusicXmlNotesForMidi(source));
    expect(createHash("sha256").update(after).digest("hex")).toBe(createHash("sha256").update(before).digest("hex"));
  });
});

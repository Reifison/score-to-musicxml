import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { DOMParser } from "@xmldom/xmldom";
// Verovio 6 publishes JavaScript ESM entrypoints without TypeScript declarations.
// @ts-expect-error -- runtime entrypoint declared in package exports
import { VerovioToolkit } from "verovio/esm";
// @ts-expect-error -- runtime entrypoint declared in package exports
import createVerovioModule from "verovio/wasm";
import type { ConversionCoverage } from "../domain.js";
import { inspectMusicXml, mergeVerifiedPages } from "../services/MusicXmlCoverage.js";

const measure = (step: string, staff?: number) => `<measure number="1"><attributes><divisions>1</divisions><clef><sign>G</sign><line>2</line></clef>${staff === 2 ? "<staves>2</staves>" : ""}</attributes><note><pitch><step>${step}</step><octave>4</octave></pitch><duration>1</duration>${staff ? `<staff>${staff}</staff>` : ""}</note></measure>`;
const xml = (parts: Array<{ id: string; name: string; body: string }>) => `<?xml version="1.0"?><score-partwise version="4.0"><part-list>${parts.map((part) => `<score-part id="${part.id}"><part-name>${part.name}</part-name></score-part>`).join("")}</part-list>${parts.map((part) => `<part id="${part.id}">${part.body}</part>`).join("")}</score-partwise>`;
const duo = (ids: [string, string], swapped = false) => xml([
  { id: ids[0], name: swapped ? "Guitar 2" : "Guitar 1", body: measure(swapped ? "D" : "C") },
  { id: ids[1], name: swapped ? "Guitar 1" : "Guitar 2", body: measure(swapped ? "E" : "F") }
]);
const coverage: ConversionCoverage = { totalPages: 2, processedPages: [1, 2], missingPages: [], pages: [] };

describe("MusicXML coverage and identity", () => {
  it("normaliza somente a oitava ausente do violão Audiveris explicitamente escolhido e registra a origem", () => {
    const fixture = (context = "", instrument = "Voice Oohs", label = "Voice", software = "Audiveris 5.7.1") =>
      `<score-partwise version="4.0"><identification><encoding><software>${software}</software></encoding></identification><part-list><score-part id="P1"><part-name>${label}</part-name><score-instrument id="I1"><instrument-name>${instrument}</instrument-name></score-instrument><midi-instrument id="I1"><midi-program>54</midi-program></midi-instrument></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><key><fifths>-3</fifths></key><clef><sign>G</sign><line>2</line></clef>${context}</attributes><note><pitch><step>E</step><alter>-1</alter><octave>6</octave></pitch><duration>1</duration><type>quarter</type></note></measure></part></score-partwise>`;
    const convert = (source: string, selected = true) => mergeVerifiedPages([{ page: 1, xml: source }], "guitar_solo", { totalPages: 1, processedPages: [1], missingPages: [], pages: [] }, selected);
    const source = fixture(); const output = convert(source);
    expect(output).toContain("<transpose><diatonic>0</diatonic><chromatic>0</chromatic><octave-change>-1</octave-change></transpose>");
    expect(output).toContain('name="score-to-musicxml:guitar-transposition-v1"');
    expect(output).toContain('"writtenPitchesChanged":false');
    expect(output.match(/<note>[\s\S]*?<\/note>/)?.[0]).toEqual(source.match(/<note>[\s\S]*?<\/note>/)?.[0]);
    for (const semitones of [0, -12, -2]) {
      const explicit = `<transpose><chromatic>${semitones}</chromatic></transpose>`;
      const retained = convert(fixture(explicit)); expect(retained).toContain(explicit);
      expect(retained).not.toContain("guitar-transposition-v1");
    }
    for (const unchanged of [convert(source, false), convert(fixture("", "Voice Oohs", "Voice", "Other scanner")),
      convert(fixture().replace("<line>2</line>", "<line>2</line><clef-octave-change>-1</clef-octave-change>")),
      convert(fixture("", "Piano", "Piano")), convert(fixture("", "Clarinet", "Clarinet")),
      convert(fixture("", "Voice", "Voice")),
      convert(fixture().replace("<clef>", '<clef number="2">')),
      convert(fixture().replace("<divisions>1</divisions>", "<divisions>1</divisions><concert-score/>")),
      convert(fixture("<staff-details><staff-type>tablature</staff-type><staff-tuning><tuning-step>E</tuning-step></staff-tuning></staff-details>"))]) {
      expect(unchanged).not.toContain("<transpose>"); expect(unchanged).not.toContain("guitar-transposition-v1");
    }
    expect(convert(output)).toEqual(output);
  });

  it("aceita nome de andamento quando o perfil guitar_solo e o placeholder Audiveris são explícitos", () => {
    const source = readFileSync(new URL("./fixtures/adelita/new-conversion.musicxml", import.meta.url), "utf8");
    const output = mergeVerifiedPages([{ page: 1, xml: source }], "guitar_solo", { totalPages: 1, processedPages: [1], missingPages: [], pages: [] }, true);
    expect(output).toContain("<part-name>Violão</part-name>");
    expect(output).toContain("<instrument-name>Acoustic Guitar (nylon)</instrument-name>");
    expect(output).toContain("<midi-program>25</midi-program>");
    expect(output).toContain("<transpose><diatonic>0</diatonic><chromatic>0</chromatic><octave-change>-1</octave-change></transpose>");
    expect(output).toContain('name="score-to-musicxml:guitar-transposition-v1"');
    expect(output).toContain('<staff-details print-object="yes"/>');
    expect(source).toContain("<part-name>Lento.</part-name>");
    expect((output.match(/<note\b/g) ?? []).length).toBe((source.match(/<note\b/g) ?? []).length);
  });

  it("adiciona acidente explícito à oitava conflitante sem alterar pitch ou duração", () => {
    const source = `<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Melody</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><clef><sign>G</sign><line>2</line></clef></attributes><note id="anchor"><pitch><step>E</step><alter>1</alter><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><accidental>sharp</accidental></note><backup><duration>4</duration></backup><direction><direction-type><words>separado</words></direction-type></direction><note id="candidate"><pitch><step>E</step><octave>3</octave></pitch><duration>2</duration><voice>3</voice><type>half</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification><stem>down</stem><notehead>normal</notehead><notehead-text>e</notehead-text><staff>1</staff><beam number="1">begin</beam><notations/><lyric/><play/><listen/></note></measure></part></score-partwise>`;
    const output = mergeVerifiedPages([{ page: 1, xml: source }], "melody", { totalPages: 1, processedPages: [1], missingPages: [], pages: [] });
    const document = new DOMParser().parseFromString(output, "application/xml");
    const candidate = document.getElementsByTagName("note").item(1)!;
    expect(candidate.getElementsByTagName("accidental").item(0)?.textContent).toBe("natural");
    expect(candidate.getElementsByTagName("accidental").item(0)?.getAttribute("parentheses")).toBe("yes");
    expect(candidate.getElementsByTagName("accidental").item(0)?.getAttribute("editorial")).toBe("yes");
    expect(candidate.getElementsByTagName("pitch").item(0)?.textContent).toContain("E");
    expect(candidate.getElementsByTagName("duration").item(0)?.textContent).toBe("2");
    const names = Array.from(candidate.childNodes).filter((node) => node.nodeType === 1).map((node) => node.nodeName);
    expect(names.indexOf("accidental")).toBeLessThan(names.indexOf("time-modification"));
    const field = Array.from(document.getElementsByTagName("miscellaneous-field")).find((item) => item.getAttribute("name") === "score-to-musicxml:cross-octave-accidental-v1");
    expect(JSON.parse(field?.textContent ?? "{}")).toEqual({ notesAdjusted: 1, pitchesChanged: false, renderCompatibility: true });
  });

  it("ignora graças, microtons, outra pauta e notas que já têm glyph", () => {
    const source = `<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Melody</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><clef><sign>G</sign><line>2</line></clef></attributes><note id="anchor"><pitch><step>E</step><alter>1</alter><octave>5</octave></pitch><duration>1</duration><accidental>sharp</accidental></note><note id="grace"><grace/><pitch><step>E</step><octave>3</octave></pitch><duration>1</duration></note><note id="micro"><pitch><step>E</step><alter>0.5</alter><octave>3</octave></pitch><duration>1</duration></note><note id="staff-two"><pitch><step>E</step><octave>3</octave></pitch><duration>1</duration><staff>2</staff></note><note id="has-glyph"><pitch><step>E</step><octave>3</octave></pitch><duration>1</duration><accidental>flat</accidental></note><note id="same-octave"><pitch><step>E</step><octave>5</octave></pitch><duration>1</duration></note><note id="unpitched"><unpitched><display-step>E</display-step><display-octave>3</display-octave></unpitched><duration>1</duration></note></measure></part></score-partwise>`;
    const output = mergeVerifiedPages([{ page: 1, xml: source }], "melody", { totalPages: 1, processedPages: [1], missingPages: [], pages: [] });
    const document = new DOMParser().parseFromString(output, "application/xml");
    const note = (id: string) => Array.from(document.getElementsByTagName("note")).find((item) => item.getAttribute("id") === id)!;
    expect(note("grace").getElementsByTagName("accidental").length).toBe(0);
    expect(note("micro").getElementsByTagName("accidental").length).toBe(0);
    expect(note("staff-two").getElementsByTagName("accidental").length).toBe(0);
    expect(note("has-glyph").getElementsByTagName("accidental").item(0)?.textContent).toBe("flat");
    expect(note("same-octave").getElementsByTagName("accidental").length).toBe(0);
    expect(note("unpitched").getElementsByTagName("accidental").length).toBe(0);
    expect(output).not.toContain("cross-octave-accidental-v1");
  });

  it("aplica a compatibilidade ao novo MusicXML real e preserva pitch e duração da reconversão revisada", () => {
    const newSource = readFileSync(new URL("./fixtures/adelita/new-conversion.musicxml", import.meta.url), "utf8");
    const normalized = mergeVerifiedPages([{ page: 1, xml: newSource }], "guitar_solo", { totalPages: 1, processedPages: [1], missingPages: [], pages: [] });
    const normalizedDocument = new DOMParser().parseFromString(normalized, "application/xml");
    const measureNine = Array.from(normalizedDocument.getElementsByTagName("measure")).find((measure) => measure.getAttribute("number") === "9")!;
    const e3 = Array.from(measureNine.getElementsByTagName("note")).find((note) => note.getElementsByTagName("pitch").item(0)?.getElementsByTagName("step").item(0)?.textContent?.trim() === "E"
      && note.getElementsByTagName("pitch").item(0)?.getElementsByTagName("octave").item(0)?.textContent?.trim() === "3")!;
    expect(e3.getElementsByTagName("accidental").item(0)?.textContent).toBe("natural");
    expect(e3.getElementsByTagName("accidental").item(0)?.getAttribute("parentheses")).toBe("yes");
    expect(e3.getElementsByTagName("accidental").item(0)?.getAttribute("editorial")).toBe("yes");
    expect(normalized).toContain('name="score-to-musicxml:cross-octave-accidental-v1"');

    const reviewed = readFileSync(new URL("../../../../source-ledgers/adelita-2026-10-10/reviewed.musicxml", import.meta.url), "utf8");
    const reviewedOutput = mergeVerifiedPages([{ page: 1, xml: reviewed }], "guitar_solo", { totalPages: 1, processedPages: [1], missingPages: [], pages: [] });
    const reviewedBefore = new DOMParser().parseFromString(reviewed, "application/xml");
    const reviewedAfter = new DOMParser().parseFromString(reviewedOutput, "application/xml");
    const pitchAndDuration = (document: Document) => Array.from(document.getElementsByTagName("note")).map((note) => [
      note.getElementsByTagName("pitch").item(0)?.textContent ?? note.getElementsByTagName("rest").item(0)?.textContent ?? "",
      note.getElementsByTagName("duration").item(0)?.textContent ?? ""
    ]);
    expect(pitchAndDuration(reviewedAfter)).toEqual(pitchAndDuration(reviewedBefore));
  });

  it("mantém a normalização idempotente quando três oitavas formam uma cascata potencial", () => {
    const source = `<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Melody</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><clef><sign>G</sign><line>2</line></clef></attributes><note id="anchor"><pitch><step>E</step><alter>1</alter><octave>5</octave></pitch><duration>1</duration><accidental>sharp</accidental></note><note id="lower"><pitch><step>E</step><octave>3</octave></pitch><duration>1</duration></note><note id="upper"><pitch><step>E</step><alter>1</alter><octave>6</octave></pitch><duration>1</duration></note></measure></part></score-partwise>`;
    const first = mergeVerifiedPages([{ page: 1, xml: source }], "melody", { totalPages: 1, processedPages: [1], missingPages: [], pages: [] });
    const second = mergeVerifiedPages([{ page: 1, xml: first }], "melody", { totalPages: 1, processedPages: [1], missingPages: [], pages: [] });
    expect(second).toBe(first);
    const document = new DOMParser().parseFromString(first, "application/xml");
    const lowerAccidental = Array.from(document.getElementsByTagName("note")).find((note) => note.getAttribute("id") === "lower")?.getElementsByTagName("accidental").item(0);
    expect(lowerAccidental?.textContent).toBe("natural");
    expect(lowerAccidental?.getAttribute("editorial")).toBe("yes");
    expect(Array.from(document.getElementsByTagName("note")).find((note) => note.getAttribute("id") === "upper")?.getElementsByTagName("accidental").length).toBe(0);
  });

  it("preserva uma transposição explícita, inclusive zero, sem trocar o instrumento declarado", () => {
    const source = `<score-partwise version="4.0"><identification><encoding><software>Audiveris 5.10.2</software></encoding></identification><part-list><score-part id="P1"><part-name>Lento.</part-name><score-instrument id="I1"><instrument-name>Voice Oohs</instrument-name></score-instrument><midi-instrument id="I1"><midi-program>54</midi-program></midi-instrument></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><clef><sign>G</sign><line>2</line></clef><transpose><diatonic>0</diatonic><chromatic>0</chromatic><octave-change>0</octave-change></transpose></attributes><note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration></note></measure></part></score-partwise>`;
    const output = mergeVerifiedPages([{ page: 1, xml: source }], "guitar_solo", { totalPages: 1, processedPages: [1], missingPages: [], pages: [] }, true);
    expect(output).toContain("<part-name>Lento.</part-name>");
    expect(output).toContain("<instrument-name>Voice Oohs</instrument-name>");
    expect(output).toContain("<midi-program>54</midi-program>");
    expect(output).toContain("<octave-change>0</octave-change>");
    expect(output).not.toContain("guitar-transposition-v1");
  });

  it("relabela o placeholder Voice e conserva sua transposição explícita", () => {
    const source = `<score-partwise version="4.0"><identification><encoding><software>Audiveris 5.10.2</software></encoding></identification><part-list><score-part id="P1"><part-name>Voice</part-name><score-instrument id="I1"><instrument-name>Voice Oohs</instrument-name></score-instrument><midi-instrument id="I1"><midi-program>54</midi-program></midi-instrument></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><clef><sign>G</sign><line>2</line></clef><transpose><diatonic>0</diatonic><chromatic>0</chromatic><octave-change>0</octave-change></transpose></attributes><note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration></note></measure></part></score-partwise>`;
    const output = mergeVerifiedPages([{ page: 1, xml: source }], "guitar_solo", { totalPages: 1, processedPages: [1], missingPages: [], pages: [] }, true);
    expect(output).toContain("<part-name>Violão</part-name>");
    expect(output).toContain("<instrument-name>Acoustic Guitar (nylon)</instrument-name>");
    expect(output).toContain("<midi-program>25</midi-program>");
    expect(output).toContain("<octave-change>0</octave-change>");
    expect(output).not.toContain("guitar-transposition-v1");
  });

  it("mantém violões distintos quando IDs mudam e ordem se inverte", () => {
    const merged = mergeVerifiedPages([{ page: 1, xml: duo(["P1", "P2"]) }, { page: 2, xml: duo(["X9", "X8"], true) }], "guitar_duo", coverage);
    const firstPart = merged.match(/<part id="P1">([\s\S]*?)<\/part>/)?.[1] ?? "";
    const secondPart = merged.match(/<part id="P2">([\s\S]*?)<\/part>/)?.[1] ?? "";
    expect(firstPart).toContain("<step>E</step>");
    expect(firstPart).not.toContain("<step>D</step>");
    expect(secondPart).toContain("<step>D</step>");
    expect(secondPart).not.toContain("<step>E</step>");
    expect((firstPart.match(/<measure/g) ?? []).length).toBe(2);
    expect((secondPart.match(/<measure/g) ?? []).length).toBe(2);
  });

  it("remapeia IDs de instrumento das notas para as declarações preservadas no merge", () => {
    const withInstruments = (parts: Array<{ id: string; name: string; instrument: string; step: string }>) => `<?xml version="1.0"?><score-partwise version="4.0"><part-list>${parts.map((part) => `<score-part id="${part.id}"><part-name>${part.name}</part-name><score-instrument id="${part.instrument}"><instrument-name>Guitar</instrument-name></score-instrument><midi-instrument id="${part.instrument}"><midi-channel>1</midi-channel></midi-instrument></score-part>`).join("")}</part-list>${parts.map((part) => `<part id="${part.id}"><measure number="1"><attributes><clef><sign>G</sign></clef></attributes><note><pitch><step>${part.step}</step><octave>4</octave></pitch><instrument id="${part.instrument}"/></note></measure></part>`).join("")}</score-partwise>`;
    const first = withInstruments([{ id: "P1", name: "Guitar 1", instrument: "I1", step: "C" }, { id: "P2", name: "Guitar 2", instrument: "I2", step: "E" }]);
    const second = withInstruments([{ id: "X2", name: "Guitar 2", instrument: "J9", step: "F" }, { id: "X1", name: "Guitar 1", instrument: "J8", step: "D" }]);
    const merged = mergeVerifiedPages([{ page: 1, xml: first }, { page: 2, xml: second }], "guitar_duo", coverage);
    const firstPart = merged.match(/<part id="P1">([\s\S]*?)<\/part>/)?.[1] ?? "";
    const secondPart = merged.match(/<part id="P2">([\s\S]*?)<\/part>/)?.[1] ?? "";
    expect(firstPart).toContain('<step>D</step>');
    expect(secondPart).toContain('<step>F</step>');
    expect((firstPart.match(/<instrument id="I1"\/>/g) ?? []).length).toBe(2);
    expect((secondPart.match(/<instrument id="I2"\/>/g) ?? []).length).toBe(2);
    expect(merged).not.toMatch(/<instrument id="J[89]"\/>/);
    const declared = new Set([...merged.matchAll(/<score-instrument id="([^"]+)"/g)].map((match) => match[1]));
    expect([...merged.matchAll(/<note>[\s\S]*?<instrument id="([^"]+)"/g)].every((match) => declared.has(match[1]))).toBe(true);
  });

  it("usa o violão escolhido para metadados Voice Oohs sem alterar eventos ou IDs", () => {
    const voicePage = (partId: string, instrumentId: string, step: string, label = "Voice", instrument = "Voice Oohs", program = 54) =>
      `<?xml version="1.0"?><score-partwise version="4.0"><identification><encoding><software>Audiveris 5.10.2</software></encoding></identification><part-list><score-part id="${partId}"><part-name>${label}</part-name><part-abbreviation>${label}</part-abbreviation><score-instrument id="${instrumentId}"><instrument-name>${instrument}</instrument-name></score-instrument><midi-instrument id="${instrumentId}"><midi-channel>1</midi-channel><midi-program>${program}</midi-program></midi-instrument></score-part></part-list><part id="${partId}"><measure number="1"><attributes><divisions>12</divisions><clef><sign>G</sign><line>2</line></clef></attributes><note><pitch><step>${step}</step><octave>4</octave></pitch><duration>6</duration><voice>1</voice><instrument id="${instrumentId}"/></note></measure></part></score-partwise>`;
    const pages = [{ page: 1, xml: voicePage("P1", "P1-I1", "C") }, { page: 2, xml: voicePage("X9", "X9-I8", "D") }];
    const old = mergeVerifiedPages(pages, "guitar_solo", coverage);
    const selected = mergeVerifiedPages(pages, "guitar_solo", coverage, true);
    expect(old).toContain("<part-name>Voice</part-name>");
    expect(old).toContain("<midi-program>54</midi-program>");
    expect(selected).toContain("<part-name>Violão</part-name>");
    expect(selected).toContain("<instrument-name>Acoustic Guitar (nylon)</instrument-name>");
    expect(selected).toContain("<midi-program>25</midi-program>");
    expect((selected.match(/<instrument id="P1-I1"\/>/g) ?? []).length).toBe(2);
    expect(selected).not.toContain('instrument id="X9-I8"');
    expect([...selected.matchAll(/<step>([A-G])<\/step>[\s\S]*?<duration>(\d+)<\/duration>/g)].map((match) => [match[1], match[2]])).toEqual([["C", "6"], ["D", "6"]]);
    const piano = mergeVerifiedPages([{ page: 1, xml: voicePage("P1", "I1", "C", "Piano", "Piano", 1) }], "guitar_solo", { totalPages: 1, processedPages: [1], missingPages: [], pages: [] }, true);
    expect(piano).toContain("<part-name>Piano</part-name>");
    expect(piano).toContain("<midi-program>1</midi-program>");
  });

  it("preserva a identidade do duo ao renomear Voice 1 e Voice 2", () => {
    const page = (ids: [string, string], instruments: [string, string], swapped = false) => {
      const voices = swapped ? [{ id: ids[0], name: "Voice 2", instrument: instruments[0], step: "F" }, { id: ids[1], name: "Voice 1", instrument: instruments[1], step: "D" }] : [{ id: ids[0], name: "Voice 1", instrument: instruments[0], step: "C" }, { id: ids[1], name: "Voice 2", instrument: instruments[1], step: "E" }];
      return `<?xml version="1.0"?><score-partwise version="4.0"><identification><encoding><software>Audiveris 5.10.2</software></encoding></identification><part-list>${voices.map((voice) => `<score-part id="${voice.id}"><part-name>${voice.name}</part-name><score-instrument id="${voice.instrument}"><instrument-name>Voice Oohs</instrument-name></score-instrument><midi-instrument id="${voice.instrument}"><midi-program>54</midi-program></midi-instrument></score-part>`).join("")}</part-list>${voices.map((voice) => `<part id="${voice.id}"><measure number="1"><attributes><clef><sign>G</sign><line>2</line></clef></attributes><note><pitch><step>${voice.step}</step><octave>4</octave></pitch><instrument id="${voice.instrument}"/></note></measure></part>`).join("")}</score-partwise>`;
    };
    const merged = mergeVerifiedPages([{ page: 1, xml: page(["P1", "P2"], ["I1", "I2"]) }, { page: 2, xml: page(["X2", "X1"], ["J2", "J1"], true) }], "guitar_duo", coverage, true);
    expect(merged).toContain("<part-name>Violão 1</part-name>");
    expect(merged).toContain("<part-name>Violão 2</part-name>");
    expect((merged.match(/<midi-program>25<\/midi-program>/g) ?? []).length).toBe(2);
    const firstPart = merged.match(/<part id="P1">([\s\S]*?)<\/part>/)?.[1] ?? "";
    expect(firstPart).toContain("<step>C</step>");
    expect(firstPart).toContain("<step>D</step>");
    expect(firstPart).not.toContain("<step>F</step>");
    expect((firstPart.match(/<instrument id="I1"\/>/g) ?? []).length).toBe(2);
  });

  it("falha explicitamente quando uma parte usa múltiplos instrumentos sem mapeamento único", () => {
    const source = xml([{ id: "P1", name: "Melody", body: measure("C") }]);
    const ambiguous = source.replace('<part-name>Melody</part-name>', '<part-name>Melody</part-name><score-instrument id="A"/><score-instrument id="B"/>').replace('</note>', '<instrument id="A"/></note>');
    expect(() => mergeVerifiedPages([{ page: 1, xml: source }, { page: 2, xml: ambiguous }], "melody", coverage)).toThrow(/associar instrumentos/);
  });

  it("falha quando o duo perde um violão ou a identidade fica ambígua", () => {
    const one = xml([{ id: "P1", name: "Guitar 1", body: measure("C") }]);
    const ambiguous = xml([{ id: "P1", name: "Guitar", body: measure("C") }, { id: "P2", name: "Guitar", body: measure("D") }]);
    expect(() => inspectMusicXml(one, 1, "guitar_duo")).toThrow(/perdeu um violão/);
    expect(() => inspectMusicXml(ambiguous, 1, "guitar_duo")).toThrow(/distinguir/);
    const unnamed = xml([{ id: "P1", name: "", body: measure("C") }, { id: "P2", name: "", body: measure("D") }]);
    expect(() => inspectMusicXml(unnamed, 1, "guitar_duo")).toThrow(/distinguir/);
    const noClef = xml([{ id: "P1", name: "Guitar 1", body: `<measure number="1"><note><rest/></note></measure>` }, { id: "P2", name: "Guitar 2", body: measure("D") }]);
    expect(() => inspectMusicXml(noClef, 1, "guitar_duo")).toThrow(/clave de sol/);
  });

  it("falha quando piano perde eventos de uma das duas pautas", () => {
    const clefs = `<clef number="1"><sign>G</sign></clef><clef number="2"><sign>F</sign></clef>`;
    const oneStaff = xml([{ id: "P1", name: "Piano", body: `<measure number="1"><attributes><staves>2</staves>${clefs}</attributes><note><pitch><step>C</step><octave>4</octave></pitch><staff>1</staff></note></measure>` }]);
    expect(() => inspectMusicXml(oneStaff, 1, "piano")).toThrow(/não contém eventos nas duas pautas/);
    const both = xml([{ id: "P1", name: "Piano", body: `<measure number="1"><attributes><staves>2</staves>${clefs}</attributes><note><pitch><step>C</step><octave>4</octave></pitch><staff>1</staff></note><note><pitch><step>E</step><octave>3</octave></pitch><staff>2</staff></note></measure>` }]);
    expect(inspectMusicXml(both, 1, "piano").coverage.parts[0].staffCount).toBe(2);
    expect(inspectMusicXml(both, 1, "piano").coverage.parts[0].clefs).toEqual([{ staff: 1, sign: "G" }, { staff: 2, sign: "F" }]);
    expect(() => inspectMusicXml(both.replace(`<clef number="2"><sign>F</sign></clef>`, ""), 1, "piano")).toThrow(/clave de cada pauta/);
  });

  it("aceita exercício curto e insere aviso de páginas inteiras ausentes no MusicXML", () => {
    const short = xml([{ id: "A", name: "Melody", body: measure("C") }]);
    const partial: ConversionCoverage = { totalPages: 2, processedPages: [1], missingPages: [2], pages: [] };
    const merged = mergeVerifiedPages([{ page: 1, xml: short }], "melody", partial);
    expect(merged).toContain("páginas ausentes: 2");
    expect(inspectMusicXml(short, 1, "melody").coverage.parts).toHaveLength(1);
    expect(inspectMusicXml(short, 1, "melody").coverage.parts[0].clefs).toEqual([{ staff: 1, sign: "G" }]);
  });

  it("preserva número zero da anacruse ao unir páginas", () => {
    const first = xml([{ id: "P1", name: "Guitar", body: measure("C").replace('number="1"', 'number="0" implicit="yes"') + measure("D") }]);
    const second = xml([{ id: "X9", name: "Guitar", body: measure("E") }]);
    const merged = mergeVerifiedPages([{ page: 1, xml: first }, { page: 2, xml: second }], "guitar_solo", coverage);
    expect([...merged.matchAll(/<measure number="(\d+)"/g)].map((match) => match[1])).toEqual(["0", "1", "2"]);
    expect(merged).toContain('implicit="yes"');
  });

  it("remove apenas feixes redundantes em notas de acorde e preserva as notas", () => {
    const beamed = `<measure number="1"><attributes><divisions>4</divisions><clef><sign>G</sign></clef></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><beam number="1">begin</beam></note>
      <note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><beam number="1">begin</beam></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><beam number="1">end</beam></note>
      <note><chord/><pitch><step>F</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><beam number="1">end</beam></note>
    </measure>`;
    const first = xml([{ id: "A", name: "Guitar", body: measure("A") }]);
    const second = xml([{ id: "B", name: "Guitar", body: beamed }]);
    const merged = mergeVerifiedPages([{ page: 1, xml: first }, { page: 2, xml: second }], "guitar_solo", coverage);
    expect((merged.match(/<note\b/g) ?? []).length).toBe(5);
    expect((merged.match(/<chord\/>/g) ?? []).length).toBe(2);
    expect((merged.match(/<beam number="1">/g) ?? []).length).toBe(2);
    expect(merged).toMatch(/<note><chord\/><pitch><step>E<\/step>[\s\S]*?<\/note>/);
    const ambiguous = second.replace('<beam number="1">begin</beam></note>\n      <note><pitch><step>D', '<beam number="1">continue</beam></note>\n      <note><pitch><step>D');
    expect(() => mergeVerifiedPages([{ page: 1, xml: first }, { page: 2, xml: ambiguous }], "guitar_solo", coverage)).toThrow(/não podem ser associados/);
  });

  it("mantém todas as alturas de um acorde com feixes duplicados no importador Verovio", async () => {
    const body = `<measure number="1"><attributes><divisions>4</divisions><time><beats>2</beats><beat-type>4</beat-type></time><clef><sign>G</sign></clef></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>eighth</type><beam number="1">begin</beam></note>
      <note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>eighth</type><beam number="1">begin</beam></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>eighth</type><beam number="1">end</beam></note>
      <note><chord/><pitch><step>F</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>eighth</type><beam number="1">end</beam></note>
      <note><rest/><duration>4</duration><voice>1</voice><type>quarter</type></note>
    </measure>`;
    const input = xml([{ id: "P1", name: "Guitar", body }]);
    const merged = mergeVerifiedPages([{ page: 1, xml: input }], "guitar_solo", { totalPages: 1, processedPages: [1], missingPages: [], pages: [] });
    const module = await createVerovioModule();
    const toolkit = new VerovioToolkit(module);
    try {
      toolkit.setOptions({ inputFrom: "xml" });
      expect(toolkit.loadData(merged)).toBeTruthy();
      expect(new DOMParser().parseFromString(toolkit.getMEI(), "application/xml").getElementsByTagName("note").length).toBe(4);
    } finally {
      toolkit.destroy();
    }
  });

  it("não conta compasso vazio como pauta reconhecida", () => {
    const empty = xml([{ id: "A", name: "Melody", body: `<measure number="1"/>` }]);
    expect(() => inspectMusicXml(empty, 1, "melody")).toThrow(/compasso sem notas ou pausas/);
  });
});

import { DOMParser } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";
import { reconcileAutomaticMusicXmlCandidates, type AutomaticCandidate } from "../services/AutomaticCandidateReconciliation.js";

const sourceImageSha256 = "a".repeat(64);
type Note = { pitch?: string; duration: number; mark?: "fermata" | "staccato" };
const note = ({ pitch, duration, mark }: Note): string => `<note>${pitch ? `<pitch><step>${pitch[0]}</step>${pitch[1] === "b" ? "<alter>-1</alter>" : ""}<octave>${pitch.at(-1)}</octave></pitch>` : "<rest/>"}<duration>${duration}</duration><voice>1</voice><type>${duration === 1 ? "eighth" : duration === 2 ? "quarter" : "half"}</type>${mark ? `<notations>${mark === "fermata" ? '<fermata type="upright"/>' : "<articulations><staccato/></articulations>"}</notations>` : ""}</note>`;
const measure = (label: number, notes: Note[], options: { first?: boolean; key?: number; extra?: string } = {}): string =>
  `<measure number="${label}">${options.first ? `<attributes><divisions>2</divisions>${options.key !== undefined ? `<key><fifths>${options.key}</fifths></key>` : ""}<time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>` : options.key !== undefined ? `<attributes><key><fifths>${options.key}</fifths></key></attributes>` : ""}${options.extra ?? ""}${notes.map(note).join("")}</measure>`;
const score = (measures: string[]): string => `<?xml version="1.0"?><score-partwise version="4.0"><work><work-title>Untouched</work-title></work><part-list><score-part id="P1"><part-name>Solo</part-name></score-part></part-list><part id="P1">${measures.join("")}</part></score-partwise>`;
const rect = (left: number, top: number, width: number, height = 80) => ({ left, top, width, height });
const candidate = (id: string, xml: string, boxes: ReturnType<typeof rect>[]): AutomaticCandidate => ({ id, xml, sourceImageSha256,
  anchors: boxes.map((rectangle, measureIndex) => ({ partIndex: 0, measureIndex, rectangle })) });
const parse = (xml: string): Document => new DOMParser().parseFromString(xml, "application/xml");
const allMeasures = (xml: string): Element[] => Array.from(parse(xml).getElementsByTagName("measure"));
const eventValues = (measureElement: Element): string[] => Array.from(measureElement.getElementsByTagName("note")).map((event) => {
  const pitch = event.getElementsByTagName("pitch")[0];
  return pitch ? `${pitch.getElementsByTagName("step")[0]?.textContent}${pitch.getElementsByTagName("alter")[0]?.textContent ?? "0"}${pitch.getElementsByTagName("octave")[0]?.textContent}` : "R";
});

describe("reconcileAutomaticMusicXmlCandidates", () => {
  it("recupera um compasso espacialmente omitido, uma nota ausente e a armadura/alturas corroboradas", () => {
    const baseXml = score([
      measure(1, [{ pitch: "D4", duration: 4 }, { pitch: "F4", duration: 4 }], { first: true, extra: '<direction><direction-type><dynamics><p/></dynamics></direction-type></direction>' }),
      measure(2, [{ pitch: "E4", duration: 4 }, { pitch: "F4", duration: 4 }]),
      measure(3, [{ pitch: "C4", duration: 4 }, { pitch: "E4", duration: 4 }]),
      measure(4, [{ pitch: "B3", duration: 4 }, { pitch: "F4", duration: 2 }], { key: -2, extra: '<direction><direction-type><dynamics><f/></dynamics></direction-type></direction>' }),
      measure(5, [{ pitch: "G4", duration: 8 }])
    ]);
    const donorXml = score([
      measure(1, [{ pitch: "D4", duration: 4 }, { pitch: "F4", duration: 4 }], { first: true, key: -2 }),
      measure(2, [{ pitch: "Eb4", duration: 4 }, { pitch: "F4", duration: 4 }]),
      measure(3, [{ pitch: "C4", duration: 4 }, { pitch: "Eb4", duration: 4 }]),
      measure(4, [{ pitch: "Eb4", duration: 4 }, { pitch: "D4", duration: 2 }, { duration: 2 }], { extra: '<direction><direction-type><dynamics><pp/></dynamics></direction-type></direction>' }),
      measure(5, [{ pitch: "B3", duration: 4 }, { pitch: "D4", duration: 2 }, { pitch: "F4", duration: 2 }]),
      measure(6, [{ pitch: "G4", duration: 8 }])
    ]);
    const baseBoxes = [rect(0, 0, 100), rect(100, 0, 100), rect(200, 0, 200), rect(0, 120, 100), rect(100, 120, 100)];
    const donorBoxes = [rect(0, 0, 100), rect(100, 0, 100), rect(200, 0, 100), rect(300, 0, 100), rect(0, 120, 100), rect(100, 120, 100)];
    const result = reconcileAutomaticMusicXmlCandidates({ base: candidate("base", baseXml, baseBoxes),
      donors: [candidate("clean", donorXml, donorBoxes)], independent: { id: "source-reader", xml: donorXml } });
    expect(result.history.map((item) => item.kind), JSON.stringify(result.rejected)).toEqual(expect.arrayContaining(["insert_measure", "insert_event", "set_initial_key", "set_key_pitch"]));
    expect(result.history.filter((item) => item.kind === "set_key_pitch")).toHaveLength(2);
    expect(allMeasures(result.musicXml)).toHaveLength(6);
    expect(allMeasures(result.musicXml).map((item) => item.getAttribute("number"))).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(eventValues(allMeasures(result.musicXml)[4])).toEqual(["B03", "D04", "F04"]);
    expect(result.musicXml).toContain("<work-title>Untouched</work-title>");
    expect(result.musicXml).toContain("<f/>");
    expect(result.musicXml).not.toContain("<pp/>");
    expect(result.accuracyVerified).toBe(false);
  });

  it("corrige somente evento métrico, bemol de armadura e fermata, preservando regressão do doador", () => {
    const full = [{ pitch: "G4", duration: 8 }];
    const baseMeasures = Array.from({ length: 12 }, (_, i) => measure(i, full, { first: i === 0 }));
    const donorMeasures = Array.from({ length: 12 }, (_, i) => measure(i, full, { first: i === 0, key: i === 0 ? -1 : undefined }));
    const witnessMeasures = Array.from({ length: 12 }, (_, i) => measure(i + 1, full, { first: i === 0, key: i === 0 ? -1 : undefined }));
    baseMeasures[1] = measure(1, [{ pitch: "C4", duration: 4 }, { pitch: "A3", duration: 3 }]);
    donorMeasures[1] = baseMeasures[1];
    witnessMeasures[1] = measure(2, [{ duration: 1 }, { pitch: "C4", duration: 4 }, { pitch: "A3", duration: 3 }]);
    baseMeasures[2] = measure(2, [{ pitch: "B3", duration: 1 }, { pitch: "D4", duration: 6 }]);
    donorMeasures[2] = measure(2, [{ pitch: "Bb3", duration: 1 }, { pitch: "D4", duration: 6 }]);
    witnessMeasures[2] = measure(3, [{ duration: 1 }, { pitch: "Bb3", duration: 1 }, { pitch: "D4", duration: 6 }]);
    baseMeasures[3] = measure(3, [{ duration: 1 }, { pitch: "C4", duration: 8 }]);
    donorMeasures[3] = measure(3, [{ pitch: "C4", duration: 8 }]);
    witnessMeasures[3] = measure(4, [{ pitch: "C4", duration: 8 }]);
    baseMeasures[4] = measure(4, [{ pitch: "F4", duration: 8, mark: "staccato" }]);
    donorMeasures[4] = measure(4, [{ pitch: "F4", duration: 8, mark: "fermata" }]);
    witnessMeasures[4] = measure(5, [{ pitch: "F4", duration: 8, mark: "fermata" }]);
    baseMeasures[5] = measure(5, full, { key: -1 });
    donorMeasures[8] = measure(8, [{ pitch: "A4", duration: 8 }], { extra: '<direction><direction-type><dynamics><ff/></dynamics></direction-type></direction>' });
    const boxes = Array.from({ length: 12 }, (_, index) => rect((index % 5) * 100, Math.floor(index / 5) * 120, 100));
    const sourceRestEvidence = [1, 2].map((measureIndex) => ({ kind: "leading-eighth-rest" as const, measureIndex,
      sourceImageSha256, rectangle: rect((measureIndex % 5) * 100 + 10, 10, 12, 14), score: 0.91, templateCount: 3, margin: 0.12 }));
    const result = reconcileAutomaticMusicXmlCandidates({ base: candidate("base", score(baseMeasures), boxes),
      donors: [candidate("clean", score(donorMeasures), boxes)], independent: { id: "reader", xml: score(witnessMeasures) }, sourceRestEvidence });
    expect(result.history.map((item) => item.kind), JSON.stringify(result.rejected)).toEqual(expect.arrayContaining(["set_initial_key", "insert_event", "remove_rest", "set_key_pitch", "replace_pause_mark"]));
    expect(eventValues(allMeasures(result.musicXml)[1])).toEqual(["R", "C04", "A03"]);
    expect(eventValues(allMeasures(result.musicXml)[2])).toEqual(["R", "B-13", "D04"]);
    expect(eventValues(allMeasures(result.musicXml)[3])).toEqual(["C04"]);
    expect(allMeasures(result.musicXml)[4].getElementsByTagName("fermata")).toHaveLength(1);
    expect(result.musicXml).not.toContain("<ff/>");
    expect(eventValues(allMeasures(result.musicXml)[8])).toEqual(["G04"]);
  });

  it("rejeita inserção ambígua quando a ordem espacial e musical não distingue barras repetidas", () => {
    const repeated = [{ pitch: "C4", duration: 8 }];
    const baseXml = score([0, 1, 2, 3].map((i) => measure(i + 1, repeated, { first: i === 0 })));
    const donorXml = score([0, 1, 2, 3, 4].map((i) => measure(i + 1, repeated, { first: i === 0 })));
    const same = rect(0, 0, 100);
    const result = reconcileAutomaticMusicXmlCandidates({ base: candidate("base", baseXml, [same, same, same, same]),
      donors: [candidate("clean", donorXml, [same, same, same, same, same])], independent: { id: "reader", xml: donorXml } });
    expect(result.musicXml).toBe(baseXml);
    expect(result.history).toHaveLength(0);
  });

  it("mantém a base quando o leitor independente diverge no compasso a inserir", () => {
    const repeated = [{ pitch: "C4", duration: 8 }];
    const baseXml = score([1, 2, 3].map((i) => measure(i, repeated, { first: i === 1 })));
    const donorXml = score([1, 2, 3, 4].map((i) => measure(i, repeated, { first: i === 1 })));
    const witnessXml = score([measure(1, repeated, { first: true }), measure(2, repeated), measure(3, [{ pitch: "D4", duration: 8 }]), measure(4, repeated)]);
    const baseBoxes = [rect(0, 0, 100), rect(100, 0, 200), rect(0, 120, 100)];
    const donorBoxes = [rect(0, 0, 100), rect(100, 0, 100), rect(200, 0, 100), rect(0, 120, 100)];
    const result = reconcileAutomaticMusicXmlCandidates({ base: candidate("base", baseXml, baseBoxes),
      donors: [candidate("clean", donorXml, donorBoxes)], independent: { id: "reader", xml: witnessXml } });
    expect(result.musicXml).toBe(baseXml);
    expect(result.history).toHaveLength(0);
  });

  it("não insere pausa inferida só pela métrica e por um leitor sem prova de pixels vinculada ao raster", () => {
    const full = [{ pitch: "G4", duration: 8 }];
    const baseXml = score([
      measure(0, full, { first: true }),
      measure(1, [{ pitch: "C4", duration: 4 }, { pitch: "A3", duration: 3 }]),
      measure(2, [{ pitch: "D4", duration: 8 }]), measure(3, [{ pitch: "E4", duration: 8 }])
    ]);
    const sourceXml = score([
      measure(1, full, { first: true }),
      measure(2, [{ duration: 1 }, { pitch: "C4", duration: 4 }, { pitch: "A3", duration: 3 }]),
      measure(3, [{ pitch: "D4", duration: 8 }]), measure(4, [{ pitch: "E4", duration: 8 }])
    ]);
    const boxes = [0, 1, 2, 3].map((index) => rect(index * 100, 0, 100));
    const falseEvidence = [{ kind: "leading-eighth-rest" as const, measureIndex: 1,
      sourceImageSha256: "b".repeat(64), rectangle: rect(110, 10, 12, 14), score: 0.99, templateCount: 8, margin: 0.4 }];
    const result = reconcileAutomaticMusicXmlCandidates({ base: candidate("base", baseXml, boxes),
      donors: [candidate("clean", baseXml, boxes)], independent: { id: "reader", xml: sourceXml }, sourceRestEvidence: falseEvidence });
    expect(result.musicXml).toBe(baseXml);
    expect(result.rejected.map((item) => item.code)).toContain("SOURCE_REST_PIXEL_EVIDENCE_REQUIRED");
  });

  it("não altera uma partitura que contém acordes ou múltiplas vozes", () => {
    const xml = score([measure(1, [{ pitch: "C4", duration: 8 }], { first: true }), measure(2, [{ pitch: "D4", duration: 8 }])]);
    const chordXml = xml.replace("<note><pitch>", "<note><chord/><pitch>");
    const boxes = [rect(0, 0, 100), rect(100, 0, 100)];
    const result = reconcileAutomaticMusicXmlCandidates({ base: candidate("base", chordXml, boxes),
      donors: [candidate("clean", xml, boxes)], independent: { id: "reader", xml } });
    expect(result.musicXml).toBe(chordXml);
    expect(result.history).toHaveLength(0);
    expect(result.rejected.map((item) => item.code)).toContain("UNSUPPORTED_BASE_OR_WITNESS");
  });

  it("remove pausa que o doador manteve só com contradição do glifo nativo na própria fonte", () => {
    const full = [{ pitch: "C4", duration: 8 }];
    const baseXml = score([measure(0, full, { first: true }), measure(1, [{ duration: 1 }, ...full]),
      measure(2, [{ pitch: "D4", duration: 8 }]), measure(3, [{ pitch: "E4", duration: 8 }])]);
    const witnessXml = score([measure(1, full, { first: true }), measure(2, full),
      measure(3, [{ pitch: "D4", duration: 8 }]), measure(4, [{ pitch: "E4", duration: 8 }])]);
    const boxes = [0, 1, 2, 3].map((index) => rect(index * 100, 0, 100));
    const common = { base: candidate("base", baseXml, boxes), donors: [candidate("clean", baseXml, boxes)],
      independent: { id: "reader", xml: witnessXml } };
    const without = reconcileAutomaticMusicXmlCandidates(common);
    expect(without.musicXml).toBe(baseXml);
    expect(without.rejected.map((item) => item.code)).toContain("REST_REMOVAL_UNCORROBORATED");
    const withPixels = reconcileAutomaticMusicXmlCandidates({ ...common, sourceRestEvidence: [{
      kind: "contradicted-native-eighth-rest", measureIndex: 1, nativeRestOrdinal: 0,
      sourceImageSha256, rectangle: rect(110, 150, 12, 14), score: 0.3, staffOffsetInterlines: 2.5, templateCount: 3
    }] });
    expect(withPixels.history.map((item) => item.kind)).toContain("remove_rest");
    expect(eventValues(allMeasures(withPixels.musicXml)[1])).toEqual(["C04"]);
  });

  it("usa o ordinal das pausas nativas mesmo quando a pausa vem depois de uma nota", () => {
    const full = [{ pitch: "C4", duration: 8 }];
    const baseXml = score([measure(0, full, { first: true }), measure(1, [...full, { duration: 1 }]),
      measure(2, [{ pitch: "D4", duration: 8 }]), measure(3, [{ pitch: "E4", duration: 8 }])]);
    const witnessXml = score([measure(1, full, { first: true }), measure(2, full),
      measure(3, [{ pitch: "D4", duration: 8 }]), measure(4, [{ pitch: "E4", duration: 8 }])]);
    const boxes = [0, 1, 2, 3].map((index) => rect(index * 100, 0, 100));
    const result = reconcileAutomaticMusicXmlCandidates({ base: candidate("base", baseXml, boxes),
      donors: [candidate("donor", baseXml, boxes)], independent: { id: "reader", xml: witnessXml },
      sourceRestEvidence: [{ kind: "contradicted-native-eighth-rest", measureIndex: 1, nativeRestOrdinal: 0,
        sourceImageSha256, rectangle: rect(110, 150, 12, 14), score: 0.3, staffOffsetInterlines: 2.5, templateCount: 3 }] });
    expect(result.history.map((item) => item.kind)).toContain("remove_rest");
    expect(eventValues(allMeasures(result.musicXml)[1])).toEqual(["C04"]);
  });

  it("não copia uma fermata de nota inserida quando o leitor fonte não a confirma", () => {
    const full = [{ pitch: "C4", duration: 8 }];
    const baseMeasures = [measure(0, full, { first: true }),
      measure(1, [{ pitch: "C4", duration: 4 }, { pitch: "D4", duration: 3 }]),
      measure(2, [{ pitch: "D4", duration: 8 }]), measure(3, [{ pitch: "E4", duration: 8 }])];
    const donorMeasures = [...baseMeasures];
    donorMeasures[1] = measure(1, [{ pitch: "C4", duration: 4 }, { pitch: "D4", duration: 3 }, { pitch: "E4", duration: 1, mark: "fermata" }]);
    const witnessMeasures = [...baseMeasures];
    witnessMeasures[1] = measure(2, [{ pitch: "C4", duration: 4 }, { pitch: "D4", duration: 3 }, { pitch: "E4", duration: 1 }]);
    const boxes = [0, 1, 2, 3].map((index) => rect(index * 100, 0, 100));
    const result = reconcileAutomaticMusicXmlCandidates({ base: candidate("base", score(baseMeasures), boxes),
      donors: [candidate("donor", score(donorMeasures), boxes)], independent: { id: "reader", xml: score(witnessMeasures) } });
    expect(result.history.map((item) => item.kind)).toContain("insert_event");
    expect(allMeasures(result.musicXml)[1].getElementsByTagName("fermata")).toHaveLength(0);
  });

  it("não antecipa armadura quando há acidente local explícito conflitante no intervalo", () => {
    const full = [{ pitch: "G4", duration: 8 }];
    const baseXml = score([
      measure(1, full, { first: true }),
      measure(2, [{ pitch: "B3", duration: 8 }]).replace("</pitch>", "</pitch><accidental>natural</accidental>"),
      measure(3, full, { key: -1 }), measure(4, full)
    ]);
    const donorXml = score([
      measure(1, full, { first: true, key: -1 }), measure(2, [{ pitch: "Bb3", duration: 8 }]),
      measure(3, full), measure(4, full)
    ]);
    const boxes = [0, 1, 2, 3].map((index) => rect(index * 100, 0, 100));
    const result = reconcileAutomaticMusicXmlCandidates({ base: candidate("base", baseXml, boxes),
      donors: [candidate("clean", donorXml, boxes)], independent: { id: "reader", xml: donorXml } });
    expect(result.musicXml).toBe(baseXml);
    expect(result.history).toHaveLength(0);
  });
});

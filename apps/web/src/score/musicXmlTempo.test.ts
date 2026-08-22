import { describe, expect, it } from "vitest";
import { applyDefaultTempo, DEFAULT_TEMPO_BPM, hasExplicitTempo } from "./musicXmlTempo.js";

describe("musicXmlTempo", () => {
  it("adiciona 70 BPM na primeira medida quando o andamento está ausente", () => {
    const source = '<score-partwise><part><measure number="1"><note/></measure></part></score-partwise>';
    const result = applyDefaultTempo(source);

    expect(DEFAULT_TEMPO_BPM).toBe(70);
    expect(result).toContain('<per-minute>70</per-minute>');
    expect(result).toContain('<sound tempo="70"/>');
    expect(hasExplicitTempo(result)).toBe(true);
  });

  it("preserva o andamento informado pela partitura", () => {
    const source = '<score-partwise><part><measure><direction><sound tempo="92"/></direction></measure></part></score-partwise>';
    expect(applyDefaultTempo(source)).toBe(source);
  });

  it("não considera BPM zero como andamento válido", () => {
    expect(hasExplicitTempo('<score-partwise><sound tempo="0"/></score-partwise>')).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { safeCacheKey, safeMidiFilename } from "./exportFilenames";

describe("safeMidiFilename", () => {
  it.each([
    ["Estudo para piano.pdf", "Estudo para piano.mid"],
    ["partitura.final.musicxml", "partitura.final.mid"],
    ["../../segredo.pdf", "segredo.mid"],
    ["pasta\\subpasta\\minha música?.xml", "minha m_sica_.mid"],
    ["...", "score.mid"],
    ["   .pdf", "score.mid"],
    ["acorde   maior.pdf", "acorde maior.mid"]
  ])("converte %j em um nome local seguro", (input, expected) => {
    expect(safeMidiFilename(input)).toBe(expected);
  });

  it("limita o nome base sem remover a extensão MIDI", () => {
    const result = safeMidiFilename(`${"a".repeat(250)}.pdf`);
    expect(result).toBe(`${"a".repeat(180)}.mid`);
  });
});

describe("safeCacheKey", () => {
  it("impede que IDs criem caminhos fora do cache", () => {
    expect(safeCacheKey("../../user/score:id")).toBe("______user_score_id");
  });

  it("produz fallback e limita o tamanho", () => {
    expect(safeCacheKey("💣".repeat(10))).toMatch(/^_+$/);
    expect(safeCacheKey("")).toBe("score");
    expect(safeCacheKey("a".repeat(100))).toHaveLength(80);
  });
});

import { describe, expect, it } from "vitest";
import { localizePlayerError } from "./player.js";

describe("player copy", () => {
  it.each([
    ["Invalid SVG output", "Não foi possível criar uma visualização válida da partitura.", "Could not create a valid score preview."],
    ["Empty MIDI output", "Não foi possível preparar a reprodução desta partitura.", "Could not prepare playback for this score."]
  ])("localiza o erro interno %s em português e inglês", (message, portuguese, english) => {
    expect(localizePlayerError(message, "pt")).toBe(portuguese);
    expect(localizePlayerError(message, "en")).toBe(english);
  });

  it("usa uma mensagem amigável quando o motor retorna um erro técnico sem tradução", () => {
    expect(localizePlayerError("NotAllowedError: audio context is suspended", "pt", "genericAudioError"))
      .toBe("Não foi possível preparar o áudio desta partitura.");
    expect(localizePlayerError("Erro de áudio desconhecido", "en", "genericAudioError"))
      .toBe("Could not prepare audio for this score.");
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Score } from "../types/domain.js";
import { ScoreDetails } from "./ScoreDetails.js";

vi.mock("./ScorePlayer.js", () => ({ ScorePlayer: () => <div>Player</div> }));

const score: Score = {
  id: "score-1",
  userId: "user-1",
  originalFilename: "Estudo.pdf",
  storedFilename: "score.pdf",
  fileType: "pdf",
  mimeType: "application/pdf",
  fileSize: 1024,
  uploadStatus: "converted",
  conversionStatus: "converted",
  errorMessage: null,
  warnings: ["Uma pauta precisa de revisão."],
  confidence: 0.62,
  musicxmlFilename: "score.musicxml",
  isFavorite: false,
  createdAt: "2026-07-27T00:00:00.000Z",
  updatedAt: "2026-07-27T00:00:00.000Z",
  convertedAt: "2026-07-27T00:00:00.000Z"
};

describe("ScoreDetails", () => {
  it("oculta o resumo técnico do reconhecimento", () => {
    render(<ScoreDetails score={score} onClose={vi.fn()} onDownload={vi.fn()} onDownloadMidi={vi.fn()} onRename={vi.fn()} />);

    expect(screen.queryByRole("region", { name: "Qualidade do reconhecimento" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Confiança estimada: 62%/)).not.toBeInTheDocument();
    expect(screen.queryByText("Uma pauta precisa de revisão.")).not.toBeInTheDocument();
  });

  it("fecha com Escape e oferece foco inicial previsível", () => {
    const onClose = vi.fn();
    render(<ScoreDetails score={score} onClose={onClose} onDownload={vi.fn()} onDownloadMidi={vi.fn()} onRename={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Fechar" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});

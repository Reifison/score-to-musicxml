import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, downloadMidi, downloadMusicXml } from "../api/client.js";
import type { Score, User } from "../types/domain.js";
import { App } from "./App.js";

vi.mock("../api/client.js", () => ({
  api: vi.fn(),
  downloadMidi: vi.fn(),
  downloadMusicXml: vi.fn(),
  previewUrl: (scoreId: string) => `http://localhost:4000/api/scores/${scoreId}/preview`
}));

vi.mock("../components/ScorePlayer.js", () => ({
  ScorePlayer: ({ scoreId, scoreName }: { scoreId: string; scoreName: string }) => (
    <div data-testid="score-player">Player {scoreId}: {scoreName}</div>
  )
}));

const user: User = {
  id: "user-1",
  name: "Ana",
  email: "ana@example.com",
  role: "user",
  isActive: true,
  createdAt: "2026-07-27T00:00:00.000Z",
  updatedAt: "2026-07-27T00:00:00.000Z"
};

const convertedScore: Score = {
  id: "score-1",
  userId: user.id,
  originalFilename: "Estudo final.pdf",
  storedFilename: "score.pdf",
  fileType: "pdf",
  mimeType: "application/pdf",
  fileSize: 2048,
  uploadStatus: "converted",
  conversionStatus: "converted",
  errorMessage: null,
  warnings: null,
  confidence: 0.93,
  musicxmlFilename: "score.musicxml",
  isFavorite: false,
  createdAt: "2026-07-27T00:00:00.000Z",
  updatedAt: "2026-07-27T00:00:00.000Z",
  convertedAt: "2026-07-27T00:00:00.000Z"
};

describe("regressão do fluxo principal web", () => {
  beforeEach(() => {
    vi.mocked(api).mockReset();
    vi.mocked(downloadMidi).mockReset();
    vi.mocked(downloadMusicXml).mockReset();
    vi.mocked(downloadMidi).mockResolvedValue(undefined);
    vi.mocked(downloadMusicXml).mockResolvedValue(undefined);
  });

  it("faz login, abre a conversão, alterna o preview e baixa MusicXML e MIDI", async () => {
    vi.mocked(api).mockImplementation(async (path, options = {}) => {
      if (path === "/api/auth/me") throw new Error("Não autenticado");
      if (path === "/api/auth/login" && options.method === "POST") return { user } as never;
      if (path === "/api/scores") return { scores: [convertedScore] } as never;
      throw new Error(`Chamada não prevista: ${path}`);
    });

    render(<App />);

    fireEvent.change(await screen.findByLabelText("E-mail"), { target: { value: user.email } });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "segredo123" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("Envie PDF ou imagem da partitura")).toBeInTheDocument();
    expect(api).toHaveBeenCalledWith("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: user.email, password: "segredo123" })
    });

    fireEvent.click(screen.getByRole("button", { name: "Minhas partituras" }));
    expect(await screen.findByText(convertedScore.originalFilename)).toBeInTheDocument();
    expect(screen.getByText("Convertido")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Ver detalhes" }));
    expect(await screen.findByTestId("score-player")).toHaveTextContent("Player score-1: Estudo final.pdf");

    fireEvent.click(screen.getByRole("tab", { name: "Arquivo original" }));
    expect(screen.getByTitle(convertedScore.originalFilename)).toHaveAttribute(
      "src",
      "http://localhost:4000/api/scores/score-1/preview"
    );

    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Baixar MusicXML" }));
    await waitFor(() => expect(downloadMusicXml).toHaveBeenCalledWith("score-1", "Estudo final.musicxml"));
    expect(await screen.findByText("Download iniciado: Estudo final.musicxml")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Baixar MIDI" }));
    await waitFor(() => expect(downloadMidi).toHaveBeenCalledWith("score-1", "Estudo final.mid"));
    expect(await screen.findByText("Download iniciado: Estudo final.mid")).toBeInTheDocument();
  });

  it("envia PDF e apresenta o resultado convertido após atualizar a lista", async () => {
    let uploaded = false;
    vi.mocked(api).mockImplementation(async (path, options = {}) => {
      if (path === "/api/auth/me") return { user } as never;
      if (path === "/api/scores" && options.method === "POST") {
        const body = options.body as FormData;
        expect(body.get("file")).toBeInstanceOf(File);
        uploaded = true;
        return { score: convertedScore } as never;
      }
      if (path === "/api/scores") return { scores: uploaded ? [convertedScore] : [] } as never;
      throw new Error(`Chamada não prevista: ${path}`);
    });

    const view = render(<App />);
    expect(await screen.findByText("Envie PDF ou imagem da partitura")).toBeInTheDocument();

    const file = new File(["partitura"], "Estudo final.pdf", { type: "application/pdf" });
    const input = view.container.querySelector<HTMLInputElement>('input[type="file"][accept^=".pdf"]');
    expect(input).not.toBeNull();
    fireEvent.change(input!, { target: { files: [file] } });
    expect(screen.getByText(file.name)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() => expect(api).toHaveBeenCalledWith("/api/scores", expect.objectContaining({
      method: "POST",
      body: expect.any(FormData)
    })));
    expect(await screen.findByText("Envie PDF ou imagem da partitura")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Minhas partituras" }));
    expect(await screen.findByText(convertedScore.originalFilename)).toBeInTheDocument();
    expect(screen.getByText("Convertido")).toBeInTheDocument();
  });
});

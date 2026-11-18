import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, bulkScoreAction, deleteScore, downloadMidi, downloadMusicXml } from "../api/client.js";
import type { Score, User } from "../types/domain.js";
import { App } from "./App.js";

vi.mock("../api/client.js", () => ({
  ApiError: class MockApiError extends Error {
    status: number | null;
    constructor(message: string, status: number | null = null) {
      super(message);
      this.name = "ApiError";
      this.status = status;
    }
  },
  api: vi.fn(),
  bulkScoreAction: vi.fn(),
  deleteScore: vi.fn(),
  listTrashScores: vi.fn().mockResolvedValue([]),
  restoreScore: vi.fn(),
  downloadMidi: vi.fn(),
  downloadMusicXml: vi.fn(),
  previewUrl: (scoreId: string) => `http://localhost:4000/api/scores/${scoreId}/preview`
}));

vi.mock("../components/ScorePlayer.js", async () => {
  const React = await import("react");
  let nextInstance = 0;
  return {
    ScorePlayer: ({ scoreId, scoreName, allowPlayback, onStatusChange }: { scoreId: string; scoreName: string; allowPlayback?: boolean; onStatusChange?: (state: "ready") => void }) => {
      const instance = React.useMemo(() => ++nextInstance, []);
      React.useEffect(() => onStatusChange?.("ready"), [onStatusChange]);
      return React.createElement("div", {
        "data-testid": "score-player",
        "data-player-instance": String(instance),
        "data-allow-playback": String(allowPlayback)
      }, `Player ${scoreId}: ${scoreName}`);
    }
  };
});

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
  scoreType: "melody",
  scoreTypeSelected: true,
  resultStatus: "complete",
  coverage: {
    totalPages: 1,
    processedPages: [1],
    missingPages: [],
    pages: [{ page: 1, status: "processed", parts: [{ id: "melody", name: "Melodia", staffCount: 1, staves: [1] }] }]
  },
  attempts: [],
  canPlay: true,
  canExportMidi: true,
  canDownloadMusicXml: true,
  reviewStatus: "approved",
  reviewRevision: "xml-revision-complete-1",
  errorMessage: null,
  warnings: null,
  confidence: 0.93,
  musicxmlFilename: "score.musicxml",
  isFavorite: false,
  createdAt: "2026-07-27T00:00:00.000Z",
  updatedAt: "2026-07-27T00:00:00.000Z",
  convertedAt: "2026-07-27T00:00:00.000Z"
};

const queuedScore: Score = {
  ...convertedScore,
  uploadStatus: "queued",
  conversionStatus: "queued",
  resultStatus: null,
  coverage: null,
  attempts: [{
    id: "attempt-1",
    scoreId: convertedScore.id,
    kind: "initial",
    status: "processing",
    errorCode: null,
    errorMessage: null,
    coverage: null,
    musicxmlFilename: null,
    createdAt: "2026-07-27T00:00:00.000Z",
    startedAt: "2026-07-27T00:00:05.000Z",
    finishedAt: null
  }],
  canPlay: false,
  canExportMidi: false,
  musicxmlFilename: null,
  convertedAt: null
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
      if (path === "/api/auth/me") throw new ApiError("Não autenticado", 401);
      if (path === "/api/auth/login" && options.method === "POST") return { user } as never;
      if (path === "/api/scores/score-1") return { score: convertedScore } as never;
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

  it("abre uma partitura aprovada com player de escuta e sem revisão manual", async () => {
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === "/api/auth/me") return { user } as never;
      if (path === "/api/scores/score-1") return { score: convertedScore } as never;
      if (path === "/api/scores") return { scores: [convertedScore] } as never;
      throw new Error(`Chamada não prevista: ${path}`);
    });

    const view = render(<App />);
    expect(await screen.findByText("Envie PDF ou imagem da partitura")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Minhas partituras" }));
    expect(await screen.findByText(convertedScore.originalFilename)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ver detalhes" }));

    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByTestId("score-player")).toHaveAttribute("data-allow-playback", "true");
    expect(within(dialog).queryByRole("button", { name: "Aceitar correção" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Manter resultado" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /finalizar com ressalvas|Confira as alterações/ })).not.toBeInTheDocument();
    view.unmount();
  });

  it("envia PDF e apresenta o resultado convertido após atualizar a lista", async () => {
    let uploaded = false;
    let uploadAttempts = 0;
    vi.mocked(api).mockImplementation(async (path, options = {}) => {
      if (path === "/api/auth/me") return { user } as never;
      if (path === "/api/scores" && options.method === "POST") {
        uploadAttempts += 1;
        const body = options.body as FormData;
        expect(body.get("file")).toBeInstanceOf(File);
        expect(body.get("scoreType")).toBe("guitar_duo");
        if (uploadAttempts === 1) throw new Error("Conexão interrompida.");
        uploaded = true;
        return { score: convertedScore } as never;
      }
      if (path === "/api/scores/score-1") return { score: convertedScore } as never;
      if (path === "/api/scores") return { scores: uploaded ? [convertedScore] : [] } as never;
      throw new Error(`Chamada não prevista: ${path}`);
    });

    const view = render(<App />);
    expect(await screen.findByText("Envie PDF ou imagem da partitura")).toBeInTheDocument();

    const file = new File(["partitura"], "Estudo final.pdf", { type: "application/pdf" });
    const input = view.container.querySelector<HTMLInputElement>('input[type="file"][accept^=".pdf"]');
    expect(input).not.toBeNull();
    fireEvent.change(input!, { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText("Tipo de partitura"), { target: { value: "guitar_duo" } });
    expect(screen.getByText(file.name)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Conexão interrompida.");
    expect(screen.getByText(file.name)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText("Envio recebido: Estudo final.pdf")).toBeInTheDocument();
    expect(uploadAttempts).toBe(2);
    expect(screen.getByRole("button", { name: "Ver andamento" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Minhas partituras" }));
    expect(await screen.findByText(convertedScore.originalFilename)).toBeInTheDocument();
    expect(screen.getByText("Convertido")).toBeInTheDocument();
  });

  it("atualiza uma partitura para convertida sem fechar os detalhes", async () => {
    let converted = false;
    const intervalSpy = vi.spyOn(window, "setInterval");
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === "/api/auth/me") return { user } as never;
      if (path === "/api/scores/score-1") return { score: converted ? convertedScore : queuedScore } as never;
      if (path === "/api/scores") return { scores: [converted ? convertedScore : queuedScore] } as never;
      throw new Error(`Chamada não prevista: ${path}`);
    });

    const view = render(<App />);
    expect(await screen.findByText("Envie PDF ou imagem da partitura")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Minhas partituras" }));
    expect(await screen.findByText(queuedScore.originalFilename)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ver detalhes" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Na fila")).toBeInTheDocument();
    await waitFor(() => expect(intervalSpy.mock.calls.some(([, delay]) => delay === 5000)).toBe(true));

    converted = true;
    const poll = intervalSpy.mock.calls.find(([, delay]) => delay === 5000)?.[0];
    expect(typeof poll).toBe("function");
    await act(async () => {
      (poll as () => void)();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(await within(dialog).findByTestId("score-player")).toHaveTextContent(convertedScore.originalFilename);
    expect(within(dialog).getByText("Convertido")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBe(dialog);
    view.unmount();
    intervalSpy.mockRestore();
  });

  it("preserva a lista após erro de polling e oferece nova atualização", async () => {
    let listCalls = 0;
    const intervalSpy = vi.spyOn(window, "setInterval");
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === "/api/auth/me") return { user } as never;
      if (path === "/api/scores") {
        listCalls += 1;
        if (listCalls === 2) throw new Error("Conexão interrompida.");
        return { scores: [listCalls > 2 ? convertedScore : queuedScore] } as never;
      }
      throw new Error(`Chamada não prevista: ${path}`);
    });

    const view = render(<App />);
    expect(await screen.findByText("Envie PDF ou imagem da partitura")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Minhas partituras" }));
    expect(await screen.findByText(queuedScore.originalFilename)).toBeInTheDocument();
    await waitFor(() => expect(intervalSpy.mock.calls.some(([, delay]) => delay === 5000)).toBe(true));
    const poll = intervalSpy.mock.calls.find(([, delay]) => delay === 5000)?.[0];
    expect(typeof poll).toBe("function");

    await act(async () => {
      (poll as () => void)();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("Conexão interrompida.");
    expect(screen.getByText(queuedScore.originalFilename)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText("Convertido")).toBeInTheDocument();
    expect(listCalls).toBe(3);
    view.unmount();
    intervalSpy.mockRestore();
  });

  it("seleciona várias partituras para favoritar e mover para a lixeira", async () => {
    const secondScore = { ...convertedScore, id: "score-2", originalFilename: "Escala.pdf" };
    vi.mocked(api).mockImplementation(async (path, options = {}) => {
      if (path === "/api/auth/me") return { user } as never;
      if (path === "/api/scores/score-1/favorite") return { score: { ...convertedScore, isFavorite: true } } as never;
      if (path === "/api/scores/score-2/favorite") return { score: { ...secondScore, isFavorite: true } } as never;
      if (path === "/api/scores") return { scores: [convertedScore, secondScore] } as never;
      throw new Error(`Chamada não prevista: ${path} ${options.method ?? "GET"}`);
    });
    vi.mocked(deleteScore).mockResolvedValue(undefined);
    vi.mocked(bulkScoreAction).mockResolvedValue(undefined);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<App />);
    expect(await screen.findByText("Envie PDF ou imagem da partitura")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Minhas partituras" }));
    expect(await screen.findByText(convertedScore.originalFilename)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Selecionar" }));
    fireEvent.click(screen.getByRole("checkbox", { name: `Selecionar ${convertedScore.originalFilename}` }));
    fireEvent.click(screen.getByRole("checkbox", { name: `Selecionar ${secondScore.originalFilename}` }));
    expect(within(screen.getByRole("toolbar")).getByText("2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Favoritar" }));
    await waitFor(() => expect(bulkScoreAction).toHaveBeenCalledWith(["score-1", "score-2"], "favorite", true));
    expect(screen.getByRole("button", { name: "Selecionar" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Selecionar" }));
    fireEvent.click(screen.getByRole("button", { name: "Selecionar todas" }));
    fireEvent.click(within(screen.getByRole("toolbar")).getByRole("button", { name: "Excluir" }));
    await waitFor(() => expect(bulkScoreAction).toHaveBeenCalledWith(["score-1", "score-2"], "delete"));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Mover 2 partituras"));
    confirm.mockRestore();
  });

  it("ignora a lista da conta anterior quando a resposta chega após entrar em outra conta", async () => {
    const otherUser = { ...user, id: "user-2", name: "Bruno", email: "bruno@example.com" };
    const otherScore = { ...convertedScore, id: "score-2", userId: otherUser.id, originalFilename: "Partitura do Bruno.pdf" };
    let resolveOldList!: (value: { scores: Score[] }) => void;
    const oldList = new Promise<{ scores: Score[] }>((resolve) => { resolveOldList = resolve; });
    let listCalls = 0;
    vi.mocked(api).mockImplementation(async (path, options = {}) => {
      if (path === "/api/auth/me") return { user } as never;
      if (path === "/api/auth/logout") return undefined as never;
      if (path === "/api/auth/login" && options.method === "POST") return { user: otherUser } as never;
      if (path === "/api/scores") {
        listCalls += 1;
        return (listCalls === 1 ? oldList : { scores: [otherScore] }) as never;
      }
      throw new Error(`Chamada não prevista: ${path}`);
    });

    render(<App />);
    expect(await screen.findByText("Envie PDF ou imagem da partitura")).toBeInTheDocument();
    await waitFor(() => expect(listCalls).toBe(1));
    fireEvent.click(screen.getAllByRole("button", { name: "Sair" })[0]);
    fireEvent.change(await screen.findByLabelText("E-mail"), { target: { value: otherUser.email } });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "segredo123" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("Envie PDF ou imagem da partitura")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Minhas partituras" }));
    expect(await screen.findByText(otherScore.originalFilename)).toBeInTheDocument();
    expect(listCalls).toBe(2);
    await act(async () => { resolveOldList({ scores: [convertedScore] }); });
    expect(screen.getByText(otherScore.originalFilename)).toBeInTheDocument();
    expect(screen.queryByText(convertedScore.originalFilename)).not.toBeInTheDocument();
  });
});

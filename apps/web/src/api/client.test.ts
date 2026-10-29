import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, approveScoreReview, bulkScoreAction, decideVisualReviewProposal, deleteScore, downloadMidi, downloadMusicXml, downloadScoreVersionMusicXml, fetchFirstPagePreview, fetchMusicXml, fetchScoreVersions, fetchScoreVersionMusicXml, fetchSourceEvidence, listTrashScores, restoreScore } from "./client.js";

describe("cliente HTTP web", () => {
  const fetchMock = vi.fn();
  const click = vi.fn();
  const createObjectURL = vi.fn(() => "blob:score-download");
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    click.mockReset();
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(click);
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
  });

  afterEach(() => vi.useRealTimers());

  it("mantém a sessão no login e envia JSON com o tipo correto", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ user: { id: "user-1" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));

    await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "ana@example.com", password: "segredo123" })
    });

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:4000/api/auth/login", expect.objectContaining({
      method: "POST",
      credentials: "include",
      body: JSON.stringify({ email: "ana@example.com", password: "segredo123" })
    }));
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(new Headers(request.headers).get("Content-Type")).toBe("application/json");
  });

  it("envia upload multipart sem sobrescrever o boundary do navegador", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ score: { id: "score-1" } }), { status: 200 }));
    const formData = new FormData();
    formData.append("file", new File(["score"], "estudo.pdf", { type: "application/pdf" }));

    await api("/api/scores", { method: "POST", body: formData });

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(request.credentials).toBe("include");
    expect(request.body).toBe(formData);
    expect(new Headers(request.headers).has("Content-Type")).toBe(false);
  });

  it("carrega o MusicXML autenticado pelo endpoint de download", async () => {
    fetchMock.mockResolvedValue(new Response("<score-partwise />", { status: 200 }));

    await expect(fetchMusicXml("score-1")).resolves.toBe("<score-partwise />");
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:4000/api/scores/score-1/download", {
      credentials: "include"
    });
  });

  it("carrega a prévia do MusicXML sem finalizar e envia a revisão da mesma versão", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("<score-partwise />", { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ score: { id: "score-1", reviewStatus: "approved" } }), { status: 200 }));

    await expect(fetchMusicXml("score-1", true)).resolves.toBe("<score-partwise />");
    await expect(approveScoreReview("score-1", "xml-revision-3")).resolves.toMatchObject({ reviewStatus: "approved" });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://localhost:4000/api/scores/score-1/download?preview=true", { credentials: "include" });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "http://localhost:4000/api/scores/score-1/review", expect.objectContaining({
      method: "POST",
      credentials: "include",
      body: JSON.stringify({ revision: "xml-revision-3" })
    }));
  });

  it("carrega a prévia inicial com cookies e mantém a revisão na query, sem credenciais na URL", async () => {
    const revision = "b".repeat(64);
    const signal = new AbortController().signal;
    fetchMock.mockResolvedValue(new Response("<score-partwise />", { status: 200 }));

    await expect(fetchFirstPagePreview("score/1", revision, signal)).resolves.toBe("<score-partwise />");

    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:4000/api/scores/score%2F1/first-page-preview?revision=${revision}`,
      expect.objectContaining({ credentials: "include", signal, headers: { Accept: "application/vnd.recordare.musicxml+xml" } })
    );
  });

  it("lista versões e carrega o XML histórico sem perder a identidade da versão", async () => {
    const versions = [{ id: "revision:abc123", label: "Correção 1", kind: "correction", revision: "abc123", createdAt: "2026-10-20T12:00:00.000Z", isCurrent: false, status: "needs_review", coverage: null, available: true }];
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ versions }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response("<score-partwise />", { status: 200 }));
    const signal = new AbortController().signal;

    await expect(fetchScoreVersions("score/1", signal)).resolves.toEqual(versions);
    await expect(fetchScoreVersionMusicXml("score/1", "revision:abc123", signal)).resolves.toBe("<score-partwise />");

    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://localhost:4000/api/scores/score%2F1/versions", expect.objectContaining({ credentials: "include", signal }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "http://localhost:4000/api/scores/score%2F1/versions/revision%3Aabc123/musicxml", expect.objectContaining({ credentials: "include", signal }));
  });

  it("exports historical MusicXML with a stable version filename", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(new Response("<score-partwise />", { status: 200 }));

    await downloadScoreVersionMusicXml("score-1", "attempt:attempt-2", "Study-previous-version.musicxml");

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:4000/api/scores/score-1/versions/attempt%3Aattempt-2/musicxml", expect.objectContaining({
      credentials: "include",
      headers: { Accept: "application/vnd.recordare.musicxml+xml" }
    }));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click.mock.instances[0]).toMatchObject({ download: "Study-previous-version.musicxml" });
  });

  it("does not save historical MusicXML if the request is aborted before the file is saved", async () => {
    const controller = new AbortController();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => {
        controller.abort();
        return "<score-partwise />";
      }
    });

    await expect(downloadScoreVersionMusicXml("score-1", "revision:old", "Study-old.musicxml", controller.signal))
      .rejects.toMatchObject({ name: "AbortError" });
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
  });

  it("registra decisões da revisão visual e carrega evidência privada com cookies", async () => {
    const signal = new AbortController().signal;
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ score: { id: "score-1", reviewRevision: "xml-revision-4" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(new Blob(["source-image"]), { status: 200 }));

    await expect(decideVisualReviewProposal("score/1", "xml-revision-4", "proposal-2", "reject", signal))
      .resolves.toMatchObject({ id: "score-1", reviewRevision: "xml-revision-4" });
    await expect(fetchSourceEvidence("score/1", "crop 2.png")).resolves.toBeInstanceOf(Blob);

    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://localhost:4000/api/scores/score%2F1/visual-review/decision", expect.objectContaining({
      method: "POST",
      credentials: "include",
      signal,
      body: JSON.stringify({ revision: "xml-revision-4", proposalId: "proposal-2", decision: "reject" })
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "http://localhost:4000/api/scores/score%2F1/evidence/crop%202.png", expect.objectContaining({ credentials: "include" }));
  });

  it("baixa MusicXML e MIDI com os nomes fornecidos pela interface", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, blob: async () => new Blob(["xml"]) })
      .mockResolvedValueOnce({ ok: true, status: 200, blob: async () => new Blob(["midi"]) });

    await downloadMusicXml("score-1", "Estudo.musicxml");
    await downloadMidi("score-1", "Estudo.mid");

    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://localhost:4000/api/scores/score-1/download", {
      credentials: "include"
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "http://localhost:4000/api/scores/score-1/midi", {
      credentials: "include"
    });
    expect(createObjectURL).toHaveBeenCalledTimes(2);
    expect(click).toHaveBeenCalledTimes(2);
    expect(click.mock.instances.map((link) => (link as HTMLAnchorElement).download)).toEqual([
      "Estudo.musicxml",
      "Estudo.mid"
    ]);
    expect(document.querySelectorAll("a")).toHaveLength(0);
  });

  it("move, lista e restaura partituras pela lixeira", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ scores: [{ id: "score-1" }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ score: { id: "score-1" } }), { status: 200 }));

    await deleteScore("score-1");
    await expect(listTrashScores()).resolves.toEqual([{ id: "score-1" }]);
    await expect(restoreScore("score-1")).resolves.toEqual({ id: "score-1" });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://localhost:4000/api/scores/score-1", expect.objectContaining({ method: "DELETE" }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "http://localhost:4000/api/scores/trash", expect.objectContaining({ credentials: "include" }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, "http://localhost:4000/api/scores/score-1/restore", expect.objectContaining({ method: "POST" }));
  });

  it("envia ações em lote com ids e estado de favorito", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ updatedCount: 2 }), { status: 200 }));

    await bulkScoreAction(["score-1", "score-2"], "favorite", true);

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:4000/api/scores/bulk", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ ids: ["score-1", "score-2"], action: "favorite", isFavorite: true })
    }));
  });
});

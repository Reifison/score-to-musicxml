import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, downloadMidi, downloadMusicXml, fetchMusicXml } from "./client.js";

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
});

import { describe, expect, it, vi } from "vitest";
import { createMidiDownloadPlan, runMidiDownload, type MidiDownloadOperations } from "./midiExport";

describe("createMidiDownloadPlan", () => {
  it("descreve download autenticado, idempotente e isolado no cache", () => {
    const plan = createMidiDownloadPlan("https://api.example.com", "token-secreto", {
      id: "score/42",
      originalFilename: "../../Estudo nº 1.pdf",
      userId: "user/7"
    });

    expect(plan).toEqual({
      directorySegments: ["midi-exports", "user_7", "score_42"],
      filename: "Estudo n_ 1.mid",
      headers: { Authorization: "Bearer token-secreto" },
      idempotent: true,
      legacyFilename: "score_42.mid",
      url: "https://api.example.com/api/scores/score%2F42/midi"
    });
  });
});

type TestFile = { uri: string; bytes: number };

function operations(overrides: Partial<MidiDownloadOperations<TestFile>> = {}) {
  return {
    ensureDirectory: vi.fn(),
    download: vi.fn(async () => ({ uri: "file:///cache/score.mid", bytes: 42 })),
    removeLegacy: vi.fn(),
    removeStale: vi.fn(),
    ...overrides
  } satisfies MidiDownloadOperations<TestFile>;
}

const plan = createMidiDownloadPlan("https://api.example.com", "token", {
  id: "score-id",
  originalFilename: "Minha partitura.pdf",
  userId: "user-id"
});

describe("runMidiDownload", () => {
  it("cria o destino, baixa e só então remove versões antigas", async () => {
    const calls: string[] = [];
    const ops = operations({
      ensureDirectory: vi.fn(() => { calls.push("directory"); }),
      download: vi.fn(async () => {
        calls.push("download");
        return { uri: "file:///cache/Minha partitura.mid", bytes: 128 };
      }),
      removeStale: vi.fn(() => { calls.push("stale"); }),
      removeLegacy: vi.fn(() => { calls.push("legacy"); })
    });

    const result = await runMidiDownload(plan, ops);

    expect(result).toEqual({ uri: "file:///cache/Minha partitura.mid", bytes: 128 });
    expect(calls).toEqual(["directory", "download", "stale", "legacy"]);
    expect(ops.download).toHaveBeenCalledWith(plan);
    expect(ops.removeStale).toHaveBeenCalledWith(plan.directorySegments, result.uri);
    expect(ops.removeLegacy).toHaveBeenCalledWith(plan.legacyFilename, result.uri);
  });

  it("preserva arquivos antigos quando o download falha", async () => {
    const failure = new Error("sem conexão");
    const ops = operations({ download: vi.fn(async () => { throw failure; }) });

    await expect(runMidiDownload(plan, ops)).rejects.toBe(failure);
    expect(ops.removeStale).not.toHaveBeenCalled();
    expect(ops.removeLegacy).not.toHaveBeenCalled();
  });

  it("propaga falha ao preparar o cache sem tentar baixar", async () => {
    const failure = new Error("cache indisponível");
    const ops = operations({ ensureDirectory: vi.fn(() => { throw failure; }) });

    await expect(runMidiDownload(plan, ops)).rejects.toBe(failure);
    expect(ops.download).not.toHaveBeenCalled();
  });

  it("não transforma limpeza best-effort em falha de exportação", async () => {
    const ops = operations({
      removeStale: vi.fn(() => { throw new Error("stale bloqueado"); }),
      removeLegacy: vi.fn(() => { throw new Error("legado bloqueado"); })
    });

    await expect(runMidiDownload(plan, ops)).resolves.toEqual({
      uri: "file:///cache/score.mid",
      bytes: 42
    });
  });
});

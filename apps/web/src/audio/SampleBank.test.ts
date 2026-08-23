import { describe, expect, it, vi } from "vitest";
import { SampleBank } from "./SampleBank";
import type { AudioContextLike, AudioNodeLike, AudioParamLike, AudioBufferSourceNodeLike } from "./types";

const param = (): AudioParamLike => ({
  value: 0,
  cancelScheduledValues: vi.fn(),
  setValueAtTime: vi.fn(),
  linearRampToValueAtTime: vi.fn(),
  exponentialRampToValueAtTime: vi.fn()
});

function createContext() {
  const destination: AudioNodeLike = { connect: (node) => node, disconnect: vi.fn() };
  const gains: Array<{ gain: AudioParamLike }> = [];
  const source = {
    buffer: null,
    playbackRate: param(),
    connect: vi.fn((node: AudioNodeLike) => node),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null
  } as unknown as AudioBufferSourceNodeLike;
  const context = {
    currentTime: 0,
    state: "running" as AudioContextState,
    destination,
    createOscillator: vi.fn(),
    createGain: vi.fn(() => {
      const gain = {
        gain: param(),
        connect: vi.fn((node: AudioNodeLike) => node),
        disconnect: vi.fn()
      };
      gains.push(gain);
      return gain;
    }),
    createBufferSource: vi.fn(() => source),
    decodeAudioData: vi.fn(async () => ({ duration: 2 }))
  } as unknown as AudioContextLike;
  return { context, source, gains };
}

describe("SampleBank", () => {
  it("mantém o banco indisponível sem manifestos licenciados", async () => {
    const { context } = createContext();
    const fetcher = vi.fn();
    const bank = new SampleBank(context, context.destination, { fetcher });

    await expect(bank.preload("piano")).resolves.toBe(false);
    expect(bank.getSnapshot("piano")).toMatchObject({ status: "unavailable", totalSamples: 0 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("pré-carrega uma vez, usa cache e agenda a fonte local", async () => {
    const { context, source, gains } = createContext();
    const fetcher = vi.fn(async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(4) } as Response));
    const bank = new SampleBank(context, context.destination, {
      fetcher,
      manifests: { piano: { instrument: "piano", samples: [{ url: "/audio/piano-c4.wav", midi: 60 }] } }
    });

    await expect(bank.preload("piano")).resolves.toBe(true);
    await expect(bank.preload("piano")).resolves.toBe(true);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(bank.getSnapshot("piano")).toMatchObject({ status: "ready", loadedSamples: 1 });
    expect(bank.schedule("piano", 72, 0.8, 1, 0.5)).toBe(true);
    // Buffer duration is compensated for the 2x playback rate, with the
    // default 60 ms tail retained for a click-free release.
    expect(source.start).toHaveBeenCalledWith(1, 0, 1.12);
    expect(source.stop).toHaveBeenCalledWith(1.57);
    expect(source.playbackRate.setValueAtTime).toHaveBeenCalledWith(2, 1);
  });

  it("aplica envelope ao sample e saneia duração/velocidade inválidas", async () => {
    const { context, source, gains } = createContext();
    const fetcher = vi.fn(async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(4) } as Response));
    const bank = new SampleBank(context, context.destination, {
      fetcher,
      manifests: { piano: { instrument: "piano", samples: [{ url: "/audio/piano-c4.wav", midi: 60 }] } }
    });

    await bank.preload("piano");
    expect(bank.schedule("piano", 60, Number.NaN, 1, Number.NaN)).toBe(true);
    expect(gains[0].gain.setValueAtTime).toHaveBeenCalledWith(0.0001, 1);
    expect(source.playbackRate.setValueAtTime).toHaveBeenCalledWith(1, 1);
    expect(source.start).toHaveBeenCalledWith(1, 0, 0.015);
  });

  it("recusa URLs remotas para impedir dependência de CDN", async () => {
    const { context } = createContext();
    const bank = new SampleBank(context, context.destination, {
      fetcher: vi.fn(),
      manifests: { guitar: { instrument: "guitar", samples: [{ url: "https://cdn.invalid/guitar.wav", midi: 60 }] } }
    });

    await expect(bank.preload("guitar")).resolves.toBe(false);
    expect(bank.getSnapshot("guitar").status).toBe("error");
  });
});

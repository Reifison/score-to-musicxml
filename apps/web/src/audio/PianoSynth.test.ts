import { describe, expect, it, vi } from "vitest";
import { PianoSynth } from "./PianoSynth";
import type { AudioContextLike, AudioNodeLike, AudioParamLike, OscillatorNodeLike } from "./types";

const param = (): AudioParamLike => ({
  value: 0,
  cancelScheduledValues: vi.fn(),
  setValueAtTime: vi.fn(),
  linearRampToValueAtTime: vi.fn(),
  exponentialRampToValueAtTime: vi.fn()
});

function createContext() {
  const destination: AudioNodeLike = { connect: (node) => node, disconnect: vi.fn() };
  const gain = { gain: param(), connect: vi.fn((node: AudioNodeLike) => node), disconnect: vi.fn() };
  const oscillator = {
    type: "triangle" as OscillatorType,
    frequency: param(),
    connect: vi.fn((node: AudioNodeLike) => node),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null
  } as unknown as OscillatorNodeLike;
  const context = {
    currentTime: 0,
    state: "running" as AudioContextState,
    destination,
    createOscillator: vi.fn(() => oscillator),
    createGain: vi.fn(() => gain),
    resume: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined)
  } as unknown as AudioContextLike;
  return { context, oscillator, gain };
}

describe("PianoSynth", () => {
  it("encaminha o oscilador para o barramento informado por nota", () => {
    const { context, oscillator, gain } = createContext();
    const output: AudioNodeLike = { connect: (node) => node, disconnect: vi.fn() };
    const synth = new PianoSynth(context);

    synth.schedule({ midi: 60, velocity: 0.8 }, 1, 0.5, output);

    expect(gain.connect).toHaveBeenCalledWith(output);
    expect(oscillator.connect).toHaveBeenCalledWith(gain);
  });

  it("mantém o destino padrão quando nenhum barramento é informado", () => {
    const { context, gain } = createContext();
    const synth = new PianoSynth(context);

    synth.schedule({ midi: 60 }, 1, 0.5);

    expect(gain.connect).toHaveBeenCalledWith(context.destination);
  });
});

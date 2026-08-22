import { describe, expect, it, vi } from "vitest";
import { WebAudioMidiEngine } from "./WebAudioMidiEngine";
import type {
  AudioContextLike,
  AudioNodeLike,
  AudioParamLike,
  GainNodeLike,
  IntervalScheduler,
  OscillatorNodeLike
} from "./types";

class FakeParam implements AudioParamLike {
  value = 0;
  readonly values: Array<{ value: number; time: number }> = [];

  cancelScheduledValues = vi.fn();
  setValueAtTime = vi.fn((value: number, time: number) => {
    this.value = value;
    this.values.push({ value, time });
  });
  linearRampToValueAtTime = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
}

class FakeNode implements AudioNodeLike {
  connect = vi.fn((_destination: AudioNodeLike) => _destination);
  disconnect = vi.fn();
}

class FakeOscillator extends FakeNode implements OscillatorNodeLike {
  frequency = new FakeParam();
  type: OscillatorType = "sine";
  onended: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
}

class FakeGain extends FakeNode implements GainNodeLike {
  gain = new FakeParam();
}

class FakeAudioContext implements AudioContextLike {
  currentTime = 0;
  state: AudioContextState = "suspended";
  destination = new FakeNode();
  oscillators: FakeOscillator[] = [];
  gains: FakeGain[] = [];
  resume = vi.fn(async () => {
    this.state = "running";
  });
  close = vi.fn(async () => {
    this.state = "closed";
  });
  createOscillator = vi.fn(() => {
    const oscillator = new FakeOscillator();
    this.oscillators.push(oscillator);
    return oscillator;
  });
  createGain = vi.fn(() => {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  });
}

const createScheduler = () => {
  let callback: (() => void) | undefined;
  const scheduler: IntervalScheduler = {
    set: vi.fn((next) => {
      callback = next;
      return 1;
    }),
    clear: vi.fn()
  };
  return { scheduler, run: () => callback?.() };
};

describe("WebAudioMidiEngine", () => {
  it("não cria nem retoma áudio antes de um gesto explícito", async () => {
    const context = new FakeAudioContext();
    const contextFactory = vi.fn(() => context);
    const engine = new WebAudioMidiEngine({ contextFactory });

    engine.load([{ pitch: 69, startMs: 0, durationMs: 500 }]);
    engine.setTempo(90);

    expect(contextFactory).not.toHaveBeenCalled();
    expect(context.resume).not.toHaveBeenCalled();

    await engine.playFromUserGesture();

    expect(contextFactory).toHaveBeenCalledOnce();
    expect(context.resume).toHaveBeenCalledOnce();
  });

  it("não ativa áudio quando não há eventos reproduzíveis", async () => {
    const contextFactory = vi.fn(() => new FakeAudioContext());
    const engine = new WebAudioMidiEngine({ contextFactory });

    await engine.play([]);

    expect(contextFactory).not.toHaveBeenCalled();
    expect(engine.getSnapshot().state).toBe("ended");
  });

  it("agenda uma nota MIDI com frequência e duração corretas", async () => {
    const context = new FakeAudioContext();
    const engine = new WebAudioMidiEngine({ contextFactory: () => context });
    engine.load([{ pitch: 69, startMs: 0, durationMs: 500, velocity: 0.8 }]);

    await engine.playFromUserGesture();

    expect(context.oscillators).toHaveLength(1);
    expect(context.oscillators[0].frequency.values[0]).toEqual({ value: 440, time: 0 });
    expect(context.oscillators[0].start).toHaveBeenCalledWith(0);
    expect(context.oscillators[0].stop).toHaveBeenCalledWith(0.51);
  });

  it("pausa, retoma da posição musical e encerra no fim", async () => {
    const context = new FakeAudioContext();
    const timer = createScheduler();
    const engine = new WebAudioMidiEngine({ contextFactory: () => context, scheduler: timer.scheduler });
    engine.load([{ pitch: 60, startMs: 0, durationMs: 1_000 }]);
    await engine.playFromUserGesture();

    context.currentTime = 0.25;
    engine.pause();
    expect(engine.getSnapshot()).toMatchObject({ state: "paused", positionMs: 250 });

    await engine.resumeFromUserGesture();
    context.currentTime = 1;
    timer.run();

    expect(engine.getSnapshot()).toMatchObject({ state: "ended", positionMs: 1_000 });
    expect(timer.scheduler.clear).toHaveBeenCalled();
  });

  it("altera o andamento durante a execução sem alterar a afinação", async () => {
    const context = new FakeAudioContext();
    const engine = new WebAudioMidiEngine({ contextFactory: () => context, baseTempoBpm: 120 });
    engine.load([{ pitch: 69, startMs: 0, durationMs: 1_000 }]);
    await engine.playFromUserGesture();

    context.currentTime = 0.25;
    engine.setRate(0.5);

    expect(engine.getSnapshot()).toMatchObject({ state: "playing", positionMs: 250, rate: 0.5, tempo: 60 });
    expect(context.oscillators).toHaveLength(2);
    expect(context.oscillators.map((oscillator) => oscillator.frequency.values[0].value)).toEqual([440, 440]);
  });

  it("não agenda a mesma nota duas vezes dentro da janela de lookahead", async () => {
    const context = new FakeAudioContext();
    const timer = createScheduler();
    const engine = new WebAudioMidiEngine({ contextFactory: () => context, scheduler: timer.scheduler });
    engine.load([{ pitch: 60, startMs: 50, durationMs: 500 }]);

    await engine.play();
    timer.run();

    expect(context.oscillators).toHaveLength(1);
  });

  it("preserva pausas finais quando a duração total é fornecida", async () => {
    const engine = new WebAudioMidiEngine({ contextFactory: () => new FakeAudioContext() });
    engine.load([{ pitch: 60, startMs: 0, durationMs: 500 }], 1_000);

    expect(engine.getSnapshot().durationMs).toBe(1_000);
  });

  it("usa o andamento original como base e permite reposicionar", async () => {
    const context = new FakeAudioContext();
    const engine = new WebAudioMidiEngine({ contextFactory: () => context, baseTempoBpm: 90 });
    await engine.play([{ pitch: 60, startMs: 0, durationMs: 2_000 }]);

    engine.seek(750);
    engine.setTempo(120);

    expect(engine.positionMs()).toBe(750);
    expect(engine.getSnapshot()).toMatchObject({ tempo: 120, rate: 120 / 90 });
    expect(context.oscillators.every((oscillator) => oscillator.frequency.values[0].value > 261)).toBe(true);
  });

  it("interrompe vozes e fecha o contexto ao descartar", async () => {
    const context = new FakeAudioContext();
    const timer = createScheduler();
    const engine = new WebAudioMidiEngine({ contextFactory: () => context, scheduler: timer.scheduler });
    engine.load([{ pitch: 60, startMs: 0, durationMs: 2_000 }]);
    await engine.playFromUserGesture();

    engine.stop();
    expect(engine.getSnapshot()).toMatchObject({ state: "stopped", positionMs: 0 });
    expect(context.oscillators[0].stop).toHaveBeenCalled();

    await engine.dispose();
    expect(context.close).toHaveBeenCalledOnce();
    await expect(engine.playFromUserGesture()).rejects.toThrow("descartado");
  });

  it("rejeita andamentos fora do intervalo seguro", () => {
    const engine = new WebAudioMidiEngine();
    expect(() => engine.setTempo(10)).toThrow(RangeError);
    expect(() => engine.setTempo(401)).toThrow(RangeError);
  });
});

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

  it("expõe piano e violão com envelopes e formas de onda diferentes", async () => {
    const pianoContext = new FakeAudioContext();
    const piano = new WebAudioMidiEngine({ contextFactory: () => pianoContext, instrument: "piano" });
    await piano.play([{ pitch: 60, startMs: 0, durationMs: 500, velocity: 1 }]);

    const guitarContext = new FakeAudioContext();
    const guitar = new WebAudioMidiEngine({ contextFactory: () => guitarContext, instrument: "guitar" });
    await guitar.play([{ pitch: 60, startMs: 0, durationMs: 500, velocity: 1 }]);

    expect(piano.getInstrument()).toBe("piano");
    expect(guitar.getInstrument()).toBe("guitar");
    expect(pianoContext.oscillators[0].type).toBe("triangle");
    expect(guitarContext.oscillators[0].type).toBe("sawtooth");
    expect(pianoContext.gains[0].gain.values[1].value).toBeGreaterThan(guitarContext.gains[0].gain.values[1].value);
  });

  it("troca o instrumento durante a execução sem perder a posição", async () => {
    const context = new FakeAudioContext();
    const engine = new WebAudioMidiEngine({ contextFactory: () => context });
    engine.load([{ pitch: 60, startMs: 0, durationMs: 1_000 }]);
    await engine.playFromUserGesture();

    context.currentTime = 0.25;
    engine.setInstrument("guitar");

    expect(engine.getSnapshot()).toMatchObject({ state: "playing", positionMs: 250 });
    expect(context.oscillators.at(-1)?.type).toBe("sawtooth");
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

  it("usa uma antecipação padrão de pelo menos meio segundo", async () => {
    const context = new FakeAudioContext();
    const engine = new WebAudioMidiEngine({ contextFactory: () => context });
    engine.load([{ pitch: 60, startMs: 450, durationMs: 100 }]);

    await engine.playFromUserGesture();

    expect(context.oscillators).toHaveLength(1);
    expect(context.oscillators[0].start).toHaveBeenCalledWith(0.45);
  });

  it("expõe telemetria operacional para duas vozes sem conteúdo musical", async () => {
    const context = new FakeAudioContext();
    const engine = new WebAudioMidiEngine({ contextFactory: () => context });
    engine.load([
      { pitch: 60, startMs: 0, durationMs: 500, voiceId: "voice-a" },
      { pitch: 67, startMs: 0, durationMs: 500, voiceId: "voice-b" }
    ]);

    await engine.playFromUserGesture();

    expect(engine.getTelemetrySnapshot()).toMatchObject({
      expectedEvents: 2,
      scheduledEvents: 2,
      lateEvents: 0,
      duplicateEvents: 0,
      minScheduleHorizonMs: 500,
      activeVoices: 2,
      maxActiveVoices: 2
    });
    expect(engine.getTelemetrySnapshot()).not.toHaveProperty("pitch");
    expect(engine.getTelemetrySnapshot()).not.toHaveProperty("voiceId");
  });

  it("expõe vozes e alterna o mute por barramento sem reiniciar a reprodução", async () => {
    const context = new FakeAudioContext();
    const engine = new WebAudioMidiEngine({ contextFactory: () => context });
    engine.load([
      { pitch: 60, startMs: 0, durationMs: 500, voiceId: "voice-a" },
      { pitch: 67, startMs: 0, durationMs: 500, voiceId: "voice-b" }
    ]);

    expect(engine.getVoices()).toEqual([
      { id: "voice-a", label: "voice-a", muted: false },
      { id: "voice-b", label: "voice-b", muted: false }
    ]);
    engine.setVoiceMuted("voice-b", true);
    engine.setVoiceMuted("voice-b", true); // idempotent
    expect(engine.isVoiceMuted("voice-b")).toBe(true);

    await engine.playFromUserGesture();
    expect(context.gains[1].gain.value).toBe(0);
    expect(context.resume).toHaveBeenCalledTimes(1);

    engine.setVoiceMuted("voice-b", false);
    expect(engine.isVoiceMuted("voice-b")).toBe(false);
    expect(context.gains[1].gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(1, 0.015);
    expect(engine.getSnapshot().state).toBe("playing");
  });

  it("continua avançando quando todas as vozes estão silenciadas", async () => {
    const context = new FakeAudioContext();
    const engine = new WebAudioMidiEngine({ contextFactory: () => context });
    engine.load([
      { pitch: 60, startMs: 0, durationMs: 500, voiceId: "voice-a" },
      { pitch: 67, startMs: 0, durationMs: 500, voiceId: "voice-b" }
    ]);

    engine.setVoiceMuted("voice-a", true);
    engine.setVoiceMuted("voice-b", true);
    await engine.playFromUserGesture();

    expect(context.gains.slice(0, 2).map((gain) => gain.gain.value)).toEqual([0, 0]);
    expect(engine.getTelemetrySnapshot()).toMatchObject({ scheduledEvents: 2, activeVoices: 2 });
    expect(engine.getSnapshot().state).toBe("playing");
  });

  it("desconecta e libera os barramentos ao descartar o motor", async () => {
    const context = new FakeAudioContext();
    const engine = new WebAudioMidiEngine({ contextFactory: () => context });
    engine.load([{ pitch: 60, startMs: 0, durationMs: 100, voiceId: "voice-a" }]);
    await engine.playFromUserGesture();
    const bus = context.gains[0];

    await engine.dispose();

    expect(bus.disconnect).toHaveBeenCalledTimes(1);
    expect(engine.getVoices()).toEqual([]);
  });

  it("mede jitter do agendador e identifica uma nota atrasada", async () => {
    const context = new FakeAudioContext();
    const timer = createScheduler();
    const clockValues = [0, 80];
    const engine = new WebAudioMidiEngine({
      contextFactory: () => context,
      scheduler: timer.scheduler,
      clock: () => clockValues.shift() ?? 80
    });
    engine.load([{ pitch: 60, startMs: 550, durationMs: 1_000 }]);
    await engine.playFromUserGesture();

    context.currentTime = 0.7;
    timer.run();

    expect(engine.getTelemetrySnapshot()).toMatchObject({
      scheduledEvents: 1,
      lateEvents: 1,
      schedulerTicks: 2
    });
    expect(engine.getTelemetrySnapshot().schedulerJitterP95Ms).toBe(55);
  });

  it("mantém uma janela limitada para o p95 de jitter", async () => {
    const context = new FakeAudioContext();
    const timer = createScheduler();
    let now = 0;
    const engine = new WebAudioMidiEngine({
      contextFactory: () => context,
      scheduler: timer.scheduler,
      clock: () => now
    });
    engine.load([{ pitch: 60, startMs: 9_000, durationMs: 1_000 }], 10_000);
    await engine.playFromUserGesture();

    // Twenty old stalls must age out of the 128-sample diagnostic window.
    for (let index = 0; index < 20; index += 1) {
      now += 125;
      timer.run();
    }
    for (let index = 0; index < 140; index += 1) {
      now += 25;
      timer.run();
    }

    expect(engine.getTelemetrySnapshot()).toMatchObject({
      schedulerTicks: 161,
      schedulerJitterMs: 0,
      schedulerJitterP95Ms: 0
    });
  });

  it("registra um underrun quando um stall atravessa uma nota ainda não agendada", async () => {
    const context = new FakeAudioContext();
    const timer = createScheduler();
    const engine = new WebAudioMidiEngine({ contextFactory: () => context, scheduler: timer.scheduler });
    engine.load([{ pitch: 60, startMs: 600, durationMs: 100 }], 1_000);
    await engine.playFromUserGesture();

    context.currentTime = 0.8;
    timer.run();

    expect(engine.getTelemetrySnapshot()).toMatchObject({
      expectedEvents: 1,
      scheduledEvents: 0,
      underrunEvents: 1
    });
  });

  it("processa underruns pendentes antes de encerrar a reprodução", async () => {
    const context = new FakeAudioContext();
    const timer = createScheduler();
    const engine = new WebAudioMidiEngine({ contextFactory: () => context, scheduler: timer.scheduler });
    engine.load([{ pitch: 60, startMs: 900, durationMs: 100 }]);
    await engine.playFromUserGesture();

    context.currentTime = 1;
    timer.run();

    expect(engine.getSnapshot()).toMatchObject({ state: "ended", positionMs: 1_000 });
    expect(engine.getTelemetrySnapshot()).toMatchObject({
      scheduledEvents: 0,
      underrunEvents: 1,
      activeVoices: 0
    });
    expect(timer.scheduler.clear).toHaveBeenCalled();
  });

  it("libera vozes da geração anterior antes de retomar", async () => {
    const context = new FakeAudioContext();
    const engine = new WebAudioMidiEngine({ contextFactory: () => context });
    engine.load([{ pitch: 60, startMs: 0, durationMs: 1_000 }]);
    await engine.playFromUserGesture();

    engine.pause();
    await engine.resumeFromUserGesture();

    expect(engine.getTelemetrySnapshot()).toMatchObject({ activeVoices: 1, maxActiveVoices: 1 });
  });

  it("não conta como duplicação a reprogramação intencional após seek", async () => {
    const context = new FakeAudioContext();
    const engine = new WebAudioMidiEngine({ contextFactory: () => context });
    engine.load([{ pitch: 60, startMs: 0, durationMs: 1_000 }]);
    await engine.playFromUserGesture();
    engine.pause();
    engine.seek(500);
    await engine.resumeFromUserGesture();

    expect(engine.getTelemetrySnapshot()).toMatchObject({
      expectedEvents: 1,
      scheduledEvents: 2,
      duplicateEvents: 0
    });
  });

  it("reagenda uma nota sustentada quando o seek cai no meio dela", async () => {
    const context = new FakeAudioContext();
    const engine = new WebAudioMidiEngine({ contextFactory: () => context });
    engine.load([
      { pitch: 60, startMs: 0, durationMs: 1_000 },
      { pitch: 64, startMs: 100, durationMs: 100 }
    ]);
    await engine.playFromUserGesture();

    engine.pause();
    engine.seek(500);
    await engine.resumeFromUserGesture();

    expect(context.oscillators.at(-1)?.frequency.values[0].value).toBeCloseTo(261.625565);
    expect(context.oscillators.at(-1)?.start).toHaveBeenCalledWith(0);
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

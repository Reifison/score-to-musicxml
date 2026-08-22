import { PianoSynth } from "./PianoSynth";
import type {
  AudioContextFactory,
  AudioContextLike,
  IntervalScheduler,
  MidiNoteEvent,
  MidiPlaybackEvent,
  PlaybackSnapshot,
  PlaybackState
} from "./types";

const FALLBACK_TEMPO = 70;

const defaultScheduler: IntervalScheduler = {
  set: (callback, intervalMs) => window.setInterval(callback, intervalMs),
  clear: (handle) => window.clearInterval(handle as number)
};

const createBrowserAudioContext: AudioContextFactory = () => {
  const Context = window.AudioContext;
  if (!Context) throw new Error("Web Audio não é suportado neste navegador.");
  return new Context() as unknown as AudioContextLike;
};

export type WebAudioMidiEngineOptions = {
  contextFactory?: AudioContextFactory;
  scheduler?: IntervalScheduler;
  lookAheadSeconds?: number;
  schedulerIntervalMs?: number;
  rate?: number;
  baseTempoBpm?: number;
};

type Listener = (snapshot: PlaybackSnapshot) => void;

export class WebAudioMidiEngine {
  private context: AudioContextLike | null = null;
  private synth: PianoSynth | null = null;
  private events: MidiPlaybackEvent[] = [];
  private scheduled = new Set<number>();
  private listeners = new Set<Listener>();
  private intervalHandle: unknown;
  private state: PlaybackState = "idle";
  private currentPositionMs = 0;
  private totalDurationMs = 0;
  private anchorPositionMs = 0;
  private anchorTime = 0;
  private rate: number;
  private readonly baseTempoBpm: number;
  private disposed = false;

  private readonly contextFactory: AudioContextFactory;
  private readonly scheduler: IntervalScheduler;
  private readonly lookAheadSeconds: number;
  private readonly schedulerIntervalMs: number;

  constructor(options: WebAudioMidiEngineOptions = {}) {
    this.contextFactory = options.contextFactory ?? createBrowserAudioContext;
    this.scheduler = options.scheduler ?? defaultScheduler;
    this.lookAheadSeconds = options.lookAheadSeconds ?? 0.12;
    this.schedulerIntervalMs = options.schedulerIntervalMs ?? 25;
    this.rate = this.validateRate(options.rate ?? 1);
    this.baseTempoBpm = this.validateTempo(options.baseTempoBpm ?? FALLBACK_TEMPO);
  }

  load(events: MidiPlaybackEvent[], durationMs?: number): void {
    this.stop();
    this.events = events
      .filter((event) => Number.isFinite(event.pitch) && event.durationMs > 0 && event.startMs >= 0)
      .map((event) => ({ ...event }))
      .sort((a, b) => a.startMs - b.startMs);
    const eventDurationMs = this.events.reduce(
      (duration, event) => Math.max(duration, event.startMs + event.durationMs),
      0
    );
    this.totalDurationMs = Math.max(eventDurationMs, this.validateDuration(durationMs ?? 0));
    this.currentPositionMs = 0;
    this.state = "idle";
    this.emit();
  }

  /** Call directly from a click/tap handler; this is the only entry point that activates audio. */
  async play(
    events?: MidiPlaybackEvent[],
    startMs = this.currentPositionMs,
    rate = this.rate,
    durationMs?: number
  ): Promise<void> {
    this.assertUsable();
    if (events) this.load(events, durationMs);
    if (this.state === "playing") return;
    this.rate = this.validateRate(rate);
    this.currentPositionMs = Math.min(Math.max(0, startMs), this.totalDurationMs);
    if (this.state === "ended" || this.currentPositionMs >= this.totalDurationMs) this.currentPositionMs = 0;
    if (this.totalDurationMs === 0) {
      this.state = "ended";
      this.emit();
      return;
    }
    await this.activateAudioFromUserGesture();
    this.beginPlayback();
  }

  async playFromUserGesture(): Promise<void> {
    await this.play();
  }

  pause(): void {
    if (this.state !== "playing") return;
    this.updatePosition();
    this.stopScheduler();
    this.synth?.stopAll();
    this.scheduled.clear();
    this.state = "paused";
    this.emit();
  }

  /** Call directly from a click/tap handler because a suspended context may need activation. */
  async resume(): Promise<void> {
    this.assertUsable();
    if (this.state !== "paused") return;
    await this.activateAudioFromUserGesture();
    this.beginPlayback();
  }

  async resumeFromUserGesture(): Promise<void> {
    await this.resume();
  }

  stop(): void {
    this.stopScheduler();
    this.synth?.stopAll();
    this.scheduled.clear();
    this.currentPositionMs = 0;
    if (this.state !== "idle") this.state = "stopped";
    this.emit();
  }

  seek(positionMs: number): void {
    if (!Number.isFinite(positionMs)) throw new TypeError("A posição deve ser um número finito.");
    const wasPlaying = this.state === "playing";
    this.currentPositionMs = Math.min(Math.max(0, positionMs), this.totalDurationMs);
    this.synth?.stopAll();
    this.scheduled.clear();
    if (wasPlaying) {
      this.anchorPositionMs = this.currentPositionMs;
      this.anchorTime = this.context?.currentTime ?? 0;
      this.tick();
    } else if (this.currentPositionMs >= this.totalDurationMs && this.totalDurationMs > 0) {
      this.state = "ended";
    } else if (this.state === "ended") {
      this.state = "paused";
    }
    this.emit();
  }

  setRate(nextRate: number): void {
    const validatedRate = this.validateRate(nextRate);
    if (validatedRate === this.rate) return;
    if (this.state === "playing") {
      this.updatePosition();
      this.synth?.stopAll();
      this.scheduled.clear();
      this.rate = validatedRate;
      this.anchorPositionMs = this.currentPositionMs;
      this.anchorTime = this.context?.currentTime ?? 0;
      this.tick();
    } else {
      this.rate = validatedRate;
    }
    this.emit();
  }

  setTempo(beatsPerMinute: number): void {
    this.setRate(this.validateTempo(beatsPerMinute) / this.baseTempoBpm);
  }

  positionMs(): number {
    if (this.state === "playing") this.updatePosition();
    return this.currentPositionMs;
  }

  getSnapshot(): PlaybackSnapshot {
    const positionMs = this.positionMs();
    const tempo = this.baseTempoBpm * this.rate;
    return {
      state: this.state,
      positionMs,
      durationMs: this.totalDurationMs,
      rate: this.rate,
      positionBeat: positionMs / (60_000 / this.baseTempoBpm),
      durationBeats: this.totalDurationMs / (60_000 / this.baseTempoBpm),
      tempo
    };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.listeners.clear();
    this.stopScheduler();
    this.synth?.stopAll();
    this.state = "stopped";
    this.currentPositionMs = 0;
    this.disposed = true;
    await this.context?.close();
    this.context = null;
    this.synth = null;
  }

  /** Compatibility helper for beat-based sources using the 70 BPM fallback. */
  loadBeatEvents(notes: MidiNoteEvent[]): void {
    const millisecondsPerBeat = 60_000 / FALLBACK_TEMPO;
    this.load(notes.map((note) => ({
      id: note.id,
      pitch: note.midi,
      startMs: note.startBeat * millisecondsPerBeat,
      durationMs: note.durationBeats * millisecondsPerBeat,
      velocity: note.velocity
    })));
  }

  private async activateAudioFromUserGesture(): Promise<void> {
    if (!this.context) {
      this.context = this.contextFactory();
      this.synth = new PianoSynth(this.context);
    }
    if (this.context.state === "suspended") await this.context.resume();
  }

  private beginPlayback(): void {
    if (!this.context || !this.synth) return;
    this.state = "playing";
    this.anchorPositionMs = this.currentPositionMs;
    this.anchorTime = this.context.currentTime;
    this.scheduled.clear();
    this.tick();
    if (this.state === "playing") {
      this.intervalHandle = this.scheduler.set(() => this.tick(), this.schedulerIntervalMs);
    }
    this.emit();
  }

  private tick(): void {
    if (this.state !== "playing" || !this.context || !this.synth) return;
    this.updatePosition();
    if (this.currentPositionMs >= this.totalDurationMs) {
      this.currentPositionMs = this.totalDurationMs;
      this.state = "ended";
      this.stopScheduler();
      this.scheduled.clear();
      this.emit();
      return;
    }

    const horizonMs = this.currentPositionMs + this.lookAheadSeconds * 1000 * this.rate;
    this.events.forEach((event, index) => {
      if (this.scheduled.has(index)) return;
      const eventEnd = event.startMs + event.durationMs;
      if (eventEnd <= this.currentPositionMs || event.startMs > horizonMs) return;

      const effectiveStart = Math.max(event.startMs, this.currentPositionMs);
      const startsAt = this.context!.currentTime + (effectiveStart - this.currentPositionMs) / 1000 / this.rate;
      const durationSeconds = (eventEnd - effectiveStart) / 1000 / this.rate;
      this.synth!.schedule({ midi: event.pitch, velocity: event.velocity }, startsAt, durationSeconds);
      this.scheduled.add(index);
    });
    this.emit();
  }

  private updatePosition(): void {
    if (this.state !== "playing" || !this.context) return;
    this.currentPositionMs = Math.min(
      this.totalDurationMs,
      this.anchorPositionMs + (this.context.currentTime - this.anchorTime) * 1000 * this.rate
    );
  }

  private stopScheduler(): void {
    if (this.intervalHandle === undefined) return;
    this.scheduler.clear(this.intervalHandle);
    this.intervalHandle = undefined;
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) listener(snapshot);
  }

  private validateRate(rate: number): number {
    if (!Number.isFinite(rate) || rate < 0.25 || rate > 4) {
      throw new RangeError("A velocidade deve estar entre 0,25× e 4×.");
    }
    return rate;
  }

  private validateTempo(tempo: number): number {
    if (!Number.isFinite(tempo) || tempo < 20 || tempo > 400) {
      throw new RangeError("O andamento deve estar entre 20 e 400 BPM.");
    }
    return tempo;
  }

  private validateDuration(durationMs: number): number {
    if (!Number.isFinite(durationMs) || durationMs < 0) {
      throw new RangeError("A duração deve ser um número finito maior ou igual a zero.");
    }
    return durationMs;
  }

  private assertUsable(): void {
    if (this.disposed) throw new Error("O motor de áudio já foi descartado.");
  }
}

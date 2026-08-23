import { PianoSynth, validateInstrument } from "./PianoSynth";
import { SampleBank } from "./SampleBank";
import { LOCAL_SAMPLE_MANIFESTS } from "./sampleManifests";
import type { SampleBankSnapshot, SampleManifest } from "./SampleBank";
import type {
  AudioContextFactory,
  AudioContextLike,
  IntervalScheduler,
  MidiNoteEvent,
  MidiPlaybackEvent,
  Instrument,
  PlaybackSnapshot,
  PlaybackTelemetrySnapshot,
  PlaybackState
} from "./types";

const FALLBACK_TEMPO = 70;
/** A fixed-size window keeps p95 diagnostics bounded on long playback sessions. */
const MAX_SCHEDULER_JITTER_SAMPLES = 128;

const defaultScheduler: IntervalScheduler = {
  set: (callback, intervalMs) => globalThis.setInterval(callback, intervalMs),
  clear: (handle) => globalThis.clearInterval(handle as number)
};

const createBrowserAudioContext: AudioContextFactory = () => {
  const audioWindow = window as typeof window & { webkitAudioContext?: typeof AudioContext };
  const Context = window.AudioContext ?? audioWindow.webkitAudioContext;
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
  instrument?: Instrument;
  /** Optional manifests for licensed, locally bundled banks. */
  sampleManifests?: Partial<Record<Instrument, SampleManifest>>;
  sampleFetcher?: typeof fetch;
  /** Monotonic clock used for scheduler-jitter measurements and tests. */
  clock?: () => number;
};

type Listener = (snapshot: PlaybackSnapshot) => void;
type TelemetryListener = (snapshot: PlaybackTelemetrySnapshot) => void;

const defaultClock = (): number =>
  typeof globalThis.performance?.now === "function" ? globalThis.performance.now() : Date.now();

export class WebAudioMidiEngine {
  private context: AudioContextLike | null = null;
  private synth: PianoSynth | null = null;
  private sampleBank: SampleBank | null = null;
  private events: MidiPlaybackEvent[] = [];
  /** First event not yet considered by the look-ahead window. */
  private nextEventIndex = 0;
  private listeners = new Set<Listener>();
  private telemetryListeners = new Set<TelemetryListener>();
  private scheduledEventKeys = new Set<number>();
  private telemetry: PlaybackTelemetrySnapshot = {
    expectedEvents: 0,
    scheduledEvents: 0,
    lateEvents: 0,
    underrunEvents: 0,
    duplicateEvents: 0,
    minScheduleHorizonMs: null,
    schedulerJitterMs: 0,
    schedulerJitterP95Ms: 0,
    schedulerTicks: 0,
    activeVoices: 0,
    maxActiveVoices: 0
  };
  private schedulerJitterSamples: number[] = [];
  private lastSchedulerTickAt: number | null = null;
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
  private instrument: Instrument;
  private readonly sampleManifests?: Partial<Record<Instrument, SampleManifest>>;
  private readonly sampleFetcher?: typeof fetch;
  private readonly clock: () => number;

  constructor(options: WebAudioMidiEngineOptions = {}) {
    this.contextFactory = options.contextFactory ?? createBrowserAudioContext;
    this.scheduler = options.scheduler ?? defaultScheduler;
    // 500 ms gives the WebView and iOS audio thread enough room to survive a
    // short JS/UI stall without making seek latency feel sluggish.
    this.lookAheadSeconds = this.validateLookAhead(options.lookAheadSeconds ?? 0.5);
    this.schedulerIntervalMs = options.schedulerIntervalMs ?? 25;
    this.rate = this.validateRate(options.rate ?? 1);
    this.baseTempoBpm = this.validateTempo(options.baseTempoBpm ?? FALLBACK_TEMPO);
    this.instrument = validateInstrument(options.instrument ?? "piano");
    this.sampleManifests = options.sampleManifests ?? LOCAL_SAMPLE_MANIFESTS;
    this.sampleFetcher = options.sampleFetcher;
    this.clock = options.clock ?? defaultClock;
  }

  load(events: MidiPlaybackEvent[], durationMs?: number): void {
    this.stop();
    this.events = events
      .filter((event) => Number.isFinite(event.pitch) && event.durationMs > 0 && event.startMs >= 0)
      .map((event) => ({ ...event }))
      .sort((a, b) => a.startMs - b.startMs);
    this.resetTelemetry(this.events.length);
    this.nextEventIndex = 0;
    const eventDurationMs = this.events.reduce(
      (duration, event) => Math.max(duration, event.startMs + event.durationMs),
      0
    );
    this.totalDurationMs = Math.max(eventDurationMs, this.validateDuration(durationMs ?? 0));
    this.currentPositionMs = 0;
    this.state = "idle";
    this.emit();
    this.emitTelemetry();
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
    this.nextEventIndex = this.findFirstEventAtOrAfter(this.currentPositionMs);
    this.resetSchedulingLedger();
    this.setActiveVoices(0);
    this.state = "paused";
    this.emit();
    this.emitTelemetry();
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
    this.currentPositionMs = 0;
    this.nextEventIndex = 0;
    this.resetSchedulingLedger();
    this.setActiveVoices(0);
    if (this.state !== "idle") this.state = "stopped";
    this.emit();
    this.emitTelemetry();
  }

  seek(positionMs: number): void {
    if (!Number.isFinite(positionMs)) throw new TypeError("A posição deve ser um número finito.");
    const wasPlaying = this.state === "playing";
    this.currentPositionMs = Math.min(Math.max(0, positionMs), this.totalDurationMs);
    this.synth?.stopAll();
    this.nextEventIndex = this.findFirstEventAtOrAfter(this.currentPositionMs);
    this.resetSchedulingLedger();
    this.setActiveVoices(0);
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
    this.emitTelemetry();
  }

  setRate(nextRate: number): void {
    const validatedRate = this.validateRate(nextRate);
    if (validatedRate === this.rate) return;
    if (this.state === "playing") {
      this.updatePosition();
      this.synth?.stopAll();
      this.nextEventIndex = this.findFirstEventAtOrAfter(this.currentPositionMs);
      this.resetSchedulingLedger();
      this.rate = validatedRate;
      this.anchorPositionMs = this.currentPositionMs;
      this.anchorTime = this.context?.currentTime ?? 0;
      this.tick();
    } else {
      this.rate = validatedRate;
    }
    this.emit();
    this.emitTelemetry();
  }

  setTempo(beatsPerMinute: number): void {
    this.setRate(this.validateTempo(beatsPerMinute) / this.baseTempoBpm);
  }

  /** Change the built-in timbre. If currently playing, the current note set is
   * rebuilt from the current position so the change is audible immediately. */
  setInstrument(instrument: Instrument): void {
    const validatedInstrument = validateInstrument(instrument);
    if (validatedInstrument === this.instrument) return;
    const wasPlaying = this.state === "playing";
    if (wasPlaying) this.updatePosition();
    this.instrument = validatedInstrument;
    this.synth?.setInstrument(validatedInstrument);
    // Do not block the selector. If audio was already activated, prepare only
    // the bank the user actually chose; playback keeps the synth fallback until
    // decoding completes.
    void this.sampleBank?.preload(validatedInstrument);
    if (wasPlaying) {
      this.synth?.stopAll();
      this.nextEventIndex = this.findFirstEventAtOrAfter(this.currentPositionMs);
      this.resetSchedulingLedger();
      this.anchorPositionMs = this.currentPositionMs;
      this.anchorTime = this.context?.currentTime ?? 0;
      this.tick();
    }
    this.emit();
    this.emitTelemetry();
  }

  getInstrument(): Instrument {
    return this.instrument;
  }

  getSampleBankSnapshot(instrument = this.instrument): SampleBankSnapshot {
    return this.sampleBank?.getSnapshot(instrument) ?? {
      instrument,
      status: "unavailable",
      loadedSamples: 0,
      totalSamples: this.sampleManifests?.[instrument]?.samples.length ?? 0
    };
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

  /** Returns operational counters without exposing score or MIDI content. */
  getTelemetrySnapshot(): PlaybackTelemetrySnapshot {
    return { ...this.telemetry };
  }

  /** Alias for callers that treat telemetry as playback diagnostics. */
  getPlaybackTelemetry(): PlaybackTelemetrySnapshot {
    return this.getTelemetrySnapshot();
  }

  getTelemetry(): PlaybackTelemetrySnapshot {
    return this.getTelemetrySnapshot();
  }

  subscribeTelemetry(listener: TelemetryListener): () => void {
    this.telemetryListeners.add(listener);
    listener(this.getTelemetrySnapshot());
    return () => this.telemetryListeners.delete(listener);
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.listeners.clear();
    this.stopScheduler();
    this.synth?.stopAll();
    this.state = "stopped";
    this.currentPositionMs = 0;
    this.setActiveVoices(0);
    this.disposed = true;
    this.emitTelemetry();
    await this.context?.close();
    this.context = null;
    this.synth = null;
    this.sampleBank = null;
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
      this.sampleBank = new SampleBank(this.context, this.context.destination, {
        manifests: this.sampleManifests,
        fetcher: this.sampleFetcher
      });
      this.synth = new PianoSynth(this.context, this.context.destination, this.instrument, this.sampleBank);
    }
    if (this.context.state === "suspended") await this.context.resume();
    // Loading and decoding two complete banks at once can starve a WKWebView.
    // Prepare only the selected timbre before the first note. The other bank is
    // fetched on demand when the user selects it.
    await this.sampleBank?.preload(this.instrument);
  }

  private beginPlayback(): void {
    if (!this.context || !this.synth) return;
    this.state = "playing";
    this.anchorPositionMs = this.currentPositionMs;
    this.anchorTime = this.context.currentTime;
    this.nextEventIndex = this.findFirstEventAtOrAfter(this.currentPositionMs);
    this.resetSchedulingLedger();
    this.lastSchedulerTickAt = null;
    this.tick();
    if (this.state === "playing") {
      this.intervalHandle = this.scheduler.set(() => this.tick(), this.schedulerIntervalMs);
    }
  }

  private tick(): void {
    if (this.state !== "playing" || !this.context || !this.synth) return;
    this.recordSchedulerTick();
    this.updatePosition();
    const reachedEnd = this.currentPositionMs >= this.totalDurationMs;
    // When a tick arrives after the end, still advance the cursor through the
    // overdue events. This prevents a stall from silently dropping them from
    // diagnostics before playback is finalized.
    const horizonMs = reachedEnd
      ? this.totalDurationMs
      : this.currentPositionMs + this.lookAheadSeconds * 1000 * this.rate;
    const horizonDistanceMs = Math.max(0, horizonMs - this.currentPositionMs);
    this.telemetry.minScheduleHorizonMs = this.telemetry.minScheduleHorizonMs === null
      ? horizonDistanceMs
      : Math.min(this.telemetry.minScheduleHorizonMs, horizonDistanceMs);
    // Events are sorted by start time, so each scheduler pass only advances a
    // cursor through newly visible events. This is important on iPhone where a
    // full-array scan plus React work can starve a short look-ahead window.
    while (this.nextEventIndex < this.events.length) {
      const event = this.events[this.nextEventIndex];
      if (event.startMs > horizonMs) break;
      this.nextEventIndex += 1;
      const eventEnd = event.startMs + event.durationMs;
      if (eventEnd <= this.currentPositionMs) {
        // AudioContext cannot schedule in the past. Count the event explicitly
        // instead of silently losing it when a JS/UI stall exceeds look-ahead.
        this.telemetry.underrunEvents += 1;
        continue;
      }

      const eventIndex = this.nextEventIndex - 1;
      if (this.scheduledEventKeys.has(eventIndex)) {
        this.telemetry.duplicateEvents += 1;
      } else {
        this.scheduledEventKeys.add(eventIndex);
      }

      const effectiveStart = Math.max(event.startMs, this.currentPositionMs);
      const now = this.context.currentTime;
      const intendedStart = this.anchorTime + (event.startMs - this.anchorPositionMs) / 1000 / this.rate;
      // A note already in progress after seek/resume is intentionally started
      // at the current audio time; only notes that should have started during
      // this playback anchor count as late.
      if (event.startMs >= this.anchorPositionMs && (now - intendedStart) * 1000 > 1) {
        this.telemetry.lateEvents += 1;
      }
      const startsAt = now + (effectiveStart - this.currentPositionMs) / 1000 / this.rate;
      const durationSeconds = (eventEnd - effectiveStart) / 1000 / this.rate;
      this.synth!.schedule({ midi: event.pitch, velocity: event.velocity }, startsAt, durationSeconds);
      this.telemetry.scheduledEvents += 1;
    }
    if (reachedEnd) {
      this.finishPlayback();
      return;
    }
    // The synth owns every scheduled source (oscillator or sample), so this
    // remains O(1) even for large, multi-voice scores.
    this.setActiveVoices(this.synth.getActiveVoiceCount());
    this.emit();
    this.emitTelemetry();
  }

  private findFirstEventAtOrAfter(positionMs: number): number {
    let low = 0;
    let high = this.events.length;
    while (low < high) {
      const middle = low + Math.floor((high - low) / 2);
      if (this.events[middle].startMs < positionMs) low = middle + 1;
      else high = middle;
    }
    // A seek can land in the middle of one or more sustained notes. Include
    // all preceding overlaps once; ordinary ticks never walk backwards or
    // scan old events.
    let firstOverlap = low;
    for (let index = low - 1; index >= 0; index -= 1) {
      if (this.events[index].startMs + this.events[index].durationMs > positionMs) firstOverlap = index;
    }
    return firstOverlap;
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

  private emitTelemetry(): void {
    const snapshot = this.getTelemetrySnapshot();
    for (const listener of this.telemetryListeners) listener(snapshot);
  }

  private resetTelemetry(expectedEvents: number): void {
    this.telemetry = {
      expectedEvents,
      scheduledEvents: 0,
      lateEvents: 0,
      underrunEvents: 0,
      duplicateEvents: 0,
      minScheduleHorizonMs: null,
      schedulerJitterMs: 0,
      schedulerJitterP95Ms: 0,
      schedulerTicks: 0,
      activeVoices: 0,
      maxActiveVoices: 0
    };
    this.schedulerJitterSamples = [];
    this.lastSchedulerTickAt = null;
    this.resetSchedulingLedger();
  }

  private resetSchedulingLedger(): void {
    this.scheduledEventKeys.clear();
  }

  private setActiveVoices(activeVoices: number): void {
    this.telemetry.activeVoices = activeVoices;
    this.telemetry.maxActiveVoices = Math.max(this.telemetry.maxActiveVoices, activeVoices);
  }

  private recordSchedulerTick(): void {
    const now = this.clock();
    this.telemetry.schedulerTicks += 1;
    if (this.lastSchedulerTickAt !== null) {
      const jitter = Math.abs((now - this.lastSchedulerTickAt) - this.schedulerIntervalMs);
      this.schedulerJitterSamples.push(jitter);
      if (this.schedulerJitterSamples.length > MAX_SCHEDULER_JITTER_SAMPLES) {
        this.schedulerJitterSamples.shift();
      }
      this.telemetry.schedulerJitterMs = jitter;
      // The sample window is capped, so this remains constant-space and has a
      // bounded per-tick cost instead of growing quadratically over a session.
      const sorted = [...this.schedulerJitterSamples].sort((left, right) => left - right);
      const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
      this.telemetry.schedulerJitterP95Ms = sorted[Math.max(0, index)] ?? 0;
    }
    this.lastSchedulerTickAt = now;
  }

  private finishPlayback(): void {
    this.currentPositionMs = this.totalDurationMs;
    // Cancel the release tails that may outlive the score boundary and release
    // the synthesizer's owned voice set before reporting playback as ended.
    this.synth?.stopAll(this.context?.currentTime);
    this.setActiveVoices(0);
    this.state = "ended";
    this.stopScheduler();
    this.emit();
    this.emitTelemetry();
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

  private validateLookAhead(seconds: number): number {
    if (!Number.isFinite(seconds) || seconds < 0.05 || seconds > 10) {
      throw new RangeError("A antecipação do áudio deve estar entre 0,05 e 10 segundos.");
    }
    return seconds;
  }

  private assertUsable(): void {
    if (this.disposed) throw new Error("O motor de áudio já foi descartado.");
  }
}

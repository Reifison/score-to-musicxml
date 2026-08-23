export type MidiNoteEvent = {
  id?: string;
  midi: number;
  startBeat: number;
  durationBeats: number;
  velocity?: number;
};

export type MidiPlaybackEvent = {
  id?: string;
  pitch: number;
  startMs: number;
  durationMs: number;
  velocity?: number;
  /** Source track in the parsed MIDI file (kept for voice routing/diagnostics). */
  trackIndex?: number;
  /** MIDI channel associated with the source voice. */
  channel?: number;
  /** General MIDI program (0-127) associated with the source voice. */
  program?: number;
  /** Stable, content-free identifier for the source voice. */
  voiceId?: string;
};

/** Operational playback counters. No score, file name, pitch or note data is included. */
export type PlaybackTelemetrySnapshot = {
  expectedEvents: number;
  scheduledEvents: number;
  lateEvents: number;
  /** Events that elapsed before JavaScript could hand them to the audio thread. */
  underrunEvents: number;
  duplicateEvents: number;
  /** Smallest audio look-ahead observed during the current load, in milliseconds. */
  minScheduleHorizonMs: number | null;
  /** Most recent absolute scheduler interval deviation, in milliseconds. */
  schedulerJitterMs: number;
  /** p95 absolute scheduler interval deviation, in milliseconds. */
  schedulerJitterP95Ms: number;
  schedulerTicks: number;
  activeVoices: number;
  maxActiveVoices: number;
};

/** Timbre used by the built-in, dependency-free Web Audio synthesizer. */
export type Instrument = "piano" | "guitar";

export type PlaybackState = "idle" | "playing" | "paused" | "stopped" | "ended";

export type PlaybackSnapshot = {
  state: PlaybackState;
  positionMs: number;
  durationMs: number;
  rate: number;
  positionBeat: number;
  durationBeats: number;
  tempo: number;
};

export type AudioParamLike = {
  value: number;
  cancelScheduledValues(time: number): void;
  setValueAtTime(value: number, time: number): void;
  linearRampToValueAtTime(value: number, time: number): void;
  exponentialRampToValueAtTime(value: number, time: number): void;
};

export type AudioNodeLike = {
  connect(destination: AudioNodeLike): AudioNodeLike;
  disconnect(): void;
};

/** The subset of an AudioBuffer used by the local sample player. */
export type AudioBufferLike = {
  duration: number;
};

export type AudioBufferSourceNodeLike = AudioNodeLike & {
  buffer: AudioBufferLike | null;
  playbackRate: AudioParamLike;
  start(when?: number, offset?: number, duration?: number): void;
  stop(when?: number): void;
  onended: (() => void) | null;
};

export type OscillatorNodeLike = AudioNodeLike & {
  frequency: AudioParamLike;
  type: OscillatorType;
  onended: (() => void) | null;
  start(when?: number): void;
  stop(when?: number): void;
};

export type GainNodeLike = AudioNodeLike & {
  gain: AudioParamLike;
};

export type AudioContextLike = {
  currentTime: number;
  state: AudioContextState;
  destination: AudioNodeLike;
  createOscillator(): OscillatorNodeLike;
  createGain(): GainNodeLike;
  /** Optional so the existing oscillator-only test/context doubles stay valid. */
  createBufferSource?: () => AudioBufferSourceNodeLike;
  /** Optional so sample support can degrade safely on older WebViews. */
  decodeAudioData?: (data: ArrayBuffer) => Promise<AudioBufferLike>;
  resume(): Promise<void>;
  close(): Promise<void>;
};

export type AudioContextFactory = () => AudioContextLike;

export type IntervalScheduler = {
  set(callback: () => void, intervalMs: number): unknown;
  clear(handle: unknown): void;
};

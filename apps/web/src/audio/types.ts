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
};

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
  resume(): Promise<void>;
  close(): Promise<void>;
};

export type AudioContextFactory = () => AudioContextLike;

export type IntervalScheduler = {
  set(callback: () => void, intervalMs: number): unknown;
  clear(handle: unknown): void;
};

import type { AudioContextLike, AudioNodeLike, Instrument } from "./types";

export type SampleVoiceBackend = {
  preload(instrument: Instrument): Promise<boolean>;
  isReady(instrument: Instrument): boolean;
  schedule(
    instrument: Instrument,
    midi: number,
    velocity: number,
    startsAt: number,
    durationSeconds: number,
    output?: AudioNodeLike
  ): boolean;
  stopAll(atTime?: number): void;
  getActiveVoiceCount(): number;
};

type ActiveVoice = {
  oscillator: ReturnType<AudioContextLike["createOscillator"]>;
  gain: ReturnType<AudioContextLike["createGain"]>;
};

export type PianoNote = {
  midi: number;
  velocity?: number;
};

export type SynthNote = PianoNote;

type InstrumentProfile = {
  oscillatorType: OscillatorType;
  attackSeconds: number;
  releaseSeconds: number;
  peakGain: number;
  sustainGain: number;
};

// These deliberately use only primitives available in iOS WebViews. A triangle
// wave with a short, resonant decay reads as piano; a brighter sawtooth pluck
// with a fast attack and longer decay reads as a nylon/steel-string guitar.
const instrumentProfiles: Record<Instrument, InstrumentProfile> = {
  piano: {
    oscillatorType: "triangle",
    attackSeconds: 0.012,
    releaseSeconds: 0.08,
    peakGain: 0.22,
    sustainGain: 0.16
  },
  guitar: {
    oscillatorType: "sawtooth",
    attackSeconds: 0.004,
    releaseSeconds: 0.16,
    peakGain: 0.16,
    sustainGain: 0.055
  }
};

const midiToFrequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

export class PianoSynth {
  private readonly voices = new Set<ActiveVoice>();
  private instrument: Instrument;

  constructor(
    private readonly context: AudioContextLike,
    private readonly output: AudioNodeLike = context.destination,
    instrument: Instrument = "piano",
    private readonly sampleBackend?: SampleVoiceBackend
  ) {
    this.instrument = validateInstrument(instrument);
  }

  setInstrument(instrument: Instrument): void {
    this.instrument = validateInstrument(instrument);
  }

  getInstrument(): Instrument {
    return this.instrument;
  }

  /** Prepares a local sample bank when one is configured. A false result is
   * expected when the repository has no licensed bank yet. */
  async preload(): Promise<boolean> {
    return this.sampleBackend?.preload(this.instrument) ?? false;
  }

  usesSamples(): boolean {
    return this.sampleBackend?.isReady(this.instrument) ?? false;
  }

  /** Number of oscillator/sample sources currently owned by this synthesizer.
   * This deliberately avoids deriving the count by rescanning score events on
   * every scheduler tick. */
  getActiveVoiceCount(): number {
    return this.voices.size + (this.sampleBackend?.getActiveVoiceCount() ?? 0);
  }

  schedule(note: SynthNote, startsAt: number, durationSeconds: number, output: AudioNodeLike = this.output): void {
    const requestedVelocity = note.velocity ?? 0.72;
    const velocity = Number.isFinite(requestedVelocity) ? Math.min(1, Math.max(0, requestedVelocity)) : 0.72;
    const safeDuration = Number.isFinite(durationSeconds) ? Math.max(0.01, durationSeconds) : 0.01;
    if (this.sampleBackend?.schedule(this.instrument, note.midi, velocity, startsAt, safeDuration, output)) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const voice = { oscillator, gain };
    const profile = instrumentProfiles[this.instrument];
    const attackEnd = startsAt + profile.attackSeconds;
    const releaseStart = Math.max(attackEnd, startsAt + safeDuration - profile.releaseSeconds);
    const endsAt = Math.max(attackEnd + 0.01, startsAt + safeDuration);

    oscillator.type = profile.oscillatorType;
    oscillator.frequency.setValueAtTime(midiToFrequency(note.midi), startsAt);
    gain.gain.cancelScheduledValues(startsAt);
    gain.gain.setValueAtTime(0.0001, startsAt);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, velocity * profile.peakGain), attackEnd);
    gain.gain.setValueAtTime(Math.max(0.0001, velocity * profile.sustainGain), releaseStart);
    gain.gain.exponentialRampToValueAtTime(0.0001, endsAt);

    oscillator.connect(gain);
    gain.connect(output);
    oscillator.onended = () => this.releaseVoice(voice);
    this.voices.add(voice);
    oscillator.start(startsAt);
    oscillator.stop(endsAt + 0.01);
  }

  stopAll(atTime = this.context.currentTime): void {
    this.sampleBackend?.stopAll(atTime);
    for (const voice of [...this.voices]) {
      voice.gain.gain.cancelScheduledValues(atTime);
      voice.gain.gain.setValueAtTime(Math.max(0.0001, voice.gain.gain.value), atTime);
      voice.gain.gain.exponentialRampToValueAtTime(0.0001, atTime + 0.025);
      try {
        voice.oscillator.stop(atTime + 0.03);
        // Remove ownership immediately for telemetry, while leaving the nodes
        // connected until `onended` so the 30 ms fade remains audible.
        this.voices.delete(voice);
      } catch {
        this.releaseVoice(voice);
      }
    }
  }

  private releaseVoice(voice: ActiveVoice): void {
    voice.oscillator.disconnect();
    voice.gain.disconnect();
    this.voices.delete(voice);
  }
}

export { midiToFrequency };

export function validateInstrument(instrument: Instrument): Instrument {
  if (instrument !== "piano" && instrument !== "guitar") {
    throw new TypeError("O instrumento deve ser piano ou violão.");
  }
  return instrument;
}

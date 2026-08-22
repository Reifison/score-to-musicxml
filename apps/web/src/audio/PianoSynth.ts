import type { AudioContextLike, AudioNodeLike } from "./types";

type ActiveVoice = {
  oscillator: ReturnType<AudioContextLike["createOscillator"]>;
  gain: ReturnType<AudioContextLike["createGain"]>;
};

export type PianoNote = {
  midi: number;
  velocity?: number;
};

const midiToFrequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

export class PianoSynth {
  private readonly voices = new Set<ActiveVoice>();

  constructor(
    private readonly context: AudioContextLike,
    private readonly output: AudioNodeLike = context.destination
  ) {}

  schedule(note: PianoNote, startsAt: number, durationSeconds: number): void {
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const voice = { oscillator, gain };
    const velocity = Math.min(1, Math.max(0, note.velocity ?? 0.72));
    const attackEnd = startsAt + 0.012;
    const releaseStart = Math.max(attackEnd, startsAt + durationSeconds - 0.08);
    const endsAt = Math.max(attackEnd + 0.01, startsAt + durationSeconds);

    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(midiToFrequency(note.midi), startsAt);
    gain.gain.cancelScheduledValues(startsAt);
    gain.gain.setValueAtTime(0.0001, startsAt);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, velocity * 0.22), attackEnd);
    gain.gain.setValueAtTime(Math.max(0.0001, velocity * 0.16), releaseStart);
    gain.gain.exponentialRampToValueAtTime(0.0001, endsAt);

    oscillator.connect(gain);
    gain.connect(this.output);
    oscillator.onended = () => this.releaseVoice(voice);
    this.voices.add(voice);
    oscillator.start(startsAt);
    oscillator.stop(endsAt + 0.01);
  }

  stopAll(atTime = this.context.currentTime): void {
    for (const voice of [...this.voices]) {
      voice.gain.gain.cancelScheduledValues(atTime);
      voice.gain.gain.setValueAtTime(0.0001, atTime);
      try {
        voice.oscillator.stop(atTime + 0.01);
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

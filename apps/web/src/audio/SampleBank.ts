import type {
  AudioBufferLike,
  AudioBufferSourceNodeLike,
  AudioContextLike,
  AudioNodeLike,
  Instrument
} from "./types";

/** A pitch region in a locally bundled instrument bank.
 *
 * `url` is intentionally a relative/same-origin URL. Sample playback must not
 * depend on a CDN or a network request after the bank has been prepared.
 */
export type SampleDefinition = {
  url: string;
  midi: number;
  minMidi?: number;
  maxMidi?: number;
  minVelocity?: number;
  maxVelocity?: number;
};

export type SampleManifest = {
  instrument: Instrument;
  samples: SampleDefinition[];
  /** Playback envelope used to keep short samples click-free. */
  envelope?: Partial<SampleEnvelope>;
  /** Kept with the manifest so a release can expose the required attribution. */
  attribution?: string;
};

export type SampleEnvelope = {
  attackSeconds: number;
  releaseSeconds: number;
  /** Maximum natural tail kept after the requested note duration. */
  maxTailSeconds: number;
};

export type SampleBankStatus = "unavailable" | "loading" | "ready" | "error";

export type SampleBankSnapshot = {
  instrument: Instrument;
  status: SampleBankStatus;
  loadedSamples: number;
  totalSamples: number;
  error?: string;
};

type LoadedSample = SampleDefinition & { buffer: AudioBufferLike };

type ActiveSampleVoice = {
  source: AudioBufferSourceNodeLike;
  gain: ReturnType<AudioContextLike["createGain"]>;
};

const DEFAULT_SAMPLE_ENVELOPE: SampleEnvelope = {
  attackSeconds: 0.006,
  releaseSeconds: 0.06,
  maxTailSeconds: 0.12
};

export type SampleBankOptions = {
  /** Banks are empty by default until assets with an approved license exist. */
  manifests?: Partial<Record<Instrument, SampleManifest>>;
  fetcher?: typeof fetch;
};

const VALID_INSTRUMENTS: Instrument[] = ["piano", "guitar"];

/**
 * Loads and caches a local instrument bank for the Web Audio player.
 *
 * The repository currently has no licensed sample assets, so the default bank
 * is intentionally unavailable. `PianoSynth` treats an unavailable or failed
 * bank as a normal condition and keeps the existing oscillator fallback.
 */
export class SampleBank {
  private readonly manifests: Partial<Record<Instrument, SampleManifest>>;
  private readonly fetcher: typeof fetch;
  private readonly loaded = new Map<Instrument, LoadedSample[]>();
  private readonly states = new Map<Instrument, SampleBankSnapshot>();
  private readonly inFlight = new Map<Instrument, Promise<boolean>>();
  private readonly voices = new Set<ActiveSampleVoice>();

  constructor(
    private readonly context: AudioContextLike,
    private readonly output: AudioNodeLike = context.destination,
    options: SampleBankOptions = {}
  ) {
    this.manifests = options.manifests ?? {};
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
    for (const instrument of VALID_INSTRUMENTS) this.states.set(instrument, this.snapshotFor(instrument));
  }

  getSnapshot(instrument: Instrument): SampleBankSnapshot {
    return this.states.get(instrument) ?? this.snapshotFor(instrument);
  }

  isReady(instrument: Instrument): boolean {
    return this.getSnapshot(instrument).status === "ready" && (this.loaded.get(instrument)?.length ?? 0) > 0;
  }

  getActiveVoiceCount(): number {
    return this.voices.size;
  }

  /** Prepare all samples before playback. It is safe to call repeatedly. */
  async preload(instrument: Instrument): Promise<boolean> {
    const manifest = this.manifests[instrument];
    if (!manifest || manifest.samples.length === 0) {
      this.states.set(instrument, this.snapshotFor(instrument, "unavailable"));
      return false;
    }
    if (this.isReady(instrument)) return true;
    const existing = this.inFlight.get(instrument);
    if (existing) return existing;

    const promise = this.loadManifest(instrument, manifest);
    this.inFlight.set(instrument, promise);
    try {
      return await promise;
    } finally {
      this.inFlight.delete(instrument);
    }
  }

  /** Schedule a sample for a MIDI note. Returns false when synth fallback is needed. */
  schedule(
    instrument: Instrument,
    midi: number,
    velocity: number,
    startsAt: number,
    durationSeconds: number
  ): boolean {
    if (!this.isReady(instrument) || !this.context.createBufferSource) return false;
    const samples = this.loaded.get(instrument) ?? [];
    const sample = this.selectSample(samples, midi, velocity);
    if (!sample) return false;

    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    const ratio = this.safePlaybackRate(midi, sample.midi);
    const safeDuration = this.safeDuration(durationSeconds);
    const envelope = this.envelopeFor(instrument);
    const attackSeconds = Math.min(envelope.attackSeconds, safeDuration * 0.25);
    const releaseSeconds = Math.min(envelope.releaseSeconds, safeDuration * 0.5);
    const tailSeconds = Math.min(envelope.maxTailSeconds, releaseSeconds);
    const bufferDuration = this.safeBufferDuration(sample.buffer);
    if (!bufferDuration) return false;

    // start()'s duration is expressed in buffer seconds, not output seconds.
    // Compensate for transposition so a note remains musically consistent at
    // every pitch. Keep a bounded natural tail for a controlled release.
    const requestedBufferDuration = (safeDuration + tailSeconds) * ratio;
    const sourceDuration = Math.min(bufferDuration, Math.max(0.01 * ratio, requestedBufferDuration));
    const actualSourceDuration = sourceDuration / ratio;
    const sourceEnd = startsAt + actualSourceDuration;
    // If a transposed source is shorter than the requested note, start the
    // release before the buffer boundary instead of cutting at that boundary.
    const releaseStart = Math.max(
      startsAt + Math.max(0.001, attackSeconds),
      Math.min(startsAt + safeDuration, sourceEnd - releaseSeconds)
    );
    const releaseEnd = Math.max(releaseStart + 0.001, sourceEnd);
    source.buffer = sample.buffer;
    source.playbackRate.setValueAtTime(ratio, startsAt);
    const safeVelocity = this.safeVelocity(velocity);
    const attackEnd = startsAt + Math.max(0.001, attackSeconds);
    gain.gain.cancelScheduledValues(startsAt);
    gain.gain.setValueAtTime(0.0001, startsAt);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, safeVelocity), attackEnd);
    gain.gain.setValueAtTime(Math.max(0.0001, safeVelocity), releaseStart);
    gain.gain.exponentialRampToValueAtTime(0.0001, Math.max(attackEnd + 0.001, releaseEnd));
    source.connect(gain);
    gain.connect(this.output);
    const voice = { source, gain };
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      this.voices.delete(voice);
    };
    this.voices.add(voice);
    source.start(startsAt, 0, sourceDuration);
    source.stop(startsAt + actualSourceDuration + 0.01);
    return true;
  }

  stopAll(atTime = this.context.currentTime): void {
    for (const voice of [...this.voices]) {
      const { source, gain } = voice;
      try {
        gain.gain.cancelScheduledValues(atTime);
        gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), atTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, atTime + 0.025);
        source.stop(atTime + 0.03);
        // Keep nodes connected for the fade, but do not count the old
        // generation as an active voice after pause/seek/restart.
        this.voices.delete(voice);
      } catch {
        source.onended?.();
      }
    }
  }

  private async loadManifest(instrument: Instrument, manifest: SampleManifest): Promise<boolean> {
    this.states.set(instrument, this.snapshotFor(instrument, "loading"));
    const decodeAudioData = this.context.decodeAudioData;
    if (!decodeAudioData) {
      this.states.set(instrument, this.snapshotFor(instrument, "error", "Web Audio não decodifica samples neste WebView."));
      return false;
    }

    try {
      const loaded = await this.mapWithConcurrency(manifest.samples, 4, async (sample) => {
        this.assertLocalUrl(sample.url);
        const response = await this.fetcher(sample.url, { cache: "force-cache" });
        if (!response.ok) throw new Error(`Não foi possível carregar o sample (${response.status}).`);
        const buffer = await decodeAudioData.call(this.context, await response.arrayBuffer());
        return { ...sample, buffer };
      });
      if (loaded.length === 0) throw new Error("O banco de samples está vazio.");
      this.loaded.set(instrument, loaded);
      this.states.set(instrument, this.snapshotFor(instrument, "ready", undefined, loaded.length));
      return true;
    } catch (error) {
      // Do not retain a partial bank: a failed bank must cleanly fall back to
      // the synth, rather than producing a mixture of unpredictable voices.
      this.loaded.delete(instrument);
      this.states.set(instrument, this.snapshotFor(instrument, "error", error instanceof Error ? error.message : "Falha ao carregar samples."));
      return false;
    }
  }

  private selectSample(samples: LoadedSample[], midi: number, velocity: number): LoadedSample | undefined {
    const matching = samples.filter((sample) =>
      midi >= (sample.minMidi ?? sample.midi) &&
      midi <= (sample.maxMidi ?? sample.midi) &&
      velocity >= (sample.minVelocity ?? 0) &&
      velocity <= (sample.maxVelocity ?? 1)
    );
    const candidates = matching.length > 0 ? matching : samples;
    return [...candidates].sort((a, b) => {
      const pitchDistance = Math.abs(a.midi - midi) - Math.abs(b.midi - midi);
      if (pitchDistance !== 0) return pitchDistance;
      const velocityCenter = (sample: LoadedSample) => ((sample.minVelocity ?? 0) + (sample.maxVelocity ?? 1)) / 2;
      return Math.abs(velocityCenter(a) - velocity) - Math.abs(velocityCenter(b) - velocity);
    })[0];
  }

  private envelopeFor(instrument: Instrument): SampleEnvelope {
    const configured = this.manifests[instrument]?.envelope;
    return {
      attackSeconds: this.safeNonNegative(configured?.attackSeconds, DEFAULT_SAMPLE_ENVELOPE.attackSeconds),
      releaseSeconds: this.safeNonNegative(configured?.releaseSeconds, DEFAULT_SAMPLE_ENVELOPE.releaseSeconds),
      maxTailSeconds: this.safeNonNegative(configured?.maxTailSeconds, DEFAULT_SAMPLE_ENVELOPE.maxTailSeconds)
    };
  }

  private safePlaybackRate(midi: number, sampleMidi: number): number {
    const ratio = 2 ** ((midi - sampleMidi) / 12);
    return Number.isFinite(ratio) ? Math.min(4, Math.max(0.25, ratio)) : 1;
  }

  private safeDuration(value: number): number {
    return Number.isFinite(value) ? Math.max(0.01, value) : 0.01;
  }

  private safeVelocity(value: number): number {
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  }

  private safeBufferDuration(buffer: AudioBufferLike): number {
    return Number.isFinite(buffer.duration) ? Math.max(0, buffer.duration) : 0;
  }

  private safeNonNegative(value: number | undefined, fallback: number): number {
    return Number.isFinite(value) ? Math.max(0, value as number) : fallback;
  }

  /** Keeps first-play latency practical without overwhelming iOS with dozens
   * of simultaneous decodes. Results retain manifest order for stable sample
   * selection and do not expose partial banks when a request fails. */
  private async mapWithConcurrency<T, Result>(
    values: T[],
    concurrency: number,
    mapper: (value: T) => Promise<Result>
  ): Promise<Result[]> {
    const results = new Array<Result>(values.length);
    let nextIndex = 0;
    const worker = async () => {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= values.length) return;
        results[index] = await mapper(values[index]);
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
    return results;
  }

  private snapshotFor(
    instrument: Instrument,
    status: SampleBankStatus = "unavailable",
    error?: string,
    loadedSamples = this.loaded.get(instrument)?.length ?? 0
  ): SampleBankSnapshot {
    return {
      instrument,
      status,
      loadedSamples,
      totalSamples: this.manifests[instrument]?.samples.length ?? 0,
      ...(error ? { error } : {})
    };
  }

  private assertLocalUrl(value: string): void {
    if (!value || value.startsWith("//")) throw new Error("Samples devem ser arquivos locais ou da mesma origem.");
    const explicitOrigin = /^[a-z][a-z\d+.-]*:/i.test(value);
    if (typeof window === "undefined") {
      if (explicitOrigin) throw new Error("Samples remotos não são permitidos durante a reprodução.");
      return;
    }
    const parsed = new URL(value, window.location.origin);
    if (parsed.origin !== window.location.origin || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) {
      throw new Error("Samples remotos não são permitidos durante a reprodução.");
    }
  }
}

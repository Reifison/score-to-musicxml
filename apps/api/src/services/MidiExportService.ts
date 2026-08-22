import { AppError } from "../errors/AppError.js";
import { applyDefaultTempo } from "../utils/musicXmlTempo.js";
import { MidiObservabilityService, safeMidiErrorCode } from "./MidiObservabilityService.js";

// Verovio 6 publishes JavaScript ESM entrypoints without TypeScript declarations.
// @ts-expect-error -- the runtime entrypoint is declared in verovio's package exports
import { VerovioToolkit } from "verovio/esm";
// @ts-expect-error -- the runtime entrypoint is declared in verovio's package exports
import createVerovioModule from "verovio/wasm";

interface MidiToolkit {
  destroy(): void;
  loadData(data: string): boolean;
  renderToMIDI(): string;
  setOptions(options: Record<string, unknown>): boolean;
}

type MidiToolkitFactory = () => Promise<MidiToolkit>;

let verovioModulePromise: Promise<unknown> | undefined;

const createMidiToolkit: MidiToolkitFactory = async () => {
  verovioModulePromise ??= createVerovioModule();
  const verovioModule = await verovioModulePromise;
  return new VerovioToolkit(verovioModule) as MidiToolkit;
};

export class MidiExportService {
  constructor(
    private readonly toolkitFactory: MidiToolkitFactory = createMidiToolkit,
    private readonly observability = new MidiObservabilityService(),
    private readonly now: () => number = performance.now.bind(performance)
  ) {}

  public async generate(musicXml: string): Promise<Buffer> {
    const startedAt = this.now();
    let toolkit: MidiToolkit | undefined;

    try {
      if (typeof musicXml !== "string" || !musicXml.trim()) {
        throw new AppError(422, "MusicXML inválido para exportação MIDI.", "INVALID_MUSICXML");
      }

      toolkit = await this.toolkitFactory();
      toolkit.setOptions({ breaks: "none", inputFrom: "xml" });

      if (!toolkit.loadData(applyDefaultTempo(musicXml))) {
        throw new AppError(422, "MusicXML inválido para exportação MIDI.", "INVALID_MUSICXML");
      }

      const midi = this.decodeMidi(toolkit.renderToMIDI());
      if (!this.hasValidHeader(midi)) {
        throw new AppError(422, "Não foi possível gerar um arquivo MIDI válido.", "MIDI_GENERATION_FAILED");
      }

      this.observability.recordSuccess("generation", this.now() - startedAt, midi.byteLength);
      return midi;
    } catch (error) {
      this.observability.recordFailure("generation", this.now() - startedAt, safeMidiErrorCode(error));
      if (error instanceof AppError) throw error;
      throw new AppError(422, "Não foi possível converter esta partitura para MIDI.", "MIDI_GENERATION_FAILED");
    } finally {
      toolkit?.destroy();
    }
  }

  private decodeMidi(encodedMidi: string): Buffer {
    if (typeof encodedMidi !== "string" || !encodedMidi.trim()) return Buffer.alloc(0);
    return Buffer.from(encodedMidi.replaceAll(/\s/g, ""), "base64");
  }

  private hasValidHeader(midi: Buffer): boolean {
    return midi.length >= 14
      && midi.subarray(0, 4).equals(Buffer.from("MThd", "ascii"))
      && midi.readUInt32BE(4) === 6
      && midi.readUInt16BE(10) > 0;
  }
}

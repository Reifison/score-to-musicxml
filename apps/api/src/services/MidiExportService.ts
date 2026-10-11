import { AppError } from "../errors/AppError.js";
import { createHash } from "node:crypto";
import { applyDefaultTempo } from "../utils/musicXmlTempo.js";
import { identifyMusicXmlNotesForMidi } from "../utils/musicXmlMidiIdentity.js";
import {
  validateAndRepairSkippedTieDestinations,
  UnsupportedMidiEventValidationError,
  MidiEventMismatchError,
  type MidiValidation,
  type MidiSourceEventCoverage
} from "../utils/midiEventValidation.js";
export type { MidiValidation } from "../utils/midiEventValidation.js";
import {
  getPerformedTempoTimeline,
  rewriteMidiTempoEvents,
  UnsupportedTempoTimelineError
} from "../utils/midiTempoTimeline.js";
import { MidiObservabilityService, safeMidiErrorCode } from "./MidiObservabilityService.js";

// Verovio 6 publishes JavaScript ESM entrypoints without TypeScript declarations.
// @ts-expect-error -- the runtime entrypoint is declared in verovio's package exports
import { VerovioToolkit } from "verovio/esm";
// @ts-expect-error -- the runtime entrypoint is declared in verovio's package exports
import createVerovioModule from "verovio/wasm";

interface MidiToolkit {
  destroy(): void;
  getMEI(): string;
  loadData(data: string): boolean;
  renderToExpansionMap(): Record<string, string[]>;
  renderToMIDI(): string;
  renderToTimemap(options?: Record<string, unknown>): Array<{
    measureOn?: string;
    qstamp?: number;
    tempo?: number;
    tstamp: number;
  }>;
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
    return (await this.renderValidated(musicXml)).midi;
  }

  /** Reports the scope actually checked by the MIDI event validator. */
  public async inspect(musicXml: string): Promise<MidiValidation> {
    const xmlSHA256 = createHash("sha256").update(musicXml).digest("hex");
    try {
      const result = await this.renderValidated(musicXml);
      return {
        status: result.verified && result.checkedNotes > 0 ? "passed" : "unverified",
        checkedNotes: result.checkedNotes,
        checkedDurations: result.checkedDurations,
        issues: result.issues,
        limitations: result.limitations,
        sourceEventCoverage: result.sourceEventCoverage,
        xmlSHA256
      };
    } catch (error) {
      const unsupported = error instanceof AppError && error.code === "MIDI_EVENTS_UNVERIFIED";
      return {
        status: unsupported ? "unverified" : "failed",
        checkedNotes: 0,
        checkedDurations: 0,
        issues: [{
          code: error instanceof AppError ? error.code : "MIDI_GENERATION_FAILED",
          message: error instanceof AppError ? error.message : "Não foi possível verificar os eventos MIDI."
        }],
        limitations: unsupported ? ["A navegação ou as vozes não permitem identificar com segurança a nota ligada."] : [],
        xmlSHA256
      };
    }
  }

  private async renderValidated(musicXml: string): Promise<{ midi: Buffer; checkedNotes: number; checkedDurations: number; verified: boolean; issues: MidiValidation["issues"]; limitations: string[]; sourceEventCoverage: MidiSourceEventCoverage }> {
    const startedAt = this.now();
    let toolkit: MidiToolkit | undefined;

    try {
      if (typeof musicXml !== "string" || !musicXml.trim()) {
        throw new AppError(422, "MusicXML inválido para exportação MIDI.", "INVALID_MUSICXML");
      }

      toolkit = await this.toolkitFactory();
      toolkit.setOptions({ breaks: "none", inputFrom: "xml" });

      let identifiedXml: string;
      try { identifiedXml = identifyMusicXmlNotesForMidi(musicXml); }
      catch { throw new AppError(422, "MusicXML inválido para conferir a identidade das notas MIDI.", "INVALID_MUSICXML"); }
      if (!toolkit.loadData(applyDefaultTempo(identifiedXml))) {
        throw new AppError(422, "MusicXML inválido para exportação MIDI.", "INVALID_MUSICXML");
      }

      const midi = this.decodeMidi(toolkit.renderToMIDI());
      if (!this.hasValidHeader(midi)) {
        throw new AppError(422, "Não foi possível gerar um arquivo MIDI válido.", "MIDI_GENERATION_FAILED");
      }

      const mei = toolkit.getMEI();
      const timemap = toolkit.renderToTimemap({ includeMeasures: true, includeRests: true });
      const expansionMap = toolkit.renderToExpansionMap();
      const tempoTimeline = getPerformedTempoTimeline(mei, timemap, expansionMap);
      const synchronizedMidi = tempoTimeline.hasIntraMeasureTempo
        ? Buffer.from(rewriteMidiTempoEvents(midi, tempoTimeline.changes))
        : midi;
      const validated = validateAndRepairSkippedTieDestinations(synchronizedMidi, identifiedXml, mei, timemap, expansionMap);

      this.observability.recordSuccess("generation", this.now() - startedAt, validated.midi.byteLength);
      return validated;
    } catch (error) {
      this.observability.recordFailure("generation", this.now() - startedAt, safeMidiErrorCode(error));
      if (error instanceof AppError) throw error;
      if (error instanceof UnsupportedTempoTimelineError) {
        throw new AppError(
          422,
          "Não foi possível sincronizar o andamento desta partitura. Revise os pontos de andamento antes de exportar o MIDI.",
          "MIDI_TEMPO_UNSUPPORTED"
        );
      }
      if (error instanceof UnsupportedMidiEventValidationError) {
        throw new AppError(422, "Não foi possível verificar uma ligadura na navegação repetida desta partitura. Revise as casas de repetição e as vozes antes de exportar o MIDI.", "MIDI_EVENTS_UNVERIFIED");
      }
      if (error instanceof MidiEventMismatchError) {
        throw new AppError(422, "As notas do MIDI divergem da execução desta partitura. Revise o MusicXML antes de exportar.", "MIDI_EVENT_MISMATCH");
      }
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

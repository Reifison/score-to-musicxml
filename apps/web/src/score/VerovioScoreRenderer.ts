import { VerovioToolkit } from "verovio/esm";
import { loadVerovioModule } from "./verovioLoader.js";
import { repairSkippedTieDestinations, UnsupportedMidiEventValidationError } from "./midiEventValidation.js";
import {
  createTempoClock,
  getPerformedTempoTimeline,
  readMidiTempoChanges,
  rewriteMidiTempoEvents,
  UnsupportedTempoTimelineError,
  type PerformedTempoChange,
  type TempoClock
} from "./midiTempoTimeline.js";

export type VerovioRenderErrorCode =
  | "VEROVIO_LOAD_FAILED"
  | "INVALID_MUSICXML"
  | "INVALID_PAGE"
  | "INVALID_TIME"
  | "INVALID_ELEMENT"
  | "TIMELINE_FAILED"
  | "MIDI_RENDER_FAILED"
  | "RENDER_FAILED"
  | "RENDERER_DESTROYED";

export interface VerovioTimeElements {
  /** Chord container IDs active at this playback position. */
  chords: string[];
  /** Current measure ID, when supplied by Verovio. */
  measure?: string;
  /** Note IDs active at this playback position. */
  notes: string[];
  /** One-based rendered page, absent when the position is outside performed content. */
  page?: number;
  /** Rest IDs active at this playback position. */
  rests: string[];
}

export interface VerovioElementTimes {
  /** Playback start times in milliseconds. Repetitions can yield multiple entries. */
  startsMs: number[];
  /** Playback end times in milliseconds. */
  endsMs: number[];
}

export interface VerovioNoteEvent {
  /** MusicXML/MEI element ID used by the rendered SVG. */
  id: string;
  /** MIDI note number calculated by Verovio. */
  pitch: number;
  /** Performed start time in milliseconds. */
  startMs: number;
  /** Performed duration in milliseconds. */
  durationMs: number;
}

export class VerovioRenderError extends Error {
  public constructor(
    public readonly code: VerovioRenderErrorCode,
    message: string
  ) {
    super(message);
    this.name = "VerovioRenderError";
  }
}

export interface VerovioLayoutOptions {
  /** Page height in Verovio units (100 units = 1 mm). */
  pageHeight?: number;
  /** Page width in Verovio units (100 units = 1 mm). */
  pageWidth?: number;
  /** Engraving scale percentage. */
  scale?: number;
}

interface RendererOptions extends Record<string, unknown> {
  breaks: "auto" | "encoded";
  inputFrom: "xml";
  svgHtml5: false;
  svgViewBox: true;
  xmlIdChecksum: true;
}

const DEFAULT_OPTIONS: RendererOptions = {
  breaks: "auto",
  inputFrom: "xml",
  // Keep Verovio element identifiers as real SVG `id` attributes for playback lookup.
  svgHtml5: false,
  svgViewBox: true,
  // Stable IDs let playback APIs address the same SVG notes after rerenders.
  xmlIdChecksum: true
};

export class VerovioScoreRenderer {
  private destroyed = false;
  private loaded = false;
  private midiBase64?: string;
  private playbackEvents?: ReturnType<VerovioToolkit["renderToTimemap"]>;
  private correctedTempoChanges?: PerformedTempoChange[];
  private nativeTempoClock?: TempoClock;
  private performedTempoClock?: TempoClock;
  private elementPages = new Map<string, number>();

  private constructor(private readonly toolkit: VerovioToolkit) {}

  public static async create(options: VerovioLayoutOptions = {}): Promise<VerovioScoreRenderer> {
    let toolkit: VerovioToolkit | undefined;

    try {
      const module = await loadVerovioModule();
      toolkit = new VerovioToolkit(module);
      toolkit.setOptions({ ...DEFAULT_OPTIONS, ...definedOptions(options) });
      return new VerovioScoreRenderer(toolkit);
    } catch {
      toolkit?.destroy();
      throw new VerovioRenderError(
        "VEROVIO_LOAD_FAILED",
        "Não foi possível iniciar o visualizador de partituras."
      );
    }
  }

  /** Replaces the current score with MusicXML data. */
  public loadMusicXml(musicXml: string): void {
    this.elementPages.clear();
    this.assertUsable();
    this.midiBase64 = undefined;
    this.playbackEvents = undefined;
    this.correctedTempoChanges = undefined;
    this.nativeTempoClock = undefined;
    this.performedTempoClock = undefined;

    if (typeof musicXml !== "string" || !musicXml.trim()) {
      throw new VerovioRenderError("INVALID_MUSICXML", "O arquivo MusicXML está vazio ou inválido.");
    }

    try {
      // Verovio only honors MusicXML `<print new-page/new-system>` markers in
      // encoded mode. Keep automatic layout for scores without those markers
      // to avoid warnings and retain sensible pagination for plain MusicXML.
      this.toolkit.setOptions({ breaks: hasEncodedLayoutBreaks(musicXml) ? "encoded" : "auto" });
      this.loaded = Boolean(this.toolkit.loadData(musicXml)) && this.toolkit.getPageCount() > 0;
    } catch {
      this.loaded = false;
    }

    if (!this.loaded) {
      throw new VerovioRenderError(
        "INVALID_MUSICXML",
        "Não foi possível interpretar esta partitura MusicXML."
      );
    }
  }

  public get pageCount(): number {
    this.assertReady();

    try {
      return this.toolkit.getPageCount();
    } catch {
      throw new VerovioRenderError("RENDER_FAILED", "Não foi possível consultar as páginas da partitura.");
    }
  }

  /** Renders a one-based page number as an SVG string with stable element IDs. */
  public renderPage(pageNumber: number): string {
    this.assertReady();

    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > this.pageCount) {
      throw new VerovioRenderError("INVALID_PAGE", "A página solicitada não existe na partitura.");
    }

    try {
      const svg = this.toolkit.renderToSVG(pageNumber, false);
      if (!svg.trim().startsWith("<svg")) throw new Error("Invalid SVG output");
      return svg;
    } catch {
      throw new VerovioRenderError("RENDER_FAILED", "Não foi possível renderizar esta página.");
    }
  }

  public renderAllPages(): string[] {
    return Array.from({ length: this.pageCount }, (_, index) => this.renderPage(index + 1));
  }

  /**
   * Returns the score's performed duration in milliseconds.
   * Verovio's expanded timemap supplies performed quarter positions; imported MEI tempo marks set the tempo clock.
   */
  public get durationMs(): number {
    return this.getDurationMs();
  }

  public getDurationMs(): number {
    this.assertReady();

    try {
      this.ensurePlaybackPrepared();
      const events = this.playbackEvents ?? this.toolkit.renderToTimemap({ includeMeasures: true, includeRests: true });
      return events.reduce((duration, event) => Math.max(duration, finiteNumber(event.tstamp)), 0);
    } catch (error) {
      if (error instanceof VerovioRenderError) throw error;
      throw new VerovioRenderError(
        "TIMELINE_FAILED",
        "Não foi possível calcular a duração da partitura."
      );
    }
  }

  /** Queries the elements sounding at a playback position, in milliseconds. */
  public getElementsAtTime(timeMs: number): VerovioTimeElements {
    this.assertReady();
    assertNonNegativeFinite(timeMs);

    try {
      this.ensurePlaybackPrepared();
      // Verovio treats exact boundaries as the preceding event; one millisecond selects
      // the event that is visually active after that boundary.
      let nativeTimeMs = timeMs;
      if (this.performedTempoClock && this.nativeTempoClock) {
        const quarter = this.performedTempoClock.quarterAtMilliseconds(timeMs);
        nativeTimeMs = this.nativeTempoClock.millisecondsAtQuarter(quarter);
      }
      const elements = this.toolkit.getElementsAtTime(Math.floor(nativeTimeMs) + 1);
      const measure = nonEmptyString(elements.measure);
      // Verovio 6.1 can report page 1 for elements beyond an encoded page break.
      // Resolve the engraved location directly so playback follows the right page.
      const anchor = measure ?? stringArray(elements.notes)[0] ?? stringArray(elements.rests)[0];
      let page = anchor ? this.elementPages.get(anchor) : undefined;
      if (anchor && page === undefined) {
        const locatedPage = this.toolkit.getPageWithElement(anchor);
        if (Number.isInteger(locatedPage) && locatedPage >= 1 && locatedPage <= this.pageCount) {
          page = locatedPage;
          this.elementPages.set(anchor, page);
        }
      }
      return {
        chords: stringArray(elements.chords),
        measure,
        notes: stringArray(elements.notes),
        page: page ?? optionalValidPage(elements.page, this.pageCount),
        rests: stringArray(elements.rests)
      };
    } catch (error) {
      if (error instanceof VerovioRenderError) throw error;
      throw new VerovioRenderError(
        "TIMELINE_FAILED",
        "Não foi possível localizar as notas neste instante."
      );
    }
  }

  /** Returns the tempo active at a playback position, or the supplied fallback. */
  public getTempoAtTime(timeMs: number, fallbackBpm = 70): number {
    this.assertReady();
    assertNonNegativeFinite(timeMs);
    if (!Number.isFinite(fallbackBpm) || fallbackBpm <= 0) {
      throw new VerovioRenderError("INVALID_TIME", "O andamento padrão deve ser válido.");
    }

    try {
      this.ensurePlaybackPrepared();
      if (this.performedTempoClock && this.correctedTempoChanges) {
        const quarter = this.performedTempoClock.quarterAtMilliseconds(timeMs);
        const activeChange = [...this.correctedTempoChanges].reverse().find((change) => change.quarter <= quarter + 1e-8);
        return activeChange?.bpm ?? fallbackBpm;
      }
      const events = this.toolkit.renderToTimemap({ includeMeasures: true, includeRests: true });
      let tempo = fallbackBpm;
      for (const event of events) {
        if (finiteNumber(event.tstamp) > timeMs) break;
        if (typeof event.tempo === "number" && Number.isFinite(event.tempo) && event.tempo > 0) {
          tempo = event.tempo;
        }
      }
      return tempo;
    } catch (error) {
      if (error instanceof VerovioRenderError) throw error;
      throw new VerovioRenderError("TIMELINE_FAILED", "Não foi possível consultar o andamento.");
    }
  }

  /**
   * Builds performed note events from Verovio's own timemap and MIDI pitch calculation.
   * Repeated occurrences remain separate events and retain their shared score element ID.
   */
  public getNoteEvents(): VerovioNoteEvent[] {
    this.assertReady();

    try {
      this.ensurePlaybackPrepared();
      const timemap = this.playbackEvents ?? this.toolkit.renderToTimemap({ includeMeasures: true, includeRests: true });
      const endingTimes = new Map<string, number[]>();

      for (const event of timemap) {
        const time = finiteNumber(event.tstamp);
        for (const id of stringArray(event.off)) {
          const entries = endingTimes.get(id) ?? [];
          entries.push(time);
          endingTimes.set(id, entries);
        }
      }

      const endingIndexes = new Map<string, number>();
      const noteEvents: VerovioNoteEvent[] = [];
      for (const event of timemap) {
        const startMs = finiteNumber(event.tstamp);
        for (const id of stringArray(event.on)) {
          const midi = this.toolkit.getMIDIValuesForElement(id);
          if (typeof midi.pitch !== "number" || !Number.isFinite(midi.pitch)) continue;

          const endings = endingTimes.get(id) ?? [];
          let endingIndex = endingIndexes.get(id) ?? 0;
          while (endingIndex < endings.length && endings[endingIndex] < startMs) endingIndex += 1;
          const endMs = endings[endingIndex];
          if (endMs !== undefined) endingIndexes.set(id, endingIndex + 1);

          const nativeDuration = finiteNumber(midi.duration);
          const durationMs = endMs !== undefined && endMs >= startMs ? endMs - startMs : nativeDuration;
          noteEvents.push({ id, pitch: midi.pitch, startMs, durationMs });
        }
      }

      return noteEvents;
    } catch (error) {
      if (error instanceof VerovioRenderError) throw error;
      throw new VerovioRenderError(
        "TIMELINE_FAILED",
        "Não foi possível criar os eventos de reprodução da partitura."
      );
    }
  }

  /** Returns the rendered page for a score element ID. */
  public getPageForElement(elementId: string): number {
    this.assertReady();
    const id = assertElementId(elementId);

    try {
      return validPage(this.toolkit.getPageWithElement(id), this.pageCount);
    } catch (error) {
      if (error instanceof VerovioRenderError) throw error;
      throw new VerovioRenderError("INVALID_ELEMENT", "O elemento não existe nesta partitura.");
    }
  }

  /**
   * Returns every performed interval for an element.
   * Multiple intervals are preserved when Verovio expands repeats.
   */
  public getTimesForElement(elementId: string): VerovioElementTimes {
    this.assertReady();
    const id = assertElementId(elementId);

    try {
      this.ensurePlaybackPrepared();
      const events = this.playbackEvents ?? this.toolkit.renderToTimemap({ includeMeasures: true, includeRests: true });
      const startsMs = events
        .filter((event) => stringArray(event.on).includes(id))
        .map((event) => finiteNumber(event.tstamp));
      const endsMs = events
        .filter((event) => stringArray(event.off).includes(id))
        .map((event) => finiteNumber(event.tstamp));

      if (startsMs.length === 0) {
        throw new VerovioRenderError("INVALID_ELEMENT", "O elemento não existe nesta partitura.");
      }

      return { startsMs, endsMs };
    } catch (error) {
      if (error instanceof VerovioRenderError) throw error;
      throw new VerovioRenderError(
        "TIMELINE_FAILED",
        "Não foi possível consultar o tempo deste elemento."
      );
    }
  }

  /** Generates a Standard MIDI File as raw base64 (without a data URL prefix). */
  public renderMidiBase64(): string {
    this.assertReady();

    try {
      this.ensurePlaybackPrepared();
      return this.midiBase64 as string;
    } catch (error) {
      if (error instanceof VerovioRenderError) throw error;
      throw new VerovioRenderError("MIDI_RENDER_FAILED", "Não foi possível gerar o arquivo MIDI.");
    }
  }

  /** Generates a Standard MIDI File as bytes, suitable for Blob or Web Audio consumers. */
  public renderMidiBytes(): Uint8Array {
    try {
      const binary = globalThis.atob(this.renderMidiBase64());
      return Uint8Array.from(binary, (character) => character.charCodeAt(0));
    } catch (error) {
      if (error instanceof VerovioRenderError) throw error;
      throw new VerovioRenderError("MIDI_RENDER_FAILED", "Não foi possível decodificar o arquivo MIDI.");
    }
  }

  /** Releases the native toolkit allocation. Safe to call more than once. */
  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.loaded = false;
    this.midiBase64 = undefined;
    this.playbackEvents = undefined;
    this.correctedTempoChanges = undefined;
    this.nativeTempoClock = undefined;
    this.performedTempoClock = undefined;
    this.elementPages.clear();
    this.toolkit.destroy();
  }

  private ensurePlaybackPrepared(): void {
    if (this.midiBase64) return;
    const renderedMidi = this.toolkit.renderToMIDI();
    if (typeof renderedMidi !== "string" || !renderedMidi.trim()) throw new Error("Empty MIDI output");

    try {
      const timemap = this.toolkit.renderToTimemap({ includeMeasures: true, includeRests: true });
      const mei = this.toolkit.getMEI();
      const expansionMap = this.toolkit.renderToExpansionMap();
      const tempoTimeline = getPerformedTempoTimeline(mei, timemap, expansionMap);
      this.playbackEvents = timemap;
      if (!tempoTimeline.hasIntraMeasureTempo) {
        this.midiBase64 = encodeBase64(repairSkippedTieDestinations(decodeBase64(renderedMidi), mei, timemap, expansionMap));
        return;
      }

      const rawMidi = decodeBase64(renderedMidi);
      const nativeChanges = readMidiTempoChanges(rawMidi);
      const nativeInitialBpm = tempoAtQuarterZero(nativeChanges) ?? 120;
      const nativeClock = createTempoClock(nativeChanges, nativeInitialBpm);
      const performedClock = createTempoClock(tempoTimeline.changes, nativeInitialBpm);
      for (const event of timemap) {
        if (typeof event.qstamp !== "number" || !Number.isFinite(event.qstamp) || event.qstamp < 0) {
          throw new UnsupportedTempoTimelineError("A timemap event has no valid score-quarter position.");
        }
        if (Math.abs(nativeClock.millisecondsAtQuarter(event.qstamp) - finiteNumber(event.tstamp)) > 5) {
          throw new UnsupportedTempoTimelineError("The native MIDI and Verovio timemap do not share a reliable time map.");
        }
      }

      const correctedEvents = timemap.map((event) => {
        if (typeof event.qstamp !== "number" || !Number.isFinite(event.qstamp) || event.qstamp < 0) {
          throw new UnsupportedTempoTimelineError("A timemap event has no valid score-quarter position.");
        }
        return {
          ...event,
          tstamp: performedClock.millisecondsAtQuarter(event.qstamp),
          tempo: performedClock.tempoAtQuarter(event.qstamp)
        };
      });
      const synchronizedMidi = rewriteMidiTempoEvents(rawMidi, tempoTimeline.changes);
      const validatedMidi = repairSkippedTieDestinations(synchronizedMidi, mei, timemap, expansionMap);

      this.playbackEvents = correctedEvents;
      this.correctedTempoChanges = tempoTimeline.changes;
      this.nativeTempoClock = nativeClock;
      this.performedTempoClock = performedClock;
      this.midiBase64 = encodeBase64(validatedMidi);
    } catch (error) {
      if (error instanceof UnsupportedTempoTimelineError) {
        throw new VerovioRenderError(
          "MIDI_RENDER_FAILED",
          "Não foi possível sincronizar o andamento desta partitura. Revise os pontos de andamento antes de reproduzir ou exportar o MIDI."
        );
      }
      if (error instanceof UnsupportedMidiEventValidationError) {
        throw new VerovioRenderError(
          "MIDI_RENDER_FAILED",
          "Não foi possível verificar uma ligadura na navegação repetida desta partitura. Revise as casas de repetição e as vozes."
        );
      }
      throw error;
    }
  }

  private assertUsable(): void {
    if (this.destroyed) {
      throw new VerovioRenderError("RENDERER_DESTROYED", "O visualizador já foi encerrado.");
    }
  }

  private assertReady(): void {
    this.assertUsable();
    if (!this.loaded) {
      throw new VerovioRenderError("INVALID_MUSICXML", "Nenhuma partitura MusicXML foi carregada.");
    }
  }
}

function hasEncodedLayoutBreaks(musicXml: string): boolean {
  return /<print\b[^>]*\bnew-(?:page|system)\s*=\s*["']yes["']/i.test(musicXml);
}

/** Creates a renderer and loads the score, cleaning up if MusicXML parsing fails. */
export async function createVerovioScoreRenderer(
  musicXml: string,
  options?: VerovioLayoutOptions
): Promise<VerovioScoreRenderer> {
  const renderer = await VerovioScoreRenderer.create(options);

  try {
    renderer.loadMusicXml(musicXml);
    return renderer;
  } catch (error) {
    renderer.destroy();
    throw error;
  }
}

function definedOptions(options: VerovioLayoutOptions): VerovioLayoutOptions {
  return Object.fromEntries(
    Object.entries(options).filter((entry): entry is [string, number] => entry[1] !== undefined)
  );
}

function assertNonNegativeFinite(timeMs: number): void {
  if (!Number.isFinite(timeMs) || timeMs < 0) {
    throw new VerovioRenderError("INVALID_TIME", "O instante da reprodução deve ser válido.");
  }
}

function assertElementId(elementId: string): string {
  if (typeof elementId !== "string" || !elementId.trim()) {
    throw new VerovioRenderError("INVALID_ELEMENT", "O identificador do elemento é inválido.");
  }
  return elementId.trim();
}

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function validPage(value: unknown, pageCount: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > pageCount) {
    throw new VerovioRenderError("INVALID_ELEMENT", "O elemento não pertence a uma página válida.");
  }
  return value;
}

function optionalValidPage(value: unknown, pageCount: number): number | undefined {
  if (value === undefined || value === null) return undefined;
  return validPage(value, pageCount);
}

function decodeBase64(base64: string): Uint8Array {
  const binary = globalThis.atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)));
  }
  return globalThis.btoa(chunks.join(""));
}

function tempoAtQuarterZero(changes: PerformedTempoChange[]): number | undefined {
  return [...changes].reverse().find((change) => change.quarter <= 1e-8)?.bpm;
}

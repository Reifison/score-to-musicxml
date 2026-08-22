import { env } from "../config/env.js";

export type MidiMetricPhase = "generation" | "download";
export type MidiMetricStatus = "success" | "failure";

export type MidiMetric = {
  metric: "midi_export";
  phase: MidiMetricPhase;
  status: MidiMetricStatus;
  durationMs: number;
  sizeBytes?: number;
  errorCode?: string;
};

type MidiMetricSink = (metric: MidiMetric) => void;

const SAFE_ERROR_CODE = /^[A-Z][A-Z0-9_]{0,63}$/;

export class MidiObservabilityService {
  constructor(private readonly sink: MidiMetricSink = defaultMetricSink) {}

  recordSuccess(phase: MidiMetricPhase, durationMs: number, sizeBytes: number): void {
    this.sink({
      metric: "midi_export",
      phase,
      status: "success",
      durationMs: normalizeDuration(durationMs),
      sizeBytes: normalizeSize(sizeBytes)
    });
  }

  recordFailure(phase: MidiMetricPhase, durationMs: number, errorCode: unknown): void {
    this.sink({
      metric: "midi_export",
      phase,
      status: "failure",
      durationMs: normalizeDuration(durationMs),
      errorCode: normalizeErrorCode(errorCode)
    });
  }
}

export function safeMidiErrorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    return normalizeErrorCode(error.code);
  }
  return "UNEXPECTED_ERROR";
}

function defaultMetricSink(metric: MidiMetric): void {
  if (env.NODE_ENV === "test") return;
  // This payload is intentionally allowlisted. Never add score IDs, filenames,
  // paths, authorization data, MusicXML or encoded MIDI to this metric.
  console.info(JSON.stringify(metric));
}

function normalizeDuration(durationMs: number): number {
  return Number.isFinite(durationMs) ? Math.max(0, Math.round(durationMs)) : 0;
}

function normalizeSize(sizeBytes: number): number {
  return Number.isFinite(sizeBytes) ? Math.max(0, Math.round(sizeBytes)) : 0;
}

function normalizeErrorCode(value: unknown): string {
  return typeof value === "string" && SAFE_ERROR_CODE.test(value)
    ? value
    : "UNEXPECTED_ERROR";
}

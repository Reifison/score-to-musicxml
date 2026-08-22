import { Midi } from "@tonejs/midi";
import type { MidiPlaybackEvent } from "./types.js";

export type ParsedMidiPlayback = {
  durationMs: number;
  events: MidiPlaybackEvent[];
  initialTempoBpm: number;
};

/** Parses the exact Standard MIDI File emitted by Verovio into scheduler events. */
export function parseMidiPlayback(bytes: Uint8Array, fallbackTempoBpm = 70): ParsedMidiPlayback {
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const midi = new Midi(data);
  const events = midi.tracks
    .flatMap((track) => track.notes.map((note) => ({
      pitch: note.midi,
      startMs: note.time * 1_000,
      durationMs: note.duration * 1_000,
      velocity: note.velocity
    })))
    .filter((event) => event.durationMs > 0)
    .sort((left, right) => left.startMs - right.startMs || left.pitch - right.pitch);
  const firstTempo = midi.header.tempos.find((tempo) => Number.isFinite(tempo.bpm) && tempo.bpm > 0)?.bpm;

  return {
    durationMs: Math.max(midi.duration * 1_000, ...events.map((event) => event.startMs + event.durationMs), 0),
    events,
    initialTempoBpm: Math.round(firstTempo ?? fallbackTempoBpm)
  };
}

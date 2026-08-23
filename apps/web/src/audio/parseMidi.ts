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
    .flatMap((track, trackIndex) => {
      // @tonejs/midi exposes the effective channel/program on each Track. The
      // parser may split a source SMF track when it contains multiple channel
      // or program changes, so this index identifies the playback voice that
      // the engine actually receives.
      const channel = Number.isInteger(track.channel) ? track.channel : undefined;
      const program = Number.isInteger(track.instrument?.number) ? track.instrument.number : undefined;
      const voiceId = `track:${trackIndex}:channel:${channel ?? "unknown"}:program:${program ?? "unknown"}`;
      return track.notes.map((note) => ({
        pitch: note.midi,
        startMs: note.time * 1_000,
        durationMs: note.duration * 1_000,
        velocity: note.velocity,
        trackIndex,
        channel,
        program,
        voiceId
      }));
    })
    .filter((event) => event.durationMs > 0)
    .sort((left, right) => left.startMs - right.startMs || left.pitch - right.pitch ||
      (left.trackIndex ?? 0) - (right.trackIndex ?? 0));
  const firstTempo = midi.header.tempos.find((tempo) => Number.isFinite(tempo.bpm) && tempo.bpm > 0)?.bpm;

  return {
    durationMs: Math.max(midi.duration * 1_000, ...events.map((event) => event.startMs + event.durationMs), 0),
    events,
    initialTempoBpm: Math.round(firstTempo ?? fallbackTempoBpm)
  };
}

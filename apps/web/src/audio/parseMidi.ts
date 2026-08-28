import { Midi } from "@tonejs/midi";
import { parseMidi } from "midi-file";
import type { MidiPlaybackEvent, MidiPlaybackTrack } from "./types.js";

export type ParsedMidiPlayback = {
  durationMs: number;
  events: MidiPlaybackEvent[];
  tracks: MidiPlaybackTrack[];
  initialTempoBpm: number;
};

/** Parses the exact Standard MIDI File emitted by Verovio into scheduler events. */
export function parseMidiPlayback(bytes: Uint8Array, fallbackTempoBpm = 70): ParsedMidiPlayback {
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const midi = new Midi(data);
  const parsedTracks = midi.tracks.map((track, trackIndex): MidiPlaybackTrack => {
      // @tonejs/midi exposes the effective channel/program on each Track. The
      // parser may split a source SMF track when it contains multiple channel
      // or program changes, so this index identifies the playback voice that
      // the engine actually receives.
      const channel = Number.isInteger(track.channel) ? track.channel : undefined;
      const program = Number.isInteger(track.instrument?.number) ? track.instrument.number : undefined;
      const voiceId = `track:${trackIndex}:channel:${channel ?? "unknown"}:program:${program ?? "unknown"}`;
      const events = track.notes.map((note) => ({
        pitch: note.midi,
        startMs: note.time * 1_000,
        durationMs: note.duration * 1_000,
        velocity: note.velocity,
        trackIndex,
        channel,
        program,
        voiceId
      })).filter((event) => event.durationMs > 0).sort((left, right) =>
        left.startMs - right.startMs || left.pitch - right.pitch);
      return {
        trackIndex,
        name: track.name || undefined,
        channel,
        program,
        // @tonejs/midi normalizes absent channel/program values to 0. The raw
        // The raw SMF lets us report observed channel/program events where possible.
        channelObserved: undefined,
        programExplicit: undefined,
        noteCount: events.length,
        durationMs: Math.max(...events.map((event) => event.startMs + event.durationMs), 0),
        events,
        voiceId
      };
    });
  // Empty conductor/meta tracks are useful while parsing, but are not
  // reproducible voices and must not be exposed as selectable tracks.
  const tracks = parsedTracks.filter((track) => track.noteCount > 0);
  const events = tracks.flatMap((track) => track.events)
    .sort((left, right) => left.startMs - right.startMs || left.pitch - right.pitch ||
      (left.trackIndex ?? 0) - (right.trackIndex ?? 0));

  // Keep this best-effort: Tone may split a source track on channel/program
  // changes, so only apply raw event presence when cardinality lines up.
  try {
    const raw = parseMidi(bytes);
    const rawSoundingTracks = raw.tracks.filter((rawTrack) =>
      rawTrack.some((event) => event.type === "noteOn" && event.velocity > 0)
    );
    if (rawSoundingTracks.length === tracks.length) {
      rawSoundingTracks.forEach((rawTrack, index) => {
        const target = tracks[index];
        const channelEvents = rawTrack.filter((event) => "channel" in event);
        target.channelObserved = channelEvents.length > 0;
        target.programExplicit = rawTrack.some((event) => event.type === "programChange");
      });
    }
  } catch {
    // Tone's parser already validated the MIDI; metadata enrichment is optional.
  }
  const firstTempo = midi.header.tempos.find((tempo) => Number.isFinite(tempo.bpm) && tempo.bpm > 0)?.bpm;

  return {
    durationMs: Math.max(midi.duration * 1_000, ...events.map((event) => event.startMs + event.durationMs), 0),
    events,
    tracks,
    initialTempoBpm: Math.round(firstTempo ?? fallbackTempoBpm)
  };
}

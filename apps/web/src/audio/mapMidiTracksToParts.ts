import type { MusicXmlPart } from "../score/parseMusicXmlParts.js";
import type { MidiPlaybackTrack } from "./types.js";

export type PlaybackMappingConfidence = "exact" | "heuristic" | "fallback";

export type PlaybackVoice = {
  id: string;
  partId?: string;
  label: string;
  trackIndexes: number[];
  channels: number[];
  programs: number[];
  eventCount: number;
  muted: boolean;
  mappingConfidence: PlaybackMappingConfidence;
};

export type MidiPartMapping = {
  voices: PlaybackVoice[];
  unmatchedPartIds: string[];
};

type Assignment = {
  part: MusicXmlPart;
  track: MidiPlaybackTrack;
  confidence: PlaybackMappingConfidence;
};

function pair(part: MusicXmlPart, track: MidiPlaybackTrack): boolean {
  return part.midiChannel !== undefined && part.midiProgram !== undefined
    // A program value of 0 is also the @tonejs/midi default when no
    // program-change exists. Require explicit evidence whenever program is
    // used, so a synthetic/default 0/0 track cannot receive a named part.
    && track.programExplicit === true
    && track.channel === part.midiChannel && track.program === part.midiProgram;
}

function programOnly(part: MusicXmlPart, track: MidiPlaybackTrack): boolean {
  return part.midiChannel === undefined && part.midiProgram !== undefined
    && track.programExplicit === true && track.program === part.midiProgram;
}

function voiceFrom(track: MidiPlaybackTrack, label: string, partId: string | undefined,
  confidence: PlaybackMappingConfidence): PlaybackVoice {
  return {
    id: partId ? `part:${partId}` : `track:${track.trackIndex}`,
    ...(partId ? { partId } : {}),
    label,
    trackIndexes: [track.trackIndex],
    channels: track.channel === undefined ? [] : [track.channel],
    programs: track.program === undefined ? [] : [track.program],
    eventCount: track.noteCount,
    muted: false,
    mappingConfidence: confidence
  };
}

/**
 * Associates sounding MIDI tracks with declared MusicXML parts.
 *
 * Ambiguity is intentional: a track is never assigned to a part merely because
 * that makes the catalogue look nicer. In particular, repeated 0/0 metadata
 * remains independent and gets a neutral label.
 */
export function mapMidiTracksToParts(parts: MusicXmlPart[], tracks: MidiPlaybackTrack[]): MidiPartMapping {
  const playableParts = parts.filter((part) => part.hasPlayableNotes);
  const soundingTracks = tracks.filter((track) => track.noteCount > 0 && track.events.length > 0);
  const remainingParts = new Set(playableParts);
  const remainingTracks = new Set(soundingTracks);
  const assignments: Assignment[] = [];

  const assignUnique = (predicate: (part: MusicXmlPart, track: MidiPlaybackTrack) => boolean,
    confidence: PlaybackMappingConfidence) => {
    // Recompute candidates after each pass. This prevents an early match from
    // accidentally making a later ambiguous match appear unique.
    let changed = true;
    while (changed) {
      changed = false;
      for (const part of [...remainingParts]) {
        const candidates = [...remainingTracks].filter((track) => predicate(part, track));
        const competingParts = [...remainingParts].filter((candidate) =>
          candidates.some((track) => predicate(candidate, track)));
        if (candidates.length !== 1 || competingParts.length !== 1) continue;
        const track = candidates[0];
        remainingParts.delete(part);
        remainingTracks.delete(track);
        assignments.push({ part, track, confidence });
        changed = true;
      }
    }
  };

  assignUnique(pair, "exact");
  assignUnique(programOnly, "heuristic");

  // Order is only safe as a deliberately marked fallback when neither side
  // has usable MIDI evidence. Labels stay neutral because the association is
  // not strong enough to present a MusicXML name as certain.
  const orderFallback = [...remainingParts].every((part) =>
    part.midiChannel === undefined && part.midiProgram === undefined)
    && [...remainingTracks].every((track) =>
      track.channel === undefined && track.program === undefined)
    && remainingParts.size === remainingTracks.size;
  if (orderFallback) {
    const orderedParts = [...remainingParts].sort((a, b) => a.order - b.order);
    const orderedTracks = [...remainingTracks].sort((a, b) => a.trackIndex - b.trackIndex);
    orderedParts.forEach((part, index) => assignments.push({
      part, track: orderedTracks[index], confidence: "fallback"
    }));
    remainingParts.clear();
    remainingTracks.clear();
  }

  const labels = new Map<string, number>();
  const voices: PlaybackVoice[] = assignments
    .sort((a, b) => a.part.order - b.part.order)
    .map(({ part, track, confidence }) => {
      const count = (labels.get(part.label) ?? 0) + 1;
      labels.set(part.label, count);
      const label = confidence === "fallback"
        ? `Faixa ${track.trackIndex + 1}`
        : count > 1 ? `${part.label} ${count}` : part.label;
      return voiceFrom(track, label, confidence === "fallback" ? undefined : part.partId, confidence);
    });

  for (const track of [...remainingTracks].sort((a, b) => a.trackIndex - b.trackIndex)) {
    voices.push(voiceFrom(track, `Faixa ${track.trackIndex + 1}`, undefined, "fallback"));
  }

  return {
    voices,
    unmatchedPartIds: [...remainingParts].sort((a, b) => a.order - b.order).map((part) => part.partId)
  };
}

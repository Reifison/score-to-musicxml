export const DEFAULT_TEMPO_BPM = 70;

const SOUND_TEMPO_PATTERN = /<sound\b[^>]*\btempo\s*=\s*["']\s*([0-9]+(?:\.[0-9]+)?)\s*["']/gi;
const METRONOME_TEMPO_PATTERN = /<per-minute>\s*([0-9]+(?:\.[0-9]+)?)\s*<\/per-minute>/gi;

export function hasExplicitTempo(musicXml: string): boolean {
  return [SOUND_TEMPO_PATTERN, METRONOME_TEMPO_PATTERN].some((pattern) => {
    pattern.lastIndex = 0;
    return [...musicXml.matchAll(pattern)].some((match) => Number(match[1]) > 0);
  });
}

export function applyDefaultTempo(musicXml: string, tempoBpm = DEFAULT_TEMPO_BPM): string {
  if (hasExplicitTempo(musicXml)) return musicXml;

  const direction = `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${tempoBpm}</per-minute></metronome></direction-type><sound tempo="${tempoBpm}"/></direction>`;
  return musicXml.replace(/(<measure\b[^>]*>)/i, `$1${direction}`);
}

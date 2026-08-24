import { describe, expect, it } from "vitest";
import { isPlayerMusicXmlCacheFresh, PLAYER_MUSICXML_CACHE_TTL_MS } from "./musicXmlCachePolicy";

describe("player MusicXML cache policy", () => {
  const now = Date.UTC(2026, 7, 24, 12, 0, 0);

  it("keeps a score for seven days from its latest opening", () => {
    expect(isPlayerMusicXmlCacheFresh(now - PLAYER_MUSICXML_CACHE_TTL_MS, now)).toBe(true);
    expect(isPlayerMusicXmlCacheFresh(now - PLAYER_MUSICXML_CACHE_TTL_MS + 1, now)).toBe(true);
  });

  it("expires missing, invalid, or older cached entries", () => {
    expect(isPlayerMusicXmlCacheFresh(now - PLAYER_MUSICXML_CACHE_TTL_MS - 1, now)).toBe(false);
    expect(isPlayerMusicXmlCacheFresh(null, now)).toBe(false);
    expect(isPlayerMusicXmlCacheFresh(Number.NaN, now)).toBe(false);
  });
});

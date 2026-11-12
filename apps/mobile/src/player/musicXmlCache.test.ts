import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Score } from "../api/types";
import { loadCachedPlayerMusicXml, playerCacheIdentity, savePlayerMusicXmlToCache } from "./musicXmlCache";
import { readCachedScoreDetails, saveCachedScoreDetails } from "./scoreDetailsCache";

const state = vi.hoisted(() => ({ files: new Map<string, string>() }));

vi.mock("expo-file-system", () => {
  class Directory {
    uri: string;
    constructor(root: string | Directory, ...parts: string[]) {
      this.uri = [typeof root === "string" ? root : root.uri, ...parts].join("/");
    }
    create() {}
  }
  class File {
    uri: string;
    constructor(root: Directory, name: string) { this.uri = `${root.uri}/${name}`; }
    get exists() { return state.files.has(this.uri); }
    get size() { return state.files.get(this.uri)?.length ?? null; }
    get modificationTime() { return 1; }
    async text() { return state.files.get(this.uri) ?? ""; }
    write(value: string) { state.files.set(this.uri, value); }
  }
  return { Directory, File, Paths: { document: "documents" } };
});
vi.mock("./bridge", () => ({
  validatePlayerMusicXml: (xml: string) => {
    if (!xml.startsWith("<score-partwise")) throw new Error("invalid MusicXML");
  }
}));

const baseScore = {
  id: "score-1", userId: "owner-1", musicxmlFilename: "score.musicxml", convertedAt: "2026-10-10",
  resultStatus: "complete", reviewRevision: "a".repeat(64), updatedAt: "2026-10-10"
} as Score;
const xml = "<score-partwise />";

beforeEach(() => state.files.clear());

describe("persistent offline score cache", () => {
  it("keeps validated notation without an age limit and isolates signed-in accounts", async () => {
    const ownerIdentity = playerCacheIdentity(baseScore, "owner-1");
    const adminIdentity = playerCacheIdentity(baseScore, "admin-1");
    savePlayerMusicXmlToCache(ownerIdentity, xml);
    expect(await loadCachedPlayerMusicXml(ownerIdentity)).toBe(xml);
    expect(await loadCachedPlayerMusicXml(adminIdentity)).toBeNull();
  });

  it("uses the same content revision for list and detailed responses and separates changed reviews", () => {
    const detail = { ...baseScore, attempts: [{ id: "attempt-1", status: "complete", musicxmlFilename: "score.musicxml" }] } as Score;
    expect(playerCacheIdentity(detail)).toEqual(playerCacheIdentity(baseScore));
    expect(playerCacheIdentity({ ...baseScore, reviewRevision: "b".repeat(64) }))
      .not.toEqual(playerCacheIdentity(baseScore));
  });

  it("does not discard an older revision after a newer revision is saved", async () => {
    const older = playerCacheIdentity(baseScore);
    const newer = playerCacheIdentity({ ...baseScore, reviewRevision: "b".repeat(64) });
    savePlayerMusicXmlToCache(older, xml);
    savePlayerMusicXmlToCache(newer, "<score-partwise id='new' />");
    expect(await loadCachedPlayerMusicXml(older)).toBe(xml);
    expect(await loadCachedPlayerMusicXml(newer)).toContain("id='new'");
  });

  it("refuses corrupt notation without deleting or displaying it", async () => {
    const identity = playerCacheIdentity(baseScore);
    savePlayerMusicXmlToCache(identity, xml);
    const path = [...state.files.keys()][0];
    state.files.set(path, "invalid data");
    expect(await loadCachedPlayerMusicXml(identity)).toBeNull();
    expect(state.files.get(path)).toBe("invalid data");
  });

  it("restores full details only for the account and score they were saved under", async () => {
    saveCachedScoreDetails("admin-1", baseScore);
    expect(await readCachedScoreDetails("admin-1", "score-1")).toEqual(baseScore);
    expect(await readCachedScoreDetails("owner-1", "score-1")).toBeUndefined();
    expect(await readCachedScoreDetails("admin-1", "score-2")).toBeUndefined();
  });
});

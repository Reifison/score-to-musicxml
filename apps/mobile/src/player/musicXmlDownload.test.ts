import { describe, expect, it } from "vitest";
import { createPlayerMusicXmlDownloadPlan } from "./musicXmlDownload";

describe("createPlayerMusicXmlDownloadPlan", () => {
  it("mantém Bearer apenas no header e isola o cache por usuário e partitura", () => {
    const plan = createPlayerMusicXmlDownloadPlan("https://api.example.com", "token-secreto", {
      id: "score/42",
      userId: "user/7"
    });

    expect(plan).toEqual({
      directorySegments: ["player-musicxml", "user_7", "score_42"],
      filename: "score.musicxml",
      headers: { Authorization: "Bearer token-secreto" },
      idempotent: true,
      url: "https://api.example.com/api/scores/score%2F42/download?preview=true"
    });
    expect(plan.url).not.toContain("token-secreto");
  });

  it("usa o download final apenas depois que a revisão é aprovada", () => {
    const plan = createPlayerMusicXmlDownloadPlan("https://api.example.com", "token", {
      id: "score-1",
      userId: "user-1"
    }, false);

    expect(plan.url).toBe("https://api.example.com/api/scores/score-1/download");
  });
});

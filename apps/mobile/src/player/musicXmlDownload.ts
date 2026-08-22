import { safeCacheKey } from "../files/exportFilenames";

type PlayerScore = {
  id: string;
  userId: string;
};

export type PlayerMusicXmlDownloadPlan = {
  directorySegments: readonly string[];
  filename: "score.musicxml";
  headers: { Authorization: string };
  idempotent: true;
  url: string;
};

export function createPlayerMusicXmlDownloadPlan(
  apiUrl: string,
  token: string,
  score: PlayerScore
): PlayerMusicXmlDownloadPlan {
  return {
    directorySegments: ["player-musicxml", safeCacheKey(score.userId), safeCacheKey(score.id)],
    filename: "score.musicxml",
    headers: { Authorization: `Bearer ${token}` },
    idempotent: true,
    url: `${apiUrl}/api/scores/${encodeURIComponent(score.id)}/download`
  };
}

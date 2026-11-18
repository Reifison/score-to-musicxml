import type { ScoreType } from "./types";

export function scoreRetryRequest(id: string, scoreType?: ScoreType) {
  return {
    path: `/api/scores/${encodeURIComponent(id)}/retry`,
    method: "POST" as const,
    ...(scoreType ? { body: JSON.stringify({ scoreType }) } : {})
  };
}

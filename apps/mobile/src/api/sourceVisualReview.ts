import type { VisualCorrectionProposal } from "./types";

export type VisualReviewDecision = "accept" | "reject" | "undo";

export function visualReviewDecisionRequest(
  scoreId: string,
  revision: string,
  proposalId: VisualCorrectionProposal["id"],
  decision: VisualReviewDecision
) {
  return {
    path: `/api/scores/${encodeURIComponent(scoreId)}/visual-review/decision`,
    method: "POST" as const,
    body: JSON.stringify({ revision, proposalId, decision })
  };
}

export function sourceEvidenceImageSource(apiUrl: string, token: string, scoreId: string, assetName: string) {
  const base = apiUrl.replace(/\/$/, "");
  return {
    uri: `${base}/api/scores/${encodeURIComponent(scoreId)}/evidence/${encodeURIComponent(assetName)}`,
    headers: { Authorization: `Bearer ${token}` }
  };
}

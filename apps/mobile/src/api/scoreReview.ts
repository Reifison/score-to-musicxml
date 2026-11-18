export function scoreReviewRequest(id: string, revision: string) {
  return {
    path: `/api/scores/${encodeURIComponent(id)}/review`,
    method: "POST" as const,
    body: JSON.stringify({ revision })
  };
}

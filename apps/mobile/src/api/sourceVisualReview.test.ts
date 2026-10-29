import { describe, expect, it } from "vitest";
import { sourceEvidenceImageSource, visualReviewDecisionRequest } from "./sourceVisualReview";

describe("visual source review API helpers", () => {
  it("sends the selected decision with the exact current revision", () => {
    expect(visualReviewDecisionRequest("score / one", "revision-4", "proposal/2", "accept")).toEqual({
      path: "/api/scores/score%20%2F%20one/visual-review/decision",
      method: "POST",
      body: JSON.stringify({ revision: "revision-4", proposalId: "proposal/2", decision: "accept" })
    });
  });

  it("loads private evidence with the bearer token in the image request headers", () => {
    expect(sourceEvidenceImageSource("https://scores.example/", "mobile-secret", "score-1", "crop page 1.png")).toEqual({
      uri: "https://scores.example/api/scores/score-1/evidence/crop%20page%201.png",
      headers: { Authorization: "Bearer mobile-secret" }
    });
  });
});

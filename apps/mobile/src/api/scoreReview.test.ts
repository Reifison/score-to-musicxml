import { describe, expect, it } from "vitest";
import { scoreReviewRequest } from "./scoreReview";

describe("approval request for a music preview", () => {
  it("sends the exact revision shown to the user", () => {
    expect(scoreReviewRequest("score / one", "xml-revision-7")).toEqual({
      path: "/api/scores/score%20%2F%20one/review",
      method: "POST",
      body: JSON.stringify({ revision: "xml-revision-7" })
    });
  });
});

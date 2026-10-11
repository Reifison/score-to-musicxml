import { describe, expect, it } from "vitest";
import { scoreRetryRequest } from "./scoreRetry";

describe("manual conversion retry request", () => {
  it("targets the existing score and sends a selected type only when supplied for legacy data", () => {
    expect(scoreRetryRequest("score / one")).toEqual({
      path: "/api/scores/score%20%2F%20one/retry",
      method: "POST"
    });
    expect(scoreRetryRequest("score-1", "guitar_duo")).toEqual({
      path: "/api/scores/score-1/retry",
      method: "POST",
      body: JSON.stringify({ scoreType: "guitar_duo" })
    });
  });
});

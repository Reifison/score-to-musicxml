import { describe, expect, it } from "vitest";
import { scoreTypeLabel, scoreTypeOptions } from "./scoreTypes";

describe("score type selection", () => {
  it("offers every conversion profile accepted by the API exactly once", () => {
    expect(scoreTypeOptions.map((option) => option.value).sort()).toEqual([
      "guitar_duo", "guitar_solo", "melody", "piano"
    ]);
    expect(new Set(scoreTypeOptions.map((option) => option.value)).size).toBe(4);
  });

  it("keeps legacy results understandable when no type was selected", () => {
    expect(scoreTypeLabel(undefined)).toBe("Tipo não informado");
    expect(scoreTypeLabel("guitar_duo")).toBe("Violão duo");
  });
});

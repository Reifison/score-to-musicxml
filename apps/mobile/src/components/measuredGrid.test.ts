import { describe, expect, it } from "vitest";
import { getMeasuredGridItemBasis } from "./measuredGrid";

describe("measured responsive grid basis", () => {
  it("uses a full-width basis until the container has room for two minimum-width items", () => {
    expect(getMeasuredGridItemBasis(0, 8)).toBe("100%");
    expect(getMeasuredGridItemBasis(447, 8)).toBe(447);
    expect(getMeasuredGridItemBasis(448, 8)).toBe(220);
    expect(getMeasuredGridItemBasis(454, 14)).toBe(220);
  });

  it("splits the current measured width evenly after subtracting the exact gap", () => {
    expect(getMeasuredGridItemBasis(505, 8)).toBe(248.5);
    expect(getMeasuredGridItemBasis(541, 14)).toBe(263.5);
  });

  it("keeps the item basis and gap inside the measured width", () => {
    for (const [width, gap] of [[310, 8], [346, 14], [581, 8], [621, 14]]) {
      const basis = getMeasuredGridItemBasis(width, gap);
      expect(typeof basis).toBe("number");
      if (width >= 220 * 2 + gap) {
        expect((basis as number) * 2 + gap).toBeLessThanOrEqual(width);
      } else {
        expect(basis).toBeLessThanOrEqual(width);
      }
    }
  });

  it("normalizes invalid gap and minimum width inputs", () => {
    expect(getMeasuredGridItemBasis(441, Number.NaN)).toBe(220.5);
    expect(getMeasuredGridItemBasis(448, 8, Number.NaN)).toBe(220);
  });
});

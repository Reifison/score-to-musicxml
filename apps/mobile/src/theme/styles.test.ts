import { describe, expect, it } from "vitest";
import { colors } from "./colors";

function luminance(hex: string): number {
  const [red, green, blue] = hex.slice(1).match(/.{2}/g)!.map((channel) => {
    const value = Number.parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string): number {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

describe("mobile text contrast", () => {
  it("keeps body, secondary, warning, and action text above WCAG AA on their UI surfaces", () => {
    const pairs: Array<[keyof typeof colors, keyof typeof colors]> = [
      ["ink", "surface"],
      ["muted", "surface"],
      ["faint", "surface"],
      ["faint", "surfaceSoft"],
      ["primaryDark", "primarySoft"],
      ["onPrimary", "primary"],
      ["danger", "surface"],
      ["warning", "surface"],
      ["success", "surface"]
    ];

    for (const [foreground, background] of pairs) {
      expect(contrastRatio(colors[foreground], colors[background]), `${foreground} on ${background}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

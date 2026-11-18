import { describe, expect, it } from "vitest";
import { getReadingLayout, type EdgeInsets } from "./readingLayout";
import type { Frame, ReservedRegion } from "./geometry";

const zero: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const overlaps = (a: Frame, b: Frame) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

describe("reading area and navigation", () => {
  it.each([
    [{ width: 390, height: 844 }, { top: 54, right: 0, bottom: 34, left: 0 }],
    [{ width: 844, height: 390 }, { top: 0, right: 59, bottom: 21, left: 12 }],
    [{ width: 844, height: 390 }, { top: 0, right: 12, bottom: 21, left: 59 }],
    [{ width: 1024, height: 768 }, zero],
    [{ width: 280, height: 300 }, zero]
  ] as const)("keeps content and navigation separate inside asymmetric safe areas", (bounds, insets) => {
    const layout = getReadingLayout(bounds, insets, []);
    for (const frame of [layout.contentFrame, layout.navigationFrame]) {
      expect(frame.x).toBeGreaterThanOrEqual(insets.left);
      expect(frame.y).toBeGreaterThanOrEqual(insets.top);
      expect(frame.x + frame.width).toBeLessThanOrEqual(bounds.width - insets.right);
      expect(frame.y + frame.height).toBeLessThanOrEqual(bounds.height - insets.bottom);
    }
    expect(overlaps(layout.contentFrame, layout.navigationFrame)).toBe(false);
  });

  it.each(["occlusion", "division"] as const)("excludes an active %s region from both surfaces", (kind) => {
    const reserved: ReservedRegion = { x: 480, y: 0, width: 40, height: 740, active: true, kind };
    const layout = getReadingLayout({ width: 1000, height: 740 }, zero, [reserved]);
    expect(overlaps(layout.contentFrame, reserved)).toBe(false);
    expect(overlaps(layout.navigationFrame, reserved)).toBe(false);
  });

  it("collapses the secondary panel when large text needs more reading width", () => {
    const duo = getReadingLayout({ width: 951, height: 669 }, { ...zero, right: 80, bottom: 24 }, [], 1);
    expect(duo.sideBySide).toBe(true);
    expect(duo.contentFrame.width - duo.panelWidth).toBeGreaterThanOrEqual(440);
    expect(getReadingLayout({ width: 1200, height: 900 }, zero, [], 1).sideBySide).toBe(true);
    expect(getReadingLayout({ width: 1200, height: 900 }, zero, [], 2).sideBySide).toBe(false);
  });

  it("expands navigation for large text instead of reducing the text scale", () => {
    const standard = getReadingLayout({ width: 390, height: 844 }, zero, [], 1);
    const large = getReadingLayout({ width: 390, height: 844 }, zero, [], 2);
    expect(large.navigationFrame.height).toBeGreaterThan(standard.navigationFrame.height);
    expect(large.contentFrame.height).toBeLessThan(standard.contentFrame.height);
  });

  it("uses a side rail in compact portrait windows when the continuous area can still hold the reader", () => {
    const outer = getReadingLayout({ width: 466, height: 678 }, { ...zero, right: 80 }, [], 1);
    const inner = getReadingLayout({ width: 669, height: 951 }, zero, [], 1);

    expect(outer.navigationMode).toBe("rail");
    expect(outer.contentFrame.width).toBe(306);
    expect(outer.contentFrame.width).toBeGreaterThanOrEqual(280);
    expect(inner.navigationMode).toBe("rail");
    expect(inner.contentFrame.width).toBeGreaterThanOrEqual(280);
  });

  it("keeps common phone and full tablet portrait windows on bottom navigation", () => {
    expect(getReadingLayout({ width: 440, height: 956 }, zero, []).navigationMode).toBe("bottom");
    expect(getReadingLayout({ width: 1024, height: 1366 }, zero, []).navigationMode).toBe("bottom");
  });

  it.each(["left", "right"] as const)("uses UIKit's %s bar below system indicators and reclaims the extra rail width", (side) => {
    const bounds = { width: 951, height: 669 };
    const insets = { ...zero, [side]: 80, bottom: 24 };
    const bar = { x: side === "right" ? 871 : 0, y: 144, width: 80, height: 501 };
    const previous = getReadingLayout(bounds, insets, []);
    const layout = getReadingLayout(bounds, insets, [], 1, { [side]: bar });
    expect(layout.navigationFrame).toEqual(bar);
    expect(layout.contentFrame.width).toBe(previous.contentFrame.width + 80);
    expect(layout.contentFrame.height).toBe(previous.contentFrame.height);
    expect(overlaps(layout.contentFrame, layout.navigationFrame)).toBe(false);
  });

  it("uses the edge bar on a compact outer window without a second inset column", () => {
    const bar = { x: 386, y: 144, width: 80, height: 510 };
    const layout = getReadingLayout({ width: 466, height: 678 }, { ...zero, right: 80, bottom: 24 }, [], 1, { right: bar });
    expect(layout.navigationMode).toBe("rail");
    expect(layout.contentFrame.width).toBe(386);
    expect(layout.navigationFrame).toEqual(bar);
  });

  it("honors UIKit's measured side margins instead of forcing the bar flush to the glass", () => {
    const bar = { x: 863, y: 120, width: 80, height: 515 };
    const layout = getReadingLayout({ width: 951, height: 669 }, { ...zero, right: 84, bottom: 34 }, [], 1, { right: bar });
    expect(layout.navigationFrame).toEqual(bar);
    expect(layout.contentFrame).toEqual({ x: 0, y: 0, width: 863, height: 635 });
    const portraitBar = { x: 581, y: 82, width: 80, height: 835 };
    const portrait = getReadingLayout({ width: 669, height: 951 }, { ...zero, top: 82, bottom: 34 }, [], 1, { right: portraitBar });
    expect(portrait.navigationFrame).toEqual(portraitBar);
    expect(portrait.contentFrame.width).toBe(581);
  });

  it("rejects unusable or out-of-window bars and keeps the safe-area fallback", () => {
    const bounds = { width: 951, height: 669 };
    const insets = { ...zero, right: 80 };
    const fallback = getReadingLayout(bounds, insets, []);
    for (const bar of [
      { x: 871, y: 144, width: 80, height: 600 },
      { x: 871, y: 144, width: 80, height: 20 },
      { x: 900, y: 144, width: 51, height: 500 }
    ]) {
      expect(getReadingLayout(bounds, insets, [], 1, { right: bar })).toEqual(fallback);
    }
  });

  it("keeps edge navigation out of active camera and fold regions during a resize", () => {
    const region: ReservedRegion = { x: 871, y: 0, width: 80, height: 180, active: true, kind: "occlusion" };
    const layout = getReadingLayout({ width: 951, height: 669 }, { ...zero, right: 80 }, [region], 1,
      { right: { x: 871, y: 144, width: 80, height: 501 } });
    expect(layout.navigationFrame.y).toBe(180);
    expect(overlaps(layout.navigationFrame, region)).toBe(false);
    expect(overlaps(layout.contentFrame, region)).toBe(false);
  });

  it("keeps large-text navigation beside a low reading area with room for complete labels", () => {
    const layout = getReadingLayout({ width: 678, height: 466 }, { ...zero, left: 12, right: 59, bottom: 21 }, [], 2.35);
    expect(layout.navigationMode).toBe("rail");
    expect(layout.navigationFrame.width).toBeGreaterThanOrEqual(166);
    expect(layout.contentFrame.width).toBeGreaterThanOrEqual(360);
    expect(overlaps(layout.contentFrame, layout.navigationFrame)).toBe(false);
  });
});

import { getContinuousFrame, type EdgeBarFrames, type Frame, type ReservedRegion } from "./geometry";

export type EdgeInsets = { top: number; right: number; bottom: number; left: number };
export type ReaderLayout = {
  frame: Frame;
  contentFrame: Frame;
  navigationFrame: Frame;
  navigationMode: "rail" | "bottom";
  railSide: "left" | "right";
  panelWidth: number;
  sideBySide: boolean;
  low: boolean;
};

/** Window points throughout. Reserved-region frames already include their margins. */
export function getReadingLayout(
  bounds: { width: number; height: number },
  insets: EdgeInsets,
  regions: ReservedRegion[],
  fontScale = 1,
  barFrames?: EdgeBarFrames
): ReaderLayout {
  const textScale = Math.max(1, Number.isFinite(fontScale) ? fontScale : 1);
  const safe: Frame = {
    x: insets.left,
    y: insets.top,
    width: Math.max(0, bounds.width - insets.left - insets.right),
    height: Math.max(0, bounds.height - insets.top - insets.bottom)
  };
  const frame = getContinuousFrame(safe, regions);
  const railWidth = Math.ceil(80 + Math.max(0, textScale - 1) * 64);
  const railSide = insets.left > insets.right ? "left" : "right";
  const measuredBar = barFrames?.[railSide];
  const availableBar = measuredBar ? getContinuousFrame(measuredBar, regions) : undefined;
  // Only UIKit can authorize using the part outside the rectangular safe area.
  // Older native builds retain their safe-area-only rail. Exclude active fold
  // and camera regions even if an edge-bar snapshot arrived during a resize.
  const edgeBar = availableBar && availableBar.x >= 0 && availableBar.y >= 0
    && availableBar.width >= railWidth && availableBar.height >= 56
    && availableBar.x + availableBar.width <= bounds.width
    && availableBar.y + availableBar.height <= bounds.height
    && (railSide === "right"
      ? availableBar.x >= bounds.width / 2
      : availableBar.x + availableBar.width <= bounds.width / 2)
    ? availableBar : undefined;
  const low = frame.height < 520 * textScale;
  const minimumReadingWidth = Math.min(360, 280 * textScale);
  const railContent: Frame = edgeBar
    ? railSide === "right"
      ? { ...frame, width: Math.max(0, Math.min(frame.x + frame.width, edgeBar.x) - frame.x) }
      : { ...frame, x: Math.max(frame.x, edgeBar.x + edgeBar.width), width: Math.max(0, frame.x + frame.width - Math.max(frame.x, edgeBar.x + edgeBar.width)) }
    : { ...frame, x: frame.x + (railSide === "left" ? railWidth : 0), width: Math.max(0, frame.width - railWidth) };
  const railFits = railContent.width >= minimumReadingWidth;
  // Compact portrait windows between phone and full tablet widths can use a
  // rail when their continuous safe area still leaves room for reading. This
  // adapts to foldable and resizable windows without checking a device model.
  const compactPortraitWindow = bounds.width >= 460 && bounds.width < 800 && bounds.height >= bounds.width;
  const useRail = railFits
    && (frame.width >= 760 && frame.width > frame.height || low && frame.width >= 480 || compactPortraitWindow);
  const navigationHeight = Math.min(frame.height, Math.ceil(48 + 32 * textScale));
  const navigationFrame: Frame = useRail
    ? edgeBar ?? { x: railSide === "left" ? frame.x : frame.x + frame.width - railWidth, y: frame.y, width: railWidth, height: frame.height }
    : { x: frame.x, y: frame.y + frame.height - navigationHeight, width: frame.width, height: navigationHeight };
  const contentFrame: Frame = useRail
    ? railContent
    : { ...frame, height: Math.max(0, frame.height - navigationHeight) };
  const panelWidth = Math.ceil(320 * textScale);
  return {
    frame,
    contentFrame,
    navigationFrame,
    navigationMode: useRail ? "rail" : "bottom",
    railSide,
    panelWidth,
    sideBySide: contentFrame.width >= panelWidth + 440 * textScale,
    low
  };
}

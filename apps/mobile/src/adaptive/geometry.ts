export type Frame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type EdgeBarFrames = Partial<Record<'left' | 'right', Frame>>;

export type ReservedRegion = Frame & {
  kind: 'division' | 'occlusion';
  active: boolean;
};

function isFiniteFrame(frame: Frame): boolean {
  return (
    Number.isFinite(frame.x) &&
    Number.isFinite(frame.y) &&
    Number.isFinite(frame.width) &&
    Number.isFinite(frame.height)
  );
}

function intersection(frame: Frame, region: Frame): Frame | null {
  const left = Math.max(frame.x, region.x);
  const top = Math.max(frame.y, region.y);
  const right = Math.min(frame.x + frame.width, region.x + region.width);
  const bottom = Math.min(frame.y + frame.height, region.y + region.height);
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function subtractRegion(frame: Frame, region: Frame): Frame[] {
  const overlap = intersection(frame, region);
  if (!overlap) return [frame];

  const frameRight = frame.x + frame.width;
  const frameBottom = frame.y + frame.height;
  const overlapRight = overlap.x + overlap.width;
  const overlapBottom = overlap.y + overlap.height;

  return [
    { ...frame, width: overlap.x - frame.x },
    { ...frame, x: overlapRight, width: frameRight - overlapRight },
    { ...frame, height: overlap.y - frame.y },
    { ...frame, y: overlapBottom, height: frameBottom - overlapBottom },
  ].filter((candidate) => candidate.width > 0 && candidate.height > 0);
}

function area(frame: Frame): number {
  return frame.width * frame.height;
}

/**
 * Returns the largest rectangular part of `frame` that does not intersect any
 * active reserved region. Native region frames already include their margins,
 * so this function does not add another safety margin.
 *
 * Equal-area results favor the bottom, then the trailing (right-hand) area.
 */
export function getContinuousFrame(frame: Frame, regions: ReservedRegion[]): Frame {
  if (!isFiniteFrame(frame)) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const initial = {
    x: frame.x,
    y: frame.y,
    width: Math.max(0, frame.width),
    height: Math.max(0, frame.height),
  };
  if (initial.width === 0 || initial.height === 0) return initial;

  let candidates = [initial];
  const activeRegions = regions.filter(
    (region) =>
      region.active &&
      isFiniteFrame(region) &&
      region.width > 0 &&
      region.height > 0
  );

  for (const region of activeRegions) {
    candidates = candidates.flatMap((candidate) => subtractRegion(candidate, region));
    if (candidates.length === 0) break;
  }

  return (
    candidates.sort((a, b) => {
      const areaDifference = area(b) - area(a);
      if (areaDifference !== 0) return areaDifference;
      return b.y - a.y || b.x - a.x;
    })[0] ?? { x: frame.x, y: frame.y, width: 0, height: 0 }
  );
}

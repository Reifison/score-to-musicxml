import { describe, expect, it } from 'vitest';

import { getContinuousFrame, type Frame, type ReservedRegion } from './geometry';

const frame: Frame = { x: 0, y: 0, width: 100, height: 100 };

function region(overrides: Partial<ReservedRegion> = {}): ReservedRegion {
  return {
    x: 45,
    y: 0,
    width: 10,
    height: 100,
    kind: 'division',
    active: true,
    ...overrides,
  };
}

describe('getContinuousFrame', () => {
  it('returns a copy of the full frame when there are no regions', () => {
    expect(getContinuousFrame(frame, [])).toEqual(frame);
    expect(getContinuousFrame(frame, [])).not.toBe(frame);
  });

  it('chooses the trailing side when a vertical division leaves equal areas', () => {
    expect(getContinuousFrame(frame, [region()])).toEqual({
      x: 55,
      y: 0,
      width: 45,
      height: 100,
    });
  });

  it('chooses the bottom when a horizontal region leaves equal areas', () => {
    expect(
      getContinuousFrame(frame, [
        region({ x: 0, y: 45, width: 100, height: 10, kind: 'occlusion' }),
      ])
    ).toEqual({ x: 0, y: 55, width: 100, height: 45 });
  });

  it('uses the exact native region frame without adding another margin', () => {
    expect(
      getContinuousFrame(frame, [
        region({ x: 49, width: 2 }),
      ])
    ).toEqual({ x: 51, y: 0, width: 49, height: 100 });
  });

  it('keeps asymmetric safe-frame origins in window coordinates', () => {
    expect(
      getContinuousFrame(
        { x: 21, y: 37, width: 341, height: 702 },
        [region({ x: 21, y: 37, width: 341, height: 24, kind: 'occlusion' })]
      )
    ).toEqual({ x: 21, y: 61, width: 341, height: 678 });
  });

  it('ignores inactive regions and regions outside the frame', () => {
    expect(
      getContinuousFrame(frame, [
        region({ active: false }),
        region({ x: 110, width: 20 }),
      ])
    ).toEqual(frame);
  });

  it('clips regions to the frame before selecting a free area', () => {
    expect(
      getContinuousFrame(frame, [
        region({ x: -20, width: 70 }),
      ])
    ).toEqual({ x: 50, y: 0, width: 50, height: 100 });
  });

  it('subtracts multiple regions without returning an overlapping frame', () => {
    const result = getContinuousFrame(frame, [
      region({ x: 40, y: 20, width: 20, height: 60 }),
      region({ x: 20, y: 40, width: 60, height: 20, kind: 'occlusion' }),
    ]);

    expect(result).toEqual({ x: 0, y: 80, width: 100, height: 20 });
  });

  it('returns an empty frame when active regions cover the whole input', () => {
    expect(getContinuousFrame(frame, [region({ x: -5, width: 110 })])).toEqual({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });
  });

  it('normalizes negative frame dimensions and rejects non-finite input', () => {
    expect(getContinuousFrame({ x: 5, y: 8, width: -1, height: 20 }, [])).toEqual({
      x: 5,
      y: 8,
      width: 0,
      height: 20,
    });
    expect(
      getContinuousFrame({ x: Number.NaN, y: 0, width: 10, height: 10 }, [])
    ).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});

// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAdaptiveLayout } from './useAdaptiveLayout';

const testState = vi.hoisted(() => ({
  snapshot: {
    bounds: { width: 844, height: 390 },
    regions: [],
    fontScale: 1.75,
    contentSizeCategory: 'UICTContentSizeCategoryAccessibilityL',
    nativeAvailable: true,
  },
}));

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

vi.mock('./useReservedRegions', () => ({
  useReservedRegions: () => testState.snapshot,
}));

describe('useAdaptiveLayout typography', () => {
  it('uses the measured window scale for the reader geometry', () => {
    const { result } = renderHook(() => useAdaptiveLayout());

    expect(result.current.fontScale).toBe(1.75);
    expect(result.current.contentSizeCategory).toBe('UICTContentSizeCategoryAccessibilityL');
    expect(result.current.panelWidth).toBe(560);
  });
});

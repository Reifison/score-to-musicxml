// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useReservedRegions } from './useReservedRegions';

const testState = vi.hoisted(() => ({
  platform: 'android',
  width: 390,
  height: 844,
  fontScale: 1,
  nativeModule: null as {
    getSnapshot: () => Promise<unknown>;
    addListener: (
      eventName: string,
      listener: (snapshot: unknown) => void
    ) => { remove: () => void };
  } | null,
}));

vi.mock('react-native', () => ({
  Platform: { get OS() { return testState.platform; } },
  useWindowDimensions: () => ({ width: testState.width, height: testState.height, fontScale: testState.fontScale }),
}));

vi.mock('expo-modules-core', () => ({
  requireOptionalNativeModule: () => testState.nativeModule,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((success) => { resolve = success; });
  return { promise, resolve };
}

afterEach(() => {
  cleanup();
  testState.platform = 'android';
  testState.width = 390;
  testState.height = 844;
  testState.fontScale = 1;
  testState.nativeModule = null;
});

describe('useReservedRegions', () => {
  it('accepts edge-bar geometry from the same native snapshot, ignoring invalid frames', async () => {
    testState.platform = 'ios';
    const bar = { x: 871, y: 144, width: 80, height: 501 };
    testState.nativeModule = {
      getSnapshot: async () => ({
        bounds: { width: 951, height: 669 }, regions: [],
        safeAreaInsets: { top: 0, left: 0, right: 80, bottom: 24 },
        barFrames: { right: bar, left: { x: -1, y: 0, width: 80, height: 669 } },
      }),
      addListener: () => ({ remove: vi.fn() }),
    };
    const { result } = renderHook(() => useReservedRegions());
    await act(async () => { await Promise.resolve(); });
    expect(result.current.barFrames).toEqual({ right: bar });
    expect(result.current.insets?.right).toBe(80);
    expect(result.current.nativeAvailable).toBe(true);
  });

  it('uses and updates React Native dimensions when the native module is absent', async () => {
    testState.platform = 'android';
    testState.fontScale = 1.25;
    const { result, rerender } = renderHook(() => useReservedRegions());

    expect(result.current).toEqual({
      bounds: { width: 390, height: 844 },
      regions: [],
      fontScale: 1.25,
      contentSizeCategory: undefined,
      nativeAvailable: false,
    });

    testState.width = 844;
    testState.height = 390;
    testState.fontScale = 1.5;
    rerender();

    expect(result.current.bounds).toEqual({ width: 844, height: 390 });
    expect(result.current.regions).toEqual([]);
    expect(result.current.fontScale).toBe(1.5);
    expect(result.current.insets).toBeUndefined();
  });

  it('normalizes a nonpositive React Native fallback scale to one', () => {
    testState.platform = 'android';
    testState.fontScale = 0;

    const { result } = renderHook(() => useReservedRegions());

    expect(result.current.fontScale).toBe(1);
  });

  it('uses a valid per-window scale and content-size category from the native snapshot', async () => {
    testState.platform = 'ios';
    testState.fontScale = 1.2;
    testState.nativeModule = {
      getSnapshot: async () => ({
        bounds: { width: 844, height: 390 },
        regions: [],
        fontScale: 1.8,
        contentSizeCategory: 'UICTContentSizeCategoryAccessibilityM',
        revision: 1,
      }),
      addListener: () => ({ remove: vi.fn() }),
    };

    const { result } = renderHook(() => useReservedRegions());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.fontScale).toBe(1.8);
    expect(result.current.contentSizeCategory).toBe('UICTContentSizeCategoryAccessibilityM');
    expect(result.current.nativeAvailable).toBe(true);
  });

  it('falls back to a valid React Native scale when a native scale is invalid', async () => {
    testState.platform = 'ios';
    testState.fontScale = 1.4;
    testState.nativeModule = {
      getSnapshot: async () => ({
        bounds: { width: 844, height: 390 },
        regions: [],
        fontScale: 0,
        contentSizeCategory: 'UICTContentSizeCategoryExtraLarge',
        revision: 1,
      }),
      addListener: () => ({ remove: vi.fn() }),
    };

    const { result } = renderHook(() => useReservedRegions());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.fontScale).toBe(1.4);
    expect(result.current.contentSizeCategory).toBe('UICTContentSizeCategoryExtraLarge');
    expect(result.current.nativeAvailable).toBe(true);
  });

  it('keeps a newer event snapshot when an older initial request resolves later', async () => {
    testState.platform = 'ios';
    const initial = deferred<unknown>();
    let receiveSnapshot: ((snapshot: unknown) => void) | undefined;
    const removeListener = vi.fn();
    testState.nativeModule = {
      getSnapshot: () => initial.promise,
      addListener: (_eventName, listener) => {
        receiveSnapshot = listener;
        return { remove: removeListener };
      },
    };

    const { result, unmount } = renderHook(() => useReservedRegions());
    const newerSnapshot = {
      bounds: { width: 844, height: 390 },
      safeAreaInsets: { top: 0, right: 12, bottom: 21, left: 0 },
      regions: [{ x: 410, y: 0, width: 24, height: 390, kind: 'division', active: true }],
      fontScale: 1.75,
      contentSizeCategory: 'UICTContentSizeCategoryAccessibilityL',
      revision: 2,
    };

    await act(async () => {
      receiveSnapshot?.(newerSnapshot);
      initial.resolve({
        bounds: { width: 390, height: 844 },
        safeAreaInsets: { top: 48, right: 0, bottom: 21, left: 0 },
        regions: [],
        fontScale: 1.2,
        contentSizeCategory: 'UICTContentSizeCategoryLarge',
        revision: 1,
      });
      await initial.promise;
    });

    expect(result.current).toEqual({
      bounds: { width: 844, height: 390 },
      regions: newerSnapshot.regions,
      insets: newerSnapshot.safeAreaInsets,
      fontScale: newerSnapshot.fontScale,
      contentSizeCategory: newerSnapshot.contentSizeCategory,
      nativeAvailable: true,
    });

    unmount();
    expect(removeListener).toHaveBeenCalledOnce();
  });
});

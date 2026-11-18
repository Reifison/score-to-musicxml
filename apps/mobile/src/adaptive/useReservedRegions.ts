import { useEffect, useState } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import {
  requireOptionalNativeModule,
  type EventSubscription,
} from 'expo-modules-core';

import type { EdgeBarFrames, ReservedRegion } from './geometry';

export type Insets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type ReservedRegionsSnapshot = {
  bounds: { width: number; height: number };
  regions: ReservedRegion[];
  /** Present only when bounds, regions, and safe area came from one native snapshot. */
  insets?: Insets;
  /** Per-window UIKit text scale when available; otherwise React Native's window scale. */
  fontScale: number;
  /** UIKit's preferred content-size category for the measured window. */
  contentSizeCategory?: string;
  nativeAvailable: boolean;
  /** UIKit edge-bar regions; unlike a rectangular safe area, these can extend below side system indicators. */
  barFrames?: EdgeBarFrames;
};

type NativeSnapshot = {
  bounds: { width: number; height: number };
  regions: ReservedRegion[];
  safeAreaInsets?: Insets;
  fontScale?: number;
  contentSizeCategory?: string;
  revision?: number;
  barFrames?: EdgeBarFrames;
};

type AdaptiveLayoutNativeModule = {
  getSnapshot(): Promise<NativeSnapshot>;
  addListener(
    eventName: 'snapshotChanged',
    listener: (snapshot: NativeSnapshot) => void
  ): EventSubscription;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validFontScale(value: unknown): value is number {
  return finiteNumber(value) && value > 0;
}

function parseInsets(value: unknown): Insets | undefined {
  if (!isRecord(value)) return undefined;
  const { top, right, bottom, left } = value;
  if (
    !finiteNumber(top) ||
    !finiteNumber(right) ||
    !finiteNumber(bottom) ||
    !finiteNumber(left) ||
    top < 0 ||
    right < 0 ||
    bottom < 0 ||
    left < 0
  ) {
    return undefined;
  }
  return { top, right, bottom, left };
}

function parseSnapshot(value: unknown): NativeSnapshot | null {
  if (!isRecord(value) || !isRecord(value.bounds) || !Array.isArray(value.regions)) {
    return null;
  }

  const width = value.bounds.width;
  const height = value.bounds.height;
  if (!finiteNumber(width) || !finiteNumber(height) || width <= 0 || height <= 0) {
    return null;
  }

  const fontScale = validFontScale(value.fontScale) ? value.fontScale : undefined;
  const contentSizeCategory = typeof value.contentSizeCategory === 'string' && value.contentSizeCategory.length > 0
    ? value.contentSizeCategory
    : undefined;

  const regions: ReservedRegion[] = [];
  for (const item of value.regions) {
    if (!isRecord(item)) continue;
    const { x, y, width: regionWidth, height: regionHeight, kind, active } = item;
    if (
      !finiteNumber(x) ||
      !finiteNumber(y) ||
      !finiteNumber(regionWidth) ||
      !finiteNumber(regionHeight) ||
      regionWidth < 0 ||
      regionHeight < 0 ||
      (kind !== 'division' && kind !== 'occlusion') ||
      typeof active !== 'boolean'
    ) {
      continue;
    }
    regions.push({ x, y, width: regionWidth, height: regionHeight, kind, active });
  }

  const barFrames: EdgeBarFrames = {};
  if (isRecord(value.barFrames)) {
    for (const side of ['left', 'right'] as const) {
      const frame = value.barFrames[side];
      if (!isRecord(frame)) continue;
      const { x, y, width: w, height: h } = frame;
      if (finiteNumber(x) && finiteNumber(y) && finiteNumber(w) && finiteNumber(h)
        && x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= width && y + h <= height) {
        barFrames[side] = { x, y, width: w, height: h };
      }
    }
  }

  return {
    bounds: { width, height },
    regions,
    safeAreaInsets: parseInsets(value.safeAreaInsets),
    fontScale,
    contentSizeCategory,
    revision: finiteNumber(value.revision) ? value.revision : undefined,
    ...(Object.keys(barFrames).length ? { barFrames } : {}),
  };
}

/**
 * Reads window-local reserved regions and Dynamic Type metrics from the iOS
 * Expo module. Android, Expo Go, and older native builds use React Native
 * window dimensions and font scale with no regions; `insets` stays undefined
 * so callers can keep using their safe-area provider.
 */
export function useReservedRegions(): ReservedRegionsSnapshot {
  const { width, height, fontScale } = useWindowDimensions();
  const fallbackFontScale = validFontScale(fontScale) ? fontScale : 1;
  const [nativeSnapshot, setNativeSnapshot] = useState<NativeSnapshot | null>(null);
  const [nativeAvailable, setNativeAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const nativeModule =
      requireOptionalNativeModule<AdaptiveLayoutNativeModule>('AdaptiveLayout');
    if (!nativeModule) return;

    let mounted = true;
    let eventCount = 0;
    let latestRevision = -1;
    let subscription: EventSubscription;

    const applySnapshot = (value: unknown) => {
      const rawRevision = isRecord(value) && finiteNumber(value.revision)
        ? value.revision
        : undefined;
      if (rawRevision !== undefined && rawRevision < latestRevision) return;

      const parsed = parseSnapshot(value);
      if (!parsed) {
        if (rawRevision !== undefined) latestRevision = rawRevision;
        setNativeSnapshot(null);
        setNativeAvailable(false);
        return;
      }

      if (parsed.revision !== undefined) latestRevision = parsed.revision;
      setNativeSnapshot(parsed);
      setNativeAvailable(true);
    };

    try {
      subscription = nativeModule.addListener('snapshotChanged', (value) => {
        eventCount += 1;
        if (mounted) applySnapshot(value);
      });
    } catch {
      setNativeSnapshot(null);
      setNativeAvailable(false);
      return;
    }

    const eventCountAtRequest = eventCount;
    let snapshotRequest: Promise<NativeSnapshot>;
    try {
      snapshotRequest = nativeModule.getSnapshot();
    } catch {
      setNativeSnapshot(null);
      setNativeAvailable(false);
      return () => {
        mounted = false;
        subscription.remove();
      };
    }

    snapshotRequest.then((value) => {
      if (mounted && eventCount === eventCountAtRequest) applySnapshot(value);
    }).catch(() => {
      if (mounted && eventCount === eventCountAtRequest) {
        setNativeSnapshot(null);
        setNativeAvailable(false);
      }
    });

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  if (nativeAvailable && nativeSnapshot) {
    return {
      bounds: nativeSnapshot.bounds,
      regions: nativeSnapshot.regions,
      insets: nativeSnapshot.safeAreaInsets,
      fontScale: nativeSnapshot.fontScale ?? fallbackFontScale,
      contentSizeCategory: nativeSnapshot.contentSizeCategory,
      nativeAvailable: true,
      ...(nativeSnapshot.barFrames ? { barFrames: nativeSnapshot.barFrames } : {}),
    };
  }

  return {
    bounds: { width, height },
    regions: [],
    fontScale: fallbackFontScale,
    contentSizeCategory: undefined,
    nativeAvailable: false,
  };
}

import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getReadingLayout } from "./readingLayout";
import { useReservedRegions } from "./useReservedRegions";

export function useAdaptiveLayout() {
  const fallbackInsets = useSafeAreaInsets();
  const snapshot = useReservedRegions();
  const insets = snapshot.insets ?? fallbackInsets;
  return {
    ...getReadingLayout(snapshot.bounds, insets, snapshot.regions, snapshot.fontScale, snapshot.barFrames),
    fontScale: snapshot.fontScale,
    contentSizeCategory: snapshot.contentSizeCategory,
    bounds: snapshot.bounds,
    insets,
    nativeAvailable: snapshot.nativeAvailable
  };
}

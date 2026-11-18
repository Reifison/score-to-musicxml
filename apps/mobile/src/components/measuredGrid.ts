/**
 * Measures a two-column grid from its current container width instead of a
 * percentage basis, which can remain tied to the previous window size after
 * a live resize on iOS.
 */
export function getMeasuredGridItemBasis(
  containerWidth: number,
  gap: number,
  minimumItemWidth = 220
): number | "100%" {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) return "100%";

  const safeGap = Number.isFinite(gap) ? Math.max(0, gap) : 0;
  const safeMinimum = Number.isFinite(minimumItemWidth) && minimumItemWidth > 0
    ? minimumItemWidth
    : 220;
  const width = containerWidth;

  if (width < safeMinimum * 2 + safeGap) return width;
  return (width - safeGap) / 2;
}

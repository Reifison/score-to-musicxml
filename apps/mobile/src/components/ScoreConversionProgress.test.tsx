// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Score } from "../api/types";
import { ScoreConversionProgress } from "./ScoreConversionProgress";

vi.mock("react-native", () => ({
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
  View: ({ children, accessible, accessibilityLabel, accessibilityLiveRegion }: { children: React.ReactNode; accessible?: boolean; accessibilityLabel?: string; accessibilityLiveRegion?: "polite" | "assertive" | "off" }) => (
    <div aria-label={accessibilityLabel} aria-live={accessibilityLiveRegion} role={accessible ? "status" : undefined}>{children}</div>
  )
}));
vi.mock("../adaptive/AdaptiveTypography", () => ({ AdaptiveText: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));

const score = {
  id: "score-1", userId: "user-1", originalFilename: "Study.pdf", storedFilename: "score.pdf", fileType: "pdf", mimeType: "application/pdf", fileSize: 100,
  uploadStatus: "converted", conversionStatus: "converted", conversionProgress: {
    attemptId: "attempt-2", stage: "interrupted", totalPages: null, currentPage: null, completedPages: [2], failedPages: [], excludedPages: [], reusedPages: [], updatedAt: "2026-10-16T12:00:00.000Z"
  },
  attempts: [], errorMessage: null, warnings: null, confidence: null, musicxmlFilename: "score.musicxml", isFavorite: false,
  createdAt: "2026-10-16T10:00:00.000Z", updatedAt: "2026-10-16T12:00:00.000Z", convertedAt: "2026-10-16T10:00:00.000Z"
} satisfies Score;

describe("mobile ScoreConversionProgress", () => {
  it("exposes interrupted page counts through a polite live status", () => {
    render(<ScoreConversionProgress score={score} language="en" />);

    const status = screen.getByRole("status", { name: /Attempt interrupted\. 1 page recognized before the interruption/i });
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toContain("1 page recognized before the interruption.");
  });
});

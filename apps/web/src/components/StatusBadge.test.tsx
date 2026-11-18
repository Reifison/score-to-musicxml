import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { RecognitionQuality } from "../types/domain.js";
import { StatusBadge } from "./StatusBadge.js";

const needsReview: RecognitionQuality = {
  status: "needs_review",
  sourceComparison: "compared",
  checkedMeasures: 2,
  accuracyVerified: false,
  issues: []
};

describe("StatusBadge recognition quality", () => {
  it("keeps partial coverage as the primary status", () => {
    render(<StatusBadge status="converted" resultStatus="partial" recognitionQuality={needsReview} />);

    expect(screen.getByText("Parcial")).toBeInTheDocument();
    expect(screen.queryByText("Revisar partitura")).not.toBeInTheDocument();
  });

  it("shows a review label for converted results that need attention", () => {
    render(<StatusBadge status="converted" resultStatus="complete" recognitionQuality={needsReview} />);

    expect(screen.getByText("Revisar partitura")).toBeInTheDocument();
  });

  it("warns when source comparison is unavailable and tolerates legacy nulls", () => {
    const unverified: RecognitionQuality = { ...needsReview, status: "unverified", sourceComparison: "unavailable" };
    const { rerender } = render(<StatusBadge status="converted" recognitionQuality={unverified} />);

    expect(screen.getByText("Conferir original")).toBeInTheDocument();

    rerender(<StatusBadge status="converted" recognitionQuality={null} />);
    expect(screen.getByText("Convertido")).toBeInTheDocument();
  });
});

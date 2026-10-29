// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RecognitionQuality } from "../api/types";
import { RecognitionQualityNotice } from "./RecognitionQualityNotice";
import { StatusBadge } from "./StatusBadge";

vi.mock("react-native", () => ({
  StyleSheet: { create: (styles: unknown) => styles },
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  View: ({ children }: { children: ReactNode }) => <div>{children}</div>
}));

const reviewQuality: RecognitionQuality = {
  status: "needs_review",
  sourceComparison: "compared",
  checkedMeasures: 2,
  accuracyVerified: false,
  issues: [
    { code: "RHYTHM_SHORT", message: "O ritmo pode estar incompleto neste trecho.", page: 1, measure: "0" },
    { code: "VISUAL_KEY_SIGNATURE_MISMATCH", message: "A armadura pode divergir do original.", page: 2, measure: "12" }
  ]
};

afterEach(cleanup);

describe("mobile recognition quality", () => {
  it("keeps partial coverage ahead of the recognition label", () => {
    render(<StatusBadge status="converted" resultStatus="partial" recognitionQuality={reviewQuality} />);

    expect(screen.getByText("Parcial")).not.toBeNull();
    expect(screen.queryByText("Revisar partitura")).toBeNull();
  });

  it("shows plain source locations for rhythm and key warnings", () => {
    const { container } = render(<RecognitionQualityNotice quality={reviewQuality} />);

    expect(container.textContent).toContain("Revisar partitura");
    expect(container.textContent).toContain("Página 1 · compasso 0: O ritmo pode estar incompleto neste trecho.");
    expect(container.textContent).toContain("Página 2 · compasso 12: A armadura pode divergir do original.");
    expect(container.textContent).not.toContain("RHYTHM_SHORT");
  });

  it("explains incomplete comparison and tolerates missing or null quality", () => {
    const unverified: RecognitionQuality = {
      status: "unverified",
      sourceComparison: "partial",
      checkedMeasures: 1,
      accuracyVerified: false,
      issues: []
    };
    const { rerender, container } = render(<RecognitionQualityNotice quality={unverified} />);

    expect(container.textContent).toContain("A comparação cobriu apenas parte da partitura.");
    expect(container.textContent).not.toContain("aprovada");

    rerender(<RecognitionQualityNotice quality={null} />);
    expect(container.textContent).toBe("");

    rerender(<StatusBadge status="converted" />);
    expect(container.textContent).toContain("Convertido");
  });

  it("shows comparison limits for unverified results without presenting a musical error", () => {
    const unverifiedWithIssue: RecognitionQuality = {
      status: "unverified",
      sourceComparison: "partial",
      checkedMeasures: 1,
      accuracyVerified: false,
      issues: [{
        code: "VISUAL_SOURCE_COVERAGE_UNCONFIRMED",
        message: "Não foi possível conferir todos os compassos desta página.",
        page: 1
      }]
    };
    const { container } = render(<>
      <StatusBadge status="converted" resultStatus="complete" recognitionQuality={unverifiedWithIssue} />
      <RecognitionQualityNotice quality={unverifiedWithIssue} />
    </>);

    expect(container.textContent).toContain("Conferir original");
    expect(container.textContent).toContain("Os avisos abaixo indicam limites da comparação com o original; eles não confirmam um erro musical.");
    expect(container.textContent).toContain("Não foi possível conferir todos os compassos desta página.");
    expect(container.textContent).not.toContain("Revisar partitura");
  });
});

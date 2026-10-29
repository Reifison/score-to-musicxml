import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Score } from "../types/domain.js";
import { ScoreDetails } from "./ScoreDetails.js";

const { firstPagePreviewSpy, scorePlayerSpy } = vi.hoisted(() => ({ firstPagePreviewSpy: vi.fn(), scorePlayerSpy: vi.fn() }));
vi.mock("./FirstPagePreview.js", () => ({
  FirstPagePreview: ({ score }: { score: Score }) => {
    firstPagePreviewSpy(score);
    return score.conversionPreview ? <div data-testid="first-page-preview">Prévia da primeira página</div> : null;
  }
}));
vi.mock("./ScorePlayer.js", () => ({
  ScorePlayer: (props: { allowPlayback?: boolean; previewOnly?: boolean }) => {
    scorePlayerSpy(props);
    return <div data-testid="score-player">Player</div>;
  }
}));

vi.mock("./GuidedScoreReview.js", () => ({ GuidedScoreReview: (props: { score: Score; originalPreview: React.ReactNode; resultPreview: React.ReactNode; onScoreChange: (score: Score) => void }) => <section data-testid="guided-review">{props.originalPreview}{props.resultPreview}
  <button onClick={() => void props.onScoreChange({ ...props.score, reviewRevision: "new-revision", musicxmlFilename: "corrected.musicxml" })}>Salvar sugestão de teste</button>
</section> }));
vi.mock("./ScoreVersionHistory.js", () => ({ ScoreVersionHistory: (props: { onOpenVersion: (version: unknown, xml: string) => void }) => <section data-testid="version-history">
  <button onClick={() => props.onOpenVersion({ id: "revision:old", revision: "old-revision", label: "Conversão inicial", isCurrent: false }, "<score-partwise />")}>Abrir anterior de teste</button>
</section> }));

const score: Score = {
  id: "score-1",
  userId: "user-1",
  originalFilename: "Estudo.pdf",
  storedFilename: "score.pdf",
  fileType: "pdf",
  mimeType: "application/pdf",
  fileSize: 1024,
  uploadStatus: "converted",
  conversionStatus: "converted",
  scoreType: "piano",
  scoreTypeSelected: true,
  resultStatus: "complete",
  coverage: { totalPages: 2, processedPages: [1, 2], missingPages: [], pages: [] },
  attempts: [],
  reviewStatus: "needs_review",
  reviewRevision: "xml-revision-1",
  canDownloadMusicXml: true,
  canPlay: true,
  canExportMidi: true,
  errorMessage: null,
  warnings: null,
  confidence: null,
  musicxmlFilename: "score.musicxml",
  isFavorite: false,
  createdAt: "2026-10-07T00:00:00.000Z",
  updatedAt: "2026-10-07T00:00:00.000Z",
  convertedAt: "2026-10-07T00:00:00.000Z"
};

const props = {
  onClose: vi.fn(),
  onDownload: vi.fn(),
  onDownloadMidi: vi.fn(),
  onRename: vi.fn(),
  detailError: "",
  onRetry: vi.fn(async () => score),
  onRefreshDetail: vi.fn(async () => score)
};

describe("ScoreDetails delivery", () => {
  it("shows playback when a tie could not be verified for export", () => {
    render(<ScoreDetails score={{ ...score, canPlay: false, canExportMidi: false,
      validation: { version: 1, issues: [], checkedMeasures: 1, skippedMeasures: 0, requiresReview: true,
        midiValidation: { status: "unverified", checkedNotes: 0, issues: [{ code: "MIDI_EVENTS_UNVERIFIED", message: "Ligadura não verificada." }], limitations: [], xmlSHA256: "xml" }
      }
    }} {...props} />);
    expect(scorePlayerSpy).toHaveBeenLastCalledWith(expect.objectContaining({ allowPlayback: true }));
    expect(screen.getByRole("button", { name: "Baixar MIDI" })).toBeDisabled();
  });

  it("shows rhythm and key warnings at their source locations without blocking exports", () => {
    render(<ScoreDetails score={{
      ...score,
      recognitionQuality: {
        status: "needs_review",
        sourceComparison: "compared",
        checkedMeasures: 2,
        accuracyVerified: false,
        issues: [
          { code: "RHYTHM_SHORT", message: "O ritmo pode estar incompleto neste trecho.", page: 1, measure: "0" },
          { code: "VISUAL_KEY_SIGNATURE_MISMATCH", message: "A armadura pode divergir do original.", page: 2, measure: "12" }
        ]
      }
    }} {...props} />);

    expect(screen.getByRole("status", { name: "Revisar partitura" })).toBeInTheDocument();
    expect(screen.getByText("Página 1 · compasso 0:")).toBeInTheDocument();
    expect(screen.getByText("O ritmo pode estar incompleto neste trecho.")).toBeInTheDocument();
    expect(screen.getByText("Página 2 · compasso 12:")).toBeInTheDocument();
    expect(screen.getByText("A armadura pode divergir do original.")).toBeInTheDocument();
    expect(screen.queryByText("RHYTHM_SHORT")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Baixar MusicXML" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Baixar MIDI" })).toBeEnabled();
  });

  it("explains that an unverified conversion must be checked against its source", () => {
    render(<ScoreDetails score={{
      ...score,
      recognitionQuality: {
        status: "unverified",
        sourceComparison: "partial",
        checkedMeasures: 2,
        accuracyVerified: false,
        issues: [{
          code: "VISUAL_SOURCE_COVERAGE_UNCONFIRMED",
          message: "Não foi possível conferir todos os compassos desta página.",
          page: 1
        }]
      }
    }} {...props} />);

    expect(screen.getByRole("status", { name: "Conferir original" })).toBeInTheDocument();
    expect(screen.getByText("Os avisos abaixo indicam limites da comparação com o original; eles não confirmam um erro musical. Confira a partitura antes de usar.")).toBeInTheDocument();
    expect(screen.getByText("Página 1:")).toBeInTheDocument();
    expect(screen.getByText("Não foi possível conferir todos os compassos desta página.")).toBeInTheDocument();
    expect(screen.queryByText("Revisar partitura")).not.toBeInTheDocument();
    expect(screen.queryByText(/aprovad|100%/i)).not.toBeInTheDocument();
  });

  it("hides review actions and diagnostics while retaining the API response", () => {
    render(<ScoreDetails score={{
      ...score,
      canDownloadMusicXml: false,
      canPlay: false,
      canExportMidi: false,
      validation: {
        version: 1,
        issues: [{ code: "RHYTHM_SHORT", severity: "warning", message: "Diagnostic detail stays in the API.", measure: "12" }],
        checkedMeasures: 14,
        skippedMeasures: 1,
        requiresReview: true,
        visualReview: {
          version: 1,
          status: "partial",
          sourceSHA256: "source-hash",
          xmlSHA256: "xml-hash",
          reader: null,
          checkedMeasures: 1,
          unknownMeasures: 0,
          segments: [],
          proposals: [{ id: "proposal-1", status: "pending", segmentId: "segment-1", page: 1, partId: "piano", partIndex: 0, measureIndex: 0, measure: "1", noteIndex: 0, before: null, after: null, applicable: true, reason: "manual_review", differences: ["pitch"] }],
          limitations: [],
          accuracyVerified: false,
          trainingEligible: false,
          history: []
        }
      }
    }} {...props} />);

    expect(screen.queryByText(/revisão/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Diagnostic detail stays in the API.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /aceitar correção|manter resultado|conferi a prévia|concluir revisão/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "MusicXML ainda não disponível" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Baixar MIDI" })).toBeDisabled();
    expect(scorePlayerSpy).toHaveBeenLastCalledWith(expect.objectContaining({ allowPlayback: true, previewOnly: true }));
  });

  it("follows server availability flags even while an old review status is pending", () => {
    render(<ScoreDetails score={score} {...props} />);

    expect(screen.getByText("Convertido")).toBeInTheDocument();
    expect(screen.queryByText(/revisão/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Baixar MusicXML" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Baixar MIDI" })).toBeEnabled();
    expect(scorePlayerSpy).toHaveBeenLastCalledWith(expect.objectContaining({ allowPlayback: true, previewOnly: false }));
  });

  it("restores playback of converted excerpts while keeping partial MIDI export blocked", () => {
    render(<ScoreDetails score={{ ...score, resultStatus: "partial", canPlay: true, canExportMidi: true }} {...props} />);

    expect(screen.getByRole("status")).toHaveTextContent("A partitura está incompleta.");
    expect(screen.getByRole("button", { name: "Baixar MusicXML parcial" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Baixar MIDI" })).toBeDisabled();
    expect(screen.getByText(/As páginas ausentes não serão tocadas/)).toBeInTheDocument();
    expect(scorePlayerSpy).toHaveBeenLastCalledWith(expect.objectContaining({ allowPlayback: true }));
  });

  it("keeps legacy MusicXML download available without inferring MIDI permission", () => {
    render(<ScoreDetails score={{ ...score, resultStatus: null, canDownloadMusicXml: true, canPlay: true, canExportMidi: true }} {...props} />);

    expect(screen.getByRole("button", { name: /Baixar MusicXML.*cobertura desconhecida/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Baixar MIDI" })).toBeDisabled();
    expect(scorePlayerSpy).toHaveBeenLastCalledWith(expect.objectContaining({ allowPlayback: true }));
  });

  it("shows an active first-page preview beside the previous final result", () => {
    const activeRetry: Score = {
      ...score,
      attempts: [
        { id: "attempt-2", scoreId: score.id, kind: "manual", status: "processing", errorCode: null, errorMessage: null, coverage: null, musicxmlFilename: null,
          createdAt: "2026-10-16T12:00:00.000Z", startedAt: "2026-10-16T12:00:01.000Z", finishedAt: null }
      ],
      conversionProgress: {
        attemptId: "attempt-2", stage: "validating", totalPages: 4, currentPage: 3,
        completedPages: [1], failedPages: [], excludedPages: [], reusedPages: [], updatedAt: "2026-10-16T12:00:02.000Z"
      },
      conversionPreview: {
        attemptId: "attempt-2", revision: "a".repeat(64), page: 1, totalPages: 4,
        createdAt: "2026-10-16T12:00:02.000Z", warnings: []
      }
    };
    render(<ScoreDetails score={activeRetry} {...props} />);

    expect(screen.getByTestId("first-page-preview")).toBeInTheDocument();
    expect(firstPagePreviewSpy).toHaveBeenLastCalledWith(activeRetry);
    expect(screen.getByRole("button", { name: "Baixar MusicXML" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Baixar MIDI" })).toBeEnabled();
    expect(scorePlayerSpy).toHaveBeenLastCalledWith(expect.objectContaining({ allowPlayback: true, previewOnly: false }));
  });

  it("keeps retry available for a converted result", () => {
    render(<ScoreDetails score={score} {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));

    expect(props.onRetry).toHaveBeenCalledWith(score.id, undefined);
  });
  it("opens guided review and immediately replaces the result with a returned correction", async () => {
    render(<ScoreDetails score={score} {...props} onRefreshDetail={vi.fn(async () => null)} />);
    fireEvent.click(screen.getByRole("tab", { name: "Conferir" }));
    expect(screen.getByTestId("guided-review")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Salvar sugestão de teste" }));
    expect(scorePlayerSpy).toHaveBeenLastCalledWith(expect.objectContaining({ scoreRevision: "new-revision" }));
    expect(screen.getByRole("tab", { name: "Conferir" })).toHaveAttribute("aria-selected", "true");
  });

  it("opens history XML without a current-file fetch or playback and can return to current", () => {
    render(<ScoreDetails score={score} {...props} />);
    fireEvent.click(screen.getByRole("tab", { name: "Versões" }));
    fireEvent.click(screen.getByRole("button", { name: "Abrir anterior de teste" }));
    expect(scorePlayerSpy).toHaveBeenLastCalledWith(expect.objectContaining({ musicXml: "<score-partwise />", scoreId: undefined, allowPlayback: false, scoreRevision: "old-revision" }));
    fireEvent.click(screen.getByRole("button", { name: "Voltar à versão atual" }));
    expect(scorePlayerSpy).toHaveBeenLastCalledWith(expect.objectContaining({ scoreId: "score-1", allowPlayback: true, musicXml: undefined }));
  });

});

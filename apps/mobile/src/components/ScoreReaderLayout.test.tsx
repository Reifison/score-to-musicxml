// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect, useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getReadingLayout } from "../adaptive/readingLayout";
import { ScoreReaderLayout } from "./ScoreReaderLayout";

const state = vi.hoisted(() => ({ layout: {} as Record<string, unknown>, back: vi.fn(), replace: vi.fn(), push: vi.fn(), mounts: 0, unmounts: 0 }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("../i18n", () => ({ t: (value: string) => value, useTranslation: () => ({ language: "pt", t: (value: string) => value, setLanguage: async () => {} }) }));
vi.mock("expo-router", () => ({ usePathname: () => "/score/score-1", router: { canGoBack: () => false, back: state.back, replace: state.replace, navigate: state.push } }));
vi.mock("../adaptive/useAdaptiveLayout", () => ({ useAdaptiveLayout: () => state.layout }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => ({ user: { role: "admin" } }) }));
vi.mock("react-native", () => ({
  Pressable: ({ children, onPress, accessibilityLabel, accessibilityState }: { children: ReactNode; onPress: () => void; accessibilityLabel?: string; accessibilityState?: { expanded?: boolean } }) => (
    <button aria-expanded={accessibilityState?.expanded} aria-label={accessibilityLabel} onClick={onPress}>{children}</button>
  ),
  ScrollView: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  View: ({ children, accessibilityElementsHidden, accessibilityViewIsModal }: { children: ReactNode; accessibilityElementsHidden?: boolean; accessibilityViewIsModal?: boolean }) => <div aria-hidden={accessibilityElementsHidden} data-a11y-modal={accessibilityViewIsModal === undefined ? undefined : String(accessibilityViewIsModal)}>{children}</div>,
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  StyleSheet: { create: (styles: unknown) => styles, flatten: (style: unknown) => style, absoluteFillObject: {} }
}));

function layout(width: number, height: number, fontScale = 1, rightInset = 0) {
  state.layout = { ...getReadingLayout({ width, height }, { top: 0, right: rightInset, bottom: 0, left: 0 }, [], fontScale), fontScale };
}

function PlayerProbe({ height, suspended }: { height: number; suspended: boolean }) {
  const [position, setPosition] = useState(12);
  useEffect(() => { state.mounts += 1; return () => { state.unmounts += 1; }; }, []);
  return <button data-testid="player" data-height={height} data-paused={String(suspended)} onClick={() => setPosition(37)}>{position}</button>;
}

const reader = () => <ScoreReaderLayout title="Estudo para piano" details={<span>Exportar MusicXML</span>}>{(viewport) => <PlayerProbe {...viewport} />}</ScoreReaderLayout>;

beforeEach(() => { vi.clearAllMocks(); state.mounts = 0; state.unmounts = 0; layout(1200, 900); });
afterEach(cleanup);

describe("reading workspace continuity", () => {
  it("keeps one player while resizing and changing the details between sidebar and overlay", () => {
    const view = render(reader());
    fireEvent.click(screen.getByTestId("player"));
    const initialHeight = Number(screen.getByTestId("player").getAttribute("data-height"));
    fireEvent.click(screen.getByRole("button", { name: "Abrir detalhes da partitura" }));
    expect(screen.getByText("Exportar MusicXML")).toBeTruthy();
    expect(screen.getByTestId("player").getAttribute("data-paused")).toBe("false");

    layout(466, 678, 1, 80);
    view.rerender(reader());
    expect(screen.getByTestId("player").textContent).toBe("37");
    expect(screen.getByTestId("player").getAttribute("data-paused")).toBe("true");
    expect(Number(screen.getByTestId("player").getAttribute("data-height"))).toBeLessThan(initialHeight);
    expect(state.mounts).toBe(1);
    expect(state.unmounts).toBe(0);
    expect(screen.getAllByRole("button", { name: "Fechar detalhes da partitura" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Fechar painel de detalhes" })).toBeNull();
    expect(screen.getByTestId("player").closest('[aria-hidden="true"]')).toBeTruthy();
    expect(screen.getByText("Exportar MusicXML").parentElement?.parentElement?.getAttribute("data-a11y-modal")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "Fechar detalhes da partitura" }));
    expect(screen.getByTestId("player").getAttribute("data-paused")).toBe("false");
    expect(screen.getByTestId("player").textContent).toBe("37");
    expect(screen.queryByText("Exportar MusicXML")).toBeNull();

    layout(669, 951, 1.95);
    view.rerender(reader());
    expect(screen.getByTestId("player").textContent).toBe("37");
    expect(state.mounts).toBe(1);
    expect(state.unmounts).toBe(0);
  });

  it("retains all real destinations and offers a back destination for a direct link", () => {
    render(reader());
    for (const label of ["Início", "Partituras", "Perfil", "Usuários", "Logs"]) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }
    fireEvent.click(screen.getByRole("button", { name: "Voltar para partituras" }));
    expect(state.replace).toHaveBeenCalledWith("/scores");
  });
});

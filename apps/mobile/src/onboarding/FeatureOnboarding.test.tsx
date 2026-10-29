// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  language: "pt" as "pt" | "en",
  contentLayout: null as null | ((event: { nativeEvent: { layout: { width: number; height: number } } }) => void),
  hardwareBack: null as null | (() => boolean),
  announcements: [] as string[]
}));

vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("../components/AdaptiveScreen", () => ({
  AdaptiveScreen: ({ children, navigation }: { children: ReactNode; navigation?: boolean }) => <div data-navigation={String(navigation)}>{children}</div>
}));
vi.mock("../i18n", () => ({
  useTranslation: () => ({
    t: (pt: string, en?: string, params?: Record<string, string | number>) => {
      let message = state.language === "en" ? en ?? pt : pt;
      for (const [key, value] of Object.entries(params ?? {})) message = message.replaceAll(`{{${key}}}`, String(value));
      return message;
    }
  })
}));
vi.mock("../adaptive/AdaptiveTypography", () => ({
  AdaptiveText: ({ children, accessibilityRole, accessibilityLiveRegion }: { children: ReactNode; accessibilityRole?: string; accessibilityLiveRegion?: "polite" | "assertive" | "off" }) => (
    <span aria-live={accessibilityLiveRegion} role={accessibilityRole === "header" ? "heading" : undefined}>{children}</span>
  )
}));
vi.mock("react-native", () => {
  const flatten = (value: unknown): Record<string, unknown> => {
    if (Array.isArray(value)) return Object.assign({}, ...value.map(flatten));
    return value && typeof value === "object" ? value as Record<string, unknown> : {};
  };

  return {
    AccessibilityInfo: { announceForAccessibility: vi.fn((message: string) => state.announcements.push(message)) },
    BackHandler: { addEventListener: vi.fn((_event: string, callback: () => boolean) => {
      state.hardwareBack = callback;
      return { remove: vi.fn(() => { state.hardwareBack = null; }) };
    }) },
    Pressable: ({ children, accessibilityLabel, accessibilityRole, accessibilityState, disabled, onPress, style }: {
      children: ReactNode;
      accessibilityLabel?: string;
      accessibilityRole?: string;
      accessibilityState?: { disabled?: boolean };
      disabled?: boolean;
      onPress?: () => void;
      style?: unknown;
    }) => (
      <button aria-disabled={accessibilityState?.disabled} aria-label={accessibilityLabel} disabled={disabled} onClick={onPress} role={accessibilityRole ?? "button"} style={flatten(style) as React.CSSProperties}>
        {children}
      </button>
    ),
    ScrollView: ({ children, testID, contentContainerStyle }: { children: ReactNode; testID?: string; contentContainerStyle?: unknown }) => (
      <div data-scroll-content-style={JSON.stringify(flatten(contentContainerStyle))} data-testid={testID}>{children}</div>
    ),
    StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
    View: ({ children, accessible, accessibilityLabel, accessibilityRole, accessibilityValue, onLayout, style, testID }: {
      children: ReactNode;
      accessible?: boolean;
      accessibilityLabel?: string;
      accessibilityRole?: string;
      accessibilityValue?: { min?: number; max?: number; now?: number; text?: string };
      onLayout?: (event: { nativeEvent: { layout: { width: number; height: number } } }) => void;
      style?: unknown;
      testID?: string;
    }) => {
      if (testID === "feature-onboarding-content") state.contentLayout = onLayout ?? null;
      const flattened = flatten(style);
      return (
        <div
          aria-label={accessibilityLabel}
          aria-valuemax={accessibilityValue?.max}
          aria-valuemin={accessibilityValue?.min}
          aria-valuenow={accessibilityValue?.now}
          data-flex-direction={String(flattened.flexDirection ?? "")}
          data-testid={testID}
          role={accessible ? accessibilityRole : undefined}
        >
          {children}
        </div>
      );
    }
  };
});

import { FeatureOnboarding } from "./FeatureOnboarding";

beforeEach(() => {
  state.language = "pt";
  state.contentLayout = null;
  state.hardwareBack = null;
  state.announcements = [];
});
afterEach(cleanup);

describe("native feature onboarding", () => {
  it("presents all four features in order and finishes from the last step", () => {
    const onFinish = vi.fn();
    render(<FeatureOnboarding onFinish={onFinish} />);

    expect(screen.getByRole("heading", { name: "Da folha ao MusicXML" })).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: /Etapa 1 de 4/ })).toBeTruthy();
    expect(screen.getByText("Scanner · várias páginas")).toBeTruthy();
    expect(screen.getByText("Violão duo")).toBeTruthy();
    expect(screen.getByTestId("feature-onboarding").parentElement?.getAttribute("data-navigation")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByRole("heading", { name: "Compare original e resultado" })).toBeTruthy();
    expect(screen.getByText("Compare a partitura convertida com o original. Quando houver sugestões de notas ou pausas, localize o trecho para aceitar, recusar ou desfazer.")).toBeTruthy();
    expect(screen.getByText("Novo")).toBeTruthy();
    expect(screen.getByText("Localizar")).toBeTruthy();
    expect(screen.getByText("Aceitar")).toBeTruthy();
    expect(screen.getByText("Recusar")).toBeTruthy();
    expect(screen.getByText("Desfazer")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByRole("heading", { name: "Consulte versões anteriores" })).toBeTruthy();
    expect(screen.getByText("Consultar · Exportar")).toBeTruthy();
    expect(screen.getByText(/Isso não substitui a versão atual\./)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByRole("heading", { name: "Ouça e repita um trecho" })).toBeTruthy();
    expect(screen.getByText("Compasso inicial")).toBeTruthy();
    expect(screen.getByText("Compasso final")).toBeTruthy();
    expect(screen.getByText(/O player precisa de internet para carregar\./)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Começar" }));

    expect(onFinish).toHaveBeenCalledExactlyOnceWith("completed");
    expect(state.announcements.some((message) => message.includes("Etapa 4 de 4"))).toBe(true);
  });

  it("lets the user skip from the first screen", () => {
    const onFinish = vi.fn();
    render(<FeatureOnboarding onFinish={onFinish} />);

    fireEvent.click(screen.getByRole("button", { name: "Pular apresentação" }));
    expect(onFinish).toHaveBeenCalledExactlyOnceWith("skipped");
  });

  it("supports back navigation and resets to the first step when remounted", () => {
    const onFinish = vi.fn();
    const latestOnFinish = vi.fn();
    const view = render(<FeatureOnboarding onFinish={onFinish} />);
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByRole("heading", { name: "Compare original e resultado" })).toBeTruthy();

    act(() => expect(state.hardwareBack?.()).toBe(true));
    expect(screen.getByRole("heading", { name: "Da folha ao MusicXML" })).toBeTruthy();
    view.rerender(<FeatureOnboarding onFinish={latestOnFinish} />);
    act(() => expect(state.hardwareBack?.()).toBe(true));
    expect(onFinish).not.toHaveBeenCalled();
    expect(latestOnFinish).toHaveBeenCalledExactlyOnceWith("skipped");
    view.unmount();

    render(<FeatureOnboarding onFinish={onFinish} />);
    expect(screen.getByRole("heading", { name: "Da folha ao MusicXML" })).toBeTruthy();
    expect(screen.getByText("Etapa 1 de 4")).toBeTruthy();
  });

  it("keeps actions reachable below scrollable content and changes composition with available width", () => {
    render(<FeatureOnboarding onFinish={vi.fn()} />);
    act(() => state.contentLayout?.({ nativeEvent: { layout: { width: 320, height: 480 } } }));
    expect(screen.getByTestId("feature-onboarding-story").getAttribute("data-flex-direction")).toBe("column");
    expect(screen.getByTestId("feature-onboarding-scroll").contains(screen.getByTestId("feature-onboarding-actions"))).toBe(false);

    act(() => state.contentLayout?.({ nativeEvent: { layout: { width: 840, height: 520 } } }));
    expect(screen.getByTestId("feature-onboarding-story").getAttribute("data-flex-direction")).toBe("row");
  });

  it("localizes labels and page announcements to English", () => {
    state.language = "en";
    render(<FeatureOnboarding onFinish={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "From page to MusicXML" })).toBeTruthy();
    expect(screen.getByText("Step 1 of 4")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Skip introduction" })).toBeTruthy();
    expect(state.announcements[0]).toContain("Step 1 of 4");

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "Compare the original and result" })).toBeTruthy();
    expect(screen.getByText("New")).toBeTruthy();
  });
});

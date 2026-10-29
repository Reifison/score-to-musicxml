// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const boot = vi.hoisted(() => ({
  loading: false,
  languageReady: true,
  guide: { isReady: true, visible: true, finish: vi.fn(), openGuide: vi.fn() }
}));
vi.mock("expo-splash-screen", () => ({ preventAutoHideAsync: vi.fn(async () => undefined) }));
vi.mock("expo-router", () => {
  const Stack = Object.assign(({ children }: { children: ReactNode }) => <div data-testid="routes">{children}</div>, { Screen: () => null });
  return { Stack };
});
vi.mock("../auth/AuthProvider", () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: () => ({ loading: boot.loading })
}));
vi.mock("../i18n", () => ({
  LanguageProvider: ({ children }: { children: ReactNode }) => children,
  useTranslation: () => ({ isReady: boot.languageReady })
}));
vi.mock("../onboarding/OnboardingProvider", () => ({
  OnboardingProvider: ({ children }: { children: ReactNode }) => children,
  useOnboarding: () => boot.guide
}));
vi.mock("../onboarding/FeatureOnboarding", () => ({
  FeatureOnboarding: ({ onFinish }: { onFinish: (reason: "skipped" | "completed") => void }) => <div>
    <span>Introduction</span>
    <button onClick={() => onFinish("skipped")}>Skip introduction</button>
    <button onClick={() => onFinish("completed")}>Complete introduction</button>
  </div>
}));
vi.mock("../components/StartupSplash", () => ({
  StartupSplash: ({ ready, onFinish }: { ready: boolean; onFinish: () => void }) => <button disabled={!ready} onClick={onFinish}>Finish opening</button>
}));
vi.mock("react-native", () => ({
  StyleSheet: { create: (styles: unknown) => styles, absoluteFillObject: {} },
  View: ({ children, accessibilityElementsHidden, importantForAccessibility, pointerEvents, accessibilityViewIsModal }: {
    children: ReactNode; accessibilityElementsHidden?: boolean; importantForAccessibility?: string;
    pointerEvents?: string; accessibilityViewIsModal?: boolean;
  }) => <div aria-hidden={accessibilityElementsHidden} data-pointer-events={pointerEvents}
    data-accessibility={importantForAccessibility} role={accessibilityViewIsModal ? "dialog" : undefined}>{children}</div>
}));

import RootLayout from "../../app/_layout";

beforeEach(() => {
  vi.clearAllMocks();
  boot.loading = false;
  boot.languageReady = true;
  boot.guide.isReady = true;
  boot.guide.visible = true;
});
afterEach(cleanup);

describe("onboarding launch integration", () => {
  it("keeps the app hidden while the splash waits for the installation preference", () => {
    boot.guide.isReady = false;
    boot.guide.visible = false;
    render(<RootLayout />);
    const splash = screen.getByRole("button", { name: "Finish opening" }) as HTMLButtonElement;
    expect(splash.disabled).toBe(true);
    const routes = screen.getByTestId("routes").parentElement;
    expect(routes?.getAttribute("aria-hidden")).toBe("true");
    expect(routes?.getAttribute("data-accessibility")).toBe("no-hide-descendants");
    expect(routes?.getAttribute("data-pointer-events")).toBe("none");
    expect(screen.queryByText("Introduction")).toBeNull();
  });

  it.each(["loading", "languageReady"] as const)("also waits for %s before handing off to the guide", (condition) => {
    if (condition === "loading") boot.loading = true;
    else boot.languageReady = false;
    render(<RootLayout />);
    expect((screen.getByRole("button", { name: "Finish opening" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("opens the guide after the splash and keeps underlying routes unreachable until dismissed", () => {
    const view = render(<RootLayout />);
    fireEvent.click(screen.getByRole("button", { name: "Finish opening" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByTestId("routes").parentElement?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByTestId("routes").parentElement?.getAttribute("data-accessibility")).toBe("no-hide-descendants");
    fireEvent.click(screen.getByRole("button", { name: "Skip introduction" }));
    expect(boot.guide.finish).toHaveBeenCalledWith("skipped");
    boot.guide.visible = false;
    view.rerender(<RootLayout />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByTestId("routes").parentElement?.getAttribute("aria-hidden")).toBe("false");
    expect(screen.getByTestId("routes").parentElement?.getAttribute("data-accessibility")).toBe("auto");
    expect(screen.getByTestId("routes").parentElement?.getAttribute("data-pointer-events")).toBe("auto");
  });

  it("allows a returning user to open the guide from settings without restarting the splash", () => {
    boot.guide.visible = false;
    const view = render(<RootLayout />);
    fireEvent.click(screen.getByRole("button", { name: "Finish opening" }));
    expect(screen.queryByText("Introduction")).toBeNull();
    boot.guide.visible = true;
    view.rerender(<RootLayout />);
    expect(screen.getByText("Introduction")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Finish opening" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Complete introduction" }));
    expect(boot.guide.finish).toHaveBeenCalledWith("completed");
  });
});

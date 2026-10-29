// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Alert } from "react-native";
import type { ReactNode } from "react";
import * as i18n from "../i18n";
import SettingsScreen from "../../app/settings";

const testState = vi.hoisted(() => ({ push: vi.fn(), openGuide: vi.fn() }));

vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("expo-router", () => ({ router: { push: testState.push } }));
vi.mock("../onboarding/OnboardingProvider", () => ({ useOnboarding: () => ({ openGuide: testState.openGuide }) }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => ({ logout: vi.fn(), user: { email: "ana@example.com" } }) }));
vi.mock("../components/AdaptiveScreen", () => ({ AdaptiveScreen: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("../adaptive/AdaptiveTypography", () => ({ AdaptiveText: ({ children }: { children: ReactNode }) => <span>{children}</span> }));
vi.mock("../theme/styles", () => ({
  colors: { ink: "#3C332F", line: "#E5DDD5", muted: "#766963", panel: "#FFFDF9", primary: "#F06432", primaryDark: "#D9472E", primarySoft: "#FFF0E7" },
  sharedStyles: { button: {}, buttonSecondary: {}, buttonText: {}, buttonTextSecondary: {}, screen: {}, subtitle: {}, title: {} }
}));
vi.mock("react-native", () => ({
  Alert: { alert: vi.fn() },
  Linking: { openURL: vi.fn() },
  Pressable: ({ children, onPress }: { children: ReactNode; onPress?: () => void }) => <button onClick={onPress}>{children}</button>,
  ScrollView: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  StyleSheet: { create: (styles: unknown) => styles },
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  View: ({ children }: { children: ReactNode }) => <div>{children}</div>
}));

beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

describe("settings purchase access", () => {
  it("reopens the introduction without leaving settings", () => {
    render(<SettingsScreen />);
    fireEvent.click(screen.getByRole("button", { name: /Conhecer o app/ }));
    expect(testState.openGuide).toHaveBeenCalledTimes(1);
    expect(testState.push).not.toHaveBeenCalled();
  });

  it("opens the unlimited conversions offer directly from settings", () => {
    render(<SettingsScreen />);

    fireEvent.click(screen.getByRole("button", { name: /Conversões ilimitadas/ }));

    expect(testState.push).toHaveBeenCalledWith("/scores?paywall=1");
  });

  it("switches the settings screen language immediately", () => {
    render(<SettingsScreen />);

    fireEvent.click(screen.getByText("English"));
    expect(screen.getByText("Language")).toBeTruthy();
    expect(screen.getByText("Appearance")).toBeTruthy();

    fireEvent.click(screen.getByText("Português"));
    expect(screen.getByText("Aparência")).toBeTruthy();
  });

  it("warns when the new language could not be saved", async () => {
    const setLanguage = vi.fn().mockRejectedValue(new Error("storage unavailable"));
    const useTranslation = vi.spyOn(i18n, "useTranslation").mockReturnValue({
      t: i18n.t,
      language: "pt",
      isReady: true,
      setLanguage
    });

    render(<SettingsScreen />);
    fireEvent.click(screen.getByText("English"));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith(
      "Idioma alterado, mas não foi possível salvar a preferência neste dispositivo."
    ));
    useTranslation.mockRestore();
  });
});

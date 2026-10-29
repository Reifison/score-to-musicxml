// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdaptiveNavigation } from "./AdaptiveNavigation";

const state = vi.hoisted(() => ({
  pathname: "/",
  role: "user",
  navigate: vi.fn(),
  replace: vi.fn(),
  back: vi.fn()
}));

vi.mock("../i18n", () => ({ t: (value: string) => value, useTranslation: () => undefined }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: ({ name }: { name: string }) => <span data-icon={name} /> }));
vi.mock("../adaptive/useAdaptiveLayout", () => ({ useAdaptiveLayout: () => ({ navigationFrame: { x: 0, y: 0, width: 80, height: 600 }, navigationMode: "rail", fontScale: 1 }) }));
vi.mock("expo-router", () => ({
  usePathname: () => state.pathname,
  router: { canGoBack: () => false, navigate: state.navigate, replace: state.replace, back: state.back }
}));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => ({ user: { role: state.role } }) }));
vi.mock("react-native", () => ({
  Pressable: ({ children, onPress, accessibilityLabel, accessibilityRole, accessibilityState }: {
    children: ReactNode;
    onPress: () => void;
    accessibilityLabel?: string;
    accessibilityRole?: "button" | "tab";
    accessibilityState?: { selected?: boolean; expanded?: boolean };
  }) => (
    <button aria-expanded={accessibilityState?.expanded} aria-label={accessibilityLabel} aria-selected={accessibilityState?.selected} onClick={onPress} role={accessibilityRole}>
      {children}
    </button>
  ),
  ScrollView: ({ children, horizontal }: { children: ReactNode; horizontal?: boolean }) => <div data-horizontal={horizontal}>{children}</div>,
  StyleSheet: { create: (styles: unknown) => styles },
  View: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>
}));

function renderNavigation({ mode = "rail", back = false, details = false }: {
  mode?: "rail" | "bottom";
  back?: boolean;
  details?: boolean;
} = {}) {
  return render(
    <AdaptiveNavigation
      back={back}
      backLabel="Voltar para partituras"
      layout={{ navigationFrame: { x: 0, y: 0, width: 80, height: 600 }, navigationMode: mode, fontScale: 1 }}
      readerDetails={details ? { open: false, onToggle: vi.fn() } : undefined}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  state.pathname = "/";
  state.role = "user";
});
afterEach(cleanup);

describe("adaptive navigation", () => {
  it("places rail destinations, reader details, then utilities in order with real routes", () => {
    state.role = "admin";
    const { container } = renderNavigation({ back: true, details: true });

    expect(Array.from(container.querySelectorAll("button")).map((button) => button.getAttribute("aria-label"))).toEqual([
      "Voltar para partituras", "Início", "Partituras", "Perfil", "Usuários", "Logs",
      "Abrir detalhes da partitura", "Lixeira", "Ajustes"
    ]);

    fireEvent.click(screen.getByRole("tab", { name: "Lixeira" }));
    fireEvent.click(screen.getByRole("tab", { name: "Ajustes" }));
    expect(state.navigate.mock.calls).toEqual([["/trash"], ["/settings"]]);
  });

  it("omits a fake details action and back spacer on home while keeping utility destinations", () => {
    const { container } = renderNavigation();

    expect(Array.from(container.querySelectorAll("button")).map((button) => button.getAttribute("aria-label"))).toEqual([
      "Início", "Partituras", "Perfil", "Lixeira", "Ajustes"
    ]);
    expect(screen.queryByRole("button", { name: "Abrir detalhes da partitura" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Voltar para partituras" })).toBeNull();
  });

  it("keeps the bottom bar limited to its existing role-based destinations", () => {
    state.role = "admin";
    const { container } = renderNavigation({ mode: "bottom", back: true, details: true });

    expect(Array.from(container.querySelectorAll("button")).map((button) => button.getAttribute("aria-label"))).toEqual([
      "Início", "Partituras", "Perfil", "Usuários", "Logs"
    ]);
    expect(screen.queryByRole("tab", { name: "Lixeira" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Ajustes" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Abrir detalhes da partitura" })).toBeNull();
  });

  it("marks the matching utility and main destination as selected", () => {
    state.pathname = "/settings/account";
    const { rerender } = renderNavigation();
    expect(screen.getByRole("tab", { name: "Ajustes" }).getAttribute("aria-selected")).toBe("true");

    state.pathname = "/scores";
    rerender(
      <AdaptiveNavigation layout={{ navigationFrame: { x: 0, y: 0, width: 80, height: 600 }, navigationMode: "rail", fontScale: 1 }} />
    );
    expect(screen.getByRole("tab", { name: "Partituras" }).getAttribute("aria-selected")).toBe("true");
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect, useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getReadingLayout } from "../adaptive/readingLayout";
import { AdaptiveScreen } from "./AdaptiveScreen";

const state = vi.hoisted(() => ({
  layout: {} as Record<string, unknown>,
  pathname: "/profile",
  role: "user",
  navigate: vi.fn(), replace: vi.fn(), back: vi.fn(),
  mounts: 0
}));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("expo-router", () => ({ usePathname: () => state.pathname, router: { canGoBack: () => false, navigate: state.navigate, replace: state.replace, back: state.back } }));
vi.mock("../adaptive/useAdaptiveLayout", () => ({ useAdaptiveLayout: () => state.layout }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => ({ user: { role: state.role } }) }));
vi.mock("react-native", () => {
  const flatten = (style: unknown): Record<string, unknown> => Array.isArray(style) ? Object.assign({}, ...style.map(flatten)) : (style || {}) as Record<string, unknown>;
  return {
    StyleSheet: { create: (styles: unknown) => styles, flatten },
    View: ({ children, style }: { children: ReactNode; style?: unknown }) => <div data-frame={JSON.stringify(flatten(style))}>{children}</div>,
    ScrollView: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    Text: ({ children, style }: { children: ReactNode; style?: unknown }) => <span style={flatten(style)}>{children}</span>,
    Pressable: ({ children, onPress, accessibilityLabel, accessibilityRole, accessibilityState }: { children: ReactNode; onPress: () => void; accessibilityLabel?: string; accessibilityRole?: "button" | "tab"; accessibilityState?: { selected: boolean } }) => <button aria-label={accessibilityLabel} aria-selected={accessibilityState?.selected} onClick={onPress} role={accessibilityRole}>{children}</button>
  };
});
function resize(width: number, height: number, fontScale = 1) {
  state.layout = { ...getReadingLayout({ width, height }, { top: 24, right: 40, bottom: 20, left: 0 }, [], fontScale), fontScale };
}
function Form() {
  const [name, setName] = useState("");
  useEffect(() => { state.mounts += 1; }, []);
  return <input aria-label="Nome" onChange={(event) => setName(event.target.value)} value={name} />;
}
beforeEach(() => { vi.clearAllMocks(); state.pathname = "/profile"; state.role = "user"; state.mounts = 0; resize(466, 678); });
afterEach(cleanup);

describe("adaptive app surfaces", () => {
  it("preserves an edited form across displays, font changes, and navigation shape", () => {
    const view = render(<AdaptiveScreen back title="Perfil"><Form /></AdaptiveScreen>);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Música de estudo" } });
    resize(951, 669, 2);
    view.rerender(<AdaptiveScreen back title="Perfil"><Form /></AdaptiveScreen>);
    expect(screen.getByRole("textbox")).toBe(input);
    expect((input as HTMLInputElement).value).toBe("Música de estudo");
    expect(state.mounts).toBe(1);
    expect(screen.getAllByRole("button", { name: "Voltar" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    expect(state.replace).toHaveBeenCalledWith("/scores");
  });

  it("retains role permissions, selects the active destination, and avoids duplicate navigation", () => {
    const view = render(<AdaptiveScreen><span>Conteúdo</span></AdaptiveScreen>);
    expect(screen.queryByRole("tab", { name: "Usuários" })).toBeNull();
    expect(screen.getByRole("tab", { name: "Perfil" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("tab", { name: "Perfil" }));
    expect(state.navigate).not.toHaveBeenCalled();
    state.role = "admin";
    view.rerender(<AdaptiveScreen><span>Conteúdo</span></AdaptiveScreen>);
    fireEvent.click(screen.getByRole("tab", { name: "Usuários" }));
    expect(state.navigate).toHaveBeenCalledWith("/users");
    expect(screen.getByRole("tab", { name: "Logs" })).toBeTruthy();
    view.rerender(<AdaptiveScreen navigation={false}><span>Entrar</span></AdaptiveScreen>);
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
  });
});

// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as SecureStore from "expo-secure-store";
import { ApiError, api } from "../api/client";
import { AuthProvider, useAuth } from "./AuthProvider";
import { clearPlayerSessionSnapshots } from "../player/sessionSnapshot";
import LoginScreen from "../../app/login";

const state = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn()
}));
vi.mock("../api/client", () => ({
  ApiError: class extends Error {
    constructor(message: string, public status: number) { super(message); }
  },
  api: { me: vi.fn(), login: vi.fn(), logout: vi.fn() }
}));
vi.mock("../player/sessionSnapshot", () => ({ clearPlayerSessionSnapshots: vi.fn() }));
vi.mock("expo-router", () => ({ router: { replace: state.replace } }));
vi.mock("../components/AdaptiveScreen", () => ({ AdaptiveScreen: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("../components/BrandLockup", () => ({ BrandLockup: () => null }));
vi.mock("../adaptive/AdaptiveTypography", () => ({
  AdaptiveText: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  AdaptiveTextInput: () => <input />
}));
vi.mock("react-native", () => ({
  ActivityIndicator: () => null,
  KeyboardAvoidingView: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Platform: { OS: "ios" },
  Pressable: ({ children, disabled, onPress }: { children: ReactNode; disabled?: boolean; onPress?: () => void }) => <button disabled={disabled} onClick={onPress}>{children}</button>,
  ScrollView: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  StyleSheet: { create: (styles: unknown) => styles },
  View: ({ children }: { children: ReactNode }) => <div>{children}</div>
}));

function SessionProbe() {
  const { loading, login, logout, restoreError, retrySession, user } = useAuth();
  return <div>
    <span>{loading ? "loading" : "ready"}</span>
    <span>{restoreError ? "restore-error" : "no-error"}</span>
    <span>{user?.id ?? "no-user"}</span>
    <button onClick={() => void retrySession()}>retry</button>
    <button onClick={() => void login("test@example.com", "password")}>sign in</button>
    <button onClick={() => void logout()}>sign out</button>
  </div>;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((success, failure) => { resolve = success; reject = failure; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(SecureStore.getItemAsync).mockResolvedValue("saved-token");
  vi.mocked(SecureStore.setItemAsync).mockResolvedValue(undefined);
  vi.mocked(SecureStore.deleteItemAsync).mockResolvedValue(undefined);
  vi.mocked(clearPlayerSessionSnapshots).mockResolvedValue(undefined);
});
afterEach(cleanup);

describe("saved session recovery", () => {
  it("opens a saved account before the server responds and keeps it available offline", async () => {
    const session = deferred<Awaited<ReturnType<typeof api.me>>>();
    vi.mocked(SecureStore.getItemAsync).mockResolvedValue(JSON.stringify({ token: "saved-token", user: { id: "saved-user" } }));
    vi.mocked(api.me).mockReturnValue(session.promise);
    render(<AuthProvider><SessionProbe /></AuthProvider>);

    await waitFor(() => expect(screen.getByText("saved-user")).toBeTruthy());
    expect(screen.getByText("ready")).toBeTruthy();
    await act(async () => { session.reject(new ApiError("Offline", 0)); });
    expect(screen.getByText("saved-user")).toBeTruthy();
  });

  it.each([0, 503])("preserves the token after a temporary error %s and can retry", async (status) => {
    vi.mocked(api.me).mockRejectedValueOnce(new ApiError("Unavailable", status));
    vi.mocked(api.me).mockResolvedValueOnce({ user: { id: "user-1" } } as Awaited<ReturnType<typeof api.me>>);
    render(<AuthProvider><SessionProbe /></AuthProvider>);

    await waitFor(() => expect(screen.getByText("restore-error")).toBeTruthy());
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
    expect(screen.getByText("no-user")).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "retry" })); });
    await waitFor(() => expect(screen.getByText("user-1")).toBeTruthy());
    expect(api.me).toHaveBeenCalledTimes(2);
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
    expect(screen.getByText("no-error")).toBeTruthy();
  });

  it("removes a token rejected as unauthorized", async () => {
    vi.mocked(api.me).mockRejectedValueOnce(new ApiError("Unauthorized", 401));
    render(<AuthProvider><SessionProbe /></AuthProvider>);

    await waitFor(() => expect(screen.getByText("ready")).toBeTruthy());
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("score_session_token");
    expect(screen.getByText("no-error")).toBeTruthy();
    expect(screen.getByText("no-user")).toBeTruthy();
  });

  it("closes a locally restored account if the server rejects its token", async () => {
    const session = deferred<Awaited<ReturnType<typeof api.me>>>();
    vi.mocked(SecureStore.getItemAsync).mockResolvedValue(JSON.stringify({ token: "saved-token", user: { id: "saved-user" } }));
    vi.mocked(api.me).mockReturnValue(session.promise);
    render(<AuthProvider><SessionProbe /></AuthProvider>);

    await waitFor(() => expect(screen.getByText("saved-user")).toBeTruthy());
    await act(async () => { session.reject(new ApiError("Unauthorized", 401)); });
    expect(screen.getByText("no-user")).toBeTruthy();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("score_session_token");
  });

  it("offers recovery on the login screen and opens the account after a successful retry", async () => {
    vi.mocked(api.me).mockRejectedValueOnce(new ApiError("Offline", 0));
    vi.mocked(api.me).mockResolvedValueOnce({ user: { id: "user-1" } } as Awaited<ReturnType<typeof api.me>>);
    render(<AuthProvider><LoginScreen /></AuthProvider>);

    const retry = await screen.findByRole("button", { name: "Tentar recuperar sessão" });
    await act(async () => { fireEvent.click(retry); });
    await waitFor(() => expect(state.replace).toHaveBeenCalledWith("/scores"));
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  });

  it("finishes loading on logout and ignores an earlier unauthorized response", async () => {
    const oldSession = deferred<Awaited<ReturnType<typeof api.me>>>();
    vi.mocked(api.me).mockReturnValueOnce(oldSession.promise);
    render(<AuthProvider><SessionProbe /></AuthProvider>);
    await waitFor(() => expect(api.me).toHaveBeenCalledWith("saved-token"));

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "sign out" })); });
    expect(screen.getByText("ready")).toBeTruthy();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledTimes(1);
    await act(async () => { oldSession.reject(new ApiError("Unauthorized", 401)); });
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledTimes(1);
    expect(screen.getByText("no-user")).toBeTruthy();
  });

  it("writes a new login after an already-started unauthorized-token deletion", async () => {
    const deletingOldToken = deferred<void>();
    vi.mocked(SecureStore.deleteItemAsync).mockReturnValueOnce(deletingOldToken.promise);
    vi.mocked(api.me).mockRejectedValueOnce(new ApiError("Unauthorized", 401));
    vi.mocked(api.login).mockResolvedValueOnce({ token: "new-token", user: { id: "user-2" } } as Awaited<ReturnType<typeof api.login>>);
    render(<AuthProvider><SessionProbe /></AuthProvider>);
    await waitFor(() => expect(SecureStore.deleteItemAsync).toHaveBeenCalledOnce());

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "sign in" })); });
    expect(screen.getByText("ready")).toBeTruthy();
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    await act(async () => { deletingOldToken.resolve(); });
    await waitFor(() => expect(screen.getByText("user-2")).toBeTruthy());
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith("score_session_token", JSON.stringify({ token: "new-token", user: { id: "user-2" } }));
  });
});

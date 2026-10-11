// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ScoresScreen from "../../app/scores";
import { api } from "../api/client";

vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("expo-document-picker", () => ({}));
vi.mock("expo-image-picker", () => ({}));
vi.mock("expo-router", () => ({ router: {}, useLocalSearchParams: () => ({}) }));
vi.mock("expo-iap", () => {
  const store = { availablePurchases: [], connected: false, products: [], fetchProducts: vi.fn() };
  return { useIAP: () => store };
});
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => ({ token: "token", user: { name: "Ana" } }) }));
vi.mock("../api/client", () => ({ ApiError: class extends Error {}, api: { scores: vi.fn(), entitlement: vi.fn() } }));
vi.mock("../components/BottomNav", () => ({ BottomNav: () => null, bottomNavHeight: 104 }));
vi.mock("../components/ScoreTypePicker", () => ({ ScoreTypePicker: () => null }));
vi.mock("../components/StatusBadge", () => ({ StatusBadge: () => null }));
vi.mock("react-native", () => ({
  ActivityIndicator: () => null,
  Alert: {},
  Animated: {},
  Image: () => null,
  Modal: () => null,
  PanResponder: {},
  Platform: { OS: "ios" },
  Pressable: () => null,
  StyleSheet: { create: (styles: unknown) => styles },
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  View: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  // Keep React Query and screen state real; replace only the native rendering boundary.
  FlatList: ({ refreshControl, data }: { refreshControl: ReactNode; data: Array<{ conversionStatus: string }> }) => (
    <div data-testid="score-list" data-status={data[0]?.conversionStatus}>{refreshControl}</div>
  ),
  RefreshControl: ({ refreshing, onRefresh }: { refreshing: boolean; onRefresh: () => void }) => (
    <button data-testid="refresh" data-refreshing={String(refreshing)} onClick={onRefresh}>Atualizar</button>
  )
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((success, failure) => { resolve = success; reject = failure; });
  return { promise, resolve, reject };
}

const queued = { scores: [{ id: "score-1", conversionStatus: "queued", isFavorite: false }] };
const converted = { scores: [{ id: "score-1", conversionStatus: "converted", isFavorite: false }] };
const entitlement = { entitlement: { plan: "paid" } };
let client: QueryClient;

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["scores"], queued);
  client.setQueryData(["entitlement"], entitlement);
});

afterEach(() => {
  cleanup();
  client.clear();
  vi.useRealTimers();
});

function mount() {
  render(<QueryClientProvider client={client}><ScoresScreen /></QueryClientProvider>);
}

async function flush() {
  await act(async () => { await vi.advanceTimersByTimeAsync(10); });
}

describe("ScoresScreen refresh animation", () => {
  it("polls a pending conversion once per minute silently and stops when it completes", async () => {
    const response = deferred<unknown>();
    vi.mocked(api.scores).mockReturnValue(response.promise as ReturnType<typeof api.scores>);
    mount();

    await act(async () => { await vi.advanceTimersByTimeAsync(59_999); });
    expect(api.scores).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    await flush();
    expect(api.scores).toHaveBeenCalledTimes(1);
    expect(client.isFetching({ queryKey: ["scores"] })).toBe(1);
    expect(screen.getByTestId("refresh").getAttribute("data-refreshing")).toBe("false");

    response.resolve(converted);
    await flush();
    expect(screen.getByTestId("score-list").getAttribute("data-status")).toBe("converted");
    expect(screen.getByTestId("refresh").getAttribute("data-refreshing")).toBe("false");
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(api.scores).toHaveBeenCalledTimes(1);
  });

  it.each(["success", "failure"])("keeps manual refresh active until both requests settle on %s", async (outcome) => {
    const scoreResponse = deferred<unknown>();
    const entitlementResponse = deferred<unknown>();
    vi.mocked(api.scores).mockReturnValue(scoreResponse.promise as ReturnType<typeof api.scores>);
    vi.mocked(api.entitlement).mockReturnValue(entitlementResponse.promise as ReturnType<typeof api.entitlement>);
    mount();

    fireEvent.click(screen.getByTestId("refresh"));
    expect(api.scores).toHaveBeenCalledTimes(1);
    expect(api.entitlement).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("refresh").getAttribute("data-refreshing")).toBe("true");
    scoreResponse.resolve(converted);
    await flush();
    expect(screen.getByTestId("refresh").getAttribute("data-refreshing")).toBe("true");

    if (outcome === "success") entitlementResponse.resolve(entitlement);
    else entitlementResponse.reject(new Error("Offline"));
    await flush();
    expect(screen.getByTestId("refresh").getAttribute("data-refreshing")).toBe("false");
  });
});

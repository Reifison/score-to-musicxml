// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ScoresScreen from "../../app/scores";
import { ApiError, api } from "../api/client";
import { configureLanguageController, type Language } from "../i18n";

const testState = vi.hoisted(() => ({
  params: {} as Record<string, string | undefined>,
  setParams: vi.fn(),
  connected: false,
  products: [] as Array<{ id: string; displayPrice?: string | null }>,
  fetchProducts: vi.fn(),
  restorePurchases: vi.fn(),
  finishTransaction: vi.fn(),
  requestPurchase: vi.fn(),
  purchaseBinding: vi.fn(),
  onPurchaseError: undefined as ((error: unknown) => void) | undefined,
  captureDocument: vi.fn(),
  releaseDocument: vi.fn(),
  launchCamera: vi.fn(),
  alert: vi.fn()
}));

vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("expo-document-picker", () => ({}));
vi.mock("expo-image-picker", () => ({
  launchCameraAsync: testState.launchCamera,
  requestCameraPermissionsAsync: vi.fn(async () => ({ granted: true, canAskAgain: true })),
  MediaTypeOptions: { Images: "Images" }
}));
vi.mock("expo-router", () => ({ router: { setParams: testState.setParams }, useLocalSearchParams: () => ({ ...testState.params }) }));
vi.mock("expo-iap", () => {
  return {
    useIAP: (options: { onPurchaseError?: (error: unknown) => void }) => {
      testState.onPurchaseError = options.onPurchaseError;
      return {
        availablePurchases: [],
        connected: testState.connected,
        products: testState.products,
        fetchProducts: testState.fetchProducts,
        finishTransaction: testState.finishTransaction,
        requestPurchase: testState.requestPurchase,
        restorePurchases: testState.restorePurchases
      };
    }
  };
});
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => ({ token: "token", user: { id: "user-1", name: "Ana" } }) }));
vi.mock("../api/client", () => ({ ApiError: class extends Error {}, api: { scores: vi.fn(), entitlement: vi.fn(), purchaseBinding: testState.purchaseBinding } }));
vi.mock("../components/AdaptiveScreen", () => ({ AdaptiveScreen: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("../adaptive/AdaptiveTypography", () => ({ AdaptiveText: ({ children }: { children: ReactNode }) => <span>{children}</span> }));
vi.mock("../components/ScoreTypePicker", () => ({
  ScoreTypePicker: ({ onChange }: { onChange: (value: string) => void }) => <button onClick={() => onChange("piano")}>Selecionar piano</button>
}));
vi.mock("../components/StatusBadge", () => ({ StatusBadge: () => null }));
vi.mock("../documentScanner/capture", () => ({
  captureScoreDocument: testState.captureDocument,
  captureFailureCopy: vi.fn(() => ({ title: "Scanner indisponível", message: "Tente novamente." })),
  releaseScannedDocument: testState.releaseDocument
}));
vi.mock("react-native", () => ({
  AccessibilityInfo: {
    isReduceMotionEnabled: () => Promise.resolve(false),
    addEventListener: () => ({ remove: () => undefined })
  },
  ActivityIndicator: () => null,
  Alert: { alert: testState.alert },
  Animated: {},
  Image: ({ accessibilityLabel }: { accessibilityLabel?: string }) => <img alt={accessibilityLabel} />,
  Linking: { openSettings: vi.fn() },
  Modal: ({ children, visible }: { children: ReactNode; visible: boolean }) => visible ? <div role="dialog">{children}</div> : null,
  PanResponder: {},
  Platform: { OS: "ios" },
  Pressable: ({ children, disabled, onPress }: { children: ReactNode; disabled?: boolean; onPress?: () => void }) => (
    <button disabled={disabled} onClick={onPress}>{children}</button>
  ),
  StyleSheet: { create: (styles: unknown) => styles },
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  ScrollView: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  View: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  // Keep React Query and screen state real; replace only the native rendering boundary.
  FlatList: ({ ListHeaderComponent, refreshControl, data }: { ListHeaderComponent?: ReactNode; refreshControl: ReactNode; data: Array<{ conversionStatus: string }> }) => (
    <div data-testid="score-list" data-status={data[0]?.conversionStatus}>{ListHeaderComponent}{refreshControl}</div>
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

function setTestLanguage(value: Language) {
  configureLanguageController({ getLanguage: () => value, initialize: async () => value, setLanguage: async () => undefined, subscribe: () => () => undefined });
}

const queued = { scores: [{ id: "score-1", conversionStatus: "queued", isFavorite: false }] };
const converted = { scores: [{ id: "score-1", conversionStatus: "converted", isFavorite: false }] };
const entitlement = { entitlement: { plan: "paid" } };
let client: QueryClient;

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  setTestLanguage("pt");
  testState.params = {};
  testState.connected = false;
  testState.products = [];
  testState.onPurchaseError = undefined;
  testState.setParams.mockImplementation((params: Record<string, string | undefined>) => {
    Object.assign(testState.params, params);
  });
  testState.fetchProducts.mockResolvedValue(undefined);
  testState.restorePurchases.mockResolvedValue(undefined);
  testState.purchaseBinding.mockResolvedValue({ binding: { googleObfuscatedAccountId: "google-id", appleAppAccountToken: "apple-id" } });
  testState.requestPurchase.mockResolvedValue(undefined);
  testState.captureDocument.mockResolvedValue({
    kind: "success",
    document: {
      uri: "file:///cache/score.pdf",
      name: "score.pdf",
      type: "application/pdf",
      pageCount: 2,
      scanId: "5d0d086e-8fce-4299-b9bb-408a0b4c0c76",
      pages: [
        { uri: "file:///cache/page-1.jpg", width: 1200, height: 1600 },
        { uri: "file:///cache/page-2.jpg", width: 1200, height: 1600 }
      ]
    }
  });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["scores", "user-1"], queued);
  client.setQueryData(["entitlement"], entitlement);
});

afterEach(() => {
  cleanup();
  client.clear();
  vi.useRealTimers();
  setTestLanguage("pt");
});

function mount() {
  return render(<QueryClientProvider client={client}><ScoresScreen /></QueryClientProvider>);
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

describe("unlimited conversions paywall", () => {
  it("opens from a direct route while free scans remain, consumes the route flag, and keeps restore available", async () => {
    testState.params.paywall = "1";
    testState.connected = true;
    client.setQueryData(["entitlement"], { entitlement: { plan: "free", freeScansRemaining: 2, freeScanLimit: 3 } });
    mount();
    await flush();

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Conversões ilimitadas")).toBeTruthy();
    expect(screen.getByText("Desbloqueie conversões ilimitadas para esta conta.")).toBeTruthy();
    expect(screen.queryByText(/usou os 3 scans gratis/i)).toBeNull();
    expect(testState.setParams).toHaveBeenCalledWith({ paywall: undefined });
    expect(screen.getByRole("button", { name: "Preço indisponível" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Restaurar compra" }).hasAttribute("disabled")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Restaurar compra" }));
    await flush();
    expect(testState.restorePurchases).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Agora não" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(testState.params.paywall).toBeUndefined();

    cleanup();
    mount();
    await flush();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not offer a second purchase to a paid account and retains the restore action", async () => {
    testState.params.paywall = "1";
    testState.connected = true;
    testState.products = [{ id: "premium_unlock", displayPrice: "R$ 32,90" }];
    client.setQueryData(["entitlement"], { entitlement: { plan: "paid", freeScansRemaining: 0, freeScanLimit: 3 } });
    mount();
    await flush();

    expect(screen.getByText("As conversões ilimitadas já estão ativas nesta conta.")).toBeTruthy();
    const purchaseButton = screen.getByRole("button", { name: "Conversões ilimitadas ativas" });
    expect(purchaseButton.hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Restaurar compra" }).hasAttribute("disabled")).toBe(false);
    expect(screen.queryByText(/R\$ 32,90/)).toBeNull();
  });
});

describe("purchase cancellation feedback", () => {
  function preparePaywallPurchase() {
    testState.params.paywall = "1";
    testState.connected = true;
    testState.products = [{ id: "premium_unlock", displayPrice: "R$ 32,90" }];
    client.setQueryData(["entitlement"], { entitlement: { plan: "free", freeScansRemaining: 1, freeScanLimit: 3 } });
  }

  it.each([
    ["pt", "Compra cancelada."],
    ["en", "Purchase canceled."]
  ] as const)("shows the localized cancellation in %s when requestPurchase rejects with expo-iap's wrapped message", async (language, expectedMessage) => {
    setTestLanguage(language);
    preparePaywallPurchase();
    testState.requestPurchase.mockRejectedValueOnce(new Error("Calling the 'requestPurchase' function has failed → Caused by: User cancelled the purchase flow."));
    mount();
    await flush();

    const purchaseButton = screen.getByRole("button", { name: /Desbloquear|Unlock/ });
    expect(purchaseButton.hasAttribute("disabled")).toBe(false);
    await act(async () => {
      fireEvent.click(purchaseButton);
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    expect(api.purchaseBinding).toHaveBeenCalledOnce();
    expect(testState.requestPurchase).toHaveBeenCalledOnce();
    expect(screen.getByText(expectedMessage)).toBeTruthy();
  });

  it("keeps backend ApiError messages visible even when their code resembles an IAP cancellation", async () => {
    preparePaywallPurchase();
    const backendError = Object.assign(new ApiError("Falha no vínculo da conta.", 502, "user-cancelled"), { code: "user-cancelled", status: 502 });
    testState.purchaseBinding.mockRejectedValueOnce(backendError);
    mount();
    await flush();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Desbloquear/ }));
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    expect(screen.getByText("Falha no vínculo da conta.")).toBeTruthy();
    expect(screen.queryByText("Compra cancelada.")).toBeNull();
    expect(testState.requestPurchase).not.toHaveBeenCalled();
  });

  it("translates the expo-iap cancellation callback", async () => {
    preparePaywallPurchase();
    mount();
    await flush();

    await act(async () => {
      testState.onPurchaseError?.({ code: "user-cancelled", message: "User cancelled the purchase flow." });
    });

    expect(screen.getByText("Compra cancelada.")).toBeTruthy();
  });
});

describe("document scanner review", () => {
  it("opens the native scan result for confirmation with every page and skips the photo camera", async () => {
    mount();
    await flush();

    fireEvent.click(screen.getByRole("button", { name: "Selecionar piano" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Escanear partitura" }));
      await Promise.resolve();
    });

    expect(testState.captureDocument).toHaveBeenCalledOnce();
    expect(testState.launchCamera).not.toHaveBeenCalled();
    expect(screen.getByText("2 páginas no PDF. Todas serão enviadas na ordem exibida.")).toBeTruthy();
    expect(screen.getByText("Página 1")).toBeTruthy();
    expect(screen.getByText("Página 2")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Prévia da página 1" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Prévia da página 2" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refazer" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enviar PDF" })).toBeTruthy();
  });

  it("releases a scan that finishes after the scores screen unmounts", async () => {
    const lateScan = deferred<unknown>();
    testState.captureDocument.mockReturnValue(lateScan.promise);
    const view = mount();
    await flush();

    fireEvent.click(screen.getByRole("button", { name: "Selecionar piano" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Escanear partitura" }));
      await Promise.resolve();
    });
    expect(testState.captureDocument).toHaveBeenCalledOnce();

    view.unmount();
    await act(async () => {
      lateScan.resolve({
        kind: "success",
        document: {
          uri: "file:///cache/late.pdf",
          name: "late.pdf",
          type: "application/pdf",
          pageCount: 1,
          scanId: "5d0d086e-8fce-4299-b9bb-408a0b4c0c76",
          pages: [{ uri: "file:///cache/late.jpg", width: 1200, height: 1600 }]
        }
      });
      await lateScan.promise;
    });

    expect(testState.releaseDocument).toHaveBeenCalledWith("5d0d086e-8fce-4299-b9bb-408a0b4c0c76");
    expect(testState.alert).not.toHaveBeenCalled();
  });
});

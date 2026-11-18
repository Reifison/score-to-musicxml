// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import IndexScreen from "../../app/index";

const testState = vi.hoisted(() => ({
  captureDocument: vi.fn(),
  releaseDocument: vi.fn(),
  alert: vi.fn(),
  navigationMode: "bottom" as "bottom" | "rail"
}));

vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("expo-document-picker", () => ({}));
vi.mock("expo-image-picker", () => ({}));
vi.mock("expo-router", () => ({ Redirect: () => null, router: { push: vi.fn() } }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => ({ loading: false, token: "token", user: { name: "Ana" } }) }));
vi.mock("../api/client", () => ({ ApiError: class extends Error {}, api: { upload: vi.fn() } }));
vi.mock("../components/AdaptiveScreen", () => ({ AdaptiveScreen: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("../adaptive/useAdaptiveLayout", () => ({ useAdaptiveLayout: () => ({ navigationMode: testState.navigationMode }) }));
vi.mock("../adaptive/AdaptiveTypography", () => ({ AdaptiveText: ({ children }: { children: ReactNode }) => <span>{children}</span> }));
vi.mock("../components/BrandLockup", () => ({ BrandLockup: () => null }));
vi.mock("../components/ScoreTypePicker", () => ({
  ScoreTypePicker: ({ onChange }: { onChange: (value: string) => void }) => <button onClick={() => onChange("piano")}>Selecionar piano</button>
}));
vi.mock("../documentScanner/capture", () => ({
  captureScoreDocument: testState.captureDocument,
  captureFailureCopy: vi.fn(() => ({ title: "Scanner indisponível", message: "Tente novamente." })),
  releaseScannedDocument: testState.releaseDocument
}));
vi.mock("../documentScanner/DocumentReviewModal", () => ({ DocumentReviewModal: () => null }));
vi.mock("react-native", () => ({
  ActivityIndicator: () => null,
  Alert: { alert: testState.alert },
  Linking: { openSettings: vi.fn() },
  Platform: { OS: "ios" },
  Pressable: ({ children, disabled, onPress }: { children: ReactNode; disabled?: boolean; onPress?: () => void }) => (
    <button disabled={disabled} onClick={onPress}>{children}</button>
  ),
  ScrollView: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  StyleSheet: { create: (styles: unknown) => styles },
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  View: ({ children }: { children: ReactNode }) => <div>{children}</div>
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((success) => { resolve = success; });
  return { promise, resolve };
}

let client: QueryClient;

beforeEach(() => {
  vi.resetAllMocks();
  testState.navigationMode = "bottom";
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(() => {
  cleanup();
  client.clear();
});

describe("home scanner lifecycle", () => {
  it("keeps utility shortcuts on a phone and removes the large duplicates when a rail is available", () => {
    const view = render(<QueryClientProvider client={client}><IndexScreen /></QueryClientProvider>);
    expect(screen.getByRole("button", { name: "Lixeira" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Configurações" })).toBeTruthy();
    testState.navigationMode = "rail";
    view.rerender(<QueryClientProvider client={client}><IndexScreen /></QueryClientProvider>);
    expect(screen.queryByRole("button", { name: "Lixeira" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Configurações" })).toBeNull();
    expect(screen.getByRole("button", { name: "Minhas partituras" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Escanear partitura" })).toBeTruthy();
  });

  it("releases a late native scan result and avoids alerts after unmount", async () => {
    const lateScan = deferred<unknown>();
    testState.captureDocument.mockReturnValue(lateScan.promise);
    const view = render(<QueryClientProvider client={client}><IndexScreen /></QueryClientProvider>);

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

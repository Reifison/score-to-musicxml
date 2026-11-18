// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TrashScreen from "../../app/trash";
import { api } from "../api/client";

const state = vi.hoisted(() => ({ userId: "user-1", token: "token-1" }));

vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("../api/client", () => ({ ApiError: class extends Error {}, api: { trashScores: vi.fn() } }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => ({ token: state.token, user: { id: state.userId } }) }));
vi.mock("../components/AdaptiveScreen", () => ({ AdaptiveScreen: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("../adaptive/AdaptiveTypography", () => ({ AdaptiveText: ({ children }: { children: ReactNode }) => <span>{children}</span> }));
vi.mock("react-native", () => ({
  ActivityIndicator: () => null,
  Alert: { alert: vi.fn() },
  FlatList: ({ data, renderItem, ListHeaderComponent, ListEmptyComponent }: {
    data: Array<{ id: string }>;
    renderItem: (input: { item: { id: string } }) => ReactNode;
    ListHeaderComponent: ReactNode;
    ListEmptyComponent: ReactNode;
  }) => <div>{ListHeaderComponent}{data.map((item) => <div key={item.id}>{renderItem({ item })}</div>)}{!data.length && ListEmptyComponent}</div>,
  Pressable: ({ children }: { children: ReactNode }) => <button>{children}</button>,
  RefreshControl: () => null,
  StyleSheet: { create: (styles: unknown) => styles },
  View: ({ children }: { children: ReactNode }) => <div>{children}</div>
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  state.userId = "user-1";
  state.token = "token-1";
});

describe("trash account isolation", () => {
  it("hides the previous account's filenames while the new account's request is pending", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    client.setQueryData(["trash-scores", "user-1"], { scores: [{ id: "score-1", originalFilename: "private-score.pdf" }] });
    client.setQueryData(["trash-scores"], { scores: [{ id: "score-1", originalFilename: "private-score.pdf" }] });
    let resolve!: (value: { scores: never[] }) => void;
    vi.mocked(api.trashScores).mockReturnValue(new Promise((done) => { resolve = done; }));
    const view = render(<QueryClientProvider client={client}><TrashScreen /></QueryClientProvider>);
    expect(screen.getByText("private-score.pdf")).toBeTruthy();

    state.userId = "user-2";
    state.token = "token-2";
    view.rerender(<QueryClientProvider client={client}><TrashScreen /></QueryClientProvider>);
    expect(screen.queryByText("private-score.pdf")).toBeNull();
    expect(api.trashScores).toHaveBeenCalledWith("token-2");

    await act(async () => { resolve({ scores: [] }); });
    expect(screen.queryByText("private-score.pdf")).toBeNull();
    client.clear();
  });
});

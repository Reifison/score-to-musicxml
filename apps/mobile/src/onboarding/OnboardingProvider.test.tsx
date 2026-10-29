// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ONBOARDING_STORAGE_KEY, OnboardingProvider, useOnboarding } from "./OnboardingProvider";

const storage = vi.hoisted(() => ({ getItem: vi.fn(), setItem: vi.fn() }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: storage }));

function Consumer({ account = "one" }: { account?: string }) {
  const guide = useOnboarding();
  return <>
    <output>{guide.isReady ? guide.visible ? "guide" : "app" : "loading"}</output>
    <span>{account}</span>
    <button onClick={() => guide.finish("completed")}>Complete</button>
    <button onClick={() => guide.finish("skipped")}>Skip</button>
    <button onClick={guide.openGuide}>Replay</button>
  </>;
}

beforeEach(() => {
  vi.resetAllMocks();
  storage.getItem.mockResolvedValue(null);
  storage.setItem.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("first-run onboarding", () => {
  it("waits for local preference and shows the guide on the first open", async () => {
    render(<OnboardingProvider><Consumer /></OnboardingProvider>);
    expect(screen.getByText("loading")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("guide")).toBeTruthy());
    expect(storage.getItem).toHaveBeenCalledWith(ONBOARDING_STORAGE_KEY);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it.each(["completed", "skipped"] as const)("respects a previous %s choice on a new launch", async (choice) => {
    storage.getItem.mockResolvedValue(choice);
    render(<OnboardingProvider><Consumer /></OnboardingProvider>);
    await waitFor(() => expect(screen.getByText("app")).toBeTruthy());
  });

  it.each([["Complete", "completed"], ["Skip", "skipped"]] as const)("saves %s and does not reopen when the account changes", async (button, choice) => {
    const view = render(<OnboardingProvider><Consumer /></OnboardingProvider>);
    await waitFor(() => expect(screen.getByText("guide")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: button }));
    expect(screen.getByText("app")).toBeTruthy();
    await waitFor(() => expect(storage.setItem).toHaveBeenCalledWith(ONBOARDING_STORAGE_KEY, choice));
    view.rerender(<OnboardingProvider><Consumer account="two" /></OnboardingProvider>);
    expect(screen.getByText("app")).toBeTruthy();
    expect(storage.getItem).toHaveBeenCalledTimes(1);
  });

  it("replays from settings without removing the saved preference", async () => {
    storage.getItem.mockResolvedValue("completed");
    render(<OnboardingProvider><Consumer /></OnboardingProvider>);
    await waitFor(() => expect(screen.getByText("app")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Replay" }));
    expect(screen.getByText("guide")).toBeTruthy();
    expect(storage.setItem).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.getByText("app")).toBeTruthy();
  });

  it("allows access when storage rejects, while keeping manual replay available", async () => {
    storage.getItem.mockRejectedValue(new Error("storage unavailable"));
    render(<OnboardingProvider><Consumer /></OnboardingProvider>);
    await waitFor(() => expect(screen.getByText("app")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Replay" }));
    expect(screen.getByText("guide")).toBeTruthy();
  });

  it("does not hold the launch screen on a read that never finishes or obey a late read", async () => {
    vi.useFakeTimers();
    let resolveRead!: (value: string | null) => void;
    storage.getItem.mockReturnValue(new Promise((resolve) => { resolveRead = resolve; }));
    render(<OnboardingProvider><Consumer /></OnboardingProvider>);
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(screen.getByText("app")).toBeTruthy();
    await act(async () => resolveRead(null));
    expect(screen.getByText("app")).toBeTruthy();
  });

  it("keeps access available when saving completion fails", async () => {
    storage.setItem.mockRejectedValue(new Error("storage full"));
    render(<OnboardingProvider><Consumer /></OnboardingProvider>);
    await waitFor(() => expect(screen.getByText("guide")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Complete" }));
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText("app")).toBeTruthy();
  });

  it("does not let a pending read dismiss a manually reopened guide", async () => {
    let resolveRead!: (value: string | null) => void;
    storage.getItem.mockReturnValue(new Promise((resolve) => { resolveRead = resolve; }));
    render(<OnboardingProvider><Consumer /></OnboardingProvider>);
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(screen.getByRole("button", { name: "Replay" }));
    await act(async () => resolveRead("completed"));
    expect(screen.getByText("guide")).toBeTruthy();
  });
});

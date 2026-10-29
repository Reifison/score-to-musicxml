// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReduceMotion } from "./useReduceMotion";

const state = vi.hoisted(() => ({
  listener: null as null | ((enabled: boolean) => void),
  initial: vi.fn(),
  remove: vi.fn()
}));
vi.mock("react-native", () => ({ AccessibilityInfo: {
  isReduceMotionEnabled: state.initial,
  addEventListener: (_event: string, listener: (enabled: boolean) => void) => {
    state.listener = listener;
    return { remove: state.remove };
  }
} }));
beforeEach(() => {
  state.listener = null;
  state.initial.mockReset();
  state.remove.mockReset();
});
afterEach(cleanup);

describe("capture review motion preference", () => {
  it("starts without movement, follows the system preference and removes its listener", async () => {
    state.initial.mockResolvedValue(false);
    const view = renderHook(useReduceMotion);
    expect(view.result.current).toBe(true);
    await waitFor(() => expect(view.result.current).toBe(false));
    act(() => state.listener?.(true));
    expect(view.result.current).toBe(true);
    view.unmount();
    expect(state.remove).toHaveBeenCalledOnce();
  });

  it("does not overwrite a new event with an older async result", async () => {
    let resolve!: (enabled: boolean) => void;
    state.initial.mockReturnValue(new Promise<boolean>((done) => { resolve = done; }));
    const view = renderHook(useReduceMotion);
    act(() => state.listener?.(false));
    await act(async () => resolve(true));
    expect(view.result.current).toBe(false);
  });

  it("keeps motion disabled if the initial query fails", async () => {
    state.initial.mockRejectedValue(new Error("unavailable"));
    const view = renderHook(useReduceMotion);
    await act(async () => Promise.resolve());
    expect(view.result.current).toBe(true);
  });
});

// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import type { CSSProperties, ReactNode, Ref } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScorePlayerWebView } from "./ScorePlayerWebView";

const testState = vi.hoisted(() => ({
  webViewMounts: 0,
  webViewUnmounts: 0,
  postedMessages: [] as string[],
  injectedScripts: [] as string[],
  latestProps: null as Record<string, unknown> | null,
  focusEffect: null as (() => void | (() => void)) | null,
  focusCleanup: null as (() => void) | null,
  appStateListener: null as ((nextState: string) => void) | null,
  loadMusicXmlForPlayer: vi.fn(),
  cacheLoad: vi.fn(),
  cacheSave: vi.fn(),
  loadSnapshot: vi.fn(),
  saveSnapshot: vi.fn()
}));

vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("expo-router", async () => {
  const React = await import("react");
  return {
    useFocusEffect: (effect: () => void | (() => void)) => React.useEffect(() => {
      testState.focusEffect = effect;
      const cleanup = effect();
      let activeCleanup = cleanup;
      const dispose = () => {
        if (typeof activeCleanup !== "function") return;
        const run = activeCleanup;
        activeCleanup = undefined;
        run();
      };
      testState.focusCleanup = dispose;
      return () => {
        dispose();
        if (testState.focusCleanup === dispose) testState.focusCleanup = null;
      };
    }, [effect])
  };
});
vi.mock("react-native", () => ({
  ActivityIndicator: () => null,
  AppState: {
    currentState: "active",
    addEventListener: (_event: string, listener: (nextState: string) => void) => {
      testState.appStateListener = listener;
      return { remove: vi.fn(() => { testState.appStateListener = null; }) };
    }
  },
  Pressable: ({ children, onPress, style }: { children: ReactNode; onPress?: () => void; style?: unknown }) => (
    <button onClick={onPress} style={style as CSSProperties}>{children}</button>
  ),
  StyleSheet: {
    absoluteFillObject: { position: "absolute", inset: 0 },
    create: (styles: unknown) => styles,
    flatten: (style: unknown) => style
  },
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  TextInput: () => null,
  View: ({ children, style }: { children: ReactNode; style?: unknown }) => {
    const styles = (Array.isArray(style) ? style : [style]).filter(Boolean) as Array<Record<string, unknown>>;
    const height = styles.find((item) => typeof item.height === "number")?.height;
    return <div data-height={height}>{children}</div>;
  }
}));
vi.mock("react-native-webview", async () => {
  const React = await import("react");
  const Component = React.forwardRef((props: Record<string, unknown>, ref: Ref<unknown>) => {
    const instance = React.useMemo(() => ({
      postMessage: (message: string) => testState.postedMessages.push(message),
      injectJavaScript: (script: string) => testState.injectedScripts.push(script)
    }), []);
    React.useImperativeHandle(ref, () => instance, [instance]);
    React.useEffect(() => {
      testState.webViewMounts += 1;
      testState.latestProps = props;
      return () => { testState.webViewUnmounts += 1; };
    }, []);
    React.useEffect(() => { testState.latestProps = props; });
    return <div data-testid="player-webview" data-source={(props.source as { uri: string }).uri} />;
  });
  Component.displayName = "MockWebView";
  return { default: Component };
});
vi.mock("../api/client", () => ({ api: { loadMusicXmlForPlayer: testState.loadMusicXmlForPlayer } }));
vi.mock("./musicXmlCache", () => ({
  loadCachedPlayerMusicXml: testState.cacheLoad,
  playerCacheIdentity: (score: { id: string; userId: string }) => ({ ...score, cacheRevision: "revision-1" }),
  savePlayerMusicXmlToCache: testState.cacheSave
}));
vi.mock("./sessionSnapshot", () => ({
  createPlayerSessionLease: (userId: string) => ({ userId, generation: 0, globalGeneration: 0 }),
  loadPlayerSessionSnapshot: testState.loadSnapshot,
  savePlayerSessionSnapshot: testState.saveSnapshot
}));

const score = {
  id: "score-1",
  userId: "user-1",
  originalFilename: "Estudo.pdf",
  musicxmlFilename: "estudo.musicxml",
  conversionStatus: "converted",
  resultStatus: "complete"
} as never;
const playerUrl = "http://localhost:5173/mobile/player";

beforeEach(() => {
  vi.stubGlobal("__DEV__", true);
  testState.webViewMounts = 0;
  testState.webViewUnmounts = 0;
  testState.postedMessages = [];
  testState.injectedScripts = [];
  testState.latestProps = null;
  testState.focusEffect = null;
  testState.focusCleanup = null;
  testState.appStateListener = null;
  testState.loadMusicXmlForPlayer.mockReset().mockResolvedValue("<score-partwise />");
  testState.cacheLoad.mockReset().mockResolvedValue(null);
  testState.cacheSave.mockReset();
  testState.loadSnapshot.mockReset().mockResolvedValue({
    playback: { state: "paused", positionMs: 2_000, durationMs: 8_000, tempo: 96 },
    reading: { page: 2, scrollRatio: 0.3 }
  });
  testState.saveSnapshot.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ScorePlayerWebView continuity", () => {
  it("translates the waiting UI and sends a locale change without reloading the score", async () => {
    const view = render(<ScorePlayerWebView score={score} sessionUserId="admin-1" token="token-1" language="en" />);

    expect(await screen.findByText("Preparing player")).toBeTruthy();
    expect(screen.getByText("Waiting for the secure player channel.")).toBeTruthy();
    sendBridgeHandshake();

    await waitFor(() => expect(scoreLoads()).toHaveLength(1));
    const requestId = scoreLoads()[0].requestId;
    expect(scoreLoads()[0].payload.language).toBe("en");
    sendPlayerMessage("playback.state", requestId, {
      state: "paused",
      positionMs: 3_200,
      durationMs: 8_000,
      tempo: 102
    });
    sendPlayerMessage("reading.state", requestId, {
      page: 3,
      scrollRatio: 0.6,
      anchorMeasureId: "measure-3-2",
      anchorViewportRatio: 0.2
    });

    view.rerender(<ScorePlayerWebView score={score} sessionUserId="admin-1" token="token-1" language="pt" />);

    await waitFor(() => expect(playerLanguageUpdates()).toContainEqual({ language: "pt" }));
    expect(testState.webViewMounts).toBe(1);
    expect(testState.webViewUnmounts).toBe(0);
    expect(scoreLoads()).toHaveLength(1);
    expect(screen.getByText("Preparando a notação da partitura.")).toBeTruthy();
    view.unmount();
  });

  it("loads once when an older player announces ready without optional capabilities", async () => {
    const view = render(<ScorePlayerWebView score={score} sessionUserId="admin-1" token="token-1" />);
    await screen.findByText("Aguardando o canal seguro do player.");
    const onMessage = testState.latestProps?.onMessage as (event: unknown) => void;
    act(() => onMessage({ nativeEvent: { url: playerUrl, data: JSON.stringify({
      channel: "score-to-musicxml/player", version: 1, type: "bridge.ready",
      payload: { commands: ["pause", "stop", "dispose"] }
    }) } }));

    await waitFor(() => expect(scoreLoads()).toHaveLength(1));
    expect(testState.loadSnapshot).toHaveBeenCalledTimes(1);
    expect(testState.webViewMounts).toBe(1);
    view.rerender(<ScorePlayerWebView score={score} sessionUserId="admin-1" token="token-1" height={520} />);
    expect(testState.loadSnapshot).toHaveBeenCalledTimes(1);
    expect(scoreLoads()).toHaveLength(1);
    view.unmount();
  });

  it("loads once when the online player announces legacy capabilities before score focus", async () => {
    const view = render(<ScorePlayerWebView score={score} sessionUserId="user-1" token="token-1" readingTarget={{ id: "review-new", measure: "3" }} />);
    await screen.findByText("Aguardando o canal seguro do player.");
    sendBridgeHandshake();
    const onMessage = testState.latestProps?.onMessage as (event: unknown) => void;
    act(() => onMessage({ nativeEvent: { url: playerUrl, data: JSON.stringify({
      channel: "score-to-musicxml/player", version: 1, type: "bridge.capabilities",
      payload: { capabilities: ["session.snapshot", "session.restore", "score.focus"] }
    }) } }));
    await waitFor(() => expect(scoreLoads()).toHaveLength(1));
    const requestId = scoreLoads()[0].requestId;
    expect(scoreLoads()[0].payload.restoreSnapshot).toBeTruthy();
    sendPlayerMessage("score.status", requestId, { state: "ready" });
    await waitFor(() => expect(testState.postedMessages.map((message) => JSON.parse(message))).toContainEqual(expect.objectContaining({
      type: "score.focus", requestId, payload: { target: { id: "review-new", measure: "3" } }
    })));
    expect(scoreLoads()).toHaveLength(1);
    view.unmount();
  });

  it("resizes and updates font scale without reloading, and does not resume after background suspension", async () => {
    const view = render(<ScorePlayerWebView score={score} sessionUserId="admin-1" token="token-1" height={440} fontScale={1.2} />);

    expect((await screen.findByTestId("player-webview")).getAttribute("data-source")).toBe(playerUrl);
    expect(screen.getByTestId("player-webview").parentElement?.getAttribute("data-height")).toBe("440");
    await waitFor(() => expect(testState.loadMusicXmlForPlayer).toHaveBeenCalledOnce());

    const props = testState.latestProps!;
    act(() => {
      (props.onMessage as (event: unknown) => void)({
        nativeEvent: {
          url: playerUrl,
          data: JSON.stringify({
            channel: "score-to-musicxml/player",
            version: 1,
            type: "bridge.ready",
            payload: { commands: ["pause", "stop", "dispose"] }
          })
        }
      });
      (props.onMessage as (event: unknown) => void)({
        nativeEvent: {
          url: playerUrl,
          data: JSON.stringify({
            channel: "score-to-musicxml/player",
            version: 1,
            type: "bridge.capabilities",
            payload: { capabilities: ["session.snapshot", "session.restore"] }
          })
        }
      });
    });

    await waitFor(() => expect(testState.loadSnapshot).toHaveBeenCalledOnce());
    expect(testState.loadSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "admin-1", scoreId: "score-1" }),
      expect.objectContaining({ userId: "admin-1" })
    );
    await waitFor(() => expect(testState.postedMessages).toEqual(expect.arrayContaining([expect.stringContaining("score.load")])));
    expect(scoreLoads()).toHaveLength(1);
    expect(scoreLoads()[0].payload.restoreSnapshot).toEqual(await testState.loadSnapshot.mock.results[0].value);
    expect(testState.injectedScripts.some((script) => script.includes("'--native-font-scale', 1.2"))).toBe(true);

    const requestId = scoreLoads()[0].requestId;
    vi.spyOn(Date, "now").mockReturnValue(0);
    sendPlayerMessage("playback.state", requestId, {
      state: "playing",
      positionMs: 4_500,
      durationMs: 8_000,
      tempo: 96
    });
    sendPlayerMessage("reading.state", requestId, {
      page: 3,
      scrollRatio: 0.65,
      anchorMeasureId: "measure-3-2",
      anchorViewportRatio: 0.25
    });

    view.rerender(<ScorePlayerWebView score={score} sessionUserId="admin-1" token="token-1" height={512} fontScale={1.4} suspended />);

    expect(screen.getByTestId("player-webview").parentElement?.getAttribute("data-height")).toBe("512");
    await waitFor(() => expect(testState.injectedScripts.some((script) => script.includes("'--native-font-scale', 1.4"))).toBe(true));
    await waitFor(() => expect(playerCommands()).toContainEqual({ command: "pause" }));
    expect(testState.webViewMounts).toBe(1);
    expect(testState.webViewUnmounts).toBe(0);
    expect(scoreLoads()).toHaveLength(1);

    act(() => testState.appStateListener?.("background"));
    act(() => testState.appStateListener?.("active"));
    view.rerender(<ScorePlayerWebView score={score} sessionUserId="admin-1" token="token-1" height={512} fontScale={1.4} />);
    expect(playerCommands()).not.toContainEqual({ command: "play" });
    expect(testState.webViewMounts).toBe(1);
    expect(scoreLoads()).toHaveLength(1);
    view.unmount();
    vi.restoreAllMocks();
  });

  it("pauses and flushes before route disposal, then restores on refocus without autoplay", async () => {
    const previousSnapshot = {
      playback: { state: "paused" as const, positionMs: 2_000, durationMs: 8_000, tempo: 96 },
      reading: { page: 2, scrollRatio: 0.3 }
    };
    const resumedSnapshot = {
      playback: { state: "playing" as const, positionMs: 5_200, durationMs: 8_000, tempo: 104 },
      reading: { page: 4, scrollRatio: 0.7, anchorMeasureId: "measure-4-3", anchorViewportRatio: 0.2 }
    };
    const restoreDeferred = deferred<typeof resumedSnapshot>();
    const saveDeferred = deferred<void>();
    testState.loadSnapshot.mockReset()
      .mockResolvedValueOnce(previousSnapshot)
      .mockImplementationOnce(() => restoreDeferred.promise);
    testState.saveSnapshot.mockReset().mockImplementation(() => saveDeferred.promise);

    const view = render(<ScorePlayerWebView score={score} sessionUserId="admin-1" token="token-1" />);
    await screen.findByTestId("player-webview");
    await waitFor(() => expect(testState.loadMusicXmlForPlayer).toHaveBeenCalledOnce());
    sendBridgeHandshake();
    await waitFor(() => expect(scoreLoads()).toHaveLength(1));
    expect(scoreLoads()[0].payload.restoreSnapshot).toEqual(previousSnapshot);

    const firstRequestId = scoreLoads()[0].requestId;
    const dateNow = vi.spyOn(Date, "now").mockReturnValue(0);
    sendPlayerMessage("playback.state", firstRequestId, {
      state: "playing",
      positionMs: 5_200,
      durationMs: 8_000,
      tempo: 104
    });
    sendPlayerMessage("reading.state", firstRequestId, resumedSnapshot.reading);

    act(() => blurRoute());
    expect(playerCommands()).toContainEqual({ command: "pause" });
    expect(testState.saveSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "admin-1", scoreId: "score-1" }),
      resumedSnapshot,
      expect.objectContaining({ userId: "admin-1" })
    );
    expect(playerCommands()).not.toContainEqual({ command: "dispose" });

    await act(async () => {
      saveDeferred.resolve(undefined);
      await saveDeferred.promise;
      await Promise.resolve();
    });
    await waitFor(() => expect(playerCommands()).toContainEqual({ command: "dispose" }));

    act(() => refocusRoute());
    await waitFor(() => expect(testState.webViewMounts).toBe(2));
    await waitFor(() => expect(testState.loadMusicXmlForPlayer).toHaveBeenCalledTimes(2));
    sendBridgeHandshake();
    await waitFor(() => expect(testState.loadSnapshot).toHaveBeenCalledTimes(2));
    expect(scoreLoads()).toHaveLength(1);

    await act(async () => {
      restoreDeferred.resolve(resumedSnapshot);
      await restoreDeferred.promise;
    });
    await waitFor(() => expect(scoreLoads()).toHaveLength(2));
    expect(scoreLoads()[1].payload.restoreSnapshot).toEqual(resumedSnapshot);
    expect(testState.webViewUnmounts).toBe(1);
    expect(playerCommands()).not.toContainEqual({ command: "play" });
    dateNow.mockRestore();
    view.unmount();
  });

  it("loads a provisional first page without final XML caching, playback or saved-session state", async () => {
    const view = render(<ScorePlayerWebView
      score={score}
      sessionUserId="admin-1"
      token="token-1"
      language="en"
      firstPagePreview={{ attemptId: "attempt-2", revision: "a".repeat(64), musicXml: "<score-partwise />" }}
    />);

    await waitFor(() => expect(screen.getByTestId("player-webview")).toBeTruthy());
    expect(testState.loadMusicXmlForPlayer).not.toHaveBeenCalled();
    expect(testState.cacheLoad).not.toHaveBeenCalled();
    expect(testState.cacheSave).not.toHaveBeenCalled();
    sendBridgeHandshake();
    await waitFor(() => expect(scoreLoads()).toHaveLength(1));
    expect(scoreLoads()[0].payload.allowPlayback).toBe(false);
    expect(scoreLoads()[0].payload.restoreSnapshot).toBeUndefined();
    expect(testState.loadSnapshot).not.toHaveBeenCalled();

    const requestId = scoreLoads()[0].requestId;
    sendPlayerMessage("playback.state", requestId, { state: "idle", positionMs: 0, durationMs: 0, tempo: 70 });
    sendPlayerMessage("reading.state", requestId, { page: 1, scrollRatio: 0.4 });
    view.unmount();

    expect(testState.saveSnapshot).not.toHaveBeenCalled();
    expect(testState.cacheSave).not.toHaveBeenCalled();
  });
  it("opens a historical document without replacing the current score cache or enabling playback", async () => {
    const view = render(<ScorePlayerWebView score={score} sessionUserId="user-1" token="token-1"
      versionPreview={{ versionId: "revision:old", revision: "old-revision", musicXml: "<score-partwise />" }} />);
    await screen.findByTestId("player-webview");
    sendBridgeHandshake();
    await waitFor(() => expect(scoreLoads()).toHaveLength(1));
    expect(scoreLoads()[0].payload.allowPlayback).toBe(false);
    expect(testState.cacheLoad).not.toHaveBeenCalled();
    expect(testState.loadMusicXmlForPlayer).not.toHaveBeenCalled();
    expect(testState.loadSnapshot).not.toHaveBeenCalled();
    view.unmount();
    expect(testState.saveSnapshot).not.toHaveBeenCalled();
  });

  it("focuses a review finding only when the loaded player supports it", async () => {
    const view = render(<ScorePlayerWebView score={score} sessionUserId="user-1" token="token-1" readingTarget={{ id: "review-1", measure: "8" }} />);
    await screen.findByTestId("player-webview");
    sendBridgeHandshake();
    await waitFor(() => expect(scoreLoads()).toHaveLength(1));
    const requestId = scoreLoads()[0].requestId;
    sendPlayerMessage("score.status", requestId, { state: "ready" });
    expect(testState.postedMessages.some((message) => JSON.parse(message).type === "score.focus")).toBe(false);
    const onMessage = testState.latestProps?.onMessage as (event: unknown) => void;
    act(() => onMessage({ nativeEvent: { url: playerUrl, data: JSON.stringify({ channel: "score-to-musicxml/player", version: 1, type: "bridge.capabilities", payload: { capabilities: ["session.snapshot", "session.restore", "score.focus"] } }) } }));
    await waitFor(() => expect(testState.postedMessages.map((message) => JSON.parse(message))).toContainEqual(expect.objectContaining({ type: "score.focus", requestId, payload: { target: { id: "review-1", measure: "8" } } })));
    view.unmount();
  });

});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function sendPlayerMessage(type: "playback.state" | "reading.state" | "score.status", requestId: string, payload: unknown) {
  const onMessage = testState.latestProps?.onMessage as ((event: unknown) => void) | undefined;
  if (!onMessage) throw new Error("The player WebView is not mounted.");
  act(() => onMessage({
    nativeEvent: {
      url: playerUrl,
      data: JSON.stringify({
        channel: "score-to-musicxml/player",
        version: 1,
        type,
        requestId,
        payload
      })
    }
  }));
}

function sendBridgeHandshake() {
  const onMessage = testState.latestProps?.onMessage as ((event: unknown) => void) | undefined;
  if (!onMessage) throw new Error("The player WebView is not mounted.");
  act(() => {
    onMessage({
      nativeEvent: {
        url: playerUrl,
        data: JSON.stringify({
          channel: "score-to-musicxml/player",
          version: 1,
          type: "bridge.ready",
          payload: { commands: ["pause", "stop", "dispose"] }
        })
      }
    });
    onMessage({
      nativeEvent: {
        url: playerUrl,
        data: JSON.stringify({
          channel: "score-to-musicxml/player",
          version: 1,
          type: "bridge.capabilities",
          payload: { capabilities: ["session.snapshot", "session.restore"] }
        })
      }
    });
  });
}

function blurRoute() {
  const cleanup = testState.focusCleanup;
  testState.focusCleanup = null;
  cleanup?.();
}

function refocusRoute() {
  const effect = testState.focusEffect;
  if (!effect) throw new Error("The route focus effect is not registered.");
  const cleanup = effect();
  let activeCleanup = cleanup;
  testState.focusCleanup = () => {
    if (typeof activeCleanup !== "function") return;
    const run = activeCleanup;
    activeCleanup = undefined;
    run();
  };
}

function scoreLoads(): Array<{ requestId: string; payload: { allowPlayback?: boolean; restoreSnapshot?: unknown; language?: string } }> {
  return testState.postedMessages
    .map((message) => JSON.parse(message) as { type: string; requestId: string; payload: { allowPlayback?: boolean; restoreSnapshot?: unknown; language?: string } })
    .filter((message) => message.type === "score.load");
}

function playerCommands(): Array<{ command: string }> {
  return testState.postedMessages
    .map((message) => JSON.parse(message) as { type: string; payload: { command?: string } })
    .filter((message) => message.type === "player.command")
    .map((message) => ({ command: message.payload.command ?? "" }));
}

function playerLanguageUpdates(): Array<{ language?: string }> {
  return testState.postedMessages
    .map((message) => JSON.parse(message) as { type: string; payload: { language?: string } })
    .filter((message) => message.type === "player.language")
    .map((message) => message.payload);
}

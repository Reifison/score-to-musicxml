import { FileMusic } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PlaybackSnapshot } from "../audio/types.js";
import {
  ScorePlayer,
  type ScorePlayerCommand,
  type ScorePlayerState
} from "../components/ScorePlayer.js";
import {
  PLAYER_BRIDGE_CHANNEL,
  PLAYER_BRIDGE_VERSION,
  parseHostToPlayerMessage,
  serializePlayerToHostMessage,
  type PlayerBridgeCapability,
  type PlayerReadingTarget,
  type PlayerSessionSnapshot,
  type PlayerToHostMessage
} from "./playerBridgeContract.js";
import { playerCopy, type PlayerLanguage } from "../i18n/player.js";

type NativeWebViewWindow = Window & {
  ReactNativeWebView?: {
    postMessage: (message: string) => void;
  };
};

type ScoreSession = {
  requestId: string;
  musicXml: string;
  scoreName: string;
  allowPlayback?: boolean;
  restoreSnapshot?: PlayerSessionSnapshot;
  language: PlayerLanguage;
};

const BRIDGE_READY_MESSAGE: PlayerToHostMessage = {
  channel: PLAYER_BRIDGE_CHANNEL,
  version: PLAYER_BRIDGE_VERSION,
  type: "bridge.ready",
  payload: {
    commands: ["pause", "stop", "dispose"]
  }
};

const BRIDGE_CAPABILITIES_MESSAGE: PlayerToHostMessage = {
  channel: PLAYER_BRIDGE_CHANNEL,
  version: PLAYER_BRIDGE_VERSION,
  type: "bridge.capabilities",
  payload: { capabilities: ["session.snapshot", "session.restore", "score.focus"] satisfies PlayerBridgeCapability[] }
};

const LEGACY_BRIDGE_CAPABILITIES_MESSAGE: PlayerToHostMessage = {
  channel: PLAYER_BRIDGE_CHANNEL,
  version: PLAYER_BRIDGE_VERSION,
  type: "bridge.capabilities",
  payload: { capabilities: ["session.snapshot", "session.restore"] }
};

export function NativePlayerPage() {
  const [session, setSession] = useState<ScoreSession | null>(null);
  const [language, setLanguage] = useState<PlayerLanguage>("pt");
  const languageRef = useRef<PlayerLanguage>(language);
  languageRef.current = language;
  const sessionRef = useRef<ScoreSession | null>(null);
  const [command, setCommand] = useState<ScorePlayerCommand>();
  const [readingTarget, setReadingTarget] = useState<PlayerReadingTarget>();
  const commandIdRef = useRef(0);
  const readyRequestIdRef = useRef<string | null>(null);

  const postToHost = useCallback((message: PlayerToHostMessage): boolean => {
    const host = (window as NativeWebViewWindow).ReactNativeWebView;
    if (!host) return false;
    host.postMessage(serializePlayerToHostMessage(message));
    return true;
  }, []);

  useEffect(() => {
    // iOS can inject ReactNativeWebView just after the page's first effect.
    // Retry the announcement so a missed one-time handshake does not leave
    // the native screen waiting forever.
    const announceReady = () => {
      if (!postToHost(BRIDGE_READY_MESSAGE)) return false;
      // Keep bridge.ready byte-for-byte compatible with hosts that validate its
      // exact v1 shape. Hosts shipped before score.focus only accept the two
      // original capabilities. Announce those first so they retain restoration
      // instead of falling back to a capability-less session.
      postToHost(LEGACY_BRIDGE_CAPABILITIES_MESSAGE);
      postToHost(BRIDGE_CAPABILITIES_MESSAGE);
      return true;
    };
    let readyTimer: number | undefined;
    if (!announceReady()) {
      readyTimer = window.setInterval(() => {
        if (announceReady() && readyTimer !== undefined) {
          window.clearInterval(readyTimer);
          readyTimer = undefined;
        }
      }, 250);
    }
    window.addEventListener("pageshow", announceReady);

    const handleMessage = (event: MessageEvent<unknown>) => {
      const result = parseHostToPlayerMessage(event.data);
      if (!result.ok) {
        postToHost({
          channel: PLAYER_BRIDGE_CHANNEL,
          version: PLAYER_BRIDGE_VERSION,
          type: "bridge.error",
          requestId: result.error.requestId,
          payload: {
            code: result.error.code,
            message: result.error.message
          }
        });
        return;
      }

      const message = result.message;
      if (message.type === "score.load") {
        const nextSession = {
          requestId: message.requestId,
          musicXml: message.payload.musicXml,
          scoreName: message.payload.scoreName,
          ...(typeof message.payload.allowPlayback === "boolean" ? { allowPlayback: message.payload.allowPlayback } : {}),
          ...(message.payload.restoreSnapshot ? { restoreSnapshot: message.payload.restoreSnapshot } : {}),
          language: message.payload.language ?? "pt"
        };
        sessionRef.current = nextSession;
        readyRequestIdRef.current = null;
        setCommand(undefined);
        setReadingTarget(undefined);
        setLanguage(nextSession.language);
        setSession(nextSession);
        return;
      }

      if (message.type === "score.focus") {
        if (sessionRef.current?.requestId === message.requestId) setReadingTarget(message.payload.target);
        return;
      }

      if (message.type === "player.language") {
        const currentSession = sessionRef.current;
        if (!currentSession || currentSession.requestId !== message.requestId) return;
        const nextSession = { ...currentSession, language: message.payload.language };
        sessionRef.current = nextSession;
        setLanguage(message.payload.language);
        setSession(nextSession);
        return;
      }

      if (!sessionRef.current) {
        postToHost({
          channel: PLAYER_BRIDGE_CHANNEL,
          version: PLAYER_BRIDGE_VERSION,
          type: "bridge.error",
          requestId: message.requestId,
          payload: {
            code: "score-not-loaded",
            message: playerCopy(languageRef.current, "loadScoreFirst")
          }
        });
        return;
      }

      if (message.payload.command === "dispose") {
        const disposedRequestId = sessionRef.current.requestId;
        sessionRef.current = null;
        readyRequestIdRef.current = null;
        setSession(null);
        postToHost({
          channel: PLAYER_BRIDGE_CHANNEL,
          version: PLAYER_BRIDGE_VERSION,
          type: "score.status",
          requestId: disposedRequestId,
          payload: { state: "disposed" }
        });
        return;
      }

      commandIdRef.current += 1;
      setCommand({
        id: commandIdRef.current,
        action: message.payload.command
      });
    };

    window.addEventListener("message", handleMessage);
    document.addEventListener("message", handleMessage as EventListener);
    return () => {
      if (readyTimer !== undefined) window.clearInterval(readyTimer);
      window.removeEventListener("pageshow", announceReady);
      window.removeEventListener("message", handleMessage);
      document.removeEventListener("message", handleMessage as EventListener);
    };
  }, [postToHost]);

  const reportStatus = useCallback((state: ScorePlayerState, message?: string) => {
    const currentSession = sessionRef.current;
    if (!currentSession) return;
    readyRequestIdRef.current = state === "ready" ? currentSession.requestId : null;
    postToHost({
      channel: PLAYER_BRIDGE_CHANNEL,
      version: PLAYER_BRIDGE_VERSION,
      type: "score.status",
      requestId: currentSession.requestId,
      payload: {
        state,
        ...(message ? { message } : {})
      }
    });
  }, [postToHost]);

  const reportPlayback = useCallback((snapshot: PlaybackSnapshot) => {
    const currentSession = sessionRef.current;
    if (!currentSession || readyRequestIdRef.current !== currentSession.requestId) return;
    postToHost({
      channel: PLAYER_BRIDGE_CHANNEL,
      version: PLAYER_BRIDGE_VERSION,
      type: "playback.state",
      requestId: currentSession.requestId,
      payload: {
        state: snapshot.state,
        positionMs: Math.round(snapshot.positionMs),
        durationMs: Math.round(snapshot.durationMs),
        tempo: Math.round(snapshot.tempo)
      }
    });
  }, [postToHost]);

  const reportReading = useCallback((snapshot: PlayerSessionSnapshot["reading"]) => {
    const currentSession = sessionRef.current;
    if (!currentSession || readyRequestIdRef.current !== currentSession.requestId) return;
    postToHost({
      channel: PLAYER_BRIDGE_CHANNEL,
      version: PLAYER_BRIDGE_VERSION,
      type: "reading.state",
      requestId: currentSession.requestId,
      payload: snapshot
    });
  }, [postToHost]);

  return (
    <main className="native-player-page" lang={language === "en" ? "en-US" : "pt-BR"}>
      {session ? (
        <ScorePlayer
          key={session.requestId}
          musicXml={session.musicXml}
          scoreName={session.scoreName}
          scoreRevision={session.requestId}
          readingTarget={readingTarget}
          allowPlayback={session.allowPlayback}
          initialSnapshot={session.restoreSnapshot}
          language={session.language}
          command={command}
          onStatusChange={reportStatus}
          onPlaybackChange={reportPlayback}
          onReadingChange={reportReading}
        />
      ) : (
        <section className="native-player-waiting" role="status" aria-live="polite">
          <FileMusic aria-hidden="true" size={30} />
          <strong>{playerCopy(language, "waitingTitle")}</strong>
          <p>{playerCopy(language, "waitingMessage")}</p>
        </section>
      )}
    </main>
  );
}

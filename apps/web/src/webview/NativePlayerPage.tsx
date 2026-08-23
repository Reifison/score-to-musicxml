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
  type PlayerToHostMessage
} from "./playerBridgeContract.js";

type NativeWebViewWindow = Window & {
  ReactNativeWebView?: {
    postMessage: (message: string) => void;
  };
};

type ScoreSession = {
  requestId: string;
  musicXml: string;
  scoreName: string;
};

const BRIDGE_READY_MESSAGE: PlayerToHostMessage = {
  channel: PLAYER_BRIDGE_CHANNEL,
  version: PLAYER_BRIDGE_VERSION,
  type: "bridge.ready",
  payload: {
    commands: ["pause", "stop", "dispose"]
  }
};

export function NativePlayerPage() {
  const [session, setSession] = useState<ScoreSession | null>(null);
  const sessionRef = useRef<ScoreSession | null>(null);
  const [command, setCommand] = useState<ScorePlayerCommand>();
  const commandIdRef = useRef(0);

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
    const announceReady = () => postToHost(BRIDGE_READY_MESSAGE);
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
          scoreName: message.payload.scoreName
        };
        sessionRef.current = nextSession;
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
            message: "Carregue uma partitura antes de controlar o player."
          }
        });
        return;
      }

      if (message.payload.command === "dispose") {
        const disposedRequestId = sessionRef.current.requestId;
        sessionRef.current = null;
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
    if (!currentSession) return;
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

  return (
    <main className="native-player-page">
      {session ? (
        <ScorePlayer
          key={session.requestId}
          musicXml={session.musicXml}
          scoreName={session.scoreName}
          command={command}
          onStatusChange={reportStatus}
          onPlaybackChange={reportPlayback}
        />
      ) : (
        <section className="native-player-waiting" role="status" aria-live="polite">
          <FileMusic aria-hidden="true" size={30} />
          <strong>Player pronto</strong>
          <p>Aguardando a partitura enviada pelo app.</p>
        </section>
      )}
    </main>
  );
}

import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from "react-native";
import WebView, { type WebViewMessageEvent } from "react-native-webview";
import { api } from "../api/client";
import { allowsScorePlayback, canDownloadMusicXml, canPlayScore, canPreviewMusicXml } from "../api/scoreAvailability";
import type { Score } from "../api/types";
import { colors, sharedStyles } from "../theme/styles";
import {
  PlayerMusicXmlError,
  createPlayerCommandMessage,
  createScoreLoadMessage,
  parsePlayerToHostMessage
} from "./bridge";
import {
  isTrustedPlayerDocument,
  isTrustedPlayerOrigin,
  resolvePlayerWebViewConfig,
  type PlayerWebViewConfig
} from "./config";
import {
  PLAYER_BRIDGE_READY_TIMEOUT_MS,
  playerCommandForAppState,
  playerCommandForRouteExit
} from "./lifecycle";
import { loadCachedPlayerMusicXml, playerCacheIdentity, savePlayerMusicXmlToCache } from "./musicXmlCache";
import { playerLoadIdentity } from "./playerLoadIdentity";

export type ScorePlayerWebViewState =
  | "downloading"
  | "waiting-webview"
  | "sending"
  | "loading"
  | "ready"
  | "empty"
  | "error";

type ScorePlayerWebViewProps = {
  score: Score;
  token: string;
  onStateChange?: (state: ScorePlayerWebViewState) => void;
};

export function ScorePlayerWebView({ score, token, onStateChange }: ScorePlayerWebViewProps) {
  const [retryKey, setRetryKey] = useState(0);
  const canPreview = canPreviewMusicXml(score);
  const playbackPermission = allowsScorePlayback(score);
  const canPlay = canPlayScore(score);
  const previewOnly = !canDownloadMusicXml(score);
  const loadIdentity = playerLoadIdentity(score);
  const reportedLoadIdentityRef = useRef(loadIdentity);
  const bridgeInstanceKey = `${score.id}-${retryKey}`;
  const webViewRef = useRef<WebView>(null);
  const activeRequestIdRef = useRef<string | null>(null);
  const requestSequenceRef = useRef(0);
  const commandSequenceRef = useRef(0);
  const hasFocusedRef = useRef(false);
  const [readyBridgeInstance, setReadyBridgeInstance] = useState<string | null>(null);
  const [musicXml, setMusicXml] = useState<string | null>(null);
  const [state, setState] = useState<ScorePlayerWebViewState>("downloading");
  const [error, setError] = useState("");
  const bridgeReady = readyBridgeInstance === bridgeInstanceKey;
  const cacheIdentity = useMemo(() => playerCacheIdentity(score), [loadIdentity]);
  const downloadScore = useMemo(() => ({ id: score.id, userId: score.userId }), [score.id, score.userId]);

  const configResult = useMemo(() => {
    try {
      return {
        ok: true as const,
        value: resolvePlayerWebViewConfig(process.env.EXPO_PUBLIC_PLAYER_URL, __DEV__)
      };
    } catch (configError) {
      return {
        ok: false as const,
        message: configError instanceof Error ? configError.message : "O player não está configurado."
      };
    }
  }, []);

  useEffect(() => {
    if (reportedLoadIdentityRef.current !== loadIdentity) {
      reportedLoadIdentityRef.current = loadIdentity;
      onStateChange?.("downloading");
      return;
    }
    if (!canPreview) onStateChange?.("empty");
    else if (!configResult.ok) onStateChange?.("error");
    else onStateChange?.(state);
  }, [canPreview, configResult, loadIdentity, onStateChange, state]);

  const sendPlayerCommand = useCallback((command: "pause" | "stop" | "dispose") => {
    const requestId = activeRequestIdRef.current;
    const webView = webViewRef.current;
    if (!requestId || !webView) return;
    commandSequenceRef.current += 1;
    try {
      webView.postMessage(createPlayerCommandMessage(
        `command-${commandSequenceRef.current}`,
        command
      ));
      if (command === "dispose") activeRequestIdRef.current = null;
    } catch {
      // Desmontar a WebView também encerra o contexto de áudio; o comando é best-effort.
    }
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const command = playerCommandForAppState(nextState);
      if (command) sendPlayerCommand(command);
    });
    return () => subscription.remove();
  }, [sendPlayerCommand]);

  useFocusEffect(useCallback(() => {
    if (hasFocusedRef.current) setRetryKey((current) => current + 1);
    else hasFocusedRef.current = true;

    return () => {
      sendPlayerCommand(playerCommandForRouteExit());
    };
  }, [sendPlayerCommand]));

  useEffect(() => {
    if (!canPreview || !configResult.ok) return;
    let cancelled = false;
    sendPlayerCommand("stop");
    activeRequestIdRef.current = null;
    setMusicXml(null);
    setError("");
    setState("downloading");

    void loadCachedPlayerMusicXml(cacheIdentity)
      .then((cachedDocument) => cachedDocument ?? api.loadMusicXmlForPlayer(token, downloadScore, previewOnly)
        .then((downloadedDocument) => {
          try {
            savePlayerMusicXmlToCache(cacheIdentity, downloadedDocument);
          } catch {
            // The current download remains usable if persistent storage fails.
          }
          return downloadedDocument;
        }))
      .then((document) => {
        if (cancelled) return;
        setMusicXml(document);
        setState("waiting-webview");
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        if (loadError instanceof PlayerMusicXmlError) {
          setError(loadError.message);
          setState(loadError.code === "empty" ? "empty" : "error");
        } else {
          setError("O player precisa de uma conexão com a internet para abrir a partitura. Verifique sua conexão e tente novamente.");
          setState("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [cacheIdentity, canPreview, configResult.ok, downloadScore, loadIdentity, previewOnly, retryKey, sendPlayerCommand, token]);

  useEffect(() => {
    if (!bridgeReady || !musicXml || !webViewRef.current || state === "error") return;
    requestSequenceRef.current += 1;
    const requestId = `load-${Date.now().toString(36)}-${requestSequenceRef.current}`;
    try {
      const message = createScoreLoadMessage(requestId, musicXml, score.originalFilename, playbackPermission);
      activeRequestIdRef.current = requestId;
      setState("sending");
      webViewRef.current.postMessage(message);
      setMusicXml(null);
      setState("loading");
    } catch {
      setMusicXml(null);
      setError("Não foi possível preparar esta partitura para o player.");
      setState("error");
    }
  }, [bridgeReady, musicXml, playbackPermission, score.originalFilename, state]);

  useEffect(() => {
    if (state !== "waiting-webview" || bridgeReady) return;

    const timeout = setTimeout(() => {
      setError(canPlay
        ? "O player precisa de internet e não respondeu. Verifique sua conexão e tente novamente."
        : "O visualizador precisa de internet e de suporte à prévia sem reprodução. Verifique sua conexão e atualize o app, se houver uma versão nova.");
      setState("error");
    }, PLAYER_BRIDGE_READY_TIMEOUT_MS);

    return () => clearTimeout(timeout);
  }, [bridgeReady, canPlay, state]);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    if (!configResult.ok || !isTrustedPlayerDocument(event.nativeEvent.url, configResult.value)) return;
    const parsed = parsePlayerToHostMessage(event.nativeEvent.data);
    if (!parsed.ok) return;

    const message = parsed.message;
    if (message.type === "bridge.ready") {
      setReadyBridgeInstance(bridgeInstanceKey);
      return;
    }
    if (message.requestId && message.requestId !== activeRequestIdRef.current) return;

    if (message.type === "score.status") {
      if (message.payload.state === "loading") setState("loading");
      else if (message.payload.state === "ready") setState("ready");
      else if (message.payload.state === "empty" || message.payload.state === "disposed") setState("empty");
      else {
        setError(message.payload.message || "Não foi possível renderizar a partitura digital.");
        setState("error");
      }
      return;
    }

    if (message.type === "bridge.error") {
      setError(canPlay
        ? "O player não conseguiu processar a partitura. Tente novamente."
        : "O visualizador não conseguiu abrir esta prévia sem reprodução. Verifique a conexão e use uma versão compatível do app.");
      setState("error");
    }
  }, [bridgeInstanceKey, configResult, canPlay]);

  const failWebView = useCallback(() => {
    setError("Não foi possível carregar o player visual. Verifique sua conexão e tente novamente.");
    setState("error");
  }, []);

  if (!canPreview) {
    return (
      <PlayerNotice
        icon={score.conversionStatus === "failed" ? "warning-outline" : "time-outline"}
        message={score.conversionStatus === "failed"
          ? "A conversão falhou e não há um MusicXML disponível para prévia."
          : score.conversionStatus === "converted"
            ? "Não há um MusicXML disponível para abrir nesta partitura."
            : "A partitura digital estará disponível quando a conversão terminar."}
        title="Player ainda não disponível"
      />
    );
  }

  if (!configResult.ok) {
    return <PlayerNotice icon="warning-outline" message={configResult.message} title="Player indisponível" />;
  }

  const config = configResult.value;
  const showBlockingNotice = state !== "ready";

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        key={bridgeInstanceKey}
        source={{ uri: config.url }}
        originWhitelist={[config.origin]}
        onMessage={handleMessage}
        onShouldStartLoadWithRequest={(request) => shouldAllowNavigation(request.url, request.isTopFrame, config)}
        onError={failWebView}
        onHttpError={failWebView}
        onContentProcessDidTerminate={failWebView}
        javaScriptEnabled
        javaScriptCanOpenWindowsAutomatically={false}
        setSupportMultipleWindows={false}
        sharedCookiesEnabled={false}
        thirdPartyCookiesEnabled={false}
        cacheEnabled={false}
        incognito
        allowsLinkPreview={false}
        allowsBackForwardNavigationGestures={false}
        allowsInlineMediaPlayback
        allowsAirPlayForMediaPlayback={false}
        allowsPictureInPictureMediaPlayback={false}
        mediaPlaybackRequiresUserAction
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        mixedContentMode="never"
        webviewDebuggingEnabled={__DEV__}
        dataDetectorTypes="none"
        pullToRefreshEnabled={false}
        nestedScrollEnabled
        style={styles.webView}
      />
      {showBlockingNotice ? (
        <View accessibilityLiveRegion="polite" style={styles.overlay}>
          {state === "error" || state === "empty" ? (
            <Ionicons color={state === "error" ? colors.danger : colors.muted} name={state === "error" ? "warning-outline" : "musical-notes-outline"} size={28} />
          ) : (
            <ActivityIndicator color={colors.primary} />
          )}
          <Text style={styles.noticeTitle}>{playerStateTitle(state)}</Text>
          <Text style={styles.noticeMessage}>{state === "error" ? error : playerStateMessage(state)}</Text>
          {state === "error" ? (
            <Pressable
              accessibilityHint="Tenta baixar a partitura e carregar o player novamente"
              accessibilityRole="button"
              onPress={() => setRetryKey((current) => current + 1)}
              style={[sharedStyles.button, styles.retryButton]}
            >
              <Ionicons color={colors.onPrimary} name="refresh-outline" size={18} />
              <Text style={sharedStyles.buttonText}>Tentar novamente</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function PlayerNotice({ icon, message, title }: { icon: keyof typeof Ionicons.glyphMap; message: string; title: string }) {
  return (
    <View accessibilityLiveRegion="polite" style={styles.staticNotice}>
      <Ionicons color={colors.muted} name={icon} size={28} />
      <Text style={styles.noticeTitle}>{title}</Text>
      <Text style={styles.noticeMessage}>{message}</Text>
    </View>
  );
}

function shouldAllowNavigation(url: string, isTopFrame: boolean, config: PlayerWebViewConfig): boolean {
  if (url === "about:blank") return true;
  return isTopFrame ? isTrustedPlayerDocument(url, config) : isTrustedPlayerOrigin(url, config);
}

function playerStateTitle(state: ScorePlayerWebViewState): string {
  if (state === "downloading") return "Baixando partitura";
  if (state === "waiting-webview") return "Preparando player";
  if (state === "sending" || state === "loading") return "Renderizando partitura";
  if (state === "empty") return "Partitura digital indisponível";
  if (state === "error") return "Não foi possível abrir o player";
  return "Player pronto";
}

function playerStateMessage(state: ScorePlayerWebViewState): string {
  if (state === "downloading") return "O MusicXML está sendo obtido com segurança.";
  if (state === "waiting-webview") return "Aguardando o canal seguro do player.";
  if (state === "sending" || state === "loading") return "Preparando a notação da partitura.";
  if (state === "empty") return "O MusicXML não contém uma partitura que possa ser exibida.";
  return "";
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.panel,
    height: 620,
    overflow: "hidden",
    position: "relative",
    width: "100%"
  },
  noticeMessage: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 300,
    textAlign: "center"
  },
  noticeTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "800",
    textAlign: "center"
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    backgroundColor: colors.panel,
    gap: 10,
    justifyContent: "center",
    padding: 24
  },
  retryButton: {
    marginTop: 8,
    minHeight: 48
  },
  staticNotice: {
    alignItems: "center",
    backgroundColor: colors.surfaceSoft,
    gap: 10,
    justifyContent: "center",
    minHeight: 220,
    padding: 24
  },
  webView: {
    backgroundColor: colors.panel,
    flex: 1
  }
});

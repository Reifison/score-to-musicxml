import { Ionicons } from "@expo/vector-icons";
import { Paths } from "expo-file-system";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from "react-native";
import WebView, { type WebViewMessageEvent } from "react-native-webview";
import { api } from "../api/client";
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
  resolveBundledPlayerWebViewConfig,
  resolvePlayerWebViewConfig,
  type PlayerWebViewConfig
} from "./config";
import {
  PLAYER_BRIDGE_READY_TIMEOUT_MS,
  playerCommandForAppState,
  playerCommandForRouteExit
} from "./lifecycle";

type NativePlayerState =
  | "downloading"
  | "waiting-webview"
  | "sending"
  | "loading"
  | "ready"
  | "empty"
  | "error";

type ScorePlayerWebViewProps = {
  immersive?: boolean;
  onImmersiveChange?: (immersive: boolean) => void;
  score: Score;
  token: string;
};

export function ScorePlayerWebView({ immersive = false, onImmersiveChange, score, token }: ScorePlayerWebViewProps) {
  const webViewRef = useRef<WebView>(null);
  const activeRequestIdRef = useRef<string | null>(null);
  // Keep the last downloaded document outside render state. Native fullscreen
  // can recreate the WebView while the score screen stays mounted; the new
  // bridge must receive the existing XML again without another API request.
  const musicXmlCacheRef = useRef<string | null>(null);
  const requestSequenceRef = useRef(0);
  const commandSequenceRef = useRef(0);
  const hasFocusedRef = useRef(false);
  const [retryKey, setRetryKey] = useState(0);
  const [bridgeReady, setBridgeReady] = useState(false);
  const [musicXml, setMusicXml] = useState<string | null>(null);
  const [state, setState] = useState<NativePlayerState>("downloading");
  const [error, setError] = useState("");

  const configResult = useMemo(() => {
    try {
      return {
        ok: true as const,
        value: __DEV__
          ? resolvePlayerWebViewConfig(
            process.env.EXPO_PUBLIC_PLAYER_URL,
            process.env.EXPO_PUBLIC_ALLOW_HTTP_PLAYER === "1"
          )
          : resolveBundledPlayerWebViewConfig(Paths.bundle.uri)
      };
    } catch (configError) {
      return {
        ok: false as const,
        message: configError instanceof Error ? configError.message : "O player não está configurado."
      };
    }
  }, []);

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
    if (score.conversionStatus !== "converted" || !configResult.ok) return;
    let cancelled = false;
    activeRequestIdRef.current = null;
    musicXmlCacheRef.current = null;
    setBridgeReady(false);
    setMusicXml(null);
    setError("");
    setState("downloading");

    void api.loadMusicXmlForPlayer(token, score)
      .then((document) => {
        if (cancelled) return;
        musicXmlCacheRef.current = document;
        setMusicXml(document);
        setState("waiting-webview");
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        if (loadError instanceof PlayerMusicXmlError) {
          setError(loadError.message);
          setState(loadError.code === "empty" ? "empty" : "error");
        } else {
          setError("Não foi possível baixar o MusicXML para o player. Verifique sua conexão e tente novamente.");
          setState("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [configResult.ok, retryKey, score.conversionStatus, score.id, score.originalFilename, token]);

  useEffect(() => {
    if (!bridgeReady || !musicXml || !webViewRef.current || state === "error") return;
    requestSequenceRef.current += 1;
    const requestId = `load-${Date.now().toString(36)}-${requestSequenceRef.current}`;
    try {
      const message = createScoreLoadMessage(requestId, musicXml, score.originalFilename, immersive);
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
  }, [bridgeReady, musicXml, score.originalFilename, state]);

  useEffect(() => {
    if (state !== "waiting-webview" || bridgeReady) return;

    const timeout = setTimeout(() => {
      setError("O player visual não respondeu. Verifique se o app está atualizado e tente novamente.");
      setState("error");
    }, PLAYER_BRIDGE_READY_TIMEOUT_MS);

    return () => clearTimeout(timeout);
  }, [bridgeReady, state]);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    if (!configResult.ok || !isTrustedPlayerDocument(event.nativeEvent.url, configResult.value)) return;
    const parsed = parsePlayerToHostMessage(event.nativeEvent.data);
    if (!parsed.ok) return;

    const message = parsed.message;
    if (message.type === "bridge.ready") {
      setBridgeReady(true);
      // The WebView remains mounted while the native shell changes its bounds.
      // Reuse the cached document only when the web document itself is new.
      const cachedMusicXml = musicXmlCacheRef.current;
      if (cachedMusicXml && !musicXml) setMusicXml(cachedMusicXml);
      return;
    }
    if (message.requestId && message.requestId !== activeRequestIdRef.current) return;

    if (message.type === "viewport.state") {
      if (message.payload.immersive !== immersive) onImmersiveChange?.(message.payload.immersive);
      return;
    }

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
      setError("O player não conseguiu processar a partitura. Tente novamente.");
      setState("error");
    }
  }, [configResult, immersive, musicXml, onImmersiveChange]);

  const failWebView = useCallback(() => {
    setError("Não foi possível carregar o player visual. Verifique sua conexão e tente novamente.");
    setState("error");
  }, []);

  if (score.conversionStatus !== "converted") {
    return (
      <PlayerNotice
        icon="time-outline"
        message={score.conversionStatus === "failed"
          ? "A partitura digital está indisponível porque a conversão falhou."
          : "A partitura digital estará disponível quando a conversão terminar."}
        title="Player ainda não disponível"
      />
    );
  }

  if (!configResult.ok) {
    return <PlayerNotice icon="warning-outline" message={configResult.message} title="Player indisponível" />;
  }

  const config = configResult.value;
  const usesBundledPlayer = config.kind === "bundled";
  // Keep the web player's transport visible while MusicXML is being prepared.
  // Only terminal states should cover the WebView; otherwise the user can
  // already see the player controls and their disabled/loading state.
  const showBlockingNotice = state === "error" || state === "empty";
  const player = (
    <View style={[styles.container, immersive && styles.immersiveContainer]}>
      <WebView
        ref={webViewRef}
        key={`${score.id}-${retryKey}`}
        source={{ uri: config.url }}
        originWhitelist={usesBundledPlayer ? ["file://*"] : [config.origin]}
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
        allowFileAccess={usesBundledPlayer}
        allowFileAccessFromFileURLs={usesBundledPlayer}
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

  return player;
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

function playerStateTitle(state: NativePlayerState): string {
  if (state === "downloading") return "Baixando partitura";
  if (state === "waiting-webview") return "Preparando player";
  if (state === "sending" || state === "loading") return "Renderizando partitura";
  if (state === "empty") return "Partitura digital indisponível";
  if (state === "error") return "Não foi possível abrir o player";
  return "Player pronto";
}

function playerStateMessage(state: NativePlayerState): string {
  if (state === "downloading") return "O MusicXML está sendo obtido com segurança.";
  if (state === "waiting-webview") return "Aguardando o canal seguro do player.";
  if (state === "sending" || state === "loading") return "Preparando notação, páginas e áudio.";
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
  immersiveContainer: {
    flex: 1,
    height: "100%"
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

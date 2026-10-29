import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, AppState, Pressable, StyleSheet, View } from "react-native";
import WebView, { type WebViewMessageEvent } from "react-native-webview";
import { AdaptiveText as Text } from "../adaptive/AdaptiveTypography";
import { api } from "../api/client";
import { allowsScorePlayback, canDownloadMusicXml, canPlayScore, canPreviewMusicXml } from "../api/scoreAvailability";
import type { Score } from "../api/types";
import { useTranslation, type Language } from "../i18n";
import { colors, sharedStyles } from "../theme/styles";
import {
  type PlayerBridgeCapability,
  PlayerMusicXmlError,
  createPlayerCommandMessage,
  createPlayerLanguageMessage,
  createPlayerFocusMessage,
  type PlayerReadingTarget,
  createScoreLoadMessage,
  parsePlayerToHostMessage,
  validatePlayerMusicXml
} from "./bridge";
import {
  isTrustedPlayerDocument,
  isTrustedPlayerOrigin,
  resolvePlayerWebViewConfig,
  type PlayerWebViewConfig
} from "./config";
import {
  PLAYER_BRIDGE_CAPABILITY_TIMEOUT_MS,
  PLAYER_BRIDGE_READY_TIMEOUT_MS,
  playerCommandForAppState,
  playerCommandForRouteExit
} from "./lifecycle";
import { loadCachedPlayerMusicXml, playerCacheIdentity, savePlayerMusicXmlToCache } from "./musicXmlCache";
import { playerLoadIdentity } from "./playerLoadIdentity";
import {
  createPlayerSessionLease,
  loadPlayerSessionSnapshot,
  savePlayerSessionSnapshot,
  type PlayerSessionLease,
  type PlayerPlaybackSnapshot,
  type PlayerReadingSnapshot,
  type PlayerSessionIdentity,
  type PlayerSessionSnapshot
} from "./sessionSnapshot";

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
  sessionUserId: string;
  token: string;
  firstPagePreview?: {
    attemptId: string;
    revision: string;
    musicXml: string;
  };
  versionPreview?: { versionId: string; revision: string; musicXml: string };
  readingTarget?: PlayerReadingTarget;
  height?: number;
  suspended?: boolean;
  fontScale?: number;
  language?: Language;
  onStateChange?: (state: ScorePlayerWebViewState) => void;
};

type PlayerText = (portuguese: string, english: string) => string;

const DEFAULT_PLAYER_HEIGHT = 620;
const PLAYER_SNAPSHOT_PERSIST_INTERVAL_MS = 1_000;
const EMPTY_BRIDGE_CAPABILITIES: PlayerBridgeCapability[] = [];
const INITIAL_PLAYBACK_SNAPSHOT: PlayerPlaybackSnapshot = {
  state: "idle",
  positionMs: 0,
  durationMs: 0,
  tempo: 70
};

export function ScorePlayerWebView({
  score,
  sessionUserId,
  token,
  firstPagePreview,
  versionPreview,
  readingTarget,
  height = DEFAULT_PLAYER_HEIGHT,
  suspended = false,
  fontScale = 1,
  language: languageOverride,
  onStateChange
}: ScorePlayerWebViewProps) {
  const { language: appLanguage, t } = useTranslation();
  const language = languageOverride ?? appLanguage;
  const text = useCallback<PlayerText>((portuguese, english) => (
    language === appLanguage ? t(portuguese, english) : language === "pt" ? portuguese : english
  ), [appLanguage, language, t]);
  const languageRef = useRef<Language>(language);
  languageRef.current = language;
  const [retryKey, setRetryKey] = useState(0);
  const documentPreview = firstPagePreview ?? versionPreview;
  const canPreview = documentPreview ? true : canPreviewMusicXml(score);
  const playbackPermission = documentPreview ? false : allowsScorePlayback(score);
  const canPlay = documentPreview ? false : canPlayScore(score);
  const previewOnly = documentPreview ? true : !canDownloadMusicXml(score);
  const loadIdentity = versionPreview
    ? JSON.stringify(["version-preview", sessionUserId, score.id, versionPreview.versionId, versionPreview.revision])
    : firstPagePreview
    ? JSON.stringify(["first-page-preview", sessionUserId, score.id, firstPagePreview.attemptId, firstPagePreview.revision])
    : playerLoadIdentity(score);
  const reportedLoadIdentityRef = useRef(loadIdentity);
  const bridgeInstanceKey = `${score.id}-${retryKey}`;
  const webViewRef = useRef<WebView>(null);
  const activeRequestIdRef = useRef<string | null>(null);
  const activeRequestLoadIdentityRef = useRef<string | null>(null);
  const requestSequenceRef = useRef(0);
  const commandSequenceRef = useRef(0);
  const hasFocusedRef = useRef(false);
  const capabilityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [routeFocused, setRouteFocused] = useState(false);
  const [appState, setAppState] = useState(AppState.currentState);
  const [readyBridgeInstance, setReadyBridgeInstance] = useState<string | null>(null);
  const [capabilityHandshake, setCapabilityHandshake] = useState<{
    bridgeInstance: string;
    capabilities: PlayerBridgeCapability[];
    settled: boolean;
  } | null>(null);
  const [musicXml, setMusicXml] = useState<string | null>(null);
  const [state, setState] = useState<ScorePlayerWebViewState>("downloading");
  const [error, setError] = useState("");
  const playbackSnapshotRef = useRef<PlayerPlaybackSnapshot>(INITIAL_PLAYBACK_SNAPSHOT);
  const readingSnapshotRef = useRef<PlayerReadingSnapshot>({ page: 1, scrollRatio: 0 });
  const lastSnapshotPersistedAtRef = useRef(0);
  const snapshotPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapshotIdentity = useMemo<PlayerSessionIdentity>(() => ({
    userId: sessionUserId,
    scoreId: score.id,
    revision: loadIdentity
  }), [loadIdentity, score.id, sessionUserId]);
  const snapshotLease = useMemo<PlayerSessionLease | null>(
    () => documentPreview ? null : createPlayerSessionLease(sessionUserId),
    [firstPagePreview?.attemptId, firstPagePreview?.revision, versionPreview?.versionId, versionPreview?.revision, sessionUserId]
  );
  const snapshotLoadGenerationRef = useRef(0);
  const sentLanguageRef = useRef<{ requestId: string; language: Language } | null>(null);
  const bridgeReady = readyBridgeInstance === bridgeInstanceKey;
  const currentCapabilityHandshake = capabilityHandshake?.bridgeInstance === bridgeInstanceKey ? capabilityHandshake : null;
  const capabilitiesSettled = currentCapabilityHandshake?.settled === true;
  const bridgeCapabilities = currentCapabilityHandshake?.capabilities ?? EMPTY_BRIDGE_CAPABILITIES;
  const resolvedHeight = Number.isFinite(height) && height >= 0 ? height : DEFAULT_PLAYER_HEIGHT;
  const cacheIdentity = useMemo(() => documentPreview ? null : playerCacheIdentity(score), [firstPagePreview?.attemptId, firstPagePreview?.revision, versionPreview?.versionId, versionPreview?.revision, loadIdentity]);
  const downloadScore = useMemo(() => ({ id: score.id, userId: score.userId }), [score.id, score.userId]);

  const configResult = useMemo(() => {
    try {
      return {
        ok: true as const,
        value: resolvePlayerWebViewConfig(process.env.EXPO_PUBLIC_PLAYER_URL, __DEV__, language)
      };
    } catch (configError) {
      return {
        ok: false as const,
        message: configError instanceof Error ? configError.message : text("O player não está configurado.", "The player is not configured.")
      };
    }
  }, [language, text]);

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
      if (command === "dispose") {
        activeRequestIdRef.current = null;
        activeRequestLoadIdentityRef.current = null;
      }
    } catch {
      // Desmontar a WebView também encerra o contexto de áudio; o comando é best-effort.
    }
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      setAppState(nextState);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    playbackSnapshotRef.current = INITIAL_PLAYBACK_SNAPSHOT;
    readingSnapshotRef.current = { page: 1, scrollRatio: 0 };
  }, [snapshotIdentity]);

  useEffect(() => {
    if (!canPreview || !configResult.ok) return;
    let cancelled = false;
    sendPlayerCommand("stop");
    activeRequestIdRef.current = null;
    setMusicXml(null);
    setError("");
    setState("downloading");

    if (documentPreview) {
      try {
        validatePlayerMusicXml(documentPreview.musicXml, undefined, languageRef.current);
        setMusicXml(documentPreview.musicXml);
        setState("waiting-webview");
      } catch (previewError) {
        if (previewError instanceof PlayerMusicXmlError) setError(previewError.message);
        else setError("Não foi possível preparar esta partitura para o visualizador.");
        setState("error");
      }
      return () => {
        cancelled = true;
      };
    }

    if (!cacheIdentity) return;

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
  }, [cacheIdentity, canPreview, configResult.ok, downloadScore, firstPagePreview?.attemptId, firstPagePreview?.musicXml, firstPagePreview?.revision, versionPreview?.versionId, versionPreview?.musicXml, versionPreview?.revision, loadIdentity, previewOnly, retryKey, sendPlayerCommand, token]);

  useEffect(() => {
    if (!bridgeReady || !capabilitiesSettled || !musicXml || !webViewRef.current) return;
    let cancelled = false;
    const musicXmlToLoad = musicXml;
    const loadGeneration = ++snapshotLoadGenerationRef.current;
    requestSequenceRef.current += 1;
    const requestId = `load-${Date.now().toString(36)}-${requestSequenceRef.current}`;
    const canRestore = bridgeCapabilities.includes("session.restore");
    activeRequestIdRef.current = null;
    activeRequestLoadIdentityRef.current = null;
    setState("sending");

    void (async () => {
      try {
        const storedSnapshot = snapshotLease
          ? await loadPlayerSessionSnapshot(snapshotIdentity, snapshotLease)
          : null;
        if (cancelled || loadGeneration !== snapshotLoadGenerationRef.current) return;
        playbackSnapshotRef.current = storedSnapshot?.playback ?? INITIAL_PLAYBACK_SNAPSHOT;
        readingSnapshotRef.current = storedSnapshot?.reading ?? { page: 1, scrollRatio: 0 };
        const message = createScoreLoadMessage(
          requestId,
          musicXmlToLoad,
          score.originalFilename,
          playbackPermission,
          canRestore ? storedSnapshot ?? undefined : undefined,
          languageRef.current
        );
        const webView = webViewRef.current;
        if (!webView) return;
        activeRequestIdRef.current = requestId;
        activeRequestLoadIdentityRef.current = loadIdentity;
        webView.postMessage(message);
        sentLanguageRef.current = { requestId, language: languageRef.current };
        setMusicXml(null);
        setState("loading");
      } catch {
        if (cancelled) return;
        setError("Não foi possível preparar esta partitura para o player.");
        setState("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bridgeCapabilities, bridgeReady, capabilitiesSettled, loadIdentity, musicXml, playbackPermission, score.originalFilename, snapshotIdentity, snapshotLease]);

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

  const persistCurrentSnapshot = useCallback(async () => {
    if (!snapshotLease) return;
    const snapshot: PlayerSessionSnapshot = {
      playback: { ...playbackSnapshotRef.current },
      reading: { ...readingSnapshotRef.current }
    };
    await savePlayerSessionSnapshot(snapshotIdentity, snapshot, snapshotLease);
    lastSnapshotPersistedAtRef.current = Date.now();
  }, [snapshotIdentity, snapshotLease]);

  const scheduleSnapshotPersist = useCallback((force = false) => {
    if (!snapshotLease) return;
    if (force) {
      if (snapshotPersistTimerRef.current) clearTimeout(snapshotPersistTimerRef.current);
      snapshotPersistTimerRef.current = null;
      void persistCurrentSnapshot();
      return;
    }
    if (snapshotPersistTimerRef.current) return;
    const elapsed = Date.now() - lastSnapshotPersistedAtRef.current;
    const delay = Math.max(0, PLAYER_SNAPSHOT_PERSIST_INTERVAL_MS - elapsed);
    snapshotPersistTimerRef.current = setTimeout(() => {
      snapshotPersistTimerRef.current = null;
      void persistCurrentSnapshot();
    }, delay);
  }, [persistCurrentSnapshot, snapshotLease]);

  const pauseFlushAndDispose = useCallback(async () => {
    const requestId = activeRequestIdRef.current;
    const webView = webViewRef.current;
    if (!requestId || !webView) return;
    sendPlayerCommand("pause");
    await persistCurrentSnapshot();
    if (activeRequestIdRef.current === requestId && webViewRef.current === webView) {
      sendPlayerCommand(playerCommandForRouteExit());
    }
  }, [persistCurrentSnapshot, sendPlayerCommand]);

  useEffect(() => {
    const appCommand = playerCommandForAppState(appState);
    if (suspended || !routeFocused) sendPlayerCommand("pause");
    else if (appCommand) sendPlayerCommand(appCommand);
    if ((suspended || !routeFocused || appCommand) && activeRequestIdRef.current) scheduleSnapshotPersist(true);
  }, [appState, routeFocused, scheduleSnapshotPersist, sendPlayerCommand, suspended]);

  useFocusEffect(useCallback(() => {
    setRouteFocused(true);
    if (hasFocusedRef.current) setRetryKey((current) => current + 1);
    else hasFocusedRef.current = true;

    return () => {
      setRouteFocused(false);
      void pauseFlushAndDispose();
    };
  }, [pauseFlushAndDispose]));

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    if (!configResult.ok || !isTrustedPlayerDocument(event.nativeEvent.url, configResult.value)) return;
    const parsed = parsePlayerToHostMessage(event.nativeEvent.data);
    if (!parsed.ok) return;

    const message = parsed.message;
    if (message.type === "bridge.ready") {
      setReadyBridgeInstance(bridgeInstanceKey);
      if (capabilityTimerRef.current) clearTimeout(capabilityTimerRef.current);
      setCapabilityHandshake((current) => current?.bridgeInstance === bridgeInstanceKey && current.settled
        ? current
        : { bridgeInstance: bridgeInstanceKey, capabilities: [], settled: false });
      capabilityTimerRef.current = setTimeout(() => {
        setCapabilityHandshake((current) => current?.bridgeInstance === bridgeInstanceKey
          ? { ...current, settled: true }
          : current);
        capabilityTimerRef.current = null;
      }, PLAYER_BRIDGE_CAPABILITY_TIMEOUT_MS);
      return;
    }
    if (message.type === "bridge.capabilities") {
      if (capabilityTimerRef.current) clearTimeout(capabilityTimerRef.current);
      capabilityTimerRef.current = null;
      setCapabilityHandshake({
        bridgeInstance: bridgeInstanceKey,
        capabilities: message.payload.capabilities,
        settled: true
      });
      return;
    }
    if (message.requestId && message.requestId !== activeRequestIdRef.current) return;
    if (message.requestId && activeRequestLoadIdentityRef.current !== loadIdentity) return;

    if (message.type === "playback.state") {
      playbackSnapshotRef.current = message.payload;
      scheduleSnapshotPersist(message.payload.state !== "playing");
      return;
    }

    if (message.type === "reading.state") {
      readingSnapshotRef.current = message.payload;
      scheduleSnapshotPersist();
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
      setError(canPlay
        ? "O player não conseguiu processar a partitura. Tente novamente."
        : "O visualizador não conseguiu abrir esta prévia sem reprodução. Verifique a conexão e use uma versão compatível do app.");
      setState("error");
    }
  }, [bridgeInstanceKey, configResult, canPlay, loadIdentity, scheduleSnapshotPersist]);

  useEffect(() => {
    if (!bridgeReady || !webViewRef.current) return;
    const requestId = activeRequestIdRef.current;
    if (!requestId) return;
    if (sentLanguageRef.current?.requestId === requestId && sentLanguageRef.current.language === language) return;
    try {
      webViewRef.current.postMessage(createPlayerLanguageMessage(requestId, language));
      sentLanguageRef.current = { requestId, language };
    } catch {
      // The current score remains open if an optional language update cannot be sent.
    }
  }, [bridgeReady, language]);

  useEffect(() => {
    const requestId = activeRequestIdRef.current;
    if (!readingTarget || state !== "ready" || !requestId || !bridgeCapabilities.includes("score.focus")) return;
    if (activeRequestLoadIdentityRef.current !== loadIdentity) return;
    try {
      webViewRef.current?.postMessage(createPlayerFocusMessage(requestId, readingTarget));
    } catch {
      // The original page remains available even if an optional location cannot be sent.
    }
  }, [bridgeCapabilities, loadIdentity, readingTarget, state]);

  const safeFontScale = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;
  const applyFontScale = useCallback(() => {
    if (!bridgeReady || !webViewRef.current) return;
    try {
      const value = JSON.stringify(safeFontScale);
      webViewRef.current.injectJavaScript(
        `document.documentElement.style.setProperty('--native-font-scale', ${value}); true;`
      );
    } catch {
      // A font-scale update is cosmetic; it must not interrupt loading or playback.
    }
  }, [bridgeReady, safeFontScale]);

  useEffect(() => {
    applyFontScale();
  }, [applyFontScale]);

  useEffect(() => () => {
    if (capabilityTimerRef.current) clearTimeout(capabilityTimerRef.current);
  }, [bridgeInstanceKey]);

  useEffect(() => () => {
    if (snapshotPersistTimerRef.current) clearTimeout(snapshotPersistTimerRef.current);
    snapshotPersistTimerRef.current = null;
    void persistCurrentSnapshot();
  }, [persistCurrentSnapshot]);

  const failWebView = useCallback(() => {
    setError("Não foi possível carregar o player visual. Verifique sua conexão e tente novamente.");
    setState("error");
  }, []);

  if (!canPreview) {
      return (
      <PlayerNotice
        icon={score.conversionStatus === "failed" ? "warning-outline" : "time-outline"}
        message={score.conversionStatus === "failed"
          ? text("A conversão falhou e não há um MusicXML disponível para prévia.", "The conversion failed and no MusicXML preview is available.")
          : score.conversionStatus === "converted"
            ? text("Não há um MusicXML disponível para abrir nesta partitura.", "No MusicXML is available to open for this score.")
            : text("A partitura digital estará disponível quando a conversão terminar.", "The digital score will be available when conversion finishes.")}
          title={text("Player ainda não disponível", "Player is not available yet")}
      />
    );
  }

  if (!configResult.ok) {
    return <PlayerNotice icon="warning-outline" message={configResult.message} title={text("Player indisponível", "Player unavailable")} />;
  }

  const config = configResult.value;
  const showBlockingNotice = state !== "ready";

  return (
    <View style={[styles.container, { height: resolvedHeight }]}>
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
          <Text style={styles.noticeTitle}>{playerStateTitle(state, text)}</Text>
          <Text style={styles.noticeMessage}>{state === "error" ? localizeMobilePlayerError(error, language, text) : playerStateMessage(state, text)}</Text>
          {state === "error" ? (
            <Pressable
              accessibilityHint={text("Tenta baixar a partitura e carregar o player novamente", "Downloads the score and loads the player again")}
              accessibilityRole="button"
              onPress={() => setRetryKey((current) => current + 1)}
              style={[sharedStyles.button, styles.retryButton]}
            >
              <Ionicons color={colors.onPrimary} name="refresh-outline" size={18} />
              <Text style={sharedStyles.buttonText}>{text("Tentar novamente", "Try again")}</Text>
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

function playerStateTitle(state: ScorePlayerWebViewState, text: PlayerText): string {
  if (state === "downloading") return text("Baixando partitura", "Downloading score");
  if (state === "waiting-webview") return text("Preparando player", "Preparing player");
  if (state === "sending" || state === "loading") return text("Renderizando partitura", "Rendering score");
  if (state === "empty") return text("Partitura digital indisponível", "Digital score unavailable");
  if (state === "error") return text("Não foi possível abrir o player", "Could not open the player");
  return text("Player pronto", "Player ready");
}

function playerStateMessage(state: ScorePlayerWebViewState, text: PlayerText): string {
  if (state === "downloading") return text("O MusicXML está sendo obtido com segurança.", "Securely retrieving MusicXML.");
  if (state === "waiting-webview") return text("Aguardando o canal seguro do player.", "Waiting for the secure player channel.");
  if (state === "sending" || state === "loading") return text("Preparando a notação da partitura.", "Preparing the score notation.");
  if (state === "empty") return text("O MusicXML não contém uma partitura que possa ser exibida.", "The MusicXML does not contain a score that can be displayed.");
  return "";
}

function localizeMobilePlayerError(message: string, language: Language, text: PlayerText): string {
  if (language === "pt" || !message) return message;
  const translations: ReadonlyArray<readonly [string, string]> = [
    ["O MusicXML desta partitura está vazio.", "This score's MusicXML is empty."],
    ["O arquivo recebido não contém uma partitura MusicXML válida.", "The received file does not contain valid MusicXML."],
    ["O tamanho do MusicXML recebido é inválido.", "The received MusicXML size is invalid."],
    ["Esta partitura é grande demais para abrir no player do app.", "This score is too large to open in the app player."],
    ["Não foi possível preparar esta partitura para o player.", "Could not prepare this score for the player."],
    ["Não foi possível renderizar a partitura digital.", "Could not render the digital score."],
    ["O player não conseguiu processar a partitura. Tente novamente.", "The player could not process the score. Try again."],
    ["O visualizador não conseguiu abrir esta prévia sem reprodução. Verifique a conexão e use uma versão compatível do app.", "The viewer could not open this playback-free preview. Check your connection and use a compatible app version."],
    ["Não foi possível carregar o player visual. Verifique sua conexão e tente novamente.", "Could not load the visual player. Check your connection and try again."],
    ["O player precisa de internet e não respondeu. Verifique sua conexão e tente novamente.", "The player needs an internet connection and did not respond. Check your connection and try again."],
    ["O visualizador precisa de internet e de suporte à prévia sem reprodução. Verifique sua conexão e atualize o app, se houver uma versão nova.", "The viewer needs an internet connection and playback-free preview support. Check your connection and update the app if a newer version is available."],
    ["O player precisa de uma conexão com a internet para abrir a partitura. Verifique sua conexão e tente novamente.", "The player needs an internet connection to open the score. Check your connection and try again."],
    ["Não foi possível conectar ao serviço. Verifique sua conexão e tente novamente.", "Could not connect to the service. Check your connection and try again."]
  ];
  const exact = translations.find(([portuguese]) => portuguese === message);
  if (exact) return text(exact[0], exact[1]);
  if (message.startsWith("Não foi possível")) {
    return text("Não foi possível abrir o player. Verifique sua conexão e tente novamente.", "Could not open the player. Check your connection and try again.");
  }
  if (message.startsWith("O MusicXML") || message.includes("partitura MusicXML")) {
    return text("O player não conseguiu ler esta partitura MusicXML.", "The player could not read this MusicXML score.");
  }
  return message;
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.panel,
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

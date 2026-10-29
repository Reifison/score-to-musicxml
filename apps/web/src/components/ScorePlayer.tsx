import { ChevronLeft, ChevronRight, FileWarning, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { fetchMusicXml } from "../api/client.js";
import type { PlaybackSnapshot } from "../audio/types.js";
import type { WebAudioMidiEngine } from "../audio/WebAudioMidiEngine.js";
import type { PerformedMeasureOccurrence } from "../score/VerovioScoreRenderer.js";
import { sanitizeScoreSvg } from "../score/sanitizeScoreSvg.js";
import { applyDefaultTempo, DEFAULT_TEMPO_BPM, hasExplicitTempo } from "../score/musicXmlTempo.js";
import type { VerovioScoreRenderer } from "../score/VerovioScoreRenderer.js";
import { PlaybackControls, type PlaybackState } from "./PlaybackControls.js";
import type { PlayerSessionSnapshot } from "../webview/playerBridgeContract.js";
import { localizePlayerError, playerCopy, playerPageLabel, type PlayerLanguage } from "../i18n/player.js";
import { MeasureLoopControls, type MeasureLoopOption } from "./MeasureLoopControls.js";

export type ScorePlayerState = "loading" | "ready" | "empty" | "error";

export type ScorePlayerCommand = {
  id: number;
  action: "pause" | "stop";
};

type ScorePlayerProps = {
  scoreName: string;
  scoreId?: string;
  scoreRevision?: string;
  musicXml?: string;
  language?: PlayerLanguage;
  allowPlayback?: boolean;
  previewOnly?: boolean;
  command?: ScorePlayerCommand;
  initialSnapshot?: PlayerSessionSnapshot;
  readingTarget?: { id: string; page?: number; measure?: string };
  onStatusChange?: (state: ScorePlayerState, message?: string) => void;
  onPlaybackChange?: (snapshot: PlaybackSnapshot) => void;
  onReadingChange?: (snapshot: PlayerSessionSnapshot["reading"]) => void;
};

const INITIAL_PLAYBACK: PlaybackSnapshot = {
  state: "idle",
  positionMs: 0,
  durationMs: 0,
  rate: 1,
  positionBeat: 0,
  durationBeats: 0,
  tempo: DEFAULT_TEMPO_BPM
};

const PLAYBACK_UI_UPDATE_INTERVAL_MS = 50;

export function ScorePlayer({
  scoreId,
  scoreRevision,
  scoreName,
  musicXml: providedMusicXml,
  language = "pt",
  allowPlayback = true,
  previewOnly = false,
  command,
  initialSnapshot,
  readingTarget,
  onStatusChange,
  onPlaybackChange,
  onReadingChange
}: ScorePlayerProps) {
  const languageRef = useRef<PlayerLanguage>(language);
  languageRef.current = language;
  const rendererRef = useRef<VerovioScoreRenderer | null>(null);
  const audioRef = useRef<WebAudioMidiEngine | null>(null);
  const unsubscribeAudioRef = useRef<(() => void) | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef(1);
  const pageSvgCacheRef = useRef(new Map<number, string>());
  const playbackStateRef = useRef<PlaybackSnapshot["state"]>("idle");
  const desiredActiveIdsRef = useRef<string[]>([]);
  const appliedActiveIdsRef = useRef<string[]>([]);
  const highlightedMeasureRef = useRef<string | undefined>(undefined);
  const desiredMeasureRef = useRef<string | undefined>(undefined);
  const appliedMeasureRef = useRef<string | undefined>(undefined);
  const lastPlaybackUiUpdateRef = useRef<{ positionMs: number; state: PlaybackSnapshot["state"] } | null>(null);
  const restoredPausedRef = useRef(false);
  const pendingReadingRestoreRef = useRef<PlayerSessionSnapshot["reading"] | null>(initialSnapshot?.reading ?? null);
  const lastReadingSnapshotRef = useRef<PlayerSessionSnapshot["reading"]>(initialSnapshot?.reading ?? { page: 1, scrollRatio: 0 });
  const lastReadingTargetKeyRef = useRef("");
  const [state, setState] = useState<ScorePlayerState>("loading");
  const [error, setError] = useState("");
  const [audioError, setAudioError] = useState("");
  const [audioAvailable, setAudioAvailable] = useState(false);
  const [measureOccurrences, setMeasureOccurrences] = useState<PerformedMeasureOccurrence[]>([]);
  const [loopStartKey, setLoopStartKey] = useState("");
  const [loopEndKey, setLoopEndKey] = useState("");
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [loopError, setLoopError] = useState("");
  const [tempoAssumed, setTempoAssumed] = useState(true);
  const [baseTempoBpm, setBaseTempoBpm] = useState(DEFAULT_TEMPO_BPM);
  const [playback, setPlayback] = useState<PlaybackSnapshot>(INITIAL_PLAYBACK);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [svg, setSvg] = useState("");
  const scoreSvgMarkup = useMemo(() => ({ __html: svg }), [svg]);
  const measureLoopOptions = useMemo<MeasureLoopOption[]>(() => measureOccurrences.map((occurrence, index) => ({
    key: `${occurrence.id}:${index}:${occurrence.startMs}`,
    position: index + 1,
    number: occurrence.number,
    occurrence: occurrence.occurrence,
    occurrenceCount: occurrence.occurrenceCount
  })), [measureOccurrences]);
  const selectedStartIndex = measureLoopOptions.findIndex((option) => option.key === loopStartKey);
  const selectedEndIndex = measureLoopOptions.findIndex((option) => option.key === loopEndKey);
  const [reloadKey, setReloadKey] = useState(0);
  const [restoreReady, setRestoreReady] = useState(!initialSnapshot);

  useEffect(() => {
    if (state === "ready" && !restoreReady) return;
    onStatusChange?.(state, error ? localizePlayerError(error, language) : undefined);
  }, [error, language, onStatusChange, restoreReady, state]);

  useEffect(() => {
    onPlaybackChange?.(playback);
  }, [onPlaybackChange, playback]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !command) return;
    if (command.action === "pause") audio.pause();
    else {
      restoredPausedRef.current = false;
      audio.stop();
    }
  }, [command]);

  const applyHighlights = useCallback((ids: string[]) => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    for (const id of appliedActiveIdsRef.current) {
      const element = sheet.ownerDocument.getElementById(id);
      if (element && sheet.contains(element)) element.classList.remove("is-playing");
    }
    for (const id of ids) {
      const element = sheet.ownerDocument.getElementById(id);
      if (element && sheet.contains(element)) element.classList.add("is-playing");
    }
    appliedActiveIdsRef.current = ids;
  }, []);

  const highlightMeasure = useCallback((measureId?: string) => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const previous = highlightedMeasureRef.current && sheet.ownerDocument.getElementById(highlightedMeasureRef.current);
    if (previous && sheet.contains(previous)) {
      previous.classList.remove("is-current-measure");
      previous.removeAttribute("aria-current");
    }
    const current = measureId && sheet.ownerDocument.getElementById(measureId);
    if (current && sheet.contains(current)) {
      current.classList.add("is-current-measure");
      current.setAttribute("aria-current", "true");
    }
    highlightedMeasureRef.current = measureId;
  }, []);

  const scrollToMeasure = useCallback((measureId?: string) => {
    if (!measureId || appliedMeasureRef.current === measureId) return;
    const sheet = sheetRef.current;
    const measure = sheet?.ownerDocument.getElementById(measureId);
    if (!sheet || !measure || !sheet.contains(measure)) return;

    // Scroll only the score viewport. Element.scrollIntoView() also scrolls the
    // modal and can pull the close button off-screen while playback is running.
    const sheetRect = sheet.getBoundingClientRect();
    const measureRect = measure.getBoundingClientRect();
    const top = Math.max(
      0,
      sheet.scrollTop + measureRect.top - sheetRect.top - (sheet.clientHeight - measureRect.height) / 2
    );
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    // Animated scrolling competes with Verovio and the Web Audio scheduler on
    // iOS. During playback the audio clock wins; smooth scrolling remains
    // available while paused or stopped.
    const behavior = playbackStateRef.current === "playing" || reduceMotion ? "auto" : "smooth";
    if (typeof sheet.scrollTo === "function") {
      sheet.scrollTo({ top, behavior });
    } else {
      sheet.scrollTop = top;
    }
    appliedMeasureRef.current = measureId;
  }, []);

  const syncVisualAtTime = useCallback((positionMs: number) => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    try {
      const elements = renderer.getElementsAtTime(positionMs);
      const activeIds = [...elements.notes, ...elements.chords, ...elements.rests];
      desiredActiveIdsRef.current = activeIds;
      desiredMeasureRef.current = elements.measure ?? desiredMeasureRef.current;
      if (elements.page && elements.page !== pageRef.current) {
        pageRef.current = elements.page;
        const cachedSvg = pageSvgCacheRef.current.get(elements.page);
        const renderedSvg = cachedSvg ?? sanitizeScoreSvg(renderer.renderPage(elements.page), scoreName);
        if (!cachedSvg) pageSvgCacheRef.current.set(elements.page, renderedSvg);
        const nextSvg = localizeScoreSvgLabel(renderedSvg, languageRef.current);
        setPage(elements.page);
        setSvg(nextSvg);
        return;
      }
      applyHighlights(activeIds);
      highlightMeasure(elements.measure);
      scrollToMeasure(elements.measure);
    } catch {
      applyHighlights([]);
      highlightMeasure();
    }
  }, [applyHighlights, highlightMeasure, scoreName, scrollToMeasure]);

  const renderPage = useCallback((nextPage: number, targetMeasureId?: string) => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    try {
      desiredActiveIdsRef.current = [];
      desiredMeasureRef.current = targetMeasureId;
      applyHighlights([]);
      highlightMeasure();
      appliedMeasureRef.current = undefined;
      const cachedSvg = pageSvgCacheRef.current.get(nextPage);
      const renderedSvg = cachedSvg ?? sanitizeScoreSvg(renderer.renderPage(nextPage), scoreName);
      if (!cachedSvg) pageSvgCacheRef.current.set(nextPage, renderedSvg);
      const nextSvg = localizeScoreSvgLabel(renderedSvg, language);
      setSvg(nextSvg);
      pageRef.current = nextPage;
      setPage(nextPage);
      setError("");
    } catch (renderError) {
      setError(renderError instanceof Error ? renderError.message : playerCopy(language, "renderPageError"));
      setState("error");
    }
  }, [applyHighlights, highlightMeasure, language, scoreName]);

  useLayoutEffect(() => {
    // A page replacement creates new DOM nodes even if the measure ID is unchanged.
    appliedMeasureRef.current = undefined;
  }, [svg]);

  useLayoutEffect(() => {
    applyHighlights(desiredActiveIdsRef.current);
    highlightMeasure(desiredMeasureRef.current);
    scrollToMeasure(desiredMeasureRef.current);
  }, [applyHighlights, highlightMeasure, playback.positionMs, playback.state, scrollToMeasure, svg]);

  const readingSnapshot = useCallback((): PlayerSessionSnapshot["reading"] => {
    const sheet = sheetRef.current;
    const maxScroll = sheet ? Math.max(0, sheet.scrollHeight - sheet.clientHeight) : 0;
    const scrollRatio = sheet && maxScroll > 0 ? clamp(sheet.scrollTop / maxScroll, 0, 1) : 0;
    if (!sheet || sheet.clientHeight <= 0) return { page: pageRef.current, scrollRatio };

    const sheetRect = sheet.getBoundingClientRect();
    const measures = [...sheet.querySelectorAll<SVGElement>(".measure[id]")];
    const anchor = measures.find((measure) => measure.getBoundingClientRect().bottom >= sheetRect.top) ?? measures.at(-1);
    if (!anchor?.id || anchor.id.length > 128) return { page: pageRef.current, scrollRatio };
    const anchorViewportRatio = clamp((anchor.getBoundingClientRect().top - sheetRect.top) / sheet.clientHeight, -1, 1);
    return {
      page: pageRef.current,
      scrollRatio,
      anchorMeasureId: anchor.id,
      anchorViewportRatio
    };
  }, []);

  const reportReadingSnapshot = useCallback(() => {
    const snapshot = readingSnapshot();
    lastReadingSnapshotRef.current = snapshot;
    onReadingChange?.(snapshot);
  }, [onReadingChange, readingSnapshot]);

  useEffect(() => {
    if (state !== "ready" || !initialSnapshot || restoreReady) return;
    const renderer = rendererRef.current;
    const audio = audioRef.current;
    const savedPlayback = initialSnapshot.playback;
    if (audio) {
      const durationMs = audio.getSnapshot().durationMs;
      const positionMs = Math.min(savedPlayback.positionMs, durationMs);
      try {
        audio.setTempo(savedPlayback.tempo);
        audio.seek(positionMs);
      } catch {
        // A valid score still opens if its saved playback controls are stale.
      }
      const restoredPlayback = audio.getSnapshot();
      const shouldRetainPause = savedPlayback.state === "playing" || savedPlayback.state === "paused";
      restoredPausedRef.current = shouldRetainPause;
      playbackStateRef.current = shouldRetainPause ? "paused" : restoredPlayback.state;
      setPlayback({ ...restoredPlayback, state: playbackStateRef.current });
    }

    const savedReading = initialSnapshot.reading;
    lastReadingSnapshotRef.current = savedReading;
    let targetPage = Math.min(Math.max(1, savedReading.page), Math.max(1, pageCount));
    if (renderer && savedReading.anchorMeasureId) {
      try {
        targetPage = renderer.getPageForElement(savedReading.anchorMeasureId);
      } catch {
        // The page number and scroll fraction remain useful if an old anchor was removed.
      }
    }
    pendingReadingRestoreRef.current = savedReading;
    renderPage(targetPage);
    setRestoreReady(true);
  }, [initialSnapshot, pageCount, renderPage, restoreReady, state]);

  useLayoutEffect(() => {
    const savedReading = pendingReadingRestoreRef.current;
    const sheet = sheetRef.current;
    if (!savedReading || !sheet || !svg) return;
    applyReadingSnapshot(sheet, savedReading);
    pendingReadingRestoreRef.current = null;
  }, [page, restoreReady, state, svg]);

  useEffect(() => {
    if (state !== "ready" || !restoreReady) return;
    const sheet = sheetRef.current;
    if (!sheet) return;

    let previousSize = readSheetSize(sheet);
    let skippedInitialObserverNotification = false;
    const restoreAfterResize = () => {
      if (playbackStateRef.current === "playing") {
        const audio = audioRef.current;
        if (!audio) return;
        try {
          appliedMeasureRef.current = undefined;
          syncVisualAtTime(audio.positionMs());
        } catch {
          // The renderer can be between pages while the latest audio clock remains valid.
        }
        return;
      }
      applyReadingSnapshot(sheet, lastReadingSnapshotRef.current);
    };
    const observerConstructor = globalThis.ResizeObserver;
    if (typeof observerConstructor === "function") {
      const observer = new observerConstructor(() => {
        const nextSize = readSheetSize(sheet);
        if (!skippedInitialObserverNotification) {
          skippedInitialObserverNotification = true;
          previousSize = nextSize;
          return;
        }
        if (sameSheetSize(previousSize, nextSize)) return;
        previousSize = nextSize;
        restoreAfterResize();
      });
      observer.observe(sheet);
      return () => observer.disconnect();
    }

    const handleWindowResize = () => {
      const nextSize = readSheetSize(sheet);
      if (sameSheetSize(previousSize, nextSize)) return;
      previousSize = nextSize;
      restoreAfterResize();
    };
    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, [restoreReady, state, syncVisualAtTime]);

  useEffect(() => {
    let cancelled = false;
    let pendingRenderer: VerovioScoreRenderer | null = null;
    let pendingAudio: WebAudioMidiEngine | null = null;

    unsubscribeAudioRef.current?.();
    unsubscribeAudioRef.current = null;
    rendererRef.current?.destroy();
    rendererRef.current = null;
    void audioRef.current?.dispose();
    audioRef.current = null;
    applyHighlights([]);
    highlightMeasure();
    desiredActiveIdsRef.current = [];
    desiredMeasureRef.current = undefined;
    appliedMeasureRef.current = undefined;
    setState("loading");
    setError("");
    setAudioError("");
    setAudioAvailable(false);
    setMeasureOccurrences([]);
    setLoopStartKey("");
    setLoopEndKey("");
    setLoopEnabled(false);
    setLoopError("");
    lastReadingTargetKeyRef.current = "";
    playbackStateRef.current = "idle";
    pageSvgCacheRef.current.clear();
    lastPlaybackUiUpdateRef.current = null;
    setPlayback(INITIAL_PLAYBACK);
    pageRef.current = 1;
    setPage(1);
    setPageCount(0);
    setSvg("");

    void (async () => {
      try {
        const musicXmlSource = providedMusicXml !== undefined
          ? Promise.resolve(providedMusicXml)
          : scoreId
            ? fetchMusicXml(scoreId, previewOnly)
            : Promise.reject(new Error("Nenhuma partitura foi informada."));
        const [musicXml, scoreModule, audioModule] = await Promise.all([
          musicXmlSource,
          import("../score/index.js"),
          allowPlayback ? import("../audio/index.js") : Promise.resolve(null)
        ]);
        if (!musicXml.trim()) {
          if (!cancelled) setState("empty");
          return;
        }

        const tempoAssumedForScore = !hasExplicitTempo(musicXml);
        const playableMusicXml = applyDefaultTempo(musicXml);
        pendingRenderer = await scoreModule.createVerovioScoreRenderer(playableMusicXml);
        let hasPlaybackEvents = false;
        let initialTempo = DEFAULT_TEMPO_BPM;
        let nextMeasureOccurrences: PerformedMeasureOccurrence[] = [];
        let nextLoopError = "";
        if (audioModule) {
          try {
            const midi = audioModule.parseMidiPlayback(pendingRenderer.renderMidiBytes());
            const renderedDurationMs = pendingRenderer.getDurationMs();
            initialTempo = tempoAssumedForScore ? DEFAULT_TEMPO_BPM : midi.initialTempoBpm || DEFAULT_TEMPO_BPM;
            pendingAudio = new audioModule.WebAudioMidiEngine({ baseTempoBpm: initialTempo, instrument: "piano" });
            pendingAudio.load(midi.events, Math.max(midi.durationMs, renderedDurationMs));
            hasPlaybackEvents = midi.events.length > 0;
          } catch (midiError) {
            await pendingAudio?.dispose();
            pendingAudio = null;
            // A playback failure must not hide the notation needed to review the score.
            if (!cancelled) setAudioError(midiError instanceof Error ? midiError.message : playerCopy(languageRef.current, "genericAudioError"));
          }
        }
        if (audioModule && pendingAudio) {
          try {
            nextMeasureOccurrences = pendingRenderer.getMeasureOccurrences();
          } catch (measureError) {
            nextLoopError = measureError instanceof Error
              ? measureError.message
              : playerCopy(languageRef.current, "measureLoopUnavailable");
          }
        }

        if (cancelled) {
          pendingRenderer.destroy();
          await pendingAudio?.dispose();
          return;
        }

        rendererRef.current = pendingRenderer;
        audioRef.current = pendingAudio;
        setBaseTempoBpm(initialTempo);
        setTempoAssumed(tempoAssumedForScore);
        setAudioAvailable(hasPlaybackEvents);
        setMeasureOccurrences(nextMeasureOccurrences);
        setLoopStartKey("");
        setLoopEndKey("");
        setLoopEnabled(false);
        setLoopError(nextLoopError);
        const renderedInitialSvg = sanitizeScoreSvg(pendingRenderer.renderPage(1), scoreName);
        pageSvgCacheRef.current.set(1, renderedInitialSvg);
        const initialSvg = localizeScoreSvgLabel(renderedInitialSvg, languageRef.current);
        setPageCount(pendingRenderer.pageCount);
        setSvg(initialSvg);
        if (pendingAudio) {
          unsubscribeAudioRef.current = pendingAudio.subscribe((snapshot) => {
            if (cancelled) return;
            const effectiveSnapshot = restoredPausedRef.current && snapshot.state === "idle"
              ? { ...snapshot, state: "paused" as const }
              : snapshot;
            playbackStateRef.current = effectiveSnapshot.state;
            const previous = lastPlaybackUiUpdateRef.current;
            const shouldUpdateUi = previous === null
              || effectiveSnapshot.state !== "playing"
              || previous.state !== "playing"
              || effectiveSnapshot.positionMs < previous.positionMs
              || snapshot.positionMs - previous.positionMs >= PLAYBACK_UI_UPDATE_INTERVAL_MS;
            if (!shouldUpdateUi) return;
            lastPlaybackUiUpdateRef.current = {
              positionMs: effectiveSnapshot.positionMs,
              state: effectiveSnapshot.state
            };
            setPlayback(effectiveSnapshot);
            if (effectiveSnapshot.state === "ended") {
              desiredActiveIdsRef.current = [];
              desiredMeasureRef.current = undefined;
              applyHighlights([]);
              highlightMeasure();
            } else syncVisualAtTime(effectiveSnapshot.positionMs);
          });
        }
        setState("ready");
      } catch (loadError) {
        pendingRenderer?.destroy();
        await pendingAudio?.dispose();
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : playerCopy(languageRef.current, "genericLoadError"));
        setState("error");
      }
    })();

    return () => {
      cancelled = true;
      unsubscribeAudioRef.current?.();
      unsubscribeAudioRef.current = null;
      rendererRef.current?.destroy();
      rendererRef.current = null;
      void audioRef.current?.dispose();
      audioRef.current = null;
      applyHighlights([]);
      highlightMeasure();
    };
  }, [allowPlayback, applyHighlights, highlightMeasure, previewOnly, providedMusicXml, reloadKey, scoreId, scoreName, scoreRevision, syncVisualAtTime]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!loopEnabled) {
      if (audio.getLoopRange()) audio.setLoopRange(null);
      return;
    }
    const start = measureOccurrences[selectedStartIndex];
    const end = measureOccurrences[selectedEndIndex];
    if (!start || !end || selectedEndIndex < selectedStartIndex) {
      audio.setLoopRange(null);
      return;
    }
    try {
      audio.setLoopRange({ startMs: start.startMs, endMs: end.endMs });
      setLoopError("");
    } catch (rangeError) {
      setLoopEnabled(false);
      setLoopError(rangeError instanceof Error ? rangeError.message : playerCopy(language, "measureLoopUnavailable"));
    }
  }, [language, loopEnabled, measureOccurrences, selectedEndIndex, selectedStartIndex, state]);

  useEffect(() => {
    if (state !== "ready" || !readingTarget?.id) return;
    const targetKey = `${scoreRevision ?? ""}:${readingTarget.id}:${readingTarget.page ?? ""}:${readingTarget.measure ?? ""}`;
    if (lastReadingTargetKeyRef.current === targetKey) return;
    lastReadingTargetKeyRef.current = targetKey;
    const renderer = rendererRef.current;
    if (!renderer) return;

    let targetMeasureId: string | undefined;
    let targetPage = readingTarget.page;
    try {
      targetMeasureId = renderer.getMeasureForElement(readingTarget.id);
      targetPage ??= renderer.getPageForElement(readingTarget.id);
    } catch {
      // Review targets can refer to source segments that do not have a Verovio ID.
    }
    if (!targetMeasureId && readingTarget.measure) {
      const matchingOccurrence = measureOccurrences.find((occurrence) => occurrence.number === readingTarget.measure);
      targetMeasureId = matchingOccurrence?.id;
      if (!targetPage && targetMeasureId) {
        try {
          targetPage = renderer.getPageForElement(targetMeasureId);
        } catch {
          // A page supplied by the caller can still be used without a measure highlight.
        }
      }
    }
    if (targetPage && targetPage >= 1 && targetPage <= renderer.pageCount) {
      renderPage(targetPage, targetMeasureId);
    } else if (targetMeasureId) {
      try {
        renderPage(renderer.getPageForElement(targetMeasureId), targetMeasureId);
      } catch {
        // Leave the current page in place when the location cannot be resolved.
      }
    }
  }, [measureOccurrences, readingTarget?.id, readingTarget?.measure, readingTarget?.page, renderPage, scoreRevision, state]);

  useEffect(() => {
    if (state === "ready" && restoreReady) reportReadingSnapshot();
  }, [page, reportReadingSnapshot, restoreReady, state, svg]);

  useEffect(() => {
    const scoreSvg = sheetRef.current?.querySelector("svg");
    const currentLabel = scoreSvg?.getAttribute("aria-label");
    if (!scoreSvg || !currentLabel) return;
    const scoreTitle = currentLabel.replace(/^(?:Partitura digital|Digital score):\s*/, "");
    scoreSvg.setAttribute("aria-label", `${playerCopy(language, "scoreLabel")}: ${scoreTitle}`);
  }, [language, page, svg]);

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    setAudioError("");
    try {
      if (playback.state === "playing") audio.pause();
      else if (playback.state === "paused") {
        if (restoredPausedRef.current) {
          restoredPausedRef.current = false;
          await audio.play(undefined, audio.positionMs());
        } else await audio.resume();
      }
      else await audio.play();
    } catch (playError) {
      setAudioError(playError instanceof Error ? playError.message : playerCopy(language, "genericStartError"));
    }
  }

  function restartPlayback() {
    restoredPausedRef.current = false;
    audioRef.current?.stop();
    syncVisualAtTime(0);
  }

  function seekPlayback(positionMs: number) {
    lastPlaybackUiUpdateRef.current = null;
    audioRef.current?.seek(positionMs);
    if (restoredPausedRef.current && audioRef.current) {
      setPlayback({ ...audioRef.current.getSnapshot(), state: "paused" });
    }
    syncVisualAtTime(positionMs);
  }

  function changeTempo(tempoBpm: number) {
    try {
      audioRef.current?.setTempo(tempoBpm);
      setAudioError("");
    } catch (tempoError) {
      setAudioError(tempoError instanceof Error ? tempoError.message : playerCopy(language, "genericTempoError"));
    }
  }

  if (state === "loading") {
    return (
      <div className="score-player-state score-player-loading" role="status" aria-live="polite">
        <span className="score-skeleton score-skeleton-heading" />
        <span className="score-skeleton score-skeleton-staff" />
        <span className="score-skeleton score-skeleton-staff" />
        <span>{playerCopy(language, "loading")}</span>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="score-player-state score-player-error" role="alert">
        <FileWarning aria-hidden="true" size={26} />
        <div>
            <strong>{playerCopy(language, "renderErrorTitle")}</strong>
            <p>{localizePlayerError(error, language)}</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => setReloadKey((current) => current + 1)}>
          <RefreshCw aria-hidden="true" size={17} /> {playerCopy(language, "retry")}
        </button>
      </div>
    );
  }

  if (state === "empty") {
    return (
      <div className="score-player-state score-player-empty" role="status">
        <FileWarning aria-hidden="true" size={26} />
        <div>
          <strong>{playerCopy(language, "emptyTitle")}</strong>
          <p>{playerCopy(language, "emptyMessage")}</p>
        </div>
      </div>
    );
  }

  const controlState: PlaybackState = playback.state === "playing"
    ? "playing"
    : playback.state === "paused"
      ? "paused"
      : "stopped";
  const tempoMin = Math.max(20, Math.ceil(baseTempoBpm * 0.25));
  const tempoMax = Math.min(400, Math.floor(baseTempoBpm * 4));

  return (
    <section className="score-player" aria-label={playerCopy(language, "viewer")} tabIndex={0}>
      {allowPlayback ? <PlaybackControls
        language={language}
        state={controlState}
        positionMs={playback.positionMs}
        durationMs={playback.durationMs}
        tempoBpm={Math.round(playback.tempo)}
        tempoMin={tempoMin}
        tempoMax={tempoMax}
        tempoAssumed={tempoAssumed}
        disabled={!audioAvailable}
        onPlayPause={() => void togglePlayback()}
        onRestart={restartPlayback}
        onSeek={seekPlayback}
        onTempoChange={changeTempo}
      /> : <p className="playback-message">{playerCopy(language, "playbackUnavailable")}</p>}
      {allowPlayback && <MeasureLoopControls
        language={language}
        options={measureLoopOptions}
        selectedStart={loopStartKey}
        selectedEnd={loopEndKey}
        enabled={loopEnabled}
        disabled={state !== "ready" || !audioAvailable}
        error={loopError ? localizePlayerError(loopError, language, "measureLoopUnavailable") : undefined}
        onEnabledChange={(enabled) => {
          if (enabled && measureLoopOptions.length > 0) {
            setLoopStartKey((current) => current || measureLoopOptions[0].key);
            setLoopEndKey((current) => current || measureLoopOptions.at(-1)!.key);
          }
          setLoopEnabled(enabled);
        }}
        onStartChange={(key) => {
          const nextStartIndex = measureLoopOptions.findIndex((option) => option.key === key);
          setLoopStartKey(key);
          if (selectedEndIndex < nextStartIndex) setLoopEndKey(key);
        }}
        onEndChange={setLoopEndKey}
        onClear={() => {
          audioRef.current?.setLoopRange(null);
          setLoopEnabled(false);
          setLoopStartKey("");
          setLoopEndKey("");
          setLoopError("");
        }}
      />}
      {allowPlayback && <p className="playback-message playback-guidance">{playerCopy(language, "playbackGuide")}</p>}
      {allowPlayback && !audioAvailable && !audioError && <p className="playback-message">{playerCopy(language, "noPlayableNotes")}</p>}
      {audioError && <p className="playback-message playback-message-error" role="alert">{localizePlayerError(audioError, language, "genericAudioError")}</p>}
      <div
        ref={sheetRef}
        className="score-sheet"
        role="region"
        aria-label={playerCopy(language, "sheet")}
        tabIndex={0}
        onScroll={reportReadingSnapshot}
        dangerouslySetInnerHTML={scoreSvgMarkup}
      />
      {pageCount > 1 && (
        <nav className="score-pagination" aria-label={playerCopy(language, "pages")}>
          <button className="secondary-button" type="button" disabled={playback.state === "playing" || page === 1} onClick={() => renderPage(page - 1)} aria-label={playerCopy(language, "previousPage")} title={playback.state === "playing" ? playerCopy(language, "pauseToNavigate") : undefined}>
            <ChevronLeft aria-hidden="true" size={18} /> {playerCopy(language, "previous")}
          </button>
          <span aria-live="polite">{playerPageLabel(language, page, pageCount)}</span>
          <button className="secondary-button" type="button" disabled={playback.state === "playing" || page === pageCount} onClick={() => renderPage(page + 1)} aria-label={playerCopy(language, "nextPage")} title={playback.state === "playing" ? playerCopy(language, "pauseToNavigate") : undefined}>
            {playerCopy(language, "next")} <ChevronRight aria-hidden="true" size={18} />
          </button>
        </nav>
      )}
    </section>
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function applyReadingSnapshot(sheet: HTMLElement, snapshot: PlayerSessionSnapshot["reading"]): void {
  const anchor = snapshot.anchorMeasureId
    ? sheet.ownerDocument.getElementById(snapshot.anchorMeasureId)
    : null;
  if (anchor && sheet.contains(anchor) && snapshot.anchorViewportRatio !== undefined) {
    const sheetRect = sheet.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const nextTop = sheet.scrollTop + anchorRect.top - sheetRect.top - snapshot.anchorViewportRatio * sheet.clientHeight;
    sheet.scrollTop = clamp(nextTop, 0, Math.max(0, sheet.scrollHeight - sheet.clientHeight));
  } else {
    sheet.scrollTop = snapshot.scrollRatio * Math.max(0, sheet.scrollHeight - sheet.clientHeight);
  }
}

function readSheetSize(sheet: HTMLElement): { width: number; height: number } {
  const rect = sheet.getBoundingClientRect();
  return {
    width: rect.width || sheet.clientWidth,
    height: rect.height || sheet.clientHeight
  };
}

function sameSheetSize(left: { width: number; height: number }, right: { width: number; height: number }): boolean {
  return Math.abs(left.width - right.width) < 0.5 && Math.abs(left.height - right.height) < 0.5;
}

function localizeScoreSvgLabel(svg: string, language: PlayerLanguage): string {
  const label = playerCopy(language, "scoreLabel");
  return svg.replace(/aria-label="(?:Partitura digital|Digital score): ([^"]*)"/, `aria-label="${label}: $1"`);
}

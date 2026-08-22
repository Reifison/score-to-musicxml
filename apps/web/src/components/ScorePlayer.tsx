import { ChevronLeft, ChevronRight, FileWarning, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { fetchMusicXml } from "../api/client.js";
import type { PlaybackSnapshot, WebAudioMidiEngine } from "../audio/index.js";
import { sanitizeScoreSvg } from "../score/sanitizeScoreSvg.js";
import { applyDefaultTempo, DEFAULT_TEMPO_BPM, hasExplicitTempo } from "../score/musicXmlTempo.js";
import type { VerovioScoreRenderer } from "../score/VerovioScoreRenderer.js";
import { PlaybackControls, type PlaybackState } from "./PlaybackControls.js";

export type ScorePlayerState = "loading" | "ready" | "empty" | "error";

export type ScorePlayerCommand = {
  id: number;
  action: "pause" | "stop";
};

type ScorePlayerProps = {
  scoreName: string;
  scoreId?: string;
  musicXml?: string;
  command?: ScorePlayerCommand;
  onStatusChange?: (state: ScorePlayerState, message?: string) => void;
  onPlaybackChange?: (snapshot: PlaybackSnapshot) => void;
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

export function ScorePlayer({
  scoreId,
  scoreName,
  musicXml: providedMusicXml,
  command,
  onStatusChange,
  onPlaybackChange
}: ScorePlayerProps) {
  const rendererRef = useRef<VerovioScoreRenderer | null>(null);
  const audioRef = useRef<WebAudioMidiEngine | null>(null);
  const unsubscribeAudioRef = useRef<(() => void) | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef(1);
  const desiredActiveIdsRef = useRef<string[]>([]);
  const appliedActiveIdsRef = useRef<string[]>([]);
  const desiredMeasureRef = useRef<string | undefined>(undefined);
  const appliedMeasureRef = useRef<string | undefined>(undefined);
  const [state, setState] = useState<ScorePlayerState>("loading");
  const [error, setError] = useState("");
  const [audioError, setAudioError] = useState("");
  const [audioAvailable, setAudioAvailable] = useState(false);
  const [tempoAssumed, setTempoAssumed] = useState(true);
  const [baseTempoBpm, setBaseTempoBpm] = useState(DEFAULT_TEMPO_BPM);
  const [playback, setPlayback] = useState<PlaybackSnapshot>(INITIAL_PLAYBACK);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [svg, setSvg] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    onStatusChange?.(state, error || undefined);
  }, [error, onStatusChange, state]);

  useEffect(() => {
    onPlaybackChange?.(playback);
  }, [onPlaybackChange, playback]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !command) return;
    if (command.action === "pause") audio.pause();
    else audio.stop();
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
    if (typeof sheet.scrollTo === "function") {
      sheet.scrollTo({ top, behavior: reduceMotion ? "auto" : "smooth" });
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
      const activeIds = [...elements.notes, ...elements.chords];
      desiredActiveIdsRef.current = activeIds;
      desiredMeasureRef.current = elements.measure ?? desiredMeasureRef.current;
      if (elements.page && elements.page !== pageRef.current) {
        pageRef.current = elements.page;
        setPage(elements.page);
        setSvg(sanitizeScoreSvg(renderer.renderPage(elements.page), scoreName));
        return;
      }
      applyHighlights(activeIds);
      scrollToMeasure(elements.measure);
    } catch {
      applyHighlights([]);
    }
  }, [applyHighlights, scoreName, scrollToMeasure]);

  const renderPage = useCallback((nextPage: number) => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    try {
      desiredActiveIdsRef.current = [];
      applyHighlights([]);
      setSvg(sanitizeScoreSvg(renderer.renderPage(nextPage), scoreName));
      pageRef.current = nextPage;
      setPage(nextPage);
      setError("");
    } catch (renderError) {
      setError(renderError instanceof Error ? renderError.message : "Não foi possível renderizar esta página.");
      setState("error");
    }
  }, [applyHighlights, scoreName]);

  useLayoutEffect(() => {
    applyHighlights(desiredActiveIdsRef.current);
    scrollToMeasure(desiredMeasureRef.current);
  }, [applyHighlights, playback.positionMs, scrollToMeasure, svg]);

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
    setState("loading");
    setError("");
    setAudioError("");
    setAudioAvailable(false);
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
            ? fetchMusicXml(scoreId)
            : Promise.reject(new Error("Nenhuma partitura foi informada."));
        const [musicXml, scoreModule, audioModule] = await Promise.all([
          musicXmlSource,
          import("../score/index.js"),
          import("../audio/index.js")
        ]);
        if (!musicXml.trim()) {
          if (!cancelled) setState("empty");
          return;
        }

        const tempoAssumedForScore = !hasExplicitTempo(musicXml);
        const playableMusicXml = applyDefaultTempo(musicXml);
        pendingRenderer = await scoreModule.createVerovioScoreRenderer(playableMusicXml);
        const midi = audioModule.parseMidiPlayback(pendingRenderer.renderMidiBytes());
        const renderedDurationMs = pendingRenderer.getDurationMs();
        const initialTempo = tempoAssumedForScore ? DEFAULT_TEMPO_BPM : midi.initialTempoBpm || DEFAULT_TEMPO_BPM;
        pendingAudio = new audioModule.WebAudioMidiEngine({ baseTempoBpm: initialTempo });
        pendingAudio.load(midi.events, Math.max(midi.durationMs, renderedDurationMs));

        if (cancelled) {
          pendingRenderer.destroy();
          await pendingAudio.dispose();
          return;
        }

        rendererRef.current = pendingRenderer;
        audioRef.current = pendingAudio;
        setBaseTempoBpm(initialTempo);
        setTempoAssumed(tempoAssumedForScore);
        setAudioAvailable(midi.events.length > 0);
        setPageCount(pendingRenderer.pageCount);
        setSvg(sanitizeScoreSvg(pendingRenderer.renderPage(1), scoreName));
        unsubscribeAudioRef.current = pendingAudio.subscribe((snapshot) => {
          if (cancelled) return;
          setPlayback(snapshot);
          syncVisualAtTime(snapshot.positionMs);
        });
        setState("ready");
      } catch (loadError) {
        pendingRenderer?.destroy();
        await pendingAudio?.dispose();
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : "Não foi possível abrir a partitura digital.");
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
    };
  }, [applyHighlights, providedMusicXml, reloadKey, scoreId, scoreName, syncVisualAtTime]);

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    setAudioError("");
    try {
      if (playback.state === "playing") audio.pause();
      else if (playback.state === "paused") await audio.resume();
      else await audio.play();
    } catch (playError) {
      setAudioError(playError instanceof Error ? playError.message : "Não foi possível iniciar o áudio.");
    }
  }

  function restartPlayback() {
    audioRef.current?.stop();
    syncVisualAtTime(0);
  }

  function seekPlayback(positionMs: number) {
    audioRef.current?.seek(positionMs);
    syncVisualAtTime(positionMs);
  }

  function changeTempo(tempoBpm: number) {
    try {
      audioRef.current?.setTempo(tempoBpm);
      setAudioError("");
    } catch (tempoError) {
      setAudioError(tempoError instanceof Error ? tempoError.message : "Não foi possível alterar o andamento.");
    }
  }

  if (state === "loading") {
    return (
      <div className="score-player-state score-player-loading" role="status" aria-live="polite">
        <span className="score-skeleton score-skeleton-heading" />
        <span className="score-skeleton score-skeleton-staff" />
        <span className="score-skeleton score-skeleton-staff" />
        <span>Preparando a partitura digital...</span>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="score-player-state score-player-error" role="alert">
        <FileWarning aria-hidden="true" size={26} />
        <div>
          <strong>Não foi possível mostrar a partitura digital</strong>
          <p>{error}</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => setReloadKey((current) => current + 1)}>
          <RefreshCw aria-hidden="true" size={17} /> Tentar novamente
        </button>
      </div>
    );
  }

  if (state === "empty") {
    return (
      <div className="score-player-state score-player-empty" role="status">
        <FileWarning aria-hidden="true" size={26} />
        <div>
          <strong>Partitura digital indisponível</strong>
          <p>O MusicXML desta partitura está vazio. Converta o arquivo novamente para gerar a visualização.</p>
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
    <section className="score-player" aria-label="Visualizador da partitura">
      <PlaybackControls
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
      />
      {!audioAvailable && <p className="playback-message">Esta partitura não contém notas reproduzíveis.</p>}
      {audioError && <p className="playback-message playback-message-error" role="alert">{audioError}</p>}
      <div
        ref={sheetRef}
        className="score-sheet"
        role="region"
        aria-label="Partitura rolável"
        tabIndex={0}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      {pageCount > 1 && (
        <nav className="score-pagination" aria-label="Páginas da partitura">
          <button className="secondary-button" type="button" disabled={playback.state === "playing" || page === 1} onClick={() => renderPage(page - 1)} aria-label="Página anterior" title={playback.state === "playing" ? "Pause para navegar manualmente" : undefined}>
            <ChevronLeft aria-hidden="true" size={18} /> Anterior
          </button>
          <span aria-live="polite">Página {page} de {pageCount}</span>
          <button className="secondary-button" type="button" disabled={playback.state === "playing" || page === pageCount} onClick={() => renderPage(page + 1)} aria-label="Próxima página" title={playback.state === "playing" ? "Pause para navegar manualmente" : undefined}>
            Próxima <ChevronRight aria-hidden="true" size={18} />
          </button>
        </nav>
      )}
    </section>
  );
}

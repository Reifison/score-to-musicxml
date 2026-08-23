import { Minimize2, Pause, Play, RotateCcw, SlidersHorizontal } from "lucide-react";
import { type Ref, useId, useState } from "react";

export type PlaybackState = "stopped" | "playing" | "paused";

type PlaybackControlsProps = {
  state: PlaybackState;
  positionMs: number;
  durationMs: number;
  tempoBpm: number;
  tempoMin?: number;
  tempoMax?: number;
  tempoAssumed: boolean;
  sampleStatus?: string;
  disabled?: boolean;
  immersive?: boolean;
  onPlayPause: () => void;
  onRestart: () => void;
  onSeek: (positionMs: number) => void;
  onTempoChange: (tempoBpm: number) => void;
  onExitImmersive?: () => void;
  exitButtonRef?: Ref<HTMLButtonElement>;
};

export function PlaybackControls({
  state,
  positionMs,
  durationMs,
  tempoBpm,
  tempoMin = 40,
  tempoMax = 240,
  tempoAssumed,
  sampleStatus,
  disabled = false,
  immersive = false,
  onPlayPause,
  onRestart,
  onSeek,
  onTempoChange,
  onExitImmersive,
  exitButtonRef
}: PlaybackControlsProps) {
  const isPlaying = state === "playing";
  const safeDuration = Math.max(0, durationMs);
  const safePosition = Math.min(Math.max(0, positionMs), safeDuration);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsId = useId();

  return (
    <div className={`playback-controls${immersive ? " playback-controls-immersive" : ""}`} aria-label="Controles de reprodução">
      <div className="playback-transport">
        <button className="play-button" type="button" onClick={onPlayPause} disabled={disabled} aria-label={isPlaying ? "Pausar partitura" : state === "paused" ? "Continuar partitura" : "Reproduzir partitura"}>
          {isPlaying ? <Pause aria-hidden="true" size={20} /> : <Play aria-hidden="true" size={20} fill="currentColor" />}
          <span>{isPlaying ? "Pausar" : state === "paused" ? "Continuar" : "Reproduzir"}</span>
        </button>
        <button className="secondary-button" type="button" onClick={onRestart} disabled={state === "stopped" && safePosition === 0} aria-label="Reiniciar partitura">
          <RotateCcw aria-hidden="true" size={18} /> <span>Reiniciar</span>
        </button>
        <button
          className="secondary-button playback-details-toggle"
          type="button"
          aria-label={detailsOpen ? "Ocultar ajustes" : "Ajustes"}
          aria-expanded={detailsOpen}
          aria-controls={detailsId}
          onClick={() => setDetailsOpen((open) => !open)}
        >
          <SlidersHorizontal aria-hidden="true" size={18} /> <span>{detailsOpen ? "Ocultar ajustes" : "Ajustes"}</span>
        </button>
      </div>
      {immersive && onExitImmersive && (
        <button ref={exitButtonRef} aria-label="Sair da tela cheia" className="secondary-button playback-exit-immersive" type="button" onClick={onExitImmersive}>
          <Minimize2 aria-hidden="true" size={18} /> <span>Sair da tela cheia</span>
        </button>
      )}
      <div id={detailsId} className="playback-details" hidden={!detailsOpen}>
        <label className="playback-progress">
          <span className="sr-only">Posição da reprodução</span>
          <input
            type="range"
            min={0}
            max={Math.max(1, safeDuration)}
            step={100}
            value={safePosition}
            disabled={disabled}
            onChange={(event) => onSeek(Number(event.target.value))}
            aria-label="Posição da reprodução"
            aria-valuetext={`${formatTime(safePosition)} de ${formatTime(safeDuration)}`}
          />
          <span aria-live="off">{formatTime(safePosition)} / {formatTime(safeDuration)}</span>
        </label>

        <label className="tempo-control">
          <span>Andamento</span>
          <input
            type="range"
            min={tempoMin}
            max={tempoMax}
            step={1}
            value={tempoBpm}
            disabled={disabled}
            onChange={(event) => onTempoChange(Number(event.target.value))}
            aria-label="Andamento"
          />
          <output>{tempoBpm} BPM{tempoAssumed ? " · assumido" : ""}</output>
        </label>

        <p className="sample-credit" aria-live="polite">
          {sampleStatus ?? "Piano digital ativo."}
        </p>
      </div>
    </div>
  );
}

export function formatTime(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

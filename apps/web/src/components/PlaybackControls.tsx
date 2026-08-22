import { Pause, Play, RotateCcw } from "lucide-react";

export type PlaybackState = "stopped" | "playing" | "paused";

export function PlaybackControls({
  state,
  positionMs,
  durationMs,
  tempoBpm,
  tempoMin = 40,
  tempoMax = 240,
  tempoAssumed,
  disabled = false,
  onPlayPause,
  onRestart,
  onSeek,
  onTempoChange
}: {
  state: PlaybackState;
  positionMs: number;
  durationMs: number;
  tempoBpm: number;
  tempoMin?: number;
  tempoMax?: number;
  tempoAssumed: boolean;
  disabled?: boolean;
  onPlayPause: () => void;
  onRestart: () => void;
  onSeek: (positionMs: number) => void;
  onTempoChange: (tempoBpm: number) => void;
}) {
  const isPlaying = state === "playing";
  const safeDuration = Math.max(0, durationMs);
  const safePosition = Math.min(Math.max(0, positionMs), safeDuration);

  return (
    <div className="playback-controls" aria-label="Controles de reprodução">
      <div className="playback-transport">
        <button className="play-button" type="button" onClick={onPlayPause} disabled={disabled} aria-label={isPlaying ? "Pausar partitura" : state === "paused" ? "Continuar partitura" : "Reproduzir partitura"}>
          {isPlaying ? <Pause aria-hidden="true" size={20} /> : <Play aria-hidden="true" size={20} fill="currentColor" />}
          <span>{isPlaying ? "Pausar" : state === "paused" ? "Continuar" : "Reproduzir"}</span>
        </button>
        <button className="secondary-button" type="button" onClick={onRestart} disabled={state === "stopped" && safePosition === 0} aria-label="Reiniciar partitura">
          <RotateCcw aria-hidden="true" size={18} /> Reiniciar
        </button>
      </div>

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
      <p className="playback-timbre">Timbre: piano digital básico</p>
    </div>
  );
}

export function formatTime(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

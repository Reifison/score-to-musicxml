import { Pause, Play, RotateCcw } from "lucide-react";
import { playerCopy, type PlayerLanguage } from "../i18n/player.js";

export type PlaybackState = "stopped" | "playing" | "paused";

type PlaybackControlsProps = {
  language?: PlayerLanguage;
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
};

export function PlaybackControls({
  language = "pt",
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
}: PlaybackControlsProps) {
  const isPlaying = state === "playing";
  const safeDuration = Math.max(0, durationMs);
  const safePosition = Math.min(Math.max(0, positionMs), safeDuration);

  return (
    <div className="playback-controls" aria-label={playerCopy(language, "playbackControls")}>
      <div className="playback-transport">
        <button className="play-button" type="button" onClick={onPlayPause} disabled={disabled} aria-label={isPlaying ? playerCopy(language, "pauseScore") : state === "paused" ? playerCopy(language, "continueScore") : playerCopy(language, "playScore")}>
          {isPlaying ? <Pause aria-hidden="true" size={20} /> : <Play aria-hidden="true" size={20} fill="currentColor" />}
          <span>{isPlaying ? playerCopy(language, "pause") : state === "paused" ? playerCopy(language, "continue") : playerCopy(language, "play")}</span>
        </button>
        <button className="secondary-button" type="button" onClick={onRestart} disabled={state === "stopped" && safePosition === 0} aria-label={playerCopy(language, "restartScore")}>
          <RotateCcw aria-hidden="true" size={18} /> {playerCopy(language, "restart")}
        </button>
      </div>

      <label className="playback-progress">
        <span className="sr-only">{playerCopy(language, "playbackPosition")}</span>
        <input
          type="range"
          min={0}
          max={Math.max(1, safeDuration)}
          step={100}
          value={safePosition}
          disabled={disabled}
          onChange={(event) => onSeek(Number(event.target.value))}
          aria-label={playerCopy(language, "playbackPosition")}
          aria-valuetext={`${formatTime(safePosition)} ${playerCopy(language, "of")} ${formatTime(safeDuration)}`}
        />
        <span aria-live="off">{formatTime(safePosition)} / {formatTime(safeDuration)}</span>
      </label>

      <label className="tempo-control">
        <span>{playerCopy(language, "tempo")}</span>
        <input
          type="range"
          min={tempoMin}
          max={tempoMax}
          step={1}
          value={tempoBpm}
          disabled={disabled}
          onChange={(event) => onTempoChange(Number(event.target.value))}
          aria-label={playerCopy(language, "tempo")}
        />
        <output>{tempoBpm} BPM{tempoAssumed ? ` · ${playerCopy(language, "assumed")}` : ""}</output>
      </label>


    </div>
  );
}

export function formatTime(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

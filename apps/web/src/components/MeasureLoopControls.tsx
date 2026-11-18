import { Repeat2, X } from "lucide-react";
import { playerCopy, type PlayerLanguage } from "../i18n/player.js";
import "./MeasureLoopControls.css";

export type MeasureLoopOption = {
  key: string;
  position: number;
  number: string;
  occurrence: number;
  occurrenceCount: number;
};

type MeasureLoopControlsProps = {
  language: PlayerLanguage;
  options: MeasureLoopOption[];
  selectedStart: string;
  selectedEnd: string;
  enabled: boolean;
  disabled?: boolean;
  error?: string;
  onEnabledChange: (enabled: boolean) => void;
  onStartChange: (key: string) => void;
  onEndChange: (key: string) => void;
  onClear: () => void;
};

export function MeasureLoopControls({
  language,
  options,
  selectedStart,
  selectedEnd,
  enabled,
  disabled = false,
  error,
  onEnabledChange,
  onStartChange,
  onEndChange,
  onClear
}: MeasureLoopControlsProps) {
  const canEnable = !disabled && !error && options.length > 0;
  const startIndex = options.findIndex((option) => option.key === selectedStart);
  const endOptions = startIndex >= 0 ? options.slice(startIndex) : [];

  return (
    <section className="measure-loop-controls" aria-label={playerCopy(language, "measureLoopLabel")}>
      <div className="measure-loop-heading">
        <button
          className="measure-loop-toggle"
          type="button"
          aria-pressed={enabled}
          disabled={!canEnable && !enabled}
          onClick={() => onEnabledChange(!enabled)}
        >
          <Repeat2 aria-hidden="true" size={17} />
          <span>{playerCopy(language, "measureLoopLabel")}</span>
          <span className={`measure-loop-switch${enabled ? " is-on" : ""}`} aria-hidden="true"><span /></span>
        </button>
        {(enabled || selectedStart || selectedEnd) && (
          <button className="measure-loop-clear" type="button" disabled={disabled} onClick={onClear}>
            <X aria-hidden="true" size={16} /> {playerCopy(language, "measureLoopClear")}
          </button>
        )}
      </div>

      {enabled && !error && options.length > 0 && (
        <div className="measure-loop-selects">
          <label>
            <span>{playerCopy(language, "measureLoopStart")}</span>
            <select value={selectedStart} disabled={disabled} onChange={(event) => onStartChange(event.target.value)}>
              <option value="">{playerCopy(language, "measureLoopChooseStart")}</option>
              {options.map((option) => <option key={option.key} value={option.key}>{formatMeasureOption(language, option)}</option>)}
            </select>
          </label>
          <label>
            <span>{playerCopy(language, "measureLoopEnd")}</span>
            <select value={selectedEnd} disabled={disabled || startIndex < 0} onChange={(event) => onEndChange(event.target.value)}>
              <option value="">{playerCopy(language, "measureLoopChooseEnd")}</option>
              {endOptions.map((option) => <option key={option.key} value={option.key}>{formatMeasureOption(language, option)}</option>)}
            </select>
          </label>
        </div>
      )}

      {error && <p className="measure-loop-error" role="status">{error}</p>}
    </section>
  );
}

function formatMeasureOption(language: PlayerLanguage, option: MeasureLoopOption): string {
  const measure = playerCopy(language, "measureLoopMeasure");
  const printedNumber = option.number
    ? `${measure} ${option.number}`
    : `${playerCopy(language, "measureLoopUnnumbered")} · ${playerCopy(language, "measureLoopPosition")} ${option.position}`;
  if (option.occurrenceCount > 1) {
    return language === "en"
      ? `${printedNumber} · ${playerCopy(language, "measureLoopOccurrence")} ${option.occurrence} of ${option.occurrenceCount}`
      : `${printedNumber} · ${playerCopy(language, "measureLoopOccurrence")} ${option.occurrence} de ${option.occurrenceCount}`;
  }
  return printedNumber;
}

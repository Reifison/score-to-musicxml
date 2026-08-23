import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { formatTime, PlaybackControls } from "./PlaybackControls.js";

describe("PlaybackControls", () => {
  it("oferece transporte, progresso e andamento acessíveis", () => {
    const onPlayPause = vi.fn();
    const onSeek = vi.fn();
    const onTempoChange = vi.fn();
    const onInstrumentChange = vi.fn();

    render(
      <PlaybackControls
        state="paused"
        positionMs={1_500}
        durationMs={4_000}
        tempoBpm={70}
        tempoAssumed
        instrument="piano"
        onPlayPause={onPlayPause}
        onRestart={vi.fn()}
        onSeek={onSeek}
        onTempoChange={onTempoChange}
        onInstrumentChange={onInstrumentChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Continuar partitura" }));
    fireEvent.change(screen.getByRole("slider", { name: "Posição da reprodução" }), { target: { value: "2500" } });
    fireEvent.change(screen.getByRole("slider", { name: "Andamento" }), { target: { value: "96" } });
    fireEvent.click(screen.getByRole("button", { name: "Violão" }));

    expect(onPlayPause).toHaveBeenCalledOnce();
    expect(onSeek).toHaveBeenCalledWith(2_500);
    expect(onTempoChange).toHaveBeenCalledWith(96);
    expect(onInstrumentChange).toHaveBeenCalledWith("guitar");
    expect(screen.getByRole("button", { name: "Piano" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Violão" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("70 BPM · assumido")).toBeInTheDocument();
  });

  it("mantém piano como timbre padrão e expõe o grupo de escolha", () => {
    render(
      <PlaybackControls
        state="stopped"
        positionMs={0}
        durationMs={4_000}
        tempoBpm={70}
        tempoAssumed
        onPlayPause={vi.fn()}
        onRestart={vi.fn()}
        onSeek={vi.fn()}
        onTempoChange={vi.fn()}
      />
    );

    expect(screen.getByRole("group", { name: "Escolha o timbre" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Piano" })).toHaveAttribute("aria-pressed", "true");
  });

  it("formata a duração sem exibir valores negativos", () => {
    expect(formatTime(-1)).toBe("0:00");
    expect(formatTime(65_999)).toBe("1:05");
  });
});

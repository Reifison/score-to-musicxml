import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { formatTime, PlaybackControls } from "./PlaybackControls.js";

describe("PlaybackControls", () => {
  it("oferece transporte, progresso e andamento acessíveis", () => {
    const onPlayPause = vi.fn();
    const onSeek = vi.fn();
    const onTempoChange = vi.fn();

    render(
      <PlaybackControls
        state="paused"
        positionMs={1_500}
        durationMs={4_000}
        tempoBpm={70}
        tempoAssumed
        onPlayPause={onPlayPause}
        onRestart={vi.fn()}
        onSeek={onSeek}
        onTempoChange={onTempoChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Continuar partitura" }));
    const progressSlider = screen.getByRole("slider", { name: "Posição da reprodução" });
    expect(progressSlider).toHaveAttribute("aria-valuetext", "0:01 de 0:04");
    fireEvent.change(progressSlider, { target: { value: "2500" } });
    fireEvent.change(screen.getByRole("slider", { name: "Andamento" }), { target: { value: "96" } });

    expect(onPlayPause).toHaveBeenCalledOnce();
    expect(onSeek).toHaveBeenCalledWith(2_500);
    expect(onTempoChange).toHaveBeenCalledWith(96);
    expect(screen.getByText("70 BPM · assumido")).toBeInTheDocument();
  });

  it("não exibe escolha de timbre nem textos técnicos no player", () => {
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

    expect(screen.queryByRole("group", { name: "Escolha o timbre" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Timbres|Salamander|Shinyguitar|CC BY|CC0/)).not.toBeInTheDocument();
  });

  it("localiza os rótulos acessíveis do andamento e da posição em inglês", () => {
    render(
      <PlaybackControls
        language="en"
        state="playing"
        positionMs={1_500}
        durationMs={4_000}
        tempoBpm={70}
        tempoAssumed
        onPlayPause={vi.fn()}
        onRestart={vi.fn()}
        onSeek={vi.fn()}
        onTempoChange={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Pause score" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Playback position" })).toHaveAttribute("aria-valuetext", "0:01 of 0:04");
    expect(screen.getByRole("slider", { name: "Tempo" })).toBeInTheDocument();
    expect(screen.getByText("70 BPM · assumed")).toBeInTheDocument();
  });

  it("formata a duração sem exibir valores negativos", () => {
    expect(formatTime(-1)).toBe("0:00");
    expect(formatTime(65_999)).toBe("1:05");
  });
});

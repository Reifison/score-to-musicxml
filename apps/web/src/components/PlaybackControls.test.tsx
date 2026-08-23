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
    fireEvent.click(screen.getByRole("button", { name: "Ajustes" }));
    fireEvent.change(screen.getByRole("slider", { name: "Posição da reprodução" }), { target: { value: "2500" } });
    fireEvent.change(screen.getByRole("slider", { name: "Andamento" }), { target: { value: "96" } });

    expect(onPlayPause).toHaveBeenCalledOnce();
    expect(onSeek).toHaveBeenCalledWith(2_500);
    expect(onTempoChange).toHaveBeenCalledWith(96);
    expect(screen.getByText("70 BPM · assumido")).toBeInTheDocument();
  });

  it("mantém o piano fixo e deixa ajustes recolhidos inicialmente", () => {
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

    expect(screen.getByRole("button", { name: "Ajustes" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("slider", { name: "Posição da reprodução" })).not.toBeInTheDocument();
    expect(screen.queryByText("Timbre")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Violão" })).not.toBeInTheDocument();
  });

  it("oferece saída clara na barra do modo imersivo", () => {
    const onExitImmersive = vi.fn();
    render(
      <PlaybackControls
        state="stopped"
        positionMs={0}
        durationMs={4_000}
        tempoBpm={70}
        tempoAssumed
        immersive
        onPlayPause={vi.fn()}
        onRestart={vi.fn()}
        onSeek={vi.fn()}
        onTempoChange={vi.fn()}
        onExitImmersive={onExitImmersive}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Sair da tela cheia" }));
    expect(onExitImmersive).toHaveBeenCalledOnce();
  });

  it("formata a duração sem exibir valores negativos", () => {
    expect(formatTime(-1)).toBe("0:00");
    expect(formatTime(65_999)).toBe("1:05");
  });
});

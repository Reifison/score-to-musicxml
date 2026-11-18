import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MeasureLoopControls, type MeasureLoopOption } from "./MeasureLoopControls.js";

const options: MeasureLoopOption[] = [
  { key: "m0", position: 1, number: "0", occurrence: 1, occurrenceCount: 1 },
  { key: "m1-a", position: 2, number: "1", occurrence: 1, occurrenceCount: 2 },
  { key: "m1-b", position: 3, number: "1", occurrence: 2, occurrenceCount: 2 },
  { key: "m2", position: 4, number: "2", occurrence: 1, occurrenceCount: 1 },
  { key: "unprinted", position: 5, number: "", occurrence: 1, occurrenceCount: 1 }
];

describe("MeasureLoopControls", () => {
  it("identifies repeated printed measures and prevents an end before the start", () => {
    const onEnabledChange = vi.fn();
    const onStartChange = vi.fn();
    const onClear = vi.fn();
    render(
      <MeasureLoopControls
        language="pt"
        options={options}
        selectedStart="m1-b"
        selectedEnd="m2"
        enabled
        onEnabledChange={onEnabledChange}
        onStartChange={onStartChange}
        onEndChange={vi.fn()}
        onClear={onClear}
      />
    );

    const toggle = screen.getByRole("button", { name: "Repetir trecho" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("option", { name: "Compasso 1 · execução 1 de 2" })).toBeInTheDocument();
    expect(screen.getAllByRole("option", { name: "Compasso 1 · execução 2 de 2" })).toHaveLength(2);
    expect(screen.getAllByRole("option", { name: "Compasso sem número · posição 5" })).toHaveLength(2);
    const endSelect = screen.getByRole("combobox", { name: "Compasso final" });
    expect(within(endSelect).queryByRole("option", { name: "Compasso 0" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Limpar trecho" }));
    fireEvent.click(toggle);

    expect(onClear).toHaveBeenCalledOnce();
    expect(onEnabledChange).toHaveBeenCalledWith(false);
  });

  it("uses English labels and disables unavailable measure boundaries", () => {
    render(
      <MeasureLoopControls
        language="en"
        options={[]}
        selectedStart=""
        selectedEnd=""
        enabled={false}
        disabled
        error="Could not identify measure boundaries."
        onEnabledChange={vi.fn()}
        onStartChange={vi.fn()}
        onEndChange={vi.fn()}
        onClear={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Repeat section" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Could not identify measure boundaries.");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});

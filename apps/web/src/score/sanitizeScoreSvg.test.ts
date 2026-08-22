import { describe, expect, it } from "vitest";
import { sanitizeScoreSvg } from "./sanitizeScoreSvg.js";

describe("sanitizeScoreSvg", () => {
  it("remove conteúdo executável e preserva ids, classes e glifos internos", () => {
    const unsafe = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" onload="alert(1)">
        <script>alert(1)</script>
        <foreignObject><iframe src="https://example.com"></iframe></foreignObject>
        <g id="note-1" class="note" onclick="alert(1)">
          <use href="#glyph" />
          <use href="https://example.com/external.svg#glyph" />
        </g>
      </svg>`;

    const clean = sanitizeScoreSvg(unsafe, "Estudo");
    const document = new DOMParser().parseFromString(clean, "image/svg+xml");

    expect(document.querySelector("script, foreignObject, iframe")).toBeNull();
    expect(document.documentElement.hasAttribute("onload")).toBe(false);
    expect(document.querySelector("#note-1.note")).not.toBeNull();
    expect(document.querySelector("#note-1")?.hasAttribute("onclick")).toBe(false);
    expect(document.querySelector('use[href="#glyph"]')).not.toBeNull();
    expect(document.querySelector('use[href^="https:"]')).toBeNull();
    expect(document.documentElement.getAttribute("aria-label")).toBe("Partitura digital: Estudo");
  });

  it("rejeita conteúdo que não resulta em um SVG", () => {
    expect(() => sanitizeScoreSvg("<p>não é uma partitura</p>", "Inválida")).toThrow(
      "Não foi possível preparar a visualização desta partitura."
    );
  });
});

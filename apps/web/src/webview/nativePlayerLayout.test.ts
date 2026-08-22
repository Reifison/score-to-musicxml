/// <reference types="node" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const globalCss = readFileSync(
  resolve(process.cwd(), "src/styles/global.css"),
  "utf8"
);

describe("layout do player dedicado", () => {
  it("mantém a página fixa e a partitura como viewport rolável", () => {
    expect(globalCss).toMatch(/\.native-player-page\s*\{[^}]*height:\s*100svh;[^}]*overflow:\s*hidden;/s);
    expect(globalCss).toMatch(/\.native-player-page \.score-sheet\s*\{[^}]*max-height:\s*calc\(100svh - 240px\);[^}]*overflow:\s*auto;/s);
    expect(globalCss).not.toContain(".native-player-page .score-sheet {\n  max-height: none;");
  });

  it("preserva alvos de toque e escala legível da partitura", () => {
    expect(globalCss).toMatch(/\.native-player-page :is\(button, input\[type="range"\]\)\s*\{[^}]*min-height:\s*44px;/s);
    expect(globalCss).toMatch(/\.native-player-page \.score-sheet svg\s*\{[^}]*width:\s*max\(100%, 30rem\);/s);
    expect(globalCss).toContain("touch-action: pan-x pan-y pinch-zoom;");
  });

  it("define composições específicas para retrato, paisagem e movimento reduzido", () => {
    expect(globalCss).toContain("@media (orientation: portrait) and (max-width: 600px)");
    expect(globalCss).toContain("@media (orientation: landscape) and (max-height: 520px)");
    expect(globalCss).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.native-player-page \*/);
  });
});

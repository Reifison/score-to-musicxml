/// <reference types="node" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

const globalCss = readFileSync(
  resolve(process.cwd(), "src/styles/global.css"),
  "utf8"
);
const stylesheet = postcss.parse(globalCss);

function declarations(selector: string, property: string): string[] {
  const values: string[] = [];
  stylesheet.walkRules((rule) => {
    if (!ruleContainsSelector(rule.selector, selector)) return;
    rule.walkDecls(property, (declaration) => { values.push(declaration.value); });
  });
  return values;
}

function mediaDeclarations(query: string, selector: string, property: string): string[] {
  const values: string[] = [];
  stylesheet.walkAtRules("media", (media) => {
    if (media.params !== query) return;
    media.walkRules((rule) => {
      if (!ruleContainsSelector(rule.selector, selector)) return;
      rule.walkDecls(property, (declaration) => { values.push(declaration.value); });
    });
  });
  return values;
}

function containerDeclarations(query: string, selector: string, property: string): string[] {
  const values: string[] = [];
  stylesheet.walkAtRules("container", (container) => {
    if (container.params !== query) return;
    container.walkRules((rule) => {
      if (!ruleContainsSelector(rule.selector, selector)) return;
      rule.walkDecls(property, (declaration) => { values.push(declaration.value); });
    });
  });
  return values;
}

function ruleContainsSelector(ruleSelector: string, selector: string): boolean {
  return ruleSelector === selector || ruleSelector.split(",").some((candidate) => candidate.trim() === selector);
}

describe("layout do player dedicado", () => {
  it("mantém a página fixa e a partitura como viewport rolável", () => {
    expect(declarations(".native-player-page", "height")).toEqual(expect.arrayContaining(["100svh", "100dvh"]));
    expect(declarations(".native-player-page", "overflow")).toContain("hidden");
    expect(declarations(".native-player-page .score-sheet", "flex")).toContain("1 0 120px");
    expect(declarations(".native-player-page .score-sheet", "overflow")).toContain("auto");
    const maxHeights: string[] = [];
    stylesheet.walkDecls("max-height", (declaration) => { maxHeights.push(declaration.value); });
    expect(maxHeights).not.toContain("calc(100svh - 240px)");
  });

  it("preserva alvos de toque e escala legível da partitura", () => {
    expect(declarations('.native-player-page :is(button, input[type="range"])', "min-height")).toContain("48px");
    expect(declarations(".native-player-page .score-sheet svg", "width")).toContain("max(100%, 30rem)");
    expect(declarations(".native-player-page .score-sheet", "touch-action")).toContain("pan-x pan-y pinch-zoom");
  });

  it("reorganiza os controles nativos por largura mantendo orientação e nomes acessíveis", () => {
    expect(declarations(".native-player-page .playback-controls", "display")).toContain("flex");
    expect(declarations(".native-player-page .playback-controls", "flex-flow")).toContain("row wrap");
    expect(declarations(".native-player-page .playback-controls", "container-type")).toContain("inline-size");
    expect(containerDeclarations(
      "native-player-controls (max-width: 519px)",
      ".native-player-page .playback-transport button > span",
      "display"
    )).toContain("none");
    expect(containerDeclarations(
      "native-player-controls (max-width: 319px)",
      ".native-player-page .playback-progress > span:last-child",
      "clip"
    )).toContain("rect(0, 0, 0, 0)");
    expect(declarations(".native-player-page .tempo-control > span", "grid-column")).toContain("auto");
    expect(declarations(".native-player-page .playback-guidance", "clip-path")).toContain("inset(50%)");
    expect(globalCss).not.toContain(".native-player-page .playback-message:not(.playback-message-error)");
    expect(declarations(".playback-controls", "display")).toContain("grid");
  });

  it("adapta à área da janela e ao movimento reduzido sem depender da orientação", () => {
    expect(globalCss).toContain("@media (max-width: 600px)");
    expect(globalCss).toContain("@media (min-width: 640px) and (max-height: 520px)");
    expect(mediaDeclarations("(prefers-reduced-motion: reduce)", ".score-skeleton", "animation")).toContain("none");
    expect(mediaDeclarations("(prefers-reduced-motion: reduce)", ".native-player-page .score-sheet", "scroll-behavior")).toContain("auto");
    let reducedTransitions: string[] = [];
    stylesheet.walkDecls("transition-duration", (declaration) => { reducedTransitions.push(declaration.value); });
    expect(reducedTransitions.map((value) => value.toLowerCase())).not.toContain(".01ms");
  });

  it("permite encadear o scroll da partitura até a paginação na área dedicada", () => {
    expect(declarations(".native-player-page .score-player", "overflow")).toContain("auto");
    expect(declarations(".native-player-page .score-player", "overscroll-behavior-y")).toContain("contain");
    expect(declarations(".native-player-page .score-sheet", "overflow")).toContain("auto");
    expect(declarations(".native-player-page .score-sheet", "overscroll-behavior-y")).toContain("auto");
    expect(declarations(".native-player-page .score-pagination", "scroll-margin-block")).toContain("12px");
  });

  it("dá uma área própria aos controles e mantém a paginação junto à partitura em janelas baixas", () => {
    const query = "(min-width: 640px) and (max-height: 520px)";
    expect(mediaDeclarations(query, ".native-player-page .score-player", "display")).toContain("grid");
    expect(mediaDeclarations(query, ".native-player-page .playback-controls", "overflow")).toContain("auto");
    expect(mediaDeclarations(query, ".native-player-page .score-sheet", "grid-row")).toContain("1 / 4");
    expect(mediaDeclarations(query, ".native-player-page .score-pagination", "grid-row")).toContain("4");
  });

  it("compacta a paginação nativa em larguras confortáveis e permite refluí-la", () => {
    const query = "native-player-reader (min-width: 520px)";
    expect(declarations(".native-player-page .score-player", "container-type")).toContain("inline-size");
    expect(containerDeclarations(query, ".native-player-page .score-pagination", "grid-template-columns"))
      .toContain("repeat(3, minmax(48px, 1fr))");
    expect(containerDeclarations(query, ".native-player-page .score-pagination span", "grid-column")).toContain("2");
    expect(containerDeclarations(query, ".native-player-page .score-pagination button", "overflow-wrap")).toContain("anywhere");
  });
});

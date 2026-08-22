import { describe, expect, it } from "vitest";
import {
  isTrustedPlayerDocument,
  isTrustedPlayerOrigin,
  resolvePlayerWebViewConfig
} from "./config";

describe("resolvePlayerWebViewConfig", () => {
  it("adiciona o caminho dedicado a uma origem HTTPS", () => {
    expect(resolvePlayerWebViewConfig("https://app.example.com", false)).toEqual({
      origin: "https://app.example.com",
      url: "https://app.example.com/mobile/player"
    });
  });

  it("aceita HTTP somente durante desenvolvimento explícito", () => {
    expect(resolvePlayerWebViewConfig("http://192.168.1.10:5173/mobile/player", true)).toEqual({
      origin: "http://192.168.1.10:5173",
      url: "http://192.168.1.10:5173/mobile/player"
    });
    expect(() => resolvePlayerWebViewConfig("http://192.168.1.10:5173/mobile/player", false)).toThrow(/HTTPS/);
  });

  it("rejeita URL com token, query, hash, credencial ou caminho diferente", () => {
    const invalid = [
      "https://app.example.com/mobile/player?token=secret",
      "https://app.example.com/mobile/player#secret",
      "https://user:secret@app.example.com/mobile/player",
      "https://app.example.com/login"
    ];
    for (const value of invalid) {
      expect(() => resolvePlayerWebViewConfig(value, false)).toThrow();
    }
  });
});

describe("player navigation validation", () => {
  const config = resolvePlayerWebViewConfig("https://app.example.com/mobile/player", false);

  it("aceita somente o documento dedicado sem query", () => {
    expect(isTrustedPlayerDocument("https://app.example.com/mobile/player", config)).toBe(true);
    expect(isTrustedPlayerDocument("https://app.example.com/mobile/player/", config)).toBe(true);
    expect(isTrustedPlayerDocument("https://app.example.com/mobile/player?token=secret", config)).toBe(false);
    expect(isTrustedPlayerDocument("https://evil.example/mobile/player", config)).toBe(false);
  });

  it("permite recursos apenas da origem configurada", () => {
    expect(isTrustedPlayerOrigin("https://app.example.com/assets/player.js", config)).toBe(true);
    expect(isTrustedPlayerOrigin("https://cdn.example.com/player.js", config)).toBe(false);
  });
});

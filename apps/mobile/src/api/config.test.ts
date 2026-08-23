import { describe, expect, it } from "vitest";
import { resolveApiUrl } from "./config";

describe("resolveApiUrl", () => {
  it("exige uma URL HTTPS explícita em release", () => {
    expect(resolveApiUrl("https://api.example.com", false)).toBe("https://api.example.com");
    expect(() => resolveApiUrl(undefined, false)).toThrow(/não está configurada/);
    expect(() => resolveApiUrl("http://localhost:4000", false)).toThrow(/HTTPS/);
  });

  it("mantém o fallback local somente em desenvolvimento explícito", () => {
    expect(resolveApiUrl(undefined, true)).toBe("http://localhost:4000");
    expect(resolveApiUrl("http://192.168.1.10:4000", true)).toBe("http://192.168.1.10:4000");
  });

  it("rejeita URLs com caminho, query, hash ou credenciais", () => {
    for (const value of [
      "https://api.example.com/api",
      "https://api.example.com?token=secret",
      "https://api.example.com#secret",
      "https://user:secret@api.example.com"
    ]) {
      expect(() => resolveApiUrl(value, false)).toThrow();
    }
  });
});

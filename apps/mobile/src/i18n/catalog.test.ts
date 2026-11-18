import { describe, expect, it } from "vitest";
import { getLanguage, getLocale, registerTranslations, t } from ".";
import { setCatalogLanguage } from "./catalog";

describe("mobile translations", () => {
  it("selects an explicit string pair and interpolates named values", () => {
    setCatalogLanguage("pt");
    expect(t("Olá, {name}", "Hello, {name}", { name: "Ana" })).toBe("Olá, Ana");
    setCatalogLanguage("en");
    expect(t("Olá, {name}", "Hello, {name}", { name: "Ana" })).toBe("Hello, Ana");
  });

  it("uses registered Portuguese-to-English entries for one-argument calls", () => {
    registerTranslations({ "Conversão pronta": "Conversion complete" });
    setCatalogLanguage("en");
    expect(t("Conversão pronta")).toBe("Conversion complete");
    setCatalogLanguage("pt");
    expect(t("Conversão pronta")).toBe("Conversão pronta");
  });

  it("exposes a Brazilian Portuguese default locale before startup detection", () => {
    setCatalogLanguage("pt");
    expect(getLanguage()).toBe("pt");
    expect(getLocale()).toBe("pt-BR");
  });
});

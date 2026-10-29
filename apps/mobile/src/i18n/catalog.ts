import type { Language } from "./preference";

export type TranslationParams = Record<string, string | number>;
export type TranslationDictionary = Record<string, string>;

let activeLanguage: Language = "pt";
const additionalTranslations: TranslationDictionary = Object.create(null) as TranslationDictionary;

export function setCatalogLanguage(language: Language): void {
  activeLanguage = language;
}

export function registerTranslations(dictionary: TranslationDictionary): void {
  Object.assign(additionalTranslations, dictionary);
}

export function translate(pt: string, en?: string, params?: TranslationParams): string {
  const template = en === undefined
    ? (activeLanguage === "pt" ? pt : additionalTranslations[pt] ?? pt)
    : (activeLanguage === "pt" ? pt : en);

  if (!params) return template;
  return template.replace(/\{\{?(\w+)\}?\}/g, (match, key: string) => (
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match
  ));
}

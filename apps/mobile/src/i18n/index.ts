import { createContext, createElement, useContext, useEffect, useMemo, useState, useSyncExternalStore, type PropsWithChildren, type ReactElement } from "react";
import { registerTranslations, translate, setCatalogLanguage, type TranslationParams, type TranslationDictionary } from "./catalog";
import type { Language } from "./preference";

type TranslationContextValue = {
  t: typeof translate;
  language: Language;
  isReady: boolean;
  setLanguage: (language: Language) => Promise<void>;
};

type LanguageController = {
  getLanguage(): Language;
  initialize(): Promise<Language>;
  setLanguage(language: Language): Promise<void>;
  subscribe(listener: (language: Language) => void): () => void;
};

let activeLanguage: Language = "pt";
let languageController: LanguageController | null = null;
let pendingManualLanguage: Language | null = null;
const listeners = new Set<(language: Language) => void>();
const TranslationContext = createContext<TranslationContextValue | null>(null);

function publishLanguage(nextLanguage: Language): void {
  if (activeLanguage === nextLanguage) return;
  activeLanguage = nextLanguage;
  setCatalogLanguage(nextLanguage);
  for (const listener of listeners) listener(activeLanguage);
}

function subscribeToLanguage(listener: (language: Language) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setLanguage(language: Language): Promise<void> {
  publishLanguage(language);
  if (languageController) return languageController.setLanguage(language);
  pendingManualLanguage = language;
  return Promise.resolve();
}

function installLanguageController(controller: LanguageController): void {
  if (languageController === controller) return;
  languageController = controller;
  controller.subscribe(publishLanguage);
  if (pendingManualLanguage) {
    const pending = pendingManualLanguage;
    pendingManualLanguage = null;
    void controller.setLanguage(pending).catch(() => undefined);
  } else {
    publishLanguage(controller.getLanguage());
  }
}

async function initializeLanguageRuntime(): Promise<void> {
  try {
    const nativeRuntime = await import("./nativeRuntime");
    installLanguageController(nativeRuntime.languageController);
    await nativeRuntime.languageController.initialize();
  } catch {
    // The app remains usable with the in-memory default if native storage or detection is unavailable.
  }
}

export function t(pt: string, en?: string, params?: TranslationParams): string {
  return translate(pt, en, params);
}

export { registerTranslations };
export type { Language, TranslationDictionary, TranslationParams };

export function getLanguage(): Language {
  return activeLanguage;
}

export function getLocale(): "pt-BR" | "en-US" {
  return activeLanguage === "pt" ? "pt-BR" : "en-US";
}

export function configureLanguageController(controller: LanguageController): void {
  installLanguageController(controller);
}

export function useTranslation(): TranslationContextValue {
  const contextValue = useContext(TranslationContext);
  const language = useSyncExternalStore(
    (listener) => subscribeToLanguage(() => listener()),
    getLanguage,
    getLanguage
  );

  if (contextValue) return contextValue;
  return { t, language, isReady: true, setLanguage };
}

export function LanguageProvider({ children }: PropsWithChildren): ReactElement {
  const [language, setProviderLanguage] = useState(getLanguage);
  const [isReady, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    const unsubscribe = subscribeToLanguage(setProviderLanguage);
    const fallbackTimer = setTimeout(() => setReady(true), 2_500);
    void initializeLanguageRuntime().finally(() => {
      if (!mounted) return;
      clearTimeout(fallbackTimer);
      setReady(true);
    });
    return () => {
      mounted = false;
      clearTimeout(fallbackTimer);
      unsubscribe();
    };
  }, []);

  const value = useMemo<TranslationContextValue>(() => ({ t, language, isReady, setLanguage }), [isReady, language]);
  return createElement(TranslationContext.Provider, { value }, children);
}

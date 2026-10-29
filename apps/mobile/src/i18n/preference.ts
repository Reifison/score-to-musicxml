export type Language = "pt" | "en";

export const MANUAL_LANGUAGE_KEY = "@score-to-musicxml/language/manual/v1";
export const INITIAL_LANGUAGE_KEY = "@score-to-musicxml/language/initial/v1";

export type LanguageStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

export type LanguageEnvironment = {
  isLegacyInstallation(): Promise<boolean>;
  getStorefrontCountryCode(): Promise<string | null>;
  getDeviceLocale(): string | null;
};

export function isLanguage(value: string | null | undefined): value is Language {
  return value === "pt" || value === "en";
}

export function resolveInitialLanguage(options: {
  legacyInstallation: boolean;
  storefrontCountryCode: string | null | undefined;
  deviceLocale: string | null | undefined;
}): Language {
  if (options.legacyInstallation) return "pt";
  const storefrontCountryCode = options.storefrontCountryCode?.trim().toUpperCase();
  if (storefrontCountryCode) return storefrontCountryCode === "BR" || storefrontCountryCode === "BRA" ? "pt" : "en";
  return isPortugueseLocale(options.deviceLocale) ? "pt" : "en";
}

export function isPortugueseLocale(locale: string | null | undefined): boolean {
  return typeof locale === "string" && /^pt(?:[-_]|$)/i.test(locale.trim());
}

export function createLanguagePreferenceController(
  storage: LanguageStorage,
  environment: LanguageEnvironment
) {
  let language: Language = "pt";
  let manualRevision = 0;
  let initialization: Promise<Language> | null = null;
  let persistenceQueue: Promise<void> = Promise.resolve();
  const listeners = new Set<(language: Language) => void>();

  function publish(nextLanguage: Language) {
    if (language === nextLanguage) return;
    language = nextLanguage;
    for (const listener of listeners) listener(language);
  }

  function persist(key: string, value: string): Promise<void> {
    const write = persistenceQueue.catch(() => undefined).then(() => storage.setItem(key, value));
    persistenceQueue = write.catch(() => undefined);
    return write;
  }

  function setLanguage(nextLanguage: Language): Promise<void> {
    manualRevision += 1;
    publish(nextLanguage);
    return persist(MANUAL_LANGUAGE_KEY, nextLanguage);
  }

  function subscribe(listener: (language: Language) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  async function read(key: string): Promise<string | null> {
    try {
      return await withTimeout(storage.getItem(key), 900, null);
    } catch {
      return null;
    }
  }

  function initialize(): Promise<Language> {
    if (initialization) return initialization;
    if (manualRevision > 0) return Promise.resolve(language);
    const revisionAtStart = manualRevision;

    initialization = (async () => {
      const [storedManualLanguage, storedInitialLanguage] = await Promise.all([
        read(MANUAL_LANGUAGE_KEY),
        read(INITIAL_LANGUAGE_KEY)
      ]);
      if (manualRevision !== revisionAtStart) return language;

      if (isLanguage(storedManualLanguage)) {
        publish(storedManualLanguage);
        return storedManualLanguage;
      }
      if (isLanguage(storedInitialLanguage)) {
        publish(storedInitialLanguage);
        return storedInitialLanguage;
      }

      let legacyInstallation = false;
      try {
        legacyInstallation = await withTimeout(environment.isLegacyInstallation(), 400, false);
      } catch {
        // If old-install evidence cannot be read, use the available locale signals.
      }
      if (manualRevision !== revisionAtStart) return language;

      let storefrontCountryCode: string | null = null;
      if (!legacyInstallation) {
        try {
          storefrontCountryCode = await withTimeout(environment.getStorefrontCountryCode(), 900, null);
        } catch {
          // StoreKit / Play Store may be unavailable; the device language is the fallback.
        }
      }
      if (manualRevision !== revisionAtStart) return language;

      const initialLanguage = resolveInitialLanguage({
        legacyInstallation,
        storefrontCountryCode,
        deviceLocale: environment.getDeviceLocale()
      });
      publish(initialLanguage);
      void persist(INITIAL_LANGUAGE_KEY, initialLanguage).catch(() => undefined);
      return initialLanguage;
    })().catch(() => language);

    return initialization;
  }

  return {
    getLanguage: () => language,
    initialize,
    setLanguage,
    subscribe
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(fallback), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      () => {
        clearTimeout(timeout);
        resolve(fallback);
      }
    );
  });
}

import { describe, expect, it } from "vitest";
import {
  createLanguagePreferenceController,
  INITIAL_LANGUAGE_KEY,
  MANUAL_LANGUAGE_KEY,
  resolveInitialLanguage,
  type LanguageEnvironment,
  type LanguageStorage
} from "./preference";

class MemoryStorage implements LanguageStorage {
  readonly values = new Map<string, string>();
  failWrites = false;

  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    if (this.failWrites) throw new Error("storage unavailable");
    this.values.set(key, value);
  }
}

function environment(overrides: Partial<LanguageEnvironment> = {}): LanguageEnvironment {
  return {
    isLegacyInstallation: async () => false,
    getStorefrontCountryCode: async () => null,
    getDeviceLocale: () => "en-US",
    ...overrides
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

describe("language preferences", () => {
  it("uses the Brazilian storefront before device language, then falls back to device language", () => {
    expect(resolveInitialLanguage({ legacyInstallation: false, storefrontCountryCode: "BRA", deviceLocale: "en-US" })).toBe("pt");
    expect(resolveInitialLanguage({ legacyInstallation: false, storefrontCountryCode: "BR", deviceLocale: "en-US" })).toBe("pt");
    expect(resolveInitialLanguage({ legacyInstallation: false, storefrontCountryCode: "USA", deviceLocale: "pt-BR" })).toBe("en");
    expect(resolveInitialLanguage({ legacyInstallation: false, storefrontCountryCode: "CAN", deviceLocale: "pt-PT" })).toBe("en");
    expect(resolveInitialLanguage({ legacyInstallation: false, storefrontCountryCode: null, deviceLocale: "pt-BR" })).toBe("pt");
    expect(resolveInitialLanguage({ legacyInstallation: false, storefrontCountryCode: null, deviceLocale: "en-US" })).toBe("en");
  });

  it("preserves Portuguese for a recognized legacy installation and caches a new installation default", async () => {
    const legacyStorage = new MemoryStorage();
    const legacy = createLanguagePreferenceController(legacyStorage, environment({ isLegacyInstallation: async () => true }));
    expect(await legacy.initialize()).toBe("pt");
    expect(legacyStorage.values.get(INITIAL_LANGUAGE_KEY)).toBe("pt");

    const freshStorage = new MemoryStorage();
    const fresh = createLanguagePreferenceController(freshStorage, environment({
      getStorefrontCountryCode: async () => "USA",
      getDeviceLocale: () => "pt-BR"
    }));
    expect(await fresh.initialize()).toBe("en");
    expect(freshStorage.values.get(INITIAL_LANGUAGE_KEY)).toBe("en");
  });

  it("keeps a manual choice made while first-install detection is in flight", async () => {
    const storage = new MemoryStorage();
    const legacyDetection = deferred<boolean>();
    const controller = createLanguagePreferenceController(storage, environment({
      isLegacyInstallation: () => legacyDetection.promise,
      getStorefrontCountryCode: async () => "BRA"
    }));

    const initialization = controller.initialize();
    await Promise.resolve();
    await controller.setLanguage("en");
    legacyDetection.resolve(false);

    expect(await initialization).toBe("en");
    expect(controller.getLanguage()).toBe("en");
    expect(storage.values.get(MANUAL_LANGUAGE_KEY)).toBe("en");
    expect(storage.values.has(INITIAL_LANGUAGE_KEY)).toBe(false);
  });

  it("applies the choice immediately, preserves call order, and reports storage failures", async () => {
    const storage = new MemoryStorage();
    const firstWrite = deferred<void>();
    let blockFirstWrite = true;
    const orderedStorage: LanguageStorage = {
      getItem: storage.getItem.bind(storage),
      async setItem(key, value) {
        if (blockFirstWrite) {
          blockFirstWrite = false;
          await firstWrite.promise;
        }
        await storage.setItem(key, value);
      }
    };
    const controller = createLanguagePreferenceController(orderedStorage, environment());

    const first = controller.setLanguage("en");
    const latest = controller.setLanguage("pt");
    expect(controller.getLanguage()).toBe("pt");
    firstWrite.resolve();
    await Promise.all([first, latest]);
    expect(storage.values.get(MANUAL_LANGUAGE_KEY)).toBe("pt");

    storage.failWrites = true;
    await expect(controller.setLanguage("en")).rejects.toThrow("storage unavailable");
    expect(controller.getLanguage()).toBe("en");

    storage.failWrites = false;
    await controller.setLanguage("pt");
    expect(storage.values.get(MANUAL_LANGUAGE_KEY)).toBe("pt");
  });
});

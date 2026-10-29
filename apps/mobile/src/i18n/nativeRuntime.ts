import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { NativeModules, Platform } from "react-native";
import { createLanguagePreferenceController } from "./preference";

const legacyTokenKey = "score_session_token";
const playerSnapshotPrefix = "@score-to-musicxml/player-session/v1/";

export const languageController = createLanguagePreferenceController(
  AsyncStorage,
  {
    async isLegacyInstallation() {
      const [token, keys] = await Promise.all([
        SecureStore.getItemAsync(legacyTokenKey).catch(() => null),
        AsyncStorage.getAllKeys().catch(() => [] as string[])
      ]);
      return Boolean(token) || keys.some((key) => key.startsWith(playerSnapshotPrefix));
    },
    async getStorefrontCountryCode() {
      const { getStorefront } = await import("expo-iap");
      return (await getStorefront()) || null;
    },
    getDeviceLocale
  }
);

type NativeLocaleSettings = {
  settings?: {
    AppleLanguages?: unknown;
    AppleLocale?: unknown;
  };
  localeIdentifier?: unknown;
  constants?: { localeIdentifier?: unknown };
};

function getDeviceLocale(): string | null {
  const settings = NativeModules.SettingsManager as NativeLocaleSettings | undefined;
  const nativeI18n = NativeModules.I18nManager as NativeLocaleSettings | undefined;
  const appleLanguages = Array.isArray(settings?.settings?.AppleLanguages)
    ? settings.settings.AppleLanguages.filter((value): value is string => typeof value === "string")
    : [];
  const candidates = Platform.OS === "ios"
    ? [...appleLanguages, settings?.settings?.AppleLocale]
    : [nativeI18n?.localeIdentifier, nativeI18n?.constants?.localeIdentifier];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }

  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || null;
  } catch {
    return null;
  }
}

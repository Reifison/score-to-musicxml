import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Score } from "../api/types";

type ScoreLibrary = { scores: Score[] };

function storageKey(userId: string) {
  return `@score-to-musicxml/library/v1/${encodeURIComponent(userId)}`;
}

export async function readScoreLibrary(userId: string): Promise<ScoreLibrary | undefined> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (!raw) return undefined;
    const stored = JSON.parse(raw) as ScoreLibrary;
    return Array.isArray(stored?.scores) ? stored : undefined;
  } catch {
    return undefined;
  }
}

export async function writeScoreLibrary(userId: string, library: ScoreLibrary): Promise<void> {
  await AsyncStorage.setItem(storageKey(userId), JSON.stringify(library));
}

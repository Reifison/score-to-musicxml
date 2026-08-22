import { safeCacheKey, safeMidiFilename } from "./exportFilenames";

type MidiScore = {
  id: string;
  originalFilename: string;
  userId: string;
};

export type MidiDownloadPlan = {
  directorySegments: readonly string[];
  filename: string;
  headers: { Authorization: string };
  idempotent: true;
  legacyFilename: string;
  url: string;
};

export type DownloadedMidi = { uri: string };

export type MidiDownloadOperations<T extends DownloadedMidi> = {
  ensureDirectory: (segments: readonly string[]) => void | Promise<void>;
  download: (plan: MidiDownloadPlan) => Promise<T>;
  removeLegacy: (filename: string, currentUri: string) => void | Promise<void>;
  removeStale: (segments: readonly string[], currentUri: string) => void | Promise<void>;
};

export function createMidiDownloadPlan(apiUrl: string, token: string, score: MidiScore): MidiDownloadPlan {
  const scoreCacheKey = safeCacheKey(score.id);
  return {
    directorySegments: ["midi-exports", safeCacheKey(score.userId), scoreCacheKey],
    filename: safeMidiFilename(score.originalFilename),
    headers: { Authorization: `Bearer ${token}` },
    idempotent: true,
    legacyFilename: `${scoreCacheKey}.mid`,
    url: `${apiUrl}/api/scores/${encodeURIComponent(score.id)}/midi`
  };
}

export async function runMidiDownload<T extends DownloadedMidi>(
  plan: MidiDownloadPlan,
  operations: MidiDownloadOperations<T>
): Promise<T> {
  await operations.ensureDirectory(plan.directorySegments);
  const downloaded = await operations.download(plan);

  // Best-effort cache maintenance must never hide a successful download.
  try {
    await operations.removeStale(plan.directorySegments, downloaded.uri);
  } catch {
    // A stale cache entry can be retried on the next export.
  }
  try {
    await operations.removeLegacy(plan.legacyFilename, downloaded.uri);
  } catch {
    // A legacy cache entry can be retried on the next export.
  }

  return downloaded;
}

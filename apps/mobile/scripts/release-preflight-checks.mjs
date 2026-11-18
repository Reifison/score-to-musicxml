export const removableAndroidPermissions = new Set([
  "android.permission.READ_EXTERNAL_STORAGE",
  "android.permission.WRITE_EXTERNAL_STORAGE",
  "android.permission.RECORD_AUDIO",
  "android.permission.SYSTEM_ALERT_WINDOW",
  "android.permission.VIBRATE"
]);

export function parseAndroidPermissions(manifest) {
  return Array.from(manifest.matchAll(/<uses-permission\b([^>]*)\/?\s*>/g), (match) => {
    const attributes = match[1];
    const name = attributes.match(/android:name=["']([^"']+)["']/)?.[1];
    const removeFromMerge = /tools:node=["']remove["']/.test(attributes);
    return name ? { name, removeFromMerge } : null;
  }).filter(Boolean);
}

export function normalizeFingerprint(value) {
  const normalized = String(value ?? "").replace(/[^a-f\d]/gi, "").toUpperCase();
  return normalized.length === 64 ? normalized : null;
}

export function extractSha256Fingerprint(keytoolOutput) {
  const match = keytoolOutput.match(/SHA-?256:\s*([A-F\d: ]{64,})/i);
  return normalizeFingerprint(match?.[1]);
}

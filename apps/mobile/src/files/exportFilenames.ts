const disallowedFilenameCharacters = /[^a-zA-Z0-9._ -]/g;

export function safeMidiFilename(originalFilename: string): string {
  return `${safeExportBasename(originalFilename)}.mid`;
}

export function safeCacheKey(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
  return cleaned || "score";
}

function safeExportBasename(input: string): string {
  const leaf = input.split(/[\\/]+/).pop() || "score";
  const withoutExtension = leaf.replace(/\.[^.]+$/, "");
  const cleaned = withoutExtension
    .replace(disallowedFilenameCharacters, "_")
    .replace(/\s+/g, " ")
    .replace(/^\.+|\.+$/g, "")
    .trim()
    .slice(0, 180);
  return cleaned || "score";
}

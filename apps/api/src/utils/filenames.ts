import path from "node:path";

const allowedNameChars = /[^a-zA-Z0-9._ -]/g;

export function sanitizeOriginalFilename(input: string): string {
  const base = path.basename(input || "score");
  const cleaned = base.replace(allowedNameChars, "_").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, 180) || "score";
}

export function basenameWithoutExtension(filename: string): string {
  const clean = sanitizeOriginalFilename(filename);
  const parsed = path.parse(clean);
  return (parsed.name || "score").replace(/\.+$/g, "") || "score";
}

export function safeMusicXmlFilename(originalFilename: string): string {
  return `${basenameWithoutExtension(originalFilename)}.musicxml`;
}

export function extensionOf(filename: string): string {
  return path.extname(filename).toLowerCase().replace(".", "");
}

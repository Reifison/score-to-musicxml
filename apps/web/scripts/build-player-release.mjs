import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { build } from "vite";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(webRoot, "dist");
const built = await build({
  root: webRoot,
  configFile: false,
  plugins: [react()],
  build: {
    outDir: outputRoot,
    emptyOutDir: false,
    copyPublicDir: false,
    rollupOptions: { input: path.join(webRoot, "player-release.html") }
  }
});

const names = new Set((Array.isArray(built) ? built : [built]).flatMap((bundle) => bundle.output.map((entry) => entry.fileName)));
if (!names.has("player-release.html")) throw new Error("The native player entry was not generated.");
const files = [];
for (const name of [...names].sort()) {
  if (path.isAbsolute(name) || name.split(/[\\/]/).includes("..")) throw new Error("Unexpected build output path.");
  const data = await readFile(path.join(outputRoot, name));
  files.push({ path: name, bytes: data.length, sha256: createHash("sha256").update(data).digest("hex") });
}
const manifest = {
  entry: "player-release.html",
  builtAt: new Date().toISOString(),
  // Existing public audio assets are preserved and verified during deployment.
  reusedPublicRoots: ["audio/samples/"],
  files
};
await writeFile(path.join(outputRoot, "player-release-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Native player: ${files.length} outputs recorded in dist/player-release-manifest.json`);

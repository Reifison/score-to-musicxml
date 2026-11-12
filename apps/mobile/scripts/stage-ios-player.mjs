import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const web = fileURLToPath(new URL("../../web/", import.meta.url));
const destination = process.argv[2];
if (!destination || path.basename(destination) !== "ScorePlayer") {
  throw new Error("Expected the ScorePlayer resource directory inside the iOS app.");
}
const dist = path.join(web, "dist");
const manifestName = "player-release-manifest.json";
const validAsset = (name) => /^assets\/[a-zA-Z0-9_-]+\.(js|css)$/.test(name);
const buildScript = path.join(web, "scripts/build-player-release.mjs");
execFileSync(process.execPath, [buildScript], { cwd: web, stdio: "inherit" });
const manifest = JSON.parse(readFileSync(path.join(dist, manifestName), "utf8"));
if (manifest.entry !== "player-release.html" || !manifest.files.some(({ path: name }) => name === manifest.entry)) {
  throw new Error("Missing the native player entry.");
}

const files = new Set();
for (const entry of manifest.files) {
  const name = entry.path;
  if (name !== manifest.entry && !validAsset(name)) throw new Error(`Unexpected player resource: ${name}`);
  const content = readFileSync(path.join(dist, name));
  if (createHash("sha256").update(content).digest("hex") !== entry.sha256) throw new Error(`Invalid hash: ${name}`);
  files.add(name);
}

const installedManifest = path.join(destination, manifestName);
if (existsSync(installedManifest)) {
  const prior = JSON.parse(readFileSync(installedManifest, "utf8"));
  for (const { path: name } of prior.files) {
    const old = path.join(destination, name);
    if (validAsset(name) && !files.has(name) && existsSync(old)) unlinkSync(old);
  }
}
for (const name of files) {
  const target = path.join(destination, name);
  mkdirSync(path.dirname(target), { recursive: true });
  copyFileSync(path.join(dist, name), target);
}
cpSync(path.join(web, "public/audio/samples"), path.join(destination, "audio/samples"), { recursive: true });
copyFileSync(path.join(dist, manifestName), installedManifest);

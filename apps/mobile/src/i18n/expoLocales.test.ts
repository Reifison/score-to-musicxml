import { IOSConfig } from "@expo/config-plugins";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, readFile, rm, writeFile, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const xcode = require("xcode") as { project(path: string): { parseSync(): void; writeSync(): string } };
const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

describe("Expo iOS localizations", () => {
  it("generates and links English and Brazilian Portuguese InfoPlist strings during prebuild", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "score-mobile-locales-"));
    const sourceDirectory = join(temporaryRoot, "ios", "ScoretoMusicXML");
    const projectDirectory = join(temporaryRoot, "ios", "ScoretoMusicXML.xcodeproj");
    const projectPath = join(projectDirectory, "project.pbxproj");

    try {
      await mkdir(projectDirectory, { recursive: true });
      await mkdir(sourceDirectory, { recursive: true });
      await copyFile(
        join(mobileRoot, "ios", "ScoretoMusicXML.xcodeproj", "project.pbxproj"),
        projectPath
      );
      await copyFile(
        join(mobileRoot, "ios", "ScoretoMusicXML", "AppDelegate.swift"),
        join(sourceDirectory, "AppDelegate.swift")
      );

      const appConfig = JSON.parse(await readFile(join(mobileRoot, "app.json"), "utf8")) as {
        expo: { locales: Record<string, string | Record<string, string>> };
      };
      const project = xcode.project(projectPath);
      project.parseSync();
      let localizedProject = await IOSConfig.Locales.setLocalesAsync(appConfig.expo, {
        projectRoot: temporaryRoot,
        project
      });
      localizedProject = await IOSConfig.Locales.setLocalesAsync(appConfig.expo, {
        projectRoot: temporaryRoot,
        project: localizedProject
      });
      await writeFile(projectPath, localizedProject.writeSync());

      const english = await readFile(join(sourceDirectory, "Supporting/en.lproj/InfoPlist.strings"), "utf8");
      const portuguese = await readFile(join(sourceDirectory, "Supporting/pt-BR.lproj/InfoPlist.strings"), "utf8");
      const savedProject = await readFile(projectPath, "utf8");

      expect(english).toContain('CFBundleDisplayName = "Sheet Music Converter";');
      expect(english).toContain('NSCameraUsageDescription = "Use the camera');
      expect(english).toContain("NSPhotoLibraryUsageDescription");
      expect(portuguese).toContain('CFBundleDisplayName = "Conversor de Partituras";');
      expect(portuguese).toContain('NSCameraUsageDescription = "Usamos a câmera');
      expect(portuguese).toContain("NSPhotoLibraryUsageDescription");
      expect(savedProject.match(/InfoPlist\.strings in Resources/g)).toHaveLength(4);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});

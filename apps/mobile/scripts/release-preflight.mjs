import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractSha256Fingerprint, normalizeFingerprint, parseAndroidPermissions, removableAndroidPermissions } from "./release-preflight-checks.mjs";

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const checks = [];
const pending = [];

function read(relativePath) {
  return readFileSync(path.join(mobileRoot, relativePath), "utf8");
}

function check(label, condition, detail = "") {
  if (condition) checks.push(`PASS ${label}${detail ? ` — ${detail}` : ""}`);
  else errors.push(`FAIL ${label}${detail ? ` — ${detail}` : ""}`);
}

function pendingCheck(label, detail) {
  pending.push(`PENDENTE ${label} — ${detail}`);
}

function xmlString(plist, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return plist.match(new RegExp(`<key>${escapedKey}</key>\\s*<string>([^<]*)</string>`))?.[1];
}

function optionValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const expo = JSON.parse(read("app.json")).expo;
const packageJson = JSON.parse(read("package.json"));
const eas = JSON.parse(read("eas.json"));
const plist = read("ios/ScoretoMusicXML/Info.plist");
const project = read("ios/ScoretoMusicXML.xcodeproj/project.pbxproj");
const gradle = read("android/app/build.gradle");
const sourceManifest = read("android/app/src/main/AndroidManifest.xml");

const packageVersionMatches = packageJson.version === `${expo.version}.0`;
check("app version", expo.version === "1.0" && packageVersionMatches, `Expo ${expo.version}; package ${packageJson.version}; App Store baseline 1.0`);
const candidateBuild = expo.ios?.buildNumber;
check("iOS candidate build", /^\d+$/.test(candidateBuild ?? "") && Number(candidateBuild) > 6, `candidate ${candidateBuild} for local preparation; store upload not verified`);
check("iOS native marketing version", (project.match(/MARKETING_VERSION = 1\.0;/g) ?? []).length === 2);
check("iOS native build number", (project.match(/CURRENT_PROJECT_VERSION = (\d+);/g) ?? []).length === 2 && [...project.matchAll(/CURRENT_PROJECT_VERSION = (\d+);/g)].every((match) => match[1] === candidateBuild));
check("iOS plist reads native version settings", xmlString(plist, "CFBundleShortVersionString") === "$(MARKETING_VERSION)" && xmlString(plist, "CFBundleVersion") === "$(CURRENT_PROJECT_VERSION)");

const defaultConfig = gradle.match(/defaultConfig\s*\{([\s\S]*?)\n\s*\}/)?.[1] ?? "";
const androidVersionCode = Number(defaultConfig.match(/versionCode\s+(\d+)/)?.[1]);
const androidVersionName = defaultConfig.match(/versionName\s+["']([^"']+)["']/)?.[1];
check("Android local version settings", androidVersionName === expo.version && androidVersionCode === expo.android?.versionCode, `versionName ${androidVersionName}; versionCode ${androidVersionCode}`);
check("production version increments match each platform", eas.build?.production?.ios?.autoIncrement === "buildNumber" && eas.build?.production?.android?.autoIncrement === "versionCode" && eas.build?.production?.autoIncrement === undefined);
check("Android production AAB profile", eas.build?.production?.android?.buildType === "app-bundle");
const releaseBlock = gradle.match(/release\s*\{([\s\S]*?)\n\s{8}\}/)?.[1] ?? "";
check("Android release never selects debug signing", !/signingConfig\s+signingConfigs\.debug/.test(releaseBlock), "EAS injects the configured release signer; plain local Gradle output is unsigned");

check("light appearance", expo.userInterfaceStyle === "light" && xmlString(plist, "UIUserInterfaceStyle") === "Light");
const iOSPermissionKeys = ["NSCameraUsageDescription", "NSPhotoLibraryUsageDescription", "NSPhotoLibraryAddUsageDescription"];
check("iOS camera and photo explanations", iOSPermissionKeys.every((key) => Boolean(xmlString(plist, key))));
check("iOS unused permission explanations removed", !plist.includes("<key>NSFaceIDUsageDescription</key>") && !plist.includes("<key>NSMicrophoneUsageDescription</key>"));
const pickerConfig = expo.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === "expo-image-picker")?.[1];
check("iOS photo picker does not request microphone", pickerConfig?.microphonePermission === false);

const sourcePermissions = parseAndroidPermissions(sourceManifest);
const sourcePermissionNames = new Set(sourcePermissions.map((permission) => permission.name));
check("Android camera and internet permissions retained", sourcePermissionNames.has("android.permission.CAMERA") && sourcePermissionNames.has("android.permission.INTERNET"));
const sourceUnexpectedPermissions = sourcePermissions.filter((permission) => removableAndroidPermissions.has(permission.name) && !(permission.name === "android.permission.RECORD_AUDIO" && permission.removeFromMerge));
check("unneeded Android permissions removed from main manifest", sourceUnexpectedPermissions.length === 0, sourceUnexpectedPermissions.map((permission) => permission.name).join(", "));
check("Expo only requests camera permission", expo.android?.permissions?.length === 1 && expo.android.permissions[0] === "CAMERA");

const mergedManifestPath = optionValue("--merged-manifest");
if (!mergedManifestPath) {
pendingCheck("merged Android manifest", "build a release variant, then pass --merged-manifest <path> to confirm final merged permissions");
} else if (!existsSync(mergedManifestPath)) {
  errors.push(`FAIL merged Android manifest — file not found: ${mergedManifestPath}`);
} else {
  const merged = readFileSync(mergedManifestPath, "utf8");
  const mergedPermissions = parseAndroidPermissions(merged);
  const mergedNames = new Set(mergedPermissions.map((permission) => permission.name));
  check("merged manifest retains camera and internet", mergedNames.has("android.permission.CAMERA") && mergedNames.has("android.permission.INTERNET"));
  const forbiddenMerged = mergedPermissions.filter((permission) => removableAndroidPermissions.has(permission.name));
  check("merged manifest excludes unneeded permissions", forbiddenMerged.length === 0, forbiddenMerged.map((permission) => permission.name).join(", "));
}

const aabPath = optionValue("--aab") ?? process.env.ANDROID_AAB;
const expectedFingerprint = normalizeFingerprint(process.env.ANDROID_UPLOAD_CERT_SHA256);
if (!aabPath) {
  pendingCheck("AAB certificate", "provide a built .aab and ANDROID_UPLOAD_CERT_SHA256 to verify the release certificate");
} else if (!existsSync(aabPath)) {
  errors.push(`FAIL AAB certificate — file not found: ${aabPath}`);
} else if (!expectedFingerprint) {
  pendingCheck("AAB certificate", "AAB found, but ANDROID_UPLOAD_CERT_SHA256 is not set; no certificate identity was asserted");
} else {
  try {
    const keytoolOutput = execFileSync("keytool", ["-printcert", "-jarfile", aabPath], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const actualFingerprint = extractSha256Fingerprint(keytoolOutput);
    check("AAB upload certificate fingerprint", actualFingerprint !== null && actualFingerprint === expectedFingerprint, actualFingerprint ? "SHA-256 certificate matches expected upload certificate" : "keytool did not return a SHA-256 fingerprint");
  } catch {
    errors.push("FAIL AAB certificate — keytool could not read a signed AAB; artifact must exist and be signed");
  }
}

pendingCheck("store artifact validation", `the iOS build ${candidateBuild} is only a local candidate; no IPA/AAB upload, store build, or final certificate has been verified`);
pendingCheck("Android Play versionCode", `source value ${androidVersionCode} is local only; verify the remote EAS autoIncrement value against Play Console before a release build`);

for (const line of checks) console.log(line);
for (const line of pending) console.log(line);
for (const line of errors) console.error(line);
console.log(`\n${checks.length} checks passed · ${pending.length} validations pending · ${errors.length} failures`);
if (errors.length) process.exitCode = 1;

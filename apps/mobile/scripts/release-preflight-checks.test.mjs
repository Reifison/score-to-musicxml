import { describe, expect, it } from "vitest";
import { extractSha256Fingerprint, normalizeFingerprint, parseAndroidPermissions, removableAndroidPermissions } from "./release-preflight-checks.mjs";

describe("release preflight helpers", () => {
  it("distinguishes a deliberate microphone removal from a retained permission", () => {
    const permissions = parseAndroidPermissions(`<manifest>
      <uses-permission android:name="android.permission.CAMERA" />
      <uses-permission android:name="android.permission.RECORD_AUDIO" tools:node="remove" />
      <uses-permission android:name="android.permission.VIBRATE" />
    </manifest>`);
    const unexpected = permissions.filter((permission) => removableAndroidPermissions.has(permission.name) && !(permission.name === "android.permission.RECORD_AUDIO" && permission.removeFromMerge));

    expect(unexpected.map((permission) => permission.name)).toEqual(["android.permission.VIBRATE"]);
  });

  it("normalizes a SHA-256 certificate fingerprint without accepting a partial value", () => {
    const compact = "0123456789abcdef".repeat(4);
    const formatted = compact.match(/.{2}/g).join(":");

    expect(normalizeFingerprint(formatted)).toBe(compact.toUpperCase());
    expect(normalizeFingerprint("01:02:03")).toBeNull();
    expect(extractSha256Fingerprint(`Owner: CN=Upload\nSHA256: ${formatted}`)).toBe(compact.toUpperCase());
  });
});

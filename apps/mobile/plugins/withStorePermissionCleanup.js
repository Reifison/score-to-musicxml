const { withAndroidManifest, withInfoPlist } = require("@expo/config-plugins");

// Keep store-facing permissions minimal and deterministic across prebuild/EAS.
// Camera, photo library and document-picker permissions remain declared by the
// corresponding Expo modules and are intentionally not touched here.
const ANDROID_PERMISSIONS_TO_REMOVE = new Set([
  "android.permission.SYSTEM_ALERT_WINDOW",
  "android.permission.READ_EXTERNAL_STORAGE",
  "android.permission.WRITE_EXTERNAL_STORAGE",
]);

function permissionName(permission) {
  return permission?.["$"]?.["android:name"] ?? permission?.["android:name"];
}

module.exports = function withStorePermissionCleanup(config) {
  // Expo's introspection output is derived from `android.permissions` before
  // the final manifest is materialized. Filter that list as well as the
  // manifest so EAS/prebuild cannot re-introduce legacy storage permissions.
  if (config.android?.permissions) {
    config.android.permissions = config.android.permissions.filter(
      (permission) => !ANDROID_PERMISSIONS_TO_REMOVE.has(
        permission.startsWith("android.permission.")
          ? permission
          : `android.permission.${permission}`,
      ),
    );
  }

  config = withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    manifest["uses-permission"] = (manifest["uses-permission"] ?? []).filter(
      (permission) => !ANDROID_PERMISSIONS_TO_REMOVE.has(permissionName(permission)),
    );
    return mod;
  });

  return withInfoPlist(config, (mod) => {
    delete mod.modResults.NSMicrophoneUsageDescription;
    delete mod.modResults.NSFaceIDUsageDescription;
    return mod;
  });
};

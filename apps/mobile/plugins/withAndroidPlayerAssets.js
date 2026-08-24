const fs = require("fs");
const path = require("path");
const { withDangerousMod } = require("@expo/config-plugins");

/**
 * Copies the built web player into Android's signed app assets.
 *
 * The native player resolves this directory through `Paths.bundle.uri` in
 * release builds, so it must be present under `android/app/src/main/assets`.
 * Run `npm run build:android-player` before prebuild/EAS when the web player
 * has changed.
 */
module.exports = function withAndroidPlayerAssets(config) {
  return withDangerousMod(config, ["android", async (config) => {
    const projectRoot = config.modRequest.projectRoot;
    const source = path.resolve(projectRoot, "../web/dist");
    const destination = path.resolve(projectRoot, "android/app/src/main/assets/player");

    if (!fs.existsSync(path.join(source, "index.html"))) {
      throw new Error(
        `Android player assets are missing at ${source}. Run ` +
        "npm run build:android-player -w apps/mobile before expo prebuild."
      );
    }

    fs.rmSync(destination, { force: true, recursive: true });
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.cpSync(source, destination, { recursive: true });
    return config;
  }]);
};

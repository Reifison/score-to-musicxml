import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const mobileRoot = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(mobileRoot, "../..");
const assetsDir = path.join(mobileRoot, "assets");
const webPublicDir = path.join(repoRoot, "apps/web/public");
const brandAssetsDir = path.join(repoRoot, "ID/branding_assets");
const iosAssetsDir = path.join(mobileRoot, "ios/ScoretoMusicXML/Images.xcassets");

const iconSource = path.join(brandAssetsDir, "Gemini_Generated_Image_14ktlm14ktlm14kt.png");
const iconPath = path.join(assetsDir, "icon.png");
const splashPath = path.join(assetsDir, "splash.png");
const splashOnly = process.argv.includes("--splash-only");
const { expo } = JSON.parse(fs.readFileSync(path.join(mobileRoot, "app.json"), "utf8"));
const splashConfig = expo.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === "expo-splash-screen")?.[1];
if (!Number.isInteger(splashConfig?.imageWidth) || splashConfig.imageWidth <= 0) {
  throw new Error("Configure imageWidth no plugin expo-splash-screen antes de gerar a abertura.");
}

for (const source of [splashOnly ? iconPath : iconSource]) {
  if (!fs.existsSync(source)) {
    throw new Error(`Arquivo de marca não encontrado: ${source}`);
  }
}

fs.mkdirSync(assetsDir, { recursive: true });

// O arquivo de origem contém o símbolo dentro de uma prancha. Este recorte fica
// completamente dentro do quadrado laranja para produzir um ícone sem o fundo
// quadriculado da prancha e sem transparência, como a App Store exige.
if (!splashOnly) {
  await sharp(iconSource)
    .extract({ left: 157, top: 222, width: 600, height: 600 })
    .resize(1024, 1024, { fit: "cover" })
    .flatten({ background: "#f06432" })
    .png({ compressionLevel: 9 })
    .toFile(iconPath);
}

// A abertura usa apenas o símbolo oficial, com cantos realmente transparentes.
// O mockup da marca contém um celular e um quadriculado opaco e nunca deve ser
// usado como tela de abertura. O mesmo PNG serve ao launch screen e à animação.
const roundedMask = Buffer.from('<svg width="1024" height="1024"><rect width="1024" height="1024" rx="246" fill="white"/></svg>');
await sharp(iconPath)
  .composite([{ input: roundedMask, blend: "dest-in" }])
  .png({ compressionLevel: 9 })
  .toFile(splashPath);

if (!splashOnly) {
  fs.mkdirSync(webPublicDir, { recursive: true });
  await sharp(iconPath)
    .resize(256, 256)
    .png({ compressionLevel: 9 })
    .toFile(path.join(webPublicDir, "brand-icon.png"));

  await sharp(iconPath)
    .resize(64, 64)
    .png({ compressionLevel: 9 })
    .toFile(path.join(webPublicDir, "favicon.png"));
}

const iosIconPath = path.join(iosAssetsDir, "AppIcon.appiconset/App-Icon-1024x1024@1x.png");
const iosSplashDir = path.join(iosAssetsDir, "SplashScreenLogo.imageset");

if (!splashOnly && fs.existsSync(path.dirname(iosIconPath))) {
  fs.copyFileSync(iconPath, iosIconPath);
}

if (fs.existsSync(iosSplashDir)) {
  for (const [scale, filename] of [[1, "image.png"], [2, "image@2x.png"], [3, "image@3x.png"]]) {
    const size = splashConfig.imageWidth * scale;
    await sharp(splashPath).resize(size, size).png().toFile(path.join(iosSplashDir, filename));
  }
}

console.log(splashOnly ? "Logo limpo da abertura gerado." : "Ativos da marca gerados para mobile, iOS nativo e web.");

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

for (const source of [iconSource]) {
  if (!fs.existsSync(source)) {
    throw new Error(`Arquivo de marca não encontrado: ${source}`);
  }
}

fs.mkdirSync(assetsDir, { recursive: true });
fs.mkdirSync(webPublicDir, { recursive: true });

// O arquivo de origem contém o símbolo dentro de uma prancha. Este recorte fica
// completamente dentro do quadrado laranja para produzir um ícone sem o fundo
// quadriculado da prancha e sem transparência, como a App Store exige.
await sharp(iconSource)
  .extract({ left: 157, top: 222, width: 600, height: 600 })
  .resize(1024, 1024, { fit: "cover" })
  .flatten({ background: "#f06432" })
  .png({ compressionLevel: 9 })
  .toFile(iconPath);

// A abertura deve mostrar apenas o símbolo da marca. O mockup anterior incluía
// uma prancha com fundo quadriculado, que acabou sendo exibida no app.
await sharp(iconPath)
  .png({ compressionLevel: 9 })
  .toFile(splashPath);

await sharp(iconPath)
  .resize(256, 256)
  .png({ compressionLevel: 9 })
  .toFile(path.join(webPublicDir, "brand-icon.png"));

await sharp(iconPath)
  .resize(64, 64)
  .png({ compressionLevel: 9 })
  .toFile(path.join(webPublicDir, "favicon.png"));

const iosIconPath = path.join(iosAssetsDir, "AppIcon.appiconset/App-Icon-1024x1024@1x.png");
const iosSplashDir = path.join(iosAssetsDir, "SplashScreenLegacy.imageset");

if (fs.existsSync(path.dirname(iosIconPath))) {
  fs.copyFileSync(iconPath, iosIconPath);
}

if (fs.existsSync(iosSplashDir)) {
  for (const filename of ["image.png", "image@2x.png", "image@3x.png"]) {
    fs.copyFileSync(splashPath, path.join(iosSplashDir, filename));
  }
}

console.log("Ativos da marca gerados para mobile, iOS nativo e web.");

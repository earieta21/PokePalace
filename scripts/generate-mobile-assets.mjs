import { readdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const sourcePath = path.join(root, "public", "icons", "icon-1024.png");
const brandColor = "#F4C2B0";

async function makeTransparentLogo() {
  const { data, info } = await sharp(sourcePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let index = 0; index < data.length; index += 4) {
    const whiteness = Math.min(data[index], data[index + 1], data[index + 2]);
    if (whiteness > 225) {
      data[index + 3] = Math.round(255 * (255 - whiteness) / 30);
    }
  }

  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  }).png().toBuffer();
}

async function renderContained(source, target, width, height, scale, background) {
  const logoSize = Math.round(Math.min(width, height) * scale);
  const logo = await sharp(source)
    .resize(logoSize, logoSize, { fit: "contain" })
    .png()
    .toBuffer();

  await sharp({
    create: { width, height, channels: 4, background },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(target);
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(fullPath));
    else files.push(fullPath);
  }
  return files;
}

const transparentLogo = await makeTransparentLogo();

const iosIcon = path.join(
  root,
  "ios", "App", "App", "Assets.xcassets", "AppIcon.appiconset", "AppIcon-512@2x.png",
);
await renderContained(sourcePath, iosIcon, 1024, 1024, 0.9, "#FFFFFF");

const androidResources = path.join(root, "android", "app", "src", "main", "res");
const androidFiles = await walk(androidResources);
for (const file of androidFiles.filter((item) => /ic_launcher(?:_foreground|_round)?\.png$/.test(item))) {
  const metadata = await sharp(file).metadata();
  const foreground = file.endsWith("ic_launcher_foreground.png");
  await renderContained(
    foreground ? transparentLogo : sourcePath,
    file,
    metadata.width,
    metadata.height,
    foreground ? 0.66 : 0.9,
    foreground ? { r: 0, g: 0, b: 0, alpha: 0 } : "#FFFFFF",
  );
}

const splashFiles = [
  ...androidFiles.filter((item) => item.endsWith(`${path.sep}splash.png`)),
  path.join(root, "ios", "App", "App", "Assets.xcassets", "Splash.imageset", "splash-2732x2732.png"),
  path.join(root, "ios", "App", "App", "Assets.xcassets", "Splash.imageset", "splash-2732x2732-1.png"),
  path.join(root, "ios", "App", "App", "Assets.xcassets", "Splash.imageset", "splash-2732x2732-2.png"),
];

for (const file of splashFiles) {
  const metadata = await sharp(file).metadata();
  await renderContained(transparentLogo, file, metadata.width, metadata.height, 0.48, brandColor);
}

console.log("Iconos y pantallas de inicio móviles generados.");

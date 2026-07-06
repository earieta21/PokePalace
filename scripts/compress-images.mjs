import sharp from "sharp";
import { readdir, stat } from "fs/promises";
import { join, extname } from "path";

const ASSETS = "./src/assets";
const QUALITY = 72;       // webp quality (0-100)
const MAX_WIDTH = 600;    // max dimension for ingredient images
const ICON_SIZES = [192, 512]; // PWA icons

async function findWebp(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) files.push(...await findWebp(full));
    else if (extname(e.name).toLowerCase() === ".webp") files.push(full);
  }
  return files;
}

async function compressAll() {
  const files = await findWebp(ASSETS);
  let saved = 0;
  let count = 0;

  for (const file of files) {
    const before = (await stat(file)).size;
    const buf = await sharp(file)
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: QUALITY, effort: 6 })
      .toBuffer();

    if (buf.length < before) {
      const { writeFile } = await import("fs/promises");
      await writeFile(file, buf);
      saved += before - buf.length;
      count++;
      console.log(`✓ ${file.replace(ASSETS + "/", "")}  ${kb(before)} → ${kb(buf.length)}  (-${pct(before, buf.length)}%)`);
    } else {
      console.log(`  ${file.replace(ASSETS + "/", "")}  already optimal`);
    }
  }
  console.log(`\nCompressed ${count} files, saved ${kb(saved)} total`);
}

async function generatePwaIcons() {
  const { writeFile } = await import("fs/promises");
  const svgPath = "./public/icon.svg";

  for (const size of ICON_SIZES) {
    const outPath = `./public/icons/icon-${size}.png`;
    await sharp(svgPath)
      .resize(size, size)
      .png()
      .toFile(outPath);
    console.log(`✓ PWA icon ${size}×${size} → ${outPath}`);
  }

  // maskable: add 20% padding (safe zone)
  const padding = Math.round(512 * 0.1);
  await sharp(svgPath)
    .resize(512 - padding * 2, 512 - padding * 2)
    .extend({ top: padding, bottom: padding, left: padding, right: padding, background: "#4A7A5A" })
    .png()
    .toFile("./public/icons/icon-maskable-512.png");
  console.log("✓ PWA icon maskable 512×512 → public/icons/icon-maskable-512.png");
}

const kb = (b) => `${Math.round(b / 1024)}KB`;
const pct = (before, after) => Math.round((1 - after / before) * 100);

console.log("── Compressing images ─────────────────────");
await compressAll();
console.log("\n── Generating PWA icons ───────────────────");
await generatePwaIcons();

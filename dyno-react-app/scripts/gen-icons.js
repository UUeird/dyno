// Generates app icons from a single source image.
//
// Source: scripts/icon-source.png (square, 1024×1024 or larger recommended).
// Outputs (into public/):
//   favicon.ico         — multi-size for browser tabs
//   logo192.png         — PWA icon (Android home screen, manifest)
//   logo512.png         — PWA icon (larger displays, splash screens)
//   apple-touch-icon.png (180×180) — iOS "Add to Home Screen"
//   maskable-icon-512.png — Android adaptive icon with safe-zone padding
//
// If scripts/icon-source.png is missing we generate a placeholder "D" SVG
// rendered to PNG, so the pipeline still produces icons on a fresh checkout.

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const publicDir = path.resolve(__dirname, "..", "public");
const sourcePath = path.resolve(__dirname, "icon-source.png");

// Brand colors. Keep in sync with App.css var(--accent) / background.
const ACCENT = "#f5a623";
const BG = "#0a0a0a";

function placeholderSvg(size) {
  // Bold D centered on a dark square with the accent color.
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <rect width="${size}" height="${size}" fill="${BG}"/>
      <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central"
            font-family="Inter, system-ui, sans-serif" font-weight="800"
            font-size="${size * 0.62}" fill="${ACCENT}">D</text>
    </svg>
  `);
}

async function makeSource() {
  if (fs.existsSync(sourcePath)) {
    return sharp(sourcePath);
  }
  console.log("scripts/icon-source.png not found — using placeholder 'D' icon.");
  return sharp(placeholderSvg(1024), { density: 1024 });
}

async function generate() {
  const source = await makeSource();
  const buf = await source.png().toBuffer();

  // Standard PWA + Apple sizes
  const targets = [
    { name: "logo192.png", size: 192 },
    { name: "logo512.png", size: 512 },
    { name: "apple-touch-icon.png", size: 180 },
  ];
  for (const t of targets) {
    await sharp(buf).resize(t.size, t.size).png().toFile(path.join(publicDir, t.name));
  }

  // Maskable icon: pad inward so the adaptive-icon crop doesn't eat the design.
  // We render the source at 80% of canvas, centered, on the background color.
  await sharp({
    create: { width: 512, height: 512, channels: 4, background: BG },
  })
    .composite([
      {
        input: await sharp(buf).resize(409, 409).png().toBuffer(),
        gravity: "center",
      },
    ])
    .png()
    .toFile(path.join(publicDir, "maskable-icon-512.png"));

  // Favicon: classic 32×32 PNG saved as .ico. Browsers also accept PNG-in-.ico,
  // and sharp can't natively write .ico — but a 32×32 PNG with the .ico extension
  // works in every modern browser, and CRA's index.html links to favicon.ico so
  // we keep the filename.
  await sharp(buf).resize(32, 32).png().toFile(path.join(publicDir, "favicon.ico"));

  console.log("Generated icons into public/");
}

generate().catch((err) => {
  console.error("Icon generation failed:", err);
  process.exit(1);
});

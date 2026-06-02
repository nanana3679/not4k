import { chromium } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { basename, dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1] ?? fallback;
};

const SOURCE = resolve(ROOT, getArg("--input", "gear.png"));
const OUT_DIR = resolve(ROOT, getArg("--out-dir", "public/lab/gear-light"));

const SOURCE_OUT = resolve(OUT_DIR, "gear-source.png");
const BASE_OUT = resolve(OUT_DIR, "gear-base.png");
const GLOW_OUT = resolve(OUT_DIR, "gear-glow.png");
const META_OUT = resolve(OUT_DIR, "gear-metadata.json");

if (!existsSync(SOURCE)) {
  throw new Error(`Missing source image: ${SOURCE}`);
}

if (!existsSync(OUT_DIR)) {
  mkdirSync(OUT_DIR, { recursive: true });
}

const sourceBuffer = readFileSync(SOURCE);
const sourceDataUrl = `data:image/png;base64,${sourceBuffer.toString("base64")}`;

const browser = await chromium.launch();
const page = await browser.newPage();

const result = await page.evaluate(async ({ dataUrl, sourceName }) => {
  const clamp01 = (value) => Math.min(1, Math.max(0, value));
  const clamp255 = (value) => Math.max(0, Math.min(255, Math.round(value)));

  const image = new Image();
  image.src = dataUrl;
  await image.decode();

  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = width;
  sourceCanvas.height = height;
  const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  sourceCtx.drawImage(image, 0, 0);

  const source = sourceCtx.getImageData(0, 0, width, height);
  const base = new ImageData(width, height);
  const glow = new ImageData(width, height);

  const boxes = {
    left: { minX: width, minY: height, maxX: 0, maxY: 0, count: 0 },
    right: { minX: width, minY: height, maxX: 0, maxY: 0, count: 0 },
  };

  let glowPixels = 0;
  let alphaTotal = 0;

  const markBox = (side, x, y) => {
    const box = boxes[side];
    box.minX = Math.min(box.minX, x);
    box.minY = Math.min(box.minY, y);
    box.maxX = Math.max(box.maxX, x);
    box.maxY = Math.max(box.maxY, y);
    box.count += 1;
  };

  for (let i = 0; i < source.data.length; i += 4) {
    const pixelIndex = i / 4;
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    const r = source.data[i];
    const g = source.data[i + 1];
    const b = source.data[i + 2];
    const a = source.data[i + 3];

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const chroma = max - min;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const coloredLight = clamp01((chroma - 28) / 105) * clamp01((max - 110) / 120);
    const hotLight = clamp01((r - 135) / 100) * clamp01((r - Math.max(g, b) + 12) / 80);
    const coolLight = clamp01((Math.max(g, b) - 130) / 105) * clamp01((Math.max(g, b) - r + 8) / 85);
    const brightColored = Math.max(coloredLight, hotLight * 0.85, coolLight);
    const mask = a > 8 && luma > 52 ? clamp01(brightColored) : 0;

    const glowAlpha = clamp255(a * Math.min(1, mask * 1.35));
    glow.data[i] = r;
    glow.data[i + 1] = g;
    glow.data[i + 2] = b;
    glow.data[i + 3] = glowAlpha;

    const dim = mask * 0.68;
    const neutral = luma * 0.55;
    base.data[i] = clamp255(r * (1 - dim) + neutral * dim);
    base.data[i + 1] = clamp255(g * (1 - dim) + neutral * dim);
    base.data[i + 2] = clamp255(b * (1 - dim) + neutral * dim);
    base.data[i + 3] = a;

    if (glowAlpha > 18) {
      glowPixels += 1;
      alphaTotal += glowAlpha;
    }

    const isColumnY = y > height * 0.04 && y < height * 0.76;
    const isSideX = x < width * 0.42 || x > width * 0.58;
    if (isColumnY && isSideX && glowAlpha > 64) {
      markBox(x < width / 2 ? "left" : "right", x, y);
    }
  }

  const serializeBox = (box, fallback) => {
    if (box.count === 0) return fallback;
    const padX = Math.round(width * 0.018);
    const padY = Math.round(height * 0.012);
    const x = Math.max(0, box.minX - padX);
    const y = Math.max(0, box.minY - padY);
    const maxX = Math.min(width - 1, box.maxX + padX);
    const maxY = Math.min(height - 1, box.maxY + padY);
    return {
      x,
      y,
      width: maxX - x + 1,
      height: maxY - y + 1,
    };
  };

  const baseCanvas = document.createElement("canvas");
  baseCanvas.width = width;
  baseCanvas.height = height;
  baseCanvas.getContext("2d").putImageData(base, 0, 0);

  const glowCanvas = document.createElement("canvas");
  glowCanvas.width = width;
  glowCanvas.height = height;
  glowCanvas.getContext("2d").putImageData(glow, 0, 0);

  return {
    width,
    height,
    basePng: baseCanvas.toDataURL("image/png").split(",")[1],
    glowPng: glowCanvas.toDataURL("image/png").split(",")[1],
    metadata: {
      width,
      height,
      source: sourceName,
      glowPixels,
      averageGlowAlpha: glowPixels === 0 ? 0 : alphaTotal / glowPixels,
      columnBoxes: {
        left: serializeBox(boxes.left, {
          x: Math.round(width * 0.18),
          y: Math.round(height * 0.08),
          width: Math.round(width * 0.18),
          height: Math.round(height * 0.66),
        }),
        right: serializeBox(boxes.right, {
          x: Math.round(width * 0.64),
          y: Math.round(height * 0.08),
          width: Math.round(width * 0.18),
          height: Math.round(height * 0.66),
        }),
      },
    },
  };
}, { dataUrl: sourceDataUrl, sourceName: basename(SOURCE) });

await browser.close();

writeFileSync(SOURCE_OUT, sourceBuffer);
writeFileSync(BASE_OUT, Buffer.from(result.basePng, "base64"));
writeFileSync(GLOW_OUT, Buffer.from(result.glowPng, "base64"));
writeFileSync(META_OUT, `${JSON.stringify(result.metadata, null, 2)}\n`);

console.log(`Split ${result.width}x${result.height} gear light layers`);
console.log(`  source: ${SOURCE_OUT}`);
console.log(`  base:   ${BASE_OUT}`);
console.log(`  glow:   ${GLOW_OUT}`);
console.log(`  meta:   ${META_OUT}`);

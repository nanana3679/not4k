/**
 * 기어 기둥 게이지 분리 스크립트
 *
 * gear.png에서 양 기둥 안의 게이지(발광 튜브)를 분리한다.
 * split-gear-light-layer.mjs와 같은 픽셀 휴리스틱을 쓰되,
 * dim 처리를 기둥 박스 내부로 한정하고 기둥별 게이지 크롭을 추가로 출력한다.
 *
 * 출력:
 *   public/gear/gear-frame.png        — 기둥 내부 게이지만 끈 프레임 (기둥 외 라이트는 원본 유지)
 *   public/gear/gear-gauge-left.png   — 왼쪽 기둥 게이지 크롭 (발광 레이어, 알파)
 *   public/gear/gear-gauge-right.png  — 오른쪽 기둥 게이지 크롭
 *   src/game/renderer/gearGaugeMetadata.json — 원본 좌표계 columnBoxes + 출력 스케일 (런타임 단일 소스)
 *
 * 사용: pnpm split:gear [--input gear.png] [--scale 0.5]
 */

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
const OUTPUT_SCALE = Number(getArg("--scale", "0.5"));
const ASSET_DIR = resolve(ROOT, "public/gear");
const META_OUT = resolve(ROOT, "src/game/renderer/gearGaugeMetadata.json");

const FRAME_OUT = resolve(ASSET_DIR, "gear-frame.png");
const GAUGE_LEFT_OUT = resolve(ASSET_DIR, "gear-gauge-left.png");
const GAUGE_RIGHT_OUT = resolve(ASSET_DIR, "gear-gauge-right.png");

if (!existsSync(SOURCE)) {
  throw new Error(`Missing source image: ${SOURCE}`);
}
if (!Number.isFinite(OUTPUT_SCALE) || OUTPUT_SCALE <= 0 || OUTPUT_SCALE > 1) {
  throw new Error(`Invalid --scale: ${OUTPUT_SCALE} (0 < scale <= 1)`);
}

if (!existsSync(ASSET_DIR)) {
  mkdirSync(ASSET_DIR, { recursive: true });
}

const sourceBuffer = readFileSync(SOURCE);
const sourceDataUrl = `data:image/png;base64,${sourceBuffer.toString("base64")}`;

const browser = await chromium.launch();
const page = await browser.newPage();

const result = await page.evaluate(async ({ dataUrl, sourceName, outputScale }) => {
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

  // --- Pass 1: 라이트 마스크 계산 + 기둥 발광 bounding box 검출 ---
  // (split-gear-light-layer.mjs와 동일한 휴리스틱)
  const masks = new Float32Array(width * height);
  const boxes = {
    left: { minX: width, minY: height, maxX: 0, maxY: 0, count: 0 },
    right: { minX: width, minY: height, maxX: 0, maxY: 0, count: 0 },
  };

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
    masks[pixelIndex] = mask;

    const glowAlpha = clamp255(a * Math.min(1, mask * 1.35));
    const isColumnY = y > height * 0.04 && y < height * 0.76;
    const isSideX = x < width * 0.42 || x > width * 0.58;
    if (isColumnY && isSideX && glowAlpha > 64) {
      markBox(x < width / 2 ? "left" : "right", x, y);
    }
  }

  const serializeBox = (box) => {
    if (box.count === 0) {
      throw new Error("gauge column glow not detected");
    }
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

  const columnBoxes = {
    left: serializeBox(boxes.left),
    right: serializeBox(boxes.right),
  };

  // --- Pass 2: 프레임(기둥 내부만 dim) + 기둥별 게이지 크롭 합성 ---
  const frame = new ImageData(
    new Uint8ClampedArray(source.data),
    width,
    height,
  );
  const gauges = {
    left: new ImageData(columnBoxes.left.width, columnBoxes.left.height),
    right: new ImageData(columnBoxes.right.width, columnBoxes.right.height),
  };

  for (const side of ["left", "right"]) {
    const box = columnBoxes[side];
    const gauge = gauges[side];
    for (let by = 0; by < box.height; by++) {
      for (let bx = 0; bx < box.width; bx++) {
        const x = box.x + bx;
        const y = box.y + by;
        const pixelIndex = y * width + x;
        const i = pixelIndex * 4;
        const mask = masks[pixelIndex];
        const r = source.data[i];
        const g = source.data[i + 1];
        const b = source.data[i + 2];
        const a = source.data[i + 3];

        // 게이지 크롭: 발광 픽셀만 (split-gear-light-layer.mjs의 glow 공식)
        const gi = (by * box.width + bx) * 4;
        gauge.data[gi] = r;
        gauge.data[gi + 1] = g;
        gauge.data[gi + 2] = b;
        gauge.data[gi + 3] = clamp255(a * Math.min(1, mask * 1.35));

        // 프레임: 기둥 내부 라이트 픽셀만 dim (base 공식)
        const dim = mask * 0.68;
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const neutral = luma * 0.55;
        frame.data[i] = clamp255(r * (1 - dim) + neutral * dim);
        frame.data[i + 1] = clamp255(g * (1 - dim) + neutral * dim);
        frame.data[i + 2] = clamp255(b * (1 - dim) + neutral * dim);
      }
    }
  }

  // --- 다운스케일 후 PNG 추출 ---
  const toScaledPng = (imageData) => {
    const full = document.createElement("canvas");
    full.width = imageData.width;
    full.height = imageData.height;
    full.getContext("2d").putImageData(imageData, 0, 0);

    const scaled = document.createElement("canvas");
    scaled.width = Math.max(1, Math.round(imageData.width * outputScale));
    scaled.height = Math.max(1, Math.round(imageData.height * outputScale));
    const ctx = scaled.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(full, 0, 0, scaled.width, scaled.height);
    return scaled.toDataURL("image/png").split(",")[1];
  };

  return {
    framePng: toScaledPng(frame),
    gaugeLeftPng: toScaledPng(gauges.left),
    gaugeRightPng: toScaledPng(gauges.right),
    metadata: {
      source: sourceName,
      sourceWidth: width,
      sourceHeight: height,
      outputScale,
      columnBoxes,
    },
  };
}, { dataUrl: sourceDataUrl, sourceName: basename(SOURCE), outputScale: OUTPUT_SCALE });

await browser.close();

writeFileSync(FRAME_OUT, Buffer.from(result.framePng, "base64"));
writeFileSync(GAUGE_LEFT_OUT, Buffer.from(result.gaugeLeftPng, "base64"));
writeFileSync(GAUGE_RIGHT_OUT, Buffer.from(result.gaugeRightPng, "base64"));
writeFileSync(META_OUT, `${JSON.stringify(result.metadata, null, 2)}\n`);

console.log(`Split gear gauge layers from ${result.metadata.sourceWidth}x${result.metadata.sourceHeight} (scale ${OUTPUT_SCALE})`);
console.log(`  frame:       ${FRAME_OUT}`);
console.log(`  gauge left:  ${GAUGE_LEFT_OUT}`);
console.log(`  gauge right: ${GAUGE_RIGHT_OUT}`);
console.log(`  metadata:    ${META_OUT}`);

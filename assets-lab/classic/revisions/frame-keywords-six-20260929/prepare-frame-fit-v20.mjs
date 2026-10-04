import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Prepares the approved Classic frame painting (press-idle-deck v17) for the in-game fit preview
// (/lab/classic-frame-fit). Writes two files into public/lab/classic-frame-fit/:
//   frame-cutout.png  1024x1536 RGBA. The lane field between the pillars and the flat backdrop
//                     around the frame are transparent; pillars, key deck and bottom bar stay opaque.
//   frame-fit.json    The geometry the preview's layout uses, measured from pixels here.
// Measurements (all inclusive source pixel rows/columns):
//   laneLeft/laneRight  first/last column strictly inside the pillars' dark inner outlines.
//   laneBottom          last row where the lane window still spans laneLeft..laneRight. Below it the
//                       pillar bases chamfer inward; the preview anchors laneBottom + 1 (deck top) on
//                       the judgment line.
//   silhouetteTop       first row with any frame pixel (top of the armor crowns).
//   gaugeGlowTop        first row of the gauge tube glow: the longest lit run down the left tube's centre column.
//   seam                rows [y1, y2) whose removal lets the frame top reach the screen top in the
//                       "cut" mode, chosen where the pillar rows above and below the cut match best.
// Usage: node assets-lab/classic/revisions/frame-keywords-six-20260929/prepare-frame-fit-v20.mjs [--debug <dir>]

const revisionDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(revisionDir, '../../../..');
const sourcePath = resolve(revisionDir, 'press-idle-deck-v17-input.png');
const outputDir = resolve(workspaceRoot, 'public/lab/classic-frame-fit');
const debugIndex = process.argv.indexOf('--debug');
const debugTarget = debugIndex === -1 ? null : process.argv[debugIndex + 1];
if (debugIndex !== -1 && !debugTarget) throw new Error('--debug needs a folder path.');
const debugDir = debugTarget ? resolve(debugTarget) : null;

// Game layout from src/game/renderer/constants.ts: a 400-unit lane area and the judgment line
// 160 units above the bottom of the 600-unit screen. The cut height depends on both.
const GAME = { laneAreaWidth: 400, judgmentLineY: 600 - 160 };
// Backdrop around the frame: flat dark gray near (24, 28, 33) with a soft vignette (measured range
// about 19-29 / 23-33 / 27-39). Colours within `fill` of the reference are flooded from the image
// border; within `feather` px of the flooded area, alpha ramps from 0 at `fill` to 1 at `opaque`.
const BACKDROP = { reference: [24, 28, 33], fill: 14, opaque: 40, feather: 2 };
// Rows used to measure the straight pillar edges (below the lane box top, above the chamfers).
const EDGE_BAND = { top: 200, bottom: 1000 };

const browser = await chromium.launch();
const page = await browser.newPage();
const result = await page.evaluate(async ({ dataUrl, GAME, BACKDROP, EDGE_BAND, debug }) => {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  const source = context.getImageData(0, 0, width, height).data;

  const at = (x, y) => (y * width + x) * 4;
  const lum = (x, y) => {
    const i = at(x, y);
    return 0.2126 * source[i] + 0.7152 * source[i + 1] + 0.0722 * source[i + 2];
  };
  const median = (values) => {
    const sorted = Float64Array.from(values).sort();
    return sorted[Math.floor(sorted.length / 2)];
  };
  const range = (from, to) => Array.from({ length: to - from + 1 }, (_, k) => from + k);

  // 1. Lane window edges: from the image centre walk outward over each column's median luminance
  //    (lane lines are brighter and pass) until the pillar's near-black inner outline.
  const centre = Math.floor(width / 2);
  const bandRows = range(EDGE_BAND.top, EDGE_BAND.bottom);
  const columnMedian = (x) => median(bandRows.map((y) => lum(x, y)));
  const field = median(range(centre - 110, centre + 110).flatMap((x) => bandRows.filter((y) => y % 7 === 0).map((y) => lum(x, y))));
  const outlineLimit = field * 0.25;
  let outlineLeft = centre;
  while (outlineLeft > 0 && columnMedian(outlineLeft) >= outlineLimit) outlineLeft--;
  let outlineRight = centre;
  while (outlineRight < width - 1 && columnMedian(outlineRight) >= outlineLimit) outlineRight++;
  const laneLeft = outlineLeft + 1;
  const laneRight = outlineRight - 1;

  // Straightness check: the same walk per row must stop on the same outline columns.
  const rowEdges = { left: [Infinity, -Infinity], right: [Infinity, -Infinity] };
  for (const y of bandRows) {
    let left = centre;
    while (left > 0 && lum(left, y) >= outlineLimit) left--;
    let right = centre;
    while (right < width - 1 && lum(right, y) >= outlineLimit) right++;
    rowEdges.left = [Math.min(rowEdges.left[0], left + 1), Math.max(rowEdges.left[1], left + 1)];
    rowEdges.right = [Math.min(rowEdges.right[0], right - 1), Math.max(rowEdges.right[1], right - 1)];
  }

  // 2. Lane bottom: the first row where a pillar base chamfer reaches the column next to either edge.
  let laneBottom = EDGE_BAND.bottom;
  for (let y = EDGE_BAND.bottom; y < height; y++) {
    const rowField = median(range(laneLeft + 8, laneRight - 8).map((x) => lum(x, y)));
    if (lum(laneLeft + 1, y) < rowField * 0.5 || lum(laneRight - 1, y) < rowField * 0.5) {
      laneBottom = y - 1;
      break;
    }
  }
  const deckTop = laneBottom + 1;

  // 3. Deck landmarks for the readouts. Key faces: rows where all four lane-centre columns are white.
  const laneSpan = (laneRight - laneLeft + 1) / 4;
  const keyColumns = [0, 1, 2, 3].map((lane) => Math.round(laneLeft + (lane + 0.5) * laneSpan));
  let keyFaceTop = -1;
  let keyFaceBottom = -1;
  for (let y = deckTop; y < height; y++) {
    const white = keyColumns.every((x) => lum(x, y) > 150);
    if (keyFaceTop < 0 && white) keyFaceTop = y;
    if (keyFaceTop >= 0 && !white) { keyFaceBottom = y - 1; break; }
  }
  // Bottom bar glow: saturated blue-cyan light (same test as scripts/split-gear-gauge.ts).
  const clamp01 = (value) => Math.min(1, Math.max(0, value));
  const blueLight = (x, y) => {
    const i = at(x, y);
    const [r, g, b] = [source[i], source[i + 1], source[i + 2]];
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    return clamp01((b - 120) / 100) * clamp01((b - r - 40) / 60) * clamp01((chroma - 40) / 40);
  };
  let barGlowTop = -1;
  let barGlowBottom = -1;
  for (let y = keyFaceBottom + 1; y < height; y++) {
    let glow = false;
    for (let x = laneLeft; x <= laneRight && !glow; x++) glow = blueLight(x, y) > 0.5;
    if (glow) { if (barGlowTop < 0) barGlowTop = y; barGlowBottom = y; }
  }
  // Gauge glow: the left-pillar column with the most blue-light rows runs down the tube's centre.
  let gaugeColumn = 0;
  let gaugeRows = -1;
  for (let x = 0; x < laneLeft; x++) {
    let rows = 0;
    for (let y = 0; y <= laneBottom; y++) if (blueLight(x, y) > 0.5) rows++;
    if (rows > gaugeRows) { gaugeRows = rows; gaugeColumn = x; }
  }
  // The tube is the longest lit run in that column (gaps up to 3 rows); the crown's short blue
  // accent above it is a separate run.
  let gaugeGlowTop = -1;
  let gaugeGlowBottom = -1;
  let runTop = -1;
  let runBottom = -10;
  const closeRun = () => {
    if (runTop >= 0 && runBottom - runTop > gaugeGlowBottom - gaugeGlowTop) { gaugeGlowTop = runTop; gaugeGlowBottom = runBottom; }
  };
  for (let y = 0; y <= laneBottom; y++) {
    if (blueLight(gaugeColumn, y) <= 0.5) continue;
    if (y - runBottom > 3) { closeRun(); runTop = y; }
    runBottom = y;
  }
  closeRun();
  // Deck bottom: the dark gap between the key housings and the bottom bar plate.
  let deckBottom = -1;
  for (let y = barGlowTop - 1; y > keyFaceBottom; y--) {
    if (median(range(laneLeft, laneRight).map((x) => lum(x, y))) < outlineLimit) { deckBottom = y; break; }
  }

  // 4. Cutout alpha. Lane window rows 0..laneBottom become transparent.
  const alpha = new Uint8ClampedArray(width * height).fill(255);
  const lane = new Uint8Array(width * height);
  for (let y = 0; y <= laneBottom; y++) {
    for (let x = laneLeft; x <= laneRight; x++) { alpha[y * width + x] = 0; lane[y * width + x] = 1; }
  }
  // Backdrop flood fill (4-connected) from every border pixel close to the backdrop colour.
  const [refR, refG, refB] = BACKDROP.reference;
  const distance = new Float32Array(width * height);
  for (let p = 0; p < width * height; p++) {
    const i = p * 4;
    distance[p] = Math.hypot(source[i] - refR, source[i + 1] - refG, source[i + 2] - refB);
  }
  const backdrop = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  const visit = (p) => {
    if (backdrop[p] || lane[p] || distance[p] > BACKDROP.fill) return;
    backdrop[p] = 1;
    queue[tail++] = p;
  };
  for (let x = 0; x < width; x++) { visit(x); visit((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { visit(y * width); visit(y * width + width - 1); }
  while (head < tail) {
    const p = queue[head++];
    const x = p % width;
    if (x > 0) visit(p - 1);
    if (x < width - 1) visit(p + 1);
    if (p >= width) visit(p - width);
    if (p < width * (height - 1)) visit(p + width);
  }
  for (let p = 0; p < width * height; p++) if (backdrop[p]) alpha[p] = 0;

  // Soft silhouette edge: pixels within `feather` px (chessboard distance) of the backdrop get alpha
  // from their colour distance, and their colour is un-mixed from the backdrop so no gray rim remains.
  const output = new Uint8ClampedArray(source);
  let softened = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      if (backdrop[p] || lane[p]) continue;
      let near = false;
      for (let dy = -BACKDROP.feather; dy <= BACKDROP.feather && !near; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -BACKDROP.feather; dx <= BACKDROP.feather; dx++) {
          const nx = x + dx;
          if (nx >= 0 && nx < width && backdrop[ny * width + nx]) { near = true; break; }
        }
      }
      if (!near) continue;
      const a = clamp01((distance[p] - BACKDROP.fill) / (BACKDROP.opaque - BACKDROP.fill));
      if (a >= 1) continue;
      softened++;
      alpha[p] = Math.round(a * 255);
      const i = p * 4;
      if (a > 0) {
        output[i] = (source[i] - (1 - a) * refR) / a;
        output[i + 1] = (source[i + 1] - (1 - a) * refG) / a;
        output[i + 2] = (source[i + 2] - (1 - a) * refB) / a;
      }
    }
  }
  for (let p = 0; p < width * height; p++) output[p * 4 + 3] = alpha[p];
  let silhouetteTop = -1;
  for (let y = 0; y < height && silhouetteTop < 0; y++) {
    for (let x = 0; x < width; x++) if (alpha[y * width + x] > 0) { silhouetteTop = y; break; }
  }
  let frameBottom = -1;
  for (let y = height - 1; y >= 0 && frameBottom < 0; y--) {
    for (let x = 0; x < width; x++) if (alpha[y * width + x] > 0) { frameBottom = y; break; }
  }

  // 5. Seam for the "cut" mode. Removing `removedRows` rows from the pillar section lifts the frame top
  //    to the screen top when the deck top stays on the judgment line at the lane-width scale.
  const scale = GAME.laneAreaWidth / (laneRight - laneLeft + 1);
  const removedRows = Math.round(deckTop - GAME.judgmentLineY / scale);
  const pillarColumns = [...range(0, laneLeft - 1), ...range(laneRight + 1, width - 1)];
  // Mean absolute difference of alpha-premultiplied RGB across the pillar columns.
  const rowDifference = (ya, yb) => {
    let sum = 0;
    for (const x of pillarColumns) {
      const ia = at(x, ya);
      const ib = at(x, yb);
      const aa = output[ia + 3] / 255;
      const ab = output[ib + 3] / 255;
      sum += Math.abs(output[ia] * aa - output[ib] * ab)
        + Math.abs(output[ia + 1] * aa - output[ib + 1] * ab)
        + Math.abs(output[ia + 2] * aa - output[ib + 2] * ab);
    }
    return sum / (pillarColumns.length * 3);
  };
  const candidates = [];
  for (let y1 = 1; y1 + removedRows <= deckTop; y1++) {
    candidates.push({ y1, y2: y1 + removedRows, cost: rowDifference(y1 - 1, y1 + removedRows) });
  }
  const best = candidates.reduce((winner, candidate) => (candidate.cost < winner.cost ? candidate : winner));
  const adjacent = range(1, deckTop - 1).map((y) => rowDifference(y - 1, y));

  const toPng = (pixels, w = width, h = height) => {
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    out.getContext('2d').putImageData(new ImageData(pixels, w, h), 0, 0);
    return out.toDataURL('image/png').split(',')[1];
  };

  const debugImages = {};
  if (debug) {
    const over = (background, rows = null) => {
      const keep = rows ?? range(0, height - 1);
      const pixels = new Uint8ClampedArray(width * keep.length * 4);
      keep.forEach((y, row) => {
        for (let x = 0; x < width; x++) {
          const i = at(x, y);
          const o = (row * width + x) * 4;
          const a = output[i + 3] / 255;
          for (let c = 0; c < 3; c++) pixels[o + c] = output[i + c] * a + background[c] * (1 - a);
          pixels[o + 3] = 255;
        }
      });
      return toPng(pixels, width, keep.length);
    };
    const alphaPixels = new Uint8ClampedArray(width * height * 4);
    for (let p = 0; p < width * height; p++) alphaPixels.set([alpha[p], alpha[p], alpha[p], 255], p * 4);
    debugImages['alpha'] = toPng(alphaPixels);
    debugImages['on-magenta'] = over([255, 0, 255]);
    // In-game flight backdrop colour (FlightBackground container background).
    debugImages['on-flight'] = over([8, 14, 27]);
    debugImages['cut-seam-on-magenta'] = over([255, 0, 255], [...range(0, best.y1 - 1), ...range(best.y2, height - 1)]);
    // Zoomed edge crops (6x nearest) over magenta: lane window corners, both straight edges, chamfers.
    const crops = [
      { x: laneLeft - 24, y: 80 }, { x: laneRight - 23, y: 80 },
      { x: laneLeft - 24, y: 600 }, { x: laneRight - 23, y: 600 },
      { x: laneLeft - 24, y: laneBottom - 24 }, { x: laneRight - 23, y: laneBottom - 24 },
    ];
    const size = 48;
    const zoom = 6;
    const tile = size * zoom;
    const columns = 2;
    const sheetWidth = columns * tile + (columns - 1) * 4;
    const sheetHeight = Math.ceil(crops.length / columns) * (tile + 4) - 4;
    const sheet = new Uint8ClampedArray(sheetWidth * sheetHeight * 4).fill(255);
    crops.forEach((crop, index) => {
      const ox = (index % columns) * (tile + 4);
      const oy = Math.floor(index / columns) * (tile + 4);
      for (let y = 0; y < tile; y++) {
        for (let x = 0; x < tile; x++) {
          const sx = crop.x + Math.floor(x / zoom);
          const sy = crop.y + Math.floor(y / zoom);
          const i = at(sx, sy);
          const a = output[i + 3] / 255;
          const o = ((oy + y) * sheetWidth + ox + x) * 4;
          sheet[o] = output[i] * a + 255 * (1 - a);
          sheet[o + 1] = output[i + 1] * a;
          sheet[o + 2] = output[i + 2] * a + 255 * (1 - a);
          sheet[o + 3] = 255;
        }
      }
    });
    debugImages['edge-zoom'] = toPng(sheet, sheetWidth, sheetHeight);
  }

  return {
    png: toPng(output),
    debugImages,
    geometry: {
      width,
      height,
      laneLeft,
      laneRight,
      laneBottom,
      deckTop,
      silhouetteTop,
      gaugeColumn,
      gaugeGlowTop,
      gaugeGlowBottom,
      keyFaceTop,
      keyFaceBottom,
      deckBottom,
      barGlowTop,
      barGlowBottom,
      frameBottom,
      seam: {
        y1: best.y1,
        y2: best.y2,
        removedRows,
        cost: Number(best.cost.toFixed(2)),
        typicalAdjacentRowCost: Number(median(adjacent).toFixed(2)),
        medianCandidateCost: Number(median(candidates.map((candidate) => candidate.cost)).toFixed(2)),
        layout: GAME,
      },
      measurement: {
        fieldLuminance: Number(field.toFixed(1)),
        edgeBandRows: [EDGE_BAND.top, EDGE_BAND.bottom],
        rowEdgeRange: rowEdges,
        backdrop: BACKDROP,
        softenedEdgePixels: softened,
      },
    },
  };
}, {
  dataUrl: `data:image/png;base64,${readFileSync(sourcePath).toString('base64')}`,
  GAME,
  BACKDROP,
  EDGE_BAND,
  debug: Boolean(debugDir),
});
await browser.close();

mkdirSync(outputDir, { recursive: true });
const pngPath = resolve(outputDir, 'frame-cutout.png');
const jsonPath = resolve(outputDir, 'frame-fit.json');
writeFileSync(pngPath, Buffer.from(result.png, 'base64'));
const geometry = {
  source: relative(workspaceRoot, sourcePath),
  generator: relative(workspaceRoot, fileURLToPath(import.meta.url)),
  ...result.geometry,
};
writeFileSync(jsonPath, `${JSON.stringify(geometry, null, 2)}\n`);
if (debugDir) {
  mkdirSync(debugDir, { recursive: true });
  for (const [name, base64] of Object.entries(result.debugImages)) {
    writeFileSync(resolve(debugDir, `${name}.png`), Buffer.from(base64, 'base64'));
  }
}
console.log(pngPath);
console.log(jsonPath);
console.log(JSON.stringify(result.geometry, null, 2));

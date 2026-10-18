import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAUGE_MIRROR_SUM, GLASS, GLASS_FEATHER, glassInteriorAlpha } from './frame-motion-shared.mjs';

// Prepares the approved Classic frame painting (press-idle-deck v17) for the game (RFD 0029). Writes the
// only copies of the gear the repository uses; the game renderer, /lab/gear and
// prepare-frame-motion-v21.mjs all read these files:
//   public/gear/gear.png                 1024x1536 RGBA, the skin-shared game gear (manifest `gearImage`).
//                                        The lane field between the pillars and the flat backdrop around
//                                        the gear are transparent; pillars, key deck and bottom bar stay opaque.
//   public/gear/gear-gauge-empty.png     192x832 RGBA, the altitude gauge's empty glass (manifest `gearGaugeEmpty`):
//                                        each tube's interior cut from gauge-empty-insert-v18.png with the accepted
//                                        demo's glass outline alpha (frame-motion-shared.mjs glassInteriorAlpha, the
//                                        same outline as the motion's gauge mask). The v18 image was regenerated as a
//                                        whole, so only pixels inside that outline are used. Each tube sits in a crop
//                                        aligned to 16px of the gear (left x 128-223, right x 800-895, rows 192-1023),
//                                        the two crops side by side, so atlas texels share the gear texture's mip
//                                        blocks and the transparent margin around the glass keeps mipmaps from bleeding.
//   src/game/renderer/gearGeometry.json  The geometry the renderer lays the gear out with, measured from pixels here,
//                                        plus `gauge`: the glass outline, the fill span and each tube's box and atlas place.
// Measurements (all inclusive source pixel rows/columns):
//   laneLeft/laneRight  first/last column strictly inside the pillars' dark inner outlines. The game fits
//                       this lane window exactly over its lane area.
//   laneBottom          last row where the lane window still spans laneLeft..laneRight. Below it the
//                       pillar bases chamfer inward; laneBottom + 1 is the deck top.
//   silhouetteTop       first row with any frame pixel (top of the armor crowns).
//   silhouetteLeft/silhouetteRight  first/last column with any frame pixel. The game keeps the keyboard
//                       display and the minimum screen width clear of these.
//   gaugeGlowTop        first row of the gauge tube glow: the longest lit run down the left tube's centre column.
//   laneOpeningBottom   last row of the painted lane field between the pillar bases' angled corners
//                       (deckTop .. this row), just above the key housings' rim. That trapezoid is cut
//                       out too, so the game lanes show through it; laneOpening holds the fitted corner
//                       edges, the per-row edges and the polygon (pixel-edge coordinates). The game's lane
//                       mask starts at laneOpeningBottom + 1 (the key rim).
//   silhouetteBottom    last row with any gear pixel. The game puts its bottom edge on the screen bottom.
// Usage: node assets-lab/classic/revisions/frame-keywords-six-20260929/prepare-frame-fit-v20.mjs [--debug <dir>]

const revisionDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(revisionDir, '../../../..');
const sourcePath = resolve(revisionDir, 'press-idle-deck-v17-input.png');
const gaugeSourcePath = resolve(revisionDir, 'gauge-empty-insert-v18.png');
const imagePath = resolve(workspaceRoot, 'public/gear/gear.png');
const gaugeImagePath = resolve(workspaceRoot, 'public/gear/gear-gauge-empty.png');
const geometryPath = resolve(workspaceRoot, 'src/game/renderer/gearGeometry.json');
const debugIndex = process.argv.indexOf('--debug');
const debugTarget = debugIndex === -1 ? null : process.argv[debugIndex + 1];
if (debugIndex !== -1 && !debugTarget) throw new Error('--debug needs a folder path.');
const debugDir = debugTarget ? resolve(debugTarget) : null;

// Backdrop around the frame: flat dark gray near (24, 28, 33) with a soft vignette (measured range
// about 19-29 / 23-33 / 27-39). Colours within `fill` of the reference are flooded from the image
// border; within `feather` px of the flooded area, alpha ramps from 0 at `fill` to 1 at `opaque`.
const BACKDROP = { reference: [24, 28, 33], fill: 14, opaque: 40, feather: 2 };
// Rows used to measure the straight pillar edges (below the lane box top, above the chamfers).
const EDGE_BAND = { top: 200, bottom: 1000 };
// Deck lane opening: walk each row from `walkStart` px inside lanes 1 and 4 outward while pixels stay
// within `fieldTolerance` luminance of the row's field (median of `referenceWidth` px there); the field
// ends where the centre columns rise more than `rimRise` above the lane field (the key rim); corner
// samples further than `fitTolerance` px from the first line fit are dropped before refitting.
const OPENING = { walkStart: 70, referenceWidth: 50, fieldTolerance: 6, rimRise: 10, fitTolerance: 1.5 };

const browser = await chromium.launch();
const page = await browser.newPage();
const result = await page.evaluate(async ({ dataUrl, BACKDROP, EDGE_BAND, OPENING, debug }) => {
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
  // 3b. Lane opening in the deck. Below laneBottom the pillar bases angle inward and the painted lane field
  //     (dark, with the lane lines) continues between the angled corners down to the key housings' rim.
  //     Its bottom is the last row whose field columns stay dark; each corner edge is a straight line
  //     fitted to where a per-row walk from inside lanes 1 and 4 meets the corner's dark outline.
  const lineColumns = new Set();
  for (let x = laneLeft; x <= laneRight; x++) {
    if (median(range(laneBottom - 49, laneBottom).map((y) => lum(x, y))) > field + 6) {
      for (let d = -3; d <= 3; d++) lineColumns.add(x + d);
    }
  }
  const fieldColumns = range(laneLeft + 40, laneRight - 40).filter((x) => !lineColumns.has(x));
  let laneOpeningBottom = deckTop;
  for (let y = deckTop; y < keyFaceTop; y++) {
    if (median(fieldColumns.map((x) => lum(x, y))) > field + OPENING.rimRise) break;
    laneOpeningBottom = y;
  }
  const edgeSamples = { left: [], right: [] };
  for (let y = deckTop; y <= laneOpeningBottom; y++) {
    for (const side of ['left', 'right']) {
      const outward = side === 'left' ? -1 : 1;
      const start = side === 'left' ? laneLeft + OPENING.walkStart : laneRight - OPENING.walkStart;
      const reference = median(range(0, OPENING.referenceWidth - 1).map((k) => lum(start - outward * k, y)));
      let x = start;
      while (x + outward >= laneLeft && x + outward <= laneRight && Math.abs(lum(x + outward, y) - reference) <= OPENING.fieldTolerance) x += outward;
      // Boundary between the corner (opaque) and the field in pixel-edge coordinates, at the row centre.
      edgeSamples[side].push({ y: y + 0.5, x: side === 'left' ? x : x + 1 });
    }
  }
  const fitLine = (samples) => {
    const solve = (points) => {
      const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
      const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
      let sxy = 0;
      let syy = 0;
      for (const point of points) { sxy += (point.y - meanY) * (point.x - meanX); syy += (point.y - meanY) ** 2; }
      const slope = syy > 0 ? sxy / syy : 0;
      return { slope, intercept: meanX - slope * meanY };
    };
    const first = solve(samples);
    const kept = samples.filter((point) => Math.abs(first.intercept + first.slope * point.y - point.x) <= OPENING.fitTolerance);
    const line = kept.length >= 2 ? solve(kept) : first;
    return { ...line, rowsUsed: kept.length, rows: samples.length };
  };
  const leftEdge = fitLine(edgeSamples.left);
  const rightEdge = fitLine(edgeSamples.right);
  const edgeAt = (edge, y) => edge.intercept + edge.slope * y;
  const round2 = (value) => Math.round(value * 100) / 100;

  // Bottom bar glow: saturated blue-cyan light (same test as the old scripts/split-gear-gauge.ts, removed in RFD 0029).
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
  // Lane opening alpha: rows deckTop..laneOpeningBottom between the fitted corner edges are transparent.
  // A pixel the edge line crosses keeps the share the corner covers, with the row's field colour un-mixed
  // from it (like the backdrop edge) so neither painted field nor a stair-stepped rim is left behind.
  const openingRows = [];
  let openingPixels = 0;
  for (let y = deckTop; y <= laneOpeningBottom; y++) {
    const fieldColour = [0, 1, 2].map((c) => median(fieldColumns.map((x) => source[at(x, y) + c])));
    const left = edgeAt(leftEdge, y + 0.5);
    const right = edgeAt(rightEdge, y + 0.5);
    openingRows.push([y, round2(left), round2(right)]);
    for (let x = Math.max(laneLeft, Math.floor(left)); x <= Math.min(laneRight, Math.ceil(right) - 1); x++) {
      const cover = Math.max(clamp01(left - x), clamp01(x + 1 - right));
      if (cover >= 1) continue;
      const p = y * width + x;
      alpha[p] = Math.round(cover * 255);
      if (cover === 0) { openingPixels++; continue; }
      const i = p * 4;
      for (let c = 0; c < 3; c++) output[i + c] = (source[i + c] - (1 - cover) * fieldColour[c]) / cover;
    }
  }
  const laneOpening = {
    top: deckTop,
    bottom: laneOpeningBottom,
    leftEdge: { slope: Number(leftEdge.slope.toFixed(4)), xAtTop: round2(edgeAt(leftEdge, deckTop)), xAtBottom: round2(edgeAt(leftEdge, laneOpeningBottom + 1)), rowsUsed: leftEdge.rowsUsed, rows: leftEdge.rows },
    rightEdge: { slope: Number(rightEdge.slope.toFixed(4)), xAtTop: round2(edgeAt(rightEdge, deckTop)), xAtBottom: round2(edgeAt(rightEdge, laneOpeningBottom + 1)), rowsUsed: rightEdge.rowsUsed, rows: rightEdge.rows },
    // Trapezoid corners (top-left, top-right, bottom-right, bottom-left) in pixel-edge coordinates.
    polygon: [
      [round2(edgeAt(leftEdge, deckTop)), deckTop], [round2(edgeAt(rightEdge, deckTop)), deckTop],
      [round2(edgeAt(rightEdge, laneOpeningBottom + 1)), laneOpeningBottom + 1], [round2(edgeAt(leftEdge, laneOpeningBottom + 1)), laneOpeningBottom + 1],
    ],
    // [row, left edge, right edge] at each row's centre.
    rows: openingRows,
    transparentPixels: openingPixels,
  };

  for (let p = 0; p < width * height; p++) output[p * 4 + 3] = alpha[p];
  let silhouetteTop = -1;
  for (let y = 0; y < height && silhouetteTop < 0; y++) {
    for (let x = 0; x < width; x++) if (alpha[y * width + x] > 0) { silhouetteTop = y; break; }
  }
  let silhouetteBottom = -1;
  for (let y = height - 1; y >= 0 && silhouetteBottom < 0; y--) {
    for (let x = 0; x < width; x++) if (alpha[y * width + x] > 0) { silhouetteBottom = y; break; }
  }
  let silhouetteLeft = -1;
  for (let x = 0; x < width && silhouetteLeft < 0; x++) {
    for (let y = 0; y < height; y++) if (alpha[y * width + x] > 0) { silhouetteLeft = x; break; }
  }
  let silhouetteRight = -1;
  for (let x = width - 1; x >= 0 && silhouetteRight < 0; x--) {
    for (let y = 0; y < height; y++) if (alpha[y * width + x] > 0) { silhouetteRight = x; break; }
  }

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

    // Deck lane opening: both angled corners and the centre of the bottom edge (6x over magenta), and the
    // whole opening band over the in-game flight colour (3x).
    const openingCrops = [
      { x: laneLeft - 8, y: deckTop - 8 }, { x: laneRight - 39, y: deckTop - 8 },
      { x: Math.round(edgeAt(leftEdge, laneOpeningBottom)) - 24, y: laneOpeningBottom - 30 },
      { x: Math.round((laneLeft + laneRight) / 2) - 24, y: laneOpeningBottom - 30 },
    ];
    const openingSheet = new Uint8ClampedArray(sheetWidth * (2 * (tile + 4) - 4) * 4).fill(255);
    const openingSheetHeight = 2 * (tile + 4) - 4;
    openingCrops.forEach((crop, index) => {
      const ox = (index % columns) * (tile + 4);
      const oy = Math.floor(index / columns) * (tile + 4);
      for (let y = 0; y < tile; y++) {
        for (let x = 0; x < tile; x++) {
          const i = at(crop.x + Math.floor(x / zoom), crop.y + Math.floor(y / zoom));
          const a = output[i + 3] / 255;
          const o = ((oy + y) * sheetWidth + ox + x) * 4;
          openingSheet[o] = output[i] * a + 255 * (1 - a);
          openingSheet[o + 1] = output[i + 1] * a;
          openingSheet[o + 2] = output[i + 2] * a + 255 * (1 - a);
          openingSheet[o + 3] = 255;
        }
      }
    });
    debugImages['opening-zoom'] = toPng(openingSheet, sheetWidth, openingSheetHeight);
    const bandTop = deckTop - 20;
    const bandBottom = keyFaceTop + 20;
    const bandLeft = laneLeft - 30;
    const bandWidth = laneRight - laneLeft + 61;
    const scaleUp = 3;
    const band = new Uint8ClampedArray(bandWidth * scaleUp * (bandBottom - bandTop) * scaleUp * 4);
    for (let y = 0; y < (bandBottom - bandTop) * scaleUp; y++) {
      for (let x = 0; x < bandWidth * scaleUp; x++) {
        const i = at(bandLeft + Math.floor(x / scaleUp), bandTop + Math.floor(y / scaleUp));
        const a = output[i + 3] / 255;
        const o = (y * bandWidth * scaleUp + x) * 4;
        // In-game flight backdrop colour behind the frame, as on the stage.
        band[o] = output[i] * a + 8 * (1 - a);
        band[o + 1] = output[i + 1] * a + 14 * (1 - a);
        band[o + 2] = output[i + 2] * a + 27 * (1 - a);
        band[o + 3] = 255;
      }
    }
    debugImages['opening-on-flight'] = toPng(band, bandWidth * scaleUp, (bandBottom - bandTop) * scaleUp);
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
      laneOpeningBottom,
      laneOpening,
      silhouetteTop,
      silhouetteLeft,
      silhouetteRight,
      gaugeColumn,
      gaugeGlowTop,
      gaugeGlowBottom,
      keyFaceTop,
      keyFaceBottom,
      deckBottom,
      barGlowTop,
      barGlowBottom,
      silhouetteBottom,
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
  BACKDROP,
  EDGE_BAND,
  OPENING,
  debug: Boolean(debugDir),
});

// Altitude gauge empty glass (see the header). The tube boxes are the glass outline's bounding boxes (the
// right one mirrored); the outline alpha is computed here from the shared module, so the page only copies
// the v18 pixels into the atlas and encodes it. The fill span is the glass interior rows (wall top .. centre bottom).
const GAUGE_ALIGN = 16;
const alignDown = (value) => Math.floor(value / GAUGE_ALIGN) * GAUGE_ALIGN;
const alignUp = (value) => Math.ceil(value / GAUGE_ALIGN) * GAUGE_ALIGN;
const fillTop = GLASS.top[0];
const fillRows = GLASS.bottom[1] - fillTop + 1;
const cropY = alignDown(fillTop);
const cropHeight = alignUp(fillTop + fillRows) - cropY;
let atlasWidth = 0;
const gaugeTubes = [false, true].map((mirror) => {
  const x0 = mirror ? GAUGE_MIRROR_SUM - GLASS.x1 : GLASS.x0;
  const x1 = mirror ? GAUGE_MIRROR_SUM - GLASS.x0 : GLASS.x1;
  const cropX = alignDown(x0);
  const cropWidth = alignUp(x1 + 1) - cropX;
  const tube = { mirror, x0, x1, cropX, cropWidth, atlasLeft: atlasWidth };
  atlasWidth += cropWidth;
  return tube;
});
const gaugeAlpha = new Array(atlasWidth * cropHeight).fill(0);
for (const tube of gaugeTubes) {
  for (let y = 0; y < cropHeight; y++) {
    for (let x = 0; x < tube.cropWidth; x++) {
      const gearX = tube.cropX + x;
      const glassX = tube.mirror ? GAUGE_MIRROR_SUM - gearX : gearX;
      gaugeAlpha[y * atlasWidth + tube.atlasLeft + x] = Math.round(255 * glassInteriorAlpha(glassX, cropY + y));
    }
  }
}
const gaugePng = await page.evaluate(async ({ dataUrl, tubes, cropY, cropHeight, atlasWidth, alpha }) => {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  if (image.naturalWidth !== 1024 || image.naturalHeight !== 1536) {
    throw new Error(`gauge-empty-insert-v18.png must be 1024x1536 (aligned with the gear), got ${image.naturalWidth}x${image.naturalHeight}`);
  }
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  const atlas = new ImageData(atlasWidth, cropHeight);
  for (const tube of tubes) {
    const crop = context.getImageData(tube.cropX, cropY, tube.cropWidth, cropHeight).data;
    for (let y = 0; y < cropHeight; y++) {
      for (let x = 0; x < tube.cropWidth; x++) {
        const from = (y * tube.cropWidth + x) * 4;
        const to = y * atlasWidth + tube.atlasLeft + x;
        const a = alpha[to];
        // Outside the glass outline stays transparent black (no colour to bleed into mipmaps or the rim).
        if (a > 0) atlas.data.set([crop[from], crop[from + 1], crop[from + 2], a], to * 4);
      }
    }
  }
  const out = document.createElement('canvas');
  out.width = atlasWidth;
  out.height = cropHeight;
  out.getContext('2d').putImageData(atlas, 0, 0);
  return out.toDataURL('image/png').split(',')[1];
}, {
  dataUrl: `data:image/png;base64,${readFileSync(gaugeSourcePath).toString('base64')}`,
  tubes: gaugeTubes, cropY, cropHeight, atlasWidth, alpha: gaugeAlpha,
});
await browser.close();
const gauge = {
  image: relative(workspaceRoot, gaugeImagePath),
  source: relative(workspaceRoot, gaugeSourcePath),
  width: atlasWidth,
  height: cropHeight,
  glass: { ...GLASS, feather: GLASS_FEATHER, mirrorSum: GAUGE_MIRROR_SUM },
  // Fill span: level 0 covers all fillRows rows from fillTop with the empty glass, level 1 none.
  fillTop,
  fillRows,
  // Each tube's glass box on the gear (x, y, width, height) and the same box in the atlas (atlasX, atlasY).
  tubes: gaugeTubes.map((tube) => ({
    x: tube.x0, y: fillTop, width: tube.x1 - tube.x0 + 1, height: fillRows,
    atlasX: tube.atlasLeft + tube.x0 - tube.cropX, atlasY: fillTop - cropY,
  })),
};

// Sanity checks: a landmark the walk failed to find stays at -1, and the landmarks must keep their
// top-to-bottom order. Stop before writing anything rather than publish broken geometry.
const g = result.geometry;
const landmarks = ['laneLeft', 'laneRight', 'laneBottom', 'deckTop', 'laneOpeningBottom', 'silhouetteTop', 'silhouetteLeft', 'silhouetteRight', 'gaugeColumn', 'gaugeGlowTop', 'gaugeGlowBottom',
  'keyFaceTop', 'keyFaceBottom', 'deckBottom', 'barGlowTop', 'barGlowBottom', 'silhouetteBottom'];
const missing = landmarks.filter((key) => !Number.isInteger(g[key]) || g[key] < 0);
if (missing.length > 0) throw new Error(`Measurement failed (not found): ${missing.join(', ')}`);
const ordered = [
  ['silhouetteLeft', 'laneLeft'], ['laneLeft', 'laneRight'], ['laneRight', 'silhouetteRight'], ['silhouetteTop', 'gaugeGlowTop'], ['gaugeGlowTop', 'gaugeGlowBottom'], ['gaugeGlowBottom', 'deckTop'],
  ['deckTop', 'laneOpeningBottom'], ['laneOpeningBottom', 'keyFaceTop'], ['keyFaceTop', 'keyFaceBottom'], ['keyFaceBottom', 'deckBottom'], ['deckBottom', 'barGlowTop'],
  ['barGlowTop', 'barGlowBottom'], ['barGlowBottom', 'silhouetteBottom'],
];
const misordered = ordered.filter(([a, b]) => !(g[a] < g[b]) && !(a === 'barGlowTop' && g[a] === g[b]));
if (misordered.length > 0) throw new Error(`Measurement order broken: ${misordered.map(([a, b]) => `${a}(${g[a]}) < ${b}(${g[b]})`).join(', ')}`);
if (g.silhouetteBottom >= g.height) throw new Error(`silhouetteBottom ${g.silhouetteBottom} is outside the image`);
// The corners angle inward: the left edge moves right and the right edge left going down.
if (!(g.laneOpening.leftEdge.slope > 0 && g.laneOpening.rightEdge.slope < 0)) throw new Error(`Lane opening corners do not narrow downward: ${JSON.stringify(g.laneOpening)}`);

for (const path of [imagePath, gaugeImagePath, geometryPath]) mkdirSync(dirname(path), { recursive: true });
writeFileSync(imagePath, Buffer.from(result.png, 'base64'));
writeFileSync(gaugeImagePath, Buffer.from(gaugePng, 'base64'));
const geometry = {
  source: relative(workspaceRoot, sourcePath),
  generator: relative(workspaceRoot, fileURLToPath(import.meta.url)),
  image: relative(workspaceRoot, imagePath),
  ...result.geometry,
  gauge,
};
// Keep [x, y] and [row, left, right] lists on one line.
const json = JSON.stringify(geometry, null, 2)
  .replace(/\[\s+(-?[\d.]+),\s+(-?[\d.]+),\s+(-?[\d.]+)\s+\]/g, '[$1, $2, $3]')
  .replace(/\[\s+(-?[\d.]+),\s+(-?[\d.]+)\s+\]/g, '[$1, $2]');
writeFileSync(geometryPath, `${json}\n`);
if (debugDir) {
  mkdirSync(debugDir, { recursive: true });
  for (const [name, base64] of Object.entries(result.debugImages)) {
    writeFileSync(resolve(debugDir, `${name}.png`), Buffer.from(base64, 'base64'));
  }
}
console.log(imagePath);
console.log(gaugeImagePath);
console.log(geometryPath);
console.log(JSON.stringify(result.geometry, null, 2));

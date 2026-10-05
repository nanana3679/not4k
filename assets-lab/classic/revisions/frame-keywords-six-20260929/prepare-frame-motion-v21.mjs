import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BAND_HEIGHT, BAR, BREATHE, BUBBLES, CONTRAST, CONTRAST_INTERCEPT, EXCLUDED, GAUGE_MIRROR_SUM, glassPolygon, GLINT, HEIGHT,
  LIGHT, LIGHT_BAND, LIQUID, LIQUID_FLOW, measureFrameMotionLayers, readBaseBase64, RISE, UNLIT_FILL, WIDTH,
} from './frame-motion-shared.mjs';

// Bakes the approved Classic frame ambient motion (54-ambient-motion-v19.svg) into textures and
// JSON for the Pixi port in /lab/classic-frame-fit, so Pixi needs no runtime filters. Every mask
// and value comes from frame-motion-shared.mjs, the module assemble-ambient-v19.mjs builds the SVG
// from. Writes into public/lab/classic-frame-fit/motion/ (frame-space boxes in JSON):
//   armor-lit.png      A  contrast copy of the base (the SVG's saturate 0.9 + linear 1.1/-0.032 filter,
//                         rendered by Chromium), alpha = armor mask x frame-cutout alpha. Drawn at 128/255
//                         (#808080 half band), and tinted #04060a at 7% for the unlit dim (same alpha; the tinted
//                         colour stays within 1/255 of the SVG's flat #04060a at 7%)
//   armor-core.png     A  the same copy with the core's 3% white glow already composited (one sprite instead
//                         of copy + glow): alpha m(1 + g - gm), colour (C(1 - gm) + g) / (1 + g - gm), g = 8/255
//   accent-glow.png    C  T1: the SVG's blue accent layer composited over its bloom (stdDeviation 5 blur kept out
//                         of the excluded boxes, rendered by Chromium), i.e. the #fm-accent group at opacity 1
//   accent-overlap.png C  T2: the bloom under the accent alpha. The SVG group at breathe opacity o is
//                         o*T1 + o(1-o)*T2 (line over bloom inside the group), and screen is linear in it, so
//                         Pixi screens T1 at alpha o and T2 at alpha o(1-o) instead of screening line and bloom apart
//   liquid-tile.png    B  the 52x640 liquid tile with the SVG's horizontal edge fade baked into alpha
//   bar-mask.png       D  white, alpha = blue light inside the bar box (soft mask for the glints)
//   bar-base.png       D  the base pixels under the bar mask (the glints screen over this copy)
//   glint.png          D  one glint ellipse with the SVG's radial gradient (Chromium)
//   bubbles.png        B  the five bubble discs at their radii, one 16x16 cell each (Chromium)
//   frame-motion.json  texture pieces, glass polygons, bubble table, light/contrast/accent/bar values
// The armor and accent layers are mostly empty between the pillars, so each is stored as up to four
// pieces (left pillar, right pillar, and the bottom strip in two halves) cropped to their alpha box in
// multiples of 16px, packed as pillars side by side with each bottom half in its own row below.
// Every piece keeps a 16px border of its real neighbouring pixels in the atlas, so bilinear and mipmap
// sampling at a piece edge matches one whole texture, and atlas positions stay 16px-aligned with the
// frame so the mip levels line up with the frame texture. Re-running gives byte-identical files.
// Input: press-idle-deck-v17-input.png and the game frame public/gear/classic-frame.png (prepare-frame-fit-v20.mjs).
// Usage: node assets-lab/classic/revisions/frame-keywords-six-20260929/prepare-frame-motion-v21.mjs

const revisionDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(revisionDir, '../../../..');
const outputDir = resolve(workspaceRoot, 'public/lab/classic-frame-fit/motion');
const cutoutPath = resolve(workspaceRoot, 'public/gear/classic-frame.png');
const ALIGN = 16;
const PIECE_BORDER = 16;
// Piece regions (exclusive ends) and atlas rows: the pillars above the key deck's bottom share the first
// row; the bottom strip is split at the centre so each half (about 500px) fits under the pillar row.
const PIECE_REGIONS = [
  { name: 'left', row: 0, x0: 0, x1: 224, y0: 0, y1: 1344 },
  { name: 'right', row: 0, x0: 800, x1: WIDTH, y0: 0, y1: 1344 },
  { name: 'bottom-left', row: 1, x0: 0, x1: WIDTH / 2, y0: 1344, y1: HEIGHT },
  { name: 'bottom-right', row: 2, x0: WIDTH / 2, x1: WIDTH, y0: 1344, y1: HEIGHT },
];
const BUBBLE_CELL = 16;
// CSS 'ease-in-out' as cubic-bezier control points.
const EASINGS = { 'ease-in-out': [0.42, 0, 0.58, 1], linear: [0, 0, 1, 1] };
// SVG opacity 0.03 is drawn as an 8-bit alpha (round(0.03 x 255) = 8).
const GLOW = Math.round(CONTRAST.whiteGlow * 255) / 255;

const browser = await chromium.launch();
const page = await browser.newPage();
const layers = await measureFrameMotionLayers(page);
const baked = await page.evaluate(async (input) => {
  const { width, height, align, border, regions, cell, glow } = input;
  const layers = globalThis.__frameMotionLayers;
  if (!layers) throw new Error('measureFrameMotionLayers did not leave its layers in the page.');

  const loadImage = async (url) => {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  };
  const rasterize = async (image, w, h) => {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, w, h);
    return context.getImageData(0, 0, w, h);
  };
  const renderSvg = async (markup, w, h) => rasterize(await loadImage(`data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(markup)))}`), w, h);
  const toPng = (imageData) => {
    const out = document.createElement('canvas');
    out.width = imageData.width;
    out.height = imageData.height;
    out.getContext('2d').putImageData(imageData, 0, 0);
    return out.toDataURL('image/png').split(',')[1];
  };
  /** Copies box [x, x+w) x [y, y+h) of a full-frame RGBA array. */
  const crop = (data, box) => {
    const out = new ImageData(box.width, box.height);
    for (let row = 0; row < box.height; row++) {
      const from = ((box.y + row) * width + box.x) * 4;
      out.data.set(data.subarray(from, from + box.width * 4), row * box.width * 4);
    }
    return out;
  };
  const alignBox = (box) => {
    const left = Math.max(0, Math.floor(box.x0 / align) * align);
    const top = Math.max(0, Math.floor(box.y0 / align) * align);
    const right = Math.min(width, Math.ceil((box.x1 + 1) / align) * align);
    const bottom = Math.min(height, Math.ceil((box.y1 + 1) / align) * align);
    return { x: left, y: top, width: right - left, height: bottom - top };
  };
  /** Alpha bounding box (inclusive) inside a region, or null when the region is empty. */
  const alphaBounds = (data, region) => {
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (let y = region.y0; y < region.y1; y++) {
      for (let x = region.x0; x < region.x1; x++) {
        if (data[(y * width + x) * 4 + 3] === 0) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    return x1 < 0 ? null : { x0, y0, x1, y1 };
  };
  /**
   * Splits a full-frame layer into pieces (left, right, bottom), each cropped to its alpha box and stored
   * with a border of real neighbour pixels. Shelf packing: left and right side by side, bottom below.
   */
  const pieceAtlas = (data) => {
    const pieces = [];
    for (const region of regions) {
      const bounds = alphaBounds(data, region);
      if (!bounds) continue;
      const inner = alignBox(bounds);
      // Keep the inner box inside its region so pieces never draw the same frame pixel twice.
      const x = Math.max(inner.x, region.x0);
      const y = Math.max(inner.y, region.y0);
      const innerBox = { x, y, width: Math.min(inner.x + inner.width, region.x1) - x, height: Math.min(inner.y + inner.height, region.y1) - y };
      const stored = alignBox({
        x0: innerBox.x - border, y0: innerBox.y - border,
        x1: innerBox.x + innerBox.width + border - 1, y1: innerBox.y + innerBox.height + border - 1,
      });
      pieces.push({ name: region.name, row: region.row, inner: innerBox, stored });
    }
    // Shelf packing: pieces of a row side by side, rows stacked.
    let atlasWidth = 0;
    let atlasHeight = 0;
    for (const row of [...new Set(pieces.map((piece) => piece.row))].sort((a, b) => a - b)) {
      let cursorX = 0;
      let rowHeight = 0;
      for (const piece of pieces.filter((candidate) => candidate.row === row)) {
        piece.atlas = { x: cursorX, y: atlasHeight };
        cursorX += piece.stored.width;
        rowHeight = Math.max(rowHeight, piece.stored.height);
      }
      atlasWidth = Math.max(atlasWidth, cursorX);
      atlasHeight += rowHeight;
    }
    const atlas = new ImageData(atlasWidth, atlasHeight);
    for (const piece of pieces) {
      const block = crop(data, piece.stored);
      for (let row = 0; row < block.height; row++) {
        atlas.data.set(block.data.subarray(row * block.width * 4, (row + 1) * block.width * 4), ((piece.atlas.y + row) * atlasWidth + piece.atlas.x) * 4);
      }
    }
    return {
      png: toPng(atlas),
      width: atlasWidth,
      height: atlasHeight,
      pieces: pieces.map((piece) => ({
        ...piece.inner,
        atlasX: piece.atlas.x + piece.inner.x - piece.stored.x,
        atlasY: piece.atlas.y + piece.inner.y - piece.stored.y,
      })),
    };
  };
  const single = (imageData, x, y) => ({
    png: toPng(imageData),
    width: imageData.width,
    height: imageData.height,
    pieces: [{ x, y, width: imageData.width, height: imageData.height, atlasX: 0, atlasY: 0 }],
  });
  const straight = (target, i, premultiplied, alpha) => {
    if (alpha <= 0) return;
    target.data.set([...premultiplied.map((value) => Math.round((255 * value) / alpha)), Math.round(255 * alpha)], i);
  };

  // A: the frame cutout's alpha keeps the lit copy off the backdrop pixels the cutout removed (the
  // SVG draws over the full base, the game draws over the cutout).
  const cutout = await rasterize(await loadImage(input.cutoutUrl), width, height);
  const armorAlpha = new Uint8ClampedArray(width * height);
  let armorPixels = 0;
  let cutoutLimited = 0;
  for (let i = 0; i < width * height; i++) {
    const value = layers.armor.data[i * 4];
    const frameAlpha = cutout.data[i * 4 + 3];
    armorAlpha[i] = Math.round((value * frameAlpha) / 255);
    if (value > 0) {
      armorPixels++;
      if (frameAlpha < 255) cutoutLimited++;
    }
  }
  const litImage = await renderSvg(input.contrastSvg, width, height);
  const armorLit = new ImageData(width, height);
  const armorCore = new ImageData(width, height);
  for (let i = 0; i < width * height; i++) {
    const a = armorAlpha[i];
    if (a === 0) continue;
    const lit = [litImage.data[i * 4], litImage.data[i * 4 + 1], litImage.data[i * 4 + 2]];
    armorLit.data.set([...lit, a], i * 4);
    // Core: copy at alpha m, then white at alpha g*m on top, as one premultiplied pixel.
    const m = a / 255;
    straight(armorCore, i * 4, lit.map((value) => (value / 255) * m * (1 - glow * m) + glow * m), m * (1 + glow - glow * m));
  }

  // C: the accent layer as the SVG embeds it (decoded from the same PNG), and its bloom rendered with the
  // SVG's own filter and mask. T1 = line over bloom, T2 = bloom x line alpha (premultiplied maths).
  const accentLine = await rasterize(await loadImage(input.accentUrl), width, height);
  const bloom = await renderSvg(input.bloomSvg, width, height);
  const accentGlow = new ImageData(width, height);
  const accentOverlap = new ImageData(width, height);
  for (let i = 0; i < width * height * 4; i += 4) {
    const lineAlpha = accentLine.data[i + 3] / 255;
    const bloomAlpha = bloom.data[i + 3] / 255;
    if (lineAlpha === 0 && bloomAlpha === 0) continue;
    const line = [0, 1, 2].map((c) => (accentLine.data[i + c] / 255) * lineAlpha);
    const halo = [0, 1, 2].map((c) => (bloom.data[i + c] / 255) * bloomAlpha);
    straight(accentGlow, i, line.map((value, c) => value + halo[c] * (1 - lineAlpha)), lineAlpha + bloomAlpha * (1 - lineAlpha));
    straight(accentOverlap, i, halo.map((value) => value * lineAlpha), bloomAlpha * lineAlpha);
  }

  // B: liquid tile with the horizontal fade (stops 0, .22, .78, 1 across the 52px column) in alpha.
  const [, fadeIn, fadeOut] = input.fadeStops;
  const tile = new ImageData(layers.tile.width, layers.tile.height);
  tile.data.set(layers.tile.data);
  for (let x = 0; x < tile.width; x++) {
    const u = (x + 0.5) / tile.width;
    const fade = u < fadeIn ? u / fadeIn : u > fadeOut ? (1 - u) / (1 - fadeOut) : 1;
    for (let y = 0; y < tile.height; y++) tile.data[(y * tile.width + x) * 4 + 3] = Math.round(255 * Math.min(1, Math.max(0, fade)));
  }

  // D: soft bar mask and the base pixels under it.
  const barBox = alignBox(input.bar);
  const barMaskFull = new ImageData(width, height);
  for (let i = 0; i < width * height; i++) barMaskFull.data.set([255, 255, 255, layers.barMask.data[i * 4]], i * 4);
  const glintBox = alignBox(input.glintBox);
  const glint = await renderSvg(input.glintSvg, glintBox.width, glintBox.height);
  const bubbles = await renderSvg(input.bubblesSvg, cell * input.bubbleCount, cell);

  return {
    stats: { armorPixels, cutoutLimited },
    textures: {
      armorLit: pieceAtlas(armorLit.data),
      armorCore: pieceAtlas(armorCore.data),
      accentGlow: pieceAtlas(accentGlow.data),
      accentOverlap: pieceAtlas(accentOverlap.data),
      liquidTile: single(tile, input.liquidX, 0),
      barMask: single(crop(barMaskFull.data, barBox), barBox.x, barBox.y),
      barBase: single(crop(layers.source, barBox), barBox.x, barBox.y),
      glint: single(glint, glintBox.x, glintBox.y),
      bubbles: single(bubbles, 0, 0),
    },
  };
}, buildInput());
await browser.close();

function buildInput() {
  const base = `data:image/png;base64,${readBaseBase64()}`;
  const accent = `data:image/png;base64,${layers.accent}`;
  // The same filter as #fm-contrast in the SVG, applied to the same base image.
  const contrastSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs><filter id="fm-contrast" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
    <feColorMatrix type="saturate" values="${CONTRAST.saturation}"/>
    <feComponentTransfer>
      <feFuncR type="linear" slope="${CONTRAST.slope}" intercept="${CONTRAST_INTERCEPT}"/>
      <feFuncG type="linear" slope="${CONTRAST.slope}" intercept="${CONTRAST_INTERCEPT}"/>
      <feFuncB type="linear" slope="${CONTRAST.slope}" intercept="${CONTRAST_INTERCEPT}"/>
    </feComponentTransfer>
  </filter></defs>
  <image width="${WIDTH}" height="${HEIGHT}" href="${base}" filter="url(#fm-contrast)"/>
</svg>`;
  // The same bloom as the SVG's blurred accent copy: #fm-bloom on #fm-accent-image inside #fm-outside-excluded.
  const bloomSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <filter id="fm-bloom" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="${BREATHE.bloomStdDeviation}"/></filter>
    <image id="fm-accent-image" width="${WIDTH}" height="${HEIGHT}" href="${accent}"/>
    <mask id="fm-outside-excluded" maskUnits="userSpaceOnUse" x="0" y="0" width="${WIDTH}" height="${HEIGHT}">
      <rect width="${WIDTH}" height="${HEIGHT}" fill="#fff"/>
      ${EXCLUDED.map((box) => `<rect x="${box.x0}" y="${box.y0}" width="${box.x1 - box.x0 + 1}" height="${box.y1 - box.y0 + 1}" fill="#000"/>`).join('')}
    </mask>
  </defs>
  <g mask="url(#fm-outside-excluded)"><use href="#fm-accent-image" filter="url(#fm-bloom)"/></g>
</svg>`;
  const glintBox = { x0: GLINT.cx - GLINT.rx, x1: GLINT.cx + GLINT.rx - 1, y0: GLINT.cy - GLINT.ry, y1: GLINT.cy + GLINT.ry - 1 };
  const glintLeft = Math.floor(glintBox.x0 / ALIGN) * ALIGN;
  const glintTop = Math.floor(glintBox.y0 / ALIGN) * ALIGN;
  const glintWidth = Math.ceil((glintBox.x1 + 1) / ALIGN) * ALIGN - glintLeft;
  const glintHeight = Math.ceil((glintBox.y1 + 1) / ALIGN) * ALIGN - glintTop;
  const glintSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${glintWidth}" height="${glintHeight}" viewBox="${glintLeft} ${glintTop} ${glintWidth} ${glintHeight}">
  <defs><radialGradient id="fm-glint-gradient"><stop offset="0" stop-color="${GLINT.centerColor}" stop-opacity="${GLINT.centerOpacity}"/><stop offset="1" stop-color="${GLINT.edgeColor}" stop-opacity="0"/></radialGradient></defs>
  <ellipse cx="${GLINT.cx}" cy="${GLINT.cy}" rx="${GLINT.rx}" ry="${GLINT.ry}" fill="url(#fm-glint-gradient)"/>
</svg>`;
  // Bubble centres sit on pixel corners (integer cx/cy) as in the SVG, so each disc is centred on a cell corner.
  const bubblesSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${BUBBLE_CELL * BUBBLES.length}" height="${BUBBLE_CELL}">
  ${BUBBLES.map((bubble, index) => `<circle cx="${index * BUBBLE_CELL + BUBBLE_CELL / 2}" cy="${BUBBLE_CELL / 2}" r="${bubble.r}" fill="${RISE.color}"/>`).join('')}
</svg>`;
  return {
    width: WIDTH,
    height: HEIGHT,
    align: ALIGN,
    border: PIECE_BORDER,
    regions: PIECE_REGIONS,
    cell: BUBBLE_CELL,
    glow: GLOW,
    bubbleCount: BUBBLES.length,
    cutoutUrl: `data:image/png;base64,${readFileSync(cutoutPath).toString('base64')}`,
    accentUrl: accent,
    contrastSvg,
    bloomSvg,
    glintSvg,
    bubblesSvg,
    fadeStops: LIQUID_FLOW.fadeStops,
    liquidX: LIQUID.x,
    bar: BAR,
    glintBox,
  };
}

const files = {
  armorLit: 'armor-lit.png',
  armorCore: 'armor-core.png',
  accentGlow: 'accent-glow.png',
  accentOverlap: 'accent-overlap.png',
  liquidTile: 'liquid-tile.png',
  barMask: 'bar-mask.png',
  barBase: 'bar-base.png',
  glint: 'glint.png',
  bubbles: 'bubbles.png',
};
// Each texture: its PNG size and pieces. A piece draws atlas box (atlasX, atlasY, width, height) at frame
// position (x, y). The liquid tile repeats every tileHeight downwards from its piece; both glints start at
// the glint piece and move along x; the bubble atlas holds one bubbleCell-square cell per bubble.
const textures = Object.fromEntries(Object.entries(files).map(([key, file]) => {
  const texture = baked.textures[key];
  return [key, { file, width: texture.width, height: texture.height, pieces: texture.pieces }];
}));
const ms = (seconds) => Math.round(seconds * 1000);
const data = {
  version: 1,
  generator: 'assets-lab/classic/revisions/frame-keywords-six-20260929/prepare-frame-motion-v21.mjs',
  source: 'lab/image-galleries/frame-keywords-six-20260929/54-ambient-motion-v19.svg',
  frame: { width: WIDTH, height: HEIGHT },
  textures,
  light: {
    periodMs: ms(LIGHT.travel),
    fromY: LIGHT.from,
    toY: LIGHT.to,
    tiltDeg: LIGHT.tilt,
    pivotX: LIGHT_BAND.pivotX,
    bandX: LIGHT_BAND.x,
    bandWidth: LIGHT_BAND.width,
    outerHeight: BAND_HEIGHT,
    coreHeight: LIGHT.core,
    // Luminance of the #808080 half band in the SVG mask.
    halfAlpha: 128 / 255,
  },
  contrast: {
    saturation: CONTRAST.saturation,
    slope: CONTRAST.slope,
    pivot: CONTRAST.pivot,
    intercept: Number(CONTRAST_INTERCEPT),
    unlitDim: CONTRAST.unlitDim,
    unlitColor: UNLIT_FILL,
    // Baked into armor-core.png as 8-bit alpha.
    whiteGlow: CONTRAST.whiteGlow,
  },
  gauge: {
    mirrorSum: GAUGE_MIRROR_SUM,
    glass: [glassPolygon(false), glassPolygon(true)],
    liquid: { x: LIQUID.x, width: LIQUID.width, tileHeight: LIQUID_FLOW.tileHeight, periodMs: ms(LIQUID_FLOW.periodS), opacity: LIQUID_FLOW.opacity },
    rise: { ...RISE },
    bubbleCell: BUBBLE_CELL,
    bubbles: BUBBLES.map((bubble) => ({ x: bubble.x, r: bubble.r, durationMs: ms(bubble.duration), delayMs: ms(bubble.delay) })),
  },
  accent: {
    periodMs: ms(BREATHE.periodS),
    peakPercent: BREATHE.peakPercent,
    opacity: BREATHE.opacity,
    easing: EASINGS[BREATHE.easing],
    bloomStdDeviation: BREATHE.bloomStdDeviation,
  },
  bar: {
    periodMs: ms(GLINT.periodS),
    travel: GLINT.travel,
    peakPercent: GLINT.peakPercent,
    stopPercent: GLINT.stopPercent,
    easing: EASINGS[GLINT.easing],
    glint: { cx: GLINT.cx, cy: GLINT.cy, rx: GLINT.rx, ry: GLINT.ry },
  },
  stats: {
    armorPixels: baked.stats.armorPixels,
    // Armor pixels the SVG lights over its full base but the cutout makes (partly) transparent.
    armorPixelsLimitedByCutout: baked.stats.cutoutLimited,
  },
};

mkdirSync(outputDir, { recursive: true });
for (const [key, file] of Object.entries(files)) writeFileSync(resolve(outputDir, file), Buffer.from(baked.textures[key].png, 'base64'));
// Keep [x, y] points and short number lists on one line.
const json = JSON.stringify(data, null, 2).replace(/\[\s+(-?[\d.]+),\s+(-?[\d.]+)\s+\]/g, '[$1, $2]')
  .replace(/\[\s+(-?[\d.]+),\s+(-?[\d.]+),\s+(-?[\d.]+),\s+(-?[\d.]+)\s+\]/g, '[$1, $2, $3, $4]');
writeFileSync(resolve(outputDir, 'frame-motion.json'), `${json}\n`);
for (const file of [...Object.values(files), 'frame-motion.json']) console.log(relative(workspaceRoot, resolve(outputDir, file)));
console.log(`armor pixels ${baked.stats.armorPixels}, limited by the cutout ${baked.stats.cutoutLimited}`);
for (const [key, texture] of Object.entries(textures)) {
  const drawn = texture.pieces.reduce((sum, piece) => sum + piece.width * piece.height, 0);
  console.log(`${key}: ${texture.width}x${texture.height}, ${texture.pieces.length} piece(s), drawn area ${drawn}px`);
}

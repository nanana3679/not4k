import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CAP_EASING, COLORS, DEPTH, GLOW_EASING, HEIGHT, LIGHTS, MIRROR_SUM, PRESSED_KEYS, RELEASE, WIDTH,
  afterglowLight, baseKey, composeIdle, keyRegion, litAt, offset, pressedPixels, regionAlpha, whiteMs,
} from './button-press-shared.mjs';
import { ALIGN, FRAME_GAP, alignedCrop, packColumns } from './gear-buttons-atlas.mjs';

// Bakes the accepted 15px press plus hold-count depth steps (15/20/25/30px, RFD 0027), single pale cyan,
// double gold, cap back in 40ms, glow out in 150ms with the white leaving first into layers for the game gear.
// Base measurements and pixel math come from button-press-shared.mjs; depth steps extend the approved 15px press.
// Writes the only copies the game and /lab/gear read:
//   public/gear/gear-buttons.png             RGBA atlas (skin-shared manifest key `gearButtons`). For each of the four
//                                            keys: glow single/double at four depths (pressed, lit pixels, drawn normally),
//                                            tint single/double (the afterglow light: the light the press adds over
//                                            idle times the colour's channel gains, drawn additively) and the cap
//                                            cover (the key's own idle pixels, drawn normally).
//   src/game/renderer/gearButtonGeometry.json  Where each layer sits on the gear (x, y, width, height in gear pixels)
//                                            and in the atlas (atlasX, atlasY), plus the release timing.
// Layer pixels follow the demo exactly: keys 1 and 2 are cut from the pressed sources (the generated key 1 image
// and v16) moved down by sinkCap to the chosen depth; keys 4 and 3 are their mirror images (x -> 1022 - x), like the
// demo's flipped canvases. The demo's tint canvas is idle + afterglow light drawn over idle, which equals adding the
// light, so the game keeps only the light (for keys 3 and 4 this also drops the mirrored idle the flipped tint canvas
// briefly showed, a difference within the deck's measured asymmetry). Each layer's alpha is the demo's feathered region alpha times the game gear's alpha
// (public/gear/gear.png), so nothing is painted where the gear is transparent: the lane window and the open deck
// between the angled corners show the game's own lanes, not the painted lane floor (the demo's light spill on that
// painted floor is dropped; the game's key beam lights the lane there instead). Outside the cut regions the layers
// are transparent, so gear pixels outside the key regions stay untouched.
// Each frame is cropped to the 16px-aligned box (gear coordinates) around the pixels it changes and placed at a
// 16px-aligned atlas position with a transparent gap of 16px, so mip levels line up with the gear texture and
// sampling never bleeds between frames. Input checks: the v16 raster must reproduce the demo's idle frame
// (press-idle-deck-v17-input.png) exactly, and the gear's opaque pixels must equal that idle frame, otherwise the
// script stops before writing.
// Usage: node assets-lab/classic/revisions/frame-keywords-six-20260929/prepare-gear-buttons-v22.mjs [--debug <dir>]
// (--debug writes deck crops at 1:1: idle, every key pressed in single and in double, and each release step.)

const revisionDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(revisionDir, '../../../..');
const galleryDir = resolve(workspaceRoot, 'lab/image-galleries/frame-keywords-six-20260929');
const inputs = {
  v16: { path: resolve(galleryDir, '53-white-core-frame-v16.svg'), type: 'image/svg+xml' },
  key1: { path: resolve(revisionDir, 'key1-press-insert-v17.png'), type: 'image/png' },
  idle: { path: resolve(revisionDir, 'press-idle-deck-v17-input.png'), type: 'image/png' },
  gear: { path: resolve(workspaceRoot, 'public/gear/gear.png'), type: 'image/png' },
};
const imagePath = resolve(workspaceRoot, 'public/gear/gear-buttons.png');
const geometryPath = resolve(workspaceRoot, 'src/game/renderer/gearButtonGeometry.json');
const debugIndex = process.argv.indexOf('--debug');
const debugTarget = debugIndex === -1 ? null : process.argv[debugIndex + 1];
if (debugIndex !== -1 && !debugTarget) throw new Error('--debug needs a folder path.');
const debugDir = debugTarget ? resolve(debugTarget) : null;
const DEPTHS = [DEPTH, 20, 25, 30];

const browser = await chromium.launch();
const page = await browser.newPage();

// Decodes an image the way the demo does (Image -> 1024x1536 canvas -> getImageData) and returns its RGBA bytes.
async function decode({ path, type }) {
  const base64 = await page.evaluate(async ({ dataUrl, width, height }) => {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    if (image.naturalWidth !== width || image.naturalHeight !== height) {
      throw new Error(`expected ${width}x${height}, got ${image.naturalWidth}x${image.naturalHeight}`);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, width, height);
    const data = context.getImageData(0, 0, width, height).data;
    let text = '';
    for (let index = 0; index < data.length; index += 0x8000) text += String.fromCharCode.apply(null, data.subarray(index, index + 0x8000));
    return btoa(text);
  }, { dataUrl: `data:${type};base64,${readFileSync(path).toString('base64')}`, width: WIDTH, height: HEIGHT });
  return new Uint8ClampedArray(Buffer.from(base64, 'base64'));
}

async function encodePng(pixels, width, height) {
  const base64 = await page.evaluate(({ data, width, height }) => {
    const bytes = Uint8ClampedArray.from(atob(data), (char) => char.charCodeAt(0));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').putImageData(new ImageData(bytes, width, height), 0, 0);
    return canvas.toDataURL('image/png').split(',')[1];
  }, { data: Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength).toString('base64'), width, height });
  return Buffer.from(base64, 'base64');
}

const sources = {};
for (const [name, input] of Object.entries(inputs)) sources[name] = await decode(input);
const { idle, gear } = sources;

// Input checks (see the header).
const demoIdle = composeIdle(sources.v16);
let rasterMismatch = 0;
let gearMismatch = 0;
for (let pixel = 0; pixel < WIDTH * HEIGHT; pixel++) {
  const index = pixel * 4;
  for (let channel = 0; channel < 3; channel++) {
    if (demoIdle[index + channel] !== idle[index + channel]) { rasterMismatch++; break; }
  }
  if (gear[index + 3] !== 255) continue;
  for (let channel = 0; channel < 3; channel++) {
    if (gear[index + channel] !== idle[index + channel]) { gearMismatch++; break; }
  }
}
if (rasterMismatch > 0) throw new Error(`The v16 raster does not reproduce press-idle-deck-v17-input.png (${rasterMismatch} pixels differ).`);
if (gearMismatch > 0) throw new Error(`public/gear/gear.png differs from press-idle-deck-v17-input.png in ${gearMismatch} opaque pixels.`);

const pressedByDepth = new Map(DEPTHS.map(depth => [depth, { 1: pressedPixels(1, sources, depth), 2: pressedPixels(2, sources, depth) }]));

/**
 * One layer of one key on the gear canvas: for each pixel (x, y) the colour and alpha the demo draws there, with the
 * alpha clipped by the gear's alpha. Mirrored keys read their base key's pixel at 1022 - x, like the demo's flipped canvas.
 */
function layerSampler(key, layer, color, depth = DEPTH) {
  if (layer === 'cap') {
    const region = keyRegion(key, 'cap');
    return { region, sample: (x, y) => ({ index: offset(x, y), pixels: idle, alpha: regionAlpha(region, x, y) }) };
  }
  const base = baseKey(key);
  const mirrored = key !== base;
  const lit = litAt(pressedByDepth.get(depth)[base], idle, color);
  const colorAt = layer === 'glow' ? lit : afterglowLight(lit, idle, LIGHTS[color].decayTint);
  const baseRegion = PRESSED_KEYS[base].glow;
  return {
    region: keyRegion(key, 'glow'),
    sample: (x, y) => {
      const sourceX = mirrored ? MIRROR_SUM - x : x;
      return { index: offset(sourceX, y), color: colorAt, alpha: regionAlpha(baseRegion, sourceX, y) };
    },
  };
}

// Renders a layer into canvas-sized RGBA rows inside its region and finds the box of pixels it changes.
function renderLayer(key, layer, color, depth = DEPTH) {
  const { region, sample } = layerSampler(key, layer, color, depth);
  const pixels = new Map();
  let box = null;
  for (let y = region.y0; y <= region.y1; y++) {
    for (let x = region.x0; x <= region.x1; x++) {
      const target = offset(x, y);
      const point = sample(x, y);
      const alpha = Math.round(255 * point.alpha * (gear[target + 3] / 255));
      if (alpha === 0) continue;
      const rgb = point.color ? point.color(point.index) : [point.pixels[point.index], point.pixels[point.index + 1], point.pixels[point.index + 2]];
      const clamped = Uint8ClampedArray.from(rgb);
      // The cap cover only hides the glow and tint while the key returns, so it keeps every pixel it covers;
      // the glow keeps the pixels that differ from the idle gear under it and the additive tint the pixels that add light.
      const changes = layer === 'cap'
        || (layer === 'glow' ? [0, 1, 2].some((channel) => clamped[channel] !== idle[target + channel]) : clamped.some((value) => value > 0));
      if (!changes) continue;
      pixels.set(target, [clamped[0], clamped[1], clamped[2], alpha]);
      box = box
        ? { x0: Math.min(box.x0, x), y0: Math.min(box.y0, y), x1: Math.max(box.x1, x), y1: Math.max(box.y1, y) }
        : { x0: x, y0: y, x1: x, y1: y };
    }
  }
  if (!box) throw new Error(`Key ${key} ${layer} ${color ?? ''} changes no gear pixel.`);
  return { key, layer, color, depth, pixels, crop: alignedCrop(box), changed: pixels.size };
}

const frames = [];
for (const key of [1, 2, 3, 4]) {
  for (const color of COLORS) for (const depth of DEPTHS) frames.push(renderLayer(key, 'glow', color, depth));
  // The cap returns to idle; its lingering light uses the original 15px pattern.
  for (const color of COLORS) frames.push(renderLayer(key, 'tint', color));
  frames.push(renderLayer(key, 'cap', null));
}

// Atlas: one column per key (four depths of each glow color, tint single/double, cap).
const columns = [1, 2, 3, 4].map((key) => frames.filter((frame) => frame.key === key));
const { width: atlasWidth, height: atlasHeight, places } = packColumns(columns.map((column) => column.map((frame) => frame.crop)));
const atlas = new Uint8ClampedArray(atlasWidth * atlasHeight * 4);
columns.forEach((column, columnIndex) => column.forEach((frame, rowIndex) => {
  const place = places[columnIndex][rowIndex];
  frame.place = place;
  for (const [target, rgba] of frame.pixels) {
    const pixel = target / 4;
    const x = pixel % WIDTH - frame.crop.x + place.atlasX;
    const y = Math.floor(pixel / WIDTH) - frame.crop.y + place.atlasY;
    atlas.set(rgba, (y * atlasWidth + x) * 4);
  }
}));

const frameJson = (frame) => ({ x: frame.crop.x, y: frame.crop.y, width: frame.crop.width, height: frame.crop.height, atlasX: frame.place.atlasX, atlasY: frame.place.atlasY });
const buttons = [1, 2, 3, 4].map((key) => {
  const find = (layer, color, depth = DEPTH) => frames.find((frame) => frame.key === key && frame.layer === layer && frame.color === color && frame.depth === depth);
  return {
    lane: key,
    glow: Object.fromEntries(COLORS.map((color) => [color, DEPTHS.map(depth => frameJson(find('glow', color, depth)))])),
    tint: Object.fromEntries(COLORS.map((color) => [color, frameJson(find('tint', color))])),
    cap: frameJson(find('cap', null)),
  };
});

// The demo's light spill on the painted lane floor that the game drops (gear alpha 0 there), for the record.
let droppedSpill = 0;
for (const key of [1, 2, 3, 4]) {
  const { region, sample } = layerSampler(key, 'glow', 'single');
  for (let y = region.y0; y <= region.y1; y++) {
    for (let x = region.x0; x <= region.x1; x++) {
      const target = offset(x, y);
      if (gear[target + 3] !== 0) continue;
      const point = sample(x, y);
      if (point.alpha === 0) continue;
      const rgb = point.color(point.index);
      if ([0, 1, 2].some((channel) => Math.abs(Math.round(rgb[channel]) - idle[target + channel]) > 2)) droppedSpill++;
    }
  }
}

const png = await encodePng(atlas, atlasWidth, atlasHeight);

if (debugDir) {
  // Deck crops at 1:1 over the in-game flight backdrop colour behind transparent gear pixels.
  const deck = { x0: 176, y0: 1024, x1: 847, y1: 1407 };
  const deckWidth = deck.x1 - deck.x0 + 1;
  const deckHeight = deck.y1 - deck.y0 + 1;
  const backdrop = [8, 14, 27];
  const compose = (draw) => {
    const out = new Uint8ClampedArray(deckWidth * deckHeight * 4);
    const canvas = new Float64Array(deckWidth * deckHeight * 3);
    for (let y = 0; y < deckHeight; y++) {
      for (let x = 0; x < deckWidth; x++) {
        const index = offset(deck.x0 + x, deck.y0 + y);
        const alpha = gear[index + 3] / 255;
        for (let channel = 0; channel < 3; channel++) canvas[(y * deckWidth + x) * 3 + channel] = gear[index + channel] * alpha + backdrop[channel] * (1 - alpha);
      }
    }
    // The tint layer adds its light; glow and cap are drawn normally (source over).
    const draw1 = (frame, opacity) => {
      if (opacity <= 0) return;
      for (const [target, rgba] of frame.pixels) {
        const pixel = target / 4;
        const x = pixel % WIDTH - deck.x0;
        const y = Math.floor(pixel / WIDTH) - deck.y0;
        if (x < 0 || y < 0 || x >= deckWidth || y >= deckHeight) continue;
        const alpha = (rgba[3] / 255) * opacity;
        for (let channel = 0; channel < 3; channel++) {
          const at = (y * deckWidth + x) * 3 + channel;
          canvas[at] = frame.layer === 'tint' ? canvas[at] + rgba[channel] * alpha : rgba[channel] * alpha + canvas[at] * (1 - alpha);
        }
      }
    };
    draw(draw1);
    for (let pixel = 0; pixel < deckWidth * deckHeight; pixel++) {
      for (let channel = 0; channel < 3; channel++) out[pixel * 4 + channel] = canvas[pixel * 3 + channel];
      out[pixel * 4 + 3] = 255;
    }
    return out;
  };
  const find = (key, layer, color, depth = DEPTH) => frames.find((frame) => frame.key === key && frame.layer === layer && frame.color === color && frame.depth === depth);
  const images = { idle: compose(() => {}) };
  for (const color of COLORS) {
    for (const depth of DEPTHS) images[`pressed-${color}-${depth}px`] = compose((draw) => { for (const key of [1, 2, 3, 4]) draw(find(key, 'glow', color, depth), 1); });
    // Release steps with the demo's linear-time opacities sampled at a few times (exact easing lives in the game code).
    for (const [name, tint, glow, cap] of [['release-20ms', 0.93, 0.55, 0.7], ['release-60ms', 0.62, 0, 1], ['release-120ms', 0.12, 0, 1]]) {
      images[`${name}-${color}`] = compose((draw) => {
        for (const key of [1, 2, 3, 4]) {
          draw(find(key, 'tint', color), tint);
          draw(find(key, 'glow', color), glow);
          draw(find(key, 'cap', null), cap);
        }
      });
    }
  }
  mkdirSync(debugDir, { recursive: true });
  for (const [name, pixels] of Object.entries(images)) writeFileSync(resolve(debugDir, `${name}.png`), await encodePng(pixels, deckWidth, deckHeight));
}
await browser.close();

mkdirSync(dirname(imagePath), { recursive: true });
writeFileSync(imagePath, png);
const geometry = {
  generator: relative(workspaceRoot, fileURLToPath(import.meta.url)),
  sources: Object.fromEntries(Object.entries(inputs).map(([name, input]) => [name, relative(workspaceRoot, input.path)])),
  image: relative(workspaceRoot, imagePath),
  width: atlasWidth,
  height: atlasHeight,
  align: ALIGN,
  gap: FRAME_GAP,
  // First hold keeps the approved 15px press; the second hold goes to 30px.
  depths: DEPTHS,
  pressMotion: { downMs: 60, upMs: 40, easing: CAP_EASING },
  // Release: the cap returns in capMs (capEasing), the white glow leaves in whiteMs and the afterglow in glowMs (glowEasing).
  release: { capMs: RELEASE.capMs, glowMs: RELEASE.glowMs, whiteMs: whiteMs(), capEasing: CAP_EASING, glowEasing: GLOW_EASING },
  lights: LIGHTS,
  // Draw order per key: tint, glow, cap. Frames are in gear pixels (x, y, width, height) and atlas pixels (atlasX, atlasY).
  buttons,
  stats: {
    changedPixels: Object.fromEntries(frames.map((frame) => [`${frame.key}-${frame.layer}${frame.color ? `-${frame.color}` : ''}${frame.layer === 'glow' ? `-${frame.depth}px` : ''}`, frame.changed])),
    droppedLaneFloorSpillPixels: droppedSpill,
  },
};
// Keep each frame box and each number list on one line.
const json = JSON.stringify(geometry, null, 2)
  .replace(/\{\s+"x": (\d+),\s+"y": (\d+),\s+"width": (\d+),\s+"height": (\d+),\s+"atlasX": (\d+),\s+"atlasY": (\d+)\s+\}/g,
    '{ "x": $1, "y": $2, "width": $3, "height": $4, "atlasX": $5, "atlasY": $6 }')
  .replace(/\[\s+(-?[\d.]+),\s+(-?[\d.]+),\s+(-?[\d.]+),\s+(-?[\d.]+)\s+\]/g, '[$1, $2, $3, $4]')
  .replace(/\[\s+(-?[\d.]+),\s+(-?[\d.]+),\s+(-?[\d.]+)\s+\]/g, '[$1, $2, $3]');
writeFileSync(geometryPath, `${json}\n`);
console.log(imagePath, `${atlasWidth}x${atlasHeight}`, `${png.length} bytes`);
console.log(geometryPath);
console.log(JSON.stringify(geometry.stats));

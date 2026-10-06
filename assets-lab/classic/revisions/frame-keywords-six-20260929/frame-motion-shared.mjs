import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Shared measurements and constants of the Classic frame ambient motion. assemble-ambient-v19.mjs
// builds the approved animated SVG from them, and prepare-frame-motion-v21.mjs bakes the same masks
// and values into Pixi textures and JSON for the game gear motion (and /lab/classic-gear). Changing a value here changes
// both outputs; the v19 SVG must stay byte-identical unless the approved look itself changes.

const revisionDir = dirname(fileURLToPath(import.meta.url));
export const BASE_PATH = resolve(revisionDir, 'press-idle-deck-v17-input.png');

export const WIDTH = 1024;
export const HEIGHT = 1536;
// Inclusive pixel boxes on the 1024x1536 canvas that motion must never touch.
export const EXCLUDED = [
  { name: 'lanes', x0: 222, x1: 801, y0: 0, y1: 1094 },
  { name: 'key deck', x0: 196, x1: 827, y0: 1095, y1: 1345 },
  { name: 'left gauge', x0: 118, x1: 221, y0: 150, y1: 1049 },
  { name: 'right gauge', x0: 802, x1: 905, y0: 150, y1: 1049 },
];
export const BAR = { x0: 360, x1: 663, y0: 1355, y1: 1420 };
// Glass interior of the left tube (same outline as press-animation.html); the right tube mirrors x to 1023 - x.
export const GLASS = { x0: 136, x1: 208, top: [196, 203], bottom: [1010, 1016] };
export const GAUGE_MIRROR_SUM = 1023;
// Inner liquid column of the left tube, inside both glass walls.
export const LIQUID = { x: 146, width: 52 };

// A: one light source seen as a wide slanted band. A single plane crosses both sides, so with the
// tilt the left and right armor are reached at slightly different heights. The band travels one way,
// from fully above the frame to fully below it, then starts over above the frame. Its reach has two
// hard-edged steps: a full core and half sides.
// Speed stays at about 54px/s (the 4600px band took 120s for 6440px); the band is shortened to
// 1380px so one pass, from fully above the frame to fully below it, takes 60s.
export const LIGHT = { travel: 60, tilt: -14, core: 840, half: 270 };
// How far the tilted band reaches above and below its centre line across the frame width; the band
// starts and ends that far (plus 2px) outside the frame, so the loop restart never shows.
const tiltRadians = (Math.abs(LIGHT.tilt) * Math.PI) / 180;
const bandReach = Math.ceil((LIGHT.core / 2 + LIGHT.half) / Math.cos(tiltRadians) + (WIDTH / 2) * Math.tan(tiltRadians) + 2);
LIGHT.from = -bandReach;
LIGHT.to = HEIGHT + bandReach;
// The band rectangle: 2424 wide from x -700, so it is centred on x 512 and still covers the frame
// width after the tilt. It rotates about (512, centre y).
export const LIGHT_BAND = { x: -700, width: 2424, pivotX: 512, halfFill: '#808080', coreFill: '#fff' };
// Lit copy: slightly desaturated so the light reads white, then contrast around a low pivot so it
// also reads brighter overall; unlit armor dims.
export const CONTRAST = { saturation: 0.9, slope: 1.1, pivot: 0.32, unlitDim: 0.07, whiteGlow: 0.03 };
export const UNLIT_FILL = '#04060a';
export const BAND_HEIGHT = LIGHT.core + 2 * LIGHT.half;
export const CONTRAST_INTERCEPT = (-CONTRAST.pivot * (CONTRAST.slope - 1)).toFixed(3);

// B: the liquid tile (slice + vertical mirror) flows up one tile height per period inside a rect
// that is taller than the tube; a horizontal fade keeps the tile edges off the glass walls.
export const LIQUID_FLOW = { periodS: 10, tileHeight: 640, rectHeight: 1700, opacity: 0.45, fadeStops: [0, 0.22, 0.78, 1] };
// Bubbles inside the left tube; the right tube reuses them mirrored.
export const BUBBLES = [
  { x: 150, r: 2.2, duration: 7.5, delay: -1.2 },
  { x: 166, r: 1.6, duration: 9.5, delay: -5.8 },
  { x: 181, r: 2.6, duration: 6.4, delay: -3.1 },
  { x: 192, r: 1.4, duration: 8.6, delay: -7.4 },
  { x: 158, r: 1.8, duration: 10.2, delay: -0.4 },
];
// Every bubble starts at y 1004 and rises 790px linearly; opacity fades in until 8% and out after 88%.
export const RISE = { startY: 1004, distance: 790, fadeInPercent: 8, fadeOutPercent: 88, opacity: 0.75, color: '#e6fbff' };
// C: the blue accent layer and its blurred copy breathe together (ease-in-out, peak at 50%).
export const BREATHE = { periodS: 4.4, peakPercent: 50, opacity: 0.85, easing: 'ease-in-out', bloomStdDeviation: 5 };
// D: two glints leave the bar centre outward; opacity peaks at 15%, travel and fade end at 55%.
export const GLINT = {
  periodS: 3.2, travel: 170, peakPercent: 15, stopPercent: 55, easing: 'ease-in-out',
  cx: 512, cy: 1387, rx: 46, ry: 22, centerColor: '#f2fdff', centerOpacity: 0.95, edgeColor: '#7fe6ff',
};

/** CSS/SVG number text as the approved SVG writes it: 0.75 -> ".75", 10 -> "10". */
export function decimal(value) {
  return String(value).replace(/^(-?)0\./, '$1.');
}

/** Glass outline: straight walls with elliptical ends that follow the metal cap rims. */
export function glassPath(mirror) {
  const radiusX = (GLASS.x1 - GLASS.x0) / 2;
  const x = (value) => (mirror ? GAUGE_MIRROR_SUM - value : value);
  const [topWall, topCenter] = GLASS.top;
  const [bottomWall, bottomCenter] = GLASS.bottom;
  const sweep = mirror ? 0 : 1;
  return [
    `M${x(GLASS.x0)} ${topWall}`,
    `A${radiusX} ${topCenter - topWall} 0 0 ${1 - sweep} ${x(GLASS.x1)} ${topWall}`,
    `L${x(GLASS.x1)} ${bottomWall}`,
    `A${radiusX} ${bottomCenter - bottomWall} 0 0 ${sweep} ${x(GLASS.x0)} ${bottomWall}`,
    'Z',
  ].join(' ');
}

/**
 * The same outline as glassPath(false) as a polygon (left tube): the top arc dips from the walls
 * (y 196) to y 203 in the middle, the bottom arc bulges from y 1010 to 1016. `segments` per arc.
 */
export function glassPolygon(mirror, segments = 24) {
  const radiusX = (GLASS.x1 - GLASS.x0) / 2;
  const centreX = GLASS.x0 + radiusX;
  const [topWall, topCenter] = GLASS.top;
  const [bottomWall, bottomCenter] = GLASS.bottom;
  const points = [];
  // Top arc from the left wall (angle pi) through the lowest point (pi/2) to the right wall (0).
  for (let i = 0; i <= segments; i++) {
    const angle = Math.PI - (Math.PI * i) / segments;
    points.push([centreX + radiusX * Math.cos(angle), topWall + (topCenter - topWall) * Math.sin(angle)]);
  }
  // Bottom arc from the right wall (0) through the lowest point (pi/2) to the left wall (pi).
  for (let i = 0; i <= segments; i++) {
    const angle = (Math.PI * i) / segments;
    points.push([centreX + radiusX * Math.cos(angle), bottomWall + (bottomCenter - bottomWall) * Math.sin(angle)]);
  }
  const round = (value) => Math.round(value * 1000) / 1000 + 0;
  return points.map(([px, py]) => [round(mirror ? GAUGE_MIRROR_SUM - px : px), round(py)]);
}

export function readBaseBase64() {
  return readFileSync(BASE_PATH).toString('base64');
}

/**
 * Measures the motion masks from the idle frame pixels inside a Playwright page.
 * Returns base64 PNGs (1024x1536 armor/accent/bar masks and the 52x640 liquid tile) and keeps the
 * raw ImageData in the page as globalThis.__frameMotionLayers so a later page.evaluate in the same
 * page can derive more outputs from exactly the same values.
 *   armor   gray, every frame part the light can fall on (backdrop, lanes, deck, gauges, bar and blue light excluded)
 *   accent  RGBA, the base colours with alpha = how much the pixel is blue light (outside the excluded boxes and the bar)
 *   bar     gray, blue light inside the bottom bar box
 */
export async function measureFrameMotionLayers(page) {
  return page.evaluate(async ({ dataUrl, width, height, excluded, bar, LIQUID }) => {
    const clamp01 = (value) => Math.min(1, Math.max(0, value));
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const source = context.getImageData(0, 0, width, height).data;
    const inBox = (box, x, y) => x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1;
    const isExcluded = (x, y) => excluded.some((box) => inBox(box, x, y));

    const armor = new ImageData(width, height);
    const accent = new ImageData(width, height);
    const barMask = new ImageData(width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const [r, g, b] = [source[i], source[i + 1], source[i + 2]];
        const max = Math.max(r, g, b);
        const chroma = max - Math.min(r, g, b);
        // Blue light: saturated blue-cyan glow, the old gear gauge split heuristic (scripts/split-gear-gauge.ts, removed in RFD 0029).
        const blue = clamp01((b - 120) / 100) * clamp01((b - r - 40) / 60) * clamp01((chroma - 40) / 40);
        // Backdrop around the frame: a flat dark gray near (24, 28, 33). Armor shadows are darker and bluer.
        const backdrop = Math.abs(r - 24) < 8 && Math.abs(g - 28) < 8 && Math.abs(b - 33) < 8;
        if (!isExcluded(x, y) && !inBox(bar, x, y)) {
          // Armor area: every frame part the light can fall on (metal faces and their shadow faces), not glowing parts.
          const armorValue = backdrop ? 0 : Math.round(255 * (1 - blue));
          armor.data.set([armorValue, armorValue, armorValue, 255], i);
          accent.data.set([r, g, b, Math.round(255 * blue)], i);
        } else {
          armor.data.set([0, 0, 0, 255], i);
        }
        const barValue = inBox(bar, x, y) ? Math.round(255 * blue) : 0;
        barMask.data.set([barValue, barValue, barValue, 255], i);
      }
    }
    const toPng = (imageData) => {
      const out = document.createElement('canvas');
      out.width = imageData.width;
      out.height = imageData.height;
      out.getContext('2d').putImageData(imageData, 0, 0);
      return out.toDataURL('image/png').split(',')[1];
    };

    // Liquid tile: the inner liquid of the left tube (walls left out), stacked with its vertical mirror so it loops.
    const slice = context.getImageData(LIQUID.x, 320, LIQUID.width, 320);
    const tile = new ImageData(LIQUID.width, 640);
    const row = LIQUID.width * 4;
    for (let y = 0; y < 320; y++) {
      tile.data.set(slice.data.subarray(y * row, (y + 1) * row), y * row);
      tile.data.set(slice.data.subarray(y * row, (y + 1) * row), (639 - y) * row);
    }
    globalThis.__frameMotionLayers = { source, armor, accent, barMask, tile };
    return { armor: toPng(armor), accent: toPng(accent), bar: toPng(barMask), liquidTile: toPng(tile) };
  }, {
    dataUrl: `data:image/png;base64,${readBaseBase64()}`,
    width: WIDTH,
    height: HEIGHT,
    excluded: EXCLUDED,
    bar: BAR,
    LIQUID,
  });
}

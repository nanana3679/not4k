// Shared measurements and pixel math of the Classic gear button press. The accepted demo
// (lab/image-galleries/frame-keywords-six-20260929/press-depth.html, merged in PR #271) builds its
// layers in the browser with exactly these values and functions; prepare-gear-buttons-v22.mjs bakes the
// same layers for the game gear (public/gear/gear-buttons.png + src/game/renderer/gearButtonGeometry.json).
// prepare-gear-buttons-v22.test.ts checks that every constant below still appears verbatim in the demo page,
// so a change to the accepted look has to change both. All boxes are inclusive pixel bounds on the
// 1024x1536 canvas (the gear painting's own coordinates).

export const WIDTH = 1024;
export const HEIGHT = 1536;
// Pixel x on the left of the deck mirrors pixel MIRROR_SUM - x on the right.
export const MIRROR_SUM = 1022;
// Inclusive pixel bounds on the 1024x1536 canvas with linear feather widths.
export const IDLE_REGIONS = {
  patch: { x0: 338, x1: 511, y0: 1092, y1: 1355, left: 12, right: 0, top: 12, bottom: 12 },
  gap: { x0: 486, x1: 536, y0: 1092, y1: 1299, left: 12, right: 12, top: 12, bottom: 12 },
};
// Keys 1 and 2 come from pressed images; keys 4 and 3 mirror them.
// Neighboring glow regions meet at the center of the gap between two keys.
export const PRESSED_KEYS = {
  1: {
    source: 'key1',
    mirror: 4,
    glow: { x0: 200, x1: 372, y0: 1092, y1: 1355, left: 12, right: 10, top: 12, bottom: 12 },
    cap: { x0: 220, x1: 366, y0: 1122, y1: 1270, left: 6, right: 6, top: 6, bottom: 6 },
  },
  2: {
    source: 'v16',
    mirror: 3,
    glow: { x0: 362, x1: 519, y0: 1092, y1: 1355, left: 10, right: 15, top: 12, bottom: 12 },
    cap: { x0: 370, x1: 504, y0: 1128, y1: 1268, left: 6, right: 6, top: 6, bottom: 6 },
  },
};
// How far each pressed source already shows its key top below idle (canvas px).
export const SOURCE_TRAVEL = { 1: 0, 2: 6 };
// Total travel the user chose for every key on 2026-10-13 (press-depth.html DEFAULT_DEPTH).
export const DEPTH = 15;
// Measured per-column outline of the pressed key cap in each source (see press-depth.html SINK).
export const SINK = {
  1: {
    columns: [221, 359],
    fixedAbove: [[221, 1207], [222, 1206], [226, 1201], [230, 1196], [234, 1191], [236, 1177], [238, 1174], [240, 1172], [242, 1165], [244, 1160], [246, 1138], [248, 1140], [254, 1140], [256, 1138], [258, 1136], [260, 1134], [262, 1129], [356, 1129], [359, 1131]],
    capTop: [[221, 1250], [222, 1243], [224, 1236], [226, 1225], [230, 1211], [234, 1199], [238, 1187], [242, 1174], [246, 1161], [250, 1147], [254, 1141], [258, 1138], [262, 1136], [352, 1136], [356, 1140], [359, 1144]],
    capBottom: [[221, 1252], [222, 1255], [224, 1258], [226, 1259], [228, 1261], [230, 1263], [338, 1263], [344, 1261], [350, 1258], [352, 1256], [354, 1250], [356, 1240], [359, 1230]],
    lip: [[221, 1269], [222, 1270], [224, 1271], [226, 1273], [240, 1272], [340, 1272], [344, 1271], [350, 1268], [356, 1265], [359, 1264]],
  },
  2: {
    columns: [374, 502],
    fixedAbove: [[374, 1157], [388, 1157], [390, 1139], [394, 1137], [396, 1135], [398, 1129], [486, 1129], [488, 1131], [490, 1135], [494, 1137], [496, 1138], [502, 1140]],
    capTop: [[374, 1228], [375, 1159], [388, 1159], [390, 1150], [392, 1148], [394, 1146], [396, 1144], [398, 1143], [486, 1143], [488, 1144], [490, 1146], [492, 1149], [494, 1150], [502, 1150]],
    capBottom: [[374, 1257], [376, 1259], [378, 1260], [380, 1261], [382, 1262], [384, 1263], [490, 1263], [492, 1262], [494, 1261], [496, 1260], [498, 1258], [500, 1256], [502, 1254]],
    lip: [[374, 1270], [376, 1271], [380, 1272], [496, 1272], [498, 1270], [500, 1269], [502, 1267]],
  },
};
export const MIN_SLOT = 2;
// Horizontal radius (px) for evening out the stretched wall between columns.
export const STRETCH_BLUR = 2;
export const LIGHTS = {
  // Pale cyan measured from the v16 surrounding light (sRGB channel gains).
  single: { decayTint: [0.25, 0.78, 1] },
  // Gold measured from the earlier generated double flash v10 (linear hue).
  double: { hue: [0.959, 0.643, 0.163], decayTint: [1, 0.82, 0.44] },
};
export const COLORS = ['single', 'double'];
// Release timing (press-depth.html DEFAULTS and CSS): the cap returns in capMs with cubic-bezier(.2, .6, .3, 1);
// the afterglow (tint) fades in glowMs with CSS ease-out; the white glow leaves first, in WHITE_SHARE of glowMs.
export const RELEASE = { capMs: 40, glowMs: 150 };
export const WHITE_SHARE = 0.35;
export const CAP_EASING = [0.2, 0.6, 0.3, 1];
// CSS 'ease-out'.
export const GLOW_EASING = [0, 0, 0.58, 1];

/** Linear feather of one axis: 0 outside [low, high], ramping over lowWidth / highWidth px inside. */
export function feather(value, low, high, lowWidth, highWidth) {
  if (value < low || value > high) return 0;
  const fromLow = lowWidth ? Math.min(1, (value - low + 1) / (lowWidth + 1)) : 1;
  const fromHigh = highWidth ? Math.min(1, (high - value + 1) / (highWidth + 1)) : 1;
  return fromLow * fromHigh;
}

export const regionAlpha = (region, x, y) => feather(x, region.x0, region.x1, region.left, region.right)
  * feather(y, region.y0, region.y1, region.top, region.bottom);

export const offset = (x, y) => (y * WIDTH + x) * 4;

export const mirrorRegion = (region) => ({ ...region, x0: MIRROR_SUM - region.x1, x1: MIRROR_SUM - region.x0, left: region.right, right: region.left });

/** The pressed source key (1 or 2) that key 1..4 is drawn from; keys 3 and 4 mirror 2 and 1. */
export const baseKey = (key) => Number(Object.keys(PRESSED_KEYS).find((base) => Number(base) === key || PRESSED_KEYS[base].mirror === key));

/** A key's own region (`glow` or `cap`) on the canvas: mirrored for keys 3 and 4. */
export function keyRegion(key, name) {
  const region = PRESSED_KEYS[baseKey(key)][name];
  return PRESSED_KEYS[key] ? region : mirrorRegion(region);
}

/** The idle frame of the demo: v16 with key 2 replaced by mirrored key 3 and the centre gap's light toned down. */
export function composeIdle(source, gapFix = true) {
  const idle = new Uint8ClampedArray(source);
  const patch = IDLE_REGIONS.patch;
  for (let y = patch.y0; y <= patch.y1; y++) {
    for (let x = patch.x0; x <= patch.x1; x++) {
      const alpha = regionAlpha(patch, x, y);
      const target = offset(x, y);
      const mirrored = offset(MIRROR_SUM - x, y);
      for (let channel = 0; channel < 3; channel++) {
        idle[target + channel] = source[target + channel] * (1 - alpha) + source[mirrored + channel] * alpha;
      }
    }
  }
  if (gapFix) {
    const gap = IDLE_REGIONS.gap;
    for (let y = gap.y0; y <= gap.y1; y++) {
      for (let x = gap.x0; x <= gap.x1; x++) {
        const alpha = regionAlpha(gap, x, y);
        const index = offset(x, y);
        const luminance = (idle[index] * 0.3 + idle[index + 1] * 0.59 + idle[index + 2] * 0.11) * 0.75;
        const neutral = [luminance * 0.95, luminance, luminance * 1.18];
        for (let channel = 0; channel < 3; channel++) {
          idle[index + channel] = idle[index + channel] * (1 - alpha) + neutral[channel] * alpha;
        }
      }
    }
  }
  return idle;
}

export const rgbAt = (pixels) => (index) => [pixels[index], pixels[index + 1], pixels[index + 2]];

/** Value of a measured polyline at column x, rounded to a whole row. */
export function polylineAt(points, x) {
  if (x <= points[0][0]) return points[0][1];
  for (let index = 1; index < points.length; index++) {
    const [x1, y1] = points[index];
    if (x > x1) continue;
    const [x0, y0] = points[index - 1];
    return Math.round(y0 + (y1 - y0) * (x - x0) / (x1 - x0));
  }
  return points[points.length - 1][1];
}

/**
 * Moves the measured cap of a pressed source `extra` rows further down, column by column (press-depth.html sinkCap).
 * Above the cap the back wall stretches over the uncovered rows; below it the cap slides over the dark slot and
 * under the lip. Rows outside the outline are copied as is. `height` defaults to the canvas height and exists for tests.
 */
export function sinkCap(pixels, outline, extra, width = WIDTH, height = HEIGHT) {
  if (extra <= 0) return pixels;
  const at = (x, y) => (y * width + x) * 4;
  const sunk = new Uint8ClampedArray(pixels);
  const [left, right] = outline.columns;
  const stretched = new Set();
  for (let x = left; x <= right; x++) {
    const top = polylineAt(outline.capTop, x);
    const bottom = polylineAt(outline.capBottom, x);
    if (top >= bottom) continue;
    const fixed = Math.min(polylineAt(outline.fixedAbove, x), top - 1);
    const end = polylineAt(outline.lip, x) - MIN_SLOT;
    for (let y = fixed; y < end; y++) {
      let sourceY = y;
      let lastRow = height - 1;
      if (y < top + extra) {
        // The wall never borrows the cap's own top edge, so the edge stays sharp.
        sourceY = fixed + (y - fixed) * (top - fixed) / (top + extra - fixed);
        lastRow = top - 1;
        stretched.add(at(x, y));
      } else if (y <= bottom + extra) sourceY = y - extra;
      const low = Math.floor(sourceY);
      const weight = sourceY - low;
      const target = at(x, y);
      const upper = at(x, low);
      const lower = at(x, Math.min(low + 1, lastRow));
      for (let channel = 0; channel < 3; channel++) {
        sunk[target + channel] = pixels[upper + channel] * (1 - weight) + pixels[lower + channel] * weight;
      }
    }
  }
  // Each column stretches by its own ratio, so the stretched wall is evened out
  // sideways across neighboring stretched pixels only; fixed pixels keep their edges.
  const stretchedCopy = new Uint8ClampedArray(sunk);
  for (const target of stretched) {
    const sum = [0, 0, 0];
    let count = 0;
    for (let step = -STRETCH_BLUR; step <= STRETCH_BLUR; step++) {
      const neighbor = target + step * 4;
      if (!stretched.has(neighbor)) continue;
      for (let channel = 0; channel < 3; channel++) sum[channel] += stretchedCopy[neighbor + channel];
      count++;
    }
    for (let channel = 0; channel < 3; channel++) sunk[target + channel] = sum[channel] / count;
  }
  return sunk;
}

/** Pressed pixels of base key 1 or 2 at the chosen depth: the source moved down by the travel it is still missing. */
export function pressedPixels(key, sources, depth = DEPTH) {
  const source = sources[PRESSED_KEYS[key].source];
  return sinkCap(source, SINK[key], depth - SOURCE_TRAVEL[key]);
}

/** The afterglow keeps only the light added over the idle frame, tinted by the identity color. */
export const tinted = (litAt, idle, decayTint) => (index) => litAt(index)
  .map((value, channel) => idle[index + channel] + Math.max(0, value - idle[index + channel]) * decayTint[channel]);

/**
 * The light the afterglow adds over the idle frame: tinted(...) minus idle, never negative. The demo draws the tint layer
 * (idle + this) right over the idle frame at opacity o, which equals adding o times this light, so the game stores only
 * this light and draws it with additive blending.
 */
export const afterglowLight = (litAt, idle, decayTint) => (index) => litAt(index)
  .map((value, channel) => Math.max(0, value - idle[index + channel]) * decayTint[channel]);

const toLinear = Array.from({ length: 256 }, (_, value) => (value / 255) ** 2.2);
const toSrgb = (value) => 255 * Math.min(1, Math.max(0, value)) ** (1 / 2.2);
const luminance = (rgb) => rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
const chromaOf = (rgb) => {
  const lowest = Math.min(...rgb);
  return rgb.map((value) => value - lowest);
};

/**
 * Keeps the pressed pixels and swaps only the extra color the light added (press-depth.html recolored).
 * Chroma is compared instead of brightness because the pressed key and the idle key do not share the same outline.
 */
export function recolored(pressed, idle, hue) {
  const direction = chromaOf(hue).map((value, _, chroma) => value / Math.max(...chroma));
  const directionLuminance = luminance(direction);
  return (index) => {
    const linear = [0, 1, 2].map((channel) => toLinear[pressed[index + channel]]);
    const idleChroma = chromaOf([0, 1, 2].map((channel) => toLinear[idle[index + channel]]));
    const colored = chromaOf(linear).map((value, channel) => Math.max(0, value - idleChroma[channel]));
    const strength = luminance(colored) / directionLuminance;
    return linear.map((value, channel) => toSrgb(value - colored[channel] + direction[channel] * strength));
  };
}

/** Lit pixels of a pressed source in one color: single keeps the pressed pixels, double recolors the added light gold. */
export function litAt(pressed, idle, color) {
  const light = LIGHTS[color];
  return light.hue ? recolored(pressed, idle, light.hue) : rgbAt(pressed);
}

/** The white glow's fade time: the share of the afterglow time it takes in the demo (Math.round(150 × 0.35) = 53). */
export const whiteMs = (glowMs = RELEASE.glowMs) => Math.round(glowMs * WHITE_SHARE);

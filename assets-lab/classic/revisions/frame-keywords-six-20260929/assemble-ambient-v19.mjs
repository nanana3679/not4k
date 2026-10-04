import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Builds the ambient-motion SVG for the Classic frame: the idle frame stays as the
// fixed bottom layer and four masked motion layers sit on top of it.
//   A  light source  one large light passes down over the frame as a wide slanted band with
//                    straight hard edges. Inside it the armor shows a brighter, higher-contrast copy
//                    of itself (cel-style core and half steps) and outside it dims (mask: armor area)
//   B  gauge liquid  the painted swirl flows up with bubbles (clip: measured glass interior)
//   C  blue accents  blue light lines on the outer armor breathe (layer: blue light pixels)
//   D  bottom bar    two glints flow outward inside the cyan bar (mask: bar light)
// Lanes, the key deck and the gauge glass are excluded from A, C and D.
// Usage: node assets-lab/classic/revisions/frame-keywords-six-20260929/assemble-ambient-v19.mjs [--debug <dir>]

const revisionDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(revisionDir, '../../../..');
const basePath = resolve(revisionDir, 'press-idle-deck-v17-input.png');
const outputPath = resolve(workspaceRoot, 'lab/image-galleries/frame-keywords-six-20260929/54-ambient-motion-v19.svg');
const debugIndex = process.argv.indexOf('--debug');
const debugDir = debugIndex === -1 ? null : resolve(process.argv[debugIndex + 1]);

const WIDTH = 1024;
const HEIGHT = 1536;
// Inclusive pixel boxes on the 1024x1536 canvas that motion must never touch.
const EXCLUDED = [
  { name: 'lanes', x0: 222, x1: 801, y0: 0, y1: 1094 },
  { name: 'key deck', x0: 196, x1: 827, y0: 1095, y1: 1345 },
  { name: 'left gauge', x0: 118, x1: 221, y0: 150, y1: 1049 },
  { name: 'right gauge', x0: 802, x1: 905, y0: 150, y1: 1049 },
];
const BAR = { x0: 360, x1: 663, y0: 1355, y1: 1420 };
// Glass interior of the left tube (same outline as press-animation.html); the right tube mirrors x to 1023 - x.
const GLASS = { x0: 136, x1: 208, centerX: 172, top: [196, 203], bottom: [1010, 1016] };
const GAUGE_MIRROR_SUM = 1023;
// Inner liquid column of the left tube, inside both glass walls.
const LIQUID = { x: 146, width: 52 };

const browser = await chromium.launch();
const page = await browser.newPage();
const layers = await page.evaluate(async ({ dataUrl, width, height, excluded, bar, LIQUID }) => {
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
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      // Blue light: saturated blue-cyan glow, as in scripts/split-gear-gauge.ts.
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
  return { armor: toPng(armor), accent: toPng(accent), bar: toPng(barMask), liquidTile: toPng(tile) };
}, {
  dataUrl: `data:image/png;base64,${readFileSync(basePath).toString('base64')}`,
  width: WIDTH,
  height: HEIGHT,
  excluded: EXCLUDED,
  bar: BAR,
  LIQUID,
});
await browser.close();

if (debugDir) {
  mkdirSync(debugDir, { recursive: true });
  for (const name of ['armor', 'accent', 'bar', 'liquidTile']) writeFileSync(resolve(debugDir, `${name}.png`), Buffer.from(layers[name], 'base64'));
}

// Glass outline: straight walls with elliptical ends that follow the metal cap rims.
function glassPath(mirror) {
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

// A: one light source seen as a wide slanted band. A single plane crosses both sides, so with the
// tilt the left and right armor are reached at slightly different heights. The band travels one way,
// from fully above the frame to fully below it, then starts over above the frame. Its reach has two
// hard-edged steps: a full core and half sides.
// Speed stays at about 54px/s (the 4600px band took 120s for 6440px); the band is shortened to
// 1380px so one pass, from fully above the frame to fully below it, takes 60s (3220px).
const LIGHT = { travel: 60, from: -830, to: 2390, tilt: -14, core: 840, half: 270 };
// Lit copy: slightly desaturated so the light reads white, then contrast around a low pivot so it
// also reads brighter overall; unlit armor dims.
const CONTRAST = { saturation: 0.9, slope: 1.1, pivot: 0.32, unlitDim: 0.07, whiteGlow: 0.03 };
const bandHeight = LIGHT.core + 2 * LIGHT.half;
const lightBand = (fill, height) => `<rect x="-700" y="${-height / 2}" width="2424" height="${height}" fill="${fill}"/>`;
const contrastIntercept = (-CONTRAST.pivot * (CONTRAST.slope - 1)).toFixed(3);

// Bubbles inside the left tube; the right tube reuses them mirrored.
const BUBBLES = [
  { x: 150, r: 2.2, duration: 7.5, delay: -1.2 },
  { x: 166, r: 1.6, duration: 9.5, delay: -5.8 },
  { x: 181, r: 2.6, duration: 6.4, delay: -3.1 },
  { x: 192, r: 1.4, duration: 8.6, delay: -7.4 },
  { x: 158, r: 1.8, duration: 10.2, delay: -0.4 },
];
const bubbles = BUBBLES.map((bubble) => `<circle class="fm-bubble" cx="${bubble.x}" cy="1004" r="${bubble.r}" style="animation-duration:${bubble.duration}s;animation-delay:${bubble.delay}s"/>`).join('');

const png = (base64) => `data:image/png;base64,${base64}`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <title>Classic 프레임 움직임 · 큰 광원·게이지·발광선·하단 바</title>
  <style>
    .fm-layer { mix-blend-mode: screen; }
    .fm-orbit { transform-box: view-box; animation: fm-orbit ${LIGHT.travel}s linear infinite; }
    @keyframes fm-orbit { from { transform: translateY(${LIGHT.from}px); } to { transform: translateY(${LIGHT.to}px); } }
    .fm-unlit { opacity: ${CONTRAST.unlitDim}; }
    .fm-liquid-flow { transform-box: view-box; animation: fm-liquid-flow 10s linear infinite; }
    @keyframes fm-liquid-flow { from { transform: translateY(0); } to { transform: translateY(-640px); } }
    .fm-bubble { fill: #e6fbff; transform-box: view-box; animation-name: fm-rise; animation-timing-function: linear; animation-iteration-count: infinite; }
    @keyframes fm-rise { 0% { transform: translateY(0); opacity: 0; } 8% { opacity: .75; } 88% { opacity: .75; } 100% { transform: translateY(-790px); opacity: 0; } }
    .fm-accent { animation: fm-breathe 4.4s ease-in-out infinite; }
    @keyframes fm-breathe { 0%, 100% { opacity: 0; } 50% { opacity: .85; } }
    .fm-glint { transform-box: view-box; animation: fm-glint-right 3.2s ease-in-out infinite; }
    .fm-glint-left { animation-name: fm-glint-left; }
    @keyframes fm-glint-right { 0% { transform: translateX(0); opacity: 0; } 15% { opacity: 1; } 55% { transform: translateX(170px); opacity: 0; } 100% { transform: translateX(170px); opacity: 0; } }
    @keyframes fm-glint-left { 0% { transform: translateX(0); opacity: 0; } 15% { opacity: 1; } 55% { transform: translateX(-170px); opacity: 0; } 100% { transform: translateX(-170px); opacity: 0; } }
    @media (prefers-reduced-motion: reduce) { .fm-orbit, .fm-liquid-flow, .fm-bubble, .fm-accent, .fm-glint { animation: none; opacity: 0; } #fm-lit, #fm-unlit { display: none; } }
  </style>
  <defs>
    <mask id="fm-armor-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="${WIDTH}" height="${HEIGHT}"><image width="${WIDTH}" height="${HEIGHT}" href="${png(layers.armor)}"/></mask>
    <mask id="fm-bar-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="${WIDTH}" height="${HEIGHT}"><image width="${WIDTH}" height="${HEIGHT}" href="${png(layers.bar)}"/></mask>
    <clipPath id="fm-glass-clip" clipPathUnits="userSpaceOnUse"><path d="${glassPath(false)}"/><path d="${glassPath(true)}"/></clipPath>
    <filter id="fm-contrast" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
      <feColorMatrix type="saturate" values="${CONTRAST.saturation}"/>
      <feComponentTransfer>
        <feFuncR type="linear" slope="${CONTRAST.slope}" intercept="${contrastIntercept}"/>
        <feFuncG type="linear" slope="${CONTRAST.slope}" intercept="${contrastIntercept}"/>
        <feFuncB type="linear" slope="${CONTRAST.slope}" intercept="${contrastIntercept}"/>
      </feComponentTransfer>
    </filter>
    <mask id="fm-lit-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="${WIDTH}" height="${HEIGHT}">
      <g class="fm-orbit"><g transform="rotate(${LIGHT.tilt} 512 0)">${lightBand('#808080', bandHeight)}${lightBand('#fff', LIGHT.core)}</g></g>
    </mask>
    <mask id="fm-core-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="${WIDTH}" height="${HEIGHT}">
      <g class="fm-orbit"><g transform="rotate(${LIGHT.tilt} 512 0)">${lightBand('#fff', LIGHT.core)}</g></g>
    </mask>
    <mask id="fm-unlit-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="${WIDTH}" height="${HEIGHT}">
      <rect width="${WIDTH}" height="${HEIGHT}" fill="#fff"/>
      <g class="fm-orbit"><g transform="rotate(${LIGHT.tilt} 512 0)">${lightBand('#000', bandHeight)}</g></g>
    </mask>
    <pattern id="fm-liquid-pattern" patternUnits="userSpaceOnUse" x="${LIQUID.x}" y="0" width="${LIQUID.width}" height="640">
      <image width="${LIQUID.width}" height="640" href="${png(layers.liquidTile)}"/>
    </pattern>
    <linearGradient id="fm-flow-fade-gradient" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".22" stop-color="#fff"/><stop offset=".78" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <mask id="fm-flow-fade" maskUnits="userSpaceOnUse" x="${LIQUID.x}" y="0" width="${LIQUID.width}" height="${HEIGHT}">
      <rect x="${LIQUID.x}" y="0" width="${LIQUID.width}" height="${HEIGHT}" fill="url(#fm-flow-fade-gradient)"/>
    </mask>
    <radialGradient id="fm-glint-gradient"><stop offset="0" stop-color="#f2fdff" stop-opacity=".95"/><stop offset="1" stop-color="#7fe6ff" stop-opacity="0"/></radialGradient>
    <filter id="fm-bloom" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="5"/></filter>
  </defs>
  <image id="fm-base" width="${WIDTH}" height="${HEIGHT}" href="${png(readFileSync(basePath).toString('base64'))}"/>
  <g id="fm-armor" mask="url(#fm-armor-mask)">
    <g id="fm-unlit" class="fm-unlit"><rect width="${WIDTH}" height="${HEIGHT}" fill="#04060a" mask="url(#fm-unlit-mask)"/></g>
    <g id="fm-lit"><use href="#fm-base" filter="url(#fm-contrast)" mask="url(#fm-lit-mask)"/><rect class="fm-layer" width="${WIDTH}" height="${HEIGHT}" fill="#fff" opacity="${CONTRAST.whiteGlow}" mask="url(#fm-core-mask)"/></g>
    <!-- Invisible marker that follows the light centre, so tools and tests can read where the light is. -->
    <g id="fm-light-marker" class="fm-orbit"><circle cx="512" cy="0" r="1" fill="none"/></g>
  </g>
  <g id="fm-gauge" clip-path="url(#fm-glass-clip)">
    <g id="fm-liquid" opacity=".45">
      <g mask="url(#fm-flow-fade)"><rect class="fm-liquid-flow" x="${LIQUID.x}" y="0" width="${LIQUID.width}" height="1700" fill="url(#fm-liquid-pattern)"/></g>
      <g transform="translate(${GAUGE_MIRROR_SUM} 0) scale(-1 1)"><g mask="url(#fm-flow-fade)"><rect class="fm-liquid-flow" x="${LIQUID.x}" y="0" width="${LIQUID.width}" height="1700" fill="url(#fm-liquid-pattern)"/></g></g>
    </g>
    <g id="fm-bubbles" class="fm-layer">
      <g>${bubbles}</g>
      <g transform="translate(${GAUGE_MIRROR_SUM} 0) scale(-1 1)">${bubbles}</g>
    </g>
  </g>
  <g id="fm-accent" class="fm-layer">
    <image class="fm-accent" width="${WIDTH}" height="${HEIGHT}" href="${png(layers.accent)}" filter="url(#fm-bloom)"/>
    <image class="fm-accent" width="${WIDTH}" height="${HEIGHT}" href="${png(layers.accent)}"/>
  </g>
  <g id="fm-bar" class="fm-layer" mask="url(#fm-bar-mask)">
    <ellipse class="fm-glint" cx="512" cy="1387" rx="46" ry="22" fill="url(#fm-glint-gradient)"/>
    <ellipse class="fm-glint fm-glint-left" cx="512" cy="1387" rx="46" ry="22" fill="url(#fm-glint-gradient)"/>
  </g>
</svg>
`;
writeFileSync(outputPath, svg);
console.log(outputPath);

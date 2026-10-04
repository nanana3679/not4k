import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BAND_HEIGHT, BREATHE, BUBBLES, CONTRAST, CONTRAST_INTERCEPT, decimal, EXCLUDED, GAUGE_MIRROR_SUM, glassPath, GLINT,
  HEIGHT, LIGHT, LIGHT_BAND, LIQUID, LIQUID_FLOW, measureFrameMotionLayers, readBaseBase64, RISE, UNLIT_FILL, WIDTH,
} from './frame-motion-shared.mjs';

// Builds the ambient-motion SVG for the Classic frame: the idle frame stays as the
// fixed bottom layer and four masked motion layers sit on top of it.
//   A  light source  one large light passes down over the frame as a wide slanted band with
//                    straight hard edges. Inside it the armor shows a brighter, higher-contrast copy
//                    of itself (cel-style core and half steps) and outside it dims (mask: armor area)
//   B  gauge liquid  the painted swirl flows up with bubbles (clip: measured glass interior)
//   C  blue accents  blue light lines on the outer armor breathe (layer: blue light pixels)
//   D  bottom bar    two glints flow outward inside the cyan bar (mask: bar light)
// Lanes, the key deck and the gauge glass are excluded from A, C and D.
// Masks and values live in frame-motion-shared.mjs, which prepare-frame-motion-v21.mjs also bakes for Pixi.
// Usage: node assets-lab/classic/revisions/frame-keywords-six-20260929/assemble-ambient-v19.mjs [--debug <dir>]

const revisionDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(revisionDir, '../../../..');
const outputPath = resolve(workspaceRoot, 'lab/image-galleries/frame-keywords-six-20260929/54-ambient-motion-v19.svg');
const debugIndex = process.argv.indexOf('--debug');
const debugTarget = debugIndex === -1 ? null : process.argv[debugIndex + 1];
if (debugIndex !== -1 && !debugTarget) throw new Error('--debug needs a folder path.');
const debugDir = debugTarget ? resolve(debugTarget) : null;

const browser = await chromium.launch();
const page = await browser.newPage();
const layers = await measureFrameMotionLayers(page);
await browser.close();

if (debugDir) {
  mkdirSync(debugDir, { recursive: true });
  for (const name of ['armor', 'accent', 'bar', 'liquidTile']) writeFileSync(resolve(debugDir, `${name}.png`), Buffer.from(layers[name], 'base64'));
}

const bandHeight = BAND_HEIGHT;
const lightBand = (fill, height) => `<rect x="${LIGHT_BAND.x}" y="${-height / 2}" width="${LIGHT_BAND.width}" height="${height}" fill="${fill}"/>`;
const contrastIntercept = CONTRAST_INTERCEPT;
const bubbles = BUBBLES.map((bubble) => `<circle class="fm-bubble" cx="${bubble.x}" cy="${RISE.startY}" r="${bubble.r}" style="animation-duration:${bubble.duration}s;animation-delay:${bubble.delay}s"/>`).join('');

const png = (base64) => `data:image/png;base64,${base64}`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <title>Classic 프레임 움직임 · 큰 광원·게이지·발광선·하단 바</title>
  <style>
    .fm-layer { mix-blend-mode: screen; }
    .fm-orbit { transform-box: view-box; animation: fm-orbit ${LIGHT.travel}s linear infinite; }
    @keyframes fm-orbit { from { transform: translateY(${LIGHT.from}px); } to { transform: translateY(${LIGHT.to}px); } }
    .fm-unlit { opacity: ${CONTRAST.unlitDim}; }
    .fm-liquid-flow { transform-box: view-box; animation: fm-liquid-flow ${LIQUID_FLOW.periodS}s linear infinite; }
    @keyframes fm-liquid-flow { from { transform: translateY(0); } to { transform: translateY(-${LIQUID_FLOW.tileHeight}px); } }
    .fm-bubble { fill: ${RISE.color}; transform-box: view-box; animation-name: fm-rise; animation-timing-function: linear; animation-iteration-count: infinite; }
    @keyframes fm-rise { 0% { transform: translateY(0); opacity: 0; } ${RISE.fadeInPercent}% { opacity: ${decimal(RISE.opacity)}; } ${RISE.fadeOutPercent}% { opacity: ${decimal(RISE.opacity)}; } 100% { transform: translateY(-${RISE.distance}px); opacity: 0; } }
    .fm-accent { animation: fm-breathe ${BREATHE.periodS}s ${BREATHE.easing} infinite; }
    @keyframes fm-breathe { 0%, 100% { opacity: 0; } ${BREATHE.peakPercent}% { opacity: ${decimal(BREATHE.opacity)}; } }
    .fm-glint { transform-box: view-box; animation: fm-glint-right ${GLINT.periodS}s ${GLINT.easing} infinite; }
    .fm-glint-left { animation-name: fm-glint-left; }
    @keyframes fm-glint-right { 0% { transform: translateX(0); opacity: 0; } ${GLINT.peakPercent}% { opacity: 1; } ${GLINT.stopPercent}% { transform: translateX(${GLINT.travel}px); opacity: 0; } 100% { transform: translateX(${GLINT.travel}px); opacity: 0; } }
    @keyframes fm-glint-left { 0% { transform: translateX(0); opacity: 0; } ${GLINT.peakPercent}% { opacity: 1; } ${GLINT.stopPercent}% { transform: translateX(-${GLINT.travel}px); opacity: 0; } 100% { transform: translateX(-${GLINT.travel}px); opacity: 0; } }
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
      <g class="fm-orbit"><g transform="rotate(${LIGHT.tilt} ${LIGHT_BAND.pivotX} 0)">${lightBand(LIGHT_BAND.halfFill, bandHeight)}${lightBand(LIGHT_BAND.coreFill, LIGHT.core)}</g></g>
    </mask>
    <mask id="fm-core-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="${WIDTH}" height="${HEIGHT}">
      <g class="fm-orbit"><g transform="rotate(${LIGHT.tilt} ${LIGHT_BAND.pivotX} 0)">${lightBand(LIGHT_BAND.coreFill, LIGHT.core)}</g></g>
    </mask>
    <mask id="fm-unlit-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="${WIDTH}" height="${HEIGHT}">
      <rect width="${WIDTH}" height="${HEIGHT}" fill="#fff"/>
      <g class="fm-orbit"><g transform="rotate(${LIGHT.tilt} ${LIGHT_BAND.pivotX} 0)">${lightBand('#000', bandHeight)}</g></g>
    </mask>
    <pattern id="fm-liquid-pattern" patternUnits="userSpaceOnUse" x="${LIQUID.x}" y="0" width="${LIQUID.width}" height="${LIQUID_FLOW.tileHeight}">
      <image width="${LIQUID.width}" height="${LIQUID_FLOW.tileHeight}" href="${png(layers.liquidTile)}"/>
    </pattern>
    <linearGradient id="fm-flow-fade-gradient" x1="0" x2="1" y1="0" y2="0">
      <stop offset="${decimal(LIQUID_FLOW.fadeStops[0])}" stop-color="#fff" stop-opacity="0"/><stop offset="${decimal(LIQUID_FLOW.fadeStops[1])}" stop-color="#fff"/><stop offset="${decimal(LIQUID_FLOW.fadeStops[2])}" stop-color="#fff"/><stop offset="${decimal(LIQUID_FLOW.fadeStops[3])}" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <mask id="fm-flow-fade" maskUnits="userSpaceOnUse" x="${LIQUID.x}" y="0" width="${LIQUID.width}" height="${HEIGHT}">
      <rect x="${LIQUID.x}" y="0" width="${LIQUID.width}" height="${HEIGHT}" fill="url(#fm-flow-fade-gradient)"/>
    </mask>
    <radialGradient id="fm-glint-gradient"><stop offset="0" stop-color="${GLINT.centerColor}" stop-opacity="${decimal(GLINT.centerOpacity)}"/><stop offset="1" stop-color="${GLINT.edgeColor}" stop-opacity="0"/></radialGradient>
    <filter id="fm-bloom" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="${BREATHE.bloomStdDeviation}"/></filter>
    <image id="fm-accent-image" width="${WIDTH}" height="${HEIGHT}" href="${png(layers.accent)}"/>
    <!-- Keeps the blurred accent glow out of the lanes, key deck and gauge boxes. -->
    <mask id="fm-outside-excluded" maskUnits="userSpaceOnUse" x="0" y="0" width="${WIDTH}" height="${HEIGHT}">
      <rect width="${WIDTH}" height="${HEIGHT}" fill="#fff"/>
      ${EXCLUDED.map((box) => `<rect x="${box.x0}" y="${box.y0}" width="${box.x1 - box.x0 + 1}" height="${box.y1 - box.y0 + 1}" fill="#000"/>`).join('')}
    </mask>
  </defs>
  <image id="fm-base" width="${WIDTH}" height="${HEIGHT}" href="${png(readBaseBase64())}"/>
  <g id="fm-armor" mask="url(#fm-armor-mask)">
    <g id="fm-unlit" class="fm-unlit"><rect width="${WIDTH}" height="${HEIGHT}" fill="${UNLIT_FILL}" mask="url(#fm-unlit-mask)"/></g>
    <g id="fm-lit"><use href="#fm-base" filter="url(#fm-contrast)" mask="url(#fm-lit-mask)"/><rect class="fm-layer" width="${WIDTH}" height="${HEIGHT}" fill="#fff" opacity="${CONTRAST.whiteGlow}" mask="url(#fm-core-mask)"/></g>
    <!-- Invisible marker that follows the light centre, so tools and tests can read where the light is. -->
    <g id="fm-light-marker" class="fm-orbit"><circle cx="${LIGHT_BAND.pivotX}" cy="0" r="1" fill="none"/></g>
  </g>
  <g id="fm-gauge" clip-path="url(#fm-glass-clip)">
    <g id="fm-liquid" opacity="${decimal(LIQUID_FLOW.opacity)}">
      <g mask="url(#fm-flow-fade)"><rect class="fm-liquid-flow" x="${LIQUID.x}" y="0" width="${LIQUID.width}" height="${LIQUID_FLOW.rectHeight}" fill="url(#fm-liquid-pattern)"/></g>
      <g transform="translate(${GAUGE_MIRROR_SUM} 0) scale(-1 1)"><g mask="url(#fm-flow-fade)"><rect class="fm-liquid-flow" x="${LIQUID.x}" y="0" width="${LIQUID.width}" height="${LIQUID_FLOW.rectHeight}" fill="url(#fm-liquid-pattern)"/></g></g>
    </g>
    <g id="fm-bubbles" class="fm-layer">
      <g>${bubbles}</g>
      <g transform="translate(${GAUGE_MIRROR_SUM} 0) scale(-1 1)">${bubbles}</g>
    </g>
  </g>
  <g id="fm-accent" class="fm-layer" mask="url(#fm-outside-excluded)">
    <use class="fm-accent" href="#fm-accent-image" filter="url(#fm-bloom)"/>
    <use class="fm-accent" href="#fm-accent-image"/>
  </g>
  <g id="fm-bar" class="fm-layer" mask="url(#fm-bar-mask)">
    <ellipse class="fm-glint" cx="${GLINT.cx}" cy="${GLINT.cy}" rx="${GLINT.rx}" ry="${GLINT.ry}" fill="url(#fm-glint-gradient)"/>
    <ellipse class="fm-glint fm-glint-left" cx="${GLINT.cx}" cy="${GLINT.cy}" rx="${GLINT.rx}" ry="${GLINT.ry}" fill="url(#fm-glint-gradient)"/>
  </g>
</svg>
`;
writeFileSync(outputPath, svg);
console.log(outputPath);

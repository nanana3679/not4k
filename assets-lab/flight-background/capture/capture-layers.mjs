// Captures the play screen of the real GameRenderer (Classic skin, gear, Gear Lab demo chart) as separate
// transparent layers plus the current flight backgrounds, and writes them as WebP files.
//
// Usage (with the Vite dev server running from the repository root):
//   node assets-lab/flight-background/capture/capture-layers.mjs <devServerUrl> <outDir>
//   e.g. node assets-lab/flight-background/capture/capture-layers.mjs http://127.0.0.1:3000 lab/image-galleries/background-drafts-20261018
//
// Output: current-<scenario>.webp (flight background only, opaque 1920x1080) and layer-<group>.webp
// (one GameRenderer layer group on a transparent 1920x1080 canvas, see LAYER_GROUPS in capture-page.mjs).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { encodeWebp } from './encode-webp.mjs';

const [baseUrl, outDir] = process.argv.slice(2);
if (!baseUrl || !outDir) {
  console.error('usage: node capture-layers.mjs <devServerUrl> <outDir>');
  process.exit(1);
}

const SCENARIOS = ['LIFTOFF', 'INFILTRATION', 'BREAKTHROUGH'];
// The layers do not depend on the scenario except the gauge level, so they are captured once.
const LAYER_SCENARIO = 'LIFTOFF';
const BACKGROUND_QUALITY = 0.86;
const LAYER_QUALITY = 0.92;

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('console', (message) => { if (message.type() === 'error') console.error('[page]', message.text()); });
  const encoder = await browser.newPage();
  const stage = page.locator('#stage');
  const settle = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const save = async (name, png, quality) => {
    writeFileSync(join(outDir, name), await encodeWebp(encoder, png, quality));
    console.log('wrote', join(outDir, name));
  };

  for (const label of SCENARIOS) {
    await page.goto(new URL(`/assets-lab/flight-background/capture/index.html?label=${label}`, baseUrl).href);
    await page.waitForFunction(() => document.body.dataset.captureReady || document.body.dataset.captureError, null, { timeout: 60_000 });
    const error = await page.evaluate(() => document.body.dataset.captureError);
    if (error) throw new Error(`${label}: ${error}`);

    await page.evaluate(() => window.__layerCapture.show({ background: true, groups: [] }));
    await settle();
    await save(`current-${label.toLowerCase()}.webp`, await stage.screenshot(), BACKGROUND_QUALITY);

    if (label !== LAYER_SCENARIO) continue;
    const groups = await page.evaluate(() => window.__layerCapture.groups);
    for (const group of groups) {
      await page.evaluate((only) => window.__layerCapture.show({ background: false, groups: [only] }), group);
      await settle();
      await save(`layer-${group}.webp`, await stage.screenshot({ omitBackground: true }), LAYER_QUALITY);
    }
  }
} finally {
  await browser.close();
}

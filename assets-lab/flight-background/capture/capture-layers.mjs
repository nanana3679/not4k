// Captures the play screen of the real GameRenderer (Classic skin, gear, Gear Lab demo chart) as separate
// transparent layers plus the current flight backgrounds at three altitudes, and writes them as WebP files.
//
// Usage (with the Vite dev server running from the repository root):
//   node assets-lab/flight-background/capture/capture-layers.mjs <devServerUrl> <outDir>
//   e.g. node assets-lab/flight-background/capture/capture-layers.mjs http://127.0.0.1:3000 lab/image-galleries/background-drafts-20261018/captures
//
// Output (all 1920x1080):
// - current-<scenario>-<altitude>.webp: flight background only, opaque, for every scenario and altitude
// - layer-gear-<altitude>.webp: the gear, whose glass gauges show the altitude
// - layer-<group>.webp for the other groups (lanes, notes, judgment-line, hud), which do not depend on altitude
// See RENDERER_FIELDS_BY_GROUP in capture-page.mjs for what each group holds.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { encodeWebp } from './encode-webp.mjs';

const [baseUrl, outDir] = process.argv.slice(2);
if (!baseUrl || !outDir) {
  console.error('usage: node capture-layers.mjs <devServerUrl> <outDir>');
  process.exit(1);
}

// Chart difficulty labels; each one picks its flight scenario.
const DIFFICULTY_LABELS = ['LIFTOFF', 'INFILTRATION', 'BREAKTHROUGH'];
// Altitude samples high / mid / low (docs/design/flight-concept.md compares one continuous space at these three).
const ALTITUDES = { high: 1, mid: 0.5, low: 0 };
const BACKGROUND_QUALITY = 0.86;
// Lossy but high quality: lossless (quality 1) keeps thin coloured strokes exact but makes the seven layers about
// 2.6 MB instead of 0.4 MB, too heavy for the phone view, and the difference is not visible once composited.
const LAYER_QUALITY = 0.92;
const kebab = (name) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('console', (message) => { if (message.type() === 'error') console.error('[page]', message.text()); });
  // A module that fails to load never reaches start(), so report it instead of waiting for the ready timeout.
  page.on('pageerror', (error) => page.evaluate((message) => { document.body.dataset.captureError ??= message; }, String(error)).catch(() => undefined));
  const encoder = await browser.newPage();
  const captureRoot = page.locator('#capture-root');
  const waitForPaint = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const save = async (name, png, quality) => {
    writeFileSync(join(outDir, name), await encodeWebp(encoder, png, quality));
    console.log('wrote', join(outDir, name));
  };
  const show = async (options) => {
    await page.evaluate((shown) => window.__layerCapture.show(shown), options);
    await waitForPaint();
  };

  let capturedSharedLayers = false;
  for (const label of DIFFICULTY_LABELS) {
    for (const [altitudeName, altitude] of Object.entries(ALTITUDES)) {
      const url = new URL('/assets-lab/flight-background/capture/index.html', baseUrl);
      url.search = new URLSearchParams({ label, altitude: String(altitude) }).toString();
      await page.goto(url.href);
      await page.waitForFunction(() => document.body.dataset.captureReady || document.body.dataset.captureError, null, { timeout: 180_000 });
      const error = await page.evaluate(() => document.body.dataset.captureError);
      if (error) throw new Error(`${label} ${altitudeName}: ${error}`);

      await show({ background: true, groups: [] });
      await save(`current-${label.toLowerCase()}-${altitudeName}.webp`, await captureRoot.screenshot(), BACKGROUND_QUALITY);

      // The layers do not depend on the scenario, and only the gear's glass gauges follow the altitude.
      if (label !== DIFFICULTY_LABELS[0]) continue;
      const groups = await page.evaluate(() => window.__layerCapture.groups);
      for (const group of groups) {
        if (group !== 'gear' && capturedSharedLayers) continue;
        await show({ background: false, groups: [group] });
        const name = group === 'gear' ? `layer-gear-${altitudeName}.webp` : `layer-${kebab(group)}.webp`;
        await save(name, await captureRoot.screenshot({ omitBackground: true }), LAYER_QUALITY);
      }
      capturedSharedLayers = true;
    }
  }
} finally {
  await browser.close();
}

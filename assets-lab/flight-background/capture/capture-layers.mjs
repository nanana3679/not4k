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
//
// The files are written to a temporary folder and moved into outDir only after every capture succeeded, so a failed
// run never leaves a mix of old and new images. While it runs, do not edit HTML files or files vite.config imports:
// Vite then reloads the capture page and the run fails.
import { mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { chromium } from '@playwright/test';
import { encodeWebp } from './encode-webp.mjs';
import { ALTITUDE_BY_NAME, DIFFICULTY_LABELS } from './capture-plan.mjs';

const [baseUrl, outDir] = process.argv.slice(2);
if (!baseUrl || !outDir) {
  console.error('usage: node capture-layers.mjs <devServerUrl> <outDir>');
  process.exit(1);
}

const BACKGROUND_QUALITY = 0.86;
// Lossy but high quality: lossless (quality 1) keeps thin coloured strokes exact but makes the seven layers about
// 2.6 MB instead of 0.4 MB, too heavy for the phone view, and the difference is not visible once composited.
const LAYER_QUALITY = 0.92;
const PAGE_TIMEOUT_MS = 180_000;
const kebab = (name) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

mkdirSync(dirname(outDir), { recursive: true });
const stagingDir = mkdtempSync(`${outDir.replace(/\/$/, '')}.partial-`);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const encoder = await browser.newPage();
  const save = async (name, png, quality) => {
    writeFileSync(join(stagingDir, name), await encodeWebp(encoder, png, quality));
    console.log('captured', name);
  };

  let capturedSharedLayers = false;
  for (const label of DIFFICULTY_LABELS) {
    for (const [altitudeName, altitude] of Object.entries(ALTITUDE_BY_NAME)) {
      // A fresh page per capture also releases the previous renderer's WebGL contexts.
      const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(String(error)));
      page.on('console', (message) => { if (message.type() === 'error') console.error('[page]', message.text()); });
      const failIfPageErrored = () => {
        if (pageErrors.length > 0) throw new Error(`${label} ${altitudeName}: ${pageErrors.join('; ')}`);
      };
      const captureRoot = page.locator('#capture-root');
      const show = async (options) => {
        await page.evaluate((shown) => window.__layerCapture.show(shown), options);
        // Two animation frames: the canvas has been composited before the screenshot.
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        failIfPageErrored();
      };

      const url = new URL('/assets-lab/flight-background/capture/index.html', baseUrl);
      url.search = new URLSearchParams({ label, altitude: String(altitude) }).toString();
      await page.goto(url.href, { timeout: PAGE_TIMEOUT_MS, waitUntil: 'domcontentloaded' });
      await page.waitForFunction(
        () => window.__captureLoadError || document.body?.dataset.captureError || document.body?.dataset.captureReady,
        null,
        { timeout: PAGE_TIMEOUT_MS },
      );
      const error = await page.evaluate(() => window.__captureLoadError || document.body.dataset.captureError);
      if (error) throw new Error(`${label} ${altitudeName}: ${error}`);
      failIfPageErrored();

      await show({ background: true, groups: [] });
      await save(`current-${label.toLowerCase()}-${altitudeName}.webp`, await captureRoot.screenshot(), BACKGROUND_QUALITY);

      // The layers do not depend on the scenario, and only the gear's glass gauges follow the altitude.
      if (label === DIFFICULTY_LABELS[0]) {
        const groups = await page.evaluate(() => window.__layerCapture.groups);
        for (const group of groups) {
          if (group !== 'gear' && capturedSharedLayers) continue;
          await show({ background: false, groups: [group] });
          const name = group === 'gear' ? `layer-gear-${altitudeName}.webp` : `layer-${kebab(group)}.webp`;
          await save(name, await captureRoot.screenshot({ omitBackground: true }), LAYER_QUALITY);
        }
        capturedSharedLayers = true;
      }
      await page.close();
    }
  }

  mkdirSync(outDir, { recursive: true });
  const names = readdirSync(stagingDir);
  for (const name of names) renameSync(join(stagingDir, name), join(outDir, name));
  console.log(`wrote ${names.length} files to ${outDir}`);
} finally {
  await browser.close();
  rmSync(stagingDir, { recursive: true, force: true });
}

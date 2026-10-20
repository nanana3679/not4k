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
// The files are written to a staging folder next to outDir, and only after every capture succeeded the whole folder
// replaces outDir (the old folder is kept until the swap succeeded and restored if it fails), so a failed or
// interrupted run never leaves a mix of old and new images. While it runs, do not edit HTML files or files
// vite.config imports: Vite then reloads the capture page and the run fails.
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
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

// Resolve a symlinked outDir so the staging folder sits on the same filesystem and the final rename cannot fail
// with EXDEV.
const targetDir = existsSync(outDir) ? realpathSync(outDir) : resolve(outDir);

// Publishing replaces targetDir as a whole, so refuse any folder that holds something this tool did not write
// (a mistyped path such as the gallery folder or the repository would otherwise be deleted) before capturing.
const GENERATED_FILE = /^(current|layer)-[a-z-]+\.webp$/;
function assertReplaceableTarget() {
  // targetDir is outside the working directory's ancestry only if the path from it to the working directory first
  // climbs out of it.
  const fromCwd = relative(targetDir, process.cwd());
  const outsideCwdAncestry = fromCwd === '..' || fromCwd.startsWith(`..${sep}`) || isAbsolute(fromCwd);
  if (!outsideCwdAncestry) {
    throw new Error(`refusing to replace ${targetDir}: it is the working directory or one of its parents`);
  }
  if (!existsSync(targetDir)) return;
  const foreign = readdirSync(targetDir, { withFileTypes: true }).filter((entry) => !entry.isFile() || !GENERATED_FILE.test(entry.name));
  if (foreign.length > 0) {
    throw new Error(`refusing to replace ${targetDir}: it holds ${foreign.map((entry) => entry.name).join(', ')}, which this tool does not write`);
  }
}
assertReplaceableTarget();
let stagingDir = null;
const removeStaging = () => { if (stagingDir) rmSync(stagingDir, { recursive: true, force: true }); };
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    removeStaging();
    process.exit(130);
  });
}

/** Swap the finished staging folder in for targetDir, keeping the old folder until the swap has succeeded. */
function publish() {
  // Check again: something may have been written into (or created at) targetDir while the capture ran.
  assertReplaceableTarget();
  const previousDir = existsSync(targetDir) ? `${targetDir}.previous-${process.pid}` : null;
  if (previousDir) renameSync(targetDir, previousDir);
  try {
    renameSync(stagingDir, targetDir);
    stagingDir = null;
  } catch (error) {
    if (previousDir) renameSync(previousDir, targetDir);
    throw error;
  }
  if (previousDir) rmSync(previousDir, { recursive: true, force: true });
}

let browser = null;
try {
  browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  mkdirSync(dirname(targetDir), { recursive: true });
  stagingDir = mkdtempSync(`${targetDir}.partial-`);
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
      // Settles as soon as the first page error arrives, even one raised while the page is still loading, so the
      // ready wait below does not sit out its timeout when a module fails to link or evaluate.
      let rejectOnPageError;
      const pageErrored = new Promise((_, reject) => { rejectOnPageError = reject; });
      pageErrored.catch(() => undefined);
      page.on('pageerror', (error) => {
        pageErrors.push(String(error));
        rejectOnPageError(new Error(`${label} ${altitudeName}: ${error}`));
      });
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
      // A module that fails to link or evaluate never reaches start() and only raises a page error, so that ends
      // the wait as well.
      await Promise.race([
        page.waitForFunction(
          () => window.__captureLoadError || document.body?.dataset.captureError || document.body?.dataset.captureReady,
          null,
          { timeout: PAGE_TIMEOUT_MS },
        ),
        pageErrored,
      ]);
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
      // Errors raised during the last screenshot or encoding count too.
      failIfPageErrored();
      await page.close();
    }
  }

  // mkdtemp creates the folder as 0700; give the published folder the usual mode so static servers can read it.
  chmodSync(stagingDir, 0o755);
  publish();
  console.log(`wrote ${targetDir}`);
} finally {
  try {
    await browser?.close();
  } finally {
    removeStaging();
  }
}

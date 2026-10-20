// Re-encodes the round 2 background drafts (<scenario>-<altitude>.png, scenarios listed in prompts.json) as WebP
// for the Lab gallery.
// Usage: node assets-lab/flight-background/revisions/background-drafts-r2-20261018/encode-drafts.mjs lab/image-galleries/background-drafts-20261018/drafts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { encodeWebp } from '../../capture/encode-webp.mjs';

const [outDir] = process.argv.slice(2);
if (!outDir) {
  console.error('usage: node encode-drafts.mjs <outDir>');
  process.exit(1);
}
const here = dirname(fileURLToPath(import.meta.url));
const { scenarios } = JSON.parse(readFileSync(join(here, 'prompts.json'), 'utf8'));
const ALTITUDES = ['high', 'mid', 'low'];
const QUALITY = 0.86;

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const { id } of scenarios) {
    for (const altitude of ALTITUDES) {
      const name = `${id}-${altitude}`;
      writeFileSync(join(outDir, `${name}.webp`), await encodeWebp(page, readFileSync(join(here, `${name}.png`)), QUALITY));
      console.log('wrote', join(outDir, `${name}.webp`));
    }
  }
} finally {
  await browser.close();
}

// Re-encodes the generated background drafts (PNG, listed in prompts.json) as WebP for the Lab gallery.
// Usage: node assets-lab/flight-background/revisions/background-drafts-20261018/encode-drafts.mjs <outDir>
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
const { variants } = JSON.parse(readFileSync(join(here, 'prompts.json'), 'utf8'));
const QUALITY = 0.86;

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const { id } of variants) {
    const target = join(outDir, `${id}.webp`);
    writeFileSync(target, await encodeWebp(page, readFileSync(join(here, `${id}.png`)), QUALITY));
    console.log('wrote', target);
  }
} finally {
  await browser.close();
}

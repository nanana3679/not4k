import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const source = dirname(fileURLToPath(import.meta.url));
const root = resolve(source, '../../../..');
const gallery = resolve(root, 'lab/image-galleries/long-note-body-six-20260929');
const { variants, combinations = [], pointReferences = [] } = JSON.parse(await readFile(resolve(source, 'prompts.json'), 'utf8'));
const selected = process.argv[2];
const exports = [...variants, ...combinations].filter(variant => !selected || variant.id === selected);
if (exports.length === 0) throw new Error(`Unknown body concept: ${selected}`);
const crops = {
  '04-chevron-link': { y: 174, height: 448 },
  '05-offset-plates': { y: 333, height: 538 },
  '06-liquid-flow': { y: 12, height: 700 },
};
await mkdir(gallery, { recursive: true });
await copyFile(resolve(root, 'public/skins/classic/note-single.png'), resolve(gallery, 'note-single.png'));
for (const reference of pointReferences) {
  await copyFile(resolve(source, reference.source), resolve(gallery, reference.gallery));
}
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const variant of exports) {
    const base64 = (await readFile(resolve(source, variant.source))).toString('base64');
    const files = await page.evaluate(async ({ base64, crop }) => {
      const image = new Image();
      image.src = 'data:image/png;base64,' + base64;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = 1000;
      canvas.height = 200;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.imageSmoothingQuality = 'high';
      context.drawImage(image, 0, crop?.y ?? 0, image.width, crop?.height ?? image.height, 0, 0, 1000, 200);

      // Straight designs use their generated horizontal material profile.
      // Patterned designs retain one generated repeat, blending only its seam.
      function finishTile(context, width, height, extrusion) {
        const pixels = context.getImageData(0, 0, width, height);
        const original = new Uint8ClampedArray(pixels.data);
        if (extrusion) {
          const low = Math.floor(height * .4), high = Math.ceil(height * .6);
          for (let x = 0; x < width; x++) for (let c = 0; c < 4; c++) {
            let value = 0;
            for (let y = low; y < high; y++) value += original[(y * width + x) * 4 + c];
            value = Math.round(value / (high - low));
            for (let y = 0; y < height; y++) pixels.data[(y * width + x) * 4 + c] = value;
          }
        } else {
          const band = Math.max(3, Math.round(height * .08));
          for (let y = 0; y < band; y++) {
            const t = y / (band - 1);
            const blend = .5 * (1 - t * t * (3 - 2 * t));
            for (let x = 0; x < width; x++) for (let c = 0; c < 4; c++) {
              const a = (y * width + x) * 4 + c;
              const b = ((height - 1 - y) * width + x) * 4 + c;
              pixels.data[a] = Math.round(original[a] * (1 - blend) + original[b] * blend);
              pixels.data[b] = Math.round(original[b] * (1 - blend) + original[a] * blend);
            }
          }
        }
        context.putImageData(pixels, 0, 0);
      }
      finishTile(context, 1000, 200, !crop);
      const high = canvas.toDataURL('image/png').split(',')[1];
      const small = document.createElement('canvas');
      small.width = 200;
      small.height = 40;
      const smallContext = small.getContext('2d', { willReadFrequently: true });
      smallContext.imageSmoothingQuality = 'high';
      smallContext.drawImage(canvas, 0, 0, 200, 40);
      finishTile(smallContext, 200, 40, !crop);
      return { high, small: small.toDataURL('image/png').split(',')[1] };
    }, { base64, crop: crops[variant.id] });
    await writeFile(resolve(gallery, variant.id + '.png'), Buffer.from(files.high, 'base64'));
    await writeFile(resolve(gallery, variant.id + '-200x40.png'), Buffer.from(files.small, 'base64'));
    if (variant.terminalAlias) {
      await writeFile(resolve(gallery, variant.terminalAlias + '.png'), Buffer.from(files.high, 'base64'));
      await writeFile(resolve(gallery, variant.terminalAlias + '-200x40.png'), Buffer.from(files.small, 'base64'));
    }
  }
} finally {
  await browser.close();
}
console.log(`${exports.length} body concepts exported at 1000×200 and 200×40.`);

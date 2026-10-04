import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { buildClassicAssets, CLASSIC_SOURCE_NAMES, RUNTIME_ASSET_MAP } from '../assets-lab/classic/states.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'public/lab/note-assets/classic');
// Lab and PlayScreen share these PNGs; only the editable SVG showcase is dev-only.
const runtimeOutput = resolve(root, 'public/skins/classic');
const sources = Object.fromEntries(await Promise.all(CLASSIC_SOURCE_NAMES.map(async name =>
  [name, await readFile(resolve(root, `assets-lab/classic/sources/${name}.svg`), 'utf8')])));
const assets = buildClassicAssets(sources);
await mkdir(output, {recursive:true});
await mkdir(runtimeOutput, {recursive:true});
const server = await createServer({
  root, server:{port:0, host:'127.0.0.1'}, logLevel:'error',
  optimizeDeps:{entries:['assets-lab/classic/bomb-export.html']},
});
await server.listen();
const browser = await chromium.launch();
try {
  const page = await browser.newPage({viewport:{width:800,height:500}, deviceScaleFactor:1});
  for (const [name, svg] of Object.entries(assets)) {
    await writeFile(`${output}/${name}.svg`, svg);
    if (/^terminal-(?:(?:start|end)-)?(?:single|double)$/.test(name)) {
      await writeFile(resolve(root, `assets-lab/classic/sources/${name}.svg`), svg);
    }
  }
  for (const [key, name] of Object.entries(RUNTIME_ASSET_MAP)) {
    const svg = assets[name];
    const png = await page.evaluate(async svg => {
      const image = new Image();
      image.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
      await image.decode();
      const canvas = document.createElement('canvas');
      // 2× textures retain the original point/body/terminal ratios.
      canvas.width = Math.round(image.naturalWidth / 5);
      canvas.height = Math.max(1, Math.round(image.naturalHeight / 5));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/png').split(',')[1];
    }, svg);
    const filename = key.replace(/[A-Z]/g, char => '-' + char.toLowerCase());
    await writeFile(`${runtimeOutput}/${filename}.png`, Buffer.from(png, 'base64'));
  }
  const address = server.httpServer.address();
  await page.goto(`http://127.0.0.1:${address.port}/assets-lab/classic/bomb-export.html`);
  await page.waitForFunction(() => window.bombReady);
  // Sample the approved CSS silver ring at deterministic times, including a clear final frame.
  for(let frame=0;frame<16;frame++) {
    await page.locator('#bomb').evaluate((element,time) => {
      for(const animation of element.getAnimations({subtree:true})) {
        animation.pause(); animation.currentTime=time;
      }
    },frame*280/15);
    await page.locator('#bomb').screenshot({path:`${runtimeOutput}/bomb-${String(frame).padStart(2,'0')}.png`,omitBackground:true,animations:'allow'});
  }
  for(const state of ['idle','pressed']) for(let lane=1;lane<=4;lane++) {
    await copyFile(resolve(root,`public/skins/crystal/button-${state}-${lane}.png`),`${runtimeOutput}/button-${state}-${lane}.png`);
  }
  console.log(`Classic: ${Object.keys(assets).length} SVG sources, ${Object.keys(RUNTIME_ASSET_MAP).length} state textures, 16 bomb frames, 8 buttons.`);
} finally {
  await browser.close();
  await server.close();
}

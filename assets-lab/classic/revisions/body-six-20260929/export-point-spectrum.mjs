import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = dirname(fileURLToPath(import.meta.url));
const root = resolve(source, '../../../..');
const gallery = resolve(root, 'lab/image-galleries/long-note-body-six-20260929');
const { variants: bodies } = JSON.parse(await readFile(resolve(source, 'intrinsic-spectrum.json'), 'utf8'));
const output = resolve(source, 'point-spectrum');
await mkdir(output, { recursive: true });

const mix = (a, b, amount) => a.map((value, i) => Math.round(value * (1 - amount) + b[i] * amount));
const hex = rgb => '#' + rgb.map(value => value.toString(16).padStart(2, '0')).join('');
const ratio = (a, b) => (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
const points = [];
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const body of bodies) {
    const bodyBuffer = await readFile(resolve(gallery, `${body.id}.png`));
    const sample = await page.evaluate(async base64 => {
      const image = new Image();
      image.src = 'data:image/png;base64,' + base64;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(image, 0, 0);
      const data = ctx.getImageData(image.width * .3, image.height * .4, image.width * .4, image.height * .3).data;
      const rgb = [0, 0, 0]; let luminance = 0;
      for (let i = 0; i < data.length; i += 4) {
        const linear = [0, 1, 2].map(c => {
          rgb[c] += data[i + c];
          const v = data[i + c] / 255;
          return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
        });
        luminance += linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
      }
      const count = data.length / 4;
      return { rgb: rgb.map(v => Math.round(v / count)), luminance: luminance / count };
    }, bodyBuffer.toString('base64'));

    const id = `point-spectrum-${body.kind}-${String(body.step).padStart(2, '0')}`;
    const templatePath = `references/note-${body.kind}-saturated.svg`;
    const originalSvg = await readFile(resolve(source, templatePath), 'utf8');
    const gradient = /(<linearGradient id="readability-face"[^>]*>)[\s\S]*?(<\/linearGradient>)/;
    if (!gradient.test(originalSvg)) throw new Error(`Missing readability-face: ${templatePath}`);
    const colors = [mix(sample.rgb, [255, 255, 255], .14), sample.rgb, mix(sample.rgb, [0, 0, 0], .14), mix(sample.rgb, [255, 255, 255], .04)].map(hex);
    const stops = [0, .32, .78, 1].map((offset, i) => `<stop offset="${offset}" stop-color="${colors[i]}"/>`).join('');
    const svg = originalSvg.replace(gradient, (_, open, close) => open + stops + close);
    // The source SVG is authoritative: only the center-face gradient changes.
    if (svg.replace(gradient, '$1$2') !== originalSvg.replace(gradient, '$1$2')) {
      throw new Error(`Geometry or unrelated surface changed: ${id}`);
    }
    await writeFile(resolve(output, `${id}.svg`), svg);
    await writeFile(resolve(gallery, `${id}.svg`), svg);

    const raster = await page.evaluate(async text => {
      const image = new Image();
      image.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(text)));
      await image.decode();
      const files = {};
      let luminance = 0;
      for (const [suffix, width, height] of [['', 1060, 200], ['-212x40', 212, 40]]) {
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(image, 0, 0, width, height);
        files[suffix] = canvas.toDataURL('image/png').split(',')[1];
        if (suffix === '') {
          const data = ctx.getImageData(width * .3, height * .4, width * .4, height * .3).data;
          for (let i = 0; i < data.length; i += 4) {
            const linear = [0, 1, 2].map(c => {
              const v = data[i + c] / 255;
              return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
            });
            luminance += linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
          }
          luminance /= data.length / 4;
        }
      }
      return { files, luminance };
    }, svg);
    for (const [suffix, base64] of Object.entries(raster.files)) {
      await writeFile(resolve(gallery, `${id}${suffix}.png`), Buffer.from(base64, 'base64'));
    }
    points.push({ id, kind: body.kind, step: body.step, title: body.title, template: templatePath, body: body.id, sampledBodyRgb: sample.rgb, gradient: colors, bodyLuminance: sample.luminance, pointLuminance: raster.luminance });
  }
} finally {
  await browser.close();
}

const combinations = [];
for (const kind of ['single', 'double']) {
  const typePoints = points.filter(p => p.kind === kind);
  for (const body of typePoints) for (const point of typePoints) {
    combinations.push({ kind, bodyStep: body.step, pointStep: point.step, body: body.body, point: point.id, ratio: ratio(body.bodyLuminance, point.pointLuminance), brighter: point.pointLuminance > body.bodyLuminance ? 'point' : 'body' });
  }
}

// Prefer a bright point over a dark body, consistent with the user's earlier feedback.
const recommended = [];
for (const bodyStep of [4, 5, 6]) for (const pointStep of [1, 2]) {
  const pair = combinations.filter(c => c.bodyStep === bodyStep && c.pointStep === pointStep);
  recommended.push({ bodyStep, pointStep, minimumRatio: Math.min(...pair.map(c => c.ratio)), pair });
}
recommended.sort((a, b) => b.minimumRatio - a.minimumRatio);

const report = {
  mode: 'existing SVG center-gradient edit; no image generation',
  sourceOfColors: 'actual approved body spectrum pixels',
  geometry: { width: 1060, height: 200, attachmentX: 30, attachmentWidth: 1000 },
  measurement: 'Average sRGB relative luminance of x=30–70%, y=40–70% of each rendered face; ratio=(Lmax+.05)/(Lmin+.05). Central-face comparison only, not a gameplay visibility score.',
  points,
  combinations,
  recommended: recommended.slice(0, 3),
};
await writeFile(resolve(source, 'point-spectrum.json'), JSON.stringify(report, null, 2) + '\n');
console.log('12 point variants exported, original SVG geometry preserved, 72 combinations measured.');
for (const choice of report.recommended) console.log(`Point ${choice.pointStep} / body ${choice.bodyStep}: ${choice.pair.map(p => `${p.kind} ${p.ratio.toFixed(2)}:1`).join(', ')}`);

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const revisionDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(revisionDir, '../../../..');
const galleryDir = resolve(workspaceRoot, 'lab/image-galleries/frame-keywords-six-20260929');
const base = readFileSync(resolve(galleryDir, '52-restored-frame-v15.svg'), 'utf8');
const insert = readFileSync(resolve(revisionDir, 'white-core-insert-v16.png')).toString('base64');

// Preserve the adopted v15 composition. Only the pressed key and its immediate
// light spill are visible from the generated PNG; the aperture stays in v15.
const patch = `
  <defs>
    <linearGradient id="white-core-x" gradientUnits="userSpaceOnUse" x1="348" x2="536">
      <stop offset="0" stop-color="black"/><stop offset="6.38%" stop-color="white"/>
      <stop offset="93.62%" stop-color="white"/><stop offset="100%" stop-color="black"/>
    </linearGradient>
    <linearGradient id="white-core-y" gradientUnits="userSpaceOnUse" x1="0" y1="1096" x2="0" y2="1274">
      <stop offset="0" stop-color="black"/><stop offset="6.74%" stop-color="white"/>
      <stop offset="95.51%" stop-color="white"/><stop offset="100%" stop-color="black"/>
    </linearGradient>
    <mask id="white-core-vertical" maskUnits="userSpaceOnUse" x="348" y="1096" width="188" height="178">
      <rect x="348" y="1096" width="188" height="178" fill="url(#white-core-y)"/>
    </mask>
    <mask id="white-core-region" maskUnits="userSpaceOnUse" x="348" y="1096" width="188" height="178">
      <rect x="348" y="1096" width="188" height="178" fill="url(#white-core-x)" mask="url(#white-core-vertical)"/>
    </mask>
  </defs>
  <image id="white-core-light" width="1024" height="1536" mask="url(#white-core-region)" href="data:image/png;base64,${insert}"/>
`;
if (!base.includes('</svg>')) throw new Error('The adopted SVG is missing its closing tag.');
const output = base.replace('<title>원본 B 프레임과 화이트 LED 버튼</title>', '<title>원본 B 프레임과 백색광·연파랑 주변광 버튼</title>')
  .replace('</svg>', `${patch}</svg>`);
const outputPath = resolve(galleryDir, '53-white-core-frame-v16.svg');
writeFileSync(outputPath, output);
console.log(outputPath);

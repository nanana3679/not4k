import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const revisionDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(revisionDir, '../../../..');
const basePath = resolve(workspaceRoot, 'lab/image-galleries/frame-keywords-six-20260929/22-free-b-v6.png');
const insertPath = resolve(revisionDir, 'button-insert-v15.png');
const outputPath = resolve(workspaceRoot, 'lab/image-galleries/frame-keywords-six-20260929/52-restored-frame-v15.svg');
const pngData = path => `data:image/png;base64,${readFileSync(path).toString('base64')}`;

// The original frame is immutable. The generated insert is visible only inside
// the existing button deck; it can never replace the side armor or gauges.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1536" viewBox="0 0 1024 1536">
  <title>원본 B 프레임과 화이트 LED 버튼</title>
  <defs><clipPath id="button-deck" clipPathUnits="userSpaceOnUse">
    <polygon points="248,1118 775,1118 820,1204 827,1308 777,1352 244,1352 199,1308 204,1204"/>
  </clipPath>
    <linearGradient id="seam-fade" gradientUnits="userSpaceOnUse" x1="0" y1="1118" x2="0" y2="1352">
      <stop offset="0" stop-color="black"/><stop offset="3.42%" stop-color="white"/>
      <stop offset="97.44%" stop-color="white"/><stop offset="100%" stop-color="black"/>
    </linearGradient>
    <mask id="seams" maskUnits="userSpaceOnUse" x="198" y="1118" width="630" height="234">
      <rect x="198" y="1118" width="630" height="234" fill="url(#seam-fade)"/>
    </mask>
  </defs>
  <image id="original-frame" width="1024" height="1536" href="${pngData(basePath)}"/>
  <g clip-path="url(#button-deck)" mask="url(#seams)"><image id="button-insert" width="1024" height="1536" href="${pngData(insertPath)}"/></g>
</svg>
`;
writeFileSync(outputPath, svg);
console.log(outputPath);

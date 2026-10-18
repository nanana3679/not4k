import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { buildTrillQuartzAssets, trillAssemblySvg, TRILL_QUARTZ_STATES } from '../assets-lab/classic/trill-quartz.mjs';

const sourceDir = new URL('../assets-lab/classic/sources/', import.meta.url);
const outputDir = new URL('../assets-lab/classic/downloads/', import.meta.url);
await mkdir(sourceDir, { recursive: true });
await mkdir(outputDir, { recursive: true });
for (const [name, svg] of Object.entries(buildTrillQuartzAssets())) {
  await writeFile(new URL(`${name}.svg`, sourceDir), svg);
}
await writeFile(new URL('assembled.svg', outputDir), trillAssemblySvg());
for (const state of Object.keys(TRILL_QUARTZ_STATES)) {
  await writeFile(new URL(`assembled-${state}.svg`, outputDir), trillAssemblySvg(300,300,state));
}
execFileSync('python3', ['-c',
  'from pathlib import Path\nfrom sys import argv\nfrom zipfile import ZipFile, ZIP_DEFLATED\nwith ZipFile(argv[1], "w", ZIP_DEFLATED) as archive:\n for filename in argv[2:]:\n  archive.write(filename, Path(filename).name)',
  fileURLToPath(new URL('trill-quartz-svg.zip', outputDir)),
  ...Object.keys(buildTrillQuartzAssets()).map(name => fileURLToPath(new URL(`${name}.svg`, sourceDir))),
]);
console.log(`Trill quartz: ${Object.keys(buildTrillQuartzAssets()).length} SVG assets → ${fileURLToPath(sourceDir)}`);

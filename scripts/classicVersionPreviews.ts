import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { Plugin } from 'vite';
import { CLASSIC_SKIN_VERSIONS } from '../src/lab/classicSkinVersions';
import { verifyClassicVersion } from './classic-versions.mjs';

export interface ClassicVersionPreviewEntry { pathname: string; file: string }

/** Only archived PNG/SVG assets are public; sources and build code stay in the archive. */
export async function classicVersionPreviewEntries(
  root: string, ids = CLASSIC_SKIN_VERSIONS.map(version => version.id),
): Promise<ClassicVersionPreviewEntry[]> {
  const entries: ClassicVersionPreviewEntry[] = [];
  for (const id of ids) {
    const manifest = await verifyClassicVersion({ root, id });
    const mappings = [
      ['public/skins/classic/', 'skin/'],
      ['public/lab/note-assets/classic/', 'svg/'],
      ['public/gear/', 'gear/'],
    ];
    for (const { path } of manifest.files as { path: string }[]) {
      const mapping = mappings.find(([prefix]) => path.startsWith(prefix));
      if (!mapping || !/\.(png|svg)$/.test(path)) continue;
      entries.push({
        pathname: `/lab/skin-versions/classic/${id}/${mapping[1]}${path.slice(mapping[0].length)}`,
        file: resolve(root, 'assets-lab/classic/versions', id, 'files', path),
      });
    }
  }
  return entries;
}

export async function exportClassicVersionPreviews(root: string, outputRoot: string, ids?: string[]) {
  const entries = await classicVersionPreviewEntries(root, ids);
  for (const entry of entries) {
    const destination = resolve(outputRoot, entry.pathname.slice(1));
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(entry.file, destination);
  }
}

export function classicVersionPreviewsPlugin(root: string): Plugin {
  return {
    name: 'not4k-classic-version-previews',
    apply: 'serve',
    async configureServer(server) {
      const entries = new Map((await classicVersionPreviewEntries(root)).map(entry => [entry.pathname, entry.file]));
      server.middlewares.use(async (request, response, next) => {
        const pathname = (request.url ?? '').split('?', 1)[0];
        if (!pathname.startsWith('/lab/skin-versions/')) return next();
        const file = entries.get(pathname);
        if (!file) { response.statusCode = 404; response.end('Asset not found'); return; }
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          response.statusCode = 405; response.setHeader('Allow', 'GET, HEAD'); response.end(); return;
        }
        try {
          const bytes = await readFile(file);
          response.setHeader('Content-Type', file.endsWith('.png') ? 'image/png' : 'image/svg+xml');
          response.setHeader('Content-Length', bytes.length);
          response.end(request.method === 'HEAD' ? undefined : bytes);
        } catch (error) { next(error); }
      });
    },
  };
}

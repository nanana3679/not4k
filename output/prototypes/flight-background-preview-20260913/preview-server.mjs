import { breakthroughSearch } from './flight-presets.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { approachStyle, breakthroughStyle, publicPreviewPage } from './preview-ui.mjs';

const previewRoot = dirname(fileURLToPath(import.meta.url));
const breakthroughRoot = resolve(previewRoot, '../breakthrough-hangar-integration-20260910');
const imageRoot = resolve(previewRoot, '../../imagegen');

const approachFiles = new Set([
  'index.html',
  'afterglow.mjs',
  'convergence.mjs',
  'flight.mjs',
  'flow.mjs',
  'gpu-light-batch.mjs',
  'height.mjs',
  'motion.mjs',
  'objects.mjs',
  'palette.mjs',
  'procedural-trails.mjs',
  'projection.mjs',
  'render-quality.mjs',
  'runway.mjs',
  'settings.mjs',
  'sky-background.mjs',
  'sky-lighting.mjs',
  'surface.mjs',
  'triangles.mjs',
  'ground.png',
  'sky.png',
  'sky-infiltration.png',
]);

const sharedApproachFiles = new Set(['control-panel.mjs', 'scenario-navigation.mjs', 'wide-layout.css']);

const breakthroughFiles = new Set([
  'index.html',
  'study.html',
  'style.css',
  'scene.mjs',
  'integration.mjs',
  'world-trails.mjs',
  'passage.mjs',
  'render-quality.mjs',
  'light-batch.mjs',
  'render-model.mjs',
  'architectural-materials.mjs',
  'surface-geometry.mjs',
  'painted-backdrop.mjs',
  'catalog.mjs',
  'blueprint-kit.mjs',
  'model-library.mjs',
  'surroundings.mjs',
  'extensions/a-wedge.mjs',
  'extensions/b-maintenance.mjs',
  'extensions/c-service-tower.mjs',
  'extensions/d-twin-gallery.mjs',
  'extensions/e-hangar.mjs',
  'extensions/f-open-dock.mjs',
  'extensions/g-transfer-spine.mjs',
  'extensions/h-logistics-hub.mjs',
  'modules/a-wedge.mjs',
  'modules/b-maintenance.mjs',
  'modules/c-service-tower.mjs',
  'modules/d-twin-gallery.mjs',
  'modules/e-hangar.mjs',
  'modules/f-open-dock.mjs',
  'modules/g-transfer-spine.mjs',
  'modules/h-logistics-hub.mjs',
  'originals/hangar.mjs',
  'originals/wedge.mjs',
  'legacy/afterglow.mjs',
  'legacy/architecture.mjs',
  'legacy/clearance.mjs',
  'legacy/geometry.mjs',
  'legacy/original-motion.mjs',
  'legacy/palette.mjs',
  'legacy/surface-art.mjs',
  'legacy/wall-contours.mjs',
  'vendor/three.module.js',
  'vendor/three.core.js',
  'vendor/LICENSE',
]);

const breakthroughAssets = new Map([
  ['assets/armor.png', resolve(imageRoot, 'wedge-surface-textures-20260910/armor.png')],
  ['assets/window.png', resolve(imageRoot, 'wedge-surface-textures-20260910/window.png')],
  ['assets/door.png', resolve(imageRoot, 'wedge-surface-textures-20260910/door.png')],
  ['assets/hull.png', resolve(imageRoot, 'hangar-surface-textures-20260910/hull.png')],
  ['assets/soffit.png', resolve(imageRoot, 'hangar-surface-textures-20260910/soffit.png')],
  ['assets/distant-architecture.png', resolve(imageRoot, 'distant-architecture-backdrop-20260910/distant-architecture.png')],
]);

function staticPreviewRoutePaths(basePath = '') {
  const base = normalizedBasePath(basePath);
  const paths = [`${base}/index.html`];

  for (const scene of ['liftoff', 'infiltration']) {
    for (const name of approachFiles) paths.push(`${base}/flight/${scene}/${name}`);
  }
  for (const name of sharedApproachFiles) paths.push(`${base}/flight/${name}`);
  for (const name of breakthroughFiles) paths.push(`${base}/flight/breakthrough/${name}`);
  for (const name of breakthroughAssets.keys()) paths.push(`${base}/flight/breakthrough/${name}`);
  paths.push(`${base}/flight/breakthrough/share.json`);

  return paths;
}

export { breakthroughSearch } from './flight-presets.mjs';

function normalizedBasePath(basePath = '') {
  const value = String(basePath).trim();
  if (!value || value === '/') return '';
  return `/${value.replace(/^\/+|\/+$/g, '')}`;
}

export function previewViewsAt(basePath = '') {
  const base = normalizedBasePath(basePath);
  return Object.freeze({
    liftoff: `${base}/flight/liftoff/?variant=liftoff&altitude=.68&scale=1&secondary=.15&speed=3&lanes=0`,
    infiltration: `${base}/flight/infiltration/?variant=infiltration&altitude=.23&scale=1&secondary=.15&speed=6&lanes=0`,
    breakthrough: `${base}/flight/breakthrough/?${breakthroughSearch}`,
  });
}

export const previewViews = previewViewsAt();

async function previewRouteBody(route) {
  let body = route.body ?? await readFile(route.filePath);
  if (route.injectedStyle && route.name === 'index.html') {
    body = Buffer.from(body.toString('utf8').replace('</body>', `${route.injectedStyle}</body>`));
  }
  return body;
}

export async function staticPreviewEntriesAt(basePath = '') {
  const base = normalizedBasePath(basePath);
  const entries = [];

  for (const pathname of staticPreviewRoutePaths(basePath)) {
    if (pathname === `${base}/index.html`) {
      entries.push({ pathname, body: Buffer.from(publicPreviewPage(previewViewsAt(basePath))) });
      continue;
    }

    const route = resolvePreviewRoute(pathname.slice(base.length));
    if (!route) throw new Error(`Static preview route is not allowlisted: ${pathname}`);
    entries.push({ pathname, body: await previewRouteBody(route) });
  }

  return entries;
}

function contentType(name) {
  if (name.endsWith('.html')) return 'text/html; charset=utf-8';
  if (name.endsWith('.css')) return 'text/css; charset=utf-8';
  if (name.endsWith('.mjs') || name.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (name.endsWith('.json')) return 'application/json; charset=utf-8';
  if (name.endsWith('.png')) return 'image/png';
  return 'text/plain; charset=utf-8';
}

export function resolvePreviewRoute(pathname) {
  for (const scene of ['liftoff', 'infiltration']) {
    const prefix = `/flight/${scene}/`;
    if (pathname.startsWith(prefix)) {
      const name = pathname.slice(prefix.length) || 'index.html';
      if (!approachFiles.has(name)) return null;
      return {
        filePath: resolve(previewRoot, 'approach', name),
        name,
        injectedStyle: name === 'index.html' ? approachStyle : '',
      };
    }
  }

  const sharedPrefix = '/flight/';
  if (pathname.startsWith(sharedPrefix)) {
    const name = pathname.slice(sharedPrefix.length);
    if (sharedApproachFiles.has(name)) return { filePath: resolve(previewRoot, name), name, injectedStyle: '' };
  }

  const breakthroughPrefix = '/flight/breakthrough/';
  if (pathname.startsWith(breakthroughPrefix)) {
    const name = pathname.slice(breakthroughPrefix.length) || 'index.html';
    if (name === 'share.json') return { name, body: Buffer.from('{"public":true}'), injectedStyle: '' };
    const assetPath = breakthroughAssets.get(name);
    if (assetPath) return { filePath: assetPath, name, injectedStyle: '' };
    if (!breakthroughFiles.has(name)) return null;
    return {
      filePath: resolve(breakthroughRoot, name === 'study.html' ? 'index.html' : name),
      name,
      injectedStyle: name === 'index.html' ? breakthroughStyle : '',
    };
  }

  return null;
}

const responseHeaders = {
  'cache-control': 'no-store',
  'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'",
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
};

function send(response, requestMethod, status, body, type) {
  response.writeHead(status, { ...responseHeaders, 'content-type': type, 'content-length': body.length });
  response.end(requestMethod === 'HEAD' ? undefined : body);
}

function routePathname(pathname, basePath) {
  const base = normalizedBasePath(basePath);
  if (!base) return pathname;
  if (pathname === base || pathname === `${base}/`) return '/';
  return pathname.startsWith(`${base}/`) ? pathname.slice(base.length) : null;
}

async function serve(request, response, { basePath = '' } = {}) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { ...responseHeaders, allow: 'GET, HEAD' });
    response.end();
    return;
  }

  let url;
  try {
    url = new URL(request.url, 'http://preview.local');
  } catch {
    send(response, request.method, 400, Buffer.from('Bad request'), 'text/plain; charset=utf-8');
    return;
  }
  const pathname = routePathname(url.pathname, basePath);
  if (pathname === null) {
    send(response, request.method, 404, Buffer.from('Not found'), 'text/plain; charset=utf-8');
    return;
  }
  if (pathname === '/') {
    const page = Buffer.from(publicPreviewPage(previewViewsAt(basePath)));
    send(response, request.method, 200, page, 'text/html; charset=utf-8');
    return;
  }

  const route = resolvePreviewRoute(pathname);
  if (!route) {
    send(response, request.method, 404, Buffer.from('Not found'), 'text/plain; charset=utf-8');
    return;
  }

  try {
    const body = await previewRouteBody(route);
    send(response, request.method, 200, body, contentType(route.name));
  } catch {
    send(response, request.method, 404, Buffer.from('Not found'), 'text/plain; charset=utf-8');
  }
}

export function handlePreviewRequest(request, response, options = {}) {
  void serve(request, response, options).catch(() => {
    if (response.writableEnded) return;
    if (response.headersSent) {
      response.destroy();
      return;
    }
    send(response, request.method, 500, Buffer.from('Internal server error'), 'text/plain; charset=utf-8');
  });
}

export function createPreviewServer(options = {}) {
  return createServer((request, response) => handlePreviewRequest(request, response, options));
}

export function startPreviewServer({ host = process.env.PREVIEW_HOST || '127.0.0.1', port = Number(process.env.PREVIEW_PORT || 0) } = {}) {
  const server = createPreviewServer();
  server.listen(port, host, () => {
    const address = server.address();
    console.log(JSON.stringify({ url: `http://${host}:${address.port}/`, pid: process.pid }));
  });
  process.on('SIGINT', () => server.close(() => process.exit(0)));
  return server;
}

const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === entry) startPreviewServer();

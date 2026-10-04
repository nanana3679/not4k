import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveConfig } from 'vite';
import devConfig from '../vite.config';
import labConfig from '../vite.lab.config';

const temporaryRoots: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('Vite 워크트리 캐시 격리', () => {
  it.each([
    ['일반 개발 서버', devConfig, 'dev'],
    ['Lab', labConfig, 'lab'],
  ] as const)('%s에서 두 워크트리가 node_modules를 공유해도 캐시는 각 워크트리의 .vite에 둔다', async (_, config, cacheName) => {
    const temporary = await mkdtemp(resolve(tmpdir(), 'not4k-vite-cache-'));
    temporaryRoots.push(temporary);
    const dependencies = fileURLToPath(new URL('../node_modules', import.meta.url));
    const roots = ['first', 'second'].map(name => resolve(temporary, name));
    for (const root of roots) {
      await mkdir(root);
      await writeFile(resolve(root, 'package.json'), '{"name":"cache-fixture","private":true}');
      await symlink(dependencies, resolve(root, 'node_modules'), 'dir');
    }
    expect(await realpath(resolve(roots[0], 'node_modules'))).toBe(await realpath(resolve(roots[1], 'node_modules')));
    const caches = await Promise.all(roots.map(async root => {
      const resolved = await resolveConfig({ ...config, root, configFile: false, plugins: [], logLevel: 'silent' }, 'serve');
      expect(resolved.cacheDir).toBe(resolve(root, '.vite', cacheName));
      return resolved.cacheDir;
    }));
    expect(caches[0]).not.toBe(caches[1]);
  });
});

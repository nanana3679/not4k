import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { E2E_OFFLINE_SUPABASE_ENV, e2eDevServerEnv } from './e2eDevServerEnv';

const REAL_SUPABASE_URL = 'https://real-project.supabase.co';
const REAL_SUPABASE_KEY = 'sb_publishable_real_key';
const REAL_CREDENTIALS = `VITE_SUPABASE_URL=${REAL_SUPABASE_URL}\nVITE_SUPABASE_PUBLISHABLE_KEY=${REAL_SUPABASE_KEY}\n`;
const OFFLINE_ENV = {
  VITE_DEV_ADMIN: 'true',
  VITE_SUPABASE_URL: 'https://e2e-offline.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'e2e-offline-publishable-key',
};

const temporaryDirectories: string[] = [];

/** 주어진 .env* 파일만 든 빈 envDir을 만든다. */
async function envDirWith(files: Record<string, string> = {}): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'not4k-e2e-env-'));
  temporaryDirectories.push(directory);
  await Promise.all(Object.entries(files).map(([name, content]) => writeFile(join(directory, name), content)));
  return directory;
}

beforeEach(() => {
  // Vitest는 저장소 .env.local의 VITE_ 값을 process.env에 복사하므로 테스트마다 비우고 시작한다.
  vi.stubEnv('VITE_SUPABASE_URL', undefined);
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', undefined);
  vi.stubEnv('VITE_DEV_ADMIN', undefined);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

describe('e2eDevServerEnv', () => {
  it('process.env에 VITE_SUPABASE_URL·VITE_SUPABASE_PUBLISHABLE_KEY가 있으면 Supabase 값은 넣지 않고 VITE_DEV_ADMIN=true만 넣는다', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', REAL_SUPABASE_URL);
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', REAL_SUPABASE_KEY);

    expect(e2eDevServerEnv(await envDirWith())).toEqual({ VITE_DEV_ADMIN: 'true' });
  });

  it.each(['.env', '.env.local', '.env.development', '.env.development.local'])(
    'process.env에 없고 %s 파일에만 Supabase URL·키가 있으면 Supabase 값은 넣지 않고 VITE_DEV_ADMIN=true만 넣는다',
    async (file) => {
      expect(e2eDevServerEnv(await envDirWith({ [file]: REAL_CREDENTIALS }))).toEqual({ VITE_DEV_ADMIN: 'true' });
    },
  );

  it.each([
    ['process.env와 .env* 파일 어디에도 Supabase URL·키가 없으면', {}],
    ['.env.local의 VITE_SUPABASE_URL·VITE_SUPABASE_PUBLISHABLE_KEY가 빈 값이면', { '.env.local': 'VITE_SUPABASE_URL=\nVITE_SUPABASE_PUBLISHABLE_KEY=\n' }],
    ['dev 서버가 읽지 않는 .env.production.local에만 Supabase URL·키가 있으면', { '.env.production.local': REAL_CREDENTIALS }],
  ])('%s VITE_SUPABASE_URL=https://e2e-offline.supabase.co·VITE_SUPABASE_PUBLISHABLE_KEY=e2e-offline-publishable-key·VITE_DEV_ADMIN=true를 넣는다', async (_, files) => {
    expect(e2eDevServerEnv(await envDirWith(files))).toEqual(OFFLINE_ENV);
  });

  it('VITE_SUPABASE_URL만 있고 VITE_SUPABASE_PUBLISHABLE_KEY가 없으면 있는 URL을 더미 URL로 덮지 않도록 Supabase 값을 넣지 않는다', async () => {
    const directory = await envDirWith({ '.env.local': `VITE_SUPABASE_URL=${REAL_SUPABASE_URL}\n` });

    expect(e2eDevServerEnv(directory)).toEqual({ VITE_DEV_ADMIN: 'true' });
  });

  it('process.env와 .env.local에 VITE_DEV_ADMIN=false가 있어도 VITE_DEV_ADMIN=true를 넣는다', async () => {
    vi.stubEnv('VITE_DEV_ADMIN', 'false');
    const directory = await envDirWith({ '.env.local': `${REAL_CREDENTIALS}VITE_DEV_ADMIN=false\n` });

    expect(e2eDevServerEnv(directory).VITE_DEV_ADMIN).toBe('true');
  });

  it('더미 VITE_SUPABASE_URL은 index.html CSP의 connect-src·img-src·media-src가 허용하는 https://*.supabase.co 주소다', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const policy = /http-equiv="Content-Security-Policy"\s+content="([^"]*)"/.exec(html)?.[1] ?? '';
    const sourcesByDirective = new Map(policy.split(';').map(directive => directive.trim().split(/\s+/))
      .filter(([name]) => name).map(([name, ...sources]) => [name, sources]));
    const offlineUrl = new URL(E2E_OFFLINE_SUPABASE_ENV.VITE_SUPABASE_URL);

    for (const directive of ['connect-src', 'img-src', 'media-src']) {
      expect(sourcesByDirective.get(directive), directive).toContain('https://*.supabase.co');
    }
    expect(offlineUrl.protocol).toBe('https:');
    expect(offlineUrl.hostname).toMatch(/^[a-z0-9-]+\.supabase\.co$/);
  });
});

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveConfig } from 'vite';
import type { UserConfig } from 'vite';
import vitestConfig from '../vitest.config';

// 단위 테스트가 worktree의 .env* 파일을 읽지 않는지(#373) 임시 root에 둔 .env.local로 확인한다.
// 임시 root는 테스트마다 지우고, 바꾼 process.env는 vi.unstubAllEnvs()로 되돌린다. 네트워크는 쓰지 않는다.
const temporaryRoots: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

/** 실제 자격 증명 대신 쓰는 .env.local 값. 어느 것도 요청에 쓰지 않는다. */
const DOTENV_LOCAL_VALUES = {
  VITE_SUPABASE_URL: 'https://from-dotenv-local.invalid',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'from-dotenv-local-publishable-key',
  VITE_SUPABASE_SERVICE_ROLE_KEY: 'from-dotenv-local-service-role-key',
  VITE_DEV_ADMIN: 'true',
} as const;

/** 임시 root에 .env.local을 쓰고 Vitest와 같은 mode(test)로 Vite 설정을 풀어, 테스트 worker에 넘어갈 Vite env를 돌려준다. */
async function resolveViteEnvWithDotenvLocal(config: UserConfig): Promise<Record<string, unknown>> {
  const root = await mkdtemp(resolve(tmpdir(), 'not4k-vitest-env-'));
  temporaryRoots.push(root);
  await writeFile(resolve(root, '.env.local'), Object.entries(DOTENV_LOCAL_VALUES).map(([key, value]) => `${key}=${value}`).join('\n'));
  // Vite는 같은 키면 process.env 값을 .env 파일보다 앞세운다. 이 단위 테스트 worker의 process.env에는 test.env 더미 값이
  // 들어 있으므로, 이 테스트 동안 같은 키를 지워 .env.local만 입력으로 남긴다.
  for (const key of Object.keys(DOTENV_LOCAL_VALUES)) vi.stubEnv(key, undefined);
  const resolved = await resolveConfig({ ...config, root, configFile: false, mode: 'test', logLevel: 'silent' }, 'serve');
  return resolved.env;
}

describe('단위 테스트와 .env* 파일', () => {
  it('envDir를 지정하지 않은 설정은 root의 .env.local에서 VITE_SUPABASE_URL·VITE_SUPABASE_SERVICE_ROLE_KEY·VITE_DEV_ADMIN 등 4개 값을 Vite env로 읽는다(아래 비교의 입력이 실제로 읽히는 값)', async () => {
    const env = await resolveViteEnvWithDotenvLocal({ ...vitestConfig, envDir: undefined });

    expect(env).toMatchObject(DOTENV_LOCAL_VALUES);
  });

  it('vitest.config.ts(envDir: false)로 풀면 같은 .env.local의 VITE_SUPABASE_URL·VITE_SUPABASE_PUBLISHABLE_KEY·VITE_SUPABASE_SERVICE_ROLE_KEY·VITE_DEV_ADMIN이 Vite env에 하나도 없다', async () => {
    const env = await resolveViteEnvWithDotenvLocal(vitestConfig);

    for (const key of Object.keys(DOTENV_LOCAL_VALUES)) expect(env[key], key).toBeUndefined();
  });
});

describe('단위 테스트 worker의 VITE_SUPABASE_* 환경 변수', () => {
  it('vitest.config.ts의 test.env는 VITE_SUPABASE_URL을 https://unit-test-offline.invalid, VITE_SUPABASE_PUBLISHABLE_KEY를 unit-test-offline-publishable-key로 고정한다', () => {
    expect(vitestConfig.test?.env).toEqual({
      VITE_SUPABASE_URL: 'https://unit-test-offline.invalid',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'unit-test-offline-publishable-key',
    });
  });

  it('process.env와 import.meta.env 둘 다 VITE_SUPABASE_URL=https://unit-test-offline.invalid·VITE_SUPABASE_PUBLISHABLE_KEY=unit-test-offline-publishable-key를 본다', () => {
    expect(process.env.VITE_SUPABASE_URL).toBe('https://unit-test-offline.invalid');
    expect(process.env.VITE_SUPABASE_PUBLISHABLE_KEY).toBe('unit-test-offline-publishable-key');
    expect(import.meta.env.VITE_SUPABASE_URL).toBe('https://unit-test-offline.invalid');
    expect(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY).toBe('unit-test-offline-publishable-key');
  });
});

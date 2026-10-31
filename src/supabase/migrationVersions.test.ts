import { describe, expect, it } from 'vitest';

// Supabase는 파일 이름 앞 14자리 버전으로 이력을 기록한다. 같은 버전이 두 파일이면 하나는 적용 이력에 가려진다.
const migrationPaths = Object.keys(import.meta.glob('../../supabase/migrations/*.sql'));

function versionOf(path: string) {
  return path.split('/').pop()!.slice(0, 14);
}

describe('supabase/migrations 버전 번호', () => {
  it('migration 파일마다 14자리 숫자 버전으로 시작한다', () => {
    expect(migrationPaths.length).toBeGreaterThan(0);
    for (const path of migrationPaths) expect(versionOf(path)).toMatch(/^\d{14}$/);
  });

  it('두 migration 파일이 같은 버전 번호를 쓰지 않는다', () => {
    const pathsByVersion = new Map<string, string[]>();
    for (const path of migrationPaths) {
      const version = versionOf(path);
      pathsByVersion.set(version, [...(pathsByVersion.get(version) ?? []), path]);
    }
    const duplicates = [...pathsByVersion.values()].filter(paths => paths.length > 1);
    expect(duplicates).toEqual([]);
  });
});

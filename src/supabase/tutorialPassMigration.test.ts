import { expect, it } from 'vitest';
import migrationSql from '../../supabase/migrations/20261031200000_tutorial_pass_account_sync.sql?raw';

// DB에 연결하지 않는 SQL 보안 계약 검사. 실제 PostgreSQL의 RLS 실행 검증은 별도다.
const migration = migrationSql.replace(/--[^\n]*/g, '');
const limitFunction = migration.split('create function public.enforce_tutorial_pass_limit()')[1].split('$$;')[0];

it('통과 한도 트리거는 호출자 권한으로 실행하고 다른 계정·주체 없는 INSERT는 잠금·200행 검사 전에 반환한다', () => {
  expect(limitFunction).not.toMatch(/security\s+definer/i);
  expect(limitFunction).toContain("set search_path = ''");
  const beforeLock = limitFunction.split('perform pg_catalog.pg_advisory_xact_lock')[0];
  expect(beforeLock).toMatch(/if auth\.uid\(\) is null then\s+return new;\s+end if;/);
  expect(beforeLock).toMatch(/if new\.user_id is distinct from auth\.uid\(\) then\s+return new;\s+end if;/);
  expect(limitFunction).toMatch(/pg_advisory_xact_lock[\s\S]*count\(\*\)[\s\S]*>= 200/);
});

it('인계 RPC는 SECURITY DEFINER와 본인 인증 검사를 유지하며 통과 INSERT는 공통 한도 트리거를 거친다', () => {
  const rpc = migration.split('create function public.handoff_tutorial_passes(')[1];
  expect(rpc).toContain('security definer');
  expect(rpc).toContain('auth.uid() is null or auth.uid() <> target_user_id');
  expect(rpc).toContain('insert into public.tutorial_passes');
  expect(migration).toMatch(/before insert on public\.tutorial_passes\s+for each row execute function public\.enforce_tutorial_pass_limit\(\)/);
});

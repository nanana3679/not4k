import { describe, expect, it, vi } from 'vitest';

// src의 브라우저 타입 검사에 Node 전역(timer 등)을 추가하지 않고 실제 fs 모듈만 읽는다.
const { readFileSync } = await vi.importActual<{
  readFileSync(path: URL, encoding: 'utf8'): string;
}>('node:fs');

const sql = readFileSync(new URL(
  '../../supabase/migrations/20261101000000_song_timing_and_atomic_saves.sql',
  import.meta.url,
), 'utf8');
// 주석을 계약으로 오인하지 않도록 실행할 SQL만 검사한다. DB 실행 검증은 별도 verify.sql에서 한다.
const statements = sql.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim();
const functionNames = ['save_song', 'save_chart', 'create_chart'] as const;

function functionSql(name: typeof functionNames[number]): string {
  const declaration = statements.match(new RegExp(`create function public\\.${name}\\([\\s\\S]*?\\$\\$;`));
  if (!declaration) throw new Error(`${name} 함수 선언이 없습니다`);
  return declaration[0];
}

function addedColumns(table: 'songs' | 'charts'): string {
  const alteration = statements.match(new RegExp(`alter table public\\.${table} (.*?);`));
  if (!alteration) throw new Error(`${table} 열 추가가 없습니다`);
  return alteration[1];
}

describe('RFD 0107 곡·차트 저장 마이그레이션', () => {
  it('기존 songs에 열을 추가하면 timing은 nullable이고 revision은 NOT NULL DEFAULT 0이다', () => {
    expect(addedColumns('songs')).toContain('add column timing jsonb,');
    expect(addedColumns('songs')).toContain('add column revision bigint not null default 0,');
    expect(addedColumns('songs')).toContain('check (revision >= 0)');
  });

  it('timing을 저장하면 SQL NULL과 JSON 객체만 허용하고 배열·JSON null은 거부한다', () => {
    expect(addedColumns('songs')).toContain("check (timing is null or jsonb_typeof(timing) = 'object')");
    expect(sql).toContain('"bpmChanges":[{"beat":"0","bpm":120}]');
    expect(sql).toContain('"timeSignatureChanges":[{"beat":"0","beatPerMeasure":"4"}]');
    expect(sql).toContain('"offsetMs":0');
  });

  it('기존 charts에 열을 추가하면 두 JSON 경로는 nullable이고 revision은 NOT NULL DEFAULT 0이다', () => {
    expect(addedColumns('charts')).toContain('add column chart_path text,');
    expect(addedColumns('charts')).toContain('add column chart_extra_path text,');
    expect(addedColumns('charts')).toContain('add column revision bigint not null default 0,');
    expect(addedColumns('charts')).toContain('check (revision >= 0)');
    expect(sql).toContain('songChartPath');
    expect(sql).toContain('songChartExtraPath');
  });

  it.each(functionNames)('%s 호출자가 관리자가 아니면 첫 쓰기 전에 42501/admin_required로 거부한다', (name) => {
    const definition = functionSql(name);
    expect(definition).toMatch(
      /begin if public\.is_admin\(\) is not true then raise exception using errcode = '42501', message = 'admin_required'; end if;/,
    );
    const firstWrite = definition.search(/\b(update|insert into|delete from) public\./);
    expect(firstWrite).toBeGreaterThan(definition.indexOf("message = 'admin_required'; end if;"));
  });

  it.each(functionNames)('%s는 SECURITY DEFINER와 빈 search_path로 실행하고 authenticated에만 실행을 허용한다', (name) => {
    const definition = functionSql(name);
    expect(definition).toContain("language plpgsql security definer set search_path = ''");
    expect(definition).not.toMatch(/\bexecute\b/); // 동적 SQL 없이 스키마를 명시한 객체만 쓴다.
    const parameters = definition.slice(definition.indexOf('(') + 1, definition.indexOf(')'));
    const signature = parameters.split(',').map(parameter => parameter.trim().split(' ')[1]).join(', ');
    expect(statements).toContain(`revoke execute on function public.${name}(${signature}) from public, anon;`);
    expect(statements).toContain(`grant execute on function public.${name}(${signature}) to authenticated;`);
  });

  it.each([
    ['save_song', 'songs', 's'],
    ['save_chart', 'charts', 'c'],
  ] as const)('%s는 UPDATE의 expected revision 조건으로 저장하고 revision을 1 증가시켜 반환한다', (name, table, alias) => {
    const definition = functionSql(name);
    const update = definition.match(new RegExp(`update public\\.${table} as ${alias} (.*?) returning (.*?);`));
    expect(update).not.toBeNull();
    const [assignment, condition] = update![1].split(' where ');
    expect(assignment).toContain(`revision = ${alias}.revision + 1`);
    expect(assignment).toContain('updated_at = now()');
    expect(condition).toContain(`${alias}.revision = p_expected_revision`);
    expect(update![2]).toBe(`${alias}.revision into v_revision`);
    expect(definition).toContain('if found then return v_revision; end if;');
    expect(definition).not.toMatch(/\binsert into\b/);
  });

  it.each([
    ['save_song', 'song'],
    ['save_chart', 'chart'],
  ] as const)('%s에서 행 없음은 PT404, 행이 있으나 revision이 다르면 PT409로 구별한다', (name, entity) => {
    const definition = functionSql(name);
    expect(definition).toMatch(/if not exists \( ?select 1/);
    expect(definition).toContain(`errcode = 'PT404', message = '${entity}_not_found'`);
    expect(definition).toContain(`errcode = 'PT409', message = '${entity}_revision_conflict'`);
    expect(definition.indexOf("errcode = 'PT404'")).toBeLessThan(definition.indexOf("errcode = 'PT409'"));
  });

  it('save_song은 제목·아티스트·미디어·구간·페이드·타이밍 13개 필드를 UPDATE 하나로 교체한다', () => {
    const definition = functionSql('save_song');
    const fields = [
      'title', 'artist', 'jacket_url', 'audio_url', 'duration', 'preview_url',
      'preview_start', 'preview_end', 'gameplay_start', 'gameplay_end',
      'gameplay_fade_in', 'gameplay_fade_out', 'timing',
    ];
    expect(definition.match(/\bupdate public\./g)).toHaveLength(1);
    for (const field of fields) expect(definition).toContain(`${field} = p_${field}`);
    expect(definition).toContain('where s.id = p_song_id and s.revision = p_expected_revision');
    expect(definition).not.toContain('coalesce('); // 명시적 NULL도 그대로 저장한다.
    expect(definition).not.toContain('public.charts');
  });

  it('save_chart는 song_id·difficulty_label 키로 난이도와 두 경로만 교체하고 offset_ms 사본은 쓰지 않는다', () => {
    const definition = functionSql('save_chart');
    expect(definition).toContain('where c.song_id = p_song_id and c.difficulty_label = p_difficulty_label');
    for (const field of ['difficulty_level', 'chart_path', 'chart_extra_path']) {
      expect(definition).toContain(`${field} = p_${field}`);
    }
    expect(definition).not.toContain('offset_ms');
    expect(definition).not.toContain('public.songs');
  });

  it('create_chart는 INSERT 후 ID·revision 0을 반환하며 기존 키 충돌을 UPDATE로 바꾸지 않는다', () => {
    const definition = functionSql('create_chart');
    expect(definition).toContain('returns table (chart_id uuid, revision bigint)');
    expect(definition).toContain('return query insert into public.charts as c ( song_id, difficulty_label, difficulty_level, chart_path, chart_extra_path )');
    expect(definition).toContain('returning c.id, c.revision;');
    expect(definition).not.toMatch(/\bon conflict\b|\bupdate\b|\bdelete\b|\boffset_ms\b/);
    expect(definition).not.toContain('public.songs');
  });

  it('마이그레이션을 적용하면 기존 열·RLS 정책은 유지하고 함수 3개만 새로 만든다', () => {
    expect(statements).not.toMatch(/\b(drop|rename)\b|\b(create|alter) policy\b/);
    expect(statements).not.toMatch(/\balter column\b|\bdisable row level security\b/);
    expect(statements.match(/create function public\./g)).toHaveLength(3);
  });
});

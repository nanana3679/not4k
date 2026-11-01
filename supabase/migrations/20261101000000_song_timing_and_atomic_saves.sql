-- =============================================================
-- RFD 0107: 곡 공통 타이밍과 곡·차트의 원자적 저장
-- 파일은 호출 전에 새 Storage 경로로 업로드한다. 이 함수들은 경로만 확정한다.
-- 기존 열·RLS 정책·차트 JSON 사본은 그대로 두며, 앱 연결은 후속 PR에서 한다.
-- 필수 선행 조건: PR #396의 20261031000000_block_admin_privilege_bypass.sql.
-- profiles.is_admin 자기 승격을 막지 않은 환경에는 적용하지 않는다.
-- 다른 마이그레이션과 같이 트랜잭션 처리는 마이그레이션 실행기에 맡긴다.
-- =============================================================

-- 차트가 없는 곡은 삭제 후 같은 text ID로 재등록할 수 있다.
-- 기존 행·새 행·save_song이 하나의 시퀀스를 써서 과거 리비전을 재사용하지 않는다.
create sequence public.song_revision_seq as bigint no cycle;
alter table public.songs
  add column timing jsonb,
  add column revision bigint not null default nextval('public.song_revision_seq'::regclass),
  add constraint songs_timing_object check (timing is null or jsonb_typeof(timing) = 'object'),
  add constraint songs_revision_nonnegative check (revision >= 0);

alter sequence public.song_revision_seq owned by public.songs.revision;
-- 기존 관리자 INSERT도 기본값 nextval을 쓸 수 있게 하되 setval 권한은 주지 않는다.
revoke all on sequence public.song_revision_seq from public, anon, authenticated, service_role;
grant usage on sequence public.song_revision_seq to authenticated, service_role;

-- 타이밍 JSON의 저장 계약 (TS 타입·내용 검증은 PR2):
-- {
--   "bpmChanges": [{"beat": "0", "bpm": 120}],
--   "timeSignatureChanges": [{"beat": "0", "beatPerMeasure": "4"}],
--   "offsetMs": 0
-- }
-- beat·beatPerMeasure는 차트 JSON과 같은 분수 문자열("0", "3/2", "4").
-- 두 목록은 0박 초기값을 포함하고 박 순서로 나열한다. bpm·offsetMs는 숫자이며,
-- offsetMs는 플레이 음원 시작점에서 0박까지의 밀리초다. editorLane은 저장하지 않는다.
-- DB는 JSON 객체 여부만 검증한다. SQL NULL은 미이행 상태이며 JSON null과 다르다.
comment on column public.songs.timing is
  '곡 공통 타이밍 정본. {"bpmChanges":[{"beat":"0","bpm":120}],"timeSignatureChanges":[{"beat":"0","beatPerMeasure":"4"}],"offsetMs":0}. SQL NULL이면 미이행: 로더는 차트 JSON 타이밍으로 폴백한다. DB는 객체 여부만 검증한다.';
comment on column public.songs.revision is
  '곡 저장 충돌 검사용 리비전. 기존 행·새 행·save_song은 공유 song_revision_seq에서 발급받아 삭제·재등록에도 재사용하지 않는다. 실패·다른 곡 저장으로 결번이 생길 수 있으며 기록용 차트 버전과 무관하다.';

alter table public.charts
  add column chart_path text,
  add column chart_extra_path text,
  add column revision bigint not null default 0,
  add constraint charts_revision_nonnegative check (revision >= 0);

comment on column public.charts.chart_path is
  'assets 버킷의 메인 JSON 경로. NULL이면 songChartPath의 songs/{소문자 song_id}/{소문자 difficulty_label}.json을 사용한다.';
comment on column public.charts.chart_extra_path is
  'assets 버킷의 보조 JSON 경로. NULL이면 songChartExtraPath의 songs/{소문자 song_id}/{소문자 difficulty_label}.extra.json을 사용한다. 보조 정보 없음은 새 경로의 빈 보조 JSON으로 저장한다.';
comment on column public.charts.revision is
  '차트 저장 충돌 검사용 리비전. 기존 행·새 행은 0, save_chart 성공마다 1 증가. 기록용 차트 버전과 무관하다.';

-- 모든 인자는 필수이며, nullable 열을 비우려면 명시적으로 NULL을 전달한다.
-- 곡 ID·생성 시각·업로더는 유지하고, 편집 가능한 곡 정보 전체를 함께 교체한다.
create function public.save_song(
  p_song_id text,
  p_expected_revision bigint,
  p_title text,
  p_artist text,
  p_jacket_url text,
  p_audio_url text,
  p_duration numeric,
  p_preview_url text,
  p_preview_start numeric,
  p_preview_end numeric,
  p_gameplay_start numeric,
  p_gameplay_end numeric,
  p_gameplay_fade_in numeric,
  p_gameplay_fade_out numeric,
  p_timing jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revision bigint;
begin
  -- 헬퍼는 20260214300000_admin_role.sql, 신뢰 경계는 PR #396의 profiles 열 권한이다.
  if public.is_admin() is not true then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;

  -- 같은 리비전으로 경쟁하는 UPDATE 중 하나만 성공한다.
  update public.songs as s
  set title = p_title,
      artist = p_artist,
      jacket_url = p_jacket_url,
      audio_url = p_audio_url,
      duration = p_duration,
      preview_url = p_preview_url,
      preview_start = p_preview_start,
      preview_end = p_preview_end,
      gameplay_start = p_gameplay_start,
      gameplay_end = p_gameplay_end,
      gameplay_fade_in = p_gameplay_fade_in,
      gameplay_fade_out = p_gameplay_fade_out,
      timing = p_timing,
      revision = nextval('public.song_revision_seq'::regclass),
      updated_at = now()
  where s.id = p_song_id and s.revision = p_expected_revision
  returning s.revision into v_revision;

  if found then
    return v_revision;
  end if;
  if not exists (select 1 from public.songs where id = p_song_id) then
    raise exception using errcode = 'PT404', message = 'song_not_found';
  end if;
  raise exception using errcode = 'PT409', message = 'song_revision_conflict';
end;
$$;

-- UUID로 기존 행만 저장한다. 삭제 후 같은 곡·난이도로 만든 새 행은 다른 UUID다.
-- song_id·difficulty_label은 불변이며 다른 이름 저장은 create_chart로 한다.
-- 곡 소유 데이터의 사본(offset_ms 등)은 쓰지 않는다. 행의 ID·업로더도 유지한다.
create function public.save_chart(
  p_chart_id uuid,
  p_expected_revision bigint,
  p_difficulty_level integer,
  p_chart_path text,
  p_chart_extra_path text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revision bigint;
begin
  if public.is_admin() is not true then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;

  update public.charts as c
  set difficulty_level = p_difficulty_level,
      chart_path = p_chart_path,
      chart_extra_path = p_chart_extra_path,
      revision = c.revision + 1,
      updated_at = now()
  where c.id = p_chart_id and c.revision = p_expected_revision
  returning c.revision into v_revision;

  if found then
    return v_revision;
  end if;
  if not exists (select 1 from public.charts where id = p_chart_id) then
    raise exception using errcode = 'PT404', message = 'chart_not_found';
  end if;
  raise exception using errcode = 'PT409', message = 'chart_revision_conflict';
end;
$$;

-- Save As는 INSERT만 한다. 기존 키 충돌(23505)을 덮어쓰기로 바꾸지 않는다.
-- 신규 행의 revision은 기본값 0이며, ID와 함께 반환한다.
-- difficulty_label은 현재 저장 어댑터처럼 호출자가 소문자로 정규화한다.
create function public.create_chart(
  p_song_id text,
  p_difficulty_label text,
  p_difficulty_level integer,
  p_chart_path text,
  p_chart_extra_path text
)
returns table (chart_id uuid, revision bigint)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_admin() is not true then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;

  return query
  insert into public.charts as c (
    song_id, difficulty_label, difficulty_level, chart_path, chart_extra_path
  ) values (
    p_song_id, p_difficulty_label, p_difficulty_level, p_chart_path, p_chart_extra_path
  )
  returning c.id, c.revision;
end;
$$;

-- SECURITY DEFINER를 통한 RLS 우회는 함수 내부 관리자 확인 뒤에만 허용한다.
-- PUBLIC의 기본 실행 권한과 anon의 명시적 실행 권한을 같은 트랜잭션에서 제거한다.
revoke execute on function public.save_song(text, bigint, text, text, text, text, numeric, text, numeric, numeric, numeric, numeric, numeric, numeric, jsonb) from public, anon;
revoke execute on function public.save_chart(uuid, bigint, integer, text, text) from public, anon;
revoke execute on function public.create_chart(text, text, integer, text, text) from public, anon;

grant execute on function public.save_song(text, bigint, text, text, text, text, numeric, text, numeric, numeric, numeric, numeric, numeric, numeric, jsonb) to authenticated;
grant execute on function public.save_chart(uuid, bigint, integer, text, text) to authenticated;
grant execute on function public.create_chart(text, text, integer, text, text) to authenticated;


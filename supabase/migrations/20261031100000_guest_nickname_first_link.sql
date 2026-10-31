-- =============================================================
-- Guest 닉네임 생성 + 계정의 첫 연동
-- 클라이언트 UPDATE 권한은 앞 migration의 display_name 열 제한을 유지한다.
--
-- 주의: 4단계는 모든 프로필의 닉네임을 새 Guest 닉네임으로 바꾸고
-- 첫 연동 전 상태로 되돌린다. 다시 실행하면 적용 뒤 사용자가 정한
-- 닉네임과 첫 연동 기록이 모두 사라진다.
-- 1단계 열 추가에 IF NOT EXISTS를 붙이는 등 재실행할 수 있게 고치지 않는다.
-- 이미 적용한 DB에서는 열 추가가 실패해야 4단계가 다시 실행되지 않는다.
-- SQL Editor로 적용했다면 migration 이력에 남도록
-- `supabase migration repair --status applied 20261031100000`으로 기록한다.
-- =============================================================

-- 1. null이면 아직 첫 연동 전인 계정
alter table public.profiles add column first_linked_at timestamptz;
-- 첫 연동에서 받은 유효한 기기 Guest 닉네임은 충돌 여부와 관계없이 보관한다.
alter table public.profiles add column first_link_guest_nickname text;

-- 2. 기존 닉네임과 겹치지 않는 Guest 닉네임 생성
create or replace function public.generate_guest_nickname()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate text;
begin
  -- link_guest_nickname과 같은 키로 생성·첫 연동을 트랜잭션 종료까지 직렬화한다.
  perform pg_advisory_xact_lock(20261031100000::bigint);

  for attempt in 1..100 loop
    candidate := 'Guest' || lpad(floor(random() * 1000000)::int::text, 6, '0');
    if not exists (
      select 1 from public.profiles as p where p.display_name = candidate
    ) then
      return candidate;
    end if;
  end loop;

  raise exception 'Could not generate a non-colliding Guest nickname after 100 attempts';
end;
$$;

-- Supabase 기본 권한은 anon·authenticated에도 직접 부여되므로 함께 거둔다.
revoke execute on function public.generate_guest_nickname() from public, anon, authenticated;

-- 3. 신규 계정은 Google 실명 대신 Guest 닉네임으로 첫 연동을 기다린다.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, first_linked_at, first_link_guest_nickname)
  values (new.id, public.generate_guest_nickname(), null, null);
  return new;
end;
$$;

-- 4. 미출시 프로젝트이고 기존 계정은 소유자 1명뿐이다.
-- Google 실명을 제거하고 첫 연동 전 상태로 되돌린다.
-- 한 행씩 갱신해 다음 생성에서 앞서 바꾼 닉네임도 충돌 검사에 포함한다.
do $$
declare
  profile_id uuid;
begin
  for profile_id in select p.id from public.profiles as p loop
    update public.profiles as p
    set display_name = public.generate_guest_nickname(),
        first_linked_at = null,
        first_link_guest_nickname = null
    where p.id = profile_id;
  end loop;
end;
$$;

-- 5. 닉네임은 1～16자의 문자·십진 숫자만 허용한다(잠정 규칙).
-- 운영 PostgreSQL 17.6 / ICU en_US.UTF-8에서 2026-10-31 읽기 전용 확인:
-- [[:alnum:]]은 한글·CJK·라틴 문자·아라비아 인도 숫자를 허용하고,
-- 이모지·밑줄·공백·위 첨자 숫자·로마 숫자는 거부한다.
-- 한글 채움 문자 U+115F·U+1160·U+3164·U+FFA0도 [[:alnum:]]을 통과하지만
-- 빈칸으로 보이고 glossary는 빈 이름을 금지하므로 따로 거부한다.
alter table public.profiles
  alter column display_name set not null,
  add constraint profiles_display_name_format check (
    char_length(display_name) between 1 and 16
    and display_name ~ '^[[:alnum:]]+$'
    and display_name !~ '[\u115F\u1160\u3164\uFFA0]'
  );

-- 6. 첫 연동에서만 기기의 Guest 닉네임을 계정에 인계한다.
create function public.link_guest_nickname(guest_nickname text)
returns table (nickname text, first_link boolean, first_link_guest_nickname text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  current_nickname text;
  current_first_linked_at timestamptz;
  current_first_link_guest_nickname text;
  new_nickname text;
  new_first_link_guest_nickname text;
begin
  if caller_id is null or (auth.jwt()->>'is_anonymous')::boolean is true then
    raise exception 'A non-anonymous authenticated user is required'
      using errcode = '42501';
  end if;

  -- 첫 연동을 마친 계정은 잠금 없이 저장된 값을 돌려준다.
  -- 클라이언트는 first_linked_at을 null로 되돌릴 수 없으므로 이 판정은 바뀌지 않는다.
  select p.display_name, p.first_linked_at, p.first_link_guest_nickname
  into current_nickname, current_first_linked_at, current_first_link_guest_nickname
  from public.profiles as p
  where p.id = caller_id;

  if not found then
    raise exception 'Profile not found for the authenticated user'
      using errcode = 'P0002';
  end if;

  if current_first_linked_at is not null then
    return query select current_nickname, false, current_first_link_guest_nickname;
    return;
  end if;

  -- generate_guest_nickname과 같은 키를 행 잠금보다 먼저 획득한다.
  perform pg_advisory_xact_lock(20261031100000::bigint);

  -- 잠금을 기다리는 동안 다른 세션이 첫 연동을 마쳤을 수 있어 다시 읽는다.
  -- for no key update는 play_records·chart_rankings·user_settings INSERT의
  -- 외래 키 검사가 거는 FOR KEY SHARE와 충돌하지 않는다.
  select p.display_name, p.first_linked_at, p.first_link_guest_nickname
  into current_nickname, current_first_linked_at, current_first_link_guest_nickname
  from public.profiles as p
  where p.id = caller_id
  for no key update;

  if not found then
    raise exception 'Profile not found for the authenticated user'
      using errcode = 'P0002';
  end if;

  if current_first_linked_at is not null then
    return query select current_nickname, false, current_first_link_guest_nickname;
    return;
  end if;

  -- 응답 유실 후 재호출에서도 첫 연동의 기기 이름을 확인할 수 있게 보관한다.
  new_first_link_guest_nickname := case
    when guest_nickname ~ '^Guest[0-9]{6}$' then guest_nickname
    else null
  end;

  if new_first_link_guest_nickname is not null and not exists (
    select 1 from public.profiles as p
    where p.display_name = guest_nickname and p.id <> caller_id
  ) then
    new_nickname := guest_nickname;
  else
    new_nickname := public.generate_guest_nickname();
  end if;

  update public.profiles as p
  set display_name = new_nickname,
      first_linked_at = now(),
      first_link_guest_nickname = new_first_link_guest_nickname
  where p.id = caller_id;

  return query select new_nickname, true, new_first_link_guest_nickname;
end;
$$;

revoke execute on function public.link_guest_nickname(text) from public, anon;
grant execute on function public.link_guest_nickname(text) to authenticated;

-- 7. 수동 변경한 닉네임은 이후 첫 연동으로 덮어쓰지 않는다.
-- 트리거는 호출자 권한으로 동작하며 클라이언트의 열 UPDATE 권한은 늘리지 않는다.
-- 4단계처럼 권한 있는 역할이 이름을 바꾸며 first_linked_at을 null로 되돌리면
-- 첫 연동 전 상태로 남긴다.
create or replace function public.handle_profile_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.display_name is distinct from old.display_name
    and old.first_linked_at is null and new.first_linked_at is null then
    new.first_linked_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.handle_profile_update() from public, anon, authenticated;

create trigger on_profile_updated
  before update on public.profiles
  for each row
  execute function public.handle_profile_update();

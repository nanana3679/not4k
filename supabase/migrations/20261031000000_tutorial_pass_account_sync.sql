-- 항목 전체 통과만 동기화한다. 선택 위치·부분 성공은 저장하지 않는다.
create table public.tutorial_passes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  tutorial_id text not null constraint tutorial_passes_tutorial_id_check
    check (char_length(tutorial_id) between 1 and 64 and tutorial_id ~ '^[a-z0-9-]+$'),
  passed_at timestamptz not null default now(),
  primary key (user_id, tutorial_id)
);

create table public.tutorial_guest_handoffs (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  request_id uuid not null,
  handed_off_at timestamptz not null default now()
);

alter table public.tutorial_passes enable row level security;
alter table public.tutorial_guest_handoffs enable row level security;

create policy "tutorial_passes_select_own"
  on public.tutorial_passes for select to authenticated
  using (auth.uid() = user_id and (auth.jwt()->>'is_anonymous')::boolean is distinct from true);

create policy "tutorial_passes_insert_own"
  on public.tutorial_passes for insert to authenticated
  with check (auth.uid() = user_id and (auth.jwt()->>'is_anonymous')::boolean is distinct from true);

create policy "tutorial_guest_handoffs_select_own"
  on public.tutorial_guest_handoffs for select to authenticated
  using (auth.uid() = user_id and (auth.jwt()->>'is_anonymous')::boolean is distinct from true);

-- 마커 직접 INSERT는 금지: 빈 인계로 기회를 소진하거나 통과 INSERT와 분리할 수 없다.
-- UPDATE/DELETE 정책도 없으며 anon과 익명 Auth 유저 모두 접근하지 못한다.
revoke all on public.tutorial_passes, public.tutorial_guest_handoffs from anon, authenticated;
grant select, insert on public.tutorial_passes to authenticated;
grant select on public.tutorial_guest_handoffs to authenticated;

-- 직접 INSERT와 RPC 모두 계정별 최대 200행. 동일 계정의 동시 요청도 직렬화한다.
create function public.enforce_tutorial_pass_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(new.user_id::text));
  -- ON CONFLICT DO NOTHING 재시도는 한도에 도달했어도 허용한다.
  if not exists (
    select 1 from public.tutorial_passes p
    where p.user_id = new.user_id and p.tutorial_id = new.tutorial_id
  ) and (select count(*) from public.tutorial_passes p where p.user_id = new.user_id) >= 200 then
    raise exception 'Tutorial pass limit is 200 per account' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_tutorial_pass_limit() from public, anon, authenticated;
create trigger tutorial_passes_limit_before_insert
  before insert on public.tutorial_passes
  for each row execute function public.enforce_tutorial_pass_limit();

create function public.handoff_tutorial_passes(
  target_user_id uuid, request_id uuid, tutorial_ids text[]
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed_user_id uuid;
begin
  -- 요청 시작 후 계정이 바뀌어도 원래 대상 계정 외에는 인계하지 않는다.
  if auth.uid() is null or auth.uid() <> target_user_id
     or (auth.jwt()->>'is_anonymous')::boolean is not distinct from true then
    raise exception 'Tutorial handoff requires the target account' using errcode = '42501';
  end if;
  if coalesce(cardinality(tutorial_ids), 0) = 0 then
    return false;
  end if;
  -- 중복을 포함한 요청 원소 수를 먼저 검사해 unnest 작업량도 제한한다.
  if cardinality(tutorial_ids) > 100 then
    raise exception 'Tutorial handoff accepts at most 100 IDs' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(tutorial_ids) as ids(id)
    where id is null or char_length(id) not between 1 and 64 or id !~ '^[a-z0-9-]+$'
  ) then
    raise exception 'Invalid tutorial ID' using errcode = '22023';
  end if;

  insert into public.tutorial_guest_handoffs (user_id, request_id)
    values (target_user_id, request_id)
    on conflict (user_id) do nothing
    returning user_id into claimed_user_id;

  if claimed_user_id is null then
    -- 동시 기기 중 PK를 먼저 얻은 요청만 INSERT한다. 동일 영수증은 응답 유실 재확인이다.
    return exists (
      select 1 from public.tutorial_guest_handoffs h
      where h.user_id = target_user_id and h.request_id = handoff_tutorial_passes.request_id
    );
  end if;

  insert into public.tutorial_passes (user_id, tutorial_id)
    select target_user_id, id from unnest(tutorial_ids) as ids(id)
    on conflict (user_id, tutorial_id) do nothing;
  -- 마커와 통과 INSERT는 같은 RPC 트랜잭션이다. 실패 시 마커도 롤백한다.
  return true;
end;
$$;

revoke all on function public.handoff_tutorial_passes(uuid, uuid, text[]) from public, anon;
grant execute on function public.handoff_tutorial_passes(uuid, uuid, text[]) to authenticated;

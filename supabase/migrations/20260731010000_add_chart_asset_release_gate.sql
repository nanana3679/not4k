-- reader-first 배포와 revision writer 활성화를 DB fence로 분리한다.
-- 이 migration은 최초 asset_revision migration이 이미 수동 적용된 환경에서도
-- trigger/readiness gate가 반드시 추가되도록 별도 timestamp를 사용한다.
create table public.chart_asset_release_state (
  singleton boolean primary key default true check (singleton),
  revision_writes_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.chart_asset_release_state (singleton, revision_writes_enabled)
values (true, false);

alter table public.chart_asset_release_state enable row level security;
revoke all on table public.chart_asset_release_state from anon, authenticated;

create or replace function public.enforce_chart_asset_release_gate()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  writes_enabled boolean;
begin
  select revision_writes_enabled
    into writes_enabled
    from public.chart_asset_release_state
   where singleton = true
     for share;

  if tg_op = 'UPDATE' then
    if old.asset_revision is not null and new.asset_revision is null then
      raise exception 'chart asset revision downgrade is forbidden'
        using errcode = 'P0001';
    end if;
  end if;

  if writes_enabled is true then
    if new.asset_revision is null then
      raise exception 'revision-aware chart writer required'
        using errcode = 'P0001';
    end if;
    if tg_op = 'UPDATE' then
      if new.asset_revision is not distinct from old.asset_revision then
        raise exception 'revision-aware chart writer required'
          using errcode = 'P0001';
      end if;
    end if;
  elsif new.asset_revision is not null then
      raise exception 'chart revision writes are disabled'
        using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_chart_asset_release_gate() from public;

drop trigger if exists charts_require_revision_advance on public.charts;
create trigger charts_require_revision_advance
before insert or update on public.charts
for each row
execute function public.enforce_chart_asset_release_gate();

drop function if exists public.reject_legacy_chart_writer_after_revision();

create or replace function public.chart_asset_revision_readiness()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'schema_ready',
      exists (
        select 1
          from information_schema.columns
         where table_schema = 'public'
           and table_name = 'charts'
           and column_name = 'asset_revision'
      )
      and exists (
        select 1
          from pg_catalog.pg_trigger trigger
          join pg_catalog.pg_proc procedure
            on procedure.oid = trigger.tgfoid
         where trigger.tgrelid = 'public.charts'::regclass
           and trigger.tgname = 'charts_require_revision_advance'
           and trigger.tgenabled <> 'D'
           and not trigger.tgisinternal
           and procedure.proname = 'enforce_chart_asset_release_gate'
      )
      and exists (
        select 1
          from public.chart_asset_release_state
         where singleton = true
      ),
    'revision_writes_enabled',
      coalesce((
        select revision_writes_enabled
          from public.chart_asset_release_state
         where singleton = true
      ), false)
  );
$$;

revoke all on function public.chart_asset_revision_readiness() from public;
grant execute on function public.chart_asset_revision_readiness() to anon, authenticated;

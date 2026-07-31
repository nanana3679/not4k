-- 메인/보조 차트 파일 쌍의 게시 revision과 메타데이터를 charts 행 하나로 원자 커밋한다.
alter table charts
  add column asset_revision text;

alter table charts
  add constraint charts_asset_revision_format
  check (
    asset_revision is null
    or asset_revision ~ '^[a-z0-9][a-z0-9._-]*$'
  );

-- revision 게시 이후 구버전 writer는 asset_revision을 바꾸지 않은 채 stable 파일과
-- 메타데이터만 덮어쓴다. 이를 성공으로 오인하지 않도록 DB update를 명시적으로 거부한다.
create or replace function reject_legacy_chart_writer_after_revision()
returns trigger
language plpgsql
as $$
begin
  if old.asset_revision is not null
     and new.asset_revision is not distinct from old.asset_revision then
    raise exception 'revision-aware chart writer required'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger charts_require_revision_advance
before update on charts
for each row
execute function reject_legacy_chart_writer_after_revision();

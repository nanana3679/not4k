-- 메인/보조 차트 파일 쌍의 게시 revision과 메타데이터를 charts 행 하나로 원자 커밋한다.
alter table charts
  add column asset_revision text;

alter table charts
  add constraint charts_asset_revision_format
  check (
    asset_revision is null
    or asset_revision ~ '^[a-z0-9][a-z0-9._-]*$'
  );

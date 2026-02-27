-- =============================================================
-- songs 테이블에 preview 구간 (start/end) 컬럼 추가
-- preview_start, preview_end: 초 단위 (소수점 허용)
-- =============================================================

alter table songs
  add column preview_start numeric,
  add column preview_end numeric;

comment on column songs.preview_start is '프리뷰 시작 시간 (초)';
comment on column songs.preview_end is '프리뷰 끝 시간 (초)';

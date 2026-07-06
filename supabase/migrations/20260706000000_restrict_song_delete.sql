-- =============================================================
-- 곡 삭제 가드: 차트가 하나라도 남아 있으면 songs 행 삭제를 DB가 거부한다
--
-- 기존: charts.song_id → songs(id) on delete cascade
--   곡을 지우면 차트가 통째로 딸려 지워져, 실수 한 번에 채보 전체가
--   유실될 수 있다 (2026-07-06 곡 2개 오삭제 사고).
-- 변경: on delete restrict
--   차트를 전부 지운 뒤에만 곡을 지울 수 있다. 앱을 우회해
--   대시보드/SQL로 지워도 동일하게 막힌다.
-- =============================================================

alter table charts
  drop constraint charts_song_id_fkey;

alter table charts
  add constraint charts_song_id_fkey
    foreign key (song_id) references songs(id) on delete restrict;

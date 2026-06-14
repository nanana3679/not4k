-- songs 테이블에 실제 플레이에 사용할 음원 구간과 페이드 시간을 추가
-- gameplay_start, gameplay_end, gameplay_fade_in, gameplay_fade_out: 초 단위 (소수점 허용)

alter table songs
  add column gameplay_start numeric,
  add column gameplay_end numeric,
  add column gameplay_fade_in numeric,
  add column gameplay_fade_out numeric;

comment on column songs.gameplay_start is '인게임 음원 구간 시작 시간 (초). null이면 원본 음원 시작부터 사용';
comment on column songs.gameplay_end is '인게임 음원 구간 끝 시간 (초). null이면 원본 음원 끝까지 사용';
comment on column songs.gameplay_fade_in is '인게임 구간 시작 페이드 인 시간 (초)';
comment on column songs.gameplay_fade_out is '인게임 구간 끝 페이드 아웃 시간 (초)';

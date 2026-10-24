import { describe, it, expect } from 'vitest';
import {
  getDifficultyOrder,
  DIFFICULTIES,
  filterVisibleSongs,
  findRestoredFocus,
  getMobileSongCardActionState,
  getSelectedChartForSong,
  resolveGameplayRange,
  resolveSongCardFocus,
  shouldBlockSongNavKey,
  shouldPreventSongNavKeyDefault,
  sortChartsByDifficulty,
} from './helpers';
import type { DbChart, DbSong } from './types';

describe('getDifficultyOrder', () => {
  it('EASY < NORMAL < HARD < EXPERT 순서', () => {
    expect(getDifficultyOrder('EASY')).toBeLessThan(getDifficultyOrder('NORMAL'));
    expect(getDifficultyOrder('NORMAL')).toBeLessThan(getDifficultyOrder('HARD'));
    expect(getDifficultyOrder('HARD')).toBeLessThan(getDifficultyOrder('EXPERT'));
  });

  it('대소문자 무관하게 동일한 순서 반환', () => {
    expect(getDifficultyOrder('easy')).toBe(getDifficultyOrder('EASY'));
    expect(getDifficultyOrder('Hard')).toBe(getDifficultyOrder('HARD'));
  });

  it('알 수 없는 난이도는 마지막 순서', () => {
    expect(getDifficultyOrder('UNKNOWN')).toBeGreaterThan(getDifficultyOrder('EXPERT'));
  });
});

describe('DIFFICULTIES', () => {
  it('세 난이도명은 LIFTOFF → INFILTRATION → BREAKTHROUGH 순서로 정의됨', () => {
    expect([...DIFFICULTIES]).toEqual(['LIFTOFF', 'INFILTRATION', 'BREAKTHROUGH']);
  });
});

describe('sortChartsByDifficulty', () => {
  const chart = (id: string, label: string, level: number): DbChart => ({
    id,
    song_id: 'song-1',
    difficulty_label: label,
    difficulty_level: level,
  });

  it('HARD, EASY, NORMAL 입력 시 EASY, NORMAL, HARD 순서로 정렬', () => {
    const sorted = sortChartsByDifficulty([
      chart('c1', 'HARD', 9),
      chart('c2', 'EASY', 3),
      chart('c3', 'NORMAL', 6),
    ]);
    expect(sorted.map((c) => c.difficulty_label)).toEqual(['EASY', 'NORMAL', 'HARD']);
  });

  it('같은 난이도 라벨이면 레벨 오름차순으로 정렬', () => {
    const sorted = sortChartsByDifficulty([
      chart('c1', 'HARD', 11),
      chart('c2', 'HARD', 8),
    ]);
    expect(sorted.map((c) => c.id)).toEqual(['c2', 'c1']);
  });

  it('원본 배열을 변경하지 않음', () => {
    const original = [chart('c1', 'HARD', 9), chart('c2', 'EASY', 3)];
    sortChartsByDifficulty(original);
    expect(original.map((c) => c.id)).toEqual(['c1', 'c2']);
  });
});

describe('filterVisibleSongs', () => {
  const makeSong = (id: string, charts: DbChart[]): DbSong => ({
    id,
    title: id,
    artist: 'Artist',
    audio_url: `${id}.wav`,
    duration: null,
    preview_start: null,
    preview_end: null,
    preview_url: null,
    gameplay_start: null,
    gameplay_end: null,
    gameplay_fade_in: null,
    gameplay_fade_out: null,
    jacket_url: null,
    charts,
  });
  const chartless = makeSong('no-charts', []);
  const withChart = makeSong('with-charts', [
    { id: 'c1', song_id: 'with-charts', difficulty_label: 'EASY', difficulty_level: 3 },
  ]);

  it('admin이 아니면 차트 없는 곡 숨김', () => {
    expect(filterVisibleSongs([chartless, withChart], false)).toEqual([withChart]);
  });

  it('admin이면 차트 없는 곡도 표시', () => {
    expect(filterVisibleSongs([chartless, withChart], true)).toEqual([chartless, withChart]);
  });
});

describe('findRestoredFocus', () => {
  const songs: DbSong[] = [
    {
      id: 'song-a',
      title: 'A',
      artist: 'Artist',
      audio_url: 'a.wav',
      duration: null,
      preview_start: null,
      preview_end: null,
      preview_url: null,
      gameplay_start: null,
      gameplay_end: null,
      gameplay_fade_in: null,
      gameplay_fade_out: null,
      jacket_url: null,
      charts: [
        { id: 'a-easy', song_id: 'song-a', difficulty_label: 'EASY', difficulty_level: 3 },
      ],
    },
    {
      id: 'song-b',
      title: 'B',
      artist: 'Artist',
      audio_url: 'b.wav',
      duration: null,
      preview_start: null,
      preview_end: null,
      preview_url: null,
      gameplay_start: null,
      gameplay_end: null,
      gameplay_fade_in: null,
      gameplay_fade_out: null,
      jacket_url: null,
      charts: [
        { id: 'b-hard', song_id: 'song-b', difficulty_label: 'HARD', difficulty_level: 9 },
        { id: 'b-easy', song_id: 'song-b', difficulty_label: 'EASY', difficulty_level: 3 },
      ],
    },
  ];

  it('마지막 플레이 곡과 난이도가 있으면 해당 인덱스로 복원', () => {
    expect(findRestoredFocus(songs, 'song-b', 'HARD')).toEqual({
      songIndex: 1,
      chartIndex: 1, // 정렬 후 [EASY, HARD]에서 HARD는 1번
    });
  });

  it('난이도가 목록에 없으면 차트 인덱스는 0', () => {
    expect(findRestoredFocus(songs, 'song-b', 'EXPERT')).toEqual({
      songIndex: 1,
      chartIndex: 0,
    });
  });

  it('선택된 곡이 null이면 복원하지 않음', () => {
    expect(findRestoredFocus(songs, null, 'HARD')).toBeNull();
  });

  it('선택된 곡이 목록에 없으면 복원하지 않음', () => {
    expect(findRestoredFocus(songs, 'deleted-song', 'HARD')).toBeNull();
  });

  it('빈 곡 목록이면 복원하지 않음', () => {
    expect(findRestoredFocus([], 'song-a', 'EASY')).toBeNull();
  });
});

describe('getSelectedChartForSong', () => {
  const song: DbSong = {
    id: 'song-1',
    title: 'Song',
    artist: 'Artist',
    audio_url: 'song.wav',
    duration: null,
    preview_start: null,
    preview_end: null,
    preview_url: null,
    gameplay_start: null,
    gameplay_end: null,
    gameplay_fade_in: null,
    gameplay_fade_out: null,
    jacket_url: null,
    charts: [
      { id: 'chart-easy', song_id: 'song-1', difficulty_label: 'EASY', difficulty_level: 3 },
      { id: 'chart-hard', song_id: 'song-1', difficulty_label: 'HARD', difficulty_level: 9 },
    ],
  };

  it('선택한 곡과 차트 id가 일치할 때 해당 차트를 반환', () => {
    expect(getSelectedChartForSong(song, song.charts, {
      songId: 'song-1',
      chartId: 'chart-hard',
    })?.difficulty_label).toBe('HARD');
  });

  it('다른 곡의 선택 상태는 현재 곡의 Edit 표시로 쓰지 않음', () => {
    expect(getSelectedChartForSong(song, song.charts, {
      songId: 'song-2',
      chartId: 'chart-hard',
    })).toBeNull();
  });
});

describe('getMobileSongCardActionState', () => {
  const selectedChart = {
    id: 'chart-hard',
    song_id: 'song-1',
    difficulty_label: 'HARD',
    difficulty_level: 9,
  };

  it('선택한 차트가 있으면 admin 여부와 무관하게 Edit 표시', () => {
    expect(getMobileSongCardActionState({ selectedChart, isAdmin: true }).showEdit).toBe(true);
    expect(getMobileSongCardActionState({ selectedChart, isAdmin: false }).showEdit).toBe(true);
  });

  it('선택한 차트가 없으면 Edit 숨김', () => {
    expect(getMobileSongCardActionState({ selectedChart: null, isAdmin: true }).showEdit).toBe(false);
  });

  it('New Chart 액션은 admin-only 유지', () => {
    expect(getMobileSongCardActionState({ selectedChart, isAdmin: true }).showNewChart).toBe(true);
    expect(getMobileSongCardActionState({ selectedChart, isAdmin: false }).showNewChart).toBe(false);
  });
});

describe('resolveSongCardFocus', () => {
  it('이미 포커스된 곡을 다시 선택하면 현재 난이도 인덱스를 유지', () => {
    expect(resolveSongCardFocus({ songIndex: 2, chartIndex: 1 }, 2)).toEqual({
      songIndex: 2,
      chartIndex: 1,
    });
  });

  it('다른 곡을 선택하면 난이도 인덱스를 첫 번째로 초기화', () => {
    expect(resolveSongCardFocus({ songIndex: 2, chartIndex: 1 }, 3)).toEqual({
      songIndex: 3,
      chartIndex: 0,
    });
  });
});

describe('resolveGameplayRange', () => {
  const makeSong = (override: Partial<DbSong>): DbSong => ({
    id: 'song-1',
    title: 'Song',
    artist: 'Artist',
    audio_url: 'song.wav',
    duration: 120,
    preview_start: null,
    preview_end: null,
    preview_url: null,
    gameplay_start: null,
    gameplay_end: null,
    gameplay_fade_in: null,
    gameplay_fade_out: null,
    jacket_url: null,
    charts: [],
    ...override,
  });

  it('gameplay_start=30,gameplay_end=90이면 30~90초 gameplayRange 반환', () => {
    expect(resolveGameplayRange(makeSong({
      gameplay_start: 30,
      gameplay_end: 90,
      gameplay_fade_in: 1,
      gameplay_fade_out: 2,
    }))).toEqual({
      startTime: 30,
      endTime: 90,
      fadeInTime: 1,
      fadeOutTime: 2,
    });
  });

  it('gameplay 구간이 없으면 null을 반환해 전체 음원을 재생', () => {
    expect(resolveGameplayRange(makeSong({}))).toBeNull();
  });

  it('gameplay_end=150,duration=120이면 endTime은 120으로 클램핑', () => {
    expect(resolveGameplayRange(makeSong({
      gameplay_start: 30,
      gameplay_end: 150,
      gameplay_fade_in: 0,
      gameplay_fade_out: 0,
    }))).toEqual({
      startTime: 30,
      endTime: 120,
      fadeInTime: 0,
      fadeOutTime: 0,
    });
  });
});

describe('shouldBlockSongNavKey', () => {
  const base = { blockingModalOpen: false, hasPendingChartTarget: false, songsEmpty: false, defaultPrevented: false, repeat: false };

  it('차단 모달 없고 곡 있으면 ArrowDown 통과(차단 안 함)', () => {
    expect(shouldBlockSongNavKey({ ...base, key: 'ArrowDown' })).toBe(false);
  });

  it('설정 모달 등 차단 오버레이 열리면 Enter 차단', () => {
    expect(shouldBlockSongNavKey({ ...base, blockingModalOpen: true, key: 'Enter' })).toBe(true);
  });

  it('차단 오버레이 열리면 Escape도 차단(모달이 Escape를 소유)', () => {
    expect(shouldBlockSongNavKey({ ...base, blockingModalOpen: true, key: 'Escape' })).toBe(true);
  });

  it('난이도 생성 모달(newChartTarget) 떠 있으면 ArrowUp 차단', () => {
    expect(shouldBlockSongNavKey({ ...base, hasPendingChartTarget: true, key: 'ArrowUp' })).toBe(true);
  });

  it('곡이 0개면 Enter 차단', () => {
    expect(shouldBlockSongNavKey({ ...base, songsEmpty: true, key: 'Enter' })).toBe(true);
  });

  it('곡이 0개여도 Escape는 통과(뒤로가기 허용)', () => {
    expect(shouldBlockSongNavKey({ ...base, songsEmpty: true, key: 'Escape' })).toBe(false);
  });

  it('곡 0개 + 차단 오버레이면 Escape도 차단(오버레이 우선)', () => {
    expect(shouldBlockSongNavKey({ ...base, songsEmpty: true, blockingModalOpen: true, key: 'Escape' })).toBe(true);
  });

  it('다른 리스너가 이미 처리한(defaultPrevented=true) Escape는 차단 — 모달을 닫으며 처리한 Escape로 타이틀 이동 안 함', () => {
    expect(shouldBlockSongNavKey({ ...base, defaultPrevented: true, key: 'Escape' })).toBe(true);
  });

  it('defaultPrevented=true면 ArrowDown·Enter도 차단', () => {
    expect(shouldBlockSongNavKey({ ...base, defaultPrevented: true, key: 'ArrowDown' })).toBe(true);
    expect(shouldBlockSongNavKey({ ...base, defaultPrevented: true, key: 'Enter' })).toBe(true);
  });

  it('차단 모달 없고 repeat=false인 Escape는 통과(타이틀로 이동)', () => {
    expect(shouldBlockSongNavKey({ ...base, key: 'Escape' })).toBe(false);
  });

  it('Escape 자동 반복(repeat=true)은 차단 — 모달을 닫은 뒤 누르고 있는 Escape로 타이틀 이동 안 함', () => {
    expect(shouldBlockSongNavKey({ ...base, repeat: true, key: 'Escape' })).toBe(true);
  });

  it('Enter 자동 반복(repeat=true)은 차단 — 모달 Close를 Enter로 누르고 있어도 게임을 시작하지 않음', () => {
    expect(shouldBlockSongNavKey({ ...base, repeat: true, key: 'Enter' })).toBe(true);
  });

  it('차단 모달 없고 repeat=false인 Enter는 통과(게임 시작)', () => {
    expect(shouldBlockSongNavKey({ ...base, key: 'Enter' })).toBe(false);
  });

  it('ArrowDown 자동 반복(repeat=true)은 통과 — 누르고 있으면 곡을 계속 넘김', () => {
    expect(shouldBlockSongNavKey({ ...base, repeat: true, key: 'ArrowDown' })).toBe(false);
  });
});

describe('shouldPreventSongNavKeyDefault', () => {
  const button = { tagName: 'BUTTON', isContentEditable: false };

  it('버튼에서 온 Enter 자동 반복(repeat=true)은 기본 동작도 막음 — 포커스가 돌아온 버튼을 다시 눌러 모달을 다시 열지 않음', () => {
    expect(shouldPreventSongNavKeyDefault({ key: 'Enter', repeat: true, target: button })).toBe(true);
  });

  it('Escape 자동 반복(repeat=true)은 기본 동작을 막지 않음 — 뒤에 등록된 모달 리스너가 닫을 수 있음', () => {
    expect(shouldPreventSongNavKeyDefault({ key: 'Escape', repeat: true, target: button })).toBe(false);
  });

  it('첫 Enter(repeat=false)는 기본 동작을 막지 않음 — 포커스된 버튼은 그대로 눌림', () => {
    expect(shouldPreventSongNavKeyDefault({ key: 'Enter', repeat: false, target: button })).toBe(false);
  });

  it('ArrowDown 자동 반복은 기본 동작을 막지 않음', () => {
    expect(shouldPreventSongNavKeyDefault({ key: 'ArrowDown', repeat: true, target: button })).toBe(false);
  });

  it('한 줄 input에서 온 Enter 자동 반복은 막음 — 반복되는 암묵적 제출만 생기므로', () => {
    expect(shouldPreventSongNavKeyDefault({ key: 'Enter', repeat: true, target: { tagName: 'INPUT', isContentEditable: false } })).toBe(true);
  });

  it('textarea에서 온 Enter 자동 반복은 막지 않음 — 줄바꿈 입력을 유지', () => {
    expect(shouldPreventSongNavKeyDefault({ key: 'Enter', repeat: true, target: { tagName: 'TEXTAREA', isContentEditable: false } })).toBe(false);
  });

  it('contenteditable 요소에서 온 Enter 자동 반복은 막지 않음 — 줄바꿈 입력을 유지', () => {
    expect(shouldPreventSongNavKeyDefault({ key: 'Enter', repeat: true, target: { tagName: 'DIV', isContentEditable: true } })).toBe(false);
  });

  it('target이 없어도(null) Enter 자동 반복은 막음', () => {
    expect(shouldPreventSongNavKeyDefault({ key: 'Enter', repeat: true, target: null })).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import {
  getDifficultyOrder,
  DIFFICULTIES,
  filterVisibleSongs,
  findRestoredFocus,
  getMobileSongCardActionState,
  getSelectedChartForSong,
  resolveSongCardFocus,
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
  it('4개 난이도가 순서대로 정의됨', () => {
    expect([...DIFFICULTIES]).toEqual(['EASY', 'NORMAL', 'HARD', 'EXPERT']);
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

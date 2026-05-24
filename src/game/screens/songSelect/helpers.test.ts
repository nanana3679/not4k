import { describe, it, expect } from 'vitest';
import {
  getDifficultyOrder,
  DIFFICULTIES,
  getMobileSongCardActionState,
  getSelectedChartForSong,
} from './helpers';
import type { DbSong } from './types';

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

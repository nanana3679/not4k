import type React from 'react';
import { beat } from '../../../shared';
import type { Chart } from '../../../shared';
import type { DbChart, DbSong } from './types';

export const DIFFICULTIES = ['EASY', 'NORMAL', 'HARD', 'EXPERT'] as const;

const DIFFICULTY_ORDER = new Map(DIFFICULTIES.map((d, i) => [d, i]));

export function getDifficultyOrder(label: string): number {
  return DIFFICULTY_ORDER.get(label.toUpperCase() as typeof DIFFICULTIES[number]) ?? DIFFICULTIES.length;
}

export function sortChartsByDifficulty(charts: DbChart[]): DbChart[] {
  return [...charts].sort((a, b) =>
    getDifficultyOrder(a.difficulty_label) - getDifficultyOrder(b.difficulty_label)
    || a.difficulty_level - b.difficulty_level
  );
}

/** admin이 아니면 차트가 없는 곡을 숨긴다. */
export function filterVisibleSongs(allSongs: DbSong[], isAdmin: boolean): DbSong[] {
  return isAdmin ? allSongs : allSongs.filter((s) => s.charts.length > 0);
}

/**
 * 마지막 플레이 곡/난이도에 해당하는 포커스 인덱스를 찾는다.
 * 선택된 곡이 없거나 목록에 존재하지 않으면 null을 반환한다.
 */
export function findRestoredFocus(
  songs: DbSong[],
  selectedSongId: string | null,
  selectedDifficulty: string | null,
): { songIndex: number; chartIndex: number } | null {
  if (!selectedSongId) return null;
  const songIndex = songs.findIndex((s) => s.id === selectedSongId);
  if (songIndex < 0) return null;

  let chartIndex = 0;
  if (selectedDifficulty) {
    const sorted = sortChartsByDifficulty(songs[songIndex].charts);
    const idx = sorted.findIndex((c) => c.difficulty_label === selectedDifficulty);
    if (idx >= 0) chartIndex = idx;
  }
  return { songIndex, chartIndex };
}

export function getDifficultyColor(difficulty: string): React.CSSProperties {
  switch (difficulty.toLowerCase()) {
    case 'easy': return { backgroundColor: '#2d6a4f', borderColor: '#40916c' };
    case 'normal': return { backgroundColor: '#1d4e89', borderColor: '#2a6db5' };
    case 'hard': return { backgroundColor: '#7b2d26', borderColor: '#a33b32' };
    case 'expert': return { backgroundColor: '#5c2d82', borderColor: '#7b3fa8' };
    default: return { backgroundColor: '#3a3a3a', borderColor: '#555' };
  }
}

export function createEmptyChart(song: DbSong, difficulty: string, level: number): Chart {
  return {
    meta: {
      title: song.title,
      artist: song.artist,
      difficultyLabel: difficulty.toUpperCase(),
      difficultyLevel: level,
      imageFile: '',
      audioFile: '',
      previewAudioFile: '',
      offsetMs: 0,
    },
    notes: [],
    trillZones: [],
    events: [{ type: "bpm" as const, beat: beat(0, 1), bpm: 120, editorLane: 1 }, { type: "timeSignature" as const, beat: beat(0, 1), beatPerMeasure: beat(4, 1), editorLane: 2 }],
  };
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function generateSongId(title: string): string {
  const slug = slugify(title) || 'song';
  const hex = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  return `${slug}-${hex}`;
}

export function getCircularDistance(a: number, b: number, total: number): number {
  if (total === 0) return 0;
  const d = Math.abs(a - b);
  return Math.min(d, total - d);
}

export interface SongCardFocusState {
  songIndex: number;
  chartIndex: number;
}

export function resolveSongCardFocus(
  current: SongCardFocusState,
  nextSongIndex: number,
): SongCardFocusState {
  return {
    songIndex: nextSongIndex,
    chartIndex: current.songIndex === nextSongIndex ? current.chartIndex : 0,
  };
}

export interface SelectedChartRef {
  songId: string;
  chartId: string;
}

export function getSelectedChartForSong(
  song: DbSong,
  sortedCharts: DbSong['charts'],
  selection: SelectedChartRef | null,
): DbSong['charts'][number] | null {
  if (!selection || selection.songId !== song.id) return null;
  return sortedCharts.find((chart) => chart.id === selection.chartId) ?? null;
}

interface MobileSongCardActionInput {
  selectedChart: DbChart | null;
  isAdmin: boolean;
}

export interface MobileSongCardActionState {
  showEdit: boolean;
  showNewChart: boolean;
}

export function getMobileSongCardActionState({
  selectedChart,
  isAdmin,
}: MobileSongCardActionInput): MobileSongCardActionState {
  return {
    showEdit: selectedChart !== null,
    showNewChart: isAdmin,
  };
}

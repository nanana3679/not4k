import type React from 'react';
import { beat, normalizePlaybackRange } from '../../../shared';
import type { Chart, PlaybackRange } from '../../../shared';
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

export function resolveGameplayRange(song: DbSong): PlaybackRange | null {
  if (song.gameplay_start == null || song.gameplay_end == null) return null;
  const duration = song.duration != null && Number.isFinite(song.duration) && song.duration > 0
    ? song.duration
    : song.gameplay_end;

  return normalizePlaybackRange({
    startTime: song.gameplay_start,
    endTime: song.gameplay_end,
    fadeInTime: song.gameplay_fade_in ?? 0,
    fadeOutTime: song.gameplay_fade_out ?? 0,
  }, duration);
}

export function getDifficultyColor(difficulty: string): React.CSSProperties {
  switch (difficulty.toLowerCase()) {
    case 'easy': return { background: 'linear-gradient(180deg, #1e7a54, #145a3c)', borderColor: '#37c98a' };
    case 'normal': return { background: 'linear-gradient(180deg, #1e5aa0, #133f74)', borderColor: '#4a95e6' };
    case 'hard': return { background: 'linear-gradient(180deg, #9a3830, #6d2019)', borderColor: '#e8564a' };
    case 'expert': return { background: 'linear-gradient(180deg, #6d38a0, #43206e)', borderColor: '#b06fe6' };
    default: return { background: 'linear-gradient(180deg, #3a3f47, #262a30)', borderColor: '#5a616b' };
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

/**
 * 곡 선택 키보드 네비게이션(화살표/Enter/Escape)을 무시해야 하는지 판정한다.
 *
 * 곡 선택 위에 차단성 오버레이(설정 모달, 추가/삭제/난이도 모달 등)가 떠 있으면
 * 그 아래 곡 네비가 살아있으면 안 된다. 특히 모달 안에서 누른 Enter가 게임을 시작하거나
 * Escape가 타이틀로 이탈하는 회귀를 막는다. 곡이 없을 때는 Escape(뒤로가기)만 허용한다.
 */
export function shouldBlockSongNavKey(params: {
  blockingModalOpen: boolean;
  hasPendingChartTarget: boolean;
  songsEmpty: boolean;
  key: string;
}): boolean {
  const { blockingModalOpen, hasPendingChartTarget, songsEmpty, key } = params;
  if (blockingModalOpen || hasPendingChartTarget) return true;
  if (songsEmpty && key !== 'Escape') return true;
  return false;
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

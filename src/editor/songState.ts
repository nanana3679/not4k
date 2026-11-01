import type { ChartDocument, PlaybackRange } from '../shared';
import type { LoadedSongSharedData } from '../supabase/songSharedData';
import { toSongTiming } from '../shared/songAssets/toSongTiming';

import type { SongValues } from '../supabase/saveSong';

export interface EditorSong {
  revision: number;
  sourceDifficulty: string;
  needsTimingMigration: boolean;
  baseline: SongValues;
  duration: number | null;
  gameplayRange: PlaybackRange | null;
  pendingPreviewRange: PlaybackRange | null;
  pendingJacketFile: File | null;
  pendingAudioFile: File | null;
}

export function songValues(chart: ChartDocument, song: EditorSong): SongValues {
  const range = song.gameplayRange;
  return {
    title: chart.meta.title, artist: chart.meta.artist,
    jacketUrl: chart.meta.imageFile || null, audioUrl: chart.meta.audioFile,
    duration: song.duration, previewUrl: chart.meta.previewAudioFile || null,
    previewStart: chart.meta.previewStart ?? null, previewEnd: chart.meta.previewEnd ?? null,
    gameplayStart: range?.startTime ?? song.baseline.gameplayStart, gameplayEnd: range?.endTime ?? song.baseline.gameplayEnd,
    gameplayFadeIn: range && range.fadeInTime !== (song.baseline.gameplayFadeIn ?? 0)
      ? range.fadeInTime : song.baseline.gameplayFadeIn,
    gameplayFadeOut: range && range.fadeOutTime !== (song.baseline.gameplayFadeOut ?? 0)
      ? range.fadeOutTime : song.baseline.gameplayFadeOut,
    timing: toSongTiming(chart),
  };
}

/** resolveSongChart·초기 레인 배치·곡 음원 정보 적용 후에 기준을 만든다. */
export function createEditorSong(loaded: LoadedSongSharedData, chart: ChartDocument): EditorSong {
  const gameplayRange = loaded.gameplayStart != null && loaded.gameplayEnd != null ? {
    startTime: loaded.gameplayStart, endTime: loaded.gameplayEnd,
    fadeInTime: loaded.gameplayFadeIn ?? 0, fadeOutTime: loaded.gameplayFadeOut ?? 0,
  } : null;
  const song: EditorSong = {
    revision: loaded.revision, sourceDifficulty: chart.meta.difficultyLabel, needsTimingMigration: loaded.timing === null,
    duration: loaded.duration, gameplayRange,
    pendingPreviewRange: null, pendingJacketFile: null, pendingAudioFile: null,
    baseline: {
      title: chart.meta.title, artist: chart.meta.artist, jacketUrl: chart.meta.imageFile || null,
      audioUrl: chart.meta.audioFile, previewUrl: chart.meta.previewAudioFile || null,
      previewStart: chart.meta.previewStart ?? null, previewEnd: chart.meta.previewEnd ?? null,
      duration: loaded.duration, gameplayStart: loaded.gameplayStart, gameplayEnd: loaded.gameplayEnd,
      gameplayFadeIn: loaded.gameplayFadeIn, gameplayFadeOut: loaded.gameplayFadeOut,
      timing: toSongTiming(chart),
    },
  };
  return song;
}

export function isSongTimingDirty(chart: ChartDocument, song: EditorSong | null): boolean {
  if (!song) return false;
  try { return JSON.stringify(toSongTiming(chart)) !== JSON.stringify(song.baseline.timing); }
  catch { return true; } // 편집 중 잘못된 타이밍도 미저장이다. 저장 시 검증 오류를 표시한다.
}

export function isSongDirty(chart: ChartDocument, song: EditorSong | null): boolean {
  if (!song) return false;
  if (song.pendingJacketFile || song.pendingAudioFile) return true;
  try {
    const current = songValues(chart, song);
    return (Object.keys(current) as (keyof SongValues)[])
      .some(key => JSON.stringify(current[key]) !== JSON.stringify(song.baseline[key]));
  }
  catch { return true; }
}

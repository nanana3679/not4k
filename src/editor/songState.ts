import type { ChartDocument, ChartEvent, ChartMeta, PlaybackRange } from '../shared';
import type { LoadedSongSharedData } from '../supabase/songSharedData';
import { toSongTiming } from '../shared/songAssets/toSongTiming';
import { applySongTimingEvents } from '../shared/songAssets/resolveSongChart';

import type { SongValues } from '../supabase/saveSong';

/**
 * 곡 행이 있는 차트의 사본 값 가운데 Undo 이력 밖에 두는 값: 음원·자켓·프리뷰 클립 경로와 프리뷰 구간(RFD 0098, 사용자 확인 2026-11-08).
 * 곡 상태(`EditorSong`)의 이력 밖 값(`SongMediaState`: 길이·인게임 구간·대기 파일·프리뷰 페이드)과 짝을 이룬다.
 * Undo·Redo·편집 취소·마지막 유효 상태 복원은 이 값을 지금 값으로 유지한다. 곡 행이 없는 차트(Meta 창 경로)는 이 규칙을 쓰지 않는다.
 */
export const SONG_MEDIA_META_KEYS = ['audioFile', 'imageFile', 'previewAudioFile', 'previewStart', 'previewEnd'] as const;
export type SongMediaMeta = Pick<ChartMeta, typeof SONG_MEDIA_META_KEYS[number]>;

/** meta에서 이력 밖 값(`SongMediaMeta`)만 고른다. */
export function songMediaMetaOf(meta: ChartMeta): SongMediaMeta {
  return { audioFile: meta.audioFile, imageFile: meta.imageFile, previewAudioFile: meta.previewAudioFile,
    previewStart: meta.previewStart, previewEnd: meta.previewEnd };
}

/** 차트 사본의 음원·자켓·프리뷰 값을 `mediaMeta`로 바꾼다. 이미 같으면 받은 차트를 그대로 돌려준다. */
export function withSongMediaMeta(chart: ChartDocument, mediaMeta: SongMediaMeta): ChartDocument {
  if (SONG_MEDIA_META_KEYS.every(key => chart.meta[key] === mediaMeta[key])) return chart;
  return { ...chart, meta: { ...chart.meta, ...mediaMeta } };
}

export interface EditorSong {
  revision: number;
  needsTimingMigration: boolean;
  baseline: SongValues;
  duration: number | null;
  gameplayRange: PlaybackRange | null;
  pendingPreviewRange: PlaybackRange | null;
  pendingJacketFile: File | null;
  pendingAudioFile: File | null;
}

/** 곡 상태(`EditorSong`)의 이력 밖 값. 차트 사본의 음원·자켓·프리뷰 값(`SongMediaMeta`)과 함께 Undo 이력 밖에 둔다. */
export type SongMediaState = Pick<EditorSong, 'duration' | 'gameplayRange' | 'pendingPreviewRange' | 'pendingJacketFile' | 'pendingAudioFile'>;

export function samePlaybackRange(a: PlaybackRange | null, b: PlaybackRange | null): boolean {
  return a === b || (a !== null && b !== null
    && a.startTime === b.startTime && a.endTime === b.endTime
    && a.fadeInTime === b.fadeInTime && a.fadeOutTime === b.fadeOutTime);
}

/** 곡 상태의 이력 밖 값(`SongMediaState`)이 같은가. 파일은 같은 File 객체여야 하고 구간은 값으로 비교한다. */
export function sameSongMediaState(a: SongMediaState, b: SongMediaState): boolean {
  return a.duration === b.duration && a.pendingAudioFile === b.pendingAudioFile && a.pendingJacketFile === b.pendingJacketFile
    && samePlaybackRange(a.gameplayRange, b.gameplayRange) && samePlaybackRange(a.pendingPreviewRange, b.pendingPreviewRange);
}

type GameplayValueKey = 'gameplayStart' | 'gameplayEnd' | 'gameplayFadeIn' | 'gameplayFadeOut';

/**
 * 초안 구간이 없으면(구간 없는 행을 열었거나 시작·끝 중 하나만 있는 부분 행) 저장 기준의 값을 그대로 보내 열자마자 dirty가 되지 않게 한다.
 * 저장 기준에 구간이 있으면 초안 구간도 늘 있다(변경 취소는 기준 구간으로 돌리고 Undo는 구간을 바꾸지 않는다).
 */
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

/** 저장된 플레이 구간 값. 시작·끝이 모두 있어야 구간이며 NULL 페이드는 0초다. */
function gameplayRangeOf(values: Pick<SongValues, GameplayValueKey>): PlaybackRange | null {
  return values.gameplayStart != null && values.gameplayEnd != null ? {
    startTime: values.gameplayStart, endTime: values.gameplayEnd,
    fadeInTime: values.gameplayFadeIn ?? 0, fadeOutTime: values.gameplayFadeOut ?? 0,
  } : null;
}

/** resolveSongChart·초기 레인 배치·곡 음원 정보 적용 후에 기준을 만든다. */
export function createEditorSong(loaded: LoadedSongSharedData, chart: ChartDocument): EditorSong {
  const gameplayRange = gameplayRangeOf(loaded);
  const song: EditorSong = {
    revision: loaded.revision, needsTimingMigration: loaded.timing === null,
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

/**
 * 곡 정보 변경 취소(RFD 0098)가 되돌릴 값. 곡이 소유한 값만 마지막 곡 저장 기준으로 되돌리고 노트·차트별 이벤트·난이도·보조 레인 수는
 * 그대로 둔다. Undo 이력에 남는 값과 이력 밖 값을 나눠 돌려준다(사용자 확인, 2026-11-08).
 *
 * - `chart`: 제목·아티스트·오프셋·BPM·박자표를 되돌린 차트. 음원·자켓·프리뷰 경로·프리뷰 구간은 받은 차트 그대로다.
 *   이 값들이 이미 기준과 같으면 받은 차트 객체를 그대로 돌려준다.
 * - `mediaMeta`·`mediaState`: 이력 밖 값의 저장 기준. 차트 사본의 음원·자켓·프리뷰 경로·프리뷰 구간(`mediaMeta`)과 곡 상태의 길이·인게임 구간
 *   (`mediaState`)이며 대기 파일·프리뷰 페이드는 비운다.
 *
 * 타이밍 이벤트는 열 때와 같은 규칙(applySongTimingEvents)으로 되돌려 같은 종류·박의 이벤트는 차트의 보조 레인을 유지하고,
 * 기준에 없는 박의 타이밍 이벤트는 사라진다. 지금 차트에 없는 기준의 타이밍 이벤트는 `savedEvents`(마지막으로 불러오거나 저장한
 * 차트의 이벤트)에 같은 종류·박이 있으면 그 보조 레인으로 돌아온다.
 */
export function restoreSavedSongInfo(
  chart: ChartDocument,
  song: EditorSong,
  savedEvents: readonly ChartEvent[] = [],
): { chart: ChartDocument; mediaMeta: SongMediaMeta; mediaState: SongMediaState } {
  const baseline = song.baseline;
  const savedMeta: ChartMeta = { ...chart.meta, title: baseline.title, artist: baseline.artist, offsetMs: baseline.timing.offsetMs };
  const sameMeta = (Object.keys(savedMeta) as (keyof ChartMeta)[]).every(key => savedMeta[key] === chart.meta[key]);
  const events = applySongTimingEvents(chart.events, baseline.timing, savedEvents);
  return {
    chart: sameMeta && events === chart.events ? chart : { ...chart, meta: sameMeta ? chart.meta : savedMeta, events },
    mediaMeta: { imageFile: baseline.jacketUrl ?? '', audioFile: baseline.audioUrl, previewAudioFile: baseline.previewUrl ?? '',
      previewStart: baseline.previewStart ?? undefined, previewEnd: baseline.previewEnd ?? undefined },
    mediaState: { duration: baseline.duration, gameplayRange: gameplayRangeOf(baseline),
      pendingPreviewRange: null, pendingJacketFile: null, pendingAudioFile: null },
  };
}

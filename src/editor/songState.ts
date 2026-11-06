import type { ChartDocument, ChartEvent, ChartMeta, PlaybackRange } from '../shared';
import type { LoadedSongSharedData } from '../supabase/songSharedData';
import { toSongTiming } from '../shared/songAssets/toSongTiming';
import { applySongTimingEvents } from '../shared/songAssets/resolveSongChart';

import type { SongValues } from '../supabase/saveSong';

export interface SongDraft {
  /** 세션 내 음원 정체성. 저장해 경로가 바뀌어도 유지한다. */
  audioId: number;
  /** 지금 차트의 프리뷰 클립(`meta.previewAudioFile`)을 잘라 낸 음원의 id. audioId와 다르면 다음 곡 저장이 클립을 다시 만든다. */
  previewClipAudioId: number;
  duration: number | null;
  gameplayRange: PlaybackRange | null;
  pendingPreviewRange: PlaybackRange | null;
  pendingJacketFile: File | null;
  pendingAudioFile: File | null;
}

export interface EditorSong extends SongDraft {
  revision: number;
  needsTimingMigration: boolean;
  baseline: SongValues;
  /** 마지막 저장 음원의 정체성. 초안과 별도로 유지해 Undo 후 변경 취소도 저장 음원으로 돌아간다. */
  baselineAudioId: number;
}

type GameplayValueKey = 'gameplayStart' | 'gameplayEnd' | 'gameplayFadeIn' | 'gameplayFadeOut';

let nextSongAudioId = 0;
export function createSongAudioId(): number { return ++nextSongAudioId; }

/** File·구간 참조는 유지한다. 초안의 필드는 직접 수정하지 않고 새 객체로 교체한다. */
export function songDraftOf(song: SongDraft): SongDraft {
  const { audioId, previewClipAudioId, duration, gameplayRange, pendingPreviewRange, pendingJacketFile, pendingAudioFile } = song;
  return { audioId, previewClipAudioId, duration, gameplayRange, pendingPreviewRange, pendingJacketFile, pendingAudioFile };
}

function sameRange(a: PlaybackRange | null, b: PlaybackRange | null): boolean {
  return a === b || (a !== null && b !== null
    && a.startTime === b.startTime && a.endTime === b.endTime
    && a.fadeInTime === b.fadeInTime && a.fadeOutTime === b.fadeOutTime);
}

export function sameSongDraft(a: SongDraft | null, b: SongDraft | null): boolean {
  if (!a || !b) return a === b;
  return a.audioId === b.audioId && a.previewClipAudioId === b.previewClipAudioId && a.duration === b.duration
    && a.pendingAudioFile === b.pendingAudioFile && a.pendingJacketFile === b.pendingJacketFile
    && sameRange(a.gameplayRange, b.gameplayRange)
    && sameRange(a.pendingPreviewRange, b.pendingPreviewRange);
}

/**
 * 초안 구간의 저장 값. 초안 null은 "구간 없음"이라 저장 기준에 구간이 있으면(Undo가 저장을 넘어 돌아옴) 시작·끝·페이드를 NULL로 보낸다.
 * 시작·끝 중 하나만 있는 부분 행은 구간 없이 열리므로 행의 값을 그대로 둬 열자마자 dirty가 되지 않게 한다.
 */
function gameplayValues({ gameplayRange: range, baseline }: EditorSong): Pick<SongValues, GameplayValueKey> {
  if (!range) {
    const { gameplayStart, gameplayEnd, gameplayFadeIn, gameplayFadeOut } = baseline;
    return gameplayRangeOf(baseline)
      ? { gameplayStart: null, gameplayEnd: null, gameplayFadeIn: null, gameplayFadeOut: null }
      : { gameplayStart, gameplayEnd, gameplayFadeIn, gameplayFadeOut };
  }
  return {
    gameplayStart: range.startTime, gameplayEnd: range.endTime,
    gameplayFadeIn: range.fadeInTime !== (baseline.gameplayFadeIn ?? 0) ? range.fadeInTime : baseline.gameplayFadeIn,
    gameplayFadeOut: range.fadeOutTime !== (baseline.gameplayFadeOut ?? 0) ? range.fadeOutTime : baseline.gameplayFadeOut,
  };
}

export function songValues(chart: ChartDocument, song: EditorSong): SongValues {
  return {
    title: chart.meta.title, artist: chart.meta.artist,
    jacketUrl: chart.meta.imageFile || null, audioUrl: chart.meta.audioFile,
    duration: song.duration, previewUrl: chart.meta.previewAudioFile || null,
    previewStart: chart.meta.previewStart ?? null, previewEnd: chart.meta.previewEnd ?? null,
    ...gameplayValues(song),
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
  const audioId = createSongAudioId();
  const song: EditorSong = {
    audioId, baselineAudioId: audioId, previewClipAudioId: audioId,
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
 * 곡 정보 변경 취소(RFD 0098)의 결과. 곡이 소유한 값(제목·아티스트·자켓·음원·프리뷰 구간·오프셋·BPM·박자표 값과
 * 플레이 구간·길이·대기 파일)만 마지막 곡 저장 기준으로 되돌리고, 노트·차트별 이벤트·난이도·보조 레인 수는 그대로 둔다.
 * 타이밍 이벤트는 열 때와 같은 규칙(applySongTimingEvents)으로 되돌려 같은 종류·박의 이벤트는 차트의 보조 레인을 유지하고,
 * 기준에 없는 박의 타이밍 이벤트는 사라진다. 지금 차트에 없는 기준의 타이밍 이벤트는 `savedEvents`(마지막으로 불러오거나 저장한
 * 차트의 이벤트)에 같은 종류·박이 있으면 그 보조 레인으로 돌아온다. 곡 정보가 기준과 같으면 받은 차트 객체를 그대로 돌려준다.
 */
export function restoreSavedSongInfo(
  chart: ChartDocument,
  song: EditorSong,
  savedEvents: readonly ChartEvent[] = [],
): { chart: ChartDocument; song: EditorSong } {
  const baseline = song.baseline;
  const savedMeta: ChartMeta = { ...chart.meta, title: baseline.title, artist: baseline.artist,
    imageFile: baseline.jacketUrl ?? '', audioFile: baseline.audioUrl, previewAudioFile: baseline.previewUrl ?? '',
    previewStart: baseline.previewStart ?? undefined, previewEnd: baseline.previewEnd ?? undefined,
    offsetMs: baseline.timing.offsetMs };
  const sameMeta = (Object.keys(savedMeta) as (keyof ChartMeta)[]).every(key => savedMeta[key] === chart.meta[key]);
  const events = applySongTimingEvents(chart.events, baseline.timing, savedEvents);
  const restoredChart = sameMeta && events === chart.events ? chart
    : { ...chart, meta: sameMeta ? chart.meta : savedMeta, events };
  return {
    chart: restoredChart,
    // 저장 기준의 클립은 저장할 때 그 음원으로 맞췄으므로 클립의 음원도 기준 음원이다.
    song: { ...song, audioId: song.baselineAudioId, previewClipAudioId: song.baselineAudioId,
      duration: baseline.duration, gameplayRange: gameplayRangeOf(baseline),
      pendingPreviewRange: null, pendingJacketFile: null, pendingAudioFile: null },
  };
}

/**
 * 곡 정보 드로어의 편집(RFD 0098). 곡이 소유한 값(제목·아티스트·자켓·음원·프리뷰·플레이 구간·오프셋)을 store의 일반 경로로
 * 바꾼다. 차트 사본에 있는 값(제목·아티스트·음원 경로·프리뷰 구간·오프셋)은 `setChart`로 바꿔 Undo·Redo 이력을 따르고,
 * 곡 세션 값(대기 자켓·음원 파일·길이·플레이 구간·프리뷰 페이드)은 `setSong`으로 바꾼다. 곡 세션 값은 아직 차트 이력에 없어
 * Undo로 되돌리지 않는다(통합 이력은 PR6).
 *
 * 오프셋은 타이밍 값이라 재생 중에는 바꾸지 않고 정지 안내를 띄운다(RFD 0099). 제목·구간 같은 타이밍 외 값은 재생 중에도
 * 바꾼다(허용 여부는 PRD §12에서 관리).
 */
import type { PlaybackRange } from '../shared';
import { isPlaybackLockedChange } from './editing/playbackEditLock';
import { PAUSE_TO_EDIT_COPY } from './editorCopy';
import { initialRangeState, notifiedRange } from './components/previewRangeState';
import { restoreSavedSongInfo } from './songState';
import { useEditorStore } from './stores/editorStore';

function samePlaybackRange(a: PlaybackRange | null, b: PlaybackRange | null): boolean {
  if (a === null || b === null) return a === b;
  return a.startTime === b.startTime && a.endTime === b.endTime
    && a.fadeInTime === b.fadeInTime && a.fadeOutTime === b.fadeOutTime;
}

/** 곡 제목을 바꾼다. 같은 값이면 이력을 남기지 않는다. */
export function editSongTitle(title: string): void {
  const state = useEditorStore.getState();
  if (state.chart.meta.title !== title) state.applyMetaEdit({ title });
}

/** 곡 아티스트를 바꾼다. 같은 값이면 이력을 남기지 않는다. */
export function editSongArtist(artist: string): void {
  const state = useEditorStore.getState();
  if (state.chart.meta.artist !== artist) state.applyMetaEdit({ artist });
}

/** 고른 자켓 파일을 곡 저장 때 올릴 대기 파일로 둔다. */
export function editSongJacket(file: File): void {
  const { song, setSong } = useEditorStore.getState();
  if (song) setSong({ ...song, pendingJacketFile: file });
}

/**
 * 음원 정렬 오프셋을 바꾼다. 재생 중에는 값과 재생 상태를 바꾸지 않고 정지 안내를 띄운 뒤 false를 돌려준다(RFD 0099).
 * 같은 값이면 아무것도 하지 않고 true다. 곡 행이 없는 차트의 오프셋 줄도 같은 규칙을 쓴다.
 */
export function editAudioOffset(offsetMs: number): boolean {
  const { chart, isPlaying, setChart, addToast } = useEditorStore.getState();
  if (chart.meta.offsetMs === offsetMs) return true;
  if (isPlaying) {
    addToast(PAUSE_TO_EDIT_COPY, 'warn');
    return false;
  }
  setChart({ ...chart, meta: { ...chart.meta, offsetMs } });
  return true;
}

/**
 * 프리뷰 구간을 바꾼다. 시작·끝은 차트 사본(이력 대상)에, 페이드는 곡 저장의 프리뷰 클립에 쓸 대기 구간에 둔다.
 * 시작·끝이 같으면 차트 이력을 남기지 않는다.
 */
export function editPreviewRange(range: PlaybackRange): void {
  const state = useEditorStore.getState();
  if (!state.song) return;
  const { previewStart, previewEnd } = state.chart.meta;
  if (previewStart !== range.startTime || previewEnd !== range.endTime) {
    state.applyMetaEdit({ previewStart: range.startTime, previewEnd: range.endTime });
  }
  const song = useEditorStore.getState().song;
  if (song && !samePlaybackRange(song.pendingPreviewRange, range)) useEditorStore.getState().setSong({ ...song, pendingPreviewRange: range });
}

/** 인게임 플레이 구간과 페이드를 바꾼다. */
export function editGameplayRange(range: PlaybackRange): void {
  const { song, setSong } = useEditorStore.getState();
  if (song && !samePlaybackRange(song.gameplayRange, range)) setSong({ ...song, gameplayRange: range });
}

/**
 * 로드에 성공한 음원 파일을 곡 음원으로 둔다. 음원 경로·대기 파일·길이와 함께, 새 길이에 맞춘 프리뷰·인게임 구간을 구간
 * 선택기가 처음 그릴 값(initialRangeState)으로 적용한다. 기존 Meta 창이 음원 교체 때 새 길이의 구간을 함께 적용하던 규칙과 같다.
 */
export function editSongAudio(file: File, duration: number): void {
  const state = useEditorStore.getState();
  const song = state.song;
  if (!song) return;
  const meta = state.chart.meta;
  const preview = notifiedRange(initialRangeState(duration, {
    initialStart: meta.previewStart, initialEnd: meta.previewEnd,
    initialFadeInTime: song.pendingPreviewRange?.fadeInTime, initialFadeOutTime: song.pendingPreviewRange?.fadeOutTime,
  }));
  const gameplay = notifiedRange(initialRangeState(duration, {
    initialStart: song.gameplayRange?.startTime, initialEnd: song.gameplayRange?.endTime,
    initialFadeInTime: song.gameplayRange?.fadeInTime, initialFadeOutTime: song.gameplayRange?.fadeOutTime,
    defaultStart: 0, defaultEnd: duration, defaultDuration: duration, showFadeControls: true,
  }));
  state.applyMetaEdit({ audioFile: file.name, previewStart: preview.startTime, previewEnd: preview.endTime });
  const current = useEditorStore.getState();
  current.setSong({ ...(current.song ?? song), duration, pendingAudioFile: file,
    pendingPreviewRange: preview, gameplayRange: gameplay });
}

export interface DiscardSongInfoResult {
  /** 곡 정보를 마지막 저장 상태로 되돌렸는가. 재생 중 타이밍을 되돌려야 하거나 곡 행이 없으면 false다. */
  discarded: boolean;
  /** 대기 음원을 버려 재생기에 다시 불러올 저장된 음원 경로. 바꾸지 않았거나 저장된 음원이 없으면 null이다. */
  reloadAudioUrl: string | null;
}

/**
 * 곡 정보 변경 취소(RFD 0098). 곡 소유 값만 마지막 곡 저장 기준으로 되돌리고 노트·차트별 이벤트·난이도 편집은 남긴다.
 * 차트 사본의 변경은 `setChart`의 별도 이력 한 단위라 Undo하면 취소 직전 곡 정보로, Redo하면 다시 취소한 상태로 간다.
 * 대기 파일·플레이 구간·길이는 곡 세션 값이라 이력 밖에서 비운다(PR6 전). 재생 중 오프셋·BPM·박자표를 되돌려야 하면
 * 아무것도 바꾸지 않고 정지 안내를 띄운다(RFD 0099).
 */
export function discardSongInfoChanges(): DiscardSongInfoResult {
  const state = useEditorStore.getState();
  const song = state.song;
  if (!song) return { discarded: false, reloadAudioUrl: null };
  const restored = restoreSavedSongInfo(state.chart, song);
  if (state.isPlaying && isPlaybackLockedChange(state.chart, restored.chart)) {
    state.addToast(PAUSE_TO_EDIT_COPY, 'warn');
    return { discarded: false, reloadAudioUrl: null };
  }
  if (restored.chart !== state.chart) {
    state.setChart(restored.chart, { separateHistory: true });
    // 구조 검증 등으로 거부되면 곡 세션 값도 그대로 둔다.
    if (useEditorStore.getState().chart !== restored.chart) return { discarded: false, reloadAudioUrl: null };
  }
  useEditorStore.getState().setSong(restored.song);
  return { discarded: true, reloadAudioUrl: song.pendingAudioFile && song.baseline.audioUrl ? song.baseline.audioUrl : null };
}

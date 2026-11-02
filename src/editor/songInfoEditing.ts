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
import { savedChartEvents } from './savedChart';
import { restoreSavedSongInfo, SONG_SESSION_META_KEYS, songSessionMetaOf } from './songState';
import { useEditorStore } from './stores/editorStore';
import { normalizeSelection } from './stores/selectionSlice';

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
  /**
   * 드로어에서 바꾼 음원(대기 음원)을 버렸으면 재생기를 되돌릴 저장된 음원의 경로(`savedAudioUrl`, 저장된 음원이 없으면 null).
   * 음원을 바꾸지 않았으면 null이다. 재생기를 되돌리는 일은 드로어 음원(drawerSongAudio)이 맡는다.
   */
  discardedAudio: { savedAudioUrl: string | null } | null;
}

/**
 * 곡 정보 변경 취소(RFD 0098). 곡 소유 값만 마지막 곡 저장 기준으로 되돌리고 노트·차트별 이벤트·난이도 편집은 남긴다.
 *
 * - 미디어 경로·프리뷰 구간(SONG_SESSION_META_KEYS)과 대기 파일·플레이 구간·길이는 곡 세션 값이라 이력 없이 먼저 되돌린다.
 *   그래서 변경 취소의 Undo는 제목·아티스트·오프셋·BPM·박자표만 되살리고, 버린 음원이나 그 길이에 맞춘 구간을 저장된 음원 위에
 *   되살리지 않는다(통합 이력은 PR6).
 * - 제목·아티스트·오프셋·BPM·박자표의 되돌림은 `setChart`의 별도 이력 한 단위라 Undo하면 취소 직전 값으로, Redo하면 다시 취소한
 *   상태로 간다. 이 값이 이미 기준과 같으면 이력을 남기지 않는다.
 * - 되살아난 타이밍 이벤트가 이벤트 순서를 바꿔도 이벤트 선택은 같은 이벤트를 가리키게 옮긴다(되돌려 없어진 이벤트는 선택에서 뺀다).
 *   되살아난 이벤트는 마지막으로 불러오거나 저장한 차트의 보조 레인을 쓴다.
 *
 * 재생 중 오프셋·BPM·박자표를 되돌려야 하면 아무것도 바꾸지 않고 정지 안내를 띄운다(RFD 0099).
 */
export function discardSongInfoChanges(): DiscardSongInfoResult {
  const state = useEditorStore.getState();
  const song = state.song;
  if (!song) return { discarded: false, discardedAudio: null };
  const restored = restoreSavedSongInfo(state.chart, song, savedChartEvents(state.savedChartJson));
  if (state.isPlaying && isPlaybackLockedChange(state.chart, restored.chart)) {
    state.addToast(PAUSE_TO_EDIT_COPY, 'warn');
    return { discarded: false, discardedAudio: null };
  }
  // 차트를 바꿀 때는 열린 편집(붙여넣기 대기 등)을 먼저 확정해, 아래의 이력 없는 되돌림이 그 편집의 시작 상태와 섞이지 않게 한다.
  if (restored.chart !== state.chart) state.commitEditTransaction();
  const before = useEditorStore.getState();
  const sessionMeta = songSessionMetaOf(restored.chart.meta);
  const previousSessionMeta = songSessionMetaOf(before.chart.meta);
  if (SONG_SESSION_META_KEYS.some(key => sessionMeta[key] !== previousSessionMeta[key])) before.reconcileSongMedia(sessionMeta);

  const current = useEditorStore.getState().chart;
  const restMetaChanged = (Object.keys(restored.chart.meta) as (keyof typeof restored.chart.meta)[])
    .some(key => restored.chart.meta[key] !== current.meta[key]);
  if (restMetaChanged || restored.chart.events !== current.events) {
    const selection = useEditorStore.getState().selection;
    const next = { ...current, meta: restored.chart.meta, events: restored.chart.events };
    useEditorStore.getState().setChart(next, { separateHistory: true });
    // 구조 검증 등으로 거부되면 먼저 되돌린 미디어 경로·프리뷰 구간을 원래대로 돌리고 대기 파일·구간도 그대로 둔다.
    if (useEditorStore.getState().chart !== next) {
      useEditorStore.getState().reconcileSongMedia(previousSessionMeta);
      return { discarded: false, discardedAudio: null };
    }
    if (restored.chart.events !== current.events) keepEventSelection(selection, current.events, next.events);
  }
  useEditorStore.getState().setSong(restored.song);
  return { discarded: true, discardedAudio: song.pendingAudioFile ? { savedAudioUrl: song.baseline.audioUrl || null } : null };
}

/**
 * 이벤트 배열이 바뀐 뒤에도 고른 이벤트를 같은 객체로 다시 찾는다. setChart는 배열이 줄 때만 객체로 다시 찾으므로,
 * 변경 취소처럼 타이밍 이벤트를 앞에 다시 놓아 순서가 바뀌는 경우는 여기서 맞춘다.
 */
function keepEventSelection(
  selection: ReturnType<typeof useEditorStore.getState>['selection'],
  beforeEvents: readonly unknown[],
  afterEvents: readonly unknown[],
): void {
  const indexByEvent = new Map(afterEvents.map((event, index) => [event, index]));
  const events = new Set([...selection.events].flatMap(index => {
    const next = indexByEvent.get(beforeEvents[index]);
    return next === undefined ? [] : [next];
  }));
  const state = useEditorStore.getState();
  // 차트 변경이 하는 선택 보정이라 재생 여부와 관계없이 store에 직접 쓴다(setChart·Undo와 같다).
  useEditorStore.setState({ selection: normalizeSelection({ ...state.selection, events }, state.chart) });
}

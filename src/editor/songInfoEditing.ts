/**
 * 곡 정보 드로어 편집(RFD 0098). 차트 사본과 곡 초안을 setChart 한 번으로 바꿔 노트와 같은 시간순 Undo·Redo 이력을 쓴다.
 * 음원 교체·변경 취소는 앞뒤 편집과 합치지 않는다. 서버 리비전·저장 기준은 초안 복원과 별개다.
 * 오프셋·BPM·박자표 변경은 정지 중에만 허용한다(RFD 0099).
 */
import type { PlaybackRange } from '../shared';
import { isPlaybackLockedChange } from './editing/playbackEditLock';
import { PAUSE_TO_EDIT_COPY } from './editorCopy';
import { initialRangeState, notifiedRange } from './components/previewRangeState';
import { savedChartEvents } from './savedChart';
import { restoreSavedSongInfo, sameSongDraft, songDraftOf } from './songState';
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
  const { chart, song, setChart } = useEditorStore.getState();
  if (song && song.pendingJacketFile !== file) setChart(chart, { songDraft: { pendingJacketFile: file } });
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

/** 프리뷰 시작·끝과 대기 페이드를 Undo 한 단위로 바꾼다. */
export function editPreviewRange(range: PlaybackRange): void {
  const { chart, song, setChart } = useEditorStore.getState();
  if (!song) return;
  const changed = chart.meta.previewStart !== range.startTime || chart.meta.previewEnd !== range.endTime;
  if (!changed && samePlaybackRange(song.pendingPreviewRange, range)) return;
  setChart(changed ? { ...chart, meta: { ...chart.meta, previewStart: range.startTime, previewEnd: range.endTime } } : chart,
    { songDraft: { pendingPreviewRange: range } });
}

/** 인게임 플레이 구간과 페이드를 Undo 한 단위로 바꾼다. */
export function editGameplayRange(range: PlaybackRange): void {
  const { chart, song, setChart } = useEditorStore.getState();
  if (song && !samePlaybackRange(song.gameplayRange, range)) setChart(chart, { songDraft: { gameplayRange: range } });
}

/**
 * 로드에 성공한 음원 파일을 곡 음원으로 둔다. 음원 경로·대기 파일·길이와 함께, 새 길이에 맞춘 프리뷰·인게임 구간을 구간
 * 선택기가 처음 그릴 값(initialRangeState)으로 적용한다. 기존 Meta 창이 음원 교체 때 새 길이의 구간을 함께 적용하던 규칙과 같다.
 */
export function editSongAudio(file: File, duration: number, audioId: number): void {
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
  state.setChart({ ...state.chart, meta: { ...meta, audioFile: file.name,
    previewStart: preview.startTime, previewEnd: preview.endTime } }, {
    isolated: true,
    songDraft: { audioId, duration, pendingAudioFile: file, pendingPreviewRange: preview, gameplayRange: gameplay },
  });
}

export interface DiscardSongInfoResult {
  /** 곡 정보를 마지막 저장 상태로 되돌렸는가. 재생 중 타이밍 복원·구조 위반·곡 행 없음이면 false다. */
  discarded: boolean;
}

/** 곡 소유 값만 한 작업으로 되돌린다. Undo는 취소 전 초안을 복원하고 드로어를 다시 연다. */
export function discardSongInfoChanges(): DiscardSongInfoResult {
  const state = useEditorStore.getState();
  if (!state.song) return { discarded: false };
  const target = restoreSavedSongInfo(state.chart, state.song, savedChartEvents(state.savedChartJson));
  if (state.isPlaying && isPlaybackLockedChange(state.chart, target.chart)) {
    state.addToast(PAUSE_TO_EDIT_COPY, 'warn');
    return { discarded: false };
  }
  if (target.chart === state.chart && sameSongDraft(state.song, target.song)) return { discarded: true };
  state.commitEditTransaction();
  const before = useEditorStore.getState();
  before.setChart(target.chart, { songDraft: songDraftOf(target.song), isolated: true, reopensSongInfo: true });
  const current = useEditorStore.getState();
  if (current.chart !== target.chart || !sameSongDraft(current.song, target.song)) return { discarded: false };
  if (target.chart.events !== before.chart.events) keepEventSelection(before.selection, before.chart.events, target.chart.events);
  return { discarded: true };
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

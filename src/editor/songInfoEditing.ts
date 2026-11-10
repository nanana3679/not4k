/**
 * 곡 정보 드로어 편집(RFD 0098).
 *
 * - 제목·아티스트·오프셋(과 타임라인의 BPM·박자표)은 차트 사본을 setChart로 바꿔 노트와 같은 시간순 Undo·Redo 이력을 쓴다.
 * - 음원·자켓·프리뷰 구간·인게임 구간은 Undo 이력에 넣지 않는다(사용자 확인, 2026-11-08). 차트 사본의 경로·프리뷰 구간(`SongMediaMeta`)과
 *   곡 상태의 길이·구간·대기 파일(`SongMediaState`)을 `applySongMedia`로 바꾸며, Undo·Redo·변경 취소의 Undo는 이 값의 지금 상태를
 *   유지한다. 잘못 고른 음원은 다시 고른다.
 * - 드로어에서 바로 하는 편집은 독립 명령이라 열린 편집 transaction(붙여넣기 대기 등)을 먼저 확정한다. 음원 교체(`editSongAudio`)는
 *   로드가 끝날 때 비동기로 적용되므로 확정하지 않아 그 사이 시작한 캔버스 드래그를 끊지 않는다.
 *
 * 오프셋·BPM·박자표 변경은 정지 중에만 허용한다(RFD 0099).
 */
import type { PlaybackRange } from '../shared';
import { isPlaybackLockedChange } from './editing/playbackEditLock';
import { AUDIO_RANGE_RESET_COPY, PAUSE_TO_EDIT_COPY } from './editorCopy';
import { rangesForNewAudio, type NewAudioRanges } from './components/previewRangeState';
import { savedChartEvents } from './savedChart';
import {
  restoreSavedSongInfo,
  samePlaybackRange,
  sameSongMediaState,
  SONG_MEDIA_META_KEYS,
  type SongMediaMeta,
  type SongMediaState,
} from './songState';
import { useEditorStore } from './stores/editorStore';
import { normalizeSelection } from './stores/selectionSlice';

/** 사용자가 드로어에서 바로 바꾼 이력 밖 값. 열린 transaction을 먼저 확정한 뒤 이력·Redo·병합 창을 건드리지 않고 바꾼다. */
function editSongMedia(mediaMeta: Partial<SongMediaMeta>, mediaState: Partial<SongMediaState>): void {
  useEditorStore.getState().commitEditTransaction();
  useEditorStore.getState().applySongMedia(mediaMeta, mediaState);
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

/** 고른 자켓 파일을 곡 저장 때 올릴 대기 파일로 둔다. Undo 이력은 남기지 않는다. */
export function editSongJacket(file: File): void {
  const { song } = useEditorStore.getState();
  if (song && song.pendingJacketFile !== file) editSongMedia({}, { pendingJacketFile: file });
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

/** 프리뷰 시작·끝과 대기 페이드를 바꾼다. Undo 이력은 남기지 않는다. */
export function editPreviewRange(range: PlaybackRange): void {
  const { chart, song } = useEditorStore.getState();
  if (!song) return;
  if (chart.meta.previewStart === range.startTime && chart.meta.previewEnd === range.endTime
    && samePlaybackRange(song.pendingPreviewRange, range)) return;
  editSongMedia({ previewStart: range.startTime, previewEnd: range.endTime }, { pendingPreviewRange: range });
}

/** 인게임 플레이 구간과 페이드를 바꾼다. Undo 이력은 남기지 않는다. */
export function editGameplayRange(range: PlaybackRange): void {
  const { song } = useEditorStore.getState();
  if (song && !samePlaybackRange(song.gameplayRange, range)) editSongMedia({}, { gameplayRange: range });
}

function notifyResetRanges({ reset }: NewAudioRanges): void {
  if (reset) useEditorStore.getState().addToast(AUDIO_RANGE_RESET_COPY[reset], 'warn');
}

/**
 * 로드에 성공한 음원 파일을 곡 음원으로 둔다. 음원 경로·대기 파일·길이와 프리뷰·인게임 구간(`rangesForNewAudio`, #444)을 함께 바꾸고
 * 기본값으로 돌린 구간을 알린다. 음원 교체와 구간 조정 모두 Undo 이력을 남기지 않는다(사용자 확인, 2026-11-08).
 *
 * 드로어 음원(drawerSongAudio)이 로드가 끝날 때 부르므로 열린 transaction을 확정하지 않는다. 고른 뒤 디코딩을 기다리는 동안 시작한
 * 캔버스 드래그가 끊기지 않고, `applySongMedia`가 transaction의 시작 상태도 새 음원으로 맞춰 드래그를 확정하면 드래그만 Undo 한 단위가 된다.
 */
export function editSongAudio(file: File, duration: number): void {
  const state = useEditorStore.getState();
  const { chart, song } = state;
  if (!song) return;
  const meta = chart.meta;
  const ranges = rangesForNewAudio(duration,
    { ...song.pendingPreviewRange, startTime: meta.previewStart, endTime: meta.previewEnd }, song.gameplayRange);
  state.applySongMedia({ audioFile: file.name, previewStart: ranges.preview.startTime, previewEnd: ranges.preview.endTime },
    { duration, pendingAudioFile: file, pendingPreviewRange: ranges.preview, gameplayRange: ranges.gameplay });
  notifyResetRanges(ranges);
}

export interface DiscardSongInfoResult {
  /** 곡 정보를 마지막 저장 상태로 되돌렸는가. 재생 중 타이밍 복원·구조 위반·곡 행 없음이면 false다. */
  discarded: boolean;
}

/**
 * 곡 소유 값만 마지막 곡 저장 상태로 되돌린다(RFD 0098). 노트·차트별 이벤트·난이도·보조 레인 수는 그대로 둔다.
 *
 * - 제목·아티스트·오프셋·BPM·박자표의 되돌림은 앞뒤 편집과 합치지 않는 Undo 한 단위다. Undo하면 이 값만 취소 직전으로 돌아오고
 *   드로어를 다시 연다. 이 값이 이미 기준과 같으면 이력을 남기지 않는다.
 * - 음원·자켓·프리뷰 구간·인게임 구간과 대기 파일은 이력 없이 기준으로 돌린다. 변경 취소의 Undo도 이 값을 되살리지 않는다(사용자 확인,
 *   2026-11-08). 저장된 음원으로 재생기를 되돌리는 일은 드로어 음원(drawerSongAudio)이 맡는다.
 * - 재생 중 오프셋·BPM·박자표를 되돌려야 하면 아무것도 바꾸지 않고 정지 안내를 띄운다(RFD 0099). 구조 위반으로 되돌림이 거부되면
 *   이력 밖 값도 그대로 둔다.
 */
export function discardSongInfoChanges(): DiscardSongInfoResult {
  const state = useEditorStore.getState();
  const song = state.song;
  if (!song) return { discarded: false };
  const target = restoreSavedSongInfo(state.chart, song, savedChartEvents(state.savedChartJson));
  if (state.isPlaying && isPlaybackLockedChange(state.chart, target.chart)) {
    state.addToast(PAUSE_TO_EDIT_COPY, 'warn');
    return { discarded: false };
  }
  const mediaChanged = SONG_MEDIA_META_KEYS.some(key => target.mediaMeta[key] !== state.chart.meta[key])
    || !sameSongMediaState(song, target.mediaState);
  if (target.chart === state.chart && !mediaChanged) return { discarded: true };
  state.commitEditTransaction();
  if (target.chart !== state.chart) {
    const before = useEditorStore.getState();
    before.setChart(target.chart, { isolated: true, reopensSongInfo: true });
    if (useEditorStore.getState().chart !== target.chart) return { discarded: false };
    if (target.chart.events !== before.chart.events) keepEventSelection(before.selection, before.chart.events, target.chart.events);
  }
  if (mediaChanged) useEditorStore.getState().applySongMedia(target.mediaMeta, target.mediaState);
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

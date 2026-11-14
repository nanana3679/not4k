/**
 * 미저장 곡 정보·차트가 있을 때 드로어 닫기·같은 곡의 다른 차트로 전환·에디터 이탈을 확인하는 흐름(RFD 0098).
 *
 * - 드로어 닫기: 미저장 곡 정보가 있으면 저장하거나 변경을 취소해야 닫는다. 저장은 Save 하나(곡 → 차트)를 실행하고
 *   곡 정보가 저장된 뒤에만 닫는다. 미저장 곡 정보를 남긴 채 닫는 선택은 없다.
 * - 다른 차트로 전환: 미저장 곡 정보를 먼저 저장하거나 변경 취소한다. 저장은 Save가 남김없이 끝나야 전환한다. 변경 취소는
 *   차트 편집을 버리지 않으므로, 차트 변경이 남으면 이어서 이탈과 같은 저장 후 이동·버리고 이동·취소를 묻는다
 *   (전환은 이 차트를 떠나는 이동이라 남은 차트 편집이 사라지기 때문이다).
 * - 에디터 이탈·다른 곡 이동: 곡 정보나 차트에 미저장 변경이 있으면 저장 후 이동·버리고 이동·취소를 묻는다. 저장 후 이동은
 *   Save가 필요한 저장을 모두 끝낸 뒤에만 이동한다.
 *
 * 저장 성공 여부는 Save가 끝난 뒤 남은 미저장 변경으로 판단한다. 확인 창 취소·검증 오류·저장 중·이행 확인 취소처럼 Save가
 * 일부만 저장하거나 저장하지 못한 경우를 같은 방식으로 다룬다.
 *
 * 다른 Save·Save As가 진행 중이면(곡 저장과 차트 저장 사이 포함) 닫기·전환·이탈·변경 취소를 시작하지 않고 안내만 한다.
 * 진행 중인 저장이 끝나면 마지막 저장 값이 바뀌므로, 그 전에 되돌리거나 떠나면 저장된 값과 화면이 어긋난다. 확인 창에 답한 뒤에도
 * 한 번 더 확인한다. 드로어 입력칸은 포커스 이동·Enter로 적용하므로, 흐름을 시작할 때와 흐름의 Save가 끝난 뒤 포커스를 가진
 * 입력칸의 값을 먼저 적용해 미저장 판단에 넣는다(저장 중에 친 값이 닫기·이동으로 사라지지 않게).
 */
import { isChartDirty } from './savedChart';
import { isSongDirty } from './songState';
import type { useEditorStore } from './stores/editorStore';

type EditorStoreState = ReturnType<typeof useEditorStore.getState>;

/** 곡 정보 확인 창의 선택. discard는 곡 정보 변경 취소다. */
export type SongInfoDecision = 'save' | 'discard' | 'cancel';
/** 이탈 확인 창의 선택: 저장 후 이동·버리고 이동·취소. */
export type LeaveDecision = 'save' | 'discard' | 'cancel';

export interface UnsavedChangesFlow {
  /** Save·Save As가 진행 중인가(store의 `isSavingSong`·`isSavingChart`). */
  saving: () => boolean;
  /** 저장이 진행 중이라 막았음을 알린다. */
  notifySaving: () => void;
  /** 포커스를 가진 입력칸에 아직 적용하지 않은 값을 적용한다. */
  commitDrafts: () => void;
  songInfoDirty: () => boolean;
  /** 곡 정보 또는 차트에 미저장 변경이 있는가. */
  anyDirty: () => boolean;
  askSongInfo: (purpose: 'close' | 'switch') => Promise<SongInfoDecision>;
  askLeave: (purpose: 'leave' | 'switch') => Promise<LeaveDecision>;
  /** 툴바의 Save와 같은 저장(곡 → 차트, 같은 확인 창). */
  save: () => Promise<void>;
  /** 곡 정보 변경 취소. 막혔으면(재생 중 타이밍 되돌리기 등) false다. */
  discardSongInfo: () => boolean;
}

/**
 * 곡 정보에 미저장 변경이 있는가. 곡 행이 없는 차트는 곡 정보가 없어 항상 false다.
 * 드로어에서 고른 음원을 아직 불러오는 중이면(`isLoadingSongAudio`) 그 음원도 미저장 곡 정보다. 불러오면 곡 음원으로 적용되므로
 * 그 전에 드로어를 닫거나 떠나면 늦게 끝난 로드가 닫힌 뒤에 곡 정보를 바꾼다.
 */
export function hasUnsavedSongInfo(state: Pick<EditorStoreState, 'chart' | 'song' | 'isLoadingSongAudio'>): boolean {
  return state.isLoadingSongAudio || isSongDirty(state.chart, state.song);
}

/**
 * 에디터에 미저장 변경이 있는가. Save의 미저장 표시와 이탈·차트 전환 확인이 함께 쓰는 하나의 판단이다: 차트·곡 정보 변경과
 * 불러오는 중인 드로어 음원, 곡 행이 없는 차트의 대기 프리뷰·인게임 구간.
 */
export function hasUnsavedEditorChanges(
  state: Pick<EditorStoreState, 'chart' | 'song' | 'extraLaneCount' | 'lastSavedChartJson' | 'songlessMedia' | 'isLoadingSongAudio'>,
): boolean {
  return hasUnsavedSongInfo(state)
    || isChartDirty(state.chart, state.extraLaneCount, state.lastSavedChartJson, state.song !== null)
    || (!state.song && (state.songlessMedia.previewRange !== null || state.songlessMedia.gameplayRange !== null));
}

/** 다른 저장이 진행 중이면 안내하고 true다. */
function blockedBySave(flow: UnsavedChangesFlow): boolean {
  if (!flow.saving()) return false;
  flow.notifySaving();
  return true;
}

/** 흐름의 Save를 실행하고, 저장 중에 친 입력칸 값을 적용해 남은 미저장 판단에 넣는다. */
async function saveAndCommitDrafts(flow: UnsavedChangesFlow): Promise<void> {
  await flow.save();
  flow.commitDrafts();
}

/** 드로어를 닫아도 되면 true. */
export async function confirmCloseSongInfo(flow: UnsavedChangesFlow): Promise<boolean> {
  flow.commitDrafts();
  if (blockedBySave(flow)) return false;
  if (!flow.songInfoDirty()) return true;
  const decision = await flow.askSongInfo('close');
  if (decision === 'cancel' || blockedBySave(flow)) return false;
  if (decision === 'discard') return flow.discardSongInfo();
  await saveAndCommitDrafts(flow);
  return !flow.songInfoDirty();
}

/** 에디터를 떠나거나(다른 곡 이동 포함) 다른 차트로 옮겨도 되면 true. */
export async function confirmLeave(flow: UnsavedChangesFlow, purpose: 'leave' | 'switch' = 'leave'): Promise<boolean> {
  flow.commitDrafts();
  if (blockedBySave(flow)) return false;
  if (!flow.anyDirty()) return true;
  const decision = await flow.askLeave(purpose);
  if (decision === 'cancel' || blockedBySave(flow)) return false;
  if (decision === 'discard') return true;
  await saveAndCommitDrafts(flow);
  return !flow.anyDirty();
}

/** 같은 곡의 다른 차트로 전환해도 되면 true. */
export async function confirmChartSwitch(flow: UnsavedChangesFlow): Promise<boolean> {
  flow.commitDrafts();
  if (blockedBySave(flow)) return false;
  if (flow.songInfoDirty()) {
    const decision = await flow.askSongInfo('switch');
    if (decision === 'cancel' || blockedBySave(flow)) return false;
    if (decision === 'save') {
      await saveAndCommitDrafts(flow);
      return !flow.anyDirty();
    }
    if (!flow.discardSongInfo()) return false;
  }
  return confirmLeave(flow, 'switch');
}

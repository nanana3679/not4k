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

/** 곡 정보에 미저장 변경이 있는가. 곡 행이 없는 차트는 곡 정보가 없어 항상 false다. */
export function hasUnsavedSongInfo(state: Pick<EditorStoreState, 'chart' | 'song'>): boolean {
  return isSongDirty(state.chart, state.song);
}

/** Save의 미저장 표시와 같은 판단. 곡 행이 없는 차트는 대기 프리뷰·인게임 구간도 미저장이다. */
export function hasUnsavedEditorChanges(
  state: Pick<EditorStoreState, 'chart' | 'song' | 'extraLaneCount' | 'savedChartJson' | 'songlessMedia'>,
): boolean {
  return isChartDirty(state.chart, state.extraLaneCount, state.savedChartJson, state.song !== null)
    || isSongDirty(state.chart, state.song)
    || (!state.song && (state.songlessMedia.previewRange !== null || state.songlessMedia.gameplayRange !== null));
}

/** 드로어를 닫아도 되면 true. */
export async function confirmCloseSongInfo(flow: UnsavedChangesFlow): Promise<boolean> {
  if (!flow.songInfoDirty()) return true;
  const decision = await flow.askSongInfo('close');
  if (decision === 'cancel') return false;
  if (decision === 'discard') return flow.discardSongInfo();
  await flow.save();
  return !flow.songInfoDirty();
}

/** 에디터를 떠나거나(다른 곡 이동 포함) 다른 차트로 옮겨도 되면 true. */
export async function confirmLeave(flow: UnsavedChangesFlow, purpose: 'leave' | 'switch' = 'leave'): Promise<boolean> {
  if (!flow.anyDirty()) return true;
  const decision = await flow.askLeave(purpose);
  if (decision === 'cancel') return false;
  if (decision === 'discard') return true;
  await flow.save();
  return !flow.anyDirty();
}

/** 같은 곡의 다른 차트로 전환해도 되면 true. */
export async function confirmChartSwitch(flow: UnsavedChangesFlow): Promise<boolean> {
  if (flow.songInfoDirty()) {
    const decision = await flow.askSongInfo('switch');
    if (decision === 'cancel') return false;
    if (decision === 'save') {
      await flow.save();
      return !flow.anyDirty();
    }
    if (!flow.discardSongInfo()) return false;
  }
  return confirmLeave(flow, 'switch');
}

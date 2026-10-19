/**
 * createSelectDragControl — store 액션이 진행 중 select 드래그를 끝낼 때 쓰는 `selectDragControl`을 만든다.
 *
 * 드래그 상태는 SelectMode가, 드래그 프리뷰(원위치 고스트·박스 사각형)는 렌더러가, 터치 후보·롱프레스
 * 타이머는 캔버스 훅이 갖는다. 모드 전환·undo/redo·차트 교체·Esc는 store 액션으로 모이므로 캔버스 훅이
 * selectDragControl을 store에 등록해 그 액션들이 드래그를 먼저 끝내게 한다. 끝낼 때 프리뷰를 걷지 않으면
 * 다음 전체 렌더가 원위치 고스트를 다시 그리고, 터치 후보를 남기면 그 손가락의 다음 move·up이 편집을
 * 다시 시작한다.
 */

import type { Beat } from "../../shared";
import type { TimelineRenderer } from "../timeline/TimelineRenderer";
import type { SelectDragControl } from "../stores/editorStore";
import type { EditResult } from "./editorMode";
import type { SelectMode } from "./SelectMode";

type DragPreviewRenderer = Pick<TimelineRenderer, "clearMoveOrigins" | "clearBoxSelectRect">;

export function createSelectDragControl(
  getSelectMode: () =>
    | Pick<SelectMode, "cancel" | "discardDrag" | "endDragBeforeDelete" | "confirmPlacement" | "paste">
    | null,
  getRenderer: () => DragPreviewRenderer | null,
  // 드래그를 끝냈을 때 캔버스 훅이 남은 포인터 편집 후보를 버린다(handleEditCancel과 같은 정리).
  onDragEnded?: () => void,
): SelectDragControl {
  // 드래그를 끝낸 결과를 렌더러와 훅에 반영한다 — 끝낸 드래그가 있었으면 true.
  const applyDragEnd = (result: EditResult | undefined): boolean => {
    if (!result?.clearDragPreview) return false;
    const renderer = getRenderer();
    renderer?.clearMoveOrigins();
    renderer?.clearBoxSelectRect();
    onDragEnded?.();
    return true;
  };

  return {
    cancelDrag: () => applyDragEnd(getSelectMode()?.cancel()),
    discardDrag: () => {
      applyDragEnd(getSelectMode()?.discardDrag());
    },
    endDragBeforeDelete: () => {
      const result = getSelectMode()?.endDragBeforeDelete();
      applyDragEnd(result);
      return { canDelete: result?.canDelete ?? true };
    },
    // Enter로 끝낸 드래그도 취소와 같은 정리를 거친다 — 터치 후보가 남으면 그 손가락의 다음 move가 끝낸 드래그를
    // 다시 시작한다.
    confirmPlacement: () => applyDragEnd(getSelectMode()?.confirmPlacement()),
    cancelDragAndPaste: (targetBeat: Beat) => {
      applyDragEnd(getSelectMode()?.cancel());
      return getSelectMode()?.paste(targetBeat) ?? 0;
    },
  };
}

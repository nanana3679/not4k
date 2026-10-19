/**
 * selectDragControl — store가 진행 중 select 드래그를 끝내는 통로(`SelectDragControl`)를 만든다.
 *
 * 드래그 상태는 SelectMode가, 드래그 프리뷰(원위치 고스트·박스 사각형)는 렌더러가 갖는다.
 * 모드 전환·undo/redo·차트 교체·Esc는 store 액션으로 모이므로 App이 이 통로를 store에 등록해
 * 그 액션들이 드래그를 먼저 끝내게 한다. 끝낼 때 프리뷰를 걷지 않으면 다음 전체 렌더가 원위치
 * 고스트를 다시 그린다.
 */

import type { TimelineRenderer } from "../timeline/TimelineRenderer";
import type { SelectDragControl } from "../stores/editorStore";
import type { EditResult } from "./editorMode";
import type { SelectMode } from "./SelectMode";

type DragPreviewRenderer = Pick<TimelineRenderer, "clearMoveOrigins" | "clearBoxSelectRect">;

export function createSelectDragControl(
  selectMode: Pick<SelectMode, "cancel" | "discardDrag">,
  getRenderer: () => DragPreviewRenderer | null,
): SelectDragControl {
  // 드래그를 끝낸 결과를 렌더러에 반영한다 — 끝낸 드래그가 있었으면 true.
  const applyDragEnd = (result: EditResult): boolean => {
    if (!result.clearDragPreview) return false;
    const renderer = getRenderer();
    renderer?.clearMoveOrigins();
    renderer?.clearBoxSelectRect();
    return true;
  };

  return {
    cancel: () => applyDragEnd(selectMode.cancel()),
    discard: () => {
      applyDragEnd(selectMode.discardDrag());
    },
  };
}

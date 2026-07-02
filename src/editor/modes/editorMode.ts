import type { EntityType } from "./CreateMode";
import type { EditorModeName } from "../stores/editorStore";

/**
 * 포인터 입력 한 건을 편집 모드에 전달하기 위한 정규화된 제스처.
 * 모드마다 다른 수식자(shift/alt/toggle)를 한 형태로 운반해,
 * 하드코딩된 `if (mode === ...)` 디스패치 없이 다형 처리할 수 있게 한다.
 */
export interface PointerGesture {
  x: number;
  y: number;
  shiftKey: boolean;
  altKey: boolean;
  toggleSelection: boolean;
}

/**
 * 세 편집 모드(Create/Select/Delete)가 공유하는 입력 처리 계약.
 * 슬라이스 2-2a에서는 휠 입력만 다형화한다. 포인터 생명주기(down/move/up)는
 * 프리뷰·배치 가드를 모드로 흡수하는 후속 슬라이스에서 추가한다.
 */
export interface EditorMode {
  /**
   * 휠 입력을 처리하고, 처리했으면 그 결과로 선택돼야 할 엔티티 타입을 반환한다.
   * 처리하지 않으면 null. 현재 Create 모드만 실제로 처리하고 Select/Delete는 항상 null이다.
   */
  onWheel(deltaY: number, cKeyHeld: boolean): EntityType | null;
}

/**
 * 편집 모드 이름과 세 모드 인스턴스로부터 현재 활성 모드 객체를 고른다.
 * `if (mode === 'create') ... else if ...` 디스패치를 대체하는 단일 결정 지점.
 * 아직 초기화되지 않은 모드 인스턴스는 null일 수 있으므로 그대로 전달한다.
 */
export function activeEditorMode(
  mode: EditorModeName,
  createMode: EditorMode | null,
  selectMode: EditorMode | null,
  deleteMode: EditorMode | null,
): EditorMode | null {
  switch (mode) {
    case "create":
      return createMode;
    case "select":
      return selectMode;
    case "delete":
      return deleteMode;
    default:
      return null;
  }
}

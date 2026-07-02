import type { EntityType } from "./CreateMode";
import type { EditorModeName } from "../stores/editorStore";
import type { NoteEntity, Beat, Lane } from "../../shared";

/** 이동 드래그 중 한 노트의 원본 위치(고스트로 그려짐). */
export interface MoveOriginDatum {
  note: NoteEntity;
  beat: Beat;
  endBeat?: Beat;
  lane: Lane;
}

/** 박스 셀렉트 사각형(픽셀/레인 좌표). */
export interface BoxSelectRect {
  startY: number;
  startLane: Lane | null;
  endY: number;
  endLane: Lane | null;
  startExtraLane?: number;
  endExtraLane?: number;
}

/**
 * 입력 처리 결과로 렌더러가 PUSH로 반영할 프리뷰.
 * 훅이 모드 내부 getter를 매 move마다 PULL하던 것을 대체한다.
 */
export interface EditPreview {
  /** 박스 셀렉트 사각형. 있으면 렌더러 setBoxSelectRect + render. */
  boxSelectRect?: BoxSelectRect;
  /** 이동 드래그 원본 위치들. 있으면 렌더러 setMoveOrigins. */
  moveOrigins?: MoveOriginDatum[];
}

/**
 * 편집 모드가 입력을 처리한 결과. 렌더러가 PUSH로 반영한다.
 * (후속 슬라이스에서 chart/hover/cursor 등이 추가될 수 있다.)
 */
export interface EditResult {
  preview?: EditPreview;
  /** 드래그 프리뷰(이동 원본 + 박스 사각형)를 지운다(드래그 커밋/취소 후 정리). */
  clearDragPreview?: boolean;
  /** 고스트 노트를 숨긴다(예: create 취소). */
  hideGhost?: boolean;
}

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
   * 포인터 down 한 건을 이 모드의 의미로 처리한다.
   * 모드마다 다른 배치 제약·수식자 해석은 각 모드가 gesture로부터 스스로 처리한다.
   */
  handlePointerDown(gesture: PointerGesture): void;

  /**
   * 포인터 up 한 건을 이 모드의 의미로 처리(드래그 커밋/취소)하고,
   * 렌더러가 반영할 결과(프리뷰 정리·고스트 숨김 등)를 반환한다.
   */
  handlePointerUp(gesture: PointerGesture): EditResult;

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

import type { NoteEntity, Lane } from "../../shared";
import { hitTestRangeNoteRegion, SNAP_POSITION_TOLERANCE } from "../timeline/hitTest";

/**
 * Create 모드 배치 제약을 판정하기 위해 필요한, 좌표에서 미리 해소한 입력들.
 * hitTest/좌표 변환 같은 부수효과는 훅이 수행하고, 이 결과만 넘겨 순수 판정한다.
 */
export interface CreatePlacementQuery {
  /** 배치 위치가 편집 가능한 시간 범위 안인가 (isTimeInBounds). */
  inBounds: boolean;
  /** 배치 좌표에서 히트된 노트, 없으면 null (hitTestNote 결과의 노트). */
  hitNote: NoteEntity | null;
  /** 배치 좌표의 노트 레인, 노트 레인 밖이면 null (xToLane). */
  lane: Lane | null;
  /** 스냅 전 raw 박 위치 (yToBeatRaw). 롱노트 head/end 캡 판정에 쓴다. */
  beatFloatRaw: number;
  /** 현재 차트의 노트들 (head/end 캡에 이미 점노트가 있는지 검사). */
  notes: readonly NoteEntity[];
  /** 배치 좌표에서 히트된 엑스트라 노트 인덱스, 없으면 null (hitTestExtraNote). */
  extraHit: number | null;
}

/**
 * Create 모드에서 이 좌표에 배치를 막아야 하는지 판정하는 순수 배치 제약.
 * true면 배치 차단(무시), false면 배치 진행.
 *
 * 규칙:
 * - 시간 범위 밖이면 차단.
 * - 점노트를 히트하면 차단(그 위에 겹쳐 못 놓음).
 * - 롱노트를 히트하면: 범위 밖(null)/body면 차단. head/end 캡 위여도 그 캡에
 *   이미 점노트가 있으면 차단(중복 방지). 캡이 비어 있으면 허용(캡 점 배치).
 * - 엑스트라 노트를 히트하면 차단.
 */
export function isCreatePlacementBlocked(q: CreatePlacementQuery): boolean {
  const { inBounds, hitNote, lane, beatFloatRaw, notes, extraHit } = q;

  if (!inBounds) return true;

  if (hitNote !== null) {
    if ("endBeat" in hitNote) {
      if (lane === null) return true;
      const region = hitTestRangeNoteRegion(hitNote, beatFloatRaw);
      if (region === null || region === "body") return true;
      const targetBeat =
        region === "head"
          ? hitNote.beat.n / hitNote.beat.d
          : hitNote.endBeat.n / hitNote.endBeat.d;
      const pointExists = notes.some(
        (n) =>
          !("endBeat" in n) &&
          n.lane === lane &&
          Math.abs(n.beat.n / n.beat.d - targetBeat) <= SNAP_POSITION_TOLERANCE,
      );
      if (pointExists) return true;
    } else {
      return true;
    }
  }

  if (extraHit !== null) return true;

  return false;
}

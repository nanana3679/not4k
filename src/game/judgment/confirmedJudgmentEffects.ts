import type { NoteEntity } from "../../shared";
import type { Lane, JudgmentGrade } from "../../shared/constants";
import type { NoteJudgmentEvent } from "./NoteJudgmentCore";

export type ConfirmedScoreAction =
  | { type: "settleItem"; itemId: string; grade: JudgmentGrade; deltaMs?: number }
  | { type: "dependentZero"; itemId: string }
  | { type: "unscoredMiss" };

export interface ConfirmedJudgmentDisplay {
  judgment: { grade: JudgmentGrade; deltaMs?: number } | null;
  altitude: { grade: JudgmentGrade } | null;
  bombLane: Lane | null;
}

export interface ConfirmedJudgmentEffects {
  noteIndex: number;
  unitIndex?: number;
  scoreAction: ConfirmedScoreAction;
  display: ConfirmedJudgmentDisplay;
  /** body 상태는 별도 query가 소유하므로 성공 event에서 whole-body processed를 결정하지 않는다. */
  body: "unchanged" | "failed";
}

/**
 * 확정된 NoteJudgmentEvent 하나를 점수 정산과 화면 효과의 단일 결정으로 변환한다.
 * 이 함수는 ScoreManager·renderer를 호출하지 않고, 적용자가 소비할 데이터만 반환한다.
 */
export function decideConfirmedJudgmentEffects(
  event: NoteJudgmentEvent,
  note: NoteEntity,
): ConfirmedJudgmentEffects {
  const isMaintenanceMiss = event.kind === "maintenanceMiss";
  const isDependentZero = event.kind === "dependentZero";
  const isHoldOnly = event.kind === "holdOnly";
  const isGrace = !('endBeat' in note) && note.grace === true;
  const isMiss = event.grade === "miss";

  let scoreAction: ConfirmedScoreAction;
  if (isMaintenanceMiss) scoreAction = { type: "unscoredMiss" };
  else if (isDependentZero) {
    if (!event.itemId) throw new Error("dependentZero event requires itemId");
    scoreAction = { type: "dependentZero", itemId: event.itemId };
  } else {
    if (!event.itemId) throw new Error(`${event.kind} event requires itemId`);
    scoreAction = {
      type: "settleItem",
      itemId: event.itemId,
      grade: event.grade,
      ...(event.kind === "release" || (!isHoldOnly && !isGrace) ? { deltaMs: event.deltaMs } : {}),
    };
  }

  const showJudgment = !isDependentZero;
  const showTiming = !isMaintenanceMiss && !isHoldOnly && !isGrace && !isDependentZero;
  return {
    noteIndex: event.noteIndex,
    unitIndex: event.unitIndex,
    scoreAction,
    display: {
      judgment: showJudgment ? { grade: event.grade, ...(showTiming ? { deltaMs: event.deltaMs } : {}) } : null,
      altitude: isDependentZero ? null : { grade: event.grade },
      // Chart notes expose a numeric lane; gameplay effects only target main lanes.
      // Keep the same boundary cast used by the legacy judgment effects adapter.
      bombLane: isDependentZero || isMiss ? null : (note.lane as Lane),
    },
    body: isMaintenanceMiss ? "failed" : "unchanged",
  };
}

/** 짧은 이름이 필요한 적용자용 별칭. */
export const confirmedJudgmentEffects = decideConfirmedJudgmentEffects;

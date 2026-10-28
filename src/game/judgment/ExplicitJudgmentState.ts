import type { JudgmentGrade } from "../../shared/constants/judgment";
import type { ExplicitBodyUnitRef, ExplicitScoreItem } from "./explicitCompiledChart";

/** 기존 JudgmentCore와 별개인 명시 항목 런타임 계약. lane 누락은 batch 전체를 거부한다. */
export interface ExplicitJudgmentInput {
  readonly key: string;
  readonly lane?: number;
  readonly type: "down" | "up" | "press" | "release";
}

/** 준비 구간이 끝난 순간의 실제 hold. 점수 입력이나 새 down을 뜻하지 않는다. */
export interface ExplicitHeldKey {
  readonly key: string;
  readonly lane: number;
}

export type ExplicitGrade = Extract<JudgmentGrade, "perfect" | "great" | "good" | "goodTrill" | "miss">;
export type ExplicitConfirmationPhase = "input" | "timeline" | "deadline";

interface FactBase {
  readonly id: string;
  /** 입력 또는 기한의 원래 시각. 늦게 관측해도 확정 시각으로 대체하지 않는다. */
  readonly atMs: number;
  readonly confirmedAt: number;
  readonly phase: ExplicitConfirmationPhase;
  readonly lane: number;
}

/**
 * 한 세션 안의 append-only 불변 관측 기록. settlement/bodyFailed는 최종 확정이며 번복하지 않는다.
 * 되감기는 기존 관측을 수정하지 않고 보존할 연산 이력으로 새 세션을 구성한다.
 * provisional 바디 진행은 늦은 입력으로 무효가 될 수 있고, 그때 기존 기록을 고치지 않고
 * bodyProgressInvalidated가 대상 fact id를 명시한다. 현재 바디 상태의 권위는 snapshot이다.
 */
export type ExplicitConfirmedFact = FactBase & (
  | { readonly kind: "input"; readonly inputId: string; readonly key: string;
      readonly action: "down" | "up"; readonly observedAt: number; readonly heldAtMs: number;
      readonly accepted: boolean; readonly consumedItemId: string | null }
  | { readonly kind: "bodyStarted"; readonly bodyUnitId: string; readonly actualStartMs: number;
      readonly via: "preheld" | "down"; readonly inputId: string | null; readonly provisional: boolean }
  | { readonly kind: "bodyCompleted"; readonly bodyUnitId: string;
      readonly reason: "end" | "earlyUp" | "lateStart"; readonly inputId: string | null; readonly provisional: boolean }
  | { readonly kind: "bodyProgressInvalidated"; readonly bodyUnitId: string;
      readonly invalidatedFactIds: readonly string[] }
  | { readonly kind: "bodyFailed"; readonly bodyUnitId: string;
      readonly reason: "startTimeout" | "maintenance" | "pointMiss";
      readonly causeFactId: string | null; readonly unscoredMiss: boolean }
  | { readonly kind: "settlement"; readonly itemId: string; readonly itemKind: ExplicitScoreItem["kind"];
      readonly outcome: "graded" | "dependentZero"; readonly grade: ExplicitGrade | null;
      readonly inputId: string | null; readonly rawDeltaMs: number | null;
      readonly timingDeltaMs: number | null; readonly causeFactId: string | null }
);

/** 한 프레임 drain에 함께 관측된 raw 묶음. 각 key의 down/up 순서는 입력 배열대로 보존한다. */
export interface ExplicitObservedInputBatch {
  readonly rawAtMs: number;
  readonly inputs: readonly ExplicitJudgmentInput[];
}

export interface ExplicitBodyUnitSnapshot {
  readonly id: string;
  readonly ref: ExplicitBodyUnitRef;
  readonly lane: number;
  readonly state: "waiting" | "active" | "recovering" | "complete" | "failed";
  readonly actualStartMs: number | null;
  readonly completedAtMs: number | null;
  readonly failedAtMs: number | null;
  readonly failureFactId: string | null;
  readonly maintenanceSinceMs: number | null;
  readonly maintenanceDeadlineMs: number | null;
  readonly pointStatus: "none" | "waiting" | "satisfied" | "missed";
}

export interface ExplicitItemSnapshot {
  readonly id: string;
  readonly kind: ExplicitScoreItem["kind"];
  readonly sourceNoteIndex: number;
  readonly ordinal: number;
  readonly state: "pending" | "waiting" | "success" | "miss" | "dependentZero";
  readonly waitingReason: "bodyStart" | "bodyRecovery" | null;
  readonly grade: ExplicitGrade | null;
  readonly settlementFactId: string | null;
}

export interface ExplicitJudgmentSnapshot {
  readonly atMs: number;
  readonly bodyUnits: readonly ExplicitBodyUnitSnapshot[];
  readonly items: readonly ExplicitItemSnapshot[];
}

/** 원본 차트 ref로 동률을 선택하므로 input/fact 수신 순서에 의존하지 않는다. */
export interface ExplicitDisplaySource {
  readonly noteIndex: number;
  readonly ordinal: number;
}

/** 글자의 현재 상태다. 같은 groupId의 개정은 새 성공·타격이나 fade 재시작이 아니다. */
export interface ExplicitJudgmentDisplayState {
  readonly groupId: string;
  readonly confirmedAt: number;
  readonly grade: ExplicitGrade;
  readonly timingDeltaMs: number | null;
  readonly source: ExplicitDisplaySource;
}

/** 항목별 일회성 효과와 대표 글자의 상태 개정을 같은 소비 커서로 전달한다. */
export interface ExplicitJudgmentEffect {
  readonly sequence: number;
  readonly factId: string;
  readonly confirmedAt: number;
  readonly phase: ExplicitConfirmationPhase;
  readonly lane: number;
  readonly itemId: string | null;
  readonly scoreAction: "settleItem" | "dependentZero" | "unscoredMiss";
  readonly grade: ExplicitGrade | null;
  readonly timingDeltaMs: number | null;
  readonly comboAction: "increment" | "break" | "none";
  readonly altitudeAction: "success" | "failure" | "none";
  readonly displayGrade: ExplicitGrade | null;
  readonly hitGrade: Exclude<ExplicitGrade, "miss"> | null;
  readonly displayUpdate: ExplicitJudgmentDisplayState | null;
}

import type { JudgmentWindows } from "../../shared/constants";

/**
 * 판정 코어가 공유하는 입력·이벤트 타입과 세션이 쓰는 코어 경계.
 *
 * 지금 구현은 등록 키 코어(`NoteJudgmentCore`, RFD 0020) 하나다. 세션과 판정 테스트 harness는 구현 클래스 대신 이 경계에
 * 기대므로, 다른 코어도 같은 이벤트 모양과 batch 규칙을 지키면 같은 경로로 돌릴 수 있다.
 */

export type JudgmentEventKind = "head" | "release" | "holdOnly" | "maintenanceMiss" | "dependentZero";
export type JudgmentGrade = "perfect" | "great" | "good" | "goodTrill" | "miss";

export interface NoteJudgmentEvent {
  kind: JudgmentEventKind;
  noteIndex: number;
  unitIndex?: number;
  itemId?: string;
  grade: JudgmentGrade;
  deltaMs: number;
  inputAt: number | null;
  confirmedAt: number;
  /** Physical key belonging to the down/up which consumed this event. */
  key?: string;
  /** True for an actual keyup release; holdOnly and maintenance are false. */
  consumed: boolean;
  /** Explicitly distinguishes a connection from a scored judgment. */
  bodyState?: "active" | "inherited" | "failed" | "complete";
  phase?: "input" | "deadline";
}

/** 판정 코어를 만들 때 넘기는 판정 창과 확정 콜백. */
export interface JudgmentCoreOptions {
  windows?: JudgmentWindows;
  onConfirmed?: (event: NoteJudgmentEvent) => void;
  onBatchConfirmed?: (events: readonly NoteJudgmentEvent[], at: number) => void;
}

export interface JudgmentInput { key: string; lane?: number; type: "press" | "release" | "down" | "up" }

/** 렌더러가 켜짐·실패 표시에 쓰는 unit(몫) 하나의 상태. */
export interface JudgmentBodyState {
  readonly noteIndex: number;
  readonly unitIndex: number;
  /** 시작했는가. 시작한 뒤 끝나도 true로 남는다. */
  readonly active: boolean;
  readonly failed: boolean;
  readonly complete: boolean;
  /** 켜짐 표시에 쓰는 유지 키. `NoteJudgmentCore`에서는 이 unit에 등록한 키다. */
  readonly registeredKeys: readonly string[];
}

/** `NoteJudgmentSession`과 판정 테스트 harness가 쓰는 코어의 최소 경계. */
export interface JudgmentCore {
  /** 같은 timestamp의 입력 묶음. `at` 전의 기한을 먼저 확정하고 입력을 반영한다. */
  processBatch(at: number, inputs: readonly JudgmentInput[]): void;
  /** raw 시각 `rawAt`의 입력을 `observedAt`에 관측했다. 판정은 raw 시각으로, 확정은 관측 시각으로 한다. */
  processObservedBatch(rawAt: number, inputs: readonly JudgmentInput[], observedAt: number): void;
  /** 입력 없이 기한만 진행한다. */
  advance(at: number): void;
  readonly time: number;
  readonly confirmed: readonly NoteJudgmentEvent[];
  readonly combo: number;
  readonly bodyStates: readonly JudgmentBodyState[];
}

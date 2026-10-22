import type { JudgmentWindows } from "../../shared/constants";
import type { CompiledJudgmentChart } from "./compiledJudgmentChart";

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

/** 렌더러가 켜짐·실패 표시에, 사례 이미지 도구가 시작·유지 실패 구분에 쓰는 unit(몫) 하나의 상태. */
export interface JudgmentUnitState {
  readonly noteIndex: number;
  readonly unitIndex: number;
  /** 한 번이라도 시작했는가. 실패·완료 뒤에도 true로 남는다. */
  readonly hasStarted: boolean;
  readonly failed: boolean;
  readonly complete: boolean;
  /**
   * 지금 유지되고 있는가. 렌더러는 이 값으로 바디를 켠다(켜짐 표시). 시작했고 실패·완료하지 않았으며 지금 유지 중일 때만 true다.
   * 유지 중인지는 코어가 정한다. `NoteJudgmentCore`는 이 unit에 등록한 키가 있으면 유지 중이다.
   */
  readonly held: boolean;
}

/** `NoteJudgmentSession`과 판정 테스트 harness가 쓰는 코어의 최소 경계. */
export interface JudgmentCore {
  /**
   * 같은 timestamp의 입력 묶음. 규칙은 `at`보다 이른 기한을 먼저 확정한 뒤 입력을 반영하는 것이다. 단, 기존 `NoteJudgmentCore`는
   * 시작 시각이 `-Infinity`라 첫 호출에서는 지난 기한을 입력 뒤에 정산한다. 교체 전까지 두는 알려진 차이다
   * (docs/spec/game-core.md "같은 at 분할과 첫 호출").
   */
  processBatch(at: number, inputs: readonly JudgmentInput[]): void;
  /** raw 시각 `rawAt`의 입력을 `observedAt`에 관측했다. 판정은 raw 시각으로, 확정은 관측 시각으로 한다. */
  processObservedBatch(rawAt: number, inputs: readonly JudgmentInput[], observedAt: number): void;
  /** 입력 없이 기한만 진행한다. */
  advance(at: number): void;
  readonly time: number;
  readonly confirmed: readonly NoteJudgmentEvent[];
  readonly combo: number;
  readonly unitStates: readonly JudgmentUnitState[];
}

/**
 * 컴파일한 차트로 판정 코어를 만든다. `NoteJudgmentSession`(`createCore`)과 판정 테스트 harness가 같은 경로를 다른 코어로
 * 돌릴 때 바꿔 넣는다. 세션과 harness 모두, 생성 함수를 받지 않으면 실제 게임이 쓰는 `NoteJudgmentCore`를 만든다.
 */
export type JudgmentCoreFactory = (chart: CompiledJudgmentChart, options: JudgmentCoreOptions) => JudgmentCore;

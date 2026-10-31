import { JudgmentGrade, JUDGMENT_SCORES } from '../../../shared';
import type { ScoreState } from '../../scoring/ScoreManager';

/**
 * 튜토리얼 실습의 UI 없는 코어: 실습항목 명세, 실습 1회 성공 조건 평가, 시연/직접 입력 토글과 누적 성공 상태.
 * 규칙의 권위는 glossary "튜토리얼"과 RFD 0081이다. 항목 전체 통과 기록의 저장·동기화는 이 모듈 밖에서 하며,
 * 여기서는 현재 실습 세션의 상태만 다룬다(재진입하면 `createTutorialPracticeState`로 새로 시작).
 */

/** 요구 성공 횟수의 기본값. 개발자가 실습항목별로 다른 양의 정수를 정할 수 있다. */
export const DEFAULT_REQUIRED_SUCCESS_COUNT = 3;

/**
 * 실습 1회 성공 조건(목표 달성률과 추가 조건). 화면에는 콤보 아래 한 줄씩 표시한다.
 * 명세에는 목표 달성률이 정확히 1개 있고, 추가 조건은 종류마다 최대 1개다.
 * 새 추가 조건은 kind를 더하고 `getTutorialConditionStatus`의 switch에 평가를 더한다.
 */
export type TutorialSuccessCondition =
  /** 목표 달성률: 패턴의 최종 달성률이 percent 이상 */
  | { readonly kind: 'targetAchievementRate'; readonly percent: number }
  /** `goodTrill` 허용 횟수: 트릴 교대 학습은 count 0으로 교대 실패를 성공에서 뺀다 */
  | { readonly kind: 'maxGoodTrillCount'; readonly count: number };

/** 한 실습항목 안에서 차례로 시연·실습하는 연주 방법. 방법마다 성공 횟수를 따로 센다. */
export interface TutorialPlayingMethod {
  readonly id: string;
}

export interface TutorialPracticeSpec {
  /** 요구 성공 횟수: 연주 방법 하나를 완료하는 누적 성공 횟수 */
  readonly requiredSuccessCount: number;
  /** 표시 순서대로 둔 성공 조건. 목표 달성률 1개와 종류별 최대 1개의 추가 조건 */
  readonly conditions: readonly TutorialSuccessCondition[];
  /** 실습 순서대로 둔 연주 방법. 최소 1개 */
  readonly playingMethods: readonly TutorialPlayingMethod[];
}

export interface TutorialPracticeSpecInput {
  /** 생략하면 `DEFAULT_REQUIRED_SUCCESS_COUNT` */
  readonly requiredSuccessCount?: number;
  readonly conditions: readonly TutorialSuccessCondition[];
  readonly playingMethods: readonly TutorialPlayingMethod[];
}

/** 명세를 검증하고 동결한다. 잘못된 값은 개발자 실수이므로 RangeError로 즉시 알린다. */
export function createTutorialPracticeSpec(input: TutorialPracticeSpecInput): TutorialPracticeSpec {
  const requiredSuccessCount = input.requiredSuccessCount ?? DEFAULT_REQUIRED_SUCCESS_COUNT;
  if (!Number.isInteger(requiredSuccessCount) || requiredSuccessCount < 1) {
    throw new RangeError(`요구 성공 횟수는 양의 정수여야 합니다: ${requiredSuccessCount}`);
  }
  input.conditions.forEach(assertValidCondition);
  const conditionCountByKind = new Map<TutorialSuccessCondition['kind'], number>();
  for (const { kind } of input.conditions) conditionCountByKind.set(kind, (conditionCountByKind.get(kind) ?? 0) + 1);
  const targetRateCount = conditionCountByKind.get('targetAchievementRate') ?? 0;
  if (targetRateCount !== 1) throw new RangeError(`목표 달성률 조건은 정확히 1개여야 합니다: ${targetRateCount}개`);
  for (const [kind, count] of conditionCountByKind) {
    if (count > 1) throw new RangeError(`같은 종류의 추가 조건은 1개만 둘 수 있습니다: ${kind} ${count}개`);
  }
  if (input.playingMethods.length === 0) throw new RangeError('연주 방법이 최소 1개 필요합니다');
  const methodIds = new Set(input.playingMethods.map((method) => method.id));
  if (methodIds.size !== input.playingMethods.length) throw new RangeError('연주 방법 id가 겹칩니다');
  return Object.freeze({
    requiredSuccessCount,
    conditions: Object.freeze(input.conditions.map((condition) => Object.freeze({ ...condition }))),
    playingMethods: Object.freeze(input.playingMethods.map((method) => Object.freeze({ ...method }))),
  });
}

function assertValidCondition(condition: TutorialSuccessCondition): void {
  switch (condition.kind) {
    case 'targetAchievementRate':
      if (!(condition.percent >= 0 && condition.percent <= 100)) {
        throw new RangeError(`목표 달성률은 0～100%여야 합니다: ${condition.percent}`);
      }
      return;
    case 'maxGoodTrillCount':
      if (!Number.isInteger(condition.count) || condition.count < 0) {
        throw new RangeError(`goodTrill 허용 횟수는 0 이상의 정수여야 합니다: ${condition.count}`);
      }
      return;
    default:
      assertNever(condition);
  }
}

/** 조건 한 줄의 표시 상태: 충족(초록 체크)·실패(빨강 X)·중립(흰 글씨) */
export type TutorialConditionStatus = 'neutral' | 'met' | 'failed';

/** ScoreManager는 등급마다 weight3 × 등급 점수 ÷ 3을 더한다. 가중치 1당 Perfect가 더하는 점수다. */
const PERFECT_SCORE_PER_WEIGHT = JUDGMENT_SCORES[JudgmentGrade.PERFECT] / 3;
/** 경계값(정확히 90%)이 1/3 단위 점수의 부동소수 누적 오차로 미달 처리되지 않게 하는 허용치 */
const RATE_COMPARISON_TOLERANCE = 1e-9;

/**
 * 연주 도중 점수와 finalize한 점수 모두에 쓰는 조건 하나의 상태.
 * 남은 점수 항목을 전부 Perfect로 쳐도 만족할 수 없으면 바로 failed다. 패턴의 모든 점수 항목을 정산해
 * (liveDenominatorWeight가 finalDenominatorWeight에 도달) 결과가 정해졌고 조건을 만족하면 met, 그 밖은 neutral이다.
 * `ExplicitJudgmentSession.finalize()`는 모든 항목을 정산해야 끝나므로 finalize한 점수는 항상 met 또는 failed다.
 */
export function getTutorialConditionStatus(
  condition: TutorialSuccessCondition,
  score: Readonly<ScoreState>,
): TutorialConditionStatus {
  const remainingWeight = Math.max(0, score.finalDenominatorWeight - score.liveDenominatorWeight);
  switch (condition.kind) {
    case 'targetAchievementRate': {
      // 최종 달성률의 분모는 패턴 전체 점수 항목의 이론 가중치 합이다. 남은 가중치를 전부 Perfect로 채운 값이 최선이며,
      // 모두 정산했으면 남은 가중치가 0이라 최선이 곧 최종 달성률이다.
      const bestEarnedScore = score.earnedScore + remainingWeight * PERFECT_SCORE_PER_WEIGHT;
      if (!reachesAchievementRate(bestEarnedScore, score.finalDenominatorWeight, condition.percent)) return 'failed';
      break;
    }
    case 'maxGoodTrillCount':
      if (score.goodTrillCount > condition.count) return 'failed';
      break;
    default:
      return assertNever(condition);
  }
  return remainingWeight === 0 ? 'met' : 'neutral';
}

/** earnedScore / denominatorWeight × 100 ≥ percent를 나눗셈 없이 비교한다. 가중치 합 0은 ScoreManager처럼 0%다. */
function reachesAchievementRate(earnedScore: number, denominatorWeight: number, percent: number): boolean {
  if (denominatorWeight <= 0) return percent <= 0;
  return earnedScore * 100 >= percent * denominatorWeight - RATE_COMPARISON_TOLERANCE;
}

/** 패턴 결과가 모든 조건을 met으로 만족하면 1회 성공이다. 정산하지 않은 항목이 남으면 성공이 아니다. 일반 Good은 달성률로만 반영된다. */
export function isTutorialPatternSuccess(
  conditions: readonly TutorialSuccessCondition[],
  score: Readonly<ScoreState>,
): boolean {
  return conditions.every((condition) => getTutorialConditionStatus(condition, score) === 'met');
}

/** `직접 입력 / 시연` 토글의 두 선택지 */
export type TutorialPracticeMode = 'demonstration' | 'directInput';

export interface TutorialPracticeState {
  readonly spec: TutorialPracticeSpec;
  /** 현재 연주 방법의 위치. 앞 방법은 모두 완료한 상태다 */
  readonly playingMethodIndex: number;
  /** 현재 연주 방법의 누적 성공 횟수. 방법을 넘어가면 0부터 다시 센다 */
  readonly successCount: number;
  /** 지금 재생에 적용한 모드 */
  readonly mode: TutorialPracticeMode;
  /** 직접 입력 패턴 재생 중 시연을 골랐을 때, 다음 패턴 시작부터 적용할 시연 */
  readonly pendingMode: 'demonstration' | null;
  /** 재생 중인 패턴의 id. 재생 중이 아니면 null이며, 연주 방법을 완료하면 항상 null이다 */
  readonly playingPatternId: number | null;
  /** 재생 중인 패턴을 처음부터 끝까지 직접 입력으로 연주해 성공 집계 대상인지 */
  readonly currentPatternCountable: boolean;
  /** 마지막으로 받아들인 패턴 결과. 반복이 다음 패턴으로 넘어간 뒤에도 UI가 직전 결과를 보여줄 수 있게 남긴다 */
  readonly lastFinishedPattern: TutorialFinishedPattern | null;
}

/** 끝난 패턴 한 차례의 결과. 시연·집계 제외 패턴도 남긴다 */
export interface TutorialFinishedPattern {
  readonly patternId: number;
  readonly score: Readonly<ScoreState>;
  /** 처음부터 끝까지 직접 입력으로 연주해 성공 집계 대상이었는지 */
  readonly counted: boolean;
  /** 모든 성공 조건을 만족했는지. counted와 함께 참일 때만 성공 횟수가 1 늘었다 */
  readonly succeeded: boolean;
}

/**
 * patternId는 플레이어가 붙이는 패턴 한 차례(반복 1회)의 식별자다(예: 반복 차수).
 * 한 실습 상태 안에서 서로 다른 패턴에 같은 id를 다시 쓰지 않는다.
 */
export type TutorialPracticeEvent =
  /** 플레이어가 토글에서 모드를 고름 */
  | { readonly type: 'modeSelected'; readonly mode: TutorialPracticeMode }
  /** 패턴 한 차례의 재생 시작 */
  | { readonly type: 'patternStarted'; readonly patternId: number }
  /** 패턴 한 차례의 결과 확정. score는 그 패턴의 최종 점수 */
  | { readonly type: 'patternFinished'; readonly patternId: number; readonly score: Readonly<ScoreState> }
  /** `다음` 버튼 */
  | { readonly type: 'nextPressed' };

/** 실습 진입·재진입·재실습의 시작 상태: 첫 연주 방법, 성공 0회, 시연 */
export function createTutorialPracticeState(spec: TutorialPracticeSpec): TutorialPracticeState {
  return {
    spec, playingMethodIndex: 0, successCount: 0, mode: 'demonstration', pendingMode: null,
    playingPatternId: null, currentPatternCountable: false, lastFinishedPattern: null,
  };
}

export function reduceTutorialPractice(state: TutorialPracticeState, event: TutorialPracticeEvent): TutorialPracticeState {
  switch (event.type) {
    case 'modeSelected':
      return selectMode(state, event.mode);
    case 'patternStarted': {
      // 방법을 완료하면 반복을 멈추므로 새 패턴을 재생하지 않는다. 재생 중인 패턴과 같은 id는 중복 통지다.
      if (isTutorialPlayingMethodComplete(state) || event.patternId === state.playingPatternId) return state;
      // 재생 중이던 다른 패턴은 끝 통지를 놓친 것으로 보고 결과 없이 버린다.
      const mode = state.pendingMode ?? state.mode;
      return {
        ...state, mode, pendingMode: null, playingPatternId: event.patternId, currentPatternCountable: mode === 'directInput',
      };
    }
    case 'patternFinished': {
      // 재생 중인 패턴이 아닌 결과(늦게 온 이전 패턴, 시작을 받지 않은 패턴)는 무시한다.
      if (event.patternId !== state.playingPatternId) return state;
      const counted = state.currentPatternCountable;
      const succeeded = isTutorialPatternSuccess(state.spec.conditions, event.score);
      // 재생이 끝났으므로 예약한 시연은 지금 적용해도 다음 패턴 시작부터 적용한 것과 같다.
      return {
        ...state, mode: state.pendingMode ?? state.mode, pendingMode: null, playingPatternId: null,
        currentPatternCountable: false, successCount: counted && succeeded ? state.successCount + 1 : state.successCount,
        lastFinishedPattern: { patternId: event.patternId, score: event.score, counted, succeeded },
      };
    }
    case 'nextPressed':
      if (getTutorialPracticeNextTarget(state) !== 'nextPlayingMethod') return state;
      return { ...createTutorialPracticeState(state.spec), playingMethodIndex: state.playingMethodIndex + 1 };
    default:
      return assertNever(event);
  }
}

function selectMode(state: TutorialPracticeState, mode: TutorialPracticeMode): TutorialPracticeState {
  if (mode === 'directInput') {
    // 시연 예약을 취소하면 재생 중인 직접 입력 패턴은 그대로 집계 대상이다.
    if (state.mode === 'directInput') return state.pendingMode === null ? state : { ...state, pendingMode: null };
    // 시연 → 직접 입력은 현재 재생 위치에서 바로 적용한다. 시연으로 시작한 패턴은 patternStarted에서 이미 집계 대상이 아니다.
    return { ...state, mode: 'directInput' };
  }
  if (state.mode === 'demonstration') return state;
  // 직접 입력 → 시연: 재생 중이면 그 패턴을 직접 입력으로 마치고 다음 패턴부터, 아니면 바로 적용한다.
  if (isTutorialPatternPlaying(state)) return { ...state, pendingMode: 'demonstration' };
  return { ...state, mode: 'demonstration' };
}

/** 패턴이 재생 중인지. 토글 적용 시점을 정한다 */
export function isTutorialPatternPlaying(state: TutorialPracticeState): boolean {
  return state.playingPatternId !== null;
}

/** 토글에 표시할 선택: 예약한 시연이 있으면 그 선택을 보여준다 */
export function getSelectedTutorialPracticeMode(state: TutorialPracticeState): TutorialPracticeMode {
  return state.pendingMode ?? state.mode;
}

/** 조건 목록 아래의 `현재 성공 횟수/요구 성공 횟수` 진행도(예: 1/3) */
export function getTutorialPracticeProgress(state: TutorialPracticeState): { current: number; required: number } {
  return { current: state.successCount, required: state.spec.requiredSuccessCount };
}

/** 현재 연주 방법이 요구 성공 횟수에 도달해 반복을 멈추고 `다음`을 기다리는지 */
export function isTutorialPlayingMethodComplete(state: TutorialPracticeState): boolean {
  return state.successCount >= state.spec.requiredSuccessCount;
}

/**
 * 이 실습 세션에서 마지막 연주 방법까지 완료해 항목 전체를 통과했는지.
 * 통과 기록 저장은 이 값이 false에서 true로 바뀔 때만 통과를 기록하고, false라는 이유로 기존 통과 기록을 지우지 않는다.
 * 이미 통과한 항목을 다시 실습하면 새 상태는 false에서 시작하지만 과거 통과 기록은 유지한다(RFD 0081).
 */
export function isTutorialPracticeItemPassed(state: TutorialPracticeState): boolean {
  return state.playingMethodIndex === state.spec.playingMethods.length - 1 && isTutorialPlayingMethodComplete(state);
}

/** `다음`이 이동할 곳. 방법을 완료하기 전에는 null이다. 'nextItem'이면 UI가 다음 항목의 새 상태를 만든다 */
export type TutorialPracticeNextTarget = 'nextPlayingMethod' | 'nextItem';

export function getTutorialPracticeNextTarget(state: TutorialPracticeState): TutorialPracticeNextTarget | null {
  if (!isTutorialPlayingMethodComplete(state)) return null;
  return isTutorialPracticeItemPassed(state) ? 'nextItem' : 'nextPlayingMethod';
}

function assertNever(value: never): never {
  throw new Error(`처리하지 않은 값: ${JSON.stringify(value)}`);
}

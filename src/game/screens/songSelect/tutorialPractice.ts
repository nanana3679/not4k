import { JudgmentGrade } from '../../../shared';
import type { ScoreState } from '../../scoring/ScoreManager';

/**
 * 튜토리얼 실습의 UI 없는 코어: 실습항목 명세, 실습 1회 성공 조건 평가, 시연/직접 입력 토글과 누적 성공 상태.
 * 규칙의 권위는 glossary "튜토리얼"과 RFD 0081이다. 항목 전체 통과 기록의 저장·동기화는 이 모듈 밖에서 하며,
 * 여기서는 현재 실습 세션의 상태만 다룬다(재진입하면 `createTutorialPracticeState`로 새로 시작).
 */

/** 요구 성공 횟수의 기본값. 개발자가 실습항목별로 다른 양의 정수를 정할 수 있다. */
export const DEFAULT_REQUIRED_SUCCESS_COUNT = 3;

/** Great 이하 허용 개수의 잠정 기본값. 항목별 조건의 count에 사용하며 개발자가 다른 0 이상의 정수로 정할 수 있다. */
export const DEFAULT_MAX_GREAT_OR_WORSE_COUNT = 1;

/**
 * 실습 1회 성공 조건(Great 이하 허용 개수와 추가 조건). 화면에는 콤보 아래 한 줄씩 표시한다.
 * 명세에는 maxGreatOrWorseCount가 정확히 1개 있고, 추가 조건은 종류마다 최대 1개다.
 * 모든 count는 0 이상의 정수다. 항목별 기본 허용 개수는 DEFAULT_MAX_GREAT_OR_WORSE_COUNT를 쓴다.
 * 새 추가 조건은 kind를 더하고 `getTutorialConditionStatus`의 switch에 평가를 더한다. 이때 그 조건이 언제 결과가 정해지는지
 * (met으로 바꿀 시점)도 따로 정해야 한다. 실시간 met과 최종 성공 확정의 차이는 해당 함수의 계약을 따른다.
 */
export type TutorialSuccessCondition =
  /** Great 이하 허용 개수: Great·Good·goodTrill·Bad·Miss(무점수 바디 Miss 포함)의 합 */
  | { readonly kind: 'maxGreatOrWorseCount'; readonly count: number }
  /** Miss 허용 횟수(무점수 바디 Miss 포함): 트릴 롱노트 학습은 count 0으로 유지 실패를 성공에서 뺀다 */
  | { readonly kind: 'maxMissCount'; readonly count: number }
  /** `goodTrill` 허용 횟수: 트릴 교대 학습은 count 0으로 교대 실패를 성공에서 뺀다 */
  | { readonly kind: 'maxGoodTrillCount'; readonly count: number };

/** 한 실습항목 안에서 차례로 시연·실습하는 연주 방법. 방법마다 성공 횟수를 따로 센다. */
export interface TutorialPlayingMethod {
  readonly id: string;
}

export interface TutorialPracticeSpec {
  /** 요구 성공 횟수: 연주 방법 하나를 완료하는 누적 성공 횟수 */
  readonly requiredSuccessCount: number;
  /** 표시 순서대로 둔 성공 조건. maxGreatOrWorseCount 1개와 종류별 최대 1개의 추가 조건 */
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
  const greatOrWorseConditionCount = conditionCountByKind.get('maxGreatOrWorseCount') ?? 0;
  if (greatOrWorseConditionCount !== 1) {
    throw new RangeError(`Great 이하 개수 조건은 정확히 1개여야 합니다: ${greatOrWorseConditionCount}개`);
  }
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
    case 'maxGreatOrWorseCount':
      if (!Number.isInteger(condition.count) || condition.count < 0) {
        throw new RangeError(`Great 이하 허용 개수는 0 이상의 정수여야 합니다: ${condition.count}`);
      }
      return;
    case 'maxMissCount':
      if (!Number.isInteger(condition.count) || condition.count < 0) {
        throw new RangeError(`Miss 허용 횟수는 0 이상의 정수여야 합니다: ${condition.count}`);
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

/**
 * 연주 도중 점수와 finalize한 점수 모두에 쓰는 조건 하나의 상태.
 * 허용 개수를 초과하면 즉시 failed다. 개수는 한 패턴 안에서 줄지 않으므로 failed는 유지된다.
 * 허용 범위 안이고 모든 점수 항목을 정산했으면(liveDenominatorWeight가 finalDenominatorWeight에 도달) met,
 * 미정산 항목이 남으면 neutral이다. 점수 항목이 0개인 바디 전용 패턴도 같은 기준을 쓴다.
 * maxGreatOrWorseCount·maxMissCount의 met은 finalize 전 무점수 바디 Miss가 추가될 때에만 failed로 바뀔 수 있다.
 * maxGoodTrillCount는 모든 점수 항목 정산 후 바뀌지 않는다. 성공 횟수는 이 실시간 표시로 집계하지 않고,
 * `ExplicitJudgmentSession.finalize().score`를 `isTutorialPatternSuccess`에 'final'로 넘겨 확정한다.
 */
export function getTutorialConditionStatus(
  condition: TutorialSuccessCondition,
  score: Readonly<ScoreState>,
): TutorialConditionStatus {
  const remainingWeight = Math.max(0, score.finalDenominatorWeight - score.liveDenominatorWeight);
  switch (condition.kind) {
    case 'maxGreatOrWorseCount': {
      const counts = score.judgmentCounts;
      const greatOrWorseCount = counts[JudgmentGrade.GREAT] + counts[JudgmentGrade.GOOD]
        + counts[JudgmentGrade.GOOD_TRILL] + counts[JudgmentGrade.BAD] + counts[JudgmentGrade.MISS];
      if (greatOrWorseCount > condition.count) return 'failed';
      break;
    }
    case 'maxMissCount':
      if (score.judgmentCounts[JudgmentGrade.MISS] > condition.count) return 'failed';
      break;
    case 'maxGoodTrillCount':
      if (score.goodTrillCount > condition.count) return 'failed';
      break;
    default:
      return assertNever(condition);
  }
  return remainingWeight === 0 ? 'met' : 'neutral';
}

/**
 * 'live'는 모든 조건이 met이어도 성공을 확정하지 않는다. 'final'에서 모든 조건이 met이면 1회 성공이다.
 * ScoreState에는 finalize 여부가 없으므로 'final'은 호출자 계약이다. 반드시 해당 패턴의 세션을 finalize한 뒤 반환된
 * 점수를 넘겨야 하며, 이전 live 점수를 재사용하면 안 된다. 그래야 점수 항목 정산 뒤의 무점수 바디 Miss까지 평가한다.
 * `ScoreManager.finalize()` 자체는 미정산 항목을 정산하지 않으므로 남은 점수 항목이 있으면 'final'도 성공이 아니다.
 */
export function isTutorialPatternSuccess(
  conditions: readonly TutorialSuccessCondition[],
  score: Readonly<ScoreState>,
  evaluation: 'live' | 'final',
): boolean {
  return evaluation === 'final'
    && conditions.every((condition) => getTutorialConditionStatus(condition, score) === 'met');
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
  /** 재생 중인 패턴의 id. 재생 중이 아니면 null이다. 연주 방법을 완료한 뒤에는 시연으로 시작한 패턴만 받는다(도중에 직접 입력으로 바꿔도 집계하지 않는다) */
  readonly currentPatternId: number | null;
  /** 재생 중인 패턴을 처음부터 끝까지 직접 입력으로 연주해 성공 집계 대상인지 */
  readonly currentPatternCountable: boolean;
  /**
   * 지금까지 받은 patternStarted id 중 가장 큰 값. 이 값 이하의 시작은 중복이거나 지난 패턴이라 무시한다.
   * 방법 완료 뒤 무시한 직접 입력 시작의 id도 포함하며, `다음`을 눌러도 유지한다
   */
  readonly highestPatternStartId: number | null;
  /** 마지막으로 받아들인 패턴 결과. 반복이 다음 패턴으로 넘어간 뒤에도 UI가 직전 결과를 보여줄 수 있게 남긴다 */
  readonly lastFinishedPattern: TutorialFinishedPattern | null;
}

/** 끝난 패턴 한 차례의 결과. 시연·집계 제외 패턴도 남긴다 */
export interface TutorialFinishedPattern {
  readonly patternId: number;
  readonly score: Readonly<ScoreState>;
  /** 처음부터 끝까지 직접 입력으로 연주해 성공 집계 대상이었는지 */
  readonly countable: boolean;
  /** 모든 성공 조건을 만족했는지. countable과 함께 참일 때만 성공 횟수가 1 늘었다 */
  readonly succeeded: boolean;
}

/**
 * 플레이어가 지킬 계약:
 * - patternId는 패턴 한 차례(반복 1회)의 식별자이며, 한 실습 상태가 살아 있는 동안(`다음`을 눌러도) 계속 커져야 한다.
 *   실습 UI가 소유한 카운터를 쓰고, 컨트롤러마다 0부터 다시 세는 반복 차수를 그대로 넘기지 않는다.
 * - 연주 방법을 완료하면 직접 입력 패턴 시작을 멈춘다(reducer도 무시한다). 다음 방법의 반복은 `nextPressed` 뒤에만 시작하고,
 *   그 전에 이전 방법의 반복을 멈춘다. reducer는 어느 반복의 시작인지 알 수 없으므로, 이를 어긴 이전 반복의 시작도
 *   id가 더 크면 현재 방법의 패턴으로 받는다.
 * - 패턴 N의 `patternFinished`를 패턴 N+1의 `patternStarted`보다 먼저 보낸다. 순서가 바뀌면 N은 끝 통지를 놓친 것으로 버려진다.
 * - `patternFinished.score`는 해당 패턴의 `ExplicitJudgmentSession.finalize().score`를 넘긴다. 모든 점수 항목을
 *   정산했어도 바디 Miss가 뒤늦게 추가될 수 있으므로 live 점수를 최종 결과로 재사용하지 않는다.
 * - 패턴의 자동 입력(시연) 여부는 `patternStarted`를 처리한 뒤의 `state.mode`로 정한다. 토글 표시용
 *   `getSelectedTutorialPracticeMode`로 정하면 직접 입력 패턴 도중 예약한 시연이 그 패턴에 자동 입력을 섞는다.
 */
export type TutorialPracticeEvent =
  /** 플레이어가 토글에서 모드를 고름 */
  | { readonly type: 'modeSelected'; readonly mode: TutorialPracticeMode }
  /** 패턴 한 차례의 재생 시작 */
  | { readonly type: 'patternStarted'; readonly patternId: number }
  /** 패턴 한 차례의 결과 확정. score는 무점수 바디 Miss까지 포함해 세션을 finalize한 최종 점수 */
  | { readonly type: 'patternFinished'; readonly patternId: number; readonly score: Readonly<ScoreState> }
  /** `다음` 버튼 */
  | { readonly type: 'nextPressed' };

/** 실습 진입·재진입·재실습의 시작 상태: 첫 연주 방법, 성공 0회, 시연 */
export function createTutorialPracticeState(spec: TutorialPracticeSpec): TutorialPracticeState {
  return {
    spec, playingMethodIndex: 0, successCount: 0, mode: 'demonstration', pendingMode: null,
    currentPatternId: null, currentPatternCountable: false, highestPatternStartId: null, lastFinishedPattern: null,
  };
}

/** 이벤트 순서와 플레이어 계약은 `TutorialPracticeEvent`를 따른다 */
export function reduceTutorialPractice(state: TutorialPracticeState, event: TutorialPracticeEvent): TutorialPracticeState {
  switch (event.type) {
    case 'modeSelected':
      return selectMode(state, event.mode);
    case 'patternStarted': {
      // 이미 받은 id 이하의 시작은 재생 중인 패턴의 중복 통지이거나 지난 패턴이다.
      if (state.highestPatternStartId !== null && event.patternId <= state.highestPatternStartId) return state;
      // 아래 두 경우 모두 재생 중이던 다른 패턴은 끝 통지를 놓친 것으로 보고 결과 없이 버린다.
      const mode = state.pendingMode ?? state.mode;
      if (isTutorialPlayingMethodComplete(state) && mode === 'directInput') {
        // 방법을 완료하면 실습 반복은 멈추므로 직접 입력 패턴을 재생하지 않는다. id는 지난 id로 소비한다.
        return { ...state, currentPatternId: null, currentPatternCountable: false, highestPatternStartId: event.patternId };
      }
      // 방법 완료 뒤에도 시연은 볼 수 있으며, 시연 패턴은 집계 대상이 아니다.
      return {
        ...state, mode, pendingMode: null, currentPatternId: event.patternId,
        currentPatternCountable: mode === 'directInput', highestPatternStartId: event.patternId,
      };
    }
    case 'patternFinished': {
      // 재생 중인 패턴이 아닌 결과(늦게 온 이전 패턴, 이미 끝난 패턴, 시작을 받지 않은 패턴)는 무시한다.
      if (event.patternId !== state.currentPatternId) return state;
      const countable = state.currentPatternCountable;
      const succeeded = isTutorialPatternSuccess(state.spec.conditions, event.score, 'final');
      // 재생이 끝났으므로 예약한 시연은 지금 적용해도 다음 패턴 시작부터 적용한 것과 같다.
      return {
        ...state, mode: state.pendingMode ?? state.mode, pendingMode: null, currentPatternId: null,
        currentPatternCountable: false, successCount: countable && succeeded ? state.successCount + 1 : state.successCount,
        lastFinishedPattern: { patternId: event.patternId, score: event.score, countable, succeeded },
      };
    }
    case 'nextPressed':
      if (getTutorialPracticeNextTarget(state) !== 'nextPlayingMethod') return state;
      return {
        ...createTutorialPracticeState(state.spec), playingMethodIndex: state.playingMethodIndex + 1,
        highestPatternStartId: state.highestPatternStartId,
      };
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
  return state.currentPatternId !== null;
}

/** 토글에 표시할 선택: 예약한 시연이 있으면 그 선택을 보여준다 */
export function getSelectedTutorialPracticeMode(state: TutorialPracticeState): TutorialPracticeMode {
  return state.pendingMode ?? state.mode;
}

/** 조건 목록 아래의 `현재 성공 횟수/요구 성공 횟수` 진행도(예: 1/3) */
export function getTutorialPracticeProgress(state: TutorialPracticeState): { current: number; required: number } {
  return { current: state.successCount, required: state.spec.requiredSuccessCount };
}

/** 현재 연주 방법이 요구 성공 횟수에 도달해 직접 입력 실습 반복을 멈추고 `다음`을 기다리는지. 시연은 계속 볼 수 있다 */
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

import { describe, expect, it } from 'vitest';
import { JudgmentGrade } from '../../../shared';
import { ScoreManager } from '../../scoring/ScoreManager';
import type { ScoreItem, ScoreState } from '../../scoring/ScoreManager';
import {
  createTutorialPracticeSpec,
  createTutorialPracticeState,
  DEFAULT_REQUIRED_SUCCESS_COUNT,
  getSelectedTutorialPracticeMode,
  getTutorialConditionStatus,
  getTutorialPracticeNextTarget,
  getTutorialPracticeProgress,
  isTutorialPatternSuccess,
  isTutorialPlayingMethodComplete,
  isTutorialPracticeItemPassed,
  reduceTutorialPractice,
} from './tutorialPractice';
import type { TutorialPracticeEvent, TutorialPracticeState, TutorialSuccessCondition } from './tutorialPractice';

const { PERFECT, GREAT, GOOD, GOOD_TRILL, MISS } = JudgmentGrade;

/** weight3 3(기본)인 tap 점수 항목 total개. weight3 3이면 1개 Perfect가 3점, 분모 가중치도 3이다. */
function scoreItems(total: number, weight3 = 3): ScoreItem[] {
  return Array.from({ length: total }, (_, index) => ({
    id: `n${index}`, noteIndex: index, unitIndex: 0, kind: 'tap', timeMs: index * 500, weight3,
  }));
}

/** 실제 ScoreManager로 앞에서부터 grades를 정산한 연주 도중 점수. */
function liveScore(total: number, grades: readonly JudgmentGrade[]): Readonly<ScoreState> {
  const manager = new ScoreManager(scoreItems(total));
  grades.forEach((grade, index) => manager.settleScoreItem(`n${index}`, grade));
  return manager.getState();
}

/** 모든 점수 항목을 grades로 정산하고 finalize한 패턴 최종 점수. */
function finalScore(grades: readonly JudgmentGrade[]): Readonly<ScoreState> {
  const manager = new ScoreManager(scoreItems(grades.length));
  grades.forEach((grade, index) => manager.settleScoreItem(`n${index}`, grade));
  return manager.finalize();
}

const rate90: TutorialSuccessCondition = { kind: 'targetAchievementRate', percent: 90 };
const noGoodTrill: TutorialSuccessCondition = { kind: 'maxGoodTrillCount', count: 0 };

const SUCCESS = finalScore([PERFECT, PERFECT, PERFECT, PERFECT]);
const FAILURE = finalScore([PERFECT, MISS, MISS, MISS]);

const singleMethodSpec = (requiredSuccessCount?: number) => createTutorialPracticeSpec({
  requiredSuccessCount, conditions: [rate90, noGoodTrill], playingMethods: [{ id: 'tap' }],
});
const twoMethodSpec = () => createTutorialPracticeSpec({
  conditions: [rate90], playingMethods: [{ id: 'keepExistingKey' }, { id: 'alternateHeldKey' }],
});

function run(state: TutorialPracticeState, ...events: TutorialPracticeEvent[]): TutorialPracticeState {
  return events.reduce(reduceTutorialPractice, state);
}
const started: TutorialPracticeEvent = { type: 'patternStarted' };
const finished = (score: Readonly<ScoreState>): TutorialPracticeEvent => ({ type: 'patternFinished', score });
const select = (mode: 'demonstration' | 'directInput'): TutorialPracticeEvent => ({ type: 'modeSelected', mode });
const nextPressed: TutorialPracticeEvent = { type: 'nextPressed' };
const pattern = (score: Readonly<ScoreState>): TutorialPracticeEvent[] => [started, finished(score)];

/** 시연에서 패턴 재생 전에 직접 입력을 고른 상태. 다음 패턴부터 집계한다. */
function directInputState(spec = singleMethodSpec()): TutorialPracticeState {
  return run(createTutorialPracticeState(spec), select('directInput'));
}

describe('튜토리얼 실습 명세', () => {
  it('requiredSuccessCount를 생략하면 요구 성공 횟수는 기본값 3회', () => {
    expect(DEFAULT_REQUIRED_SUCCESS_COUNT).toBe(3);
    expect(singleMethodSpec().requiredSuccessCount).toBe(3);
  });

  it('requiredSuccessCount 5를 주면 진행도가 0/5로 시작', () => {
    expect(getTutorialPracticeProgress(createTutorialPracticeState(singleMethodSpec(5)))).toEqual({ current: 0, required: 5 });
  });

  it.each([0, -1, 2.5, Number.NaN, Number.POSITIVE_INFINITY])('요구 성공 횟수 %s는 양의 정수가 아니라 거부', (count) => {
    expect(() => singleMethodSpec(count)).toThrow(RangeError);
  });

  it('연주 방법이 0개면 거부', () => {
    expect(() => createTutorialPracticeSpec({ conditions: [rate90], playingMethods: [] })).toThrow(RangeError);
  });

  it('연주 방법 id가 겹치면 거부', () => {
    expect(() => createTutorialPracticeSpec({ conditions: [rate90], playingMethods: [{ id: 'a' }, { id: 'a' }] })).toThrow(RangeError);
  });

  it('성공 조건이 0개면 모든 패턴이 성공으로 집계되므로 거부', () => {
    expect(() => createTutorialPracticeSpec({ conditions: [], playingMethods: [{ id: 'tap' }] })).toThrow(RangeError);
  });

  it.each([-1, 100.5, Number.NaN])('목표 달성률 %s%는 0～100 밖이라 거부', (percent) => {
    expect(() => createTutorialPracticeSpec({
      conditions: [{ kind: 'targetAchievementRate', percent }], playingMethods: [{ id: 'tap' }],
    })).toThrow(RangeError);
  });

  it.each([-1, 0.5])('goodTrill 최대 횟수 %s는 0 이상의 정수가 아니라 거부', (count) => {
    expect(() => createTutorialPracticeSpec({
      conditions: [{ kind: 'maxGoodTrillCount', count }], playingMethods: [{ id: 'tap' }],
    })).toThrow(RangeError);
  });
});

describe('성공 조건의 실시간 상태', () => {
  it('10개 중 4개를 Perfect로 친 연주 도중에는 90% 조건과 goodTrill 0회 조건이 모두 neutral', () => {
    const score = liveScore(10, [PERFECT, PERFECT, PERFECT, PERFECT]);
    expect(getTutorialConditionStatus(rate90, score, 'playing')).toBe('neutral');
    expect(getTutorialConditionStatus(noGoodTrill, score, 'playing')).toBe('neutral');
  });

  it('연주 도중 goodTrill 1회면 maxGoodTrillCount 0 조건 즉시 failed', () => {
    const score = liveScore(10, [PERFECT, GOOD_TRILL]);
    expect(getTutorialConditionStatus(noGoodTrill, score, 'playing')).toBe('failed');
  });

  it('연주 도중 goodTrill 1회는 maxGoodTrillCount 1 조건을 아직 neutral로 둔다', () => {
    const score = liveScore(10, [PERFECT, GOOD_TRILL]);
    expect(getTutorialConditionStatus({ kind: 'maxGoodTrillCount', count: 1 }, score, 'playing')).toBe('neutral');
  });

  it('10개 중 Miss 1개·Good 1개 뒤 남은 8개를 전부 Perfect로 쳐도 25/30 = 83.3%라 90% 조건 failed', () => {
    const score = liveScore(10, [MISS, GOOD]);
    expect(getTutorialConditionStatus(rate90, score, 'playing')).toBe('failed');
  });

  it('10개 중 Miss 1개 뒤 남은 9개를 전부 Perfect로 치면 정확히 27/30 = 90%라 90% 조건은 아직 neutral', () => {
    const score = liveScore(10, [MISS]);
    expect(getTutorialConditionStatus(rate90, score, 'playing')).toBe('neutral');
  });

  it('패턴 종료 시 Perfect 9개·Miss 1개로 정확히 90%면 90% 조건 met', () => {
    const score = finalScore([MISS, PERFECT, PERFECT, PERFECT, PERFECT, PERFECT, PERFECT, PERFECT, PERFECT, PERFECT]);
    expect(getTutorialConditionStatus(rate90, score, 'finished')).toBe('met');
  });

  it('패턴 종료 시 Perfect 8개·Great 1개·Miss 1개로 26/30 = 86.7%면 90% 조건 failed', () => {
    const score = finalScore([MISS, GREAT, PERFECT, PERFECT, PERFECT, PERFECT, PERFECT, PERFECT, PERFECT, PERFECT]);
    expect(score.achievementRate).toBeCloseTo(86.67, 1);
    expect(getTutorialConditionStatus(rate90, score, 'finished')).toBe('failed');
  });

  it('weight3 1인 Great 6개·Miss 2개로 정확히 4/8 = 50%면 2/3점 누적 오차(3.9999…)가 있어도 50% 조건 met', () => {
    const manager = new ScoreManager(scoreItems(8, 1));
    [GREAT, GREAT, GREAT, GREAT, GREAT, GREAT, MISS, MISS].forEach((grade, index) => manager.settleScoreItem(`n${index}`, grade));
    const score = manager.finalize();
    expect(getTutorialConditionStatus({ kind: 'targetAchievementRate', percent: 50 }, score, 'finished')).toBe('met');
  });

  it('패턴 종료 시 goodTrill 0회면 maxGoodTrillCount 0 조건 met', () => {
    expect(getTutorialConditionStatus(noGoodTrill, SUCCESS, 'finished')).toBe('met');
  });

  it('점수 항목 가중치 합이 0인 패턴은 달성률 0%라 90% 조건이 연주 도중에도 failed', () => {
    const empty = new ScoreManager([]);
    expect(getTutorialConditionStatus(rate90, empty.getState(), 'playing')).toBe('failed');
    expect(getTutorialConditionStatus(rate90, empty.finalize(), 'finished')).toBe('failed');
  });
});

describe('패턴 1회 성공 판정', () => {
  it('Perfect 9개·일반 Good 1개로 28/30 = 93.3%면 Good이 있어도 90%·goodTrill 0회 조건을 모두 만족해 성공', () => {
    const score = finalScore([GOOD, PERFECT, PERFECT, PERFECT, PERFECT, PERFECT, PERFECT, PERFECT, PERFECT, PERFECT]);
    expect(isTutorialPatternSuccess([rate90, noGoodTrill], score)).toBe(true);
  });

  it('Perfect 9개·goodTrill 1개로 93.3%여도 goodTrill 0회 조건을 어겨 실패', () => {
    const score = finalScore([GOOD_TRILL, PERFECT, PERFECT, PERFECT, PERFECT, PERFECT, PERFECT, PERFECT, PERFECT, PERFECT]);
    expect(isTutorialPatternSuccess([rate90, noGoodTrill], score)).toBe(false);
  });

  it('Perfect 1개·Miss 3개로 25%면 90% 조건을 어겨 실패', () => {
    expect(isTutorialPatternSuccess([rate90, noGoodTrill], FAILURE)).toBe(false);
  });
});

describe('튜토리얼 실습 상태: 시작과 시연', () => {
  it('처음 상태는 시연·첫 방법·0/3이고 직접 입력은 토글로만 선택', () => {
    const state = createTutorialPracticeState(singleMethodSpec());
    expect(state.mode).toBe('demonstration');
    expect(getSelectedTutorialPracticeMode(state)).toBe('demonstration');
    expect(state.playingMethodIndex).toBe(0);
    expect(getTutorialPracticeProgress(state)).toEqual({ current: 0, required: 3 });
  });

  it('시연 패턴이 조건을 만족하며 끝나도 성공 횟수 0/3이고 직접 입력으로 자동 전환하지 않음', () => {
    const state = run(createTutorialPracticeState(singleMethodSpec()), ...pattern(SUCCESS), ...pattern(SUCCESS));
    expect(getTutorialPracticeProgress(state).current).toBe(0);
    expect(state.mode).toBe('demonstration');
  });
});

describe('튜토리얼 실습 상태: 누적 성공', () => {
  it('요구 3회에서 성공·실패·성공·성공이면 3/3으로 첫 방법 완료', () => {
    const state = run(directInputState(), ...pattern(SUCCESS), ...pattern(FAILURE), ...pattern(SUCCESS), ...pattern(SUCCESS));
    expect(getTutorialPracticeProgress(state)).toEqual({ current: 3, required: 3 });
    expect(isTutorialPlayingMethodComplete(state)).toBe(true);
  });

  it('성공 2회 뒤 실패 2회가 나와도 성공 횟수는 2/3으로 유지', () => {
    const state = run(directInputState(), ...pattern(SUCCESS), ...pattern(SUCCESS), ...pattern(FAILURE), ...pattern(FAILURE));
    expect(getTutorialPracticeProgress(state)).toEqual({ current: 2, required: 3 });
    expect(isTutorialPlayingMethodComplete(state)).toBe(false);
  });

  it('요구 1회 항목은 직접 입력 성공 1회로 바로 통과', () => {
    const state = run(directInputState(singleMethodSpec(1)), ...pattern(SUCCESS));
    expect(isTutorialPracticeItemPassed(state)).toBe(true);
  });

  it('3/3으로 방법을 완료한 뒤 끝난 성공 패턴은 집계하지 않아 3/3에 머문다', () => {
    const complete = run(directInputState(), ...pattern(SUCCESS), ...pattern(SUCCESS), ...pattern(SUCCESS));
    const after = run(complete, ...pattern(SUCCESS), ...pattern(SUCCESS));
    expect(getTutorialPracticeProgress(after)).toEqual({ current: 3, required: 3 });
  });

  it('patternStarted 없이 도착한 patternFinished는 조건을 만족해도 집계하지 않는다', () => {
    const state = run(directInputState(), finished(SUCCESS));
    expect(getTutorialPracticeProgress(state).current).toBe(0);
  });
});

describe('튜토리얼 실습 상태: 토글 적용 시점', () => {
  it('시연 도중 직접 입력으로 바꾼 패턴은 조건을 만족해도 집계 제외하고 다음 패턴부터 1/3', () => {
    const switched = run(createTutorialPracticeState(singleMethodSpec()), started, select('directInput'));
    expect(switched.mode).toBe('directInput');
    const afterSwitchedPattern = run(switched, finished(SUCCESS));
    expect(getTutorialPracticeProgress(afterSwitchedPattern).current).toBe(0);
    expect(getTutorialPracticeProgress(run(afterSwitchedPattern, ...pattern(SUCCESS))).current).toBe(1);
  });

  it('시연 패턴이 끝나고 다음 패턴 전에 직접 입력으로 바꾸면 바로 다음 패턴부터 1/3', () => {
    const state = run(createTutorialPracticeState(singleMethodSpec()), ...pattern(SUCCESS), select('directInput'), ...pattern(SUCCESS));
    expect(getTutorialPracticeProgress(state).current).toBe(1);
  });

  it('직접 입력에서 패턴 재생 중 시연으로 바꾸면 그 패턴은 직접 입력으로 집계되고 다음 패턴부터 시연', () => {
    const requested = run(directInputState(), started, select('demonstration'));
    expect(requested.mode).toBe('directInput');
    expect(getSelectedTutorialPracticeMode(requested)).toBe('demonstration');
    const counted = run(requested, finished(SUCCESS));
    expect(getTutorialPracticeProgress(counted).current).toBe(1);
    const demonstrated = run(counted, started);
    expect(demonstrated.mode).toBe('demonstration');
    expect(getTutorialPracticeProgress(run(demonstrated, finished(SUCCESS))).current).toBe(1);
  });

  it('직접 입력에서 패턴이 재생 중이 아닐 때 시연으로 바꾸면 바로 시연이고 다음 성공 패턴은 집계하지 않음', () => {
    const state = run(directInputState(), ...pattern(SUCCESS), select('demonstration'));
    expect(state.mode).toBe('demonstration');
    expect(getTutorialPracticeProgress(run(state, ...pattern(SUCCESS))).current).toBe(1);
  });

  it('재생 중 시연 예약 뒤 패턴이 끝나기 전에 다시 직접 입력을 고르면 예약이 취소되어 그 패턴과 다음 패턴 모두 집계해 2/3', () => {
    const state = run(directInputState(), started, select('demonstration'), select('directInput'), finished(SUCCESS), ...pattern(SUCCESS));
    expect(state.mode).toBe('directInput');
    expect(getTutorialPracticeProgress(state).current).toBe(2);
  });

  it('시연 도중 직접 입력으로 바꿨다가 같은 패턴 안에서 다시 시연을 고르면 그 패턴은 집계 제외되고 다음 패턴은 시연', () => {
    const state = run(createTutorialPracticeState(singleMethodSpec()), started, select('directInput'), select('demonstration'),
      finished(SUCCESS), started);
    expect(state.mode).toBe('demonstration');
    expect(getTutorialPracticeProgress(state).current).toBe(0);
  });

  it('성공 2회 뒤 시연을 다녀와도 같은 방법의 2/3을 유지하고 직접 입력 성공 1회를 더해 3/3', () => {
    const twoSuccesses = run(directInputState(), ...pattern(SUCCESS), ...pattern(SUCCESS));
    const afterDemonstration = run(twoSuccesses, select('demonstration'), ...pattern(SUCCESS), select('directInput'));
    expect(afterDemonstration.playingMethodIndex).toBe(0);
    expect(getTutorialPracticeProgress(afterDemonstration).current).toBe(2);
    expect(getTutorialPracticeProgress(run(afterDemonstration, ...pattern(SUCCESS))).current).toBe(3);
  });
});

describe('튜토리얼 실습 상태: 연주 방법과 다음', () => {
  it('두 방법 항목에서 첫 방법 3/3이면 항목 통과가 아니고 다음 대상은 둘째 방법', () => {
    const state = run(directInputState(twoMethodSpec()), ...pattern(SUCCESS), ...pattern(SUCCESS), ...pattern(SUCCESS));
    expect(isTutorialPlayingMethodComplete(state)).toBe(true);
    expect(isTutorialPracticeItemPassed(state)).toBe(false);
    expect(getTutorialPracticeNextTarget(state)).toBe('nextPlayingMethod');
  });

  it('두 방법 항목에서 첫 방법 3회 성공은 둘째 방법 횟수에 더하지 않아 다음을 누르면 둘째 방법 0/3·시연', () => {
    const firstComplete = run(directInputState(twoMethodSpec()), ...pattern(SUCCESS), ...pattern(SUCCESS), ...pattern(SUCCESS));
    const second = run(firstComplete, nextPressed);
    expect(second.playingMethodIndex).toBe(1);
    expect(getTutorialPracticeProgress(second)).toEqual({ current: 0, required: 3 });
    expect(second.mode).toBe('demonstration');
    expect(getSelectedTutorialPracticeMode(second)).toBe('demonstration');
  });

  it('첫 방법을 완료해도 다음을 누르기 전에는 둘째 방법으로 자동 이동하지 않음', () => {
    const state = run(directInputState(twoMethodSpec()), ...pattern(SUCCESS), ...pattern(SUCCESS), ...pattern(SUCCESS),
      ...pattern(SUCCESS));
    expect(state.playingMethodIndex).toBe(0);
  });

  it('두 방법 항목은 둘째 방법도 3/3이 되어야 항목 통과이고 다음 대상은 다음 항목', () => {
    const firstComplete = run(directInputState(twoMethodSpec()), ...pattern(SUCCESS), ...pattern(SUCCESS), ...pattern(SUCCESS));
    const secondTwo = run(firstComplete, nextPressed, select('directInput'), ...pattern(SUCCESS), ...pattern(SUCCESS));
    expect(isTutorialPracticeItemPassed(secondTwo)).toBe(false);
    const passed = run(secondTwo, ...pattern(SUCCESS));
    expect(isTutorialPracticeItemPassed(passed)).toBe(true);
    expect(getTutorialPracticeNextTarget(passed)).toBe('nextItem');
  });

  it('항목 통과 뒤 다음을 눌러도 상태는 그대로이고 항목 이동은 UI가 다음 항목의 새 상태로 처리', () => {
    const passed = run(directInputState(), ...pattern(SUCCESS), ...pattern(SUCCESS), ...pattern(SUCCESS));
    expect(run(passed, nextPressed)).toEqual(passed);
  });

  it('방법을 완료하기 전 2/3에서는 다음 대상이 없고 다음을 눌러도 상태가 바뀌지 않음', () => {
    const state = run(directInputState(twoMethodSpec()), ...pattern(SUCCESS), ...pattern(SUCCESS));
    expect(getTutorialPracticeNextTarget(state)).toBeNull();
    expect(run(state, nextPressed)).toEqual(state);
  });
});

describe('튜토리얼 실습 상태: 재진입', () => {
  it('둘째 방법 2/3에서 닫거나 다른 항목에 다녀와 새로 만든 상태는 첫 방법 0/3·시연에서 시작', () => {
    const spec = twoMethodSpec();
    const firstComplete = run(directInputState(spec), ...pattern(SUCCESS), ...pattern(SUCCESS), ...pattern(SUCCESS));
    const midway = run(firstComplete, nextPressed, select('directInput'), ...pattern(SUCCESS), ...pattern(SUCCESS));
    expect(midway.playingMethodIndex).toBe(1);
    const reentered = createTutorialPracticeState(spec);
    expect(reentered.playingMethodIndex).toBe(0);
    expect(reentered.mode).toBe('demonstration');
    expect(getTutorialPracticeProgress(reentered)).toEqual({ current: 0, required: 3 });
  });

  it('이미 통과한 항목을 다시 실습하는 새 상태는 0/3에서 시작해 다시 3회 성공해야 통과', () => {
    const spec = singleMethodSpec();
    const again = run(createTutorialPracticeState(spec), select('directInput'), ...pattern(SUCCESS), ...pattern(SUCCESS));
    expect(isTutorialPracticeItemPassed(again)).toBe(false);
    expect(isTutorialPracticeItemPassed(run(again, ...pattern(SUCCESS)))).toBe(true);
  });
});

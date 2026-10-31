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
  isTutorialPatternPlaying,
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

/** 실제 ScoreManager로 앞에서부터 grades를 정산하고 finalize하지 않은 연주 도중 점수. */
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
const NINE_PERFECT = [PERFECT, PERFECT, PERFECT, PERFECT, PERFECT, PERFECT, PERFECT, PERFECT, PERFECT];

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
const started = (patternId: number): TutorialPracticeEvent => ({ type: 'patternStarted', patternId });
const finished = (patternId: number, score: Readonly<ScoreState>): TutorialPracticeEvent => ({ type: 'patternFinished', patternId, score });
const select = (mode: 'demonstration' | 'directInput'): TutorialPracticeEvent => ({ type: 'modeSelected', mode });
const nextPressed: TutorialPracticeEvent = { type: 'nextPressed' };
/**
 * 패턴 id는 한 실습 상태 안에서 계속 커져야 한다. 자동 id는 1001부터 커지므로, 작은 id(1, 2, 3…)를 직접 적는 테스트는
 * 새 상태에서 그 id를 자동 id보다 먼저 쓴다. 자동 id 뒤에 같은 id를 다시 써야 하면 `nextPatternId()`로 받아 둔다.
 */
let lastPatternId = 1000;
const nextPatternId = (): number => ++lastPatternId;
/** 새 id로 시작해 끝나는 패턴 한 차례 */
function pattern(score: Readonly<ScoreState>): TutorialPracticeEvent[] {
  const patternId = nextPatternId();
  return [started(patternId), finished(patternId, score)];
}

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
    expect(() => singleMethodSpec(count)).toThrow(/요구 성공 횟수/);
  });

  it('연주 방법이 0개면 거부', () => {
    expect(() => createTutorialPracticeSpec({ conditions: [rate90], playingMethods: [] })).toThrow(/연주 방법/);
  });

  it('연주 방법 id가 겹치면 거부', () => {
    expect(() => createTutorialPracticeSpec({ conditions: [rate90], playingMethods: [{ id: 'a' }, { id: 'a' }] })).toThrow(/연주 방법 id/);
  });

  it('목표 달성률 90%만 있고 추가 조건이 없는 명세는 허용', () => {
    expect(createTutorialPracticeSpec({ conditions: [rate90], playingMethods: [{ id: 'tap' }] }).conditions).toEqual([rate90]);
  });

  it('성공 조건이 0개면 목표 달성률 조건이 없어 거부', () => {
    expect(() => createTutorialPracticeSpec({ conditions: [], playingMethods: [{ id: 'tap' }] })).toThrow(/목표 달성률 조건은 정확히 1개/);
  });

  it('maxGoodTrillCount 0만 있고 목표 달성률 조건이 없으면 거부', () => {
    expect(() => createTutorialPracticeSpec({ conditions: [noGoodTrill], playingMethods: [{ id: 'tap' }] }))
      .toThrow(/목표 달성률 조건은 정확히 1개/);
  });

  it('목표 달성률 조건이 90%·80% 2개면 거부', () => {
    expect(() => createTutorialPracticeSpec({
      conditions: [rate90, { kind: 'targetAchievementRate', percent: 80 }], playingMethods: [{ id: 'tap' }],
    })).toThrow(/목표 달성률 조건은 정확히 1개/);
  });

  it('maxGoodTrillCount 조건이 0회·1회 2개면 같은 종류 추가 조건이 겹쳐 거부', () => {
    expect(() => createTutorialPracticeSpec({
      conditions: [rate90, noGoodTrill, { kind: 'maxGoodTrillCount', count: 1 }], playingMethods: [{ id: 'tap' }],
    })).toThrow(/maxGoodTrillCount/);
  });

  it.each([-1, 100.5, Number.NaN])('목표 달성률 %s%는 0～100 밖이라 거부', (percent) => {
    expect(() => createTutorialPracticeSpec({
      conditions: [{ kind: 'targetAchievementRate', percent }], playingMethods: [{ id: 'tap' }],
    })).toThrow(/목표 달성률은 0～100%/);
  });

  it.each([-1, 0.5])('goodTrill 허용 횟수 %s는 0 이상의 정수가 아니라 거부', (count) => {
    expect(() => createTutorialPracticeSpec({
      conditions: [rate90, { kind: 'maxGoodTrillCount', count }], playingMethods: [{ id: 'tap' }],
    })).toThrow(/goodTrill 허용 횟수/);
  });
});

describe('성공 조건의 실시간 상태', () => {
  it('10개 중 4개를 Perfect로 친 연주 도중에는 90% 조건과 goodTrill 0회 조건이 모두 neutral', () => {
    const score = liveScore(10, [PERFECT, PERFECT, PERFECT, PERFECT]);
    expect(getTutorialConditionStatus(rate90, score)).toBe('neutral');
    expect(getTutorialConditionStatus(noGoodTrill, score)).toBe('neutral');
  });

  it('연주 도중 goodTrill 1회면 maxGoodTrillCount 0 조건 즉시 failed', () => {
    const score = liveScore(10, [PERFECT, GOOD_TRILL]);
    expect(getTutorialConditionStatus(noGoodTrill, score)).toBe('failed');
  });

  it('연주 도중 goodTrill 1회는 maxGoodTrillCount 1 조건을 아직 neutral로 둔다', () => {
    const score = liveScore(10, [PERFECT, GOOD_TRILL]);
    expect(getTutorialConditionStatus({ kind: 'maxGoodTrillCount', count: 1 }, score)).toBe('neutral');
  });

  it('10개 중 Miss 1개·Good 1개 뒤 남은 8개를 전부 Perfect로 쳐도 25/30 = 83.3%라 90% 조건 failed', () => {
    const score = liveScore(10, [MISS, GOOD]);
    expect(getTutorialConditionStatus(rate90, score)).toBe('failed');
  });

  it('10개 중 Miss 1개 뒤 남은 9개를 전부 Perfect로 치면 정확히 27/30 = 90%라 90% 조건은 아직 neutral', () => {
    const score = liveScore(10, [MISS]);
    expect(getTutorialConditionStatus(rate90, score)).toBe('neutral');
  });

  it('finalize 전이라도 10개를 모두 정산해 Miss 1개·Perfect 9개로 정확히 90%면 90% 조건 met', () => {
    const score = liveScore(10, [MISS, ...NINE_PERFECT]);
    expect(getTutorialConditionStatus(rate90, score)).toBe('met');
  });

  it('finalize 전이라도 10개를 모두 정산하고 goodTrill 0회면 maxGoodTrillCount 0 조건 met', () => {
    const score = liveScore(10, [GOOD, ...NINE_PERFECT]);
    expect(getTutorialConditionStatus(noGoodTrill, score)).toBe('met');
  });

  it('10개 중 9개만 정산해 goodTrill 0회여도 마지막 항목이 남아 maxGoodTrillCount 0 조건은 neutral', () => {
    const score = liveScore(10, NINE_PERFECT);
    expect(getTutorialConditionStatus(noGoodTrill, score)).toBe('neutral');
  });

  it('finalize한 Perfect 8개·Great 1개·Miss 1개로 26/30 = 86.7%면 90% 조건 failed', () => {
    const score = finalScore([MISS, GREAT, PERFECT, PERFECT, PERFECT, PERFECT, PERFECT, PERFECT, PERFECT, PERFECT]);
    expect(score.achievementRate).toBeCloseTo(86.67, 1);
    expect(getTutorialConditionStatus(rate90, score)).toBe('failed');
  });

  it('weight3 1인 Great 6개·Miss 2개로 정확히 4/8 = 50%면 2/3점 누적 오차(3.9999…)가 있어도 50% 조건 met', () => {
    const manager = new ScoreManager(scoreItems(8, 1));
    [GREAT, GREAT, GREAT, GREAT, GREAT, GREAT, MISS, MISS].forEach((grade, index) => manager.settleScoreItem(`n${index}`, grade));
    const score = manager.finalize();
    expect(getTutorialConditionStatus({ kind: 'targetAchievementRate', percent: 50 }, score)).toBe('met');
  });

  it('finalize한 패턴에서 goodTrill 0회면 maxGoodTrillCount 0 조건 met', () => {
    expect(getTutorialConditionStatus(noGoodTrill, SUCCESS)).toBe('met');
  });

  it('점수 항목 가중치 합이 0인 패턴은 달성률 0%라 90% 조건이 처음부터 failed', () => {
    const empty = new ScoreManager([]);
    expect(getTutorialConditionStatus(rate90, empty.getState())).toBe('failed');
    expect(getTutorialConditionStatus(rate90, empty.finalize())).toBe('failed');
  });
});

describe('패턴 1회 성공 판정', () => {
  it('Perfect 9개·일반 Good 1개로 28/30 = 93.3%면 Good이 있어도 90%·goodTrill 0회 조건을 모두 만족해 성공', () => {
    const score = finalScore([GOOD, ...NINE_PERFECT]);
    expect(isTutorialPatternSuccess([rate90, noGoodTrill], score)).toBe(true);
  });

  it('Perfect 9개·goodTrill 1개로 93.3%여도 goodTrill 0회 조건을 어겨 실패', () => {
    const score = finalScore([GOOD_TRILL, ...NINE_PERFECT]);
    expect(isTutorialPatternSuccess([rate90, noGoodTrill], score)).toBe(false);
  });

  it('Perfect 1개·Miss 3개로 25%면 90% 조건을 어겨 실패', () => {
    expect(isTutorialPatternSuccess([rate90, noGoodTrill], FAILURE)).toBe(false);
  });

  it('10개 중 Perfect 9개만 정산한 점수는 조건이 neutral이라 성공이 아니다', () => {
    expect(isTutorialPatternSuccess([rate90, noGoodTrill], liveScore(10, NINE_PERFECT))).toBe(false);
  });
});

describe('튜토리얼 실습 상태: 시작과 시연', () => {
  it('처음 상태는 시연·첫 방법·0/3이고 재생 중인 패턴과 마지막 패턴 결과가 없다', () => {
    const state = createTutorialPracticeState(singleMethodSpec());
    expect(state.mode).toBe('demonstration');
    expect(getSelectedTutorialPracticeMode(state)).toBe('demonstration');
    expect(state.playingMethodIndex).toBe(0);
    expect(getTutorialPracticeProgress(state)).toEqual({ current: 0, required: 3 });
    expect(isTutorialPatternPlaying(state)).toBe(false);
    expect(state.lastFinishedPattern).toBeNull();
  });

  it('시연 패턴이 조건을 만족하며 끝나도 성공 횟수 0/3이고 직접 입력으로 자동 전환하지 않음', () => {
    const state = run(createTutorialPracticeState(singleMethodSpec()), ...pattern(SUCCESS), ...pattern(SUCCESS));
    expect(getTutorialPracticeProgress(state).current).toBe(0);
    expect(state.mode).toBe('demonstration');
  });

  it('조건을 만족한 시연 패턴 3이 끝나면 lastFinishedPattern은 패턴 3·countable false·succeeded true', () => {
    const state = run(createTutorialPracticeState(singleMethodSpec()), started(3), finished(3, SUCCESS));
    expect(state.lastFinishedPattern).toEqual({ patternId: 3, score: SUCCESS, countable: false, succeeded: true });
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

  it('직접 입력 패턴 1 성공 뒤 lastFinishedPattern은 countable true·succeeded true, 패턴 2 실패 뒤에는 countable true·succeeded false', () => {
    const afterSuccess = run(directInputState(), started(1), finished(1, SUCCESS));
    expect(afterSuccess.lastFinishedPattern).toEqual({ patternId: 1, score: SUCCESS, countable: true, succeeded: true });
    const afterFailure = run(afterSuccess, started(2), finished(2, FAILURE));
    expect(afterFailure.lastFinishedPattern).toEqual({ patternId: 2, score: FAILURE, countable: true, succeeded: false });
    expect(getTutorialPracticeProgress(afterFailure).current).toBe(1);
  });

  it('요구 1회 항목은 직접 입력 성공 1회로 바로 통과', () => {
    const state = run(directInputState(singleMethodSpec(1)), ...pattern(SUCCESS));
    expect(isTutorialPracticeItemPassed(state)).toBe(true);
  });

  it('3/3으로 방법을 완료한 직접 입력에서는 다음 패턴 시작을 무시해 실습 반복이 멈추고 3/3에 머문다', () => {
    const complete = run(directInputState(), ...pattern(SUCCESS), ...pattern(SUCCESS), ...pattern(SUCCESS));
    const id = nextPatternId();
    const afterStart = run(complete, started(id));
    expect(isTutorialPatternPlaying(afterStart)).toBe(false);
    const afterFinish = run(afterStart, finished(id, SUCCESS));
    expect(getTutorialPracticeProgress(afterFinish)).toEqual({ current: 3, required: 3 });
    expect(afterFinish.lastFinishedPattern).toEqual(complete.lastFinishedPattern);
  });

  it('3/3으로 방법을 완료한 직접 입력에서 시연을 고르면 재생 중인 패턴이 없어 바로 시연이고 횟수는 3/3', () => {
    const complete = run(directInputState(), ...pattern(SUCCESS), ...pattern(SUCCESS), ...pattern(SUCCESS));
    const state = run(complete, select('demonstration'));
    expect(state.mode).toBe('demonstration');
    expect(getSelectedTutorialPracticeMode(state)).toBe('demonstration');
    expect(getTutorialPracticeProgress(state).current).toBe(3);
  });

  it('3/3 완료 뒤 시연을 고르면 시연 패턴은 재생되고 조건을 만족해도 countable false로 3/3에 머문다', () => {
    const complete = run(directInputState(), ...pattern(SUCCESS), ...pattern(SUCCESS), ...pattern(SUCCESS));
    const id = nextPatternId();
    const playing = run(complete, select('demonstration'), started(id));
    expect(playing.currentPatternId).toBe(id);
    const state = run(playing, finished(id, SUCCESS));
    expect(getTutorialPracticeProgress(state)).toEqual({ current: 3, required: 3 });
    expect(state.lastFinishedPattern).toEqual({ patternId: id, score: SUCCESS, countable: false, succeeded: true });
  });

  it('3/3 완료 뒤 시연 패턴 재생 중 직접 입력으로 바꾸면 그 패턴은 집계 제외되고 이어지는 직접 입력 시작은 무시', () => {
    const complete = run(directInputState(), ...pattern(SUCCESS), ...pattern(SUCCESS), ...pattern(SUCCESS));
    const demoId = nextPatternId();
    const directId = nextPatternId();
    const state = run(complete, select('demonstration'), started(demoId), select('directInput'), finished(demoId, SUCCESS),
      started(directId));
    expect(getTutorialPracticeProgress(state).current).toBe(3);
    expect(state.lastFinishedPattern?.countable).toBe(false);
    expect(isTutorialPatternPlaying(state)).toBe(false);
  });

  it('3/3 완료 뒤 직접 입력으로 바꾼 시연 패턴의 끝 통지 없이 직접 입력 시작이 오면 시연 패턴을 버려 재생 중인 패턴이 없고 늦은 finish도 무시', () => {
    const complete = run(directInputState(), ...pattern(SUCCESS), ...pattern(SUCCESS), ...pattern(SUCCESS));
    const demoId = nextPatternId();
    const directId = nextPatternId();
    const dropped = run(complete, select('demonstration'), started(demoId), select('directInput'), started(directId));
    expect(isTutorialPatternPlaying(dropped)).toBe(false);
    expect(run(dropped, finished(demoId, SUCCESS)).lastFinishedPattern).toEqual(complete.lastFinishedPattern);
  });

  it('방법을 완료하는 직접 입력 패턴 도중 시연을 예약하면 끝난 뒤 3/3이고 모드는 시연, 다음 시작은 집계하지 않는 시연 패턴이다', () => {
    const twoDone = run(directInputState(), ...pattern(SUCCESS), ...pattern(SUCCESS));
    const lastId = nextPatternId();
    const complete = run(twoDone, started(lastId), select('demonstration'), finished(lastId, SUCCESS));
    expect(getTutorialPracticeProgress(complete)).toEqual({ current: 3, required: 3 });
    expect(complete.mode).toBe('demonstration');
    const demoId = nextPatternId();
    const playing = run(complete, started(demoId));
    expect(playing.currentPatternId).toBe(demoId);
    expect(playing.currentPatternCountable).toBe(false);
  });

  it('두 방법 항목에서 첫 방법 완료 뒤 받은 시연 패턴 재생 중 다음을 누르면 그 패턴은 버려지고 늦은 finish는 둘째 방법 0/3에 남지 않는다', () => {
    const complete = run(directInputState(twoMethodSpec()), ...pattern(SUCCESS), ...pattern(SUCCESS), ...pattern(SUCCESS));
    const demoId = nextPatternId();
    const secondMethod = run(complete, select('demonstration'), started(demoId), nextPressed);
    expect(secondMethod.playingMethodIndex).toBe(1);
    expect(isTutorialPatternPlaying(secondMethod)).toBe(false);
    const afterLateFinish = run(secondMethod, finished(demoId, SUCCESS));
    expect(getTutorialPracticeProgress(afterLateFinish)).toEqual({ current: 0, required: 3 });
    expect(afterLateFinish.lastFinishedPattern).toBeNull();
  });

  it('patternStarted 없이 도착한 patternFinished는 조건을 만족해도 집계하지 않고 lastFinishedPattern도 남기지 않는다', () => {
    const state = run(directInputState(), finished(1, SUCCESS));
    expect(getTutorialPracticeProgress(state).current).toBe(0);
    expect(state.lastFinishedPattern).toBeNull();
  });
});

describe('튜토리얼 실습 상태: 패턴 id', () => {
  it('시연 패턴 1 재생 중 직접 입력으로 바꾼 뒤 같은 패턴 1의 patternStarted가 다시 와도 무시해 그 패턴은 집계 제외', () => {
    const state = run(createTutorialPracticeState(singleMethodSpec()), started(1), select('directInput'), started(1), finished(1, SUCCESS));
    expect(getTutorialPracticeProgress(state).current).toBe(0);
    expect(state.lastFinishedPattern?.countable).toBe(false);
  });

  it('직접 입력 패턴 1 재생 중 시연을 예약한 뒤 같은 패턴 1의 patternStarted가 다시 와도 시연을 앞당기지 않아 패턴 1을 1/3으로 집계', () => {
    const duplicated = run(directInputState(), started(1), select('demonstration'), started(1));
    expect(duplicated.mode).toBe('directInput');
    expect(getSelectedTutorialPracticeMode(duplicated)).toBe('demonstration');
    const state = run(duplicated, finished(1, SUCCESS));
    expect(getTutorialPracticeProgress(state).current).toBe(1);
    expect(state.mode).toBe('demonstration');
  });

  it('직접 입력 패턴 1의 끝 통지 없이 패턴 2가 시작되면 패턴 1은 결과 없이 버리고 패턴 2 성공만 1/3으로 집계', () => {
    const dropped = run(directInputState(), started(1), started(2));
    expect(dropped.currentPatternId).toBe(2);
    const state = run(dropped, finished(2, SUCCESS));
    expect(getTutorialPracticeProgress(state).current).toBe(1);
    expect(state.lastFinishedPattern?.patternId).toBe(2);
  });

  it('패턴 2가 시작된 뒤 늦게 도착한 패턴 1의 성공 finish는 무시해 0/3이고 패턴 2는 계속 재생 중', () => {
    const state = run(directInputState(), started(1), started(2), finished(1, SUCCESS));
    expect(getTutorialPracticeProgress(state).current).toBe(0);
    expect(state.currentPatternId).toBe(2);
    expect(state.lastFinishedPattern).toBeNull();
  });

  it('직접 입력 패턴 1 재생 중 시연을 예약하고 끝 통지 없이 패턴 2가 시작되면 패턴 2부터 시연이라 성공해도 0/3', () => {
    const switched = run(directInputState(), started(1), select('demonstration'), started(2));
    expect(switched.mode).toBe('demonstration');
    expect(getTutorialPracticeProgress(run(switched, finished(2, SUCCESS))).current).toBe(0);
  });

  it('직접 입력 패턴 1이 성공으로 끝난 뒤 같은 패턴 1의 finish가 한 번 더 와도 1/3', () => {
    const state = run(directInputState(), started(1), finished(1, SUCCESS), finished(1, SUCCESS));
    expect(getTutorialPracticeProgress(state).current).toBe(1);
  });

  it('직접 입력 패턴 1이 성공으로 끝난 뒤 패턴 1의 start와 finish가 다시 와도 지난 id라 무시해 1/3', () => {
    const state = run(directInputState(), started(1), finished(1, SUCCESS), started(1), finished(1, SUCCESS));
    expect(getTutorialPracticeProgress(state).current).toBe(1);
    expect(isTutorialPatternPlaying(state)).toBe(false);
  });

  it('패턴 5가 끝난 뒤 더 작은 id 3의 시작은 지난 패턴이라 무시해 재생 중인 패턴이 없다', () => {
    const state = run(directInputState(), started(5), finished(5, FAILURE), started(3));
    expect(isTutorialPatternPlaying(state)).toBe(false);
    expect(getTutorialPracticeProgress(run(state, finished(3, SUCCESS))).current).toBe(0);
  });

  it('다음을 눌러도 id 기준은 이어져 첫 방법에서 쓴 id 3 이하의 시작은 둘째 방법에서 무시하고 id 4부터 받는다', () => {
    const firstComplete = run(directInputState(twoMethodSpec()), started(1), finished(1, SUCCESS), started(2), finished(2, SUCCESS),
      started(3), finished(3, SUCCESS));
    const second = run(firstComplete, nextPressed, select('directInput'), started(1));
    expect(isTutorialPatternPlaying(second)).toBe(false);
    const afterPattern4 = run(second, started(4), finished(4, SUCCESS));
    expect(getTutorialPracticeProgress(afterPattern4)).toEqual({ current: 1, required: 3 });
  });

  it('닫았다 다시 열어 새로 만든 실습 상태는 id 기준도 새로 시작해 id 1의 성공을 1/3으로 집계', () => {
    const spec = singleMethodSpec();
    run(createTutorialPracticeState(spec), select('directInput'), started(1), finished(1, SUCCESS), started(2));
    const reentered = run(createTutorialPracticeState(spec), select('directInput'), started(1), finished(1, SUCCESS));
    expect(getTutorialPracticeProgress(reentered).current).toBe(1);
  });

  it('첫 방법 완료 뒤 무시된 직접 입력 패턴 재생 중 다음을 누르면 늦게 온 그 패턴의 finish는 둘째 방법에 집계하지 않음', () => {
    const firstComplete = run(directInputState(twoMethodSpec()), ...pattern(SUCCESS), ...pattern(SUCCESS), ...pattern(SUCCESS));
    const id = nextPatternId();
    const state = run(firstComplete, started(id), nextPressed, select('directInput'), finished(id, SUCCESS));
    expect(state.playingMethodIndex).toBe(1);
    expect(getTutorialPracticeProgress(state).current).toBe(0);
    expect(state.lastFinishedPattern).toBeNull();
  });

  it('첫 방법 완료 뒤 무시된 직접 입력 시작의 id도 지난 id라 다음 뒤 같은 id로 다시 시작해도 무시', () => {
    const firstComplete = run(directInputState(twoMethodSpec()), ...pattern(SUCCESS), ...pattern(SUCCESS), ...pattern(SUCCESS));
    const id = nextPatternId();
    const state = run(firstComplete, started(id), nextPressed, select('directInput'), started(id));
    expect(isTutorialPatternPlaying(state)).toBe(false);
  });

  it('계약 위반 고정: 다음을 누르고 직접 입력을 고른 뒤 첫 방법 루프가 더 큰 id로 늦게 시작을 보내면 둘째 방법 패턴으로 받아 1/3으로 집계', () => {
    // 플레이어는 방법 완료 시 직접 입력 패턴 시작을 멈추고, 다음 방법 루프는 nextPressed 뒤에만 시작해야 한다.
    // reducer는 어느 루프의 시작인지 알 수 없으므로 이 계약을 어기면 이전 루프의 패턴도 현재 방법에 집계된다.
    const firstComplete = run(directInputState(twoMethodSpec()), ...pattern(SUCCESS), ...pattern(SUCCESS), ...pattern(SUCCESS));
    const staleId = nextPatternId();
    const state = run(firstComplete, nextPressed, select('directInput'), started(staleId), finished(staleId, SUCCESS));
    expect(state.playingMethodIndex).toBe(1);
    expect(getTutorialPracticeProgress(state).current).toBe(1);
  });
});

describe('튜토리얼 실습 상태: 토글 적용 시점', () => {
  it('시연 도중 직접 입력으로 바꾼 패턴은 조건을 만족해도 집계 제외하고 다음 패턴부터 1/3', () => {
    const switched = run(createTutorialPracticeState(singleMethodSpec()), started(1), select('directInput'));
    expect(switched.mode).toBe('directInput');
    const afterSwitchedPattern = run(switched, finished(1, SUCCESS));
    expect(getTutorialPracticeProgress(afterSwitchedPattern).current).toBe(0);
    expect(afterSwitchedPattern.lastFinishedPattern).toEqual({ patternId: 1, score: SUCCESS, countable: false, succeeded: true });
    expect(getTutorialPracticeProgress(run(afterSwitchedPattern, ...pattern(SUCCESS))).current).toBe(1);
  });

  it('시연 패턴이 끝나고 다음 패턴 전에 직접 입력으로 바꾸면 바로 다음 패턴부터 1/3', () => {
    const state = run(createTutorialPracticeState(singleMethodSpec()), ...pattern(SUCCESS), select('directInput'), ...pattern(SUCCESS));
    expect(getTutorialPracticeProgress(state).current).toBe(1);
  });

  it('직접 입력에서 패턴 재생 중 시연으로 바꾸면 그 패턴은 직접 입력으로 집계되고 다음 패턴부터 시연', () => {
    const requested = run(directInputState(), started(1), select('demonstration'));
    expect(requested.mode).toBe('directInput');
    expect(getSelectedTutorialPracticeMode(requested)).toBe('demonstration');
    const afterPattern1 = run(requested, finished(1, SUCCESS));
    expect(getTutorialPracticeProgress(afterPattern1).current).toBe(1);
    const demonstrated = run(afterPattern1, started(2));
    expect(demonstrated.mode).toBe('demonstration');
    expect(getTutorialPracticeProgress(run(demonstrated, finished(2, SUCCESS))).current).toBe(1);
  });

  it('직접 입력에서 패턴이 재생 중이 아닐 때 시연으로 바꾸면 바로 시연이고 다음 성공 패턴은 집계하지 않음', () => {
    const state = run(directInputState(), ...pattern(SUCCESS), select('demonstration'));
    expect(state.mode).toBe('demonstration');
    expect(getTutorialPracticeProgress(run(state, ...pattern(SUCCESS))).current).toBe(1);
  });

  it('재생 중 시연 예약 뒤 패턴이 끝나기 전에 다시 직접 입력을 고르면 예약이 취소되어 그 패턴과 다음 패턴 모두 집계해 2/3', () => {
    const state = run(directInputState(), started(1), select('demonstration'), select('directInput'), finished(1, SUCCESS),
      ...pattern(SUCCESS));
    expect(state.mode).toBe('directInput');
    expect(getTutorialPracticeProgress(state).current).toBe(2);
  });

  it('시연 도중 직접 입력으로 바꿨다가 같은 패턴 안에서 다시 시연을 고르면 그 패턴은 집계 제외되고 다음 패턴은 시연', () => {
    const state = run(createTutorialPracticeState(singleMethodSpec()), started(1), select('directInput'), select('demonstration'),
      finished(1, SUCCESS), started(2));
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

  it('두 방법 항목에서 첫 방법 3회 성공은 둘째 방법 횟수에 더하지 않아 다음을 누르면 둘째 방법 0/3·시연·마지막 패턴 결과 없음', () => {
    const firstComplete = run(directInputState(twoMethodSpec()), ...pattern(SUCCESS), ...pattern(SUCCESS), ...pattern(SUCCESS));
    const second = run(firstComplete, nextPressed);
    expect(second.playingMethodIndex).toBe(1);
    expect(getTutorialPracticeProgress(second)).toEqual({ current: 0, required: 3 });
    expect(second.mode).toBe('demonstration');
    expect(getSelectedTutorialPracticeMode(second)).toBe('demonstration');
    expect(second.lastFinishedPattern).toBeNull();
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

import { expect, it } from 'vitest';
import { beat } from '../../../shared/types/beat';
import { tutorialExplicitPlayerPreviews } from '../../../lab/tutorialExplicitPlayerPreviews';
import { createExplicitTutorialPreview } from './explicitTutorialPreviewChart';
import { createExplicitTutorialInput } from './explicitTutorialInput';
import { createExplicitTutorialPreviewPlayback, type ExplicitTutorialPatternResult, type TutorialInputMode } from './explicitTutorialPreviewPlayback';
import { createTutorialPracticeSpec, createTutorialPracticeState, reduceTutorialPractice } from './tutorialPractice';
import type { ExplicitTutorialInputPlan } from './explicitTutorialPreviewSession';

function setup(inputOffsetMs = 0, initialMode: TutorialInputMode = 'directInput', demoPlan: ExplicitTutorialInputPlan = {
  kind: 'timings', timings: [{ lane: 2, key: 'KeyE', startMs: 500, endMs: 2000 }],
}, initiallyBlocked = false) {
  // 공개 레슨은 마지막 판정 뒤 2000ms 여백을 둔다. closing 경계는 끝 릴리즈가 반복 경계인 합성 차트로 검증한다.
  const preview = createExplicitTutorialPreview('mode-ownership', '모드 전환', [], 4, {
    ...tutorialExplicitPlayerPreviews[0].preview.chart,
    notes: [
      { type: 'tap', kind: 'single', lane: 2, beat: beat(1) },
      { type: 'body', lane: 2, holdCount: 1, beat: beat(1), endBeat: beat(4) },
      { type: 'release', lane: 2, count: 1, beat: beat(4) },
    ],
  });
  const playback = createExplicitTutorialPreviewPlayback(preview, demoPlan,
    { showJudgmentGroup() {}, recordFlightJudgment() {}, showBombEffect() {} });
  let state = createTutorialPracticeState(createTutorialPracticeSpec({
    conditions: [{ kind: 'maxGreatOrWorseCount', count: 0 }], playingMethods: [{ id: 'practice' }],
  }));
  state = reduceTutorialPractice(state, { type: 'modeSelected', mode: initialMode });
  const startFirstPattern = () => {
    state = reduceTutorialPractice(state, { type: 'patternStarted', patternId: 0 });
  };
  if (!initiallyBlocked) startFirstPattern();
  const finished: (ExplicitTutorialPatternResult & { successCount: number; countable: boolean })[] = [];
  const clock = { loopStartNow: 0, blocked: initiallyBlocked, inputOffsetMs };
  const input = createExplicitTutorialInput(playback, [{ lane: 2, key: 'KeyE' }], preview.loopMs, () => clock, pattern => {
    state = reduceTutorialPractice(state, { type: 'patternFinished', patternId: pattern.iteration,
      score: pattern.result.score, modeSwitchedDuringPattern: pattern.modeSwitchedDuringPattern });
    finished.push({ ...pattern, successCount: state.successCount, countable: state.lastFinishedPattern!.countable });
    state = reduceTutorialPractice(state, { type: 'patternStarted', patternId: pattern.iteration + 1 });
  });
  const target = new EventTarget();
  input.attach(target);
  input.setMode(initialMode);
  const key = (type: 'keydown' | 'keyup', at: number) => {
    const event = new Event(type, { cancelable: true });
    Object.defineProperties(event, { code: { value: 'KeyE' }, timeStamp: { value: at }, repeat: { value: false } });
    target.dispatchEvent(event);
  };
  const mode = (next: TutorialInputMode, at: number) => {
    input.advanceTo(at);
    state = reduceTutorialPractice(state, { type: 'modeSelected', mode: next });
    input.setMode(next);
  };
  const play = (start: number) => {
    key('keydown', start + 500 - inputOffsetMs);
    input.advanceTo(start + 2000 - inputOffsetMs);
    key('keyup', start + 2005 - inputOffsetMs);
    input.advanceTo(start + 2120 - Math.min(0, inputOffsetMs));
  };
  return { input, playback, finished, clock, key, mode, play, startFirstPattern };
}

it('루프 0ms를 시작한 뒤 같은 0ms에 시연을 왕복하면 첫 직접 입력 패턴은 Perfect여도 집계에서 제외한다', () => {
  const { input, finished, mode, play } = setup();
  try {
    input.advanceTo(0);
    mode('demonstration', 0);
    mode('directInput', 0);
    play(0);
    expect(finished[0]).toMatchObject({
      modeSwitchedDuringPattern: true, countable: false, successCount: 0,
      result: { score: { achievementRate: 100 } },
    });
  } finally { input.stop(); }
});

it.each([0, 1000])('직접 입력 패턴을 %ims에 일시정지하고 시연으로 바꾸면 재개 후 Perfect 2개여도 전환 이력으로 성공 0회다', pausedAtMs => {
  const { input, finished, clock, key, mode } = setup();
  try {
    if (pausedAtMs > 500) key('keydown', 500);
    input.advanceTo(pausedAtMs);
    clock.blocked = true;
    input.syncJudging();
    mode('demonstration', pausedAtMs + 300);
    expect(finished).toHaveLength(0);

    // 500ms 동안 설정을 열었다 닫은 것처럼 물리 시계만 보정한다.
    clock.loopStartNow += 500;
    clock.blocked = false;
    input.syncJudging();
    input.advanceTo(2000);
    expect(finished[0].result.score.judgmentCounts).toMatchObject({ perfect: 2, miss: 0 });
    expect(finished[0]).toMatchObject({
      iteration: 0, modeSwitchedDuringPattern: true, countable: false, successCount: 0,
    });
  } finally { input.stop(); }
});

it('패턴 1의 1000ms 도식에서 시연으로 바꾸면 도식 재개의 rebase 뒤에도 패턴 1만 제외하고 성공 1회를 유지한다', () => {
  const { input, finished, clock, key, mode, play } = setup();
  try {
    play(0);
    key('keydown', 2500);
    input.advanceTo(2600);
    // 도식이 새로 열린 프레임은 도식 시작점까지 진행한 뒤 입력을 막는다.
    clock.blocked = true;
    input.advanceTo(3050, { loopTimeMs: 1000, blocked: false });
    mode('demonstration', 3500);

    // 도식 확인 후 현재 반복의 1200ms로 옮기며 누적 반복 차수는 0으로 바뀐다.
    clock.loopStartNow = 5000 - 1200;
    input.rebase(5000);
    clock.blocked = false;
    input.advanceTo(2000);
    expect(finished.map(pattern => [pattern.iteration, pattern.modeSwitchedDuringPattern,
      pattern.countable, pattern.successCount])).toEqual([
      [0, false, true, 1], [1, true, false, 1],
    ]);
    expect(finished[1].result.score.judgmentCounts).toMatchObject({ perfect: 2, miss: 0 });
  } finally { input.stop(); }
});

it.each(['directInput', 'demonstration'] as const)('첫 입력 전 0ms 도식에서 %s로 바꾸면 패턴 0에는 전환 이력이 없고 선택한 모드로만 집계한다', chosenMode => {
  const initialMode = chosenMode === 'directInput' ? 'demonstration' : 'directInput';
  const { input, finished, clock, key, mode, startFirstPattern } = setup(0, initialMode, undefined, true);
  try {
    input.advanceTo(0);
    mode(chosenMode, 300);
    // 초기 도식을 닫아 200ms부터 시작해도, 준비 중의 모드 선택은 패턴 0의 전환이 아니다.
    clock.loopStartNow = 1000 - 200;
    input.rebase(1000);
    clock.blocked = false;
    startFirstPattern();
    input.advanceTo(200);
    if (chosenMode === 'directInput') key('keydown', clock.loopStartNow + 500);
    input.advanceTo(2000);
    if (chosenMode === 'directInput') key('keyup', clock.loopStartNow + 2005);
    input.advanceTo(2120);

    expect(finished).toHaveLength(1);
    expect(finished[0].result.score.judgmentCounts).toMatchObject({ perfect: 2, miss: 0 });
    expect(finished[0]).toMatchObject({ iteration: 0, modeSwitchedDuringPattern: false });
    expect([finished[0].countable, finished[0].successCount])
      .toEqual(chosenMode === 'directInput' ? [true, 1] : [false, 0]);
  } finally { input.stop(); }
});

it('N 경계 직후 2001ms·2002ms에 시연 왕복하면 N은 1회 성공하고 N+1만 제외하며 N+2에서 2회가 된다', () => {
  const { input, finished, key, mode, play } = setup();
  try {
    key('keydown', 500);
    input.advanceTo(2000);
    mode('demonstration', 2001);
    mode('directInput', 2002);
    key('keyup', 2005);
    input.advanceTo(2120);
    play(2000);
    play(4000);
    expect(finished.map(({ modeSwitchedDuringPattern, countable, successCount }) =>
      [modeSwitchedDuringPattern, countable, successCount])).toEqual([
      [false, true, 1], [true, false, 1], [false, true, 2],
    ]);
    expect(finished.map(pattern => pattern.result.score.achievementRate)).toEqual([100, 100, 100]);
  } finally { input.stop(); }
});

it('500ms부터 유지한 바디를 1000ms에 시연으로 넘기면 1490ms 실제 up은 무점수이고 2000ms 시연 릴리즈는 Perfect다', () => {
  const { input, playback, finished, key, mode } = setup();
  try {
    key('keydown', 500);
    mode('demonstration', 1000);
    key('keyup', 1490);
    input.advanceTo(1490);
    expect(playback.renderSnapshot(0).bodyUnits[0].state).toBe('active');
    expect(playback.renderSnapshot(0).items[1].state).toBe('pending');
    input.advanceTo(2000);
    expect(finished[0]).toMatchObject({ modeSwitchedDuringPattern: true, countable: false, successCount: 0 });
    expect(finished[0].result.score.judgmentCounts).toMatchObject({ perfect: 2, miss: 0 });
    expect(finished[0].result.facts.filter(fact => fact.kind === 'bodyFailed')).toEqual([]);
    expect(finished[0].result.facts.filter(fact => fact.kind === 'settlement' && fact.itemKind === 'release'))
      .toMatchObject([{ atMs: 2000, grade: 'perfect' }]);
  } finally { input.stop(); }
});

it.each([0, -200])('offset %ims에서 N closing 중 시연으로 바꿔도 실제 up을 받고 보정 기한까지 기다려 N을 성공 집계한다', inputOffsetMs => {
  const { input, finished, key, mode } = setup(inputOffsetMs);
  const delay = -inputOffsetMs;
  try {
    key('keydown', 500 + delay);
    input.advanceTo(2000 + delay);
    mode('demonstration', 2001 + delay);
    key('keyup', 2005 + delay);
    input.advanceTo(2119 + delay);
    expect(finished).toHaveLength(0);
    input.advanceTo(2120 + delay);
    expect(finished).toHaveLength(1);
    expect(finished[0]).toMatchObject({ modeSwitchedDuringPattern: false, countable: true, successCount: 1 });
    expect(finished[0].result.facts.filter(fact => fact.kind === 'settlement' && fact.itemKind === 'release'))
      .toMatchObject([{ atMs: 2005, grade: 'perfect' }]);
    input.advanceTo(4000);
    expect(finished[1]).toMatchObject({ modeSwitchedDuringPattern: true, countable: false, successCount: 1 });
  } finally { input.stop(); }
});

it('offset -200ms에서 물리 경계 2001ms에 시연으로 바꾸면 아직 1801ms인 N은 실제 2205ms up으로 정산한다', () => {
  const { input, finished, key, mode } = setup(-200);
  try {
    key('keydown', 700);
    mode('demonstration', 2001);
    input.advanceTo(2120);
    expect(finished).toHaveLength(0);
    key('keyup', 2205);
    input.advanceTo(2320);
    expect(finished[0]).toMatchObject({ modeSwitchedDuringPattern: false, successCount: 1 });
    expect(finished[0].result.facts.filter(fact => fact.kind === 'settlement' && fact.itemKind === 'release'))
      .toMatchObject([{ atMs: 2005, grade: 'perfect' }]);
    input.advanceTo(4000);
    expect(finished[1]).toMatchObject({ modeSwitchedDuringPattern: true, successCount: 1 });
  } finally { input.stop(); }
});

it('offset -200ms에서 1000ms 시연 전환은 800ms가 아닌 1000ms 계획의 KeyD hold를 넘겨받는다', () => {
  const { input, playback, finished, key, mode } = setup(-200, 'directInput', {
    kind: 'timings', timings: [{ lane: 2, key: 'KeyD', startMs: 900, endMs: 2000 }],
  });
  try {
    key('keydown', 700);
    mode('demonstration', 1000);
    expect(playback.renderSnapshot(0).atMs).toBe(1000);
    key('keyup', 1050);
    input.advanceTo(1050);
    expect(playback.renderSnapshot(0).bodyUnits[0].state).toBe('active');
    input.advanceTo(2000);
    expect(finished[0].result.score.judgmentCounts).toMatchObject({ perfect: 2, miss: 0 });
  } finally { input.stop(); }
});

it('한 패턴의 1000·1200·1300·1400ms에 모드를 왕복해도 한 번만 제외하고 다음 직접 입력 패턴부터 1회 성공한다', () => {
  const { input, finished, key, mode, play } = setup();
  try {
    key('keydown', 500);
    mode('demonstration', 1000);
    mode('directInput', 1200);
    mode('demonstration', 1300);
    mode('directInput', 1400);
    key('keyup', 2005);
    input.advanceTo(2120);
    play(2000);
    expect(finished.map(pattern => [pattern.modeSwitchedDuringPattern, pattern.countable, pattern.successCount]))
      .toEqual([[true, false, 0], [false, true, 1]]);
    expect(finished.map(pattern => pattern.result.score.achievementRate)).toEqual([100, 100]);
  } finally { input.stop(); }
});

it('시연 중 750ms부터 누른 실제 키로 1000ms에 직접 입력을 넘겨받으면 2005ms 릴리즈는 Perfect이며 첫 패턴만 제외한다', () => {
  const { input, playback, finished, key, mode, play } = setup(0, 'demonstration');
  try {
    input.advanceTo(750);
    key('keydown', 750);
    mode('directInput', 1000);
    input.advanceTo(1900);
    expect(playback.renderSnapshot(0).bodyUnits[0].state).toBe('active');
    input.advanceTo(2000);
    key('keyup', 2005);
    input.advanceTo(2120);
    play(2000);
    expect(finished.map(pattern => [pattern.modeSwitchedDuringPattern, pattern.countable, pattern.successCount]))
      .toEqual([[true, false, 0], [false, true, 1]]);
    expect(finished[0].result.facts.filter(fact => fact.kind === 'settlement' && fact.itemKind === 'release'))
      .toMatchObject([{ atMs: 2005, grade: 'perfect' }]);
  } finally { input.stop(); }
});

it('offset -1000ms의 이전 패턴 keyup은 현재 시연의 같은 KeyE 바디를 끊거나 릴리즈 점수를 만들지 않는다', () => {
  const { input, playback, finished, key, mode } = setup(-1000);
  try {
    key('keydown', 1500);
    mode('demonstration', 2001);
    input.advanceTo(2600);
    expect(playback.renderSnapshot(1).bodyUnits[1].state).toBe('active');
    key('keyup', 3005);
    input.advanceTo(3100);
    expect(playback.renderSnapshot(1).bodyUnits[1].state).toBe('active');
    expect(playback.renderSnapshot(1).items[3].state).toBe('pending');
    input.advanceTo(3120);
    expect(finished[0]).toMatchObject({ successCount: 1, modeSwitchedDuringPattern: false });
    input.advanceTo(4000);
    expect(finished[1].result.score.judgmentCounts).toMatchObject({ perfect: 2, miss: 0 });
  } finally { input.stop(); }
});

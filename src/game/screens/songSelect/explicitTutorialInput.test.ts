import { createExplicitTutorialInput } from './explicitTutorialInput';
import { createExplicitTutorialPreviewPlayback, createTutorialTimingsInputPlan } from './explicitTutorialPreviewPlayback';
import type { ExplicitTutorialPatternResult } from './explicitTutorialPreviewPlayback';
import { tutorialExplicitPlayerPreviews } from '../../../lab/tutorialExplicitPlayerPreviews';
import { getTutorialInputTimings } from './tutorialPreviewChart';

import { beat } from '../../../shared/types/beat';
import { createExplicitTutorialPreview } from './explicitTutorialPreviewChart';
import { BASIC_TUTORIAL_EXPLICIT_PREVIEWS } from './basicTutorialExplicitPreviews';
import { describe, expect, it, vi } from 'vitest';
import { getExplicitTutorialInputTime } from './explicitTutorialInput';
import { DEFAULT_MAX_GREAT_OR_WORSE_COUNT, createTutorialPracticeSpec, createTutorialPracticeState, isTutorialPatternSuccess, reduceTutorialPractice } from './tutorialPractice';
import type { KeyBinding } from '../../input/InputSystem';
import { getJudgmentWindows } from '../../../shared/constants/judgment';

it('connected-long-note-switch의 4005ms up은 이전 패턴의 Perfect 3·100%로 4120ms에 정산한다', () => {
  const preview = BASIC_TUTORIAL_EXPLICIT_PREVIEWS.find(preview => preview.id === 'connected-long-note-switch')!;
  const timings = getTutorialInputTimings(preview.chart);
  const playback = createExplicitTutorialPreviewPlayback(preview, createTutorialTimingsInputPlan(timings), {
    showJudgmentGroup() {}, recordFlightJudgment() {}, showBombEffect() {},
  });
  const finished = vi.fn();
  const input = createExplicitTutorialInput(playback,
    timings.map(({ event }) => ({ lane: event.lane, key: event.keyCode })),
    preview.loopMs, () => ({ loopStartNow: 0, blocked: false }), finished);
  const target = new EventTarget();
  input.attach(target);
  input.setMode('directInput');
  for (const { event, startMs, endMs } of timings) {
    keyboard(target, 'keydown', event.keyCode, startMs);
    keyboard(target, 'keyup', event.keyCode, endMs === 4000 ? 4005 : endMs);
  }
  input.advanceTo(4000);
  input.advanceTo(4016);
  input.advanceTo(4119);
  expect(finished).not.toHaveBeenCalled();
  input.advanceTo(4120);
  expect(finished).toHaveBeenCalledTimes(1);
  const pattern = finished.mock.calls[0][0];
  expect(pattern.iteration).toBe(0);
  expect(pattern.result.score.judgmentCounts).toMatchObject({ perfect: 3, miss: 0 });
  expect(pattern.result.score.achievementRate).toBe(100);
  expect(isTutorialPatternSuccess([{ kind: 'maxGreatOrWorseCount', count: DEFAULT_MAX_GREAT_OR_WORSE_COUNT }], pattern.result.score, 'final')).toBe(true);
  input.stop();
});

describe('튜토리얼 키보드 시각', () => {
  it('시작 1000ms·반복 2000ms에서 event 3015ms는 다음 반복 1의 15ms로 환산', () => {
    expect(getExplicitTutorialInputTime(3015, 1000, 2000)).toEqual({ elapsedMs: 2015, iteration: 1, loopTimeMs: 15 });
  });
  it('500ms 일시정지로 시작을 1500ms로 옮기면 event 3015ms는 반복 0의 1515ms', () => {
    expect(getExplicitTutorialInputTime(3015, 1500, 2000)).toEqual({ elapsedMs: 1515, iteration: 0, loopTimeMs: 1515 });
  });
  it('시작 1000ms보다 이른 event 999ms는 반복 0의 0ms로 제한', () => {
    expect(getExplicitTutorialInputTime(999, 1000, 2000)).toEqual({ elapsedMs: 0, iteration: 0, loopTimeMs: 0 });
  });
});

function keyboard(target: EventTarget, type: 'keydown' | 'keyup', code: string, at: number) {
  const event = new Event(type, { cancelable: true });
  Object.defineProperties(event, { code: { value: code }, timeStamp: { value: at }, repeat: { value: false } });
  target.dispatchEvent(event);
  return event;
}

function setup(preview = tutorialExplicitPlayerPreviews[0].preview, key: string | readonly KeyBinding[] = 'KeyE', ownsKeyboardInput = () => true) {
  const effects = { showJudgmentGroup: vi.fn(), recordFlightJudgment: vi.fn(), showBombEffect: vi.fn() };
  const playback = createExplicitTutorialPreviewPlayback(preview,
    createTutorialTimingsInputPlan(getTutorialInputTimings(preview.chart)), effects);
  const clock = { loopStartNow: 1000, blocked: false };
  const onPatternFinished = vi.fn();
  const input = createExplicitTutorialInput(playback, typeof key === 'string' ? [{ lane: 2, key }] : key, preview.loopMs,
    () => clock, onPatternFinished, ownsKeyboardInput);
  const target = new EventTarget();
  input.attach(target);
  return { input, playback, target, effects, clock, onPatternFinished };
}

it('4005ms down은 새 패턴의 0ms 탭만 Perfect로 만들고 4120ms까지 이전 복사본의 판정 상태도 유지한다', () => {
  const preview = createExplicitTutorialPreview('overlapping-sessions', '겹친 판정 세션', [], 8, {
    ...tutorialExplicitPlayerPreviews[0].preview.chart,
    notes: [
      { type: 'tap', kind: 'single', lane: 1, beat: beat(0) },
      { type: 'tap', kind: 'single', lane: 2, beat: beat(6) },
      { type: 'body', lane: 2, holdCount: 1, beat: beat(6), endBeat: beat(8) },
      { type: 'release', lane: 2, count: 1, beat: beat(8) },
    ],
  });
  const { input, playback, target, onPatternFinished } = setup(preview, [
    { lane: 2, key: 'KeyE' }, { lane: 1, key: 'KeyQ' },
  ]);
  input.setMode('directInput');
  keyboard(target, 'keydown', 'KeyE', 4000);
  input.advanceTo(4000);
  expect(input.sessionIteration).toBe(1);
  keyboard(target, 'keydown', 'KeyQ', 5005);
  input.advanceTo(4005);
  expect(playback.renderSnapshot(1).items.map(item => item.state)).toEqual([
    'miss', 'success', 'pending',
    'success', 'pending', 'pending',
    'pending', 'pending', 'pending',
  ]);
  expect(onPatternFinished).not.toHaveBeenCalled();
  input.advanceTo(4120);
  expect(onPatternFinished.mock.calls[0][0].result.score.judgmentCounts).toMatchObject({ perfect: 1, miss: 2 });
  input.stop();
});

it.each(['release', 'tick'] as const)('4005ms up은 이전 릴리즈만 Perfect로 만들고 새 패턴의 %s(릴리즈 0ms·틱 50ms)는 성공시키지 않는다', kind => {
  const preview = createExplicitTutorialPreview('preheld-release', '이전 키 해제', [], 8, {
    ...tutorialExplicitPlayerPreviews[0].preview.chart,
    notes: [
      ...(kind === 'release' ? [
        { type: 'release' as const, lane: 2 as const, count: 1 as const, beat: beat(0) },
      ] : [
        { type: 'body' as const, lane: 2 as const, holdCount: 1 as const, beat: beat(0), endBeat: beat(1, 5) },
        { type: 'tick' as const, lane: 2 as const, count: 1 as const, beat: beat(1, 10) },
      ]),
      { type: 'body', lane: 2, holdCount: 1, beat: beat(6), endBeat: beat(8) },
      { type: 'release', lane: 2, count: 1, beat: beat(8) },
    ],
  });
  const { input, playback, target, onPatternFinished } = setup(preview);
  input.setMode('directInput');
  keyboard(target, 'keydown', 'KeyE', 4000);
  input.advanceTo(4000);
  if (kind === 'tick') expect(playback.renderSnapshot(1).bodyUnits[2].state).toBe('active');
  keyboard(target, 'keyup', 'KeyE', 5005);
  input.advanceTo(4005);
  expect(input.heldKeys).toEqual([]);
  expect(playback.renderSnapshot(1).items[1].grade).toBe('perfect');
  expect(playback.renderSnapshot(1).items[2].state).toBe('pending');
  input.advanceTo(4120);
  input.advanceTo(4150);
  expect(playback.renderSnapshot(1).items[2].state).toBe(kind === 'tick' ? 'dependentZero' : 'miss');
  expect(onPatternFinished.mock.calls[0][0].result.score.judgmentCounts.perfect).toBe(1);
  input.stop();
});

describe.each(['connected-long-note-switch', 'connected-long-note-overlap', 'headless-long-note'])('%s의 경계 릴리즈', id => {
  it.each([
    { inputOffsetMs: -200, judgmentMode: 'normal' },
    { inputOffsetMs: 0, judgmentMode: 'normal' },
    { inputOffsetMs: 200, judgmentMode: 'normal' },
    { inputOffsetMs: -200, judgmentMode: 'easy' },
    { inputOffsetMs: 200, judgmentMode: 'easy' },
  ] as const)('$judgmentMode offset $inputOffsetMs ms에서 경계 +5ms up을 3회 처리하면 기한마다 finish→start 순서로 3/3이 된다', ({ inputOffsetMs, judgmentMode }) => {
    const preview = BASIC_TUTORIAL_EXPLICIT_PREVIEWS.find(preview => preview.id === id)!;
    const timings = getTutorialInputTimings(preview.chart);
    const windows = getJudgmentWindows(judgmentMode);
    const playback = createExplicitTutorialPreviewPlayback(preview, createTutorialTimingsInputPlan(timings), {
      showJudgmentGroup() {}, recordFlightJudgment() {}, showBombEffect() {},
    }, { windows });
    let practice = createTutorialPracticeState(createTutorialPracticeSpec({
      conditions: [{ kind: 'maxGreatOrWorseCount', count: DEFAULT_MAX_GREAT_OR_WORSE_COUNT }], playingMethods: [{ id: 'practice' }],
    }));
    practice = reduceTutorialPractice(practice, { type: 'modeSelected', mode: 'directInput' });
    practice = reduceTutorialPractice(practice, { type: 'patternStarted', patternId: 0 });
    const events = ['start:0'];
    const finished = vi.fn(pattern => {
      events.push(`finish:${pattern.iteration}`);
      practice = reduceTutorialPractice(practice, { type: 'patternFinished', patternId: pattern.iteration, score: pattern.result.score });
      if (practice.successCount === 3) return false as const;
      events.push(`start:${pattern.iteration + 1}`);
      practice = reduceTutorialPractice(practice, { type: 'patternStarted', patternId: pattern.iteration + 1 });
    });
    const input = createExplicitTutorialInput(playback,
      timings.map(({ event }) => ({ lane: event.lane, key: event.keyCode })), preview.loopMs,
      () => ({ loopStartNow: 0, blocked: false, inputOffsetMs }), finished);
    const target = new EventTarget();
    input.attach(target);
    input.setMode('directInput');
    let frameMs = 0;
    for (const iteration of [0, 1, 2]) {
      const actions = timings.flatMap(({ event, startMs, endMs }) => [
        { type: 'keydown' as const, key: event.keyCode, at: startMs },
        { type: 'keyup' as const, key: event.keyCode, at: endMs + (endMs === preview.loopMs ? 5 : 0) },
      ]).sort((a, b) => a.at - b.at);
      for (const action of actions) {
        const at = iteration * preview.loopMs + action.at - inputOffsetMs;
        for (; frameMs < at; frameMs += 16) input.advanceTo(frameMs);
        keyboard(target, action.type, action.key, at);
        input.advanceTo(at);
      }
      const deadlineMs = (iteration + 1) * preview.loopMs + windows.GOOD + Math.max(0, -inputOffsetMs);
      for (; frameMs < deadlineMs; frameMs += 16) input.advanceTo(frameMs);
      input.advanceTo(deadlineMs - 1);
      expect(finished).toHaveBeenCalledTimes(iteration);
      input.advanceTo(deadlineMs);
      expect(practice.successCount).toBe(iteration + 1);
      expect(finished.mock.calls[iteration][0].result.score.achievementRate).toBe(100);
      expect(input.heldKeys).toEqual([]);
    }
    expect(events).toEqual(['start:0', 'finish:0', 'start:1', 'finish:1', 'start:2', 'finish:2']);
    input.stop();
  });
});

it.each([2999, 3000])('2000ms 경계 프레임 뒤 timestamp %i ms keyup이 도착하면 2120ms에 이전 패턴은 Perfect 2·Miss 0', at => {
  const base = tutorialExplicitPlayerPreviews[0].preview;
  const preview = createExplicitTutorialPreview('boundary-release', '경계 릴리즈', [], 4, { ...base.chart, notes: [
    { type: 'tap', kind: 'single', lane: 2, beat: beat(1) },
    { type: 'body', lane: 2, holdCount: 1, beat: beat(1), endBeat: beat(4) },
    { type: 'release', lane: 2, count: 1, beat: beat(4) },
  ] });
  const { input, target, onPatternFinished } = setup(preview);
  input.setMode('directInput');
  keyboard(target, 'keydown', 'KeyE', 1500);
  input.advanceTo(500);
  input.advanceTo(2000);
  keyboard(target, 'keyup', 'KeyE', at);
  input.advanceTo(2016);
  expect(onPatternFinished).not.toHaveBeenCalled();
  input.advanceTo(2120);
  expect(onPatternFinished).toHaveBeenCalledTimes(1);
  expect(onPatternFinished.mock.calls[0][0].result.score.judgmentCounts).toMatchObject({ perfect: 2, miss: 0 });
  expect(input.heldKeys).toEqual([]);
  input.stop();
});

it('직접 입력에서 첫 프레임 전 event 3500ms를 받아도 이전 반복은 Miss 3이고 다음 반복 500ms 탭만 Perfect 1', () => {
  const { input, target, effects } = setup();
  input.setMode('directInput');
  input.advanceTo(1900);
  keyboard(target, 'keydown', 'KeyE', 3500);
  expect(input.advanceTo(2500)).toBeUndefined();
  const finished = input.advanceTo(2516);
  expect(finished?.result.score.judgmentCounts).toMatchObject({ perfect: 0, miss: 3 });
  expect(effects.recordFlightJudgment.mock.calls.filter(([grade]) => grade === 'perfect')).toHaveLength(1);
  expect(input.heldKeys).toEqual([{ lane: 2, key: 'KeyE' }]);
  input.stop();
});

it.each(['paused prop', '도식 확인 대기'])('%s 중 500ms KeyE down은 판정하지 않고 재개 뒤 held만 동기화해 Perfect 0', () => {
  const { input, target, effects, clock } = setup();
  input.setMode('directInput');
  input.advanceTo(400);
  clock.blocked = true;
  keyboard(target, 'keydown', 'KeyE', 1500);
  expect(input.advanceTo(2500)).toBeUndefined();
  expect(effects.recordFlightJudgment).not.toHaveBeenCalled();
  expect(input.heldKeys).toEqual([{ lane: 2, key: 'KeyE' }]);
  clock.blocked = false;
  clock.loopStartNow = 1500;
  input.advanceTo(500);
  expect(effects.recordFlightJudgment).not.toHaveBeenCalled();
  keyboard(target, 'keyup', 'KeyE', 2020);
  keyboard(target, 'keydown', 'KeyE', 2500);
  input.advanceTo(1000);
  expect(effects.recordFlightJudgment.mock.calls.filter(([grade]) => grade === 'perfect')).toHaveLength(1);
  input.stop();
});

it('직접 입력의 KeyE는 기본 동작·상위 탐색을 막고 Escape는 닫기 핸들러로 전달', () => {
  const { input, target } = setup();
  input.setMode('directInput');
  const navigate = vi.fn();
  target.addEventListener('keydown', navigate);
  expect(keyboard(target, 'keydown', 'KeyE', 1500).defaultPrevented).toBe(true);
  expect(navigate).not.toHaveBeenCalled();
  expect(keyboard(target, 'keydown', 'Escape', 1510).defaultPrevented).toBe(false);
  expect(navigate).toHaveBeenCalledTimes(1);
  input.stop();
  keyboard(target, 'keydown', 'KeyE', 1600);
  expect(navigate).toHaveBeenCalledTimes(2);
});

it('500ms까지 판정한 뒤 늦게 온 rAF 490ms는 같은 세션을 유지하여 첫 탭 Perfect 1을 잃지 않음', () => {
  const { input, target } = setup();
  input.setMode('directInput');
  keyboard(target, 'keydown', 'KeyE', 1500);
  input.advanceTo(500);
  input.advanceTo(490);
  expect(input.advanceTo(2000)).toBeUndefined();
  const finished = input.advanceTo(2016);
  expect(finished?.result.score.judgmentCounts).toMatchObject({ perfect: 1, miss: 2 });
  input.stop();
});

it('single-note offset -200ms에서 화면은 1500ms에 반복 1로 가지만 세션 0은 1700ms 정산 대기까지 이전 복사본에만 적용한다', () => {
  const preview = BASIC_TUTORIAL_EXPLICIT_PREVIEWS.find(preview => preview.id === 'single-note')!;
  const { input, playback, target, clock, onPatternFinished } = setup(preview);
  Object.assign(clock, { inputOffsetMs: -200 });
  input.setMode('directInput');
  expect(preview.loopMs).toBe(1500);

  for (const iteration of [0, 1]) {
    const startMs = iteration * 1500;
    for (const pressMs of [450, 950, 1450]) {
      keyboard(target, 'keydown', 'KeyE', clock.loopStartNow + startMs + pressMs);
      keyboard(target, 'keyup', 'KeyE', clock.loopStartNow + startMs + pressMs + 20);
      input.advanceTo(startMs + pressMs + 20);
    }
    // 경계 전에는 화면과 세션이 같아 현재 복사본 1의 세 탭이 모두 숨겨진다.
    expect(playback.renderSnapshot(1).items.slice(3, 6).map(item => item.state))
      .toEqual(['success', 'success', 'success']);
    for (const elapsedMs of [1500, 1600, 1700]) {
      input.advanceTo(startMs + elapsedMs);
      const screen = getExplicitTutorialInputTime(clock.loopStartNow + startMs + elapsedMs, clock.loopStartNow, preview.loopMs);
      expect(screen.iteration).toBe(iteration + 1);
      expect(input.sessionIteration).toBe(iteration);
      const snapshot = playback.renderSnapshot(1, input.sessionIteration - screen.iteration);
      expect(snapshot.items.map(item => item.state)).toEqual([
        'success', 'success', 'success',
        'pending', 'pending', 'pending',
        'pending', 'pending', 'pending',
      ]);
      expect(onPatternFinished).toHaveBeenCalledTimes(iteration);
    }
    input.advanceTo(startMs + 1716);
    expect(input.sessionIteration).toBe(iteration + 1);
    const settled = playback.renderSnapshot(1, input.sessionIteration - (iteration + 1));
    expect(settled.items.every(item => item.state === 'pending')).toBe(true);
    expect(settled.atMs).toBe(1516);
    expect(onPatternFinished).toHaveBeenCalledTimes(iteration + 1);
    expect(onPatternFinished.mock.calls[iteration][0].result.score.judgmentCounts).toMatchObject({ perfect: 3, miss: 0 });
  }
  input.stop();
});

it.each([
  { mode: 'directInput', inputOffsetMs: 0 },
  { mode: 'directInput', inputOffsetMs: 200 },
  { mode: 'demonstration', inputOffsetMs: -200 },
  { mode: 'demonstration', inputOffsetMs: 0 },
  { mode: 'demonstration', inputOffsetMs: 200 },
] as const)('$mode offset $inputOffsetMs ms에서 1500ms 경계를 정산하면 세션 1은 현재 복사본에만 적용한다', ({ mode, inputOffsetMs }) => {
  const preview = BASIC_TUTORIAL_EXPLICIT_PREVIEWS.find(preview => preview.id === 'single-note')!;
  const { input, playback, target, clock, onPatternFinished } = setup(preview);
  Object.assign(clock, { inputOffsetMs });
  input.setMode(mode);
  if (mode === 'directInput') {
    for (const noteMs of [250, 750, 1250]) {
      keyboard(target, 'keydown', 'KeyE', clock.loopStartNow + noteMs - inputOffsetMs);
      keyboard(target, 'keyup', 'KeyE', clock.loopStartNow + noteMs - inputOffsetMs + 20);
    }
  }
  input.advanceTo(1400);
  expect(input.sessionIteration).toBe(0);
  expect(playback.renderSnapshot(1, 0).items.map(item => item.state)).toEqual([
    'pending', 'pending', 'pending',
    'success', 'success', 'success',
    'pending', 'pending', 'pending',
  ]);
  input.advanceTo(1500);
  // 시연은 경계에서 즉시, 직접 입력은 기존대로 다음 프레임에 정산한다.
  expect(onPatternFinished).toHaveBeenCalledTimes(mode === 'demonstration' ? 1 : 0);
  input.advanceTo(1516);
  expect(input.sessionIteration).toBe(1);
  expect(playback.renderSnapshot(1, 0).items.every(item => item.state === 'pending')).toBe(true);
  expect(onPatternFinished).toHaveBeenCalledTimes(1);
  expect(onPatternFinished.mock.calls[0][0].result.score.judgmentCounts).toMatchObject({ perfect: 3, miss: 0 });

  if (mode === 'directInput') keyboard(target, 'keydown', 'KeyE', clock.loopStartNow + 1750 - inputOffsetMs);
  input.advanceTo(1750);
  expect(playback.renderSnapshot(1, input.sessionIteration - 1).items.map(item => item.state)).toEqual([
    'pending', 'pending', 'pending',
    'success', 'pending', 'pending',
    'pending', 'pending', 'pending',
  ]);
  input.stop();
});

it.each([
  { elapsedMs: 2015, diagramStartMs: 0 },
  { elapsedMs: 2700, diagramStartMs: 200 },
  { elapsedMs: 6700, diagramStartMs: 200 },
])('2000ms 경계를 넘은 $elapsedMs ms 프레임에 도식이 시작되면 다음 프레임에 Perfect 1·Miss 2로 한 번 정산하고 $diagramStartMs ms에서 멈춤', ({ elapsedMs, diagramStartMs }) => {
  const { input, playback, target, clock, onPatternFinished } = setup();
  input.setMode('directInput');
  input.advanceTo(1400);
  // 프레임 전 수집한 이전 패턴의 1500ms 입력은 새 도식을 걸어도 버리지 않는다.
  keyboard(target, 'keydown', 'KeyE', 2500);
  const diagramHeldBeforeFrame = clock.blocked;
  clock.blocked = true;
  expect(input.advanceTo(elapsedMs, { loopTimeMs: diagramStartMs, blocked: diagramHeldBeforeFrame })).toBeUndefined();
  const finished = input.advanceTo(elapsedMs + 16, { loopTimeMs: diagramStartMs, blocked: true });
  expect(finished?.iteration).toBe(0);
  expect(finished?.result.score.judgmentCounts).toMatchObject({ perfect: 1, miss: 2 });
  expect(onPatternFinished).toHaveBeenCalledExactlyOnceWith(finished);
  expect(playback.renderSnapshot(0).atMs).toBe(diagramStartMs);
  for (const heldElapsedMs of [elapsedMs + 2000, elapsedMs + 6000]) {
    expect(input.advanceTo(heldElapsedMs, { loopTimeMs: diagramStartMs, blocked: clock.blocked })).toBeUndefined();
    expect(onPatternFinished).toHaveBeenCalledTimes(1);
    expect(playback.renderSnapshot(0).atMs).toBe(diagramStartMs);
  }
  input.stop();
});

it('KeyE hold 중 설정 캡처가 소유권을 가져가면 up 1510ms로 held를 비우고 down 2000ms는 설정에만 전달', () => {
  let ownsKeyboardInput = true;
  const { input, target, effects } = setup(undefined, 'KeyE', () => ownsKeyboardInput);
  input.setMode('directInput');
  keyboard(target, 'keydown', 'KeyE', 1500);
  input.advanceTo(500);
  expect(input.heldKeys).toEqual([{ lane: 2, key: 'KeyE' }]);
  effects.recordFlightJudgment.mockClear();
  ownsKeyboardInput = false;
  const capture = vi.fn();
  target.addEventListener('keydown', capture);
  expect(keyboard(target, 'keyup', 'KeyE', 1510).defaultPrevented).toBe(false);
  expect(input.heldKeys).toEqual([]);
  expect(keyboard(target, 'keydown', 'KeyE', 2000).defaultPrevented).toBe(false);
  input.advanceTo(1000);
  expect(capture).toHaveBeenCalledTimes(1);
  expect(input.heldKeys).toEqual([]);
  expect(effects.recordFlightJudgment).not.toHaveBeenCalled();
  ownsKeyboardInput = true;
  keyboard(target, 'keydown', 'KeyE', 2001);
  input.advanceTo(1001);
  expect(effects.recordFlightJudgment).toHaveBeenCalledExactlyOnceWith('perfect');
  input.stop();
});

it('첫 프레임부터 도식 대기이면 2500·6500·10500ms 프레임과 그 사이 KeyE 입력에도 정산 0회·Perfect 0', () => {
  const { input, playback, target, effects, clock, onPatternFinished } = setup();
  input.setMode('directInput');
  clock.blocked = true;
  for (const elapsedMs of [2500, 6500, 10500]) {
    keyboard(target, 'keydown', 'KeyE', clock.loopStartNow + elapsedMs);
    keyboard(target, 'keyup', 'KeyE', clock.loopStartNow + elapsedMs + 10);
    expect(input.advanceTo(elapsedMs, { loopTimeMs: 0, blocked: true })).toBeUndefined();
  }
  expect(playback.renderSnapshot(0).atMs).toBe(0);
  expect(onPatternFinished).not.toHaveBeenCalled();
  expect(effects.recordFlightJudgment).not.toHaveBeenCalled();
  input.stop();
});

it('경계 전 700ms 프레임에서 200ms 도식이 시작되면 시연의 500ms 탭을 미리 판정하지 않음', () => {
  const { input, playback, effects, clock, onPatternFinished } = setup();
  input.advanceTo(100);
  clock.blocked = true;
  expect(input.advanceTo(700, { loopTimeMs: 200, blocked: false })).toBeUndefined();
  expect(playback.renderSnapshot(0).atMs).toBe(200);
  expect(effects.recordFlightJudgment).not.toHaveBeenCalled();
  expect(onPatternFinished).not.toHaveBeenCalled();
  input.stop();
});

it.each(['demonstration', 'directInput'] as const)('%s에서 2700ms 경계·도식 진입 정산 뒤 OK로 400ms에 rebase하면 결과 차수는 0→1이고 다음 패턴의 500ms 탭도 판정', mode => {
  const { input, playback, target, clock, onPatternFinished } = setup();
  input.setMode(mode);
  input.advanceTo(1900);
  clock.blocked = true;
  let finished = input.advanceTo(2700, { loopTimeMs: 200, blocked: false });
  if (mode === 'directInput') finished = input.advanceTo(2716, { loopTimeMs: 200, blocked: true });
  expect(finished?.iteration).toBe(0);
  expect(finished?.result.score.judgmentCounts).toMatchObject({
    perfect: mode === 'demonstration' ? 3 : 0,
    miss: mode === 'demonstration' ? 0 : 3,
  });
  expect(playback.renderSnapshot(0).atMs).toBe(200);
  // 다음 rAF 전에 키를 눌렀다가 OK를 눌러도 도식 중 입력은 점수가 되지 않는다.
  keyboard(target, 'keydown', 'KeyE', 5500);
  keyboard(target, 'keyup', 'KeyE', 5510);
  clock.loopStartNow = 6000 - 400;
  expect(input.sessionIteration).toBe(1);
  input.rebase(6000);
  expect(input.sessionIteration).toBe(0);
  clock.blocked = false;
  expect(input.advanceTo(400)).toBeUndefined();
  expect(playback.renderSnapshot(0).atMs).toBe(400);
  expect(onPatternFinished).toHaveBeenCalledExactlyOnceWith(finished);
  keyboard(target, 'keydown', 'KeyE', 6100);
  input.advanceTo(500);
  const nextFinished = input.advanceTo(2000) ?? input.advanceTo(2016);
  expect(nextFinished?.iteration).toBe(1);
  expect(nextFinished?.result.score.judgmentCounts).toMatchObject({
    perfect: mode === 'demonstration' ? 3 : 1,
    miss: mode === 'demonstration' ? 0 : 2,
  });
  expect(onPatternFinished.mock.calls.map(([pattern]) => pattern.iteration)).toEqual([0, 1]);
  input.stop();
});


it('KeyE를 1900ms부터 유지하고 다음 반복 700ms에 뗄 예정이면 경계 뒤 500ms 틱은 preheld로 Perfect 1', () => {
  const base = tutorialExplicitPlayerPreviews[0].preview;
  const preview = createExplicitTutorialPreview('preheld', '유지', [], 4, { ...base.chart, notes: [
    { type: 'body', lane: 2, holdCount: 1, beat: beat(0), endBeat: beat(2) },
    { type: 'tick', lane: 2, count: 1, beat: beat(1) },
  ] });
  const { input, target, effects } = setup(preview);
  input.setMode('directInput');
  input.advanceTo(1800);
  keyboard(target, 'keydown', 'KeyE', 2900);
  keyboard(target, 'keyup', 'KeyE', 3700);
  expect(input.heldKeys).toEqual([]); // 실제 키는 이미 뗐지만 아직 다음 반복 700ms의 up을 전달하면 안 된다.
  input.advanceTo(2500);
  input.advanceTo(2516);
  expect(effects.recordFlightJudgment.mock.calls.filter(([grade]) => grade === 'perfect')).toHaveLength(1);
  input.advanceTo(2800);
  input.stop();
});

it('바디 유지 중 1000ms에 시연으로 바꾸면 keyup 점수 없이 2000ms 자동 입력을 처리하고 전환·다음 시연 패턴은 성공 0회다', () => {
  const preview = createExplicitTutorialPreview('switch-mid-body', '바디 도중 전환', [], 6, {
    ...tutorialExplicitPlayerPreviews[0].preview.chart,
    notes: [
      { type: 'tap', kind: 'single', lane: 2, beat: beat(1) },
      { type: 'body', lane: 2, holdCount: 1, beat: beat(1), endBeat: beat(3) },
      { type: 'release', lane: 2, count: 1, beat: beat(3) },
      { type: 'tap', kind: 'single', lane: 2, beat: beat(4) },
    ],
    events: [
      { type: 'bpm', beat: beat(0), bpm: 120 },
      { type: 'tutorialInput', lane: 2, keyCode: 'KeyE', keyLabel: 'E',
        beat: beat(1), endBeat: beat(3), editorLane: 3 },
      { type: 'tutorialInput', lane: 2, keyCode: 'KeyD', keyLabel: 'D',
        beat: beat(4), endBeat: beat(9, 2), editorLane: 4 },
    ],
  });
  let state = createTutorialPracticeState(createTutorialPracticeSpec({
    conditions: [{ kind: 'maxGreatOrWorseCount', count: 1 }], playingMethods: [{ id: 'default' }],
  }));
  state = reduceTutorialPractice(state, { type: 'modeSelected', mode: 'directInput' });
  state = reduceTutorialPractice(state, { type: 'patternStarted', patternId: 0 });
  const onScoreChanged = vi.fn();
  const playback = createExplicitTutorialPreviewPlayback(preview,
    createTutorialTimingsInputPlan(getTutorialInputTimings(preview.chart)), {
      showJudgmentGroup() {}, recordFlightJudgment() {}, showBombEffect() {},
    }, { onScoreChanged });
  const finished = vi.fn((pattern: ExplicitTutorialPatternResult) => {
    state = reduceTutorialPractice(state, { type: 'patternFinished', patternId: pattern.iteration, score: pattern.result.score });
    state = reduceTutorialPractice(state, { type: 'patternStarted', patternId: pattern.iteration + 1 });
  });
  const input = createExplicitTutorialInput(playback, [{ lane: 2, key: 'KeyE' }], preview.loopMs,
    () => ({ loopStartNow: 0, blocked: false }), finished);
  const target = new EventTarget();
  input.attach(target);
  input.setMode(state.mode);
  keyboard(target, 'keydown', 'KeyE', 500);
  input.advanceTo(1000);
  expect(input.heldKeys).toEqual([{ lane: 2, key: 'KeyE' }]);
  expect(playback.renderSnapshot(0).bodyUnits[0].state).toBe('active');
  state = reduceTutorialPractice(state, { type: 'modeSelected', mode: 'demonstration' });
  expect(() => input.setMode(state.mode)).not.toThrow();
  expect(playback.renderSnapshot(0).atMs).toBe(1000);
  expect(state.currentPatternCountable).toBe(false);
  input.advanceTo(1490);
  expect(onScoreChanged.mock.lastCall?.[0].judgmentCounts.perfect).toBe(1);
  onScoreChanged.mockClear();
  keyboard(target, 'keyup', 'KeyE', 1490);
  input.advanceTo(1490);
  expect(input.heldKeys).toEqual([]);
  expect(onScoreChanged).not.toHaveBeenCalled();
  input.advanceTo(2000);
  expect(playback.renderSnapshot(0).items[2]).toMatchObject({ state: 'success', grade: 'perfect' });
  input.advanceTo(3000);
  expect(finished).toHaveBeenCalledTimes(1);
  expect(state.lastFinishedPattern).toMatchObject({ patternId: 0, countable: false, succeeded: true });
  expect(state.successCount).toBe(0);
  input.advanceTo(6000);
  expect(finished).toHaveBeenCalledTimes(2);
  expect(finished.mock.calls[1][0].result.score.judgmentCounts).toMatchObject({ perfect: 3, miss: 0 });
  expect(state.lastFinishedPattern).toMatchObject({ patternId: 1, countable: false, succeeded: true });
  expect(state.successCount).toBe(0);
  input.stop();
});

it('직접 입력의 반복 0은 Miss 3이고 경계에서 시연으로 전환한 반복 1은 Perfect 3', () => {
  const { input } = setup();
  input.setMode('directInput');
  expect(input.advanceTo(2000)).toBeUndefined();
  expect(input.advanceTo(2016)?.result.score.judgmentCounts).toMatchObject({ perfect: 0, miss: 3 });
  input.setMode('demonstration');
  expect(input.advanceTo(4000)?.result.score.judgmentCounts).toMatchObject({ perfect: 3, miss: 0 });
  input.stop();
});

it('400ms에 멈춘 뒤 2400ms에 재개하면 늦게 도착한 pause 중 event 2399ms는 탭 점수 없이 hold만 동기화', () => {
  const { input, target, effects, clock } = setup();
  input.setMode('directInput');
  input.advanceTo(400);
  clock.blocked = true;
  input.advanceTo(400);
  clock.loopStartNow = 2000;
  clock.blocked = false;
  input.advanceTo(400);
  keyboard(target, 'keydown', 'KeyE', 2399);
  input.advanceTo(500);
  expect(effects.recordFlightJudgment).not.toHaveBeenCalled();
  expect(input.heldKeys).toEqual([{ lane: 2, key: 'KeyE' }]);
  input.stop();
});

it.each([false, true])('도식 OK 6000ms로 400ms에 재개한 뒤 프레임 진행=%s이면 늦은 down 5999ms는 Perfect·Great·Good 0회', advanceBeforeInput => {
  const { input, target, effects, clock } = setup();
  input.setMode('directInput');
  input.advanceTo(200);
  clock.blocked = true;
  input.syncJudging();
  clock.loopStartNow = 5600;
  input.rebase(6000);
  clock.blocked = false;
  if (advanceBeforeInput) input.advanceTo(400);
  keyboard(target, 'keydown', 'KeyE', 5999);
  input.advanceTo(500);
  expect(effects.recordFlightJudgment).not.toHaveBeenCalled();
  expect(input.heldKeys).toEqual([{ lane: 2, key: 'KeyE' }]);
  input.stop();
});

it('paused 중 KeyE down 1500ms·up 1510ms는 상위 핸들러에 2회 전달하고 held 0개·판정 0회', () => {
  const { input, target, effects, clock } = setup();
  input.setMode('directInput');
  clock.blocked = true;
  const navigate = vi.fn();
  target.addEventListener('keydown', navigate);
  target.addEventListener('keyup', navigate);
  expect(keyboard(target, 'keydown', 'KeyE', 1500).defaultPrevented).toBe(false);
  expect(input.heldKeys).toEqual([{ lane: 2, key: 'KeyE' }]);
  expect(keyboard(target, 'keyup', 'KeyE', 1510).defaultPrevented).toBe(false);
  input.advanceTo(510);
  expect(navigate).toHaveBeenCalledTimes(2);
  expect(input.heldKeys).toEqual([]);
  expect(effects.recordFlightJudgment).not.toHaveBeenCalled();
  input.stop();
});

it.each(['INPUT', 'TEXTAREA', 'SELECT'])('%s에서 KeyE를 1500ms에 입력하면 기본 동작을 허용하고 held 0개·판정 0회', tagName => {
  const { input, target, effects } = setup();
  // Node EventTarget에 브라우저 이벤트 대상의 요소 속성을 부여한다.
  Object.assign(target, { tagName });
  input.setMode('directInput');
  const navigate = vi.fn();
  target.addEventListener('keydown', navigate);
  expect(keyboard(target, 'keydown', 'KeyE', 1500).defaultPrevented).toBe(false);
  input.advanceTo(500);
  expect(navigate).toHaveBeenCalledTimes(1);
  expect(input.heldKeys).toEqual([]);
  expect(effects.recordFlightJudgment).not.toHaveBeenCalled();
  input.stop();
});

it.each([
  { name: 'contenteditable 자식', code: 'KeyE', properties: { tagName: 'SPAN', isContentEditable: true } },
  { name: 'button', code: 'Space', properties: { tagName: 'BUTTON' } },
  { name: 'button 자식', code: 'Enter', properties: { tagName: 'SPAN', parentElement: { tagName: 'BUTTON' } } },
  { name: 'switch', code: 'Space', properties: { tagName: 'DIV', getAttribute: () => 'switch' } },
  { name: 'tab', code: 'ArrowRight', properties: { tagName: 'DIV', getAttribute: () => 'tab' } },
  { name: 'checkbox input', code: 'Space', properties: { tagName: 'INPUT', type: 'checkbox' } },
  { name: 'text input', code: 'KeyE', properties: { tagName: 'INPUT', type: 'text' } },
])('$name에서 바인딩된 $code를 1500ms에 누르면 기본 동작 허용·held 0개·판정 0회', ({ code, properties }) => {
  const { input, target, effects } = setup(undefined, code);
  Object.assign(target, properties);
  input.setMode('directInput');
  expect(keyboard(target, 'keydown', code, 1500).defaultPrevented).toBe(false);
  expect(keyboard(target, 'keyup', code, 1510).defaultPrevented).toBe(false);
  input.advanceTo(510);
  expect(input.heldKeys).toEqual([]);
  expect(effects.recordFlightJudgment).not.toHaveBeenCalled();
  input.stop();
});

it('직접 입력 스위치(checkbox input)에 포커스가 남아 있어도 바인딩된 KeyE를 1500ms에 누르면 예약·수집해 held 1개', () => {
  const { input, target } = setup(undefined, 'KeyE');
  Object.assign(target, { tagName: 'INPUT', type: 'checkbox' });
  input.setMode('directInput');
  expect(keyboard(target, 'keydown', 'KeyE', 1500).defaultPrevented).toBe(true);
  input.advanceTo(500);
  expect(input.heldKeys).toHaveLength(1);
  input.stop();
});

it('프레임 전 KeyE down 1500ms 뒤 input에서 up 1510ms가 오면 탭만 Perfect 1이고 1800ms 틱은 Perfect가 아님', () => {
  const base = tutorialExplicitPlayerPreviews[0].preview;
  const preview = createExplicitTutorialPreview('focus-release', '포커스 이동', [], 4, { ...base.chart, notes: [
    { type: 'tap', kind: 'single', lane: 2, beat: beat(1) },
    { type: 'body', lane: 2, holdCount: 1, beat: beat(1), endBeat: beat(2) },
    { type: 'tick', lane: 2, count: 1, beat: beat(8, 5) },
    { type: 'release', lane: 2, count: 1, beat: beat(2) },
  ] });
  const { input, target, effects } = setup(preview);
  input.setMode('directInput');
  keyboard(target, 'keydown', 'KeyE', 1500);
  Object.assign(target, { tagName: 'INPUT' });
  expect(keyboard(target, 'keyup', 'KeyE', 1510).defaultPrevented).toBe(false);
  input.advanceTo(1000);
  expect(input.heldKeys).toEqual([]);
  expect(effects.recordFlightJudgment.mock.calls.filter(([grade]) => grade === 'perfect')).toHaveLength(1);
  input.stop();
});

it('2000ms 경계 정산 대기 중 pause에서 down 3500ms가 오면 재개한 다음 패턴의 500ms 탭을 판정하지 않음', () => {
  const { input, target, effects, clock } = setup();
  input.setMode('directInput');
  input.advanceTo(2000);
  effects.recordFlightJudgment.mockClear();
  clock.blocked = true;
  keyboard(target, 'keydown', 'KeyE', 3500);
  clock.loopStartNow = 2000;
  clock.blocked = false;
  input.advanceTo(2016);
  input.advanceTo(2500);
  expect(effects.recordFlightJudgment).not.toHaveBeenCalled();
  expect(input.heldKeys).toEqual([{ lane: 2, key: 'KeyE' }]);
  input.stop();
});

it('도식 OK 6000ms로 400ms에 재개한 뒤 늦은 up 5999ms는 held만 비우고 500ms release의 성공 판정은 0회', () => {
  const base = tutorialExplicitPlayerPreviews[0].preview;
  const preview = createExplicitTutorialPreview('resume-release', '재개 릴리즈', [], 4, { ...base.chart, notes: [
    { type: 'body', lane: 2, holdCount: 1, beat: beat(0), endBeat: beat(1) },
    { type: 'release', lane: 2, count: 1, beat: beat(1) },
  ] });
  const { input, target, effects, clock } = setup(preview);
  input.setMode('directInput');
  keyboard(target, 'keydown', 'KeyE', 1000);
  input.advanceTo(200);
  clock.blocked = true;
  input.syncJudging();
  clock.loopStartNow = 5600;
  input.rebase(6000);
  clock.blocked = false;
  keyboard(target, 'keyup', 'KeyE', 5999);
  input.advanceTo(500);
  expect(input.heldKeys).toEqual([]);
  expect(effects.recordFlightJudgment.mock.calls.filter(([grade]) => grade !== 'miss')).toEqual([]);
  input.stop();
});

it('Escape가 2레인에 바인딩돼도 down 1500ms·up 1510ms는 닫기로 전달하고 held 0개·판정 0회', () => {
  const { input, target, effects } = setup(undefined, 'Escape');
  input.setMode('directInput');
  const close = vi.fn();
  target.addEventListener('keydown', close);
  expect(keyboard(target, 'keydown', 'Escape', 1500).defaultPrevented).toBe(false);
  expect(keyboard(target, 'keyup', 'Escape', 1510).defaultPrevented).toBe(false);
  input.advanceTo(510);
  expect(close).toHaveBeenCalledTimes(1);
  expect(input.heldKeys).toEqual([]);
  expect(effects.recordFlightJudgment).not.toHaveBeenCalled();
  input.stop();
});

it('button에 포커스가 있어도 동작 키가 아닌 KeyE 1500ms는 레인 입력으로 받아 Perfect 1', () => {
  const { input, target, effects } = setup();
  Object.assign(target, { tagName: 'BUTTON' });
  input.setMode('directInput');
  expect(keyboard(target, 'keydown', 'KeyE', 1500).defaultPrevented).toBe(true);
  input.advanceTo(500);
  expect(effects.recordFlightJudgment).toHaveBeenCalledExactlyOnceWith('perfect');
  input.stop();
});

it('2016ms에 경계 정산까지 마친 뒤 옛 timestamp 3000ms down이 오면 다음 패턴 0ms 탭은 판정하지 않음', () => {
  const base = tutorialExplicitPlayerPreviews[0].preview;
  const preview = createExplicitTutorialPreview('stale-boundary', '지난 경계 입력', [], 4, { ...base.chart, notes: [
    { type: 'tap', kind: 'single', lane: 2, beat: beat(0) },
  ] });
  const { input, target, effects } = setup(preview);
  input.setMode('directInput');
  input.advanceTo(2000);
  input.advanceTo(2016);
  effects.recordFlightJudgment.mockClear();
  keyboard(target, 'keydown', 'KeyE', 3000);
  input.advanceTo(2032);
  expect(effects.recordFlightJudgment).not.toHaveBeenCalled();
  expect(input.heldKeys).toEqual([{ lane: 2, key: 'KeyE' }]);
  input.stop();
});


it.each([
  { inputOffsetMs: -200, pressMs: 450 },
  { inputOffsetMs: 200, pressMs: 50 },
])('직접 입력 offset $inputOffsetMs ms에서 매 프레임 진행하며 실제 $pressMs ms에 누르면 250ms 탭은 Perfect 1·Miss 0', ({ inputOffsetMs, pressMs }) => {
  const preview = createExplicitTutorialPreview('offset-tap', '입력 보정', [], 4, {
    ...tutorialExplicitPlayerPreviews[0].preview.chart,
    notes: [{ type: 'tap', kind: 'single', lane: 2, beat: beat(1, 2) }],
  });
  const { input, target, clock, effects } = setup(preview);
  Object.assign(clock, { inputOffsetMs });
  input.setMode('directInput');
  for (let elapsedMs = 0; elapsedMs < pressMs; elapsedMs += 16) input.advanceTo(elapsedMs);
  keyboard(target, 'keydown', 'KeyE', clock.loopStartNow + pressMs);
  input.advanceTo(pressMs);
  input.advanceTo(500);
  expect(effects.recordFlightJudgment).toHaveBeenCalledExactlyOnceWith('perfect');
  input.stop();
});

it.each([
  { inputOffsetMs: -200, releaseMs: 2199, boundaryMs: 2200 },
  { inputOffsetMs: -200, releaseMs: 2200, boundaryMs: 2200 },
  { inputOffsetMs: 200, releaseMs: 1799, boundaryMs: 2000 },
  { inputOffsetMs: 200, releaseMs: 1800, boundaryMs: 2000 },
])('offset $inputOffsetMs ms에서 실제 $releaseMs ms에 떼면 $boundaryMs ms 경계 +120ms에 Perfect 2·Miss 0으로 정산한다', ({ inputOffsetMs, releaseMs, boundaryMs }) => {
  const preview = createExplicitTutorialPreview('offset-boundary', '경계 입력 보정', [], 4, {
    ...tutorialExplicitPlayerPreviews[0].preview.chart,
    notes: [
      { type: 'tap', kind: 'single', lane: 2, beat: beat(1) },
      { type: 'body', lane: 2, holdCount: 1, beat: beat(1), endBeat: beat(4) },
      { type: 'release', lane: 2, count: 1, beat: beat(4) },
    ],
  });
  const { input, target, clock, onPatternFinished } = setup(preview);
  Object.assign(clock, { inputOffsetMs });
  input.setMode('directInput');
  const pressMs = 500 - inputOffsetMs;
  keyboard(target, 'keydown', 'KeyE', clock.loopStartNow + pressMs);
  for (let elapsedMs = pressMs; elapsedMs < releaseMs; elapsedMs += 16) input.advanceTo(elapsedMs);
  expect(onPatternFinished).not.toHaveBeenCalled();
  keyboard(target, 'keyup', 'KeyE', clock.loopStartNow + releaseMs);
  input.advanceTo(releaseMs);
  input.advanceTo(boundaryMs - 1);
  expect(onPatternFinished).not.toHaveBeenCalled();
  input.advanceTo(boundaryMs);
  expect(onPatternFinished).not.toHaveBeenCalled();
  input.advanceTo(boundaryMs + 16);
  expect(onPatternFinished).not.toHaveBeenCalled();
  input.advanceTo(boundaryMs + 120);
  expect(onPatternFinished).toHaveBeenCalledTimes(1);
  expect(onPatternFinished.mock.calls[0][0].result.score.judgmentCounts).toMatchObject({ perfect: 2, miss: 0 });
  expect(input.heldKeys).toEqual([]);
  input.stop();
});

it.each([-200, 200])('시연 offset %i ms여도 자동 입력은 Perfect 3·Miss 0', inputOffsetMs => {
  const { input, clock } = setup();
  Object.assign(clock, { inputOffsetMs });
  const finished = input.advanceTo(2000);
  expect(finished?.result.score.judgmentCounts).toMatchObject({ perfect: 3, miss: 0 });
  input.stop();
});

it('offset -200ms에서 600ms 시연 후 직접 입력으로 바꾸면 되감지 않고 반복 0을 Perfect 1·Miss 2로 정산한다', () => {
  const { input, clock } = setup();
  Object.assign(clock, { inputOffsetMs: -200 });
  input.advanceTo(600);
  input.setMode('directInput');
  input.advanceTo(616);
  input.advanceTo(2200);
  const finished = input.advanceTo(2216);
  expect(finished?.iteration).toBe(0);
  expect(finished?.result.score.judgmentCounts).toMatchObject({ perfect: 1, miss: 2 });
  input.stop();
});

it('완료 콜백이 false를 반환하면 다음 패턴의 0ms 탭도 시작하지 않고 시연 선택 후에만 재개한다', () => {
  const preview = createExplicitTutorialPreview('start-tap', '시작 탭', [], 4, {
    ...tutorialExplicitPlayerPreviews[0].preview.chart,
    notes: [{ type: 'tap', kind: 'single', lane: 2, beat: beat(0) }],
    events: [{ type: 'bpm', beat: beat(0), bpm: 120 }],
  });
  const effects = { showJudgmentGroup: vi.fn(), recordFlightJudgment: vi.fn(), showBombEffect: vi.fn() };
  const playback = createExplicitTutorialPreviewPlayback(preview, { kind: 'auto' }, effects);
  const finish = vi.fn(() => false as const);
  const input = createExplicitTutorialInput(playback, [], 2000, () => ({ loopStartNow: 1000, blocked: false }), finish);
  input.advanceTo(0);
  input.advanceTo(2001);
  input.advanceTo(6001);
  expect(finish).toHaveBeenCalledTimes(1);
  expect(effects.recordFlightJudgment).toHaveBeenCalledExactlyOnceWith('perfect');
  input.setMode('directInput');
  input.setMode('demonstration');
  input.advanceTo(2002);
  expect(effects.recordFlightJudgment).toHaveBeenCalledTimes(2);
  input.stop();
});

it('직접 입력 반복을 끝내면 다음 0ms 탭도 시연 없이 직접 입력을 기다려 Miss 2개로 정산한다', () => {
  const preview = createExplicitTutorialPreview('start-tap', '시작 탭', [], 4, {
    ...tutorialExplicitPlayerPreviews[0].preview.chart,
    notes: [{ type: 'tap', kind: 'single', lane: 2, beat: beat(0) }],
    events: [{ type: 'bpm', beat: beat(0), bpm: 120 }],
  });
  const effects = { showJudgmentGroup: vi.fn(), recordFlightJudgment: vi.fn(), showBombEffect: vi.fn() };
  const playback = createExplicitTutorialPreviewPlayback(preview, { kind: 'auto' }, effects);
  const input = createExplicitTutorialInput(playback, [], 2000, () => ({ loopStartNow: 1000, blocked: false }));
  input.setMode('directInput');
  input.advanceTo(2000);
  input.advanceTo(2016);
  expect(effects.recordFlightJudgment.mock.calls.map(([grade]) => grade)).toEqual(['miss']);
  input.advanceTo(4000);
  input.advanceTo(4016);
  expect(effects.recordFlightJudgment.mock.calls.map(([grade]) => grade)).toEqual(['miss', 'miss']);
  input.stop();
});

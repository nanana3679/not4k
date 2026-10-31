import { createExplicitTutorialInput } from './explicitTutorialInput';
import { createExplicitTutorialPreviewPlayback, createTutorialTimingsInputPlan } from './explicitTutorialPreviewPlayback';
import { tutorialExplicitPlayerPreviews } from '../../../lab/tutorialExplicitPlayerPreviews';
import { getTutorialInputTimings } from './tutorialPreviewChart';

import { beat } from '../../../shared/types/beat';
import { createExplicitTutorialPreview } from './explicitTutorialPreviewChart';
import { describe, expect, it, vi } from 'vitest';
import { getExplicitTutorialInputTime } from './explicitTutorialInput';

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

function setup(preview = tutorialExplicitPlayerPreviews[0].preview) {
  const effects = { showJudgmentGroup: vi.fn(), recordFlightJudgment: vi.fn(), showBombEffect: vi.fn() };
  const playback = createExplicitTutorialPreviewPlayback(preview,
    createTutorialTimingsInputPlan(getTutorialInputTimings(preview.chart)), effects);
  const clock = { loopStartNow: 1000, blocked: false };
  const onPatternFinished = vi.fn();
  const input = createExplicitTutorialInput(playback, [{ lane: 2, key: 'KeyE' }], preview.loopMs, () => clock, onPatternFinished);
  const target = new EventTarget();
  input.attach(target);
  return { input, playback, target, effects, clock, onPatternFinished };
}

it('직접 입력에서 첫 프레임 전 event 3500ms를 받아도 이전 반복은 Miss 3이고 다음 반복 500ms 탭만 Perfect 1', () => {
  const { input, target, effects } = setup();
  input.setMode('directInput');
  input.advanceTo(1900);
  keyboard(target, 'keydown', 'KeyE', 3500);
  const finished = input.advanceTo(2500);
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
  const finished = input.advanceTo(2000);
  expect(finished?.result.score.judgmentCounts).toMatchObject({ perfect: 1, miss: 2 });
  input.stop();
});

it.each([
  { elapsedMs: 2015, diagramStartMs: 0 },
  { elapsedMs: 2700, diagramStartMs: 200 },
  { elapsedMs: 6700, diagramStartMs: 200 },
])('2000ms 경계를 넘은 $elapsedMs ms 프레임에 도식이 시작되면 이전 패턴만 Perfect 1·Miss 2로 한 번 정산하고 $diagramStartMs ms에서 멈춤', ({ elapsedMs, diagramStartMs }) => {
  const { input, playback, target, clock, onPatternFinished } = setup();
  input.setMode('directInput');
  input.advanceTo(1400);
  // 프레임 전 수집한 이전 패턴의 1500ms 입력은 새 도식을 걸어도 버리지 않는다.
  keyboard(target, 'keydown', 'KeyE', 2500);
  const diagramHeldBeforeFrame = clock.blocked;
  clock.blocked = true;
  const finished = input.advanceTo(elapsedMs, { loopTimeMs: diagramStartMs, blocked: diagramHeldBeforeFrame });
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

it.each(['demonstration', 'directInput'] as const)('%s에서 2700ms 경계·도식 진입 뒤 즉시 OK로 400ms에 rebase하면 결과 차수는 0→1이고 다음 패턴의 500ms 탭도 판정', mode => {
  const { input, playback, target, clock, onPatternFinished } = setup();
  input.setMode(mode);
  input.advanceTo(1900);
  clock.blocked = true;
  const finished = input.advanceTo(2700, { loopTimeMs: 200, blocked: false });
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
  input.rebase();
  clock.blocked = false;
  expect(input.advanceTo(400)).toBeUndefined();
  expect(playback.renderSnapshot(0).atMs).toBe(400);
  expect(onPatternFinished).toHaveBeenCalledExactlyOnceWith(finished);
  keyboard(target, 'keydown', 'KeyE', 6100);
  input.advanceTo(500);
  const nextFinished = input.advanceTo(2000);
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
  expect(effects.recordFlightJudgment.mock.calls.filter(([grade]) => grade === 'perfect')).toHaveLength(1);
  input.advanceTo(2800);
  input.stop();
});

it('직접 입력의 반복 0은 Miss 3이고 경계에서 시연으로 전환한 반복 1은 Perfect 3', () => {
  const { input } = setup();
  input.setMode('directInput');
  expect(input.advanceTo(2000)?.result.score.judgmentCounts).toMatchObject({ perfect: 0, miss: 3 });
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

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
  const input = createExplicitTutorialInput(playback, [{ lane: 2, key: 'KeyE' }], preview.loopMs, () => clock);
  const target = new EventTarget();
  input.attach(target);
  return { input, playback, target, effects, clock };
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

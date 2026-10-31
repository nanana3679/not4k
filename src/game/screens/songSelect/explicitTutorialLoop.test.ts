import { describe, expect, it } from 'vitest';
import { stepExplicitTutorialLoop } from './explicitTutorialLoop';
import { stepTutorialLoopClock } from './tutorialLoopClock';

describe('명시 튜토리얼 반복 경계', () => {
  it('2000ms 반복에서 1000→3100ms로 건너뛰면 반복 내 시각이 1100ms여도 0번 반복을 끝내고 1번으로 이동', () => {
    const first = stepExplicitTutorialLoop({ elapsedMs: 1000, loopMs: 2000, previousIteration: 0, frozen: false });
    expect(first).toEqual({ iteration: 0, finished: false });
    expect(stepExplicitTutorialLoop({ elapsedMs: 3100, loopMs: 2000, previousIteration: first.iteration, frozen: false }))
      .toEqual({ iteration: 1, finished: true });
  });

  it('2000ms 반복의 1번 반복을 도식에서 멈추면 경과 시간이 10100ms여도 정산하지 않고 1번을 유지', () => {
    expect(stepExplicitTutorialLoop({ elapsedMs: 10100, loopMs: 2000, previousIteration: 1, frozen: true }))
      .toEqual({ iteration: 1, finished: false });
  });

  it('2000ms 반복에서 1999→2000ms 경계를 지나면 1번으로 이동하고 2016ms에는 다시 정산하지 않음', () => {
    let previousIteration = 0;
    const frames = [1999, 2000, 2016].map(elapsedMs => {
      const frame = stepExplicitTutorialLoop({ elapsedMs, loopMs: 2000, previousIteration, frozen: false });
      previousIteration = frame.iteration;
      return frame;
    });
    expect(frames).toEqual([
      { iteration: 0, finished: false },
      { iteration: 1, finished: true },
      { iteration: 1, finished: false },
    ]);
  });

  it('1000→10100ms로 5개 반복을 건너뛰면 한 번만 정산하고 10116·11999ms 프레임에는 정산하지 않음', () => {
    let previousIteration = 0;
    const frames = [1000, 10100, 10116, 11999].map(elapsedMs => {
      const frame = stepExplicitTutorialLoop({ elapsedMs, loopMs: 2000, previousIteration, frozen: false });
      previousIteration = frame.iteration;
      return frame;
    });
    expect(frames).toEqual([
      { iteration: 0, finished: false },
      { iteration: 5, finished: true },
      { iteration: 5, finished: false },
      { iteration: 5, finished: false },
    ]);
  });

  it('2000ms 반복을 1000ms에서 paused로 멈추고 10000ms에 재개하면 정산하지 않고 11000ms에 처음 정산', () => {
    let clock = { loopStartNow: 0, pausedAtNow: null as number | null, previousNow: 1000 };
    let previousIteration = 0;
    const frames = [[3100, true], [9000, true], [10000, false], [10999, false], [11000, false]] as const;
    const results = frames.map(([now, paused]) => {
      const step = stepTutorialLoopClock(clock, now, paused);
      clock = { ...step.next, previousNow: now };
      const frame = stepExplicitTutorialLoop({
        elapsedMs: now - clock.loopStartNow, loopMs: 2000, previousIteration, frozen: step.frozen,
      });
      previousIteration = frame.iteration;
      return frame;
    });
    expect(results).toEqual([
      { iteration: 0, finished: false },
      { iteration: 0, finished: false },
      { iteration: 0, finished: false },
      { iteration: 0, finished: false },
      { iteration: 1, finished: true },
    ]);
  });

  it('도식 OK가 10000ms에 끝 시점 500ms로 시계를 다시 잡으면 11500ms 경계에서 한 번 정산', () => {
    // 재생기의 OK는 loopStartNow = resumeNow - endMs로 바꾸고 비교할 차수도 0으로 돌린다.
    const loopStartNow = 10000 - 500;
    let previousIteration = 0;
    const frames = [10000, 11499, 11500, 11516].map(now => {
      const frame = stepExplicitTutorialLoop({
        elapsedMs: now - loopStartNow, loopMs: 2000, previousIteration, frozen: false,
      });
      previousIteration = frame.iteration;
      return frame;
    });
    expect(frames).toEqual([
      { iteration: 0, finished: false },
      { iteration: 0, finished: false },
      { iteration: 1, finished: true },
      { iteration: 1, finished: false },
    ]);
  });

  it('첫 rAF가 시작 시각보다 1ms 빠르면 차수는 0이고 2000ms까지 거짓 경계를 만들지 않음', () => {
    expect(stepExplicitTutorialLoop({ elapsedMs: -1, loopMs: 2000, previousIteration: 0, frozen: false }))
      .toEqual({ iteration: 0, finished: false });
  });
});

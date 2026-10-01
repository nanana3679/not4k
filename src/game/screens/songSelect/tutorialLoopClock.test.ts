import { describe, expect, it } from 'vitest';
import { resumeTutorialLoopStart, stepTutorialLoopClock } from './tutorialLoopClock';

describe('튜토리얼 재생 루프 시계', () => {
  it('10,000ms에 일시정지하고 13,000ms에 재개하면 루프 시작점이 3,000ms 뒤로 밀려 멈춘 루프 시간에서 이어진다', () => {
    const loopStartNow = 4_000;
    const resumed = resumeTutorialLoopStart(loopStartNow, 10_000, 13_000);
    expect(resumed).toBe(7_000);
    expect(13_000 - resumed).toBe(10_000 - loopStartNow);
  });

  it('멈추지 않은 프레임은 시계를 바꾸지 않고 frozen이 아니다', () => {
    const clock = { loopStartNow: 4_000, pausedAtNow: null, previousNow: 9_984 };
    expect(stepTutorialLoopClock(clock, 10_000, false)).toEqual({ next: clock, frozen: false });
  });

  it('9,984ms 프레임을 그린 뒤 10,000ms 프레임부터 멈추면 frozen이고 멈춘 시각은 마지막으로 그린 9,984ms로 남으며 previousNow만 매 프레임 지금 시각이 된다', () => {
    const first = stepTutorialLoopClock({ loopStartNow: 4_000, pausedAtNow: null, previousNow: 9_984 }, 10_000, true);
    expect(first).toEqual({ next: { loopStartNow: 4_000, pausedAtNow: 9_984, previousNow: 10_000 }, frozen: true });
    const later = stepTutorialLoopClock(first.next, 11_000, true);
    expect(later).toEqual({ next: { loopStartNow: 4_000, pausedAtNow: 9_984, previousNow: 11_000 }, frozen: true });
  });

  it('4,000ms에 첫 프레임(루프 시간 0)을 그리고 바로 멈춘 뒤 13,000ms에 재개하면 루프 시간 0에서 시작한다', () => {
    const paused = stepTutorialLoopClock({ loopStartNow: 4_000, pausedAtNow: null, previousNow: 4_000 }, 4_016, true);
    const { next, frozen } = stepTutorialLoopClock(paused.next, 13_000, false);
    expect(frozen).toBe(false);
    expect(13_000 - next.loopStartNow).toBe(0);
  });

  it('10,000ms에 멈추고 13,000ms에 재개한 첫 프레임은 루프 시간 6,000ms에서 이어지고 previousNow가 13,000ms라 첫 deltaMs가 0이다', () => {
    const paused = { loopStartNow: 4_000, pausedAtNow: 10_000, previousNow: 12_984 };
    const { next, frozen } = stepTutorialLoopClock(paused, 13_000, false);
    expect(frozen).toBe(false);
    expect(next).toEqual({ loopStartNow: 7_000, pausedAtNow: null, previousNow: 13_000 });
    expect(13_000 - next.loopStartNow).toBe(6_000);
    expect(13_000 - next.previousNow).toBe(0);
  });
});

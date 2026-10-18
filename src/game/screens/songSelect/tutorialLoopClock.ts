/** 튜토리얼 재생 루프의 시계. `now`는 requestAnimationFrame 시각(ms)이다. */
export interface TutorialLoopClock {
  /** 루프 시간 0에 해당하는 시각. 루프 시간 = now − loopStartNow */
  loopStartNow: number;
  /** 일시정지를 시작한 프레임의 시각. 재생 중이면 null */
  pausedAtNow: number | null;
  /** 직전 프레임 시각. deltaMs 계산에 쓴다 */
  previousNow: number;
}

/** 일시정지한 시간만큼 루프 시작점을 미뤄, 재개 시 멈춘 루프 시간에서 이어지게 한다. */
export function resumeTutorialLoopStart(loopStartNow: number, pausedAtNow: number, resumeNow: number): number {
  return loopStartNow + (resumeNow - pausedAtNow);
}

/**
 * 한 프레임만큼 시계를 진행한다. 멈춘 동안은 마지막으로 그린 프레임 시각을 멈춘 시각으로 기록하고 frozen을 돌려준다(판정 진행·렌더를 하지 않는다).
 * 재개한 첫 프레임에는 멈춘 시간만큼 loopStartNow를 미루고 previousNow를 지금으로 맞춰 deltaMs가 튀지 않게 한다.
 */
export function stepTutorialLoopClock(
  clock: TutorialLoopClock,
  now: number,
  paused: boolean,
): { next: TutorialLoopClock; frozen: boolean } {
  if (paused) {
    // 멈춘 장면은 마지막으로 그린 프레임(previousNow)이므로, 그 시각을 멈춘 시각으로 삼아 재개 시 그 장면에서 정확히 잇는다.
    return { next: { ...clock, pausedAtNow: clock.pausedAtNow ?? clock.previousNow, previousNow: now }, frozen: true };
  }
  if (clock.pausedAtNow === null) return { next: clock, frozen: false };
  return {
    next: { loopStartNow: resumeTutorialLoopStart(clock.loopStartNow, clock.pausedAtNow, now), pausedAtNow: null, previousNow: now },
    frozen: false,
  };
}

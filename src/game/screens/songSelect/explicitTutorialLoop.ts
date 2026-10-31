interface ExplicitTutorialLoopFrame {
  /** 일시정지 시간을 보정한 loopStartNow 이후의 경과 시간 */
  elapsedMs: number;
  loopMs: number;
  previousIteration: number;
  /** paused prop 또는 도식 확인 대기로 멈췄으면 반복 차수도 진행하지 않는다 */
  frozen: boolean;
}

/** 프레임 간 여러 반복을 건너뛰어도 끝난 패턴은 한 번만 정산한다. */
export function stepExplicitTutorialLoop({
  elapsedMs, loopMs, previousIteration, frozen,
}: ExplicitTutorialLoopFrame): { iteration: number; finished: boolean } {
  if (frozen) return { iteration: previousIteration, finished: false };
  const iteration = Math.floor(Math.max(0, elapsedMs) / loopMs);
  return { iteration, finished: iteration > previousIteration };
}

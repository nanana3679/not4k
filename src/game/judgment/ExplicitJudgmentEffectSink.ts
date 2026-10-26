import type { ExplicitGrade, ExplicitJudgmentDisplayState, ExplicitJudgmentEffect } from "./ExplicitJudgmentState";

export interface ExplicitJudgmentEffectPort {
  /** 같은 groupId는 글자·타이밍만 개정하며 fade/타격/고도를 재시작하지 않는다. */
  showJudgmentGroup(state: ExplicitJudgmentDisplayState): void;
  recordFlightJudgment(grade: ExplicitGrade): void;
  showBombEffect(lane: number): void;
}

/** session.drainEffects의 단일 소비자. 점수·콤보·통계의 소유자는 session이다. */
export class ExplicitJudgmentEffectSink {
  constructor(private readonly port: ExplicitJudgmentEffectPort) {}

  applyConfirmedEffects(effects: readonly ExplicitJudgmentEffect[]): void {
    const displayByGroup = new Map<string, ExplicitJudgmentDisplayState>();
    for (const effect of effects) {
      if (effect.altitudeAction !== "none") this.port.recordFlightJudgment(effect.grade!);
      if (effect.hitGrade !== null) this.port.showBombEffect(effect.lane);
      if (effect.displayUpdate) displayByGroup.set(effect.displayUpdate.groupId, effect.displayUpdate);
    }
    // 한 drain 안에서도 서로 다른 confirmedAt의 글자를 각각 전달한다.
    for (const display of displayByGroup.values()) this.port.showJudgmentGroup(display);
  }
}

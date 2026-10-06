import { describe, expect, it } from "vitest";
import { GameRenderer } from "./GameRenderer";
import { createFlightAltitudeState } from "./flightAltitude";
import { JudgmentGrade } from "../../shared";

// renderFrame 배선(비행 배경·기어 게이지에 같은 값을 주는지)은 GameRenderer.gearGauge.test.ts가 실제 렌더러로 본다.
describe("GameRenderer 고도 계산 (advanceFlightAltitude)", () => {
  const fakeRenderer = () => ({
    flightAltitudeState: createFlightAltitudeState(),
    chartDurationMs: 10000,
    altitudeOverride: null as number | null,
  });
  const advance = Reflect.get(GameRenderer.prototype, "advanceFlightAltitude");

  it("곡 10초 중 5초에서 고도 .5를 돌려주고 MISS 뒤에는 .26을 돌려준다", () => {
    const state = fakeRenderer();
    expect(Reflect.apply(advance, state, [5000, 0])).toBe(.5);
    Reflect.apply(GameRenderer.prototype.recordFlightJudgment, state, [JudgmentGrade.MISS]);
    expect(Reflect.apply(advance, state, [5000, 0])).toBe(.26);
  });

  it("미리보기 고정값 .3이 있으면 곡 진행과 무관하게 .3을 돌려주되 고도 상태는 계속 나아간다", () => {
    const state = fakeRenderer();
    Reflect.apply(GameRenderer.prototype.recordFlightJudgment, state, [JudgmentGrade.PERFECT]);
    state.altitudeOverride = .3;
    expect(Reflect.apply(advance, state, [5000, 100])).toBe(.3);
    expect(state.flightAltitudeState.offset).toBeGreaterThan(0);
  });
});

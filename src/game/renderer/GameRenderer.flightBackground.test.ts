import { describe, expect, it, vi } from "vitest";
import { GameRenderer } from "./GameRenderer";
import { createFlightAltitudeState } from "./flightAltitude";
import { JudgmentGrade } from "../../shared";

describe("GameRenderer 비행 배경과 기어 고도", () => {
  it("곡 절반에서 고도 .5를 기어와 배경에 동일하게 전달한다", () => {
    const state = {
      flightAltitudeState: createFlightAltitudeState(),
      chartDurationMs: 10000,
      updateGearGauge: vi.fn(),
      flightBackground: { render: vi.fn() },
    };
    const render = Reflect.get(GameRenderer.prototype, 'renderFlightBackground');
    Reflect.apply(render, state, [5000, 0]);
    expect(state.updateGearGauge).toHaveBeenCalledWith(.5);
    expect(state.flightBackground.render).toHaveBeenCalledWith(.5, 0);
    Reflect.apply(GameRenderer.prototype.recordFlightJudgment, state, [JudgmentGrade.MISS]);
    Reflect.apply(render, state, [5000, 0]);
    expect(state.updateGearGauge).toHaveBeenLastCalledWith(.26);
    expect(state.flightBackground.render).toHaveBeenLastCalledWith(.26, 0);
  });
});

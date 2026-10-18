import { describe, expect, it } from "vitest";
import { JudgmentGrade } from "../../shared";
import {
  applyFlightJudgment,
  clampFlightAltitude,
  createFlightAltitudeState,
  derivePlaceholderFlightAltitude,
  resolveFlightAltitude,
  stepFlightAltitude,
} from "./flightAltitude";

describe("derivePlaceholderFlightAltitude", () => {
  it("곡 시작 songTimeMs=0, duration=100000이면 placeholder altitude는 1", () => {
    expect(derivePlaceholderFlightAltitude(0, 100_000)).toBe(1);
  });

  it("곡 중간 songTimeMs=25000, duration=100000이면 placeholder altitude는 0.75", () => {
    expect(derivePlaceholderFlightAltitude(25_000, 100_000)).toBe(0.75);
  });

  it("곡 종료 songTimeMs=100000, duration=100000이면 placeholder altitude는 0", () => {
    expect(derivePlaceholderFlightAltitude(100_000, 100_000)).toBe(0);
  });

  it("songTimeMs가 duration을 넘으면 placeholder altitude는 0으로 clamp", () => {
    expect(derivePlaceholderFlightAltitude(120_000, 100_000)).toBe(0);
  });

  it("duration이 0이면 곡 길이를 모르는 상태로 보고 placeholder altitude는 1", () => {
    expect(derivePlaceholderFlightAltitude(50_000, 0)).toBe(1);
  });
});

describe("flight altitude state", () => {
  it("miss 판정이면 같은 곡 위치에서 altitude가 즉시 낮아짐", () => {
    const initialState = createFlightAltitudeState();
    const missedState = applyFlightJudgment(initialState, JudgmentGrade.MISS);

    expect(resolveFlightAltitude(missedState, 20_000, 100_000)).toBeLessThan(resolveFlightAltitude(initialState, 20_000, 100_000));
  });

  it("bad 판정은 miss보다 altitude 하락폭이 작음", () => {
    const initialState = createFlightAltitudeState();
    const badState = applyFlightJudgment(initialState, JudgmentGrade.BAD);
    const missState = applyFlightJudgment(initialState, JudgmentGrade.MISS);

    const badAltitude = resolveFlightAltitude(badState, 40_000, 100_000);
    const missAltitude = resolveFlightAltitude(missState, 40_000, 100_000);

    expect(badAltitude).toBeGreaterThan(missAltitude);
  });

  it("perfect 판정 후 500ms가 지나면 altitude가 천천히 회복됨", () => {
    const droppedState = applyFlightJudgment(
      createFlightAltitudeState(),
      JudgmentGrade.MISS,
    );
    const recoveringState = applyFlightJudgment(droppedState, JudgmentGrade.PERFECT);
    const beforeRecovery = resolveFlightAltitude(recoveringState, 40_000, 100_000);
    const afterRecovery = resolveFlightAltitude(stepFlightAltitude(recoveringState, 500), 40_500, 100_000);

    expect(afterRecovery).toBeGreaterThan(beforeRecovery);
    expect(afterRecovery).toBeLessThan(1);
  });
});

describe("stepFlightAltitude out 매개변수(렌더러의 프레임마다 할당 없는 갱신)", () => {
  it("out에 상태 자신을 주면 새 객체 없이 그 객체에 써서 돌려주고 값은 out 없이 부른 결과와 같다", () => {
    const recovering = applyFlightJudgment(
      applyFlightJudgment(createFlightAltitudeState(), JudgmentGrade.MISS),
      JudgmentGrade.PERFECT,
    );
    const expected = stepFlightAltitude(recovering, 16);
    const result = stepFlightAltitude(recovering, 16, recovering);
    expect(result).toBe(recovering);
    expect(result).toEqual(expected);
  });

  it("간격 0이면 out을 줘도 값이 그대로이고, 다른 out 객체에는 같은 값을 복사한다", () => {
    const state = applyFlightJudgment(createFlightAltitudeState(), JudgmentGrade.BAD);
    const out = createFlightAltitudeState();
    expect(stepFlightAltitude(state, 0, out)).toBe(out);
    expect(out).toEqual(state);
  });
});

describe("clampFlightAltitude", () => {
  it("1.5는 1, −0.5는 0, NaN·무한대는 비행 배경처럼 0", () => {
    expect([clampFlightAltitude(1.5), clampFlightAltitude(-0.5), clampFlightAltitude(Number.NaN), clampFlightAltitude(Number.POSITIVE_INFINITY)]).toEqual([1, 0, 0, 0]);
  });
});

describe("고도 계산은 위치 인자로 받아 프레임마다 객체를 만들지 않는다", () => {
  it("곡 10초 중 5초에서 MISS 한 번이면 resolveFlightAltitude(상태, 5000, 10000)은 0.5 − 0.24 = 0.26", () => {
    const missed = applyFlightJudgment(createFlightAltitudeState(), JudgmentGrade.MISS);
    expect(resolveFlightAltitude(missed, 5000, 10000)).toBeCloseTo(0.26, 12);
  });

  it("곡 길이가 NaN이면 derivePlaceholderFlightAltitude(5000, NaN)은 곡 길이를 모르는 상태로 보고 1", () => {
    expect(derivePlaceholderFlightAltitude(5000, Number.NaN)).toBe(1);
  });
});

import { describe, expect, it } from "vitest";
import { JudgmentGrade } from "../../shared";
import {
  applyPerspectiveSurfaceJudgment,
  createPerspectiveSurfaceAltitudeState,
  derivePlaceholderPerspectiveSurfaceAltitude,
  resolvePerspectiveSurfaceAltitude,
  stepPerspectiveSurfaceAltitude,
} from "./perspectiveSurfaceAltitude";

describe("derivePlaceholderPerspectiveSurfaceAltitude", () => {
  it("곡 시작 songTimeMs=0, duration=100000이면 placeholder altitude는 1", () => {
    expect(derivePlaceholderPerspectiveSurfaceAltitude({
      songTimeMs: 0,
      chartDurationMs: 100_000,
    })).toBe(1);
  });

  it("곡 중간 songTimeMs=25000, duration=100000이면 placeholder altitude는 0.75", () => {
    expect(derivePlaceholderPerspectiveSurfaceAltitude({
      songTimeMs: 25_000,
      chartDurationMs: 100_000,
    })).toBe(0.75);
  });

  it("곡 종료 songTimeMs=100000, duration=100000이면 placeholder altitude는 0", () => {
    expect(derivePlaceholderPerspectiveSurfaceAltitude({
      songTimeMs: 100_000,
      chartDurationMs: 100_000,
    })).toBe(0);
  });

  it("songTimeMs가 duration을 넘으면 placeholder altitude는 0으로 clamp", () => {
    expect(derivePlaceholderPerspectiveSurfaceAltitude({
      songTimeMs: 120_000,
      chartDurationMs: 100_000,
    })).toBe(0);
  });

  it("duration이 0이면 곡 길이를 모르는 상태로 보고 placeholder altitude는 1", () => {
    expect(derivePlaceholderPerspectiveSurfaceAltitude({
      songTimeMs: 50_000,
      chartDurationMs: 0,
    })).toBe(1);
  });
});

describe("perspective surface altitude state", () => {
  it("miss 판정이면 같은 곡 위치에서 altitude가 즉시 낮아짐", () => {
    const initialState = createPerspectiveSurfaceAltitudeState();
    const missedState = applyPerspectiveSurfaceJudgment(initialState, JudgmentGrade.MISS);

    expect(resolvePerspectiveSurfaceAltitude({
      state: missedState,
      songTimeMs: 20_000,
      chartDurationMs: 100_000,
    })).toBeLessThan(resolvePerspectiveSurfaceAltitude({
      state: initialState,
      songTimeMs: 20_000,
      chartDurationMs: 100_000,
    }));
  });

  it("bad 판정은 miss보다 altitude 하락폭이 작음", () => {
    const initialState = createPerspectiveSurfaceAltitudeState();
    const badState = applyPerspectiveSurfaceJudgment(initialState, JudgmentGrade.BAD);
    const missState = applyPerspectiveSurfaceJudgment(initialState, JudgmentGrade.MISS);

    const badAltitude = resolvePerspectiveSurfaceAltitude({
      state: badState,
      songTimeMs: 40_000,
      chartDurationMs: 100_000,
    });
    const missAltitude = resolvePerspectiveSurfaceAltitude({
      state: missState,
      songTimeMs: 40_000,
      chartDurationMs: 100_000,
    });

    expect(badAltitude).toBeGreaterThan(missAltitude);
  });

  it("perfect 판정 후 500ms가 지나면 altitude가 천천히 회복됨", () => {
    const droppedState = applyPerspectiveSurfaceJudgment(
      createPerspectiveSurfaceAltitudeState(),
      JudgmentGrade.MISS,
    );
    const recoveringState = applyPerspectiveSurfaceJudgment(droppedState, JudgmentGrade.PERFECT);
    const beforeRecovery = resolvePerspectiveSurfaceAltitude({
      state: recoveringState,
      songTimeMs: 40_000,
      chartDurationMs: 100_000,
    });
    const afterRecovery = resolvePerspectiveSurfaceAltitude({
      state: stepPerspectiveSurfaceAltitude(recoveringState, 500),
      songTimeMs: 40_500,
      chartDurationMs: 100_000,
    });

    expect(afterRecovery).toBeGreaterThan(beforeRecovery);
    expect(afterRecovery).toBeLessThan(1);
  });
});

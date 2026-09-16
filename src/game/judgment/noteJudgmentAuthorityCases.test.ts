import { describe, expect, it } from "vitest";
import { body, counts, createHarness, down, point, up } from "./noteJudgmentTestHarness";

describe("정당한 시작과 키 수의 추가 대조", () => {
  it("길이 0 holdOnly 1000ms를 1050ms에 눌렀다 같은 timestamp에 떼어도 상태 Perfect이며 바디 query도 complete", () => {
    const h = createHarness([body(1000, 1000, "long", true)]);
    h.at(1050, down("A"), up("A")); h.at(1121);
    expect(counts(h.events)).toEqual({ perfect: 1, great: 0, good: 0, goodTrill: 0, miss: 0 });
    expect(h.events[0]).toMatchObject({ kind: "holdOnly", confirmedAt: 1050, consumed: false });
    expect(h.core.bodyStates[0]).toMatchObject({ complete: true, failed: false });
  });

  it("길이 0 holdOnly 1000ms를 놓치면 query도 failed이고 새 1200ms 입력은 되살리지 못함", () => {
    const h = createHarness([body(1000, 1000, "long", true)]);
    h.at(1121); h.at(1200, down("A"));
    expect(h.core.bodyStates[0]).toMatchObject({ complete: false, failed: true });
    expect(counts(h.events).miss).toBe(1);
  });

  it("[1000,2000]의 A를 1500ms에 떼고 같은 timestamp에 raw 재누름해도 옛 유지 권한이 되살아나지 않음", () => {
    const h = createHarness([point(1000), body(1000, 2000)]);
    h.at(1000, down("A")); h.at(1500, up("A"), down("A"));
    expect(h.core.bodyStates[0].failed).toBe(true);
    h.at(2000, up("A")); h.at(2121);
    expect(counts(h.events)).toEqual({ perfect: 1, great: 0, good: 0, goodTrill: 0, miss: 1 });
  });

  it("headless [1000,1060] 시작은 뒤 Point1100보다 이르므로 1000 down을 소비하고 Point는 새 B로 처리함", () => {
    const h = createHarness([body(1000, 1060), point(1100)]);
    h.at(1000, down("A"));
    expect(h.events).toEqual([]);
    expect(h.core.bodyStates[0].active).toBe(true);
    h.at(1060, up("A")); h.at(1100, down("B")); h.at(1300);
    expect(h.events.map(event => [event.kind, event.inputAt, event.grade])).toEqual([
      ["release", 1060, "perfect"], ["head", 1100, "perfect"],
    ]);
  });

  it("headless double [1000,1060]에서 A를 두 번 눌렀다 떼도 서로 다른 두 키 시작을 대신하지 못함", () => {
    const h = createHarness([body(1000, 1060, "doubleLong")]);
    h.at(1020, down("A")); h.at(1025, up("A")); h.at(1030, down("A")); h.at(1035, up("A")); h.at(1300);
    expect(counts(h.events)).toEqual({ perfect: 1, great: 0, good: 0, goodTrill: 0, miss: 1 });
    expect(h.score.getState()).toMatchObject({ earnedScore: 3, processedNotes: 2, liveDenominatorWeight: 6 });
  });

  it("길이 0 double holdOnly는 A 하나의 기존 held로 Perfect 하나만 얻고 남은 unit은 기한에 실패함", () => {
    const h = createHarness([body(1000, 1000, "doubleLong", true)]);
    h.at(500, down("A")); h.at(1000); h.at(1121);
    expect(counts(h.events)).toEqual({ perfect: 1, great: 0, good: 0, goodTrill: 0, miss: 1 });
    expect(h.score.getState()).toMatchObject({ earnedScore: 3, processedNotes: 2, liveDenominatorWeight: 6 });
  });

  it("길이 0 double holdOnly의 Good 창에서 A/B를 겹치지 않게 떼어도 각 상태 Perfect이며 up 소비는 없음", () => {
    const h = createHarness([body(1000, 1000, "doubleLong", true)]);
    h.at(890, down("A")); h.at(895, up("A")); h.at(900, down("B")); h.at(905, up("B")); h.at(1121);
    expect(h.events).toHaveLength(2);
    expect(h.events.map(event => [event.kind, event.grade, event.confirmedAt, event.consumed])).toEqual([
      ["holdOnly", "perfect", 895, false], ["holdOnly", "perfect", 905, false],
    ]);
  });

  it("L2의 기존 held는 L1 길이 0 holdOnly를 활성화하지 못함", () => {
    const h = createHarness([body(1000, 1000, "long", true, 1)]);
    h.at(500, down("A", 2)); h.at(1000); h.at(1121);
    expect(counts(h.events)).toEqual({ perfect: 0, great: 0, good: 0, goodTrill: 0, miss: 1 });
  });
});

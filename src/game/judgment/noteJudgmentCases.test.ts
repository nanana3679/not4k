import { describe, expect, it } from "vitest";
import { body, counts, createHarness, down, judgments, point, up } from "./noteJudgmentTestHarness";

describe("RFD 0019 시작과 유지", () => {
  it("NJ-A01: 900/920 앞 바디를 처리해도 독립 holdOnly 1000/1060은 별도 down으로 시작", () => {
    const h = createHarness([body(900, 920), body(1000, 1060, "long", true)]);
    h.at(900, down("A"));
    expect(h.core.bodyStates.filter(s => s.noteIndex === 1).every(s => !s.active && !s.failed)).toBe(true);
    h.at(920, up("A"));
    expect(h.events).toHaveLength(1);
    expect(h.events[0]).toMatchObject({ kind: "release", noteIndex: 0, grade: "perfect", inputAt: 920, consumed: true });
    h.at(1000, down("B"));
    h.at(1060);
    h.at(1070, up("B"));
    h.at(1300);
    expect(judgments(h.events)).toHaveLength(2);
    expect(h.events[1]).toMatchObject({ kind: "holdOnly", noteIndex: 1, grade: "perfect", consumed: false });
  });

  it("NJ-A02: 500부터 잡은 A는 holdOnly 1000/2000을 시작하지 못하고 실패는 한 번", () => {
    const h = createHarness([body(1000, 2000, "long", true)]);
    h.at(500, down("A"));
    h.at(1000);
    expect(h.core.bodyStates[0]).toMatchObject({ active: false, failed: false });
    h.at(1121);
    expect(h.core.bodyStates[0].failed).toBe(true);
    expect(counts(h.events)).toEqual({ perfect: 0, great: 0, good: 0, goodTrill: 0, miss: 1 });
    expect(h.score.getState()).toMatchObject({ earnedScore: 0, liveDenominatorWeight: 3 });
    const before = h.events.length;
    h.at(2121);
    expect(h.events).toHaveLength(before);
  });

  it("NJ-A03: A로 시작한 holdOnly에서 raw B를 잡아도 A up 1500은 유지 Miss 한 번", () => {
    const h = createHarness([body(1000, 2000, "long", true)]);
    h.at(1000, down("A"));
    h.at(1200, down("B"));
    h.at(1500, up("A"));
    expect(h.core.bodyStates[0].failed).toBe(true);
    expect(counts(h.events).miss).toBe(1);
    const before = h.events.length;
    h.at(2121);
    expect(h.events).toHaveLength(before);
    expect(counts(h.events).perfect).toBe(0);
  });

  it.each([995, 1005])("NJ-A04: double head의 A/B가 준비되면 C down %ims는 Point 1100에 소비되고 두 release Perfect", (at) => {
    const h = createHarness([point(0, "double"), body(0, 1000), body(1000, 1060, "doubleLong"), point(1100)]);
    h.at(0, down("A"), down("B"));
    h.at(at, down("C"));
    expect(h.events.filter(e => e.noteIndex === 3)).toEqual([
      expect.objectContaining({ kind: "head", grade: "good", inputAt: at, deltaMs: at - 1100, consumed: true }),
    ]);
    h.at(at + 2, up("C"));
    h.at(1060, up("A"), up("B"));
    h.at(1300);
    expect(h.events.filter(e => e.kind === "release")).toEqual([
      expect.objectContaining({ noteIndex: 2, grade: "perfect", inputAt: 1060 }),
      expect.objectContaining({ noteIndex: 2, grade: "perfect", inputAt: 1060 }),
    ]);
    expect(counts(h.events)).toEqual({ perfect: 4, great: 0, good: 1, goodTrill: 0, miss: 0 });
  });

  it("NJ-A05: 1000/1060 double을 A 1020/1025와 B 1030/1035로 치면 겹치는 held 없이 Perfect 4개", () => {
    const h = createHarness([point(1000, "double"), body(1000, 1060, "doubleLong")]);
    h.at(1020, down("A"));
    h.at(1025, up("A"));
    h.at(1030, down("B"));
    h.at(1035, up("B"));
    h.at(1300);
    expect(judgments(h.events).map(e => [e.kind, e.grade, e.deltaMs])).toEqual([
      ["head", "perfect", 20], ["release", "perfect", -35],
      ["head", "perfect", 30], ["release", "perfect", -25],
    ]);
    expect(h.score.getState()).toMatchObject({ earnedScore: 12, finalDenominatorWeight: 12, isFullCombo: true });
  });

  it("NJ-A06: holdOnly 1000/1060에 1100 down하면 E 이후 첫 활성화도 Perfect", () => {
    const h = createHarness([body(1000, 1060, "long", true)]);
    h.at(1060);
    expect(h.events).toHaveLength(0);
    h.at(1100, down("A"));
    expect(h.events).toEqual([expect.objectContaining({ kind: "holdOnly", grade: "perfect", consumed: false })]);
    h.at(1130, up("A"));
    h.at(1300);
    expect(h.events).toHaveLength(1);
  });
});

describe("RFD 0019 실패 경로와 길이 0", () => {
  it("NJ-F01: 가운데 바디가 1090에 실패하면 늦은 B head가 2000 double을 시작하지 못하고 C/D로 복구", () => {
    const h = createHarness([point(1000, "double"), body(1000, 1060, "doubleLong"), body(1060, 2000), body(2000, 3000, "doubleLong")]);
    h.at(1000, down("A"));
    h.at(1065, up("A"));
    expect(h.events.find(e => e.kind === "release")).toMatchObject({ noteIndex: 1, grade: "perfect", deltaMs: 5 });
    h.at(1070, down("A"));
    expect(h.events.filter(e => e.kind === "head")).toHaveLength(1);
    h.at(1090, up("A"));
    expect(h.core.bodyStates.find(s => s.noteIndex === 2)?.failed).toBe(true);
    h.at(1100, down("B"));
    expect(h.events.filter(e => e.kind === "head").map(e => e.grade)).toEqual(["perfect", "good"]);
    h.at(2000);
    expect(h.core.bodyStates.filter(s => s.noteIndex === 3)).toEqual([
      expect.objectContaining({ active: false, failed: false }),
      expect.objectContaining({ active: false, failed: false }),
    ]);
    h.at(2000, down("C"), down("D"));
    h.at(3000, up("C"), up("D"));
    h.at(3200);
    expect(h.events.filter(e => e.noteIndex === 3 && e.kind === "release")).toEqual([
      expect.objectContaining({ grade: "perfect", inputAt: 3000 }),
      expect.objectContaining({ grade: "perfect", inputAt: 3000 }),
    ]);
    expect(h.core.bodyStates.find(s => s.noteIndex === 2)?.failed).toBe(true);
  });

  it.each([false, true])("NJ-F02: 경계 1000의 A up/B head 수집 순서 반전=%s여도 Perfect 3개", (reverse) => {
    const h = createHarness([point(0), body(0, 1000), point(1000), body(1000, 2000)]);
    h.at(0, down("A"));
    h.at(1000, ...(reverse ? [down("B"), up("A")] : [up("A"), down("B")]));
    h.at(2000, up("B"));
    h.at(2200);
    expect(counts(h.events)).toEqual({ perfect: 3, great: 0, good: 0, goodTrill: 0, miss: 0 });
  });

  it("NJ-F03: 감소를 A up 1095로 쓴 뒤 B up 1105는 가운데 바디 Miss이며 1110 재누름으로 복구 불가", () => {
    const h = createHarness([point(1000, "double"), body(1000, 1060, "doubleLong"), body(1060, 2000)]);
    h.at(1090, down("A"));
    h.at(1095, up("A"));
    h.at(1100, down("B"));
    h.at(1105, up("B"));
    expect(h.core.bodyStates.find(s => s.noteIndex === 2)?.failed).toBe(true);
    expect(counts(h.events)).toEqual({ perfect: 1, great: 0, good: 2, goodTrill: 0, miss: 1 });
    const before = h.events.length;
    h.at(1110, down("B"));
    h.at(2121);
    expect(h.events).toHaveLength(before);
    expect(h.score.getState()).toMatchObject({ earnedScore: 5, finalDenominatorWeight: 12, liveDenominatorWeight: 12 });
  });

  it.each([870, 890])("NJ-Z01: Point 900의 A tap %ims는 zero holdOnly 1000의 창 안에서만 상태 판정을 공유", (at) => {
    const h = createHarness([point(900), body(1000, 1000, "long", true)]);
    h.at(at, down("A"));
    h.at(at + 5, up("A"));
    expect(h.events.filter(e => e.kind === "head")).toEqual([expect.objectContaining({ grade: "perfect" })]);
    expect(h.events.filter(e => e.kind === "holdOnly")).toHaveLength(at === 890 ? 1 : 0);
    if (at === 870) {
      h.at(1000, down("B"));
      h.at(1005, up("B"));
    }
    h.at(1200);
    expect(counts(h.events)).toEqual({ perfect: 2, great: 0, good: 0, goodTrill: 0, miss: 0 });
    expect(h.events.filter(e => e.kind === "holdOnly")[0].consumed).toBe(false);
  });
});

describe("RFD 0019 실제 입력에서 점수와 현재 콤보까지", () => {
  it("NJ-S01: 연결 바디를 500에 놓치고 두 head와 마지막 release를 Perfect 처리하면 9/9이며 Full Combo 아님", () => {
    const h = createHarness([point(0), body(0, 1000), point(1000), body(1000, 2000)]);
    h.at(0, down("A"));
    h.at(500, up("A"));
    expect(h.core.combo).toBe(0);
    h.at(1000, down("B"));
    h.at(2000, up("B"));
    h.at(2200);
    expect(h.score.finalize()).toMatchObject({ achievementRate: 100, earnedScore: 9, finalDenominatorWeight: 9, liveDenominatorWeight: 9, isFullCombo: false });
    expect(counts(h.events)).toEqual({ perfect: 3, great: 0, good: 0, goodTrill: 0, miss: 1 });
  });

  it("NJ-S02: head 1000 Miss에서 종속 끝 2000도 0점 정산하고 끝 기한에는 추가 Miss 없음", () => {
    const h = createHarness([point(1000), body(1000, 2000)]);
    h.at(1121);
    expect(judgments(h.events)).toEqual([expect.objectContaining({ kind: "head", grade: "miss", noteIndex: 0 })]);
    expect(h.events.filter(e => e.kind === "dependentZero")).toEqual([expect.objectContaining({ noteIndex: 1 })]);
    expect(h.score.getState()).toMatchObject({ earnedScore: 0, liveDenominatorWeight: 6, finalDenominatorWeight: 6 });
    const before = h.events.length;
    h.at(2121);
    expect(h.events).toHaveLength(before);
    expect(h.score.getState().judgmentCounts.miss).toBe(1);
  });

  it("NJ-S03: B up 1030의 보류 Great는 L2 Miss 전에 소급하지 않고 1120 기한 묶음의 Miss로 콤보 0", () => {
    const h = createHarness([point(0, "double"), body(0, 1000, "doubleLong"), point(1000, "double"), body(1000, 1100, "doubleLong"), point(930, "single", 2)]);
    h.at(0, down("A"), down("B"));
    expect(h.core.combo).toBe(2);
    h.at(995, up("A"));
    h.at(1000, down("C"));
    expect(h.core.combo).toBe(3);
    h.at(1030, up("B"));
    expect(h.core.combo).toBe(3);
    expect(h.events.filter(e => e.kind === "release")).toHaveLength(0);
    h.at(1051);
    expect(h.core.combo).toBe(0);
    h.at(1100, up("C"));
    expect(h.core.combo).toBe(1);
    h.at(1121);
    expect(h.core.combo).toBe(0);
    expect(h.events.find(e => e.kind === "release" && e.inputAt === 1030)).toMatchObject({ grade: "great", deltaMs: -70 });
    expect(counts(h.events)).toEqual({ perfect: 4, great: 1, good: 0, goodTrill: 0, miss: 2 });
    h.at(1300);
    expect(counts(h.events).miss).toBe(2);
  });
});

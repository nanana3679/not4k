import { describe, expect, it } from "vitest";
import { createHarness, body, point, counts } from "./noteJudgmentTestHarness";

const grades = (h: ReturnType<typeof createHarness>) => h.events.filter(e => e.kind === "head" || e.kind === "release").map(e => e.grade);
const releases = (h: ReturnType<typeof createHarness>) => h.events.filter(e => e.kind === "release");
const heads = (h: ReturnType<typeof createHarness>) => h.events.filter(e => e.kind === "head");
function finishSuccessful(h: ReturnType<typeof createHarness>, time: number) {
  h.at(time);
  expect(counts(h.events).miss).toBe(0);
  expect(h.score.getState().liveDenominatorWeight).toBe(h.compiled.theoreticalWeight);
}

/** Q1: double head 0 + double [0,1000] → single [1000,1060] → double [1060,1100] → single [1100,2000]. */
const q1 = () => createHarness([
  point(0, "double"),
  body(0, 1000, "doubleLong"),
  body(1000, 1060),
  body(1060, 1100, "doubleLong"),
  body(1100, 2000),
]);

describe("RFD0020 release 사례 NJ-R01~R15", () => {
  it("NJ-R01: 정상 Q1은 head 2개와 release 3개를 모두 Perfect", () => {
    const h = q1();
    h.at(0, { key: "A", type: "down" }, { key: "B", type: "down" });
    h.at(1000, { key: "A", type: "up" });
    h.at(1060, { key: "C", type: "down" });
    h.at(1100, { key: "C", type: "up" });
    h.at(2000, { key: "B", type: "up" });
    expect(heads(h)).toHaveLength(2);
    expect(releases(h)).toHaveLength(3);
    expect(grades(h)).toEqual(["perfect", "perfect", "perfect", "perfect", "perfect"]);
    expect(releases(h).map(e => e.deltaMs)).toEqual([0, 0, 0]);
    expect(h.events.some(e => e.kind === "maintenanceMiss")).toBe(false);
    finishSuccessful(h, 2121);
  });

  it("NJ-R01: 늦은 Q1은 A 1100ms release만 Good이고 나머지는 Perfect", () => {
    const h = q1();
    h.at(0, { key: "A", type: "down" }, { key: "B", type: "down" });
    h.at(1100, { key: "A", type: "up" });
    h.at(1105, { key: "C", type: "down" });
    h.at(1110, { key: "C", type: "up" });
    h.at(2000, { key: "B", type: "up" });
    expect(grades(h)).toEqual(["perfect", "perfect", "good", "perfect", "perfect"]);
    expect(releases(h).map(e => e.deltaMs)).toEqual([100, 10, 0]);
    expect(h.events.some(e => e.kind === "maintenanceMiss")).toBe(false);
    finishSuccessful(h, 2121);
  });

  it("NJ-R02: C 1070 down 뒤 1080 up은 앞 1000 release Great으로 귀속", () => {
    const h = q1();
    h.at(0, { key: "A", type: "down" }, { key: "B", type: "down" });
    h.at(1070, { key: "C", type: "down" });
    h.at(1080, { key: "C", type: "up" });
    h.at(1100, { key: "A", type: "up" });
    h.at(2000, { key: "B", type: "up" });
    expect(releases(h)).toHaveLength(3);
    expect(releases(h).map(e => ({ grade: e.grade, deltaMs: e.deltaMs }))).toEqual([
      { grade: "great", deltaMs: 80 }, { grade: "perfect", deltaMs: 0 }, { grade: "perfect", deltaMs: 0 },
    ]);
    expect(releases(h).map(e => e.noteIndex)).toEqual([1, 3, 4]);
    finishSuccessful(h, 2121);
  });

  it("NJ-R03: release 준비가 Miss여도 held 두 키만으로 뒤 증가 unit을 성공시키지 않음", () => {
    const h = q1();
    h.at(0, { key: "A", type: "down" }, { key: "B", type: "down" });
    h.at(1060);
    h.at(1121);
    h.at(1181);
    expect(h.events.filter(e => e.kind === "release" && e.grade === "miss" && e.noteIndex === 1)).toHaveLength(1);
    expect(h.events.filter(e => e.kind === "maintenanceMiss" && e.noteIndex === 3)).toHaveLength(1);
    expect(h.core.bodyStates.some(s => s.noteIndex === 3 && s.failed)).toBe(true);
    expect(h.events.filter(e => e.kind === "release" && e.grade === "miss")).toHaveLength(1);
  });

  it("NJ-R04: A 1020 연결 up은 제외되고 B 1035/A 1040이 두 release를 Perfect", () => {
    const h = createHarness([
      point(0, "double"), body(0, 1000, "doubleLong"), point(1000), body(1000, 1060, "doubleLong"),
    ]);
    h.at(0, { key: "A", type: "down" }, { key: "B", type: "down" });
    h.at(1020, { key: "A", type: "up" });
    h.at(1030, { key: "A", type: "down" });
    h.at(1035, { key: "B", type: "up" });
    h.at(1040, { key: "A", type: "up" });
    expect(heads(h)).toHaveLength(3);
    expect(releases(h)).toHaveLength(2);
    expect(releases(h).map(e => ({ key: e.key, grade: e.grade, deltaMs: e.deltaMs }))).toEqual([
      { key: "B", grade: "perfect", deltaMs: -25 }, { key: "A", grade: "perfect", deltaMs: -20 },
    ]);
    finishSuccessful(h, 1300);
  });

  it("NJ-R05: double head 뒤 single body는 첫 A up을 여분으로 두고 B up만 release", () => {
    const h = createHarness([point(0, "double"), body(0, 1000)]);
    h.at(0, { key: "A", type: "down" }, { key: "B", type: "down" });
    h.at(1000, { key: "A", type: "up" });
    h.at(1005, { key: "B", type: "up" });
    expect(heads(h)).toHaveLength(2);
    expect(releases(h)).toHaveLength(1);
    expect(releases(h)[0]).toMatchObject({ key: "B", grade: "perfect", deltaMs: 5, consumed: true });
    finishSuccessful(h, 1200);
  });

  it("NJ-R06: 정박 연결 head는 995 up을 교대로 소비하고 마지막 release만 별도 확정", () => {
    const h = createHarness([point(0), body(0, 1000), point(1000), body(1000, 1100)]);
    h.at(0, { key: "A", type: "down" }); h.at(995, { key: "A", type: "up" });
    h.at(1000, { key: "B", type: "down" }); h.at(1100, { key: "B", type: "up" });
    expect(grades(h)).toEqual(["perfect", "perfect", "perfect"]);
    expect(releases(h)).toHaveLength(1); expect(releases(h)[0]).toMatchObject({ key: "B", deltaMs: 0 });
    finishSuccessful(h, 1300);
  });

  it("NJ-R06: 늦은 연결 head 1110은 Good이고 1115 terminal은 Perfect", () => {
    const h = createHarness([point(0), body(0, 1000), point(1000), body(1000, 1100)]);
    h.at(0, { key: "A", type: "down" }); h.at(995, { key: "A", type: "up" });
    h.at(1110, { key: "B", type: "down" }); h.at(1115, { key: "B", type: "up" });
    expect(grades(h)).toEqual(["perfect", "good", "perfect"]);
    expect(heads(h)[1]).toMatchObject({ inputAt: 1110, deltaMs: 110 }); expect(releases(h)[0]).toMatchObject({ inputAt: 1115, deltaMs: 15 });
    finishSuccessful(h, 1300);
  });

  it("NJ-R07: double 교대는 A/B up을 연결에 쓰고 C/D terminal 두 개를 Perfect", () => {
    const h = createHarness([point(0, "double"), body(0, 1000, "doubleLong"), point(1000, "double"), body(1000, 1100, "doubleLong")]);
    h.at(0, { key: "A", type: "down" }, { key: "B", type: "down" }); h.at(995, { key: "A", type: "up" }, { key: "B", type: "up" });
    h.at(1000, { key: "C", type: "down" }, { key: "D", type: "down" }); h.at(1100, { key: "C", type: "up" }, { key: "D", type: "up" });
    expect(grades(h)).toEqual(["perfect", "perfect", "perfect", "perfect", "perfect", "perfect"]);
    expect(releases(h).map(e => e.key)).toEqual(["C", "D"]);
    finishSuccessful(h, 1300);
  });

  it("NJ-R08: 교대 실패는 뒤 head Miss와 dependentZero만 만들고 terminal 추가 Miss는 만들지 않음", () => {
    const h = createHarness([point(0), body(0, 1000), point(1000), body(1000, 1100)]);
    h.at(0, { key: "A", type: "down" }); h.at(995, { key: "A", type: "up" }); h.at(1100); h.at(1121); h.at(1221);
    expect(heads(h).map(e => e.grade)).toEqual(["perfect", "miss"]);
    expect(h.events.filter(e => e.kind === "dependentZero")).toHaveLength(1);
    expect(h.events.filter(e => e.kind === "maintenanceMiss")).toHaveLength(0);
    expect(releases(h)).toHaveLength(0);
  });

  it.each([1100, 2000])("NJ-R09: 같은 A 재타격은 E=%d terminal을 Perfect로 확정", end => {
    const h = createHarness([point(0), body(0, 1000), point(1000), body(1000, end)]);
    h.at(0, { key: "A", type: "down" }); h.at(995, { key: "A", type: "up" }); h.at(1000, { key: "A", type: "down" }); h.at(end, { key: "A", type: "up" });
    expect(grades(h)).toEqual(["perfect", "perfect", "perfect"]);
    expect(h.events.some(e => e.kind === "maintenanceMiss")).toBe(false);
    expect(releases(h)[0]).toMatchObject({ inputAt: end, deltaMs: 0 });
    finishSuccessful(h, end + 121);
  });

  it("NJ-R10: partial 교대에서 B 1030은 Great, C 1100은 Perfect이고 남은 head는 Miss", () => {
    const h = createHarness([point(0, "double"), body(0, 1000, "doubleLong"), point(1000, "double"), body(1000, 1100, "doubleLong")]);
    h.at(0, { key: "A", type: "down" }, { key: "B", type: "down" }); h.at(995, { key: "A", type: "up" }); h.at(1000, { key: "C", type: "down" }); h.at(1030, { key: "B", type: "up" }); h.at(1100, { key: "C", type: "up" }); h.at(1121);
    expect(releases(h).find(e => e.inputAt === 1030)).toMatchObject({ key: "B", grade: "great", deltaMs: -70 });
    expect(releases(h).find(e => e.inputAt === 1100)).toMatchObject({ key: "C", grade: "perfect", deltaMs: 0 });
    h.at(1221); expect(h.events.filter(e => e.kind === "maintenanceMiss")).toHaveLength(0);
    expect(heads(h).filter(e => e.grade === "miss")).toHaveLength(1);
    expect(counts(h.events)).toEqual({ perfect: 4, great: 1, good: 0, goodTrill: 0, miss: 1 });
  });

  it("NJ-R11: 동시 A/B up 순서를 바꿔도 C Perfect와 A Great terminal", () => {
    const execute = (order: [string, string]) => {
      const h = createHarness([point(0, "double"), body(0, 1000, "doubleLong"), point(1000, "double"), body(1000, 1100, "doubleLong")]);
      h.at(0, { key: "A", type: "down" }, { key: "B", type: "down" }); h.at(1000, { key: "C", type: "down" });
      h.at(1080, { key: order[0], type: "up" }, { key: order[1], type: "up" }); h.at(1100, { key: "A", type: "down" }); h.at(1105, { key: "C", type: "up" }); h.at(1150, { key: "A", type: "up" });
      return h;
    };
    for (const h of [execute(["A", "B"]), execute(["B", "A"])]) {
      expect(h.events.filter(e => e.grade === "perfect")).toHaveLength(4);
      expect(h.events.filter(e => e.grade === "good")).toHaveLength(1);
      expect(h.events.filter(e => e.grade === "great")).toHaveLength(1);
      expect(releases(h).find(e => e.inputAt === 1105)).toMatchObject({ key: "C", grade: "perfect", deltaMs: 5 });
      expect(releases(h).find(e => e.inputAt === 1150)).toMatchObject({ key: "A", grade: "great", deltaMs: 50 });
      finishSuccessful(h, 1300);
    }
  });

  it("NJ-R12: A 1010 up만 교대되고 B 1040은 terminal Great, C 1100은 Perfect", () => {
    const h = createHarness([point(0, "double"), body(0, 1000, "doubleLong"), point(1000), body(1000, 1100, "doubleLong")]);
    h.at(0, { key: "A", type: "down" }, { key: "B", type: "down" }); h.at(1010, { key: "A", type: "up" }); h.at(1040, { key: "B", type: "up" }); h.at(1050, { key: "C", type: "down" }); h.at(1100, { key: "C", type: "up" });
    expect(heads(h).at(-1)).toMatchObject({ grade: "great", deltaMs: 50 });
    expect(releases(h).map(e => ({ key: e.key, grade: e.grade, deltaMs: e.deltaMs }))).toEqual([{ key: "B", grade: "great", deltaMs: -60 }, { key: "C", grade: "perfect", deltaMs: 0 }]);
    finishSuccessful(h, 1300);
  });

  it("NJ-R13: A up은 연결, B 1040 terminal Great, B 1050 head Great와 1100 release Perfect", () => {
    const h = createHarness([point(0, "double"), body(0, 1000, "doubleLong"), point(1000), body(1000, 1100, "doubleLong")]);
    h.at(0, { key: "A", type: "down" }, { key: "B", type: "down" }); h.at(1010, { key: "A", type: "up" }); h.at(1040, { key: "B", type: "up" }); h.at(1050, { key: "B", type: "down" }); h.at(1100, { key: "B", type: "up" });
    expect(h.events.filter(e => e.grade === "perfect")).toHaveLength(3);
    expect(h.events.filter(e => e.grade === "great")).toHaveLength(2);
    expect(releases(h).map(e => ({ key: e.key, deltaMs: e.deltaMs }))).toEqual([{ key: "B", deltaMs: -60 }, { key: "B", deltaMs: 0 }]);
    finishSuccessful(h, 1300);
  });

  it("NJ-R14: 동시 A/B 1040 up 수집 순서가 바뀌어도 B 1050 head와 1100 release 결과 동일", () => {
    const execute = (first: string, second: string) => {
      const h = createHarness([point(0, "double"), body(0, 1000, "doubleLong"), point(1000), body(1000, 1100, "doubleLong")]);
      h.at(0, { key: "A", type: "down" }, { key: "B", type: "down" }); h.at(1040, { key: first, type: "up" }, { key: second, type: "up" }); h.at(1050, { key: "B", type: "down" }); h.at(1100, { key: "B", type: "up" }); return h;
    };
    for (const h of [execute("A", "B"), execute("B", "A")]) {
      expect(h.events.filter(e => e.grade === "perfect")).toHaveLength(3);
      expect(h.events.filter(e => e.grade === "great")).toHaveLength(2);
      expect(releases(h).filter(e => e.inputAt === 1040).map(e => e.deltaMs)).toEqual([-60]);
      expect(releases(h).at(-1)).toMatchObject({ key: "B", grade: "perfect", deltaMs: 0 });
      finishSuccessful(h, 1300);
    }
  });

  it("NJ-R15: 첫 A release 뒤 노트 없는 A 재누름은 남은 terminal을 소비하지 않아 Miss", () => {
    const h = createHarness([point(0, "double"), body(0, 1000, "doubleLong")]);
    h.at(0, { key: "A", type: "down" }, { key: "B", type: "down" }); h.at(1000, { key: "A", type: "up" }); h.at(1005, { key: "A", type: "down" }); h.at(1010, { key: "A", type: "up" }); h.at(1121);
    expect(releases(h).filter(e => e.inputAt === 1000)).toHaveLength(1);
    expect(releases(h).find(e => e.inputAt === 1000)).toMatchObject({ key: "A", grade: "perfect", deltaMs: 0 });
    expect(releases(h).find(e => e.inputAt === null)).toMatchObject({ grade: "miss", consumed: false });
    expect(h.events.filter(e => e.kind === "maintenanceMiss")).toHaveLength(0);
    expect(counts(h.events)).toEqual({ perfect: 3, great: 0, good: 0, goodTrill: 0, miss: 1 });
  });
});

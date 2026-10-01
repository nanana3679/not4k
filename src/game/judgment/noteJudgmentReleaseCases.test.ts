import { describe, expect, it } from "vitest";
import type { NoteEntity } from "../../shared/types";
import { compileJudgmentChart } from "./compiledJudgmentChart";
import { NoteJudgmentSession } from "./NoteJudgmentSession";
import { createHarness, body, point, counts, type CaseInput } from "./noteJudgmentTestHarness";

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

describe("RFD0020 release 사례 NJ-R01~R16", () => {
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

  /** NJ-R16: single head 0 + [0,1000] → single head 1000 + [1000,2000]. A down 0으로 시작해 경계까지 유지한다. */
  const r16 = () => {
    const h = createHarness([point(0), body(0, 1000), point(1000), body(1000, 2000)]);
    h.at(0, { key: "A", type: "down" });
    return h;
  };
  const maintenance = (h: ReturnType<typeof createHarness>) => h.events.filter(e => e.kind === "maintenanceMiss");

  it("NJ-R16: 경계 1000을 지난 1015ms에 A를 떼고 1020ms에 B로 연결 head를 치면 유지 Miss 없이 Perfect 3", () => {
    const h = r16();
    h.at(1015, { key: "A", type: "up" }); h.at(1020, { key: "B", type: "down" }); h.at(2000, { key: "B", type: "up" });
    expect(heads(h).map(e => ({ grade: e.grade, deltaMs: e.deltaMs, key: e.key }))).toEqual([
      { grade: "perfect", deltaMs: 0, key: "A" }, { grade: "perfect", deltaMs: 20, key: "B" },
    ]);
    expect(releases(h)).toEqual([expect.objectContaining({ key: "B", grade: "perfect", deltaMs: 0, inputAt: 2000 })]);
    expect(maintenance(h)).toHaveLength(0);
    finishSuccessful(h, 2200);
  });

  it("NJ-R16: 1015ms에 A를 떼고 1100ms에 B로 연결 head를 늦게 치면 head Good(+100)이고 유지 Miss 없이 2000ms release Perfect", () => {
    const h = r16();
    h.at(1015, { key: "A", type: "up" }); h.at(1100, { key: "B", type: "down" }); h.at(2000, { key: "B", type: "up" });
    expect(grades(h)).toEqual(["perfect", "good", "perfect"]);
    expect(heads(h)[1]).toMatchObject({ key: "B", deltaMs: 100 });
    expect(releases(h)).toEqual([expect.objectContaining({ key: "B", grade: "perfect", deltaMs: 0 })]);
    expect(maintenance(h)).toHaveLength(0);
    finishSuccessful(h, 2200);
  });

  it("NJ-R16: 1015ms에 A를 뗀 뒤 연결 head 입력이 없으면 1119ms까지 Miss를 확정하지 않고 1120ms에 head Miss 하나와 끝 2000의 종속 0점으로 정리해 유지 Miss는 없음", () => {
    const h = r16();
    h.at(1015, { key: "A", type: "up" });
    h.at(1119);
    expect(h.events.filter(e => e.grade === "miss")).toHaveLength(0);
    h.at(1121); h.at(2200);
    expect(h.events.filter(e => e.grade === "miss").map(e => [e.kind, e.noteIndex, e.confirmedAt])).toEqual([
      ["head", 2, 1120], ["dependentZero", 3, 1120],
    ]);
    expect(maintenance(h)).toHaveLength(0);
    expect(releases(h)).toHaveLength(0);
    expect(counts(h.events)).toEqual({ perfect: 1, great: 0, good: 0, goodTrill: 0, miss: 1 });
  });

  it("NJ-R16: 1015ms에 A를 떼고 B down이 head 창 밖인 1130ms면 1120ms에 head Miss 하나와 종속 0점으로 정리되고 B는 바디를 되살리지 않음", () => {
    const h = r16();
    h.at(1015, { key: "A", type: "up" }); h.at(1130, { key: "B", type: "down" }); h.at(2000, { key: "B", type: "up" }); h.at(2200);
    expect(h.events.filter(e => e.grade === "miss").map(e => [e.kind, e.noteIndex, e.confirmedAt])).toEqual([
      ["head", 2, 1120], ["dependentZero", 3, 1120],
    ]);
    expect(maintenance(h)).toHaveLength(0);
    expect(releases(h)).toHaveLength(0);
    expect(counts(h.events)).toEqual({ perfect: 1, great: 0, good: 0, goodTrill: 0, miss: 1 });
  });

  it.each([
    ["경계 전 A up 995 → B down 1000", [[995, "A", "up"], [1000, "B", "down"]]],
    ["B down 1000 → 경계 뒤 A up 1015", [[1000, "B", "down"], [1015, "A", "up"]]],
  ] as const)("NJ-R16 대조: %s 뒤 B up 2000이면 기존대로 Perfect 3·Miss 0", (_label, steps) => {
    const h = r16();
    for (const [at, key, type] of steps) h.at(at, { key, type });
    h.at(2000, { key: "B", type: "up" });
    expect(grades(h)).toEqual(["perfect", "perfect", "perfect"]);
    expect(releases(h)).toEqual([expect.objectContaining({ key: "B", deltaMs: 0 })]);
    finishSuccessful(h, 2200);
  });

  it("NJ-R16 대조: head 1000을 1100ms에 늦게 쳐 60ms 바디 [1000,1060] 뒤 1155ms에 A를 떼고 1160ms에 B로 head 1060을 치면 유지 Miss 없이 2000ms release Perfect", () => {
    const h = createHarness([point(1000), body(1000, 1060), point(1060), body(1060, 2000)]);
    h.at(1100, { key: "A", type: "down" }); h.at(1155, { key: "A", type: "up" }); h.at(1160, { key: "B", type: "down" }); h.at(2000, { key: "B", type: "up" });
    expect(grades(h)).toEqual(["good", "good", "perfect"]);
    expect(heads(h).map(e => e.deltaMs)).toEqual([100, 100]);
    expect(releases(h)).toEqual([expect.objectContaining({ key: "B", grade: "perfect", deltaMs: 0 })]);
    expect(maintenance(h)).toHaveLength(0);
    finishSuccessful(h, 2200);
  });

  it("NJ-R16 대조: trillLong 체인 1000·1500·2000을 1030ms에 늦게 시작해 각 경계 +25ms에 떼고 +30ms에 다른 키로 교대하면 Perfect 4·Miss 0", () => {
    const h = createHarness([
      point(1000, "trill"), body(1000, 1500, "trillLong"), point(1500, "trill"), body(1500, 2000, "trillLong"),
      point(2000, "trill"), body(2000, 2500, "trillLong"),
    ], {}, [{ lane: 1, beat: { n: 1000, d: 1 }, endBeat: { n: 2500, d: 1 } }]);
    h.at(1030, { key: "A", type: "down" }); h.at(1525, { key: "A", type: "up" }); h.at(1530, { key: "B", type: "down" });
    h.at(2025, { key: "B", type: "up" }); h.at(2030, { key: "A", type: "down" }); h.at(2530, { key: "A", type: "up" });
    expect(heads(h).map(e => [e.grade, e.key])).toEqual([["perfect", "A"], ["perfect", "B"], ["perfect", "A"]]);
    expect(releases(h)).toEqual([expect.objectContaining({ key: "A", grade: "perfect", deltaMs: 30 })]);
    expect(maintenance(h)).toHaveLength(0);
    finishSuccessful(h, 2700);
  });

  it.each([1100, 1030])("NJ-R16: 뒤 바디 [1000,%i]가 head 기한 1120ms 전에 끝나도 1015ms에 A를 뗀 뒤 head 입력이 없으면 1120ms head Miss와 그 끝의 종속 0점으로 정리하고 유지 Miss·release Miss는 없음", (end) => {
    const h = createHarness([point(0), body(0, 1000), point(1000), body(1000, end)]);
    h.at(0, { key: "A", type: "down" }); h.at(1015, { key: "A", type: "up" }); h.at(1400);
    expect(h.events.filter(e => e.grade === "miss").map(e => [e.kind, e.noteIndex, e.confirmedAt])).toEqual([
      ["head", 2, 1120], ["dependentZero", 3, 1120],
    ]);
    expect(maintenance(h)).toHaveLength(0);
    expect(releases(h)).toHaveLength(0);
    expect(h.score.getState().processedNotes).toBe(h.compiled.scoreItems.length);
  });

  it("NJ-R16: 뒤 바디 [1000,1100] 뒤에 double [1100,2000]이 이어지면 1015ms에 A를 뗀 뒤 head 입력이 없을 때 1120ms head Miss와 시작하지 못한 double 두 unit의 1220ms 유지 Miss만 남고 [1000,1100]의 유지 Miss·release Miss는 없음", () => {
    const h = createHarness([point(0), body(0, 1000), point(1000), body(1000, 1100), body(1100, 2000, "doubleLong")]);
    h.at(0, { key: "A", type: "down" }); h.at(1015, { key: "A", type: "up" }); h.at(1400);
    expect(heads(h).filter(e => e.grade === "miss").map(e => [e.noteIndex, e.confirmedAt])).toEqual([[2, 1120]]);
    expect(releases(h)).toHaveLength(0);
    expect(maintenance(h).map(e => [e.noteIndex, e.unitIndex, e.confirmedAt])).toEqual([[4, 0, 1220], [4, 1, 1220]]);
    expect(h.score.getState().processedNotes).toBe(h.compiled.scoreItems.length);
  });

  /** RFD 0020 §2.12: 경계 뒤 교대가 실패하면 뒤 바디 길이와 관계없이 경계 전에 뗀 실패(NJ-R08)와 같게 처리한다. */
  it.each([
    ["[1000,2000]", 1, () => [point(0), body(0, 1000), point(1000), body(1000, 2000)]],
    ["짧은 [1000,1100]", 1, () => [point(0), body(0, 1000), point(1000), body(1000, 1100)]],
    ["[1000,1100] 뒤 doubleLong [1100,2000]", 3, () => [point(0), body(0, 1000), point(1000), body(1000, 1100), body(1100, 2000, "doubleLong")]],
  ] as const)("NJ-R16 대조: head 0 + [0,1000] → head 1000 + %s에서 A를 경계 전 995ms·경계 뒤 1015ms·1100ms에 떼고 연결 head가 없으면 세 실행의 판정·점수 항목·확정 시각이 같고 Miss %i개", (_label, misses, chart) => {
    const play = (upAt: number) => {
      const h = createHarness(chart());
      h.at(0, { key: "A", type: "down" }); h.at(upAt, { key: "A", type: "up" }); h.at(2400);
      const { judgmentCounts, achievementRate, processedNotes } = h.score.getState();
      return {
        events: h.events.map(e => [e.kind, e.noteIndex, e.unitIndex, e.itemId, e.grade, e.deltaMs, e.confirmedAt]),
        score: { judgmentCounts, achievementRate, processedNotes, total: h.compiled.scoreItems.length },
      };
    };
    const before = play(995);
    expect(before.score.judgmentCounts.miss).toBe(misses);
    expect(before.score.processedNotes).toBe(before.score.total);
    expect(play(1015)).toEqual(before);
    expect(play(1100)).toEqual(before);
  });

  /** NJ-R16 2→1 감소: double head 0 + doubleLong [0,1000] → single head 1000 + single. A/B down 0으로 시작해 C로 연결 head를 친다. */
  function decreaseSession(notes: readonly NoteEntity[], steps: readonly (readonly [number, ...CaseInput[]])[]) {
    const starts = new Map(notes.map((note, index) => [index, note.beat.n / note.beat.d] as [number, number]));
    const ends = new Map<number, number>();
    notes.forEach((note, index) => { if ("endBeat" in note) ends.set(index, note.endBeat.n / note.endBeat.d); });
    const s = new NoteJudgmentSession(compileJudgmentChart(notes, starts, ends));
    s.processBatch(0, [{ key: "A", lane: 1, type: "down" }, { key: "B", lane: 1, type: "down" }]);
    for (const [at, ...inputs] of steps) s.processBatch(at, inputs.map(input => ({ ...input, lane: input.lane ?? 1 })));
    const state = s.finalize();
    const scored = s.events.filter(e => e.kind === "head" || e.kind === "release" || e.kind === "holdOnly")
      .map(e => [e.itemId, e.grade, e.kind === "release" ? e.deltaMs : null]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    return { s, state, scored };
  }

  /**
   * head가 있는 2→1 감소 경계의 감소 release 항목은 RFD 0020 §2.13에 따라 #181에서 없앤다. 그때까지 아래는
   * 판정 규칙과 무관한 정산 안전성만 확인한다: 예외 없이 끝나고, 모든 점수 항목을 정확히 한 번씩 정산하며,
   * Full Combo면 빠진 항목이 없다.
   */
  function expectSettledOnce(run: () => ReturnType<typeof decreaseSession>) {
    let result: ReturnType<typeof decreaseSession> | undefined;
    expect(() => { result = run(); }).not.toThrow();
    const { state } = result!;
    expect({ settled: state.processedNotes, fullComboWithUnsettled: state.isFullCombo && state.processedNotes !== state.totalNotes })
      .toEqual({ settled: state.totalNotes, fullComboWithUnsettled: false });
    return result!;
  }

  it("NJ-R16 2→1 감소: single [1000,1200] 뒤 doubleLong [1200,2000]이 이어질 때 1015ms에 A를 떼고 1020ms에 C로 head를 친 뒤 B up 1100ms면 세션이 예외 없이 모든 점수 항목을 한 번씩 정산하고 경계 전 교대(A 995ms → C 1000ms)와 점수 항목·달성률이 같음", () => {
    const chart = () => [point(0, "double"), body(0, 1000, "doubleLong"), point(1000), body(1000, 1200), point(1200), body(1200, 2000, "doubleLong")];
    const rest = [[1100, { key: "B", type: "up" }], [1200, { key: "D", type: "down" }], [2000, { key: "C", type: "up" }, { key: "D", type: "up" }]] as const;
    const after = expectSettledOnce(() => decreaseSession(chart(), [[1015, { key: "A", type: "up" }], [1020, { key: "C", type: "down" }], ...rest]));
    const before = expectSettledOnce(() => decreaseSession(chart(), [[995, { key: "A", type: "up" }], [1000, { key: "C", type: "down" }], ...rest]));
    expect(after.scored).toEqual(before.scored);
    expect(after.state.achievementRate).toBe(before.state.achievementRate);
  });

  it.each([
    ["B up 1030ms", [[1030, { key: "B", type: "up" }], [2000, { key: "C", type: "up" }]]],
    ["B up 1100ms", [[1100, { key: "B", type: "up" }], [2000, { key: "C", type: "up" }]]],
    ["B를 2000ms까지 유지해 C와 함께 뗌", [[2000, { key: "B", type: "up" }, { key: "C", type: "up" }]]],
  ] as const)("NJ-R16 2→1 감소: single [1000,2000]에서 1015ms에 A를 떼고 1020ms에 C로 head를 친 뒤 %s이면 세션이 예외 없이 모든 점수 항목을 한 번씩 정산하고 거짓 Full Combo가 없음", (_label, steps) => {
    expectSettledOnce(() => decreaseSession([point(0, "double"), body(0, 1000, "doubleLong"), point(1000), body(1000, 2000)], [
      [1015, { key: "A", type: "up" }], [1020, { key: "C", type: "down" }], ...steps,
    ]));
  });

  it.each([
    ["C head 1080ms 뒤 B up 1100ms", [[1080, { key: "C", type: "down" }], [1100, { key: "B", type: "up" }], [1150, { key: "C", type: "up" }]]],
    ["C head 1080ms 뒤 B를 1300ms까지 유지", [[1080, { key: "C", type: "down" }], [1150, { key: "C", type: "up" }], [1300, { key: "B", type: "up" }]]],
    ["C head 1030ms(뒤 바디 끝 1060ms 전) 뒤 B up 1100ms", [[1030, { key: "C", type: "down" }], [1100, { key: "B", type: "up" }], [1150, { key: "C", type: "up" }]]],
  ] as const)("NJ-R16 2→1 감소: 짧은 holdOnly 뒤 바디 [1000,1060]이 1015ms A up으로 연결 head보다 먼저 완료되고 %s이면 세션이 예외 없이 모든 점수 항목을 한 번씩 정산하고 거짓 Full Combo가 없음", (_label, steps) => {
    expectSettledOnce(() => decreaseSession([point(0, "double"), body(0, 1000, "doubleLong"), point(1000), body(1000, 1060, "long", true)], [
      [1015, { key: "A", type: "up" }], ...steps,
    ]));
  });

  it("NJ-R16 2→1 감소: 970ms에 C로 연결 head 1060을 먼저 친 뒤 A up 1005ms가 연결 up으로 보류되고 C up 1085ms·B up 1155ms가 이어지면 1180ms 연결 head 기한에 보류 up을 남은 항목 없는 release로 내보내지 않아 세션 예외 없이 모든 점수 항목을 한 번씩 정산", () => {
    expectSettledOnce(() => decreaseSession([point(0, "double"), body(0, 1000, "doubleLong", true), body(1000, 1060, "doubleLong"), point(1060), body(1060, 1160)], [
      [970, { key: "C", type: "down" }], [1005, { key: "A", type: "up" }], [1085, { key: "C", type: "up" }], [1155, { key: "B", type: "up" }],
    ]));
  });

  // RFD 0020 §2.13(사용자 결정 2026-10-01): head가 있는 2→1 감소 경계는 head가 그 경계의 판정이며 감소 release 항목이 없다. 구현은 #181.
  it.todo("NJ-R16 2→1 감소 #181: double head 0 + doubleLong [0,1000] → single head 1000 + single [1000,2000]에서 A up 1015·B up 1030으로 둘 다 떼고 C로 head 1020을 친 뒤 C up 2000이면 감소 release 항목 없이 점수 항목 4개(head 3·release 1)가 모두 Perfect이고 Miss 0");
  it.todo("NJ-R16 2→1 감소 #181: 같은 차트에서 경계 전 A up 995·C down 1000·B up 1030·C up 2000이면 1030ms 유지 Miss 없이 감소 release 항목 없는 점수 항목 4개 모두 Perfect, Miss 0");
  it.todo("NJ-R16 2→1 감소 #181: 같은 차트에서 A를 2000ms까지 쥔 채 B만 C로 옮기면(B up 1015 → C down 1020 → A·C up 2000) 두 키를 쥐어도 감소 release 항목 없이 Miss 0이고 마지막 release Perfect");
});

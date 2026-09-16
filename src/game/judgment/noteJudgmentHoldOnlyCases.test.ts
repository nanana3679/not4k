import { describe, expect, it } from "vitest";
import { body, counts, createHarness, judgments, point } from "./noteJudgmentTestHarness";

type Input = { key: string; type: "down" | "up"; lane?: 1 | 2 | 3 | 4 };
const down = (key: string): Input => ({ key, type: "down" });
const up = (key: string): Input => ({ key, type: "up" });

function grades(h: ReturnType<typeof createHarness>) {
  return h.events.filter((event) => event.kind === "head" || event.kind === "release" || event.kind === "holdOnly");
}

function expectEvent(h: ReturnType<typeof createHarness>, kind: string, noteIndex: number, grade: string, deltaMs: number) {
  expect(grades(h)).toContainEqual(expect.objectContaining({ kind, noteIndex, grade, deltaMs }));
}

function expectNoExtraMiss(h: ReturnType<typeof createHarness>) {
  expect(h.events.filter((event) => event.grade === "miss")).toHaveLength(0);
}

describe("NJ-H01~H07: holdOnly와 승계", () => {
  it("NJ-H01: double head 0과 holdOnly [0,1000]을 A/B로 유지하면 경계 Perfect 두 개와 뒤 승계를 만든다", () => {
    const h = createHarness([
      point(0, "double"),
      body(0, 1000, "doubleLong", true),
      body(1000, 2000),
    ]);
    h.at(0, down("A"), down("B"));
    h.at(1000);
    expectEvent(h, "head", 0, "perfect", 0);
    expect(h.events.filter((event) => event.kind === "holdOnly")).toHaveLength(2);
    expect(h.events.filter((event) => event.kind === "holdOnly")).toEqual([
      expect.objectContaining({ noteIndex: 1, unitIndex: 0, grade: "perfect", deltaMs: 0 }),
      expect.objectContaining({ noteIndex: 1, unitIndex: 1, grade: "perfect", deltaMs: 0 }),
    ]);
    expect(h.score.getState().processedNotes).toBe(4);
    expectNoExtraMiss(h);
  });

  it("NJ-H02: Q1의 두 holdOnly 감소는 A/B 유지로 1060 double을 자동 승계하고 2000 release만 소비한다", () => {
    const h = createHarness([
      point(0, "double"), body(0, 1000, "doubleLong", true), body(1000, 1060),
      body(1060, 1100, "doubleLong", true), body(1100, 2000),
    ]);
    h.at(0, down("A"), down("B"));
    h.at(1000); h.at(1060); h.at(1100); h.at(2000, up("A")); h.at(2500, up("B"));
    expect(h.events.filter((event) => event.kind === "holdOnly")).toHaveLength(4);
    expect(h.events.filter((event) => event.kind === "holdOnly")).toEqual([
      expect.objectContaining({ noteIndex: 1, unitIndex: 0, grade: "perfect", deltaMs: 0 }),
      expect.objectContaining({ noteIndex: 1, unitIndex: 1, grade: "perfect", deltaMs: 0 }),
      expect.objectContaining({ noteIndex: 3, unitIndex: 0, grade: "perfect", deltaMs: 0 }),
      expect.objectContaining({ noteIndex: 3, unitIndex: 1, grade: "perfect", deltaMs: 0 }),
    ]);
    expect(h.events.filter((event) => event.kind === "release")).toHaveLength(1);
    expectEvent(h, "release", 4, "perfect", 0);
    expect(h.score.getState().processedNotes).toBe(7);
    expectNoExtraMiss(h);
  });

  it("NJ-H03: H01에서 A를 2000에 떼고 B를 2500까지 유지해도 마지막 release Perfect 하나만 발생한다", () => {
    const h = createHarness([point(0, "double"), body(0, 1000, "doubleLong", true), body(1000, 2000)]);
    h.at(0, down("A"), down("B")); h.at(1000); h.at(2000, up("A")); h.at(2500, up("B"));
    expectEvent(h, "release", 2, "perfect", 0);
    expect(h.events.filter((event) => event.kind === "release")).toHaveLength(1);
    expect(h.score.getState().processedNotes).toBe(5);
    expectNoExtraMiss(h);
  });

  it("NJ-H04: 면제 뒤 head 없는 double [1060,2000]은 A release 후 B unit이 2121에 Miss가 된다", () => {
    const h = createHarness([point(0, "double"), body(0, 1000, "doubleLong", true), body(1000, 1060), body(1060, 2000, "doubleLong")]);
    h.at(0, down("A"), down("B")); h.at(1000); h.at(1060); h.at(2000, up("A")); h.at(2121); h.at(2200, up("B"));
    expect(h.events.filter((event) => event.kind === "release" && event.grade === "perfect")).toHaveLength(1);
    expect(h.events.filter((event) => event.kind === "release" && event.noteIndex === 3 && event.grade === "miss")).toHaveLength(1);
    expect(h.score.getState().processedNotes).toBe(6);
  });

  it("NJ-H05: double head 1000에서 늦은 A/B tap은 holdOnly 두 개와 마지막 release를 모두 성공시킨다", () => {
    const h = createHarness([point(1000, "double"), body(1000, 1060, "doubleLong", true), body(1060, 2000)]);
    h.at(1090, down("A")); h.at(1095, up("A")); h.at(1100, down("B")); h.at(2000, up("B"));
    expectEvent(h, "head", 0, "good", 90); expectEvent(h, "head", 0, "good", 100);
    expect(h.events.filter((event) => event.kind === "holdOnly")).toHaveLength(2);
    expect(h.events.filter((event) => event.kind === "holdOnly")).toEqual([
      expect.objectContaining({ noteIndex: 1, unitIndex: 0, grade: "perfect", deltaMs: 0 }),
      expect.objectContaining({ noteIndex: 1, unitIndex: 1, grade: "perfect", deltaMs: 0 }),
    ]);
    expectEvent(h, "release", 2, "perfect", 0);
    expect(counts(judgments(h.events))).toEqual({ perfect: 3, great: 0, good: 2, goodTrill: 0, miss: 0 });
    expectNoExtraMiss(h);
  });

  it("NJ-H06: 뒤 single 끝이 1120이면 A up 1095가 먼저 terminal Perfect가 된다", () => {
    const h = createHarness([point(1000, "double"), body(1000, 1060, "doubleLong", true), body(1060, 1120)]);
    h.at(1090, down("A")); h.at(1095, up("A")); h.at(1100, down("B")); h.at(1300, up("B"));
    expectEvent(h, "release", 2, "perfect", -25);
    expect(h.events.filter((event) => event.kind === "release")).toHaveLength(1);
    expect(h.events.filter((event) => event.kind === "holdOnly")).toEqual([
      expect.objectContaining({ noteIndex: 1, unitIndex: 0, grade: "perfect", deltaMs: 0 }),
      expect.objectContaining({ noteIndex: 1, unitIndex: 1, grade: "perfect", deltaMs: 0 }),
    ]);
    expectNoExtraMiss(h);
  });

  it("NJ-H07: holdOnly [1000,1060]의 A up 하나가 상태 Perfect와 뒤 release Great를 함께 완료한다", () => {
    for (const [at, delta] of [[1050, -70], [1070, -50]] as const) {
      const h = createHarness([body(1000, 1060, "long", true), body(1060, 1120)]);
      h.at(1000, down("A")); h.at(at, up("A"));
      h.at(1300);
      expect(h.events.filter((event) => event.kind === "holdOnly")).toEqual([
        expect.objectContaining({ noteIndex: 0, unitIndex: 0, grade: "perfect", deltaMs: 0 }),
      ]);
      expectEvent(h, "release", 1, "great", delta);
      expect(h.events.filter((event) => event.kind === "release")).toHaveLength(1);
      expect(counts(judgments(h.events))).toEqual({ perfect: 1, great: 1, good: 0, goodTrill: 0, miss: 0 });
      expectNoExtraMiss(h);
    }
  });
});

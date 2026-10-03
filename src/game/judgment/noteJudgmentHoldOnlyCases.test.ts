import { describe, expect, it } from "vitest";
import type { NoteEntity } from "../../shared/types";
import { validateChart } from "../../shared/validation";
import { compileJudgmentChart } from "./compiledJudgmentChart";
import type { NoteJudgmentEvent } from "./NoteJudgmentCore";
import { NoteJudgmentSession } from "./NoteJudgmentSession";
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

  it.each([1000, 1040])("NJ-H03 변형: double head 1000을 A %ims·B 1110ms로 나눠 쳐 두 키를 유지하면 A up 2000ms가 뒤 single [1060,2000]의 release Perfect이고 B up 2200ms는 추가 판정 없음", (aAt) => {
    const h = createHarness([point(1000, "double"), body(1000, 1060, "doubleLong", true), body(1060, 2000)]);
    h.at(aAt, down("A")); h.at(1110, down("B")); h.at(2000, up("A")); h.at(2200, up("B")); h.at(2300);
    expect(h.events.filter((event) => event.kind === "holdOnly")).toHaveLength(2);
    expect(h.events.filter((event) => event.kind === "release")).toEqual([
      expect.objectContaining({ noteIndex: 2, grade: "perfect", deltaMs: 0, key: "A" }),
    ]);
    expectNoExtraMiss(h);
  });

  it.each([1000, 1040])("NJ-H03 변형: head 없는 doubleLong holdOnly [1000,1060]을 A %ims·B 1100ms로 나눠 시작해 유지하면 A up 2000ms가 뒤 single [1060,2000]의 release Perfect", (aAt) => {
    const h = createHarness([body(1000, 1060, "doubleLong", true), body(1060, 2000)]);
    h.at(aAt, down("A")); h.at(1100, down("B")); h.at(2000, up("A")); h.at(2200, up("B")); h.at(2300);
    expect(h.events.filter((event) => event.kind === "holdOnly")).toHaveLength(2);
    expect(h.events.filter((event) => event.kind === "release")).toEqual([
      expect.objectContaining({ noteIndex: 1, grade: "perfect", deltaMs: 0, key: "A" }),
    ]);
    expectNoExtraMiss(h);
  });

  // 면제 몫 상향은 바로 이어지는 뒤 바디가 진행 중일 때만 적용한다(RFD 0020 §2.3). 그 바디가 끝난 뒤의 활성화는 PRD §12 미정.
  it.todo("NJ-H03 미정: double head 1000 + doubleLong holdOnly [1000,1060] → single [1060,1100] → doubleLong [1100,2000]에서 A 1000ms·B 1110ms로 나눠 쳐 2000ms까지 유지하면 B 1090ms처럼 release 2개 Perfect인지 (현재 doubleLong unit1이 1220ms Miss)");

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

describe("NJ-H08: 늦게 시작한 holdOnly의 승계", () => {
  // o-*-*-*-: head 1000 + holdOnly 세 구간 + 일반 마지막 구간이 정확히 맞닿는다.
  const tickChain = () => [
    point(1000), body(1000, 1500, "long", true), body(1500, 2000, "long", true),
    body(2000, 2500, "long", true), body(2500, 3000),
  ];

  function frameSession(notes: readonly NoteEntity[]) {
    const starts = new Map(notes.map((note, index) => [index, note.beat.n / note.beat.d] as [number, number]));
    const ends = new Map<number, number>();
    notes.forEach((note, index) => { if ("endBeat" in note) ends.set(index, note.endBeat.n / note.endBeat.d); });
    return new NoteJudgmentSession(compileJudgmentChart(notes, starts, ends));
  }

  it("NJ-H08: o-*-*-*-에서 head를 1001·1030·1100ms에 늦게 눌러 3000ms까지 유지하면 holdOnly 3개와 마지막 release Perfect, Miss 0", () => {
    for (const [at, grade] of [[1001, "perfect"], [1030, "perfect"], [1100, "good"]] as const) {
      const h = createHarness(tickChain());
      h.at(at, down("A")); h.at(3000, up("A")); h.at(3300);
      expectEvent(h, "head", 0, grade, at - 1000);
      expect(h.events.filter((event) => event.kind === "holdOnly")).toEqual([
        expect.objectContaining({ noteIndex: 1, grade: "perfect", confirmedAt: 1500 }),
        expect.objectContaining({ noteIndex: 2, grade: "perfect", confirmedAt: 2000 }),
        expect.objectContaining({ noteIndex: 3, grade: "perfect", confirmedAt: 2500 }),
      ]);
      expect(h.events.filter((event) => event.kind === "release")).toEqual([
        expect.objectContaining({ noteIndex: 4, grade: "perfect", deltaMs: 0 }),
      ]);
      expect(h.score.getState().processedNotes).toBe(5);
      expectNoExtraMiss(h);
    }
  });

  it("NJ-H08: head 없는 holdOnly [1000,2000]을 1050ms에 늦게 시작해 3000ms까지 유지하면 뒤 일반 [2000,3000]을 승계해 holdOnly Perfect와 release Perfect", () => {
    const h = createHarness([body(1000, 2000, "long", true), body(2000, 3000)]);
    h.at(1050, down("A")); h.at(3000, up("A")); h.at(3300);
    expect(h.events.filter((event) => event.kind === "holdOnly")).toEqual([
      expect.objectContaining({ noteIndex: 0, grade: "perfect", confirmedAt: 2000 }),
    ]);
    expectEvent(h, "release", 1, "perfect", 0);
    expect(counts(judgments(h.events))).toEqual({ perfect: 2, great: 0, good: 0, goodTrill: 0, miss: 0 });
    expectNoExtraMiss(h);
  });

  it("NJ-H08: double head 1000을 A/B 1040ms에 늦게 쳐도 doubleLong holdOnly [1000,2000] 두 개 Perfect 뒤 A up 3000ms가 single release Perfect이고 B up 3200ms는 추가 판정 없음", () => {
    const h = createHarness([point(1000, "double"), body(1000, 2000, "doubleLong", true), body(2000, 3000)]);
    h.at(1040, down("A"), down("B")); h.at(2000); h.at(3000, up("A")); h.at(3200, up("B")); h.at(3300);
    expect(h.events.filter((event) => event.kind === "head")).toEqual([
      expect.objectContaining({ noteIndex: 0, grade: "perfect", deltaMs: 40 }),
      expect.objectContaining({ noteIndex: 0, grade: "perfect", deltaMs: 40 }),
    ]);
    expect(h.events.filter((event) => event.kind === "holdOnly")).toEqual([
      expect.objectContaining({ noteIndex: 1, unitIndex: 0, grade: "perfect", deltaMs: 0 }),
      expect.objectContaining({ noteIndex: 1, unitIndex: 1, grade: "perfect", deltaMs: 0 }),
    ]);
    expect(h.events.filter((event) => event.kind === "release")).toEqual([
      expect.objectContaining({ noteIndex: 2, grade: "perfect", deltaMs: 0, key: "A" }),
    ]);
    expect(h.score.getState().processedNotes).toBe(5);
    expectNoExtraMiss(h);
  });

  it("NJ-H08: double head 1000을 A/B 1040ms에 늦게 친 뒤 A를 1500ms에 떼 holdOnly 한 unit이 실패해도 held B가 뒤 single [2000,3000]을 승계해 3000ms release Perfect", () => {
    const h = createHarness([point(1000, "double"), body(1000, 2000, "doubleLong", true), body(2000, 3000)]);
    h.at(1040, down("A"), down("B")); h.at(1500, up("A")); h.at(3000, up("B")); h.at(3300);
    expect(h.events.filter((event) => event.kind === "maintenanceMiss")).toEqual([
      expect.objectContaining({ noteIndex: 1, confirmedAt: 1500 }),
    ]);
    expect(h.events.filter((event) => event.kind === "holdOnly")).toEqual([
      expect.objectContaining({ noteIndex: 1, grade: "perfect", confirmedAt: 2000 }),
    ]);
    expect(h.events.filter((event) => event.kind === "release")).toEqual([
      expect.objectContaining({ noteIndex: 2, grade: "perfect", deltaMs: 0, key: "B" }),
    ]);
  });

  it("NJ-H08: double head 1000에 A만 1040ms에 늦게 치고 둘째 head를 놓쳐도 held A가 뒤 single [2000,3000]을 승계해 3000ms release Perfect", () => {
    const h = createHarness([point(1000, "double"), body(1000, 2000, "doubleLong", true), body(2000, 3000)]);
    h.at(1040, down("A")); h.at(3000, up("A")); h.at(3300);
    expect(h.events.filter((event) => event.kind === "head")).toEqual([
      expect.objectContaining({ noteIndex: 0, grade: "perfect", deltaMs: 40 }),
      expect.objectContaining({ noteIndex: 0, grade: "miss", confirmedAt: 1120 }),
    ]);
    expect(h.events.filter((event) => event.kind === "holdOnly")).toEqual([
      expect.objectContaining({ noteIndex: 1, grade: "perfect", confirmedAt: 2000 }),
    ]);
    expect(h.events.filter((event) => event.kind === "release")).toEqual([
      expect.objectContaining({ noteIndex: 2, grade: "perfect", deltaMs: 0, key: "A" }),
    ]);
    expect(h.events.filter((event) => event.kind === "maintenanceMiss")).toEqual([]);
  });

  it("NJ-H08: holdOnly [1000,1060]을 E 이후 1100ms에 첫 활성화하면 뒤 일반 [1060,2000]을 승계해 2000ms up이 release Perfect", () => {
    const h = createHarness([body(1000, 1060, "long", true), body(1060, 2000)]);
    h.at(1060); h.at(1100, down("A")); h.at(2000, up("A")); h.at(2300);
    expect(h.events.filter((event) => event.kind === "holdOnly")).toEqual([
      expect.objectContaining({ noteIndex: 0, grade: "perfect", confirmedAt: 1100 }),
    ]);
    expectEvent(h, "release", 1, "perfect", 0);
    expect(counts(judgments(h.events))).toEqual({ perfect: 2, great: 0, good: 0, goodTrill: 0, miss: 0 });
    expectNoExtraMiss(h);
  });

  it("NJ-H08: NoteJudgmentSession을 16ms 프레임으로 advance하며 1030ms 늦은 head를 3000ms까지 유지해도 o-*-*-*-는 Perfect 5·Miss 0", () => {
    // 1030ms를 프레임 사이 입력(processBatch)과 1040ms 프레임에 늦게 관측한 입력(processObservedBatch) 두 경로로 넣는다.
    for (const observed of [false, true]) {
      const s = frameSession(tickChain());
      let frame = 0;
      for (; frame < 1030; frame += 16) s.advance(frame);
      if (observed) { s.advance(frame); s.processObservedBatch(1030, [{ key: "A", lane: 1, type: "down" }], frame); }
      else s.processBatch(1030, [{ key: "A", lane: 1, type: "down" }]);
      for (frame += 16; frame < 3000; frame += 16) s.advance(frame);
      s.processBatch(3000, [{ key: "A", lane: 1, type: "up" }]);
      const state = s.finalize();
      expect(s.events.map((event) => `${event.kind}:${event.grade}`), `observed=${observed}`).toEqual([
        "head:perfect", "holdOnly:perfect", "holdOnly:perfect", "holdOnly:perfect", "release:perfect",
      ]);
      expect(state.judgmentCounts.perfect).toBe(5); expect(state.judgmentCounts.miss).toBe(0); expect(state.isFullCombo).toBe(true);
    }
  });

  it("NJ-H08 대조: o-*-*-*-에서 head를 S+Good 뒤 1121ms에 누르면 head Miss이고 held A로 뒤 구간을 하나도 시작·부활시키지 못함", () => {
    const h = createHarness(tickChain());
    h.at(1121, down("A")); h.at(3000, up("A")); h.at(3300);
    expect(h.events.filter((event) => event.kind === "head")).toEqual([
      expect.objectContaining({ noteIndex: 0, grade: "miss" }),
    ]);
    expect(h.events.filter((event) => event.grade !== "miss")).toEqual([]);
    expect(h.events.filter((event) => event.kind === "maintenanceMiss").map((event) => [event.noteIndex, event.confirmedAt])).toEqual([
      [2, 1620], [3, 2120], [4, 2620],
    ]);
    expect(h.core.bodyStates.every((state) => !state.active && state.failed)).toBe(true);
  });

  it("NJ-H08 대조: head 1000을 A 1050ms에 늦게 쳐 일반 [1000,1060]을 시작하고 B 1060ms로 doubleLong [1060,2000] 증가분을 채우면 A/B up 2000ms가 release Perfect 2개", () => {
    const h = createHarness([point(1000), body(1000, 1060), body(1060, 2000, "doubleLong")]);
    h.at(1050, down("A")); h.at(1060, down("B")); h.at(2000, up("A"), up("B")); h.at(2300);
    expectEvent(h, "head", 0, "great", 50);
    expect(h.events.filter((event) => event.kind === "release")).toEqual([
      expect.objectContaining({ noteIndex: 2, grade: "perfect", deltaMs: 0 }),
      expect.objectContaining({ noteIndex: 2, grade: "perfect", deltaMs: 0 }),
    ]);
    expectNoExtraMiss(h);
  });

  it("NJ-H08 대조: o-o-의 head 0을 A 30ms에 늦게 쳐 2000ms까지 유지하면 head 1000만 Miss이고 A가 승계한 [1000,2000]의 release는 Perfect", () => {
    const h = createHarness([point(0), body(0, 1000), point(1000), body(1000, 2000)]);
    h.at(30, down("A")); h.at(2000, up("A")); h.at(2300);
    expect(h.events.filter((event) => event.grade === "miss")).toEqual([
      expect.objectContaining({ kind: "head", noteIndex: 2, confirmedAt: 1120 }),
    ]);
    expectEvent(h, "release", 3, "perfect", 0);
    expect(h.events.filter((event) => event.kind === "dependentZero")).toEqual([]);
  });

  it("NJ-H08 대조: 1030ms 늦은 head의 holdOnly [1000,2000] 뒤 10ms 틈이 있는 [2010,3000]은 held A로 시작하지 못해 2130ms에 Miss", () => {
    const h = createHarness([point(1000), body(1000, 2000, "long", true), body(2010, 3000)]);
    h.at(1030, down("A")); h.at(3000, up("A")); h.at(3300);
    expectEvent(h, "head", 0, "perfect", 30);
    expect(h.events.filter((event) => event.kind === "holdOnly")).toEqual([
      expect.objectContaining({ noteIndex: 1, grade: "perfect", confirmedAt: 2000 }),
    ]);
    expect(h.events.filter((event) => event.kind === "maintenanceMiss")).toEqual([
      expect.objectContaining({ noteIndex: 2, confirmedAt: 2130 }),
    ]);
    expect(h.events.filter((event) => event.kind === "release")).toEqual([]);
  });
});

type Step = readonly [number, ...Input[]];

/**
 * 실제 NoteJudgmentSession으로 끝까지 재생해 정산 예외를 잡고, 한 번도 정산하지 않은 점수 항목을 함께 돌려준다.
 * 차트는 validateChart를 통과해야 한다.
 */
function playSession(notes: readonly NoteEntity[], steps: readonly Step[]) {
  expect(validateChart({ notes: [...notes], trillZones: [], events: [] })).toEqual([]);
  const starts = new Map(notes.map((note, index) => [index, note.beat.n / note.beat.d] as [number, number]));
  const ends = new Map<number, number>();
  notes.forEach((note, index) => { if ("endBeat" in note) ends.set(index, note.endBeat.n / note.endBeat.d); });
  const compiled = compileJudgmentChart(notes, starts, ends);
  const session = new NoteJudgmentSession(compiled);
  let error: string | undefined;
  try {
    for (const [at, ...inputs] of steps) session.processBatch(at, inputs.map((input) => ({ ...input, lane: input.lane ?? 1 })));
    session.finalize();
  } catch (caught) {
    error = (caught as Error).message;
  }
  const settled = new Set(session.events.filter((event) => event.kind !== "maintenanceMiss").map((event) => event.itemId));
  return {
    error,
    session,
    events: session.events,
    state: session.score.getState(),
    unsettled: compiled.scoreItems.map((item) => item.itemId).filter((itemId) => !settled.has(itemId)),
  };
}
const missTimeline = (events: readonly NoteJudgmentEvent[]) => events.filter((event) => event.grade === "miss")
  .map((event) => [event.kind, event.noteIndex, event.confirmedAt]);
const timeline = (events: readonly NoteJudgmentEvent[]) => events
  .map((event) => [event.kind, event.noteIndex, event.unitIndex, event.itemId, event.grade, event.deltaMs, event.confirmedAt]);

describe("#180: E+Good까지 미확정인 holdOnly unit의 정산", () => {
  /** 이슈 #180 본문 차트: head 1000 + [1000,1100] → head 1100 + holdOnly [1100,1160]. A down 1000으로 시작한다. */
  const issueChart = () => [point(1000), body(1000, 1100), point(1100), body(1100, 1160, "long", true)];

  it("#180 회귀: head 1000 + [1000,1100] → head 1100 + holdOnly [1100,1160]에서 A를 경계 1100ms에 떼고 입력이 없으면 세션 예외 없이 1220ms에 head Miss 하나와 holdOnly 끝의 종속 0점으로 정리", () => {
    const r = playSession(issueChart(), [[1000, down("A")], [1100, up("A")]]);
    expect(r.error).toBeUndefined();
    expect(missTimeline(r.events)).toEqual([["head", 2, 1220], ["dependentZero", 3, 1220]]);
    expect(r.events.filter((event) => event.kind === "release" || event.kind === "maintenanceMiss")).toEqual([]);
    expect(r.unsettled).toEqual([]);
    expect(r.state.judgmentCounts.miss).toBe(1);
  });

  it("#180 회귀 대조: 같은 차트에서 A를 경계 전 1095ms에 떼면 1100ms에 뗀 실행과 판정·점수 항목·확정 시각이 같음 (NJ-R08)", () => {
    const at1095 = playSession(issueChart(), [[1000, down("A")], [1095, up("A")]]);
    const at1100 = playSession(issueChart(), [[1000, down("A")], [1100, up("A")]]);
    expect(at1095.error).toBeUndefined();
    expect(timeline(at1095.events)).toEqual(timeline(at1100.events));
  });

  it("#180 회귀 대조: 같은 차트에서 A를 holdOnly 끝 1160ms 뒤 1200ms까지 쥐면 1160ms holdOnly Perfect와 1220ms head Miss이고 종속 0점은 없음", () => {
    const r = playSession(issueChart(), [[1000, down("A")], [1200, up("A")]]);
    expect(r.error).toBeUndefined();
    expect(r.events.filter((event) => event.kind === "holdOnly").map((event) => [event.noteIndex, event.grade, event.confirmedAt])).toEqual([[3, "perfect", 1160]]);
    expect(missTimeline(r.events)).toEqual([["head", 2, 1220]]);
    expect(r.unsettled).toEqual([]);
  });

  it("#180 회귀 대조: 같은 차트에서 A를 경계 뒤 1105ms에 떼면 세션 예외 없이 점수 항목 3개를 한 번씩 정산하고 Miss는 head 하나", () => {
    const r = playSession(issueChart(), [[1000, down("A")], [1105, up("A")]]);
    expect(r.error).toBeUndefined();
    expect(r.unsettled).toEqual([]);
    expect(r.state.judgmentCounts.miss).toBe(1);
  });

  // PRD §12에서 추적하는 RFD 0020 §2.12의 남은 차이(R1). #180과 별개인 이른 완료 경로다.
  it.todo("R1: 같은 차트에서 경계 뒤 A up 1105ms(holdOnly E−Good 1040 이후)도 §2.12에 따라 1095ms와 같은 head Miss·종속 0점이어야 하나 현재 이른 완료로 holdOnly Perfect(1105ms)");

  it.each([
    ["head 없는 [1000,1500]", 1455, () => [body(1000, 1500), body(1500, 1560, "doubleLong", true)]],
    ["head 1000 + [1000,1500]", 1470, () => [point(1000), body(1000, 1500), body(1500, 1560, "doubleLong", true)]],
  ] as const)("#180: %s → head 없는 doubleLong holdOnly [1500,1560] 증가에서 A down 1000 뒤 경계 전 %ims에 떼고 입력이 없으면 세션 예외 없이 holdOnly에 release 판정이 없고, 시작 입력 없는 증가 unit은 1620ms 유지 Miss와 종속 0점이며, 모든 점수 항목을 한 번씩 정산", (_label, upAt, chart) => {
    const notes = chart();
    const holdOnlyIndex = notes.length - 1;
    const r = playSession(notes, [[1000, down("A")], [upAt, up("A")]]);
    expect(r.error).toBeUndefined();
    expect(r.events.filter((event) => event.kind === "release")).toEqual([]);
    expect(r.events.filter((event) => event.noteIndex === holdOnlyIndex && event.unitIndex === 1).map((event) => [event.kind, event.confirmedAt]))
      .toEqual([["maintenanceMiss", 1620], ["dependentZero", 1620]]);
    expect(r.unsettled).toEqual([]);
  });

  it("#180: head 없는 doubleLong [1000,1200] → holdOnly [1200,1260] 2→1 감소에서 A/B down 1000 → B up 1160 → A up 1170 → D down 1180이면 세션 예외 없이 B up이 감소 release Perfect(-40)이고 holdOnly에는 release 판정 없이 모든 점수 항목을 한 번씩 정산", () => {
    const r = playSession([body(1000, 1200, "doubleLong"), body(1200, 1260, "long", true)], [
      [1000, down("A"), down("B")], [1160, up("B")], [1170, up("A")], [1180, down("D")],
    ]);
    expect(r.error).toBeUndefined();
    expect(r.events.filter((event) => event.kind === "release").map((event) => [event.noteIndex, event.grade, event.deltaMs, event.key]))
      .toEqual([[0, "perfect", -40, "B"]]);
    expect(r.unsettled).toEqual([]);
  });

  it.each([
    ["끝 holdOnly [1500,1560]", 2, () => [body(1000, 1500, "long", true), body(1500, 1560, "long", true)]],
    ["holdOnly [1500,1560] → holdOnly [1560,2060]", 3, () => [body(1000, 1500, "long", true), body(1500, 1560, "long", true), body(1560, 2060, "long", true)]],
  ] as const)("#180: head 없는 holdOnly [1000,1500] → %s 체인에서 A down 1000 뒤 1455ms에 떼면 앞 holdOnly는 이른 완료 Perfect(1455ms)이고 세션 예외·release 판정 없이 holdOnly 점수 항목 %i개를 모두 한 번씩 정산", (_label, items, chart) => {
    const r = playSession(chart(), [[1000, down("A")], [1455, up("A")]]);
    expect(r.error).toBeUndefined();
    expect(r.events.filter((event) => event.kind === "holdOnly" && event.noteIndex === 0).map((event) => [event.grade, event.confirmedAt])).toEqual([["perfect", 1455]]);
    expect(r.events.filter((event) => event.kind === "release")).toEqual([]);
    expect(r.state.totalNotes).toBe(items);
    expect(r.unsettled).toEqual([]);
  });
});

describe("NJ-A07: 이어지는 바디는 E−Good까지만 유지하고 뗀 키의 시작 준비는 풀림 (RFD 0020 §2.14)", () => {
  /** [종류, 노트, unit, 등급, deltaMs, 입력 시각, 확정 시각]. 같은 시각의 판정은 엔진이 확정한 순서 그대로다. */
  const outcome = (events: readonly NoteJudgmentEvent[]) => events
    .map((event) => [event.kind, event.noteIndex, event.unitIndex, event.grade, event.deltaMs, event.inputAt, event.confirmedAt]);
  const releaseKeys = (events: readonly NoteJudgmentEvent[]) => events.filter((event) => event.kind === "release").map((event) => event.key);
  /** 첫 batch(첫 시작 입력)만 at으로 옮긴다. 나머지 입력은 그대로 둔다. */
  const withFirstAt = (steps: readonly Step[], at: number): Step[] => steps.map((step, index) => index === 0 ? [at, ...step.slice(1)] as unknown as Step : step);

  const startFail = (noteIndex: number, unitIndex: number, at: number) => [
    ["maintenanceMiss", noteIndex, unitIndex, "miss", 120, null, at],
    ["dependentZero", noteIndex, unitIndex, "miss", 0, null, at],
  ];

  // U1·U2: head 없는 single [1000,1500] → head 없는 doubleLong holdOnly [1500,1560](1→2 증가). 앞 E−Good 1380, 뒤 E−Good 1440.
  const increase = (end: number) => () => [body(1000, 1500), body(1500, end, "doubleLong", true)];

  it.each([1455, 1500])("NJ-A07 U1·U2: head 없는 [1000,1500] → doubleLong holdOnly [1500,1560]에서 A down 1000 뒤 A를 %ims(뒤 E−Good 1440 이후)에 떼면 앞 바디 Miss 없이 A로 이어진 unit은 1620ms에 Perfect, 아무도 누르지 않은 증가 unit만 1620ms 시작 실패로 Miss 1", (upAt) => {
    const r = playSession(increase(1560)(), [[1000, down("A")], [upAt, up("A")]]);
    expect(r.error).toBeUndefined();
    expect(outcome(r.events)).toEqual([
      ["holdOnly", 1, 0, "perfect", 0, upAt, 1620],
      ...startFail(1, 1, 1620),
    ]);
    expect(r.state.judgmentCounts.miss).toBe(1);
    expect(r.unsettled).toEqual([]);
  });

  it("NJ-A07 U1·U2: 같은 차트에서 A를 1430ms(앞 E−Good 1380 이후, 뒤 E−Good 1440 전)에 떼면 앞 바디 Miss 없이 뒤 두 unit만 1620ms 시작 실패로 Miss 2", () => {
    const r = playSession(increase(1560)(), [[1000, down("A")], [1430, up("A")]]);
    expect(outcome(r.events)).toEqual([...startFail(1, 0, 1620), ...startFail(1, 1, 1620)]);
    expect(r.state.judgmentCounts.miss).toBe(2);
    expect(r.unsettled).toEqual([]);
  });

  it("NJ-A07 대조: 같은 차트에서 A를 뒤 S 이후 1520ms에 떼면 쥔 채 이어받은 unit은 1520ms 이른 완료 Perfect, 증가 unit만 1620ms Miss (종전과 같음)", () => {
    const r = playSession(increase(1560)(), [[1000, down("A")], [1520, up("A")]]);
    expect(outcome(r.events)).toEqual([["holdOnly", 1, 0, "perfect", 0, 1520, 1520], ...startFail(1, 1, 1620)]);
  });

  it("NJ-A07 대조: 같은 차트에서 A를 앞 E−Good 1380 전인 1300ms에 떼면 앞 바디 중간 유지 Miss와 뒤 두 unit 시작 실패로 Miss 3 (종전과 같음)", () => {
    const r = playSession(increase(1560)(), [[1000, down("A")], [1300, up("A")]]);
    expect(outcome(r.events)).toEqual([
      ["maintenanceMiss", 0, 0, "miss", 300, null, 1300],
      ...startFail(1, 0, 1620), ...startFail(1, 1, 1620),
    ]);
  });

  it.each([1430, 1455, 1500])("NJ-A07 U1·U2: 뒤 바디가 긴 doubleLong holdOnly [1500,2000]이면 A를 %ims에 떼도 E−Good 1880 전이라 A로 충족하지 못해 앞 바디 Miss 없이 뒤 두 unit만 1620ms 시작 실패로 Miss 2", (upAt) => {
    const r = playSession(increase(2000)(), [[1000, down("A")], [upAt, up("A")]]);
    expect(outcome(r.events)).toEqual([...startFail(1, 0, 1620), ...startFail(1, 1, 1620)]);
    expect(r.state.judgmentCounts.miss).toBe(2);
    expect(r.unsettled).toEqual([]);
  });

  it("NJ-A07 대조: 뒤 바디가 [1500,2000]이고 A를 뒤 S 이후 1520ms에 떼면 이어받은 unit의 1520ms 중간 유지 Miss와 증가 unit 1620ms Miss (종전과 같음)", () => {
    const r = playSession(increase(2000)(), [[1000, down("A")], [1520, up("A")]]);
    expect(outcome(r.events)).toEqual([
      ["maintenanceMiss", 1, 0, "miss", 20, null, 1520], ["dependentZero", 1, 0, "miss", 0, null, 1520],
      ...startFail(1, 1, 1620),
    ]);
  });

  it("NJ-A07 ①: 짧은 doubleLong holdOnly [1500,1560]에서 A up 1455 뒤 B를 1500ms에 눌러 증가 unit을 시작하면 B의 unit은 1560ms에 Perfect, A로 이어진 unit은 1620ms에 A up으로 Perfect, Full Combo", () => {
    const r = playSession(increase(1560)(), [[1000, down("A")], [1455, up("A")], [1500, down("B")]]);
    expect(outcome(r.events)).toEqual([
      ["holdOnly", 1, 1, "perfect", 0, null, 1560],
      ["holdOnly", 1, 0, "perfect", 0, 1455, 1620],
    ]);
    expect(r.state.isFullCombo).toBe(true);
    expect(r.unsettled).toEqual([]);
  });

  // U3: head 없는 doubleLong [1000,1200] → head 없는 single [1200,1260](2→1 감소). A·B down 1000, 뒤 E−Good 1140, 시작 창 1080~1320.
  const decrease = (holdOnly: boolean) => () => [body(1000, 1200, "doubleLong"), body(1200, 1260, "long", holdOnly)];
  const decreaseStart: Step = [1000, down("A"), down("B")];

  it.each([
    ["B up 1160 → A up 1170 → D down 1180, D는 1400ms까지 유지", [[1160, up("B")], [1170, up("A")], [1180, down("D")], [1400, up("D")]], "perfect", -40],
    ["A up 1100 → B up 1160 → D down 1180", [[1100, up("A")], [1160, up("B")], [1180, down("D")]], "good", -100],
  ] as const)("NJ-A07 U3: 감소 뒤 holdOnly [1200,1260]에서 %s면 뗀 A의 준비가 풀리고 시작 창 안의 D가 뒤 바디를 이어가 1260ms Perfect, Miss 0", (_label, rest, firstGrade, firstDelta) => {
    const r = playSession(decrease(true)(), [decreaseStart, ...rest as unknown as Step[]]);
    expect(outcome(r.events)).toEqual([
      ["release", 0, 0, firstGrade, firstDelta, 1200 + firstDelta, 1200 + firstDelta],
      ["holdOnly", 1, 0, "perfect", 0, null, 1260],
    ]);
    expect(r.state.isFullCombo).toBe(true);
    expect(r.unsettled).toEqual([]);
  });

  it("NJ-A07 U3·U2: 감소 뒤 holdOnly [1200,1260]에서 B up 1160 → A up 1170 뒤 새 키가 없으면 A를 E−Good 1140 이후까지 유지했으므로 시작 창이 닫히는 1320ms에 Perfect", () => {
    const r = playSession(decrease(true)(), [decreaseStart, [1160, up("B")], [1170, up("A")]]);
    expect(outcome(r.events)).toEqual([
      ["release", 0, 0, "perfect", -40, 1160, 1160],
      ["holdOnly", 1, 0, "perfect", 0, 1170, 1320],
    ]);
    expect(r.state.isFullCombo).toBe(true);
    expect(r.unsettled).toEqual([]);
  });

  it.each([
    ["B up 1160 → A up 1170 → D down 1180, D up 1310", [[1160, up("B")], [1170, up("A")], [1180, down("D")], [1310, up("D")]], "perfect", -40, "B"],
    ["A up 1100 → B up 1160 → D down 1180, D up 1310", [[1100, up("A")], [1160, up("B")], [1180, down("D")], [1310, up("D")]], "good", -100, "A"],
  ] as const)("NJ-A07 U3: 감소 뒤 일반 [1200,1260]에서 %s면 D가 뒤 바디를 이어가고 D up이 뒤 release Great(+50)이며 뗀 A up은 뒤 release에 쓰지 않음", (_label, rest, firstGrade, firstDelta, firstKey) => {
    const r = playSession(decrease(false)(), [decreaseStart, ...rest as unknown as Step[]]);
    expect(outcome(r.events)).toEqual([
      ["release", 0, 0, firstGrade, firstDelta, 1200 + firstDelta, 1200 + firstDelta],
      ["release", 1, 0, "great", 50, 1310, 1310],
    ]);
    expect(releaseKeys(r.events)).toEqual([firstKey, "D"]);
    expect(r.unsettled).toEqual([]);
  });

  it("NJ-A07 U3: 감소 뒤 일반 [1200,1260]에서 B up 1160 → A up 1170 → D down 1180 뒤 D를 계속 쥐면 D의 release가 남아 1380ms release Miss", () => {
    const r = playSession(decrease(false)(), [decreaseStart, [1160, up("B")], [1170, up("A")], [1180, down("D")]]);
    expect(outcome(r.events)).toEqual([
      ["release", 0, 0, "perfect", -40, 1160, 1160],
      ["release", 1, 0, "miss", 120, null, 1380],
    ]);
  });

  it("NJ-A07 U3·U2: 감소 뒤 일반 [1200,1260]에서 B up 1160 → A up 1170 뒤 새 키가 없으면 A up이 뒤 release Good(−90)이며 시작 창이 닫히는 1320ms에 확정", () => {
    const r = playSession(decrease(false)(), [decreaseStart, [1160, up("B")], [1170, up("A")]]);
    expect(outcome(r.events)).toEqual([
      ["release", 0, 0, "perfect", -40, 1160, 1160],
      ["release", 1, 0, "good", -90, 1170, 1320],
    ]);
    expect(releaseKeys(r.events)).toEqual(["B", "A"]);
    expect(r.state.isFullCombo).toBe(true);
  });

  it.each([true, false])("NJ-A07 대조: 감소 뒤 바디(holdOnly=%s)에서 B up 1100(감소 release Good −100) → A up 1120(뒤 E−Good 1140 전) 뒤 새 키가 없으면 앞 바디 Miss 없이 뒤 바디만 1320ms 시작 실패로 Miss 1", (holdOnly) => {
    const r = playSession(decrease(holdOnly)(), [decreaseStart, [1100, up("B")], [1120, up("A")]]);
    expect(outcome(r.events)).toEqual([["release", 0, 0, "good", -100, 1100, 1100], ...startFail(1, 0, 1320)]);
    expect(r.state.judgmentCounts.miss).toBe(1);
    expect(r.unsettled).toEqual([]);
  });

  it("NJ-A07 대조: 감소 뒤 holdOnly [1200,1260]에서 B up 1100 → A up 1120 → D down 1180이면 A로는 충족하지 못해도 D가 이어가 1260ms Perfect", () => {
    const r = playSession(decrease(true)(), [decreaseStart, [1100, up("B")], [1120, up("A")], [1180, down("D")]]);
    expect(outcome(r.events)).toEqual([["release", 0, 0, "good", -100, 1100, 1100], ["holdOnly", 1, 0, "perfect", 0, null, 1260]]);
    expect(r.state.isFullCombo).toBe(true);
  });

  it.each([
    [true, [["holdOnly", 1, 0, "perfect", 0, null, 1260]]],
    [false, [["release", 1, 0, "great", 50, 1310, 1310]]],
  ] as const)("NJ-A07 U3: 감소 뒤 바디(holdOnly=%s)에서 B up 1160 → A up 1170 뒤 뒤 S 이후·E 전 1250ms에 D를 누르면 D가 이어가고 일반 바디는 D up 1310이 release", (holdOnly, tail) => {
    const r = playSession(decrease(holdOnly)(), [decreaseStart, [1160, up("B")], [1170, up("A")], [1250, down("D")], [1310, up("D")]]);
    expect(outcome(r.events)).toEqual([["release", 0, 0, "perfect", -40, 1160, 1160], ...tail]);
    expect(r.state.isFullCombo).toBe(true);
  });

  // 사용자 결정 ②의 인수 기한(2026-10-01): "바디가 이미 끝난 뒤(E 이후)에 누른 키는 그 바디를 이어받을 수 없고 다음 노트로 간다". 뗀 몫의 인수 기한은 min(E, S+Good)이다.
  it.each([
    [true, [["holdOnly", 1, 0, "perfect", 0, 1170, 1320]]],
    [false, [["release", 1, 0, "good", -90, 1170, 1320]]],
  ] as const)("NJ-A07 ② 인수 기한: 감소 뒤 바디(holdOnly=%s)에서 B up 1160 → A up 1170 뒤 뒤 E 1260 이후 1300ms에 누른 D는 뗀 A의 몫을 이어받지 못해 A up으로 판정하고 1320ms에 확정, D up 1310은 쓰이지 않음", (holdOnly, tail) => {
    const r = playSession(decrease(holdOnly)(), [decreaseStart, [1160, up("B")], [1170, up("A")], [1300, down("D")], [1310, up("D")]]);
    expect(outcome(r.events)).toEqual([["release", 0, 0, "perfect", -40, 1160, 1160], ...tail]);
    expect(releaseKeys(r.events)).not.toContain("D");
    expect(r.state.isFullCombo).toBe(true);
    expect(r.unsettled).toEqual([]);
  });

  it("NJ-A07 대조: 감소 뒤 holdOnly [1200,1260]에서 A를 경계까지 쥐면 B up 1160 뒤 D down 1180은 시작에 쓰지 않고 A가 이어가 1260ms Perfect (NJ-A04처럼 쥔 키의 준비는 그대로)", () => {
    const r = playSession(decrease(true)(), [decreaseStart, [1160, up("B")], [1180, down("D")], [1400, up("A"), up("D")]]);
    expect(outcome(r.events)).toEqual([["release", 0, 0, "perfect", -40, 1160, 1160], ["holdOnly", 1, 0, "perfect", 0, null, 1260]]);
    expect(r.session.core.bodyStates.find((state) => state.noteIndex === 1)?.registeredKeys).toEqual(["A"]);
  });

  // U4: head 없는 holdOnly [1000,1500] → holdOnly [1500,1560] 또는 [1500,2000].
  const chain = (end: number) => () => [body(1000, 1500, "long", true), body(1500, end, "long", true)];

  it("NJ-A07 U4: holdOnly [1000,1500] → holdOnly [1500,1560]에서 A up 1455면 앞은 1455ms 이른 완료 Perfect, 뒤는 E−Good 1440 이후까지 유지했으므로 1620ms에 Perfect", () => {
    const r = playSession(chain(1560)(), [[1000, down("A")], [1455, up("A")]]);
    expect(outcome(r.events)).toEqual([["holdOnly", 0, 0, "perfect", 0, 1455, 1455], ["holdOnly", 1, 0, "perfect", 0, 1455, 1620]]);
    expect(r.state.isFullCombo).toBe(true);
    expect(r.unsettled).toEqual([]);
  });

  it("NJ-A07 U4: holdOnly [1000,1500] → holdOnly [1500,2000]에서 A up 1455면 앞은 Perfect, 뒤는 새 키가 필요해 1620ms 시작 실패 (종전과 같음)", () => {
    const r = playSession(chain(2000)(), [[1000, down("A")], [1455, up("A")]]);
    expect(outcome(r.events)).toEqual([["holdOnly", 0, 0, "perfect", 0, 1455, 1455], ...startFail(1, 0, 1620)]);
  });

  it.each([[1560, 1470], [1560, 1550], [2000, 1470]])("NJ-A07 U4·U3: holdOnly [1000,1500] → holdOnly [1500,%i]에서 A up 1455 뒤 시작 창 안 %ims에 D를 누르면 D가 뒤 holdOnly를 이어가 E에 Perfect", (end, dAt) => {
    const r = playSession(chain(end)(), [[1000, down("A")], [1455, up("A")], [dAt, down("D")]]);
    expect(outcome(r.events)).toEqual([["holdOnly", 0, 0, "perfect", 0, 1455, 1455], ["holdOnly", 1, 0, "perfect", 0, null, end]]);
    expect(r.state.isFullCombo).toBe(true);
  });

  it("NJ-A07 U3: NJ-H07 차트 holdOnly [1000,1060] → [1060,1120]에서 A up 1050 뒤 새 키가 없으면 뒤 release Great(−70)는 시작 창이 닫히는 1180ms에 확정", () => {
    const r = playSession([body(1000, 1060, "long", true), body(1060, 1120)], [[1000, down("A")], [1050, up("A")]]);
    expect(outcome(r.events)).toEqual([["holdOnly", 0, 0, "perfect", 0, 1050, 1050], ["release", 1, 0, "great", -70, 1050, 1180]]);
  });

  it("NJ-A07 U3: NJ-H07 차트에서 A up 1050 뒤 D를 1070ms에 눌러 1100ms에 떼면 D가 뒤 바디를 이어가 D up이 release Perfect(−20)이고 A up은 뒤 release에 쓰지 않음", () => {
    const r = playSession([body(1000, 1060, "long", true), body(1060, 1120)], [[1000, down("A")], [1050, up("A")], [1070, down("D")], [1100, up("D")]]);
    expect(outcome(r.events)).toEqual([["holdOnly", 0, 0, "perfect", 0, 1050, 1050], ["release", 1, 0, "perfect", -20, 1100, 1100]]);
    expect(releaseKeys(r.events)).toEqual(["D"]);
  });

  // PR #188 리뷰 MEDIUM-1: 보류 up 하나로 짧은 바디 둘 이상을 잇는 체인. 모든 unit을 정확히 한 번 정산한다.
  it("NJ-A07 체인: [1000,1500] → doubleLong holdOnly [1500,1560] → [1560,1570]에서 A up 1455면 A로 이어진 unit Perfect(1620ms), 증가 unit 시작 실패(1620ms), 끝 release는 A up의 Good(−115)(1680ms)", () => {
    const r = playSession([body(1000, 1500), body(1500, 1560, "doubleLong", true), body(1560, 1570)], [[1000, down("A")], [1455, up("A")]]);
    expect(r.error).toBeUndefined();
    expect(outcome(r.events)).toEqual([
      ["holdOnly", 1, 0, "perfect", 0, 1455, 1620], ...startFail(1, 1, 1620),
      ["release", 2, 0, "good", -115, 1455, 1680],
    ]);
    expect(r.unsettled).toEqual([]);
  });

  it("NJ-A07 체인: holdOnly [1000,1500] → holdOnly [1500,1540] → [1540,1560]에서 A up 1450이면 앞 Perfect(1450ms), 가운데 Perfect(1620ms), 끝 release Good(−110)(1660ms)로 Full Combo", () => {
    const r = playSession([body(1000, 1500, "long", true), body(1500, 1540, "long", true), body(1540, 1560)], [[1000, down("A")], [1450, up("A")]]);
    expect(outcome(r.events)).toEqual([
      ["holdOnly", 0, 0, "perfect", 0, 1450, 1450], ["holdOnly", 1, 0, "perfect", 0, 1450, 1620],
      ["release", 2, 0, "good", -110, 1450, 1660],
    ]);
    expect(r.state.isFullCombo).toBe(true);
    expect(r.unsettled).toEqual([]);
  });

  it("NJ-A07 체인: [1000,1500] → doubleLong holdOnly [1500,1540] → doubleLong holdOnly [1540,1560]에서 A up 1450이면 A로 이어진 두 unit Perfect(1620·1660ms), 아무도 누르지 않은 두 unit 시작 실패로 Miss 2", () => {
    const r = playSession([body(1000, 1500), body(1500, 1540, "doubleLong", true), body(1540, 1560, "doubleLong", true)], [[1000, down("A")], [1450, up("A")]]);
    expect(outcome(r.events)).toEqual([
      ["holdOnly", 1, 0, "perfect", 0, 1450, 1620], ...startFail(1, 1, 1620),
      ["holdOnly", 2, 0, "perfect", 0, 1450, 1660], ...startFail(2, 1, 1660),
    ]);
    expect(r.state.judgmentCounts.miss).toBe(2);
    expect(r.unsettled).toEqual([]);
  });

  // 아래 대조는 뗀 키 말고도 준비가 남아 있거나 경계에 head가 있어 §2.14의 보류를 적용하지 않는 경우다. 결과는 종전과 같다.
  it("NJ-A07 대조: head 없는 doubleLong holdOnly [1000,1060] → [1060,1120]에서 B를 쥔 채 A만 1030ms에 떼면 준비가 풀리지 않아 A up이 곧바로 뒤 release Good(−90)이고 1030ms에 확정 (NJ-H03·H07)", () => {
    const r = playSession([body(1000, 1060, "doubleLong", true), body(1060, 1120)], [[1000, down("A"), down("B")], [1030, up("A")]]);
    expect(r.events.filter((event) => event.kind === "release").map((event) => [event.noteIndex, event.grade, event.deltaMs, event.confirmedAt, event.key]))
      .toEqual([[1, "good", -90, 1030, "A"]]);
    expect(r.state.isFullCombo).toBe(true);
    expect(r.unsettled).toEqual([]);
  });

  it("NJ-A07 대조: head 1000 + doubleLong holdOnly [1000,1200] → doubleLong [1200,1260] → head 1260 + [1260,1320]에서 A up 1200 뒤 D가 head를 1290ms에 치면 A up은 1260 경계의 교대 후보로 쓰이고 감소 release 항목은 1380ms Miss로 한 번만 정산", () => {
    const r = playSession([point(1000), body(1000, 1200, "doubleLong", true), body(1200, 1260, "doubleLong"), point(1260), body(1260, 1320)],
      [[1000, down("A")], [1200, up("A")], [1230, down("C")], [1290, down("D")], [1315, down("B")]]);
    expect(r.events.filter((event) => event.kind === "release" || event.kind === "head").map((event) => [event.kind, event.noteIndex, event.unitIndex, event.grade, event.confirmedAt]))
      .toEqual([["head", 0, 0, "perfect", 1000], ["head", 3, 0, "perfect", 1290], ["release", 2, 0, "miss", 1380], ["release", 4, 0, "miss", 1440]]);
    expect(r.unsettled).toEqual([]);
  });

  it("NJ-A07 대조: double head 1000 + doubleLong [1000,2000] → head 2000 + holdOnly [2000,2100] → doubleLong [2100,2200]에서 C가 head를 1965ms에 치고 A up 2020·B up 2090이면 B up이 감소 release Good(+90)이고 Full Combo", () => {
    const r = playSession([point(1000, "double"), body(1000, 2000, "doubleLong"), point(2000), body(2000, 2100, "long", true), body(2100, 2200, "doubleLong")], [
      [1000, down("A"), down("B")], [1965, down("C")], [2020, up("A")], [2090, up("B")], [2100, down("D")], [2160, up("C")], [2250, up("D")],
    ]);
    expect(r.events.filter((event) => event.kind === "release").map((event) => [event.noteIndex, event.unitIndex, event.grade, event.deltaMs, event.key]))
      .toEqual([[1, 0, "good", 90, "B"], [4, 0, "perfect", -40, "C"], [4, 1, "great", 50, "D"]]);
    expect(r.state.isFullCombo).toBe(true);
  });

  // RFD 0020 §2.7: 첫 시작을 30ms 늦게 눌러도(S+Good 안의 정당한 시작) 같은 입력의 결과가 같다. 모두 head 없는 차트라 전체 판정이 같아야 한다.
  it.each([
    ["U1·U2 짧은 증가 A up 1455", increase(1560), [[1000, down("A")], [1455, up("A")]]],
    ["U1·U2 짧은 증가 A up 1430", increase(1560), [[1000, down("A")], [1430, up("A")]]],
    ["U1·U2 긴 증가 A up 1455", increase(2000), [[1000, down("A")], [1455, up("A")]]],
    ["U3 holdOnly D 이어감", decrease(true), [decreaseStart, [1160, up("B")], [1170, up("A")], [1180, down("D")]]],
    ["U3 holdOnly 새 키 없음", decrease(true), [decreaseStart, [1160, up("B")], [1170, up("A")]]],
    ["U3 일반 새 키 없음", decrease(false), [decreaseStart, [1160, up("B")], [1170, up("A")]]],
    ["U3 일반 D 이어감", decrease(false), [decreaseStart, [1160, up("B")], [1170, up("A")], [1250, down("D")], [1310, up("D")]]],
    ["U4 짧은 체인", chain(1560), [[1000, down("A")], [1455, up("A")]]],
    ["U4 D 이어감", chain(1560), [[1000, down("A")], [1455, up("A")], [1550, down("D")]]],
  ] as const)("NJ-A07 §2.7: %s에서 첫 시작을 1030ms로 30ms 늦춰도 모든 판정·등급·확정 시각이 같음", (_label, chart, steps) => {
    const onTime = playSession(chart(), steps as unknown as Step[]);
    const late = playSession(chart(), withFirstAt(steps as unknown as Step[], 1030));
    expect(late.error).toBeUndefined();
    expect(outcome(late.events)).toEqual(outcome(onTime.events));
  });

  // PR #188 리뷰 2차 HIGH-1: 마지막 쥔 키의 up으로 S까지 미룬 승계도, 그 up이 끝 head의 교대 up으로 쓰이면 head가 먼저 이어받게 한다.
  // 사용자 결정 ④(2026-10-01, 답 "가"): 뒤 바디 끝의 head는 뗀 키의 up을 교대 up으로 써서 그 바디를 잇는 입력이므로, 그 head를 친 새 down은 뗀 몫을 이어받지 않고 head로 간다(결정 ②의 예외).
  const headedTail = () => [body(1000, 1500, "long", true), body(1500, 1560), point(1560), body(1560, 1760)];

  it.each([
    [1000, 1490, -70],
    [1000, 1500, -60],
    [1030, 1490, -70],
    [1000, 1510, -50],
  ] as const)("NJ-A07 U2·Point 우선: holdOnly [1000,1500] → [1500,1560] → head 1560 + [1560,1760]에서 A를 %ims에 눌러 1450ms(뒤 E−Good 1440 이후)에 떼고 D가 head를 %ims에 치면 A up이 head 1560의 교대 up으로 [1500,1560]을 이어 head Great(%ims)와 D up 1760 release Perfect로 Full Combo", (aAt, dAt, delta) => {
    const r = playSession(headedTail(), [[aAt, down("A")], [1450, up("A")], [dAt, down("D")], [1760, up("D")]]);
    expect(outcome(r.events)).toEqual([
      ["holdOnly", 0, 0, "perfect", 0, 1450, 1450],
      ["head", 2, 0, "great", delta, dAt, dAt],
      ["release", 3, 0, "perfect", 0, 1760, 1760],
    ]);
    expect(r.state.isFullCombo).toBe(true);
    expect(r.unsettled).toEqual([]);
  });

  // 사용자 결정(2026-10-03, (나)): 새 down은 아직 끝나지 않은 가장 이른 노트에 간다. A up이 가운데 바디를 충족하지 못하면(1430 < E−Good 1440)
  // A up은 앞 holdOnly만 끝내고 가운데 바디는 끝나지 않았으므로, D는 결정 ③대로 가운데 바디를 시작하고 끝 head는 자기 입력이 따로 필요하다.
  // 원문: "A up하면 n1은 처리가 끝났고 그럼 d가 그다음 노트인 n2를 받는거 아니야?",
  // "원래 a를 1560까지 누르고있어야 하는데 일찍떼서 한번 덜누른게 맞음 a를 일찍떼고 퍼펙트 하려면 d 이후에 한번더 눌러야함".
  // PR #188 리뷰 5차 MEDIUM-A: 종전 엔진은 충족 여부와 관계없이 D를 head에 줘 head Great(−70)·가운데 시작 실패로 88.9%였다.
  const middleBody = (r: ReturnType<typeof playSession>) => r.session.core.bodyStates.find((state) => state.noteIndex === 1);

  it.each([
    [1000, 1490],
    [1030, 1490],
    [1000, 1510],
  ] as const)("NJ-A07 ④ 충족 못 함: holdOnly [1000,1500] → [1500,1560] → head 1560 + [1560,1760]에서 A를 %ims에 눌러 1430ms(가운데 E−Good 1440 전)에 떼고 D를 %ims에 눌러 1760ms까지 쥐면 D는 가운데 바디를 시작하고 head 1560은 1680ms Miss, D up 1760은 끝 release Perfect로 Miss 1·달성률 66.7%", (aAt, dAt) => {
    const r = playSession(headedTail(), [[aAt, down("A")], [1430, up("A")], [dAt, down("D")], [1760, up("D")]]);
    expect(r.error).toBeUndefined();
    expect(outcome(r.events)).toEqual([
      ["holdOnly", 0, 0, "perfect", 0, 1430, 1430],
      ["head", 2, 0, "miss", 120, null, 1680],
      ["release", 3, 0, "perfect", 0, 1760, 1760],
    ]);
    expect(middleBody(r)).toMatchObject({ failed: false, complete: true, registeredKeys: ["D"] });
    expect(releaseKeys(r.events)).toEqual(["D"]);
    expect(r.state.judgmentCounts.miss).toBe(1);
    expect(r.state.achievementRate).toBeCloseTo(200 / 3, 6);
    expect(r.unsettled).toEqual([]);
  });

  it.each([
    ["E down 1560과 같은 batch의 D up 1560(교대)", [[1560, up("D"), down("E")], [1760, up("E")]], "E", 0, 1560],
    ["D up 1550 → E down 1560", [[1550, up("D")], [1560, down("E")], [1760, up("E")]], "E", 0, 1560],
    ["E down 1560 → D up 1600(경계 뒤 교대)", [[1560, down("E")], [1600, up("D")], [1760, up("E")]], "E", 0, 1560],
    ["D up 1550 → 같은 키 D down 1560", [[1550, up("D")], [1560, down("D")], [1760, up("D")]], "D", 0, 1560],
    ["D up 1575(경계 뒤) → 같은 키 D down 1580", [[1575, up("D")], [1580, down("D")], [1760, up("D")]], "D", 20, 1580],
  ] as const)("NJ-A07 ④ 충족 못 함: 같은 차트에서 A up 1430 → D down 1490 뒤 %s로 head 1560을 한 번 더 누르면 D가 시작한 가운데 바디를 그 head가 교대로 이어 head Perfect와 끝 release Perfect로 Full Combo·달성률 100%", (_label, rest, tailKey, headDelta, headAt) => {
    const r = playSession(headedTail(), [[1000, down("A")], [1430, up("A")], [1490, down("D")], ...rest as unknown as Step[]]);
    expect(r.error).toBeUndefined();
    expect(outcome(r.events)).toEqual([
      ["holdOnly", 0, 0, "perfect", 0, 1430, 1430],
      ["head", 2, 0, "perfect", headDelta, headAt, headAt],
      ["release", 3, 0, "perfect", 0, 1760, 1760],
    ]);
    expect(releaseKeys(r.events)).toEqual([tailKey]);
    expect(r.state.isFullCombo).toBe(true);
    expect(r.state.achievementRate).toBe(100);
    expect(r.unsettled).toEqual([]);
  });

  // 사용자 확정(2026-10-03): 충족하지 못한 가운데 바디는 E 1560이 지나도 S+Good 1620까지 새 down으로 시작하므로(결정 ③), 그 창 안의 down은 끝 head의 창 안이어도 가운데 바디에 간다. head 없는 바디도 시작에 키 down 하나를 쓰는 노트다.
  it.each([1600, 1620])("NJ-A07 ④ 충족 못 함: 같은 차트에서 A up 1430 뒤 가운데 E 1560 이후 S+Good 1620까지인 %ims에 누른 D도 가운데 바디를 시작해 head 1560은 1680ms Miss, D up 1760은 끝 release Perfect로 Miss 1", (dAt) => {
    const r = playSession(headedTail(), [[1000, down("A")], [1430, up("A")], [dAt, down("D")], [1760, up("D")]]);
    expect(outcome(r.events)).toEqual([
      ["holdOnly", 0, 0, "perfect", 0, 1430, 1430],
      ["head", 2, 0, "miss", 120, null, 1680],
      ["release", 3, 0, "perfect", 0, 1760, 1760],
    ]);
    expect(middleBody(r)).toMatchObject({ failed: false, registeredKeys: ["D"] });
    expect(r.unsettled).toEqual([]);
  });

  it.todo("NJ-A07 ④ 충족 못 함 레가토(#205): 같은 차트에서 A up 1430 → D down 1490 → E down 1550(head Perfect −10) → D up 1555(경계 전) → E up 1760이면 D가 시작한 가운데 바디를 E의 head가 교대로 이어 Full Combo여야 하나, 현재 head 뒤 바디가 1555ms에 시작 전 유지 실패하고 가운데 바디도 1680ms에 실패해 Miss 2");

  // PR #188 리뷰 3차 HIGH-2: 위와 순서만 바꿔 head를 먼저 치고 A를 나중에 떼도(레가토 교대: 누르고 떼기) 같은 결과다.
  // head가 이미 성공했으면 A up은 곧바로 그 head의 교대 up으로 쓰이므로, S까지 미룬 [1500,1560]의 승계가 먼저 그 up을 이어받는다.
  it.each([
    [1560, 1470, 1475, "Good", -90],
    [1560, 1445, 1450, "Good", -115],
    [1560, 1480, 1495, "Great", -80],
    [1600, 1485, 1490, "Good", -115],
  ] as const)("NJ-A07 U2·Point 우선 역순: holdOnly [1000,1500] → [1500,%i] → 끝 head + 뒤 200ms 바디에서 A down 1000 뒤 D가 head를 %ims에 먼저 치고 A를 %ims(뒤 E−Good 이후)에 떼면 A up이 head의 교대 up으로 [1500,E]를 이어 head %s(%ims)와 D up release Perfect로 Full Combo", (end, dAt, aUp, grade, delta) => {
    const r = playSession([body(1000, 1500, "long", true), body(1500, end), point(end), body(end, end + 200)],
      [[1000, down("A")], [dAt, down("D")], [aUp, up("A")], [end + 200, up("D")]]);
    expect(outcome(r.events)).toEqual([
      ["head", 2, 0, grade.toLowerCase(), delta, dAt, dAt],
      ["holdOnly", 0, 0, "perfect", 0, aUp, aUp],
      ["release", 3, 0, "perfect", 0, end + 200, end + 200],
    ]);
    expect(r.state.isFullCombo).toBe(true);
    expect(r.unsettled).toEqual([]);
  });

  // PR #188 리뷰 4차 HIGH-1: 위 역순 처리는 S까지 미룬 뒤 바디의 끝 head가 그 up을 교대 up으로 쓸 때만 적용한다. A up이 이미 성공한
  // 더 이른 head 경계(1120)의 교대 up으로 쓰이면, 그 경계와 무관한 [1200,1240]은 그 up을 이어받지 않고 S에 종전대로 몫을 고른다.
  // 남은 unit(n4 unit 1)의 결과는 이 경계 구분과 무관한 #183 항목 3(holdOnly 이른 완료 뒤 늦게 친 둘째 head 키 C가 등록되지 않음) 때문에
  // 현재 1320ms 시작 실패다. 그 결함을 고치면 바뀔 수 있으므로 여기서는 정확히 한 번 정산되는지만 확인한다(PR #188 리뷰 5차 LOW-B).
  it.each([1200, 1199])("NJ-A07 지연 승계 경계 구분: head 1000 + [1000,1120] → double head 1120 + holdOnly [1120,1200] → doubleLong holdOnly [1200,1240]에서 A down 1000·B head 1175·B up과 C head 1195 뒤 A를 %ims에 떼면 A up은 head 1120의 교대 up이라 뒤 바디를 잇지 않고, B로 이어진 unit은 B up 1195로 1320ms Perfect이며 남은 unit을 포함해 모든 점수 항목을 한 번씩 정산", (aUp) => {
    const r = playSession([point(1000), body(1000, 1120), point(1120, "double"), body(1120, 1200, "long", true), body(1200, 1240, "doubleLong", true)],
      [[1000, down("A")], [1175, down("B")], [1195, up("B"), down("C")], [aUp, up("A")], [1280, up("C")]]);
    expect(r.error).toBeUndefined();
    expect(outcome(r.events.filter((event) => event.noteIndex === 4 && event.unitIndex === 0))).toEqual([["holdOnly", 4, 0, "perfect", 0, 1195, 1320]]);
    expect(r.events.filter((event) => event.noteIndex === 4 && event.unitIndex === 1 && event.kind !== "maintenanceMiss")).toHaveLength(1);
    expect(r.unsettled).toEqual([]);
  });

  // HIGH-2: double 뒤 바디는 unit마다 자기 몫을 이은 키 하나로 판정한다. 뗀 키 하나가 두 몫을 함께 충족하지 않고, 형제 몫의 키를 쥐고 있어도 뗀 몫은 풀린다.
  const doubleChain = (tailHoldOnly: boolean) => () => [body(1000, 1500, "doubleLong", true), body(1500, 1560, "doubleLong", tailHoldOnly)];

  it.each([1000, 1030])("NJ-A07 U2 몫별: doubleLong holdOnly [1000,1500] → doubleLong holdOnly [1500,1560]에서 A·B를 %ims에 누르고 A up 1430(뒤 E−Good 1440 전)·B up 1450이면 B의 몫만 1620ms Perfect이고 A의 몫은 1620ms 시작 실패로 Miss 1", (startAt) => {
    const r = playSession(doubleChain(true)(), [[startAt, down("A"), down("B")], [1430, up("A")], [1450, up("B")]]);
    expect(outcome(r.events)).toEqual([
      ["holdOnly", 0, 0, "perfect", 0, 1430, 1430], ["holdOnly", 0, 1, "perfect", 0, 1430, 1430],
      ["holdOnly", 1, 0, "perfect", 0, 1450, 1620], ...startFail(1, 1, 1620),
    ]);
    expect(r.state.judgmentCounts.miss).toBe(1);
    expect(r.unsettled).toEqual([]);
  });

  it("NJ-A07 U2 몫별 대조: 같은 차트에서 B를 뒤 S 이후 1520ms까지 쥐어도 A의 몫 하나만 Miss라 B up 1450보다 결과가 좋아지지 않음(Miss 1)", () => {
    const r = playSession(doubleChain(true)(), [[1000, down("A"), down("B")], [1430, up("A")], [1520, up("B")]]);
    expect(r.events.filter((event) => event.kind === "holdOnly" && event.noteIndex === 1).map((event) => [event.unitIndex, event.grade])).toEqual([[0, "perfect"]]);
    expect(r.state.judgmentCounts.miss).toBe(1);
    expect(r.unsettled).toEqual([]);
  });

  it("NJ-A07 U2 몫별: doubleLong holdOnly [1000,1500] → 일반 doubleLong [1500,1560]에서 A up 1430·B up 1450이면 B up이 B의 몫 release Good(−110)로 1620ms에 확정되고 A의 몫은 1620ms 시작 실패로 Miss 1", () => {
    const r = playSession(doubleChain(false)(), [[1000, down("A"), down("B")], [1430, up("A")], [1450, up("B")]]);
    expect(outcome(r.events)).toEqual([
      ["holdOnly", 0, 0, "perfect", 0, 1430, 1430], ["holdOnly", 0, 1, "perfect", 0, 1430, 1430],
      ["release", 1, 0, "good", -110, 1450, 1620], ...startFail(1, 1, 1620),
    ]);
    expect(releaseKeys(r.events)).toEqual(["B"]);
  });

  it("NJ-A07 U3 몫별: doubleLong holdOnly [1000,1500] → doubleLong holdOnly [1500,1560]에서 A up 1430·B up 1450 뒤 C를 1550ms에 누르면 C가 A의 몫을 이어 1560ms Perfect, B의 몫은 1620ms Perfect로 Full Combo", () => {
    const r = playSession(doubleChain(true)(), [[1000, down("A"), down("B")], [1430, up("A")], [1450, up("B")], [1550, down("C")]]);
    expect(outcome(r.events)).toEqual([
      ["holdOnly", 0, 0, "perfect", 0, 1430, 1430], ["holdOnly", 0, 1, "perfect", 0, 1430, 1430],
      ["holdOnly", 1, 0, "perfect", 0, null, 1560], ["holdOnly", 1, 1, "perfect", 0, 1450, 1620],
    ]);
    expect(r.state.isFullCombo).toBe(true);
  });

  // double head 1000 + [1000,1060] → doubleLong [1060,1120](NJ-A04 모양). A·B down 1000, A만 1020에 뗀다(뒤 S 전, 뒤 E−Good 1000 이후). B는 자기 몫을 쥐고 있다.
  const heldSibling = () => [point(1000, "double"), body(1000, 1060), body(1060, 1120, "doubleLong")];
  const heldSiblingStart: Step = [1000, down("A"), down("B")];
  const releases = (events: readonly NoteJudgmentEvent[]) => events.filter((event) => event.kind === "release")
    .map((event) => [event.grade, event.deltaMs, event.key, event.confirmedAt]);

  it.each([
    ["C down 1040(뒤 S 전)", 1040],
    ["C down 1080(뒤 S 이후, 시작 창 안)", 1080],
  ] as const)("NJ-A07 U3 몫별: double head 1000 + [1000,1060] → doubleLong [1060,1120]에서 B를 쥔 채 A만 1020ms에 떼고 %s → C up 1110 → B up 1120이면 C가 A의 몫을 이어 C up이 release Perfect(−10), B up이 release Perfect(0)로 Full Combo", (_label, cAt) => {
    const r = playSession(heldSibling(), [heldSiblingStart, [1020, up("A")], [cAt, down("C")], [1110, up("C")], [1120, up("B")]]);
    expect(releases(r.events)).toEqual([["perfect", -10, "C", 1110], ["perfect", 0, "B", 1120]]);
    expect(r.state.isFullCombo).toBe(true);
    expect(r.unsettled).toEqual([]);
  });

  it("NJ-A07 U3 몫별: 같은 차트에서 A up 1020 → C down 1080 뒤 C를 계속 쥐면 B up 1120이 B의 몫 release Perfect이고 C가 이어간 A의 몫은 1240ms release Miss로 Miss 1", () => {
    const r = playSession(heldSibling(), [heldSiblingStart, [1020, up("A")], [1080, down("C")], [1120, up("B")]]);
    expect(releases(r.events)).toEqual([["perfect", 0, "B", 1120], ["miss", 120, undefined, 1240]]);
    expect(r.state.judgmentCounts.miss).toBe(1);
  });

  it.each([
    [1120, [["perfect", 0, "B", 1120], ["good", -100, "A", 1180]], 0],
    [1200, [["good", -100, "A", 1180], ["great", 80, "B", 1200]], 0],
    [1300, [["good", -100, "A", 1180], ["miss", 120, undefined, 1240]], 1],
  ] as const)("NJ-A07 U2 몫별: 같은 차트에서 A up 1020 뒤 새 키 없이 B를 %ims에 떼면 A의 몫은 B와 관계없이 시작 창이 닫히는 1180ms에 A up의 release Good(−100)로 확정되고 B의 몫은 B up으로 판정", (bAt, expected, misses) => {
    const r = playSession(heldSibling(), [heldSiblingStart, [1020, up("A")], [bAt, up("B")]]);
    expect(releases(r.events)).toEqual(expected);
    expect(r.state.judgmentCounts.miss).toBe(misses);
    expect(r.unsettled).toEqual([]);
  });

  // HIGH-2(c): 새 키가 뗀 몫을 이어도 다른 몫을 쥔 키의 등록은 지우지 않는다. 퍼즈 short seed 8126에서 줄인 차트다.
  const keptRegistration = () => [body(1000, 1200), point(1200), body(1200, 1300), body(1300, 1360, "doubleLong")];

  it.each([
    ["같은 키 C를 다시(사용자 결정: 다시 누른 같은 키도 새 입력)", "C"],
    ["다른 키 D를", "D"],
  ] as const)("NJ-A07 U3 몫별: [1000,1200] → head 1200 + [1200,1300] → doubleLong [1300,1360]에서 A를 1360ms까지 쥐고 C가 head를 1180ms에 친 뒤 C up 1290 → %s 1340ms에 눌러 쥐면 쥔 A의 등록이 남아 A up 1360이 release Perfect(0)이고 C의 몫은 C up 1290으로 1420ms에 release Great(−70), Full Combo", (_label, key) => {
    const r = playSession(keptRegistration(), [[1000, down("A")], [1180, down("C")], [1290, up("C")], [1340, down(key)], [1360, up("A")]]);
    expect(r.events.filter((event) => event.kind === "head").map((event) => [event.grade, event.deltaMs, event.key])).toEqual([["perfect", -20, "C"]]);
    expect(releases(r.events)).toEqual([["perfect", 0, "A", 1360], ["great", -70, "C", 1420]]);
    expect(r.state.isFullCombo).toBe(true);
    expect(r.unsettled).toEqual([]);
  });

  it("NJ-A07 U3 몫별: 퍼즈 short seed 8126 차트(head 1000 + doubleLong [1000,1020] → head 1020 + doubleLong [1020,1220] → double head 1220 + [1220,1320] → doubleLong [1320,1380])에서 C up 1310 → C down 1360 뒤 쥔 A의 up 1420이 release Perfect(+40)로 남음", () => {
    const r = playSession([point(1000), body(1000, 1020, "doubleLong"), point(1020), body(1020, 1220, "doubleLong"), point(1220, "double"), body(1220, 1320), body(1320, 1380, "doubleLong")],
      [[1000, down("A")], [1005, down("B")], [1175, up("B")], [1180, down("C")], [1310, up("C")], [1360, down("C")], [1420, up("A")]]);
    expect(releases(r.events)).toEqual([["perfect", 40, "A", 1420], ["great", -70, "C", 1440]]);
    // Miss 2는 놓친 head 1020과 double head 1220의 둘째 키다. 놓친 head 1220 앞 감소 release 항목(n3:release:0)의 미정산은 #182 범위로 종전과 같다.
    expect(r.state.judgmentCounts.miss).toBe(2);
  });

  // MEDIUM-1, 사용자 결정(2026-10-01): 뗀 키를 다시 누른 것도 U3의 새 입력이다("응 다시 같은 키 눌러도 새로운 입력").
  it.each([
    ["A down 1500(뒤 S, 같은 키)", "A", 1500],
    ["A down 1510(뒤 S 이후, 같은 키)", "A", 1510],
    ["B down 1510(다른 키)", "B", 1510],
  ] as const)("NJ-A07 U3 같은 키: [1000,1500] → doubleLong holdOnly [1500,1560]에서 A up 1455 뒤 %s면 새 입력이 아무도 준비하지 않은 증가 unit을 이어 1560ms Perfect, A로 이어진 unit은 1620ms에 A up으로 Perfect, Full Combo", (_label, key, at) => {
    const r = playSession(increase(1560)(), [[1000, down("A")], [1455, up("A")], [at, down(key)]]);
    expect(outcome(r.events)).toEqual([
      ["holdOnly", 1, 1, "perfect", 0, null, 1560],
      ["holdOnly", 1, 0, "perfect", 0, 1455, 1620],
    ]);
    expect(r.state.isFullCombo).toBe(true);
    expect(r.unsettled).toEqual([]);
  });

  it("NJ-A07 U3 같은 키: head 1000 + doubleLong [1000,2000] → double head 2000 + [2000,3000] → double head 3000 + [3000,3060] → doubleLong [3060,3120]에서 3080ms의 A down(같은 키 재누름)·C down 수집 순서를 바꿔도 판정·등급·확정 시각이 같음", () => {
    const chart = () => [point(1000), body(1000, 2000, "doubleLong"), point(2000, "double"), body(2000, 3000), point(3000, "double"), body(3000, 3060), body(3060, 3120, "doubleLong")];
    const before: Step[] = [[1000, down("A")], [2045, down("C")], [2095, up("C")], [3015, down("B")], [3060, up("A")], [3070, up("B")]];
    const ac = playSession(chart(), [...before, [3080, down("A"), down("C")]]);
    const ca = playSession(chart(), [...before, [3080, down("C"), down("A")]]);
    expect(outcome(ca.events)).toEqual(outcome(ac.events));
    expect(ac.events.filter((event) => event.noteIndex === 6).map((event) => [event.kind, event.unitIndex, event.grade, event.confirmedAt]))
      .toEqual([["release", 0, "great", 3070], ["release", 1, "miss", 3240]]);
  });

  // PR #188 리뷰 3차 LOW-3: 새 키가 뗀 몫을 이어받으면 그 몫에 남은 뗀 키의 등록을 지운다. 그래야 같은 키를 다시 눌러 형제 몫을 이어받을 수 있다.
  it.each([
    ["[1000,1500]", () => body(1000, 1500)],
    ["doubleLong holdOnly [1000,1500]", () => body(1000, 1500, "doubleLong", true)],
  ] as const)("NJ-A07 U3 같은 키: double head 1000 + %s → doubleLong [1500,1560]에서 A up 1450·B up 1455 뒤 C down 1505가 A의 몫을 이어받고 뗀 A를 1510ms에 다시 누르면 A가 B의 몫을 이어받아 A·C up 1560이 release Perfect 2개로 Full Combo", (_label, front) => {
    const r = playSession([point(1000, "double"), front(), body(1500, 1560, "doubleLong")],
      [[1000, down("A"), down("B")], [1450, up("A")], [1455, up("B")], [1505, down("C")], [1510, down("A")], [1560, up("A"), up("C")]]);
    expect(releases(r.events)).toEqual([["perfect", 0, "A", 1560], ["perfect", 0, "C", 1560]]);
    expect(r.state.isFullCombo).toBe(true);
    expect(r.unsettled).toEqual([]);
  });

  // MEDIUM-2: 뗀 몫의 판정은 확정 순서를 거꾸로 돌리지 않는다(RFD 0020 §2.9).
  it("NJ-A07 §2.9: double head 1000 + [1000,1500] → doubleLong [1500,1560]에서 B up 1490 → C down 1545 → A up 1650이면 C가 B의 몫을 이어 1680ms release Miss이고 A up 1650이 release Good(+90)이며 확정 시각이 줄지 않는 순서로 전달됨", () => {
    const r = playSession([point(1000, "double"), body(1000, 1500), body(1500, 1560, "doubleLong")],
      [[1000, down("A"), down("B")], [1490, up("B")], [1545, down("C")], [1650, up("A")]]);
    expect(releases(r.events)).toEqual([["good", 90, "A", 1650], ["miss", 120, undefined, 1680]]);
    const confirmed = r.events.map((event) => event.confirmedAt);
    expect(confirmed).toEqual([...confirmed].sort((a, b) => a - b));
  });

  // PR #188 리뷰 3차 HIGH-1: 앞 double의 뗀 몫이 S+Good에 자기 키의 up을 release로 쓰면, 같은 up을 몫으로 골랐던 뒤 노트는
  // 그 up 대신 아직 남은 다른 키의 up으로 몫을 다시 고른다. 키 하나는 몫 하나만 판정한다(§2.14 몫별 판정).
  it.each([
    [false, "A up 1485 → B up 1490", [[1485, up("A")], [1490, up("B")]], -75, 1485, ["release", 3, 0, "good", -110, 1490, 1680]],
    [false, "A·B up 1490(같은 batch)", [[1490, up("A"), up("B")]], -70, 1490, ["release", 3, 0, "good", -110, 1490, 1680]],
    [true, "A up 1485 → B up 1490", [[1485, up("A")], [1490, up("B")]], -75, 1485, ["holdOnly", 3, 0, "perfect", 0, 1490, 1680]],
  ] as const)("NJ-A07 U2 몫별 체인: double head 1000 + [1000,1500] → doubleLong [1500,1560] → 끝 [1560,1600](holdOnly=%s)에서 A·B down 1000 뒤 %s면 A up이 감소 release Great로 1620ms에, B up이 끝 바디를 1680ms에 판정해 Full Combo", (tailHoldOnly, _label, rest, aDelta, aUp, tail) => {
    const r = playSession([point(1000, "double"), body(1000, 1500), body(1500, 1560, "doubleLong"), body(1560, 1600, "long", tailHoldOnly)],
      [[1000, down("A"), down("B")], ...rest as unknown as Step[]]);
    expect(outcome(r.events.filter((event) => event.noteIndex !== 0))).toEqual([
      ["release", 2, 0, "great", aDelta, aUp, 1620],
      tail,
    ]);
    expect(releaseKeys(r.events)).toEqual(tailHoldOnly ? ["A"] : ["A", "B"]);
    expect(r.state.isFullCombo).toBe(true);
    expect(r.unsettled).toEqual([]);
  });

  // LOW-2: 아래 두 테스트는 뗀 몫의 보류와 쥔 키의 준비 유지를 각각 고정한다.
  it("NJ-A07 U4: holdOnly [1000,1500] → holdOnly [1500,1560]에서 A up 1455 뒤 어디에도 쓰이지 않은 C(1100ms down)의 up 1550은 뒤 holdOnly를 완료하지 않고, 뒤는 시작 창이 닫히는 1620ms에 A up 1455로 Perfect", () => {
    const r = playSession(chain(1560)(), [[1000, down("A")], [1100, down("C")], [1455, up("A")], [1550, up("C")]]);
    expect(outcome(r.events)).toEqual([["holdOnly", 0, 0, "perfect", 0, 1455, 1455], ["holdOnly", 1, 0, "perfect", 0, 1455, 1620]]);
  });

  it("NJ-A07 대조: double head 1000 + holdOnly [1000,1060] → [1060,1120]에서 B를 끝까지 쥔 채 A만 1030ms에 떼면 B가 아직 준비하므로 A up이 곧바로 뒤 release Good(−90)이고 1030ms에 확정 (NJ-H03·H07)", () => {
    const r = playSession([point(1000, "double"), body(1000, 1060, "long", true), body(1060, 1120)], [[1000, down("A"), down("B")], [1030, up("A")]]);
    expect(releases(r.events)).toEqual([["good", -90, "A", 1030]]);
    expect(r.state.isFullCombo).toBe(true);
    expect(r.unsettled).toEqual([]);
  });

  // 사용자 결정 ①(2026-10-01): 새 down은 아무도 준비하지 않은 몫부터 채우고, 남은 새 down이 뗀 키의 몫을 이어받는다.
  // 뗀 몫은 새 키가 이어받지 않을 때만 뗀 키의 up으로 판정한다. 원문: "그럼 a를 떼도 입력할 기회는 남아있고 입력을 안했을 때만 a 입력을 인정하겠다는 거지 ㅇㅋ"
  it.each([
    [true, 1000, [["holdOnly", 1, 1, "perfect", 0, 1560, 1560], ["holdOnly", 1, 0, "perfect", 0, 1455, 1620]]],
    [true, 1030, [["holdOnly", 1, 1, "perfect", 0, 1560, 1560], ["holdOnly", 1, 0, "perfect", 0, 1455, 1620]]],
    [false, 1000, [["release", 1, 1, "perfect", 0, 1560, 1560], ["release", 1, 0, "good", -105, 1455, 1620]]],
    [false, 1030, [["release", 1, 1, "perfect", 0, 1560, 1560], ["release", 1, 0, "good", -105, 1455, 1620]]],
  ] as const)("NJ-A07 ①: [1000,1500] → doubleLong(holdOnly=%s) [1500,1560]에서 A를 %ims에 눌러 1455ms에 떼고 B만 1500ms에 눌러 1560ms에 떼면 B는 증가 unit을 채우고 A의 몫은 A up으로 판정해 Miss 없음", (holdOnly, aAt, expected) => {
    const r = playSession([body(1000, 1500), body(1500, 1560, "doubleLong", holdOnly)], [[aAt, down("A")], [1455, up("A")], [1500, down("B")], [1560, up("B")]]);
    expect(outcome(r.events)).toEqual(expected);
    expect(r.state.isFullCombo).toBe(true);
    expect(r.unsettled).toEqual([]);
  });

  it.each([[true, 1000], [true, 1030], [false, 1000], [false, 1030]] as const)("NJ-A07 ①: [1000,1500] → doubleLong(holdOnly=%s) [1500,1560]에서 A를 %ims에 눌러 1455ms에 떼고 B·C를 1500ms에 함께 눌러 1560ms에 떼면 C가 A의 몫을 이어받아 Perfect 2이고 A up은 쓰이지 않음", (holdOnly, aAt) => {
    const r = playSession([body(1000, 1500), body(1500, 1560, "doubleLong", holdOnly)], [[aAt, down("A")], [1455, up("A")], [1500, down("B"), down("C")], [1560, up("B"), up("C")]]);
    const scored = r.events.filter((event) => event.kind === "release" || event.kind === "holdOnly");
    expect(scored.map((event) => [event.kind, event.grade, event.deltaMs, event.inputAt, event.confirmedAt]))
      .toEqual([[holdOnly ? "holdOnly" : "release", "perfect", 0, 1560, 1560], [holdOnly ? "holdOnly" : "release", "perfect", 0, 1560, 1560]]);
    if (!holdOnly) expect([...releaseKeys(r.events)].sort()).toEqual(["B", "C"]);
    expect(r.state.isFullCombo).toBe(true);
    expect(r.unsettled).toEqual([]);
  });

  // 사용자 결정 ②(2026-10-01): 준비한 키를 뗀 뒤 그 몫의 인수 기한 min(E, S+Good)까지 누른 새 down은 더 늦은 Point의 창 안이어도
  // 뗀 몫을 이어받는다(앞에서부터 처리). Point는 자기 입력이 따로 필요하다. 기한 뒤의 down은 다음 노트로 간다.
  // 원문: "b 990 up 판정은 아무것도 안누를때고, 지금은 c 를 눌렀으니까 b 자리를 c 가 차지해서 뒤에있는 포인트는 미스",
  // "리듬게임에서는 앞에서부터 입력을 처리하므로 입력 하나가 중간에 덜되면 그 이후 정당하게 입력되도 입력 이벤트가 밀림".
  // 차트는 NJ-A04 모양이다: double head 0 + [0,1000] → head 없는 doubleLong [1000,1060](holdOnly 변형 포함) → Point 1100. 인수 기한 1060.
  const releasedThenPoint = (holdOnly: boolean) => [point(0, "double"), body(0, 1000), body(1000, 1060, "doubleLong", holdOnly), point(1100)];
  const pointEvents = (events: readonly NoteJudgmentEvent[]) => events.filter((event) => event.noteIndex === 3).map((event) => [event.kind, event.grade, event.deltaMs, event.key, event.confirmedAt]);
  const bodyEvents = (events: readonly NoteJudgmentEvent[]) => events.filter((event) => event.noteIndex === 2).map((event) => [event.kind, event.grade, event.deltaMs, event.inputAt, event.confirmedAt, event.key]);
  const pointMiss = [["head", "miss", 120, undefined, 1220]];

  it.each([
    [false, [["release", "great", -60, 1000, 1000, "C"], ["release", "perfect", 0, 1060, 1060, "A"]]],
    [true, [["holdOnly", "perfect", 0, 1000, 1000, undefined], ["holdOnly", "perfect", 0, 1060, 1060, undefined]]],
  ] as const)("NJ-A07 ② Q: NJ-A04 차트(holdOnly=%s)에서 A·B down 0 → B up 990 → C down 995 → C up 1000 → A up 1060이면 C가 B의 몫을 이어받아 C up 1000이 그 몫의 판정이고 A는 1060ms Perfect, 입력 없는 Point 1100은 1220ms Miss로 Miss 1", (holdOnly, expected) => {
    const r = playSession(releasedThenPoint(holdOnly), [[0, down("A"), down("B")], [990, up("B")], [995, down("C")], [1000, up("C")], [1060, up("A")]]);
    expect(bodyEvents(r.events)).toEqual(expected);
    expect(pointEvents(r.events)).toEqual(pointMiss);
    expect(r.state.judgmentCounts.miss).toBe(1);
    expect(r.unsettled).toEqual([]);
  });

  it.each([
    [false, [["release", "perfect", 0, 1060, 1060, "A"], ["release", "perfect", 0, 1060, 1060, "C"]]],
    [true, [["holdOnly", "perfect", 0, 1060, 1060, undefined], ["holdOnly", "perfect", 0, 1060, 1060, undefined]]],
  ] as const)("NJ-A07 ② P: NJ-A04 차트(holdOnly=%s)에서 B up 990 → C down 995를 1060ms까지 쥐고 A·C up 1060 → D down 1100 → D up 1110이면 C가 B의 몫을 이어 1060ms Perfect, D는 Point Perfect로 모두 Perfect이며 B의 몫을 쥐지 않은 D의 up은 release에 쓰이지 않음", (holdOnly, expected) => {
    const r = playSession(releasedThenPoint(holdOnly), [[0, down("A"), down("B")], [990, up("B")], [995, down("C")], [1060, up("A"), up("C")], [1100, down("D")], [1110, up("D")]]);
    expect(bodyEvents(r.events)).toEqual(expected);
    expect(pointEvents(r.events)).toEqual([["head", "perfect", 0, "D", 1100]]);
    expect(r.state.isFullCombo).toBe(true);
    expect(r.unsettled).toEqual([]);
  });

  it.each([
    [false, [["release", "perfect", 0, 1060, 1060, "A"], ["release", "great", -70, 990, 1120, "B"]]],
    [true, [["holdOnly", "perfect", 0, 1060, 1060, undefined], ["holdOnly", "perfect", 0, 990, 1120, undefined]]],
  ] as const)("NJ-A07 ② R: NJ-A04 차트(holdOnly=%s)에서 B up 990 → A up 1060 → C down 1090(인수 기한 1060 이후) → C up 1095면 C는 B의 몫을 이어받지 못하고 Point Perfect(−10)이며 B의 몫은 B up 990으로 1120ms에 판정 (종전과 같음)", (holdOnly, expected) => {
    const r = playSession(releasedThenPoint(holdOnly), [[0, down("A"), down("B")], [990, up("B")], [1060, up("A")], [1090, down("C")], [1095, up("C")]]);
    expect(bodyEvents(r.events)).toEqual(expected);
    expect(pointEvents(r.events)).toEqual([["head", "perfect", -10, "C", 1090]]);
    expect(r.state.isFullCombo).toBe(true);
  });

  it.each([
    [false, 1050, [["release", "perfect", 0, 1060, 1060, "A"], ["release", "perfect", 10, 1070, 1070, "C"]]],
    [true, 1050, [["holdOnly", "perfect", 0, 1060, 1060, undefined], ["holdOnly", "perfect", 0, 1060, 1060, undefined]]],
    [false, 1060, [["release", "perfect", 0, 1060, 1060, "A"], ["release", "perfect", 10, 1070, 1070, "C"]]],
    [true, 1060, [["holdOnly", "perfect", 0, 1060, 1060, undefined], ["holdOnly", "perfect", 0, 1060, 1060, undefined]]],
  ] as const)("NJ-A07 ② 인수 기한: NJ-A04 차트(holdOnly=%s)에서 B up 990 뒤 뒤 S 이후 인수 기한 E 1060까지인 %ims에 C를 눌러 1070ms에 떼면 C가 B의 몫을 이어받고 Point 1100은 1220ms Miss", (holdOnly, cAt, expected) => {
    const middle: Step[] = cAt === 1060 ? [[1060, up("A"), down("C")]] : [[cAt, down("C")], [1060, up("A")]];
    const r = playSession(releasedThenPoint(holdOnly), [[0, down("A"), down("B")], [990, up("B")], ...middle, [1070, up("C")]]);
    expect(bodyEvents(r.events)).toEqual(expected);
    expect(pointEvents(r.events)).toEqual(pointMiss);
    expect(r.state.judgmentCounts.miss).toBe(1);
    expect(r.unsettled).toEqual([]);
  });

  it.each([
    [false, [["release", "perfect", 0, 1060, 1060, "A"], ["release", "great", -70, 990, 1120, "B"]]],
    [true, [["holdOnly", "perfect", 0, 1060, 1060, undefined], ["holdOnly", "perfect", 0, 990, 1120, undefined]]],
  ] as const)("NJ-A07 ② 인수 기한: NJ-A04 차트(holdOnly=%s)에서 B up 990 뒤 E 1060을 1ms 넘긴 1061ms의 C down은 Point Perfect(−39)이고 B의 몫은 B up으로 1120ms에 판정", (holdOnly, expected) => {
    const r = playSession(releasedThenPoint(holdOnly), [[0, down("A"), down("B")], [990, up("B")], [1060, up("A")], [1061, down("C")], [1070, up("C")]]);
    expect(bodyEvents(r.events)).toEqual(expected);
    expect(pointEvents(r.events)).toEqual([["head", "perfect", -39, "C", 1061]]);
    expect(r.state.isFullCombo).toBe(true);
  });

  // 사용자 결정 ③(2026-10-01, 답 "가"): 뗀 키의 up이 그 몫의 E−Good보다 일러 충족할 수 없는 몫은 아직 시작하지 않은 바디처럼
  // S+Good까지 새 down으로 시작한다(NJ-A06의 E 이후 첫 활성화와 같음). 결정 ②의 E 기한은 뗀 키의 up이 그 몫을 충족할 때만 적용한다.
  const unsatisfied = (front: "holdOnly" | "decrease", tailHoldOnly: boolean) => [
    front === "holdOnly" ? body(1000, 1200, "long", true) : body(1000, 1200, "doubleLong"), body(1200, 1300, "long", tailHoldOnly),
  ];
  const unsatisfiedStart = (front: "holdOnly" | "decrease"): Step[] => front === "holdOnly"
    ? [[1000, down("A")], [1150, up("A")]]
    : [[1000, down("A"), down("B")], [1100, up("B")], [1150, up("A")]];
  const tailEvents = (events: readonly NoteJudgmentEvent[]) => outcome(events.filter((event) => event.noteIndex === 1));

  it.each([
    ["holdOnly [1000,1200]", false, 1310, "holdOnly"],
    ["holdOnly [1000,1200]", false, 1320, "holdOnly"],
    ["holdOnly [1000,1200]", true, 1310, "holdOnly"],
    ["holdOnly [1000,1200]", true, 1320, "holdOnly"],
    ["doubleLong [1000,1200](B up 1100 감소 release)", false, 1310, "decrease"],
    ["doubleLong [1000,1200](B up 1100 감소 release)", true, 1310, "decrease"],
  ] as const)("NJ-A07 ③: head 없는 %s → 뒤 [1200,1300](holdOnly=%s)에서 A up 1150(뒤 E−Good 1180 전, 충족 불가) 뒤 E 1300 이후 S+Good 1320까지인 %ims에 누른 C는 아직 시작하지 않은 뒤 바디를 시작해 Perfect, Full Combo", (_label, tailHoldOnly, cAt, front) => {
    const r = playSession(unsatisfied(front, tailHoldOnly), [...unsatisfiedStart(front), [cAt, down("C")], [1330, up("C")]]);
    expect(tailEvents(r.events)).toEqual([tailHoldOnly ? ["holdOnly", 1, 0, "perfect", 0, cAt, cAt] : ["release", 1, 0, "perfect", 30, 1330, 1330]]);
    expect(releaseKeys(r.events)).toEqual([...front === "decrease" ? ["B"] : [], ...tailHoldOnly ? [] : ["C"]]);
    expect(r.state.isFullCombo).toBe(true);
    expect(r.unsettled).toEqual([]);
  });

  it.each([false, true])("NJ-A07 ③ §2.7: holdOnly [1000,1200] → 뒤 [1200,1300](holdOnly=%s)에서 첫 시작을 1030ms로 30ms 늦춰도 A up 1150 → C down 1310 → C up 1330의 모든 판정·등급·확정 시각이 같음", (tailHoldOnly) => {
    const steps: Step[] = [...unsatisfiedStart("holdOnly"), [1310, down("C")], [1330, up("C")]];
    const onTime = playSession(unsatisfied("holdOnly", tailHoldOnly), steps);
    const late = playSession(unsatisfied("holdOnly", tailHoldOnly), withFirstAt(steps, 1030));
    expect(late.error).toBeUndefined();
    expect(outcome(late.events)).toEqual(outcome(onTime.events));
  });

  it("NJ-A07 ③ 대조: holdOnly [1000,1200] → [1200,1300]에서 A up 1150 뒤 E 전 1290ms에 누른 C도 뒤 바디를 시작해 C up 1330이 release Perfect(+30) (종전과 같음)", () => {
    const r = playSession(unsatisfied("holdOnly", false), [...unsatisfiedStart("holdOnly"), [1290, down("C")], [1330, up("C")]]);
    expect(tailEvents(r.events)).toEqual([["release", 1, 0, "perfect", 30, 1330, 1330]]);
    expect(r.state.isFullCombo).toBe(true);
  });

  it("NJ-A07 ③ 대조: holdOnly [1000,1200] → [1200,1300]에서 A up 1150 뒤 S+Good 1320을 넘긴 1321ms의 C down은 뒤 바디를 시작하지 못하고 뒤 바디는 1320ms 시작 실패로 Miss 1", () => {
    const r = playSession(unsatisfied("holdOnly", false), [...unsatisfiedStart("holdOnly"), [1321, down("C")], [1330, up("C")]]);
    expect(tailEvents(r.events)).toEqual(startFail(1, 0, 1320));
    expect(r.state.judgmentCounts.miss).toBe(1);
    expect(r.unsettled).toEqual([]);
  });

  // RFD 0020 §2.7: 첫 double head를 30ms 늦게 쳐도 첫 head 외 판정·등급·확정 시각이 같다.
  it.each([
    ["Q", false, [[990, up("B")], [995, down("C")], [1000, up("C")], [1060, up("A")]]],
    ["P", false, [[990, up("B")], [995, down("C")], [1060, up("A"), up("C")], [1100, down("D")], [1110, up("D")]]],
    ["R", false, [[990, up("B")], [1060, up("A")], [1090, down("C")], [1095, up("C")]]],
    ["C down 1050", false, [[990, up("B")], [1050, down("C")], [1060, up("A")], [1070, up("C")]]],
    ["Q", true, [[990, up("B")], [995, down("C")], [1000, up("C")], [1060, up("A")]]],
    ["P", true, [[990, up("B")], [995, down("C")], [1060, up("A"), up("C")], [1100, down("D")], [1110, up("D")]]],
    ["R", true, [[990, up("B")], [1060, up("A")], [1090, down("C")], [1095, up("C")]]],
  ] as const)("NJ-A07 ② §2.7: NJ-A04 차트의 %s 입력(holdOnly=%s)은 첫 double head를 30ms에 늦게 쳐도 첫 head 외 판정·등급·확정 시각이 같음", (_label, holdOnly, rest) => {
    const afterHeads = (events: readonly NoteJudgmentEvent[]) => outcome(events.filter((event) => event.noteIndex !== 0));
    const onTime = playSession(releasedThenPoint(holdOnly), [[0, down("A"), down("B")], ...rest as unknown as Step[]]);
    const late = playSession(releasedThenPoint(holdOnly), [[30, down("A"), down("B")], ...rest as unknown as Step[]]);
    expect(late.error).toBeUndefined();
    expect(afterHeads(late.events)).toEqual(afterHeads(onTime.events));
  });

  /** 각 step을 [raw 시각, 관측 시각, ...입력]으로 받아 관측 시각이 늦으면 processObservedBatch로, 아니면 processBatch로 전달한다. */
  function playObservedSession(notes: readonly NoteEntity[], steps: readonly (readonly [number, number, ...Input[]])[]) {
    const starts = new Map(notes.map((note, index) => [index, note.beat.n / note.beat.d] as [number, number]));
    const ends = new Map<number, number>();
    notes.forEach((note, index) => { if ("endBeat" in note) ends.set(index, note.endBeat.n / note.endBeat.d); });
    const session = new NoteJudgmentSession(compileJudgmentChart(notes, starts, ends));
    for (const [rawAt, observedAt, ...inputs] of steps) {
      const batch = inputs.map((input) => ({ ...input, lane: input.lane ?? 1 }));
      if (observedAt > rawAt) { session.advance(observedAt); session.processObservedBatch(rawAt, batch, observedAt); }
      else session.processBatch(rawAt, batch);
    }
    session.finalize();
    return session.events;
  }

  // PR #188 리뷰 3차 MEDIUM-1: 정산 퍼즈 seed를 줄여 §2.14 몫 처리의 분기를 사례로 고정한다. 괄호 안은 원래 퍼즈 생성기와 seed다.
  it("NJ-A07 몫 재선택(short 3323): head 없는 doubleLong holdOnly [1000,1100] → doubleLong [1100,1120] → [1120,1160]에서 A down 1000·C down 1015 뒤 C up 1025가 감소 release Good(−95)으로 쓰이면 A의 몫은 쥔 A로 다시 골라 A up 1160이 끝 release Perfect, Full Combo", () => {
    const r = playSession([body(1000, 1100, "doubleLong", true), body(1100, 1120, "doubleLong"), body(1120, 1160)], [[1000, down("A")], [1015, down("C")], [1025, up("C")], [1160, up("A")]]);
    expect(outcome(r.events)).toEqual([
      ["holdOnly", 0, 0, "perfect", 0, 1025, 1025], ["holdOnly", 0, 1, "perfect", 0, 1025, 1025],
      ["release", 1, 0, "good", -95, 1025, 1025],
      ["release", 2, 0, "perfect", 0, 1160, 1160],
    ]);
    expect(r.state.isFullCombo).toBe(true);
    expect(r.unsettled).toEqual([]);
  });

  it("NJ-A07 몫 재선택(short 10401): [1000,1040] → head 1040 + holdOnly [1040,1080] → holdOnly [1080,1100]에서 A up 1005 뒤 C가 head를 1130ms에 늦게(Good +90) 치면 A up은 head 1040의 교대 up으로 쓰이고 뒤 holdOnly 두 개는 쥔 C로 이어져 Perfect, Full Combo", () => {
    const r = playSession([body(1000, 1040), point(1040), body(1040, 1080, "long", true), body(1080, 1100, "long", true)], [[1000, down("A")], [1005, up("A")], [1130, down("C")], [1200, up("C")]]);
    expect(r.events.map((event) => [event.kind, event.noteIndex, event.grade, event.deltaMs])).toEqual([
      ["head", 1, "good", 90], ["holdOnly", 2, "perfect", 0], ["holdOnly", 3, "perfect", 0],
    ]);
    expect(r.state.isFullCombo).toBe(true);
    expect(r.unsettled).toEqual([]);
  });

  it("NJ-A07 감소 정산(short 2620): [1000,1040] → doubleLong [1040,1100] → head 1100 + [1100,1140]에서 A up 1030 뒤 B down 1130(증가 unit의 E 이후 첫 활성화)·D head 1135(Perfect +35)·D up 1140이면 세션 예외 없이 모든 점수 항목을 한 번씩 정산", () => {
    const r = playSession([body(1000, 1040), body(1040, 1100, "doubleLong"), point(1100), body(1100, 1140)], [[1000, down("A")], [1030, up("A")], [1130, down("B")], [1135, down("D")], [1140, up("D")]]);
    expect(r.error).toBeUndefined();
    expect(r.unsettled).toEqual([]);
  });

  it("NJ-A07 U2 몫별(general 11349): head 없는 doubleLong holdOnly [1000,1060] → doubleLong [1060,1160]에서 A·B down 1000 뒤 A up 1060(뒤 S)·B up 1160이면 A up은 형제 몫의 즉시 release가 아니라 A의 몫으로 시작 창이 닫히는 1180ms에 Good(−100)이고 B up이 release Perfect, Full Combo", () => {
    const r = playSession([body(1000, 1060, "doubleLong", true), body(1060, 1160, "doubleLong")], [[1000, down("A"), down("B")], [1060, up("A")], [1160, up("B")]]);
    expect(releases(r.events)).toEqual([["perfect", 0, "B", 1160], ["good", -100, "A", 1180]]);
    expect(r.state.isFullCombo).toBe(true);
  });

  it("NJ-A07 U2 몫별(short 8262): double head 1000 + [1000,1020] → head 1020 + [1020,1120] → doubleLong [1120,1160]에서 C가 head를 1025ms에 치고 B up 1030·A up 1105 뒤 C up 1160이면 A up은 연결 원장 기한 1140이 아니라 A의 몫으로 1240ms에 release Great(−55)이고 C up이 release Perfect", () => {
    const r = playSession([point(1000, "double"), body(1000, 1020), point(1020), body(1020, 1120), body(1120, 1160, "doubleLong")],
      [[1000, down("A"), down("B")], [1025, down("C")], [1030, up("B")], [1105, up("A")], [1160, up("C")]]);
    expect(releases(r.events)).toEqual([["perfect", 0, "C", 1160], ["great", -55, "A", 1240]]);
    expect(r.state.isFullCombo).toBe(true);
    expect(r.unsettled).toEqual([]);
  });

  it("NJ-A07 U2 확정 시각(short 7054): doubleLong [1000,1060] → double head 1060 + doubleLong [1060,1160] → [1160,1180]에서 B up 1070·A up 1090 → A head 1120(Great +60) → A up 1150이면 끝 [1160,1180]은 A up 1090의 Good(−90)을 연결 원장 기한 1180이 아닌 시작 창이 닫히는 1280ms에 확정", () => {
    const r = playSession([body(1000, 1060, "doubleLong"), point(1060, "double"), body(1060, 1160, "doubleLong"), body(1160, 1180)],
      [[1000, down("A"), down("B")], [1070, up("B")], [1090, up("A")], [1120, down("A")], [1150, up("A")]]);
    expect(r.events.filter((event) => event.noteIndex === 3).map((event) => [event.kind, event.grade, event.deltaMs, event.inputAt, event.confirmedAt]))
      .toEqual([["release", "good", -90, 1090, 1280]]);
    expect(r.unsettled).toEqual([]);
  });

  it("NJ-A07 한 up 한 release: double head 1000 + [1000,1500] → doubleLong [1500,1560] → [1560,1600]에서 A·B down 1000 뒤 B up 1470(끝 E−Good 1480 전)·A up 1485면 A up은 release 하나에만 쓰이고 끝 [1560,1600]의 release로 다시 쓰이지 않음", () => {
    const r = playSession([point(1000, "double"), body(1000, 1500), body(1500, 1560, "doubleLong"), body(1560, 1600)], [[1000, down("A"), down("B")], [1470, up("B")], [1485, up("A")]]);
    expect(releaseKeys(r.events).filter((key) => key === "A")).toHaveLength(1);
    expect(r.unsettled).toEqual([]);
  });

  // PR #188 리뷰 4차 MEDIUM-1: 한 up은 release 하나에만 쓰이므로(§2.14 몫별 판정), 다른 노트의 뗀 몫이 자기 release로 판정할 up은
  // 끝 바디의 몫으로 고르지 않는다. 끝 바디를 충족할 수 있는 up이 없으면 결정 ③대로 E 이후에도 S+Good까지 새 down으로 시작한다.
  const spentShare = () => [point(1000, "double"), body(1000, 1500), body(1500, 1560, "doubleLong"), body(1560, 1600)];
  const spentShareStart: Step[] = [[1000, down("A"), down("B")], [1450, up("B")], [1485, up("A")]];

  const spentShareDecrease = ["release", 2, 0, "great", -75, 1485, 1620];
  it.each([
    // 같은 1620ms에서는 C up 입력이 시작 창 기한(1620)의 감소 release보다 먼저 확정된다.
    [1610, 1620, [["release", 3, 0, "perfect", 20, 1620, 1620], spentShareDecrease]],
    [1630, 1640, [spentShareDecrease, ["release", 3, 0, "perfect", 40, 1640, 1640]]],
  ] as const)("NJ-A07 ③ 한 up 한 release: double head 1000 + [1000,1500] → doubleLong [1500,1560] → [1560,1600]에서 A·B down 1000 뒤 B up 1450(끝 E−Good 1480 전)·A up 1485면 A up은 감소 release Great(−75)로만 쓰여 끝 바디를 충족하는 up이 없으므로, 끝 E 1600 이후 %ims에 누른 C가 끝 바디를 시작해 C up %ims이 release Perfect이고 Full Combo", (cAt, cUp, expected) => {
    const r = playSession(spentShare(), [...spentShareStart, [cAt, down("C")], [cUp, up("C")]]);
    expect(outcome(r.events.filter((event) => event.noteIndex >= 2))).toEqual(expected);
    expect(releaseKeys(r.events).sort()).toEqual(["A", "C"]);
    expect(r.state.isFullCombo).toBe(true);
    expect(r.unsettled).toEqual([]);
  });

  it("NJ-A07 ③ 한 up 한 release 대조: 같은 차트에서 B up 1450·A up 1485 뒤 새 키가 없으면 A up은 감소 release Great(−75)이고 끝 [1560,1600]은 1680ms 시작 실패로 Miss 1", () => {
    const r = playSession(spentShare(), spentShareStart);
    expect(outcome(r.events.filter((event) => event.noteIndex >= 2))).toEqual([["release", 2, 0, "great", -75, 1485, 1620], ...startFail(3, 0, 1680)]);
    expect(r.state.judgmentCounts.miss).toBe(1);
    expect(r.unsettled).toEqual([]);
  });

  it("NJ-A07 ③ 한 up 한 release 대조: 같은 차트에서 B up 1450·A up 1485 뒤 끝 E 전 1590ms에 누른 C는 끝 바디를 시작해 C up 1600이 release Perfect(0)이고 Full Combo (종전과 같음)", () => {
    const r = playSession(spentShare(), [...spentShareStart, [1590, down("C")], [1600, up("C")]]);
    expect(outcome(r.events.filter((event) => event.noteIndex >= 2))).toEqual([["release", 3, 0, "perfect", 0, 1600, 1600], ["release", 2, 0, "great", -75, 1485, 1620]]);
    expect(r.state.isFullCombo).toBe(true);
  });

  it("NJ-A07 관측 지연(obsGeneral 4718): [1000,1100] → doubleLong holdOnly [1100,1600]에서 A up(raw 1095, 뒤 E−Good 1480 전)을 뒤 S 이후 1102ms에 늦게 관측해도 raw 그대로 처리한 것과 같이 뒤 두 unit이 1220ms 시작 실패", () => {
    const notes = [body(1000, 1100), body(1100, 1600, "doubleLong", true)];
    const observed = playObservedSession(notes, [[1000, 1000, down("A")], [1095, 1102, up("A")]]);
    const raw = playSession(notes, [[1000, down("A")], [1095, up("A")]]);
    expect(outcome(observed)).toEqual([...startFail(1, 0, 1220), ...startFail(1, 1, 1220)]);
    expect(outcome(observed)).toEqual(outcome(raw.events));
  });

  it.each([
    ["short 4042", () => [body(1000, 1200, "doubleLong"), point(1200), body(1200, 1260, "doubleLong"), body(1260, 1300)],
      [[1000, down("A"), down("B")], [1215, up("A")], [1260, up("B")], [1320, down("D")], [1400, up("D")]]],
    ["short 8076", () => [body(1000, 1020), point(1020), body(1020, 1080), body(1080, 1100, "doubleLong")],
      [[1000, down("A")], [1005, up("A")], [1120, down("D")], [1200, up("D")]]],
  ] as const)("NJ-A07 연결 up 재사용 금지(%s): 경계 head를 늦게 친 D가 A up을 교대 up으로 쓰면 같은 A up을 뒤 바디의 몫으로 다시 판정하지 않음(NJ-R06)", (_label, chart, steps) => {
    const r = playSession(chart(), steps as unknown as Step[]);
    expect(releaseKeys(r.events)).not.toContain("A");
    expect(r.unsettled).toEqual([]);
  });

  it("NJ-A07 ③ 관측 지연: holdOnly [1000,1100] → [1100,1150]에서 A up(raw 1020, 뒤 E−Good 1030 전)을 뒤 S 이후 1105ms에 늦게 관측해도 뗀 키로 충족할 수 없는 몫이라 E 1150 이후 1160ms의 C가 뒤 바디를 시작해 C up 1170이 release Perfect(+20)이고 raw 처리와 같음", () => {
    const notes = [body(1000, 1100, "long", true), body(1100, 1150)];
    const observed = playObservedSession(notes, [[1000, 1000, down("A")], [1020, 1105, up("A")], [1160, 1160, down("C")], [1170, 1170, up("C")]]);
    const raw = playSession(notes, [[1000, down("A")], [1020, up("A")], [1160, down("C")], [1170, up("C")]]);
    expect(observed.filter((event) => event.noteIndex === 1).map((event) => [event.kind, event.grade, event.deltaMs, event.key])).toEqual([["release", "perfect", 20, "C"]]);
    expect(outcome(raw.events.filter((event) => event.noteIndex === 1))).toEqual(outcome(observed.filter((event) => event.noteIndex === 1)));
  });

  // PR #188 리뷰 4차 LOW-2: 뗀 키의 up이 뒤 바디의 E−Good과 같은 시각이면 그 몫을 충족하므로(경계 포함) 결정 ②의 E 기한을 적용한다.
  it("NJ-A07 ② 인수 기한 경계: holdOnly [1000,1200] → [1200,1300]에서 A up(raw 1180 = 뒤 E−Good)을 뒤 S 이후 1205ms에 늦게 관측하면 A up이 뒤 바디를 충족하므로 E 1300 이후 1310ms의 C down은 뒤 바디를 이어받지 않고 뒤는 A up의 release Good(−120)을 1320ms에 확정하며 raw 처리와 같음", () => {
    const notes = [body(1000, 1200, "long", true), body(1200, 1300)];
    const observed = playObservedSession(notes, [[1000, 1000, down("A")], [1180, 1205, up("A")], [1310, 1310, down("C")], [1330, 1330, up("C")]]);
    const raw = playSession(notes, [[1000, down("A")], [1180, up("A")], [1310, down("C")], [1330, up("C")]]);
    expect(outcome(observed.filter((event) => event.noteIndex === 1))).toEqual([["release", 1, 0, "good", -120, 1180, 1320]]);
    expect(observed.filter((event) => event.kind === "release").map((event) => event.key)).toEqual(["A"]);
    expect(outcome(raw.events.filter((event) => event.noteIndex === 1))).toEqual(outcome(observed.filter((event) => event.noteIndex === 1)));
  });

  // PR #188 리뷰 4차 MEDIUM-3: 뒤 S 이후에 관측한 up의 raw 시각이 S 전이면, 그 up을 처리하기 전에 그 키로 고른 몫을 S 시점처럼 다시 고른다(§2.14).
  // 그러지 않으면 아직 쥔 것으로 고른 A가 뗀 몫이 되어 이 up을 release로 받지 못하고 E+Good에 release Miss가 된다.
  it("NJ-A07 관측 지연 몫 재선택: double head 1000 + doubleLong holdOnly [1000,1200] → [1200,1260]에서 A·B down 1000 뒤 A up(raw 1195, 뒤 S 전)을 뒤 S 이후 1215ms에 늦게 관측하면 A up이 뒤 release Great(−65)로 1215ms에 확정되고 Miss 없음", () => {
    const observed = playObservedSession([point(1000, "double"), body(1000, 1200, "doubleLong", true), body(1200, 1260)],
      [[1000, 1000, down("A"), down("B")], [1195, 1215, up("A")]]);
    expect(outcome(observed)).toEqual([
      ["head", 0, 0, "perfect", 0, 1000, 1000], ["head", 0, 1, "perfect", 0, 1000, 1000],
      ["holdOnly", 1, 0, "perfect", 0, null, 1200], ["holdOnly", 1, 1, "perfect", 0, null, 1200],
      ["release", 2, 0, "great", -65, 1195, 1215],
    ]);
  });

  // 사용자 결정(2026-10-03)의 관측 지연: 충족 여부는 raw up 시각으로 판단하므로, S 이후에 관측해 가운데 바디가 이미 A로 승계되었어도 raw up 1430은
  // 가운데 바디를 충족하지 못한다. 앞 holdOnly는 관측 전 1500에 쥔 채 끝나 raw 처리와 다르므로 가운데 이후만 비교한다.
  it.each([
    ["A up(raw 1430)을 가운데 S 이후 1502ms에 늦게 관측한 뒤 D down 1510", [[1000, 1000, down("A")], [1430, 1502, up("A")], [1510, 1510, down("D")], [1760, 1760, up("D")]], [[1000, down("A")], [1430, up("A")], [1510, down("D")], [1760, up("D")]]],
    ["A up 1430 뒤 D down(raw 1490)을 가운데 S 이후 1505ms에 늦게 관측", [[1000, 1000, down("A")], [1430, 1430, up("A")], [1490, 1505, down("D")], [1760, 1760, up("D")]], [[1000, down("A")], [1430, up("A")], [1490, down("D")], [1760, up("D")]]],
  ] as const)("NJ-A07 ④ 충족 못 함 관측 지연: holdOnly [1000,1500] → [1500,1560] → head 1560 + [1560,1760]에서 %s해도 raw 처리와 같이 D가 가운데 바디를 시작해 head 1560은 1680ms Miss, D up 1760은 끝 release Perfect", (_label, observedSteps, rawSteps) => {
    const afterFront = (events: readonly NoteJudgmentEvent[]) => outcome(events.filter((event) => event.noteIndex !== 0));
    const observed = playObservedSession(headedTail(), observedSteps as unknown as (readonly [number, number, ...Input[]])[]);
    const raw = playSession(headedTail(), rawSteps as unknown as Step[]);
    expect(afterFront(observed)).toEqual([["head", 2, 0, "miss", 120, null, 1680], ["release", 3, 0, "perfect", 0, 1760, 1760]]);
    expect(afterFront(observed)).toEqual(afterFront(raw.events));
  });

  // PR #188 리뷰 3차 HIGH-3, 사용자 결정 "b"(2026-10-01): 아래는 확정 규칙의 기대 결과다. 형제 키를 쥔 채 뗀 몫을 S 이후에 새 키나
  // 같은 키 재누름으로 이어받는 경우 현재 엔진은 S에 바로 시작 실패한다. #198과 함께 다음 PR에서 고친다(PRD §12).
  it.todo("NJ-A07 U3 몫별(#198): double head 0 + [0,1000] → doubleLong [1000,1500]에서 A·B down 0 → B up 200 → B down 1030(같은 키 재누름, 뒤 S 이후) → A·B up 1500이면 B가 뗀 B의 몫을 이어받아 Full Combo (현재 n2u1이 1000ms에 시작 실패)");
  it.todo("NJ-A07 U3 몫별(#198): double head 0 + [0,1000] → 짧은 doubleLong [1000,1060]에서 A·B down 0 → B up 200 → B down 1030 → A·B up 1060이면 B가 뗀 B의 몫을 이어받아 Full Combo (현재 n2u1이 1000ms에 시작 실패)");
  it.todo("NJ-A07 U3 몫별(#198): double head 0 + [0,1000] → doubleLong [1000,1500]에서 A·B down 0 → B up 990 → C down 1050(뒤 S 이후, 인수 기한 안) → A·C up 1500이면 C가 B의 몫을 이어받아 Full Combo (현재 n2u1이 1000ms에 시작 실패)");
  it.todo("NJ-A07 U2 몫별(#198): double head 0 + [0,1000] → doubleLong [1000,1500]에서 A·B down 0 → B up 990 뒤 새 키 없이 A up 1500이면 B의 몫은 시작 창이 닫히는 1120ms에 시작 실패 (현재 1000ms에 시작 실패)");
});

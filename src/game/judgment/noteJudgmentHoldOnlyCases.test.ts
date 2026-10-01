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

  it("NJ-A07 대조: 짧은 doubleLong holdOnly [1500,1560]에서 A up 1455 뒤 B를 1500ms에 눌러 증가 unit을 시작하면 B의 unit은 1560ms에 Perfect, A로 이어진 unit은 1620ms에 A up으로 Perfect, Full Combo", () => {
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
    [true, 1250, [["holdOnly", 1, 0, "perfect", 0, null, 1260]]],
    [false, 1250, [["release", 1, 0, "great", 50, 1310, 1310]]],
    [true, 1300, [["holdOnly", 1, 0, "perfect", 0, 1300, 1300]]],
    [false, 1300, [["release", 1, 0, "great", 50, 1310, 1310]]],
  ] as const)("NJ-A07 U3: 감소 뒤 바디(holdOnly=%s)에서 B up 1160 → A up 1170 뒤 뒤 S 이후의 시작 창 안 %ims에 D를 누르면 D가 이어가고 일반 바디는 D up 1310이 release", (holdOnly, dAt, tail) => {
    const r = playSession(decrease(holdOnly)(), [decreaseStart, [1160, up("B")], [1170, up("A")], [dAt, down("D")], [1310, up("D")]]);
    expect(outcome(r.events)).toEqual([["release", 0, 0, "perfect", -40, 1160, 1160], ...tail]);
    expect(r.state.isFullCombo).toBe(true);
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

  // MEDIUM-2: 뗀 몫의 판정은 확정 순서를 거꾸로 돌리지 않는다(RFD 0020 §2.9).
  it("NJ-A07 §2.9: double head 1000 + [1000,1500] → doubleLong [1500,1560]에서 B up 1490 → C down 1545 → A up 1650이면 C가 B의 몫을 이어 1680ms release Miss이고 A up 1650이 release Good(+90)이며 확정 시각이 줄지 않는 순서로 전달됨", () => {
    const r = playSession([point(1000, "double"), body(1000, 1500), body(1500, 1560, "doubleLong")],
      [[1000, down("A"), down("B")], [1490, up("B")], [1545, down("C")], [1650, up("A")]]);
    expect(releases(r.events)).toEqual([["good", 90, "A", 1650], ["miss", 120, undefined, 1680]]);
    const confirmed = r.events.map((event) => event.confirmedAt);
    expect(confirmed).toEqual([...confirmed].sort((a, b) => a - b));
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

  // 확정 규칙이 하나로 정하지 않는 경우(PRD §12). 현재 엔진 동작을 바꾸지 않고 남긴다.
  it.todo("NJ-A07 미정: [1000,1500] → doubleLong holdOnly [1500,1560]에서 A up 1455 뒤 B down 1500이면 B가 아무도 준비하지 않은 증가 unit을 시작하고 A로 이어진 unit은 U2로 Perfect인지(현재 Full Combo), U3의 '새 키가 이어가면 뗀 키 up을 쓰지 않음'에 따라 B가 A의 unit을 이어가고 증가 unit이 Miss인지");
  it.todo("NJ-A07 미정: NJ-A04 차트(single [0,1000]의 double head 0 → doubleLong [1000,1060], Point 1100)에서 B를 990ms에 떼고 C를 995ms에 누르면, 풀린 B의 준비 대신 C가 뒤 바디를 이어가는지(현재 C는 Point 1100에 소비)");
});

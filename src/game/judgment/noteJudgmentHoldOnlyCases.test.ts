import { describe, expect, it } from "vitest";
import type { NoteEntity } from "../../shared/types";
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

describe("#180: E+Good까지 미확정인 holdOnly unit의 정산", () => {
  type Step = readonly [number, ...Input[]];

  /** 실제 NoteJudgmentSession으로 끝까지 재생해 정산 예외를 잡고, 한 번도 정산하지 않은 점수 항목을 함께 돌려준다. */
  function playSession(notes: readonly NoteEntity[], steps: readonly Step[]) {
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
      events: session.events,
      state: session.score.getState(),
      unsettled: compiled.scoreItems.map((item) => item.itemId).filter((itemId) => !settled.has(itemId)),
    };
  }
  const missTimeline = (events: readonly NoteJudgmentEvent[]) => events.filter((event) => event.grade === "miss")
    .map((event) => [event.kind, event.noteIndex, event.confirmedAt]);
  const timeline = (events: readonly NoteJudgmentEvent[]) => events
    .map((event) => [event.kind, event.noteIndex, event.unitIndex, event.itemId, event.grade, event.deltaMs, event.confirmedAt]);

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

  // 아래는 확정 규칙만으로 결과가 하나로 정해지지 않아 사용자 결정이 필요하다(PRD §12). 현재 엔진은 경계 전 보류 up으로만
  // 이어진 holdOnly unit을 E+Good에 상태 Miss(유지 Miss와 종속 0점)로 정산한다.
  it.todo("#180 미정: head 없는 [1000,1500] → doubleLong holdOnly [1500,1560]에서 경계 전 A up 1455ms(뒤 holdOnly E−Good 1440 이후)로만 이어진 unit0이 S+Good 1620ms 시작 실패인지, NJ-H07처럼 이른 완료 Perfect인지, A up 1430ms처럼 앞 바디 유지 Miss가 더해지는지 (현재 1680ms 상태 Miss)");
  it.todo("#180 미정: head 없는 doubleLong [1000,1200] → holdOnly [1200,1260]에서 B up 1160 → A up 1170 → D down 1180이면 D down이 holdOnly의 자기 시작인지(1260ms Perfect), A up으로만 이어진 holdOnly가 1320ms 시작 실패인지, 이른 완료 Perfect인지 (현재 1380ms 상태 Miss, D down 미소비)");
  it.todo("#180 미정: head 없는 holdOnly [1000,1500] → holdOnly [1500,1560]에서 A up 1455ms의 앞 holdOnly 이른 완료가 뒤 holdOnly까지 완료하는지 (현재 뒤 holdOnly는 1680ms 상태 Miss)");
});

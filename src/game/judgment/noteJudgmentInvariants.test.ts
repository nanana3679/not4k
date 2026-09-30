import { describe, expect, it } from "vitest";
import type { NoteEntity } from "../../shared/types";
import { body, counts, createHarness, down, point, up, type CaseInput } from "./noteJudgmentTestHarness";

type Batch = readonly [number, ...CaseInput[]];
const chart = () => [point(0, "double"), body(0, 1000, "doubleLong"), point(1000), body(1000, 1100, "doubleLong")];
const inputs: readonly Batch[] = [[0, down("A"), down("B")], [1040, up("A"), up("B")], [1050, down("B")], [1100, up("B")]];

function replay(notes: readonly NoteEntity[], batches: readonly Batch[], step?: number) {
  const h = createHarness(notes);
  const timeline = new Map<number, CaseInput[]>(batches.map(([time, ...events]) => [time, events]));
  if (step !== undefined) {
    for (let tick = 0; tick * step < 1300; tick++) {
      const at = tick * step;
      if (!timeline.has(at)) timeline.set(at, []);
    }
  }
  timeline.set(1300, []);
  for (const [at, events] of [...timeline].sort(([a], [b]) => a - b)) h.at(at, ...events);
  // noteIndex는 저장 배열의 위치이므로 논리적 대상의 정체성으로 비교한다.
  return {
    events: h.events.map(event => ({
      target: notes[event.noteIndex], kind: event.kind, grade: event.grade,
      deltaMs: event.deltaMs, inputAt: event.inputAt, confirmedAt: event.confirmedAt,
      phase: event.phase, consumed: event.consumed,
    })),
    combo: h.core.combo,
    score: h.score.finalize(),
  };
}

describe("RFD 0020 입력 순서와 시간 진행 불변식", () => {
  it("A를 0~2000ms 유지하고 중간 head만 놓치면 1000ms update 유무와 관계없이 head Miss 하나와 마지막 release Perfect", () => {
    const run = (dense: boolean) => {
      const h = createHarness([point(0), body(0, 1000), point(1000), body(1000, 2000)]);
      h.at(0, down("A"));
      if (dense) { h.at(1000); h.at(1121); }
      h.at(2000, up("A")); h.at(2200);
      return { events: h.events.map(e => [e.kind, e.grade, e.confirmedAt]), combo: h.core.combo, score: h.score.finalize() };
    };
    const expected = run(true);
    expect(expected.events).toEqual([["head", "perfect", 0], ["head", "miss", 1120], ["release", "perfect", 2000]]);
    expect(expected.score.earnedScore).toBe(6);
    expect(run(false)).toEqual(expected);
  });

  it.each([false, true])("1000ms의 L1 single head 보정1과 L2 double head 보정2는 레인 수집 반전=%s에도 독립적", reverse => {
    const notes = [
      ...chart(),
      point(0, "double", 2), body(0, 1000, "doubleLong", false, 2),
      point(1000, "double", 2), body(1000, 1100, "doubleLong", false, 2),
    ];
    const h = createHarness(notes);
    const batch = (at: number, entries: CaseInput[]) => h.at(at, ...(reverse ? [...entries].reverse() : entries));
    batch(0, [down("A"), down("B"), down("C", 2), down("D", 2)]);
    batch(1040, [up("A"), up("B"), up("C", 2), up("D", 2)]);
    batch(1050, [down("B"), down("E", 2), down("F", 2)]);
    batch(1100, [up("B"), up("E", 2), up("F", 2)]);
    h.at(1300);
    expect(counts(h.events)).toEqual({ perfect: 7, great: 4, good: 0, goodTrill: 0, miss: 0 });
    expect(h.score.getState()).toMatchObject({ processedNotes: 11, earnedScore: 29, liveDenominatorWeight: 33 });
  });

  it("1100ms로 한 번에 진행해도 L2 holdOnly 1000ms Perfect 뒤 L1 Point 1020ms Miss 순서로 확정되어 콤보 0", () => {
    const run = (dense: boolean) => {
      const h = createHarness([point(900), body(800, 1000, "long", true, 2)]);
      h.at(800, down("B", 2));
      if (dense) h.at(1000);
      h.at(1100);
      return { events: h.events.map(e => [e.kind, e.grade, e.confirmedAt]), combo: h.core.combo };
    };
    expect(run(false)).toEqual({ events: [["holdOnly", "perfect", 1000], ["head", "miss", 1020]], combo: 0 });
    expect(run(true)).toEqual(run(false));
  });

  it.each([
    [1000, 1050, 1050],
    [1100, 1105, 1100],
  ])("holdOnly [1000,1060]의 down=%ims/up=%ims이면 상태 확정 시각은 %ims", (pressedAt, releasedAt, confirmedAt) => {
    const h = createHarness([body(1000, 1060, "long", true)]);
    h.at(pressedAt, down("A")); h.at(releasedAt, up("A")); h.at(1300);
    expect(h.events).toHaveLength(1);
    expect(h.events[0]).toMatchObject({ kind: "holdOnly", grade: "perfect", confirmedAt, consumed: false, phase: "input" });
  });

  it.each([1, 8, 1000 / 60, 37])("동일한 R14 입력에 %fms마다 빈 update를 추가해도 확정시각·등급·콤보·점수가 같음", (step) => {
    expect(replay(chart(), inputs, step)).toEqual(replay(chart(), inputs));
  });

  it("R14의 A/B 동시 up 수집 순서를 바꿔도 실제 release 하나만 누설되고 최종 결과가 같음", () => {
    const reversed: readonly Batch[] = [inputs[0], [1040, up("B"), up("A")], inputs[2], inputs[3]];
    expect(replay(chart(), reversed)).toEqual(replay(chart(), inputs));
  });

  it("R14에서 A와 B의 물리 키 이름을 일대일 치환해도 후속 새 head와 두 release 결과가 같음", () => {
    const rename: Record<string, string> = { A: "Z", B: "Q" };
    const renamed = inputs.map(([time, ...events]): Batch => [time, ...events.map(event => ({ ...event, key: rename[event.key] }))]);
    expect(replay(chart(), renamed)).toEqual(replay(chart(), inputs));
  });

  it("R14의 노트 저장 배열을 역순으로 두어도 연결 관계와 논리적 판정 대상은 같음", () => {
    expect(replay(chart().reverse(), inputs)).toEqual(replay(chart(), inputs));
  });

  it("첫 head를 0ms 대신 창 안의 30ms에 눌러도 Q1·R04·R10·R12·H01~H04·o-*-*- 차트의 첫 head 외 판정은 정박과 같음", () => {
    const q1 = () => [point(0, "double"), body(0, 1000, "doubleLong"), body(1000, 1060), body(1060, 1100, "doubleLong"), body(1100, 2000)];
    const swap = (head: "single" | "double") => [point(0, "double"), body(0, 1000, "doubleLong"), point(1000, head), body(1000, 1100, "doubleLong")];
    const decrease = () => [point(0, "double"), body(0, 1000, "doubleLong", true), body(1000, 2000)];
    const cases: readonly (readonly [string, () => NoteEntity[], readonly Batch[]])[] = [
      ["R01", q1, [[0, down("A"), down("B")], [1000, up("A")], [1060, down("C")], [1100, up("C")], [2000, up("B")]]],
      ["R03", q1, [[0, down("A"), down("B")], [1060], [1121], [1181]]],
      ["R04", () => [point(0, "double"), body(0, 1000, "doubleLong"), point(1000), body(1000, 1060, "doubleLong")],
        [[0, down("A"), down("B")], [1020, up("A")], [1030, down("A")], [1035, up("B")], [1040, up("A")]]],
      ["R10", () => swap("double"), [[0, down("A"), down("B")], [995, up("A")], [1000, down("C")], [1030, up("B")], [1100, up("C")]]],
      ["R12", () => swap("single"), [[0, down("A"), down("B")], [1010, up("A")], [1040, up("B")], [1050, down("C")], [1100, up("C")]]],
      ["H01·H03", decrease, [[0, down("A"), down("B")], [2000, up("A")], [2500, up("B")]]],
      ["H02", () => [point(0, "double"), body(0, 1000, "doubleLong", true), body(1000, 1060), body(1060, 1100, "doubleLong", true), body(1100, 2000)],
        [[0, down("A"), down("B")], [2000, up("A")], [2500, up("B")]]],
      ["H04", () => [point(0, "double"), body(0, 1000, "doubleLong", true), body(1000, 1060), body(1060, 2000, "doubleLong")],
        [[0, down("A"), down("B")], [2000, up("A")], [2200, up("B")]]],
      ["H05 둘째 head Miss", () => [point(0, "double"), body(0, 60, "doubleLong", true), body(60, 1000)], [[0, down("A")], [1000, up("A")]]],
      ["o-*-*-", () => [point(0), body(0, 500, "long", true), body(500, 1000, "long", true), body(1000, 1500)], [[0, down("A")], [1500, up("A")]]],
    ];
    const afterFirstHead = (notes: readonly NoteEntity[], batches: readonly Batch[], firstAt: number) => {
      const h = createHarness(notes);
      batches.forEach(([time, ...events], index) => h.at(index === 0 ? firstAt : time, ...events));
      h.at(3000);
      return h.events.filter(event => !(event.kind === "head" && event.inputAt === firstAt))
        .map(event => [event.kind, event.noteIndex, event.unitIndex, event.grade, event.deltaMs, event.confirmedAt]);
    };
    for (const [name, notes, batches] of cases) expect(afterFirstHead(notes(), batches, 30), name).toEqual(afterFirstHead(notes(), batches, 0));
  });

  it("R10 보류 up과 L2 Miss가 있어도 8ms update 간격이 확정 순서를 바꾸지 않음", () => {
    const notes = [point(0, "double"), body(0, 1000, "doubleLong"), point(1000, "double"), body(1000, 1100, "doubleLong"), point(930, "single", 2)];
    const batches: readonly Batch[] = [[0, down("A"), down("B")], [995, up("A")], [1000, down("C")], [1030, up("B")], [1100, up("C")]];
    expect(replay(notes, batches, 8)).toEqual(replay(notes, batches));
  });
});

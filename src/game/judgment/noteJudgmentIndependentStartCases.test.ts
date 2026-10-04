import { describe, expect, it } from "vitest";
import type { NoteEntity } from "../../shared/types";
import { body, createHarness, down, point, up, type CaseInput } from "./noteJudgmentTestHarness";

// RFD 0020 §2.15: head Miss는 놓친 head 몫이 덮는 미시작 unit에만 추가 Miss를 면제한다.
// 덮이지 않는 unit은 독립 시작 의무로 시작 기한(S+Good)에 Miss 하나와 끝점 종속 0점을 낸다.

const S = 1000;
const E = 2000;
const AFTER_ALL = 3000;

type Heads = 0 | 1 | 2;
type Units = 1 | 2;

function independentNote(heads: Heads, units: Units, holdOnly: boolean): NoteEntity[] {
  const range = body(S, E, units === 2 ? "doubleLong" : "long", holdOnly);
  if (heads === 0) return [range];
  return [point(S, heads === 2 ? "double" : "single"), range];
}

type Script = readonly (readonly [number, CaseInput])[];

function play(notes: readonly NoteEntity[], script: Script = []) {
  const h = createHarness(notes);
  const byTime = new Map<number, CaseInput[]>();
  for (const [at, input] of script) byTime.set(at, [...(byTime.get(at) ?? []), input]);
  for (const at of [...byTime.keys()].sort((a, b) => a - b)) h.at(at, ...byTime.get(at)!);
  h.at(AFTER_ALL);
  const state = h.score.getState();
  return {
    events: h.events,
    miss: state.judgmentCounts.miss,
    earned: state.earnedScore,
    max: state.maxPossibleScore,
    settled: state.processedNotes,
    total: state.totalNotes,
  };
}

const label = (heads: Heads, units: Units, holdOnly: boolean) =>
  `${["head 없음", "single head", "double head"][heads]} + ${units === 2 ? "double" : "single"}${holdOnly ? " holdOnly" : ""} [1000,2000]`;

const configs = ([0, 1, 2] as const).flatMap(heads => ([1, 2] as const).flatMap(units =>
  [false, true].map(holdOnly => ({ heads, units, holdOnly }))));

describe("RFD 0020 §2.15 독립 노트의 입력 없음은 Miss max(H, B)", () => {
  it.each(configs.map(c => [label(c.heads, c.units, c.holdOnly), c] as const))(
    "NJ-S04: %s에 입력이 없으면 3000ms까지 진행해도 Miss는 head가 있으면 max(H, B)·없으면 unit 수이고 모든 점수 항목을 0점으로 한 번씩 정산",
    (_label, { heads, units, holdOnly }) => {
      const result = play(independentNote(heads, units, holdOnly));
      expect({ miss: result.miss, earned: result.earned, max: result.max, settled: result.settled }).toEqual({
        miss: heads === 0 ? units : Math.max(heads, units),
        earned: 0,
        max: 3 * (heads + units),
        settled: heads + units,
      });
    },
  );

  it("NJ-S04: single head 1000 + 독립 double [1000,2000]에 입력이 없으면 1120ms에 head Miss·종속 0점과 둘째 unit의 시작 Miss·종속 0점을 함께 내고 0/9, 정산 3개, Miss 2", () => {
    const result = play([point(S), body(S, E, "doubleLong")]);
    expect(result.events.map(e => `${e.kind}:${e.noteIndex}:${e.grade}@${e.confirmedAt}`).sort()).toEqual([
      "dependentZero:1:miss@1120",
      "dependentZero:1:miss@1120",
      "head:0:miss@1120",
      "maintenanceMiss:1:miss@1120",
    ]);
    expect(new Set(result.events.filter(e => e.kind === "dependentZero").map(e => e.unitIndex))).toEqual(new Set([0, 1]));
    expect({ earned: result.earned, max: result.max, settled: result.settled, miss: result.miss })
      .toEqual({ earned: 0, max: 9, settled: 3, miss: 2 });
  });

  it("NJ-S04: double head 1000 + 독립 single [1000,2000]에 입력이 없으면 head Miss 2와 종속 0점 1이며 독립 시작 Miss는 없어 0/9, Miss 2", () => {
    const result = play([point(S, "double"), body(S, E)]);
    expect(result.events.map(e => e.kind).sort()).toEqual(["dependentZero", "head", "head"]);
    expect(new Set(result.events.map(e => e.confirmedAt))).toEqual(new Set([1120]));
    expect({ earned: result.earned, max: result.max, miss: result.miss }).toEqual({ earned: 0, max: 9, miss: 2 });
  });

  it("NJ-S04: double head 1000 + 독립 double [1000,2000]에 입력이 없으면 두 head Miss가 두 unit을 덮어 시작 Miss 없이 Miss 2", () => {
    const result = play([point(S, "double"), body(S, E, "doubleLong")]);
    expect(result.events.filter(e => e.kind !== "dependentZero").map(e => e.kind)).toEqual(["head", "head"]);
    expect(result.events.filter(e => e.kind === "dependentZero")).toHaveLength(2);
    expect(result.miss).toBe(2);
  });
});

describe("RFD 0020 §2.15 독립 노트의 전부 성공", () => {
  it.each(configs.map(c => [label(c.heads, c.units, c.holdOnly), c] as const))(
    "NJ-S04: %s를 max(H, B)개 키로 1000ms에 누르고 2000ms에 떼면 Miss 0이고 모든 점수 항목 Perfect",
    (_label, { heads, units, holdOnly }) => {
      const keys = ["A", "B"].slice(0, Math.max(heads, units));
      const result = play(independentNote(heads, units, holdOnly), keys.flatMap(key => [[S, down(key)], [E, up(key)]] as const));
      expect({ earned: result.earned, miss: result.miss, settled: result.settled }).toEqual({ earned: 3 * (heads + units), miss: 0, settled: heads + units });
    },
  );
});

describe("RFD 0020 §2.15 single head + 독립 double의 부분 입력은 입력 없음보다 나쁘지 않음", () => {
  const chart = () => [point(S), body(S, E, "doubleLong")];

  it("NJ-S04: A로 head를 친 뒤 1500ms에 떼면 head Perfect·둘째 unit 1120ms 시작 Miss·A 1500ms 유지 Miss로 3/9·Miss 2이며 입력 없음(0/9·Miss 2)보다 나쁘지 않음", () => {
    const partial = play(chart(), [[1000, down("A")], [1500, up("A")]]);
    const none = play(chart());
    expect({ earned: partial.earned, miss: partial.miss }).toEqual({ earned: 3, miss: 2 });
    expect(partial.earned).toBeGreaterThanOrEqual(none.earned);
    expect(partial.miss).toBeLessThanOrEqual(none.miss);
  });

  it("NJ-S04: A로 head를 치고 2000ms까지 유지하면 둘째 unit 시작 Miss 하나와 release Perfect로 6/9·Miss 1", () => {
    const result = play(chart(), [[1000, down("A")], [2000, up("A")]]);
    expect({ earned: result.earned, miss: result.miss, settled: result.settled }).toEqual({ earned: 6, miss: 1, settled: 3 });
  });

  it("NJ-S04: A head 1000ms와 B 시작 1030ms를 모두 2000ms까지 유지하면 9/9·Miss 0", () => {
    const result = play(chart(), [[1000, down("A")], [1030, down("B")], [2000, up("A")], [2000, up("B")]]);
    expect({ earned: result.earned, miss: result.miss }).toEqual({ earned: 9, miss: 0 });
  });
});

describe("RFD 0020 §2.15 기존 종속·승계 결과 보존", () => {
  it("NJ-S04: double [0,1000]을 A/B로 쥔 채 single head 1000을 놓치고 double [1000,2000]을 승계하면 head Miss 하나뿐이고 2000ms의 두 release Perfect", () => {
    const result = play([point(0, "double"), body(0, 1000, "doubleLong"), point(1000), body(1000, 2000, "doubleLong")], [
      [0, down("A")], [0, down("B")], [2000, up("A")], [2000, up("B")],
    ]);
    expect(result.events.filter(e => e.noteIndex >= 2).map(e => [e.kind, e.grade])).toEqual([
      ["head", "miss"], ["release", "perfect"], ["release", "perfect"],
    ]);
    expect(result.miss).toBe(1);
  });

  it("NJ-S04: single [0,1000]을 A로 승계한 1→2 증가에서 single head 1000을 놓치면 head의 놓친 몫이 승계하지 못한 unit을 덮어 종속 0점이고 Miss는 head 하나", () => {
    const result = play([point(0), body(0, 1000), point(1000), body(1000, 2000, "doubleLong")], [[0, down("A")], [2000, up("A")]]);
    expect(result.events.filter(e => e.noteIndex === 2 || e.noteIndex === 3).map(e => [e.kind, e.grade])).toEqual([
      ["head", "miss"], ["dependentZero", "miss"], ["release", "perfect"],
    ]);
    expect(result.miss).toBe(1);
  });

  it("NJ-S04: 앞 single [0,1000]을 500ms에 실패한 뒤 single head 1000 + double [1000,2000]에 입력이 없으면 승계가 없어 head Miss·독립 시작 Miss가 각각 하나로 전체 Miss 3", () => {
    const result = play([point(0), body(0, 1000), point(1000), body(1000, 2000, "doubleLong")], [[0, down("A")], [500, up("A")]]);
    expect(result.events.filter(e => e.noteIndex >= 2 && e.kind !== "dependentZero").map(e => [e.kind, e.confirmedAt])).toEqual([
      ["head", 1120], ["maintenanceMiss", 1120],
    ]);
    expect(result.events.filter(e => e.noteIndex === 3 && e.kind === "dependentZero")).toHaveLength(2);
    expect({ miss: result.miss, settled: result.settled, total: result.total }).toEqual({ miss: 3, settled: 4, total: 4 });
  });

  it("NJ-S04: double head 1000 + 독립 single [1000,2000]에서 A만 head로 치고 2000ms까지 유지하면 head Perfect·head Miss·release Perfect로 6/9·Miss 1", () => {
    const result = play([point(S, "double"), body(S, E)], [[1000, down("A")], [2000, up("A")]]);
    expect(result.events.map(e => [e.kind, e.grade])).toEqual([["head", "perfect"], ["head", "miss"], ["release", "perfect"]]);
    expect({ earned: result.earned, miss: result.miss }).toEqual({ earned: 6, miss: 1 });
  });

  it("NJ-S04: double head 1000 + 독립 double [1000,2000]에서 A만 head로 치고 1500ms에 떼면 놓친 head 몫이 둘째 unit을 덮고 A의 유지 Miss만 더해 3/12·Miss 2이며 끝점 추가 Miss 없음", () => {
    const result = play([point(S, "double"), body(S, E, "doubleLong")], [[1000, down("A")], [1500, up("A")]]);
    expect(result.events.filter(e => e.kind !== "dependentZero").map(e => [e.kind, e.grade, e.confirmedAt])).toEqual([
      ["head", "perfect", 1000], ["head", "miss", 1120], ["maintenanceMiss", "miss", 1500],
    ]);
    expect({ earned: result.earned, max: result.max, miss: result.miss, settled: result.settled }).toEqual({ earned: 3, max: 12, miss: 2, settled: 4 });
  });
});

describe("RFD 0020 §2.15 독립 노트에서 부분 입력과 입력 없음의 최종 점수·Miss 비교", () => {
  // 두 키 A/B 각각: 없음 또는 (down 시각 × up 시점). 창 안·밖 down, S 전 짧은 tap(#180 경로), 이른·정상·늦은 release, 유지 후 미해제를 포함한다.
  const downTimes = [S - 120, S - 100, S, S + 100, S + 150];
  const upAfter = (d: number) => [d + 10, S + 300, E - 60, E, E + 200, undefined];
  const keyOptions = (key: string): Script[] => [
    [],
    ...downTimes.flatMap(d => upAfter(d).map(u => (u === undefined
      ? [[d, down(key)]] as const
      : [[d, down(key)], [u, up(key)]] as const) as Script)),
  ];
  const scripts = keyOptions("A").flatMap(a => keyOptions("B").map(b => [...a, ...b] as Script));

  function tryPlay(notes: readonly NoteEntity[], script: Script) {
    try { return play(notes, script); } catch (error) { return { error: (error as Error).message }; }
  }

  it.each(configs.map(c => [label(c.heads, c.units, c.holdOnly), c] as const))(
    "NJ-S04: %s에서 A/B 입력 조합 961가지(S 전 10ms tap 포함) 모두 예외 없이 입력 없음보다 최종 획득 점수가 낮거나 Miss가 많지 않고 모든 점수 항목을 한 번씩 정산",
    (_label, { heads, units, holdOnly }) => {
      const none = play(independentNote(heads, units, holdOnly));
      const worse: string[] = [];
      for (const script of scripts) {
        const result = tryPlay(independentNote(heads, units, holdOnly), script);
        const inputs = JSON.stringify(script.map(([at, input]) => `${input.key}${input.type}@${at}`));
        if ("error" in result) { worse.push(`${inputs} error=${result.error}`); continue; }
        const ids = result.events.filter(e => e.itemId !== undefined).map(e => e.itemId);
        if (result.earned < none.earned || result.miss > none.miss || result.settled !== result.total || ids.length !== new Set(ids).size) {
          worse.push(`${inputs} earned=${result.earned} miss=${result.miss} settled=${result.settled}/${result.total}`);
        }
      }
      expect(scripts).toHaveLength(961);
      expect(worse).toEqual([]);
    },
  );
});

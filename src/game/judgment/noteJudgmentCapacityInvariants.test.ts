import { describe, expect, it } from "vitest";
import { body, createHarness, down, point, up, counts, type CaseInput } from "./noteJudgmentTestHarness";

describe("감소·증가 경계의 유지 키 풀 불변식", () => {
  it.each([false, true])("일반 =-=-에서 첫 종료 키를 A/B 중 반전=%s로 골라도 필요한 down 3개와 up 3개로 Perfect 5개", reverseKey => {
    const keys = reverseKey ? ["B", "A", "C"] : ["A", "B", "C"];
    const h = createHarness([
      point(0, "double"), body(0, 1000, "doubleLong"),
      body(1000, 1060), body(1060, 1100, "doubleLong"), body(1100, 2000),
    ]);
    h.at(0, down(keys[0]), down(keys[1]));
    h.at(1000, up(keys[0])); h.at(1060, down(keys[2]));
    h.at(1100, up(keys[2])); h.at(2000, up(keys[1])); h.at(2200);
    expect(counts(h.events)).toEqual({ perfect: 5, great: 0, good: 0, goodTrill: 0, miss: 0 });
    expect(h.score.finalize()).toMatchObject({ earnedScore: 15, finalDenominatorWeight: 15, isFullCombo: true });
  });

  it.each([false, true])("두 감소가 holdOnly인 =-=-에서 저장 배열 반전=%s와 17ms frame 추가가 H Perfect 4개·마지막 release 1개를 바꾸지 않음", reverseNotes => {
    const notes = [point(0, "double"), body(0, 1000, "doubleLong", true), body(1000, 1060), body(1060, 1100, "doubleLong", true), body(1100, 2000)];
    if (reverseNotes) notes.reverse();
    const run = (frames: boolean) => {
      const h = createHarness(notes);
      const timeline = new Map<number, CaseInput[]>([[0, [down("A"), down("B")]], [2000, [up("A")]], [2500, [up("B")]]]);
      if (frames) for (let t = 17; t < 2600; t += 17) if (!timeline.has(t)) timeline.set(t, []);
      timeline.set(2600, []);
      for (const [at, inputs] of [...timeline].sort(([a], [b]) => a - b)) h.at(at, ...inputs);
      expect(h.events.filter(event => event.kind === "holdOnly")).toHaveLength(4);
      expect(h.events.filter(event => event.kind === "release")).toHaveLength(1);
      expect(counts(h.events)).toEqual({ perfect: 7, great: 0, good: 0, goodTrill: 0, miss: 0 });
      return { events: h.events, score: h.score.finalize(), combo: h.core.combo };
    };
    expect(run(true)).toEqual(run(false));
  });
});

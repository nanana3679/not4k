import { describe, expect, it } from "vitest";
import { beat } from "../../shared/types/beat";
import type { ChartDocument, ExplicitNoteEntity } from "../../shared/types/chart";
import { compileExplicitJudgmentChart } from "../judgment/explicitCompiledChart";
import { ExplicitJudgmentSession } from "../judgment/ExplicitJudgmentSession";
import { explicitEnjFixtures } from "../judgment/explicitEnjFixtures";
import { explicitHcFixtures } from "../judgment/explicitHcFixtures";
import { InputTimeline } from "./InputTimeline";
import { ExplicitAutoPlayer } from "./ExplicitAutoPlayer";
import type { ExplicitAutoInput, ExplicitAutoPlayerOptions } from "./ExplicitAutoPlayer";

const tap = (ms: number, kind: "single" | "double" | "trill" = "single", lane = 1): ExplicitNoteEntity =>
  ({ type: "tap", kind, lane, beat: beat(ms, 500) });
const body = (start: number, end: number, holdCount: 1 | 2 = 1): ExplicitNoteEntity =>
  ({ type: "body", lane: 1, beat: beat(start, 500), endBeat: beat(end, 500), holdCount });
const release = (ms: number, count: 1 | 2 = 1, grace = false): ExplicitNoteEntity =>
  ({ type: "release", lane: 1, beat: beat(ms, 500), count, grace });
const tick = (ms: number, count: 1 | 2 = 1): ExplicitNoteEntity =>
  ({ type: "tick", lane: 1, beat: beat(ms, 500), count });
function document(notes: ExplicitNoteEntity[], trill = false): ChartDocument {
  return { meta: { title: "explicit auto", artist: "test", difficultyLabel: "NORMAL", difficultyLevel: 1,
    imageFile: "", audioFile: "", previewAudioFile: "", offsetMs: 0 }, notes,
  events: [{ type: "bpm", beat: beat(0), bpm: 120 }],
  trillZones: trill ? [{ lane: 1, beat: beat(0), endBeat: beat(8) }] : [] };
}
function replay(chart: ChartDocument, options: ExplicitAutoPlayerOptions = {}) {
  const compiled = compileExplicitJudgmentChart(chart);
  const events = new ExplicitAutoPlayer(compiled, options).eventsThrough(Infinity);
  const session = new ExplicitJudgmentSession(compiled);
  const timeline = new InputTimeline();
  timeline.enqueueMany(events.map(event => ({ ...event, inputAt: event.timeMs })));
  timeline.flushThrough(Infinity, (at, batch) => session.processBatch(at, batch));
  return { events, session, result: session.finalize(), compiled };
}
function expectPhysical(events: readonly ExplicitAutoInput[], maxKeys = 2) {
  const held = new Set<string>();
  const seen = new Set<string>();
  for (const event of events) {
    expect(held.has(event.key), `${event.timeMs} ${event.type} ${event.key}`).toBe(event.type === "up");
    if (event.type === "down") { held.add(event.key); seen.add(event.key); } else held.delete(event.key);
    expect(held.size).toBeLessThanOrEqual(maxKeys);
  }
  expect(held.size).toBe(0);
  expect(seen.size).toBeLessThanOrEqual(maxKeys);
}

describe("ExplicitAutoPlayer의 실제 물리 입력과 정산", () => {
  it("2000ms 복원 전 입력은 1000 down·1050 up만 가져오고 정확히2000 down은 재개 입력에 남긴다", () => {
    const compiled = compileExplicitJudgmentChart(document([tap(1000), tap(2000)]));
    const auto = new ExplicitAutoPlayer(compiled);
    expect(auto.eventsBefore(2000).map(event => [event.timeMs, event.type])).toEqual([[1000, 'down'], [1050, 'up']]);
    expect(auto.eventsThrough(2000).map(event => [event.timeMs, event.type])).toEqual([[2000, 'down']]);
    expect(auto.eventsThrough(Infinity).map(event => [event.timeMs, event.type])).toEqual([[2050, 'up']]);
  });

  it('바디1000～3000의2000ms 커서를 복원하면 KeyQ hold를 되찾고3000ms release를 다시 한 번 전달한다', () => {
    const auto = new ExplicitAutoPlayer(compileExplicitJudgmentChart(document([body(1000, 3000), release(3000)])));
    const prefix = auto.eventsThrough(2000);
    const cursor = auto.processedEventCount;
    const suffix = auto.eventsThrough(Infinity);
    expect(auto.restoreCursor(cursor)).toEqual([{ lane: 1, key: prefix[0].key }]);
    expect(auto.eventsThrough(2999)).toEqual([]);
    expect(auto.eventsThrough(3000)).toEqual(suffix);
    expect(auto.eventsThrough(Infinity)).toEqual([]);
    expect(auto.restoreCursor(0)).toEqual([]);
    expect(auto.eventsThrough(Infinity)).toEqual([...prefix, ...suffix]);
  });

  it('트릴1000·1010·1020에서 첫 down 뒤로 되감으면 같은 미래 키 교대 계획을 재생한다', () => {
    const auto = new ExplicitAutoPlayer(compileExplicitJudgmentChart(document(
      [tap(1000, 'trill'), tap(1010, 'trill'), tap(1020, 'trill')], true)));
    const first = auto.eventsThrough(1000);
    const cursor = auto.processedEventCount;
    const later = auto.eventsThrough(Infinity);
    expect(auto.restoreCursor(cursor)).toEqual([{ lane: 1, key: first[0].key }]);
    expect(auto.eventsThrough(Infinity)).toEqual(later);
    const downs = [...first, ...later].filter(event => event.type === 'down');
    expect(downs[0].key).not.toBe(downs[1].key);
    expect(downs[1].key).not.toBe(downs[2].key);
  });

  it.each([...explicitEnjFixtures, ...explicitHcFixtures])("$id 명시 차트를 자동 physical events로 재생하면 모든 입력이 적법하고 항목이 한 번 정산", fixture => {
    const p = replay(fixture.chart);
    expect(p.result.facts.filter(fact => fact.kind === "input").every(fact => fact.accepted)).toBe(true);
    expect(p.result.score.processedNotes).toBe(p.compiled.totalJudgments);
    expect(p.result.facts.filter(fact => fact.kind === "settlement")).toHaveLength(p.compiled.totalJudgments);
    expect(p.result.score.judgmentCounts.miss).toBe(0);
  });
  it.each([1, 2] as const)("hold %i개 바디와 같은 수의 탭·릴리즈는 모두 Perfect 3점씩 정산", count => {
    const p = replay(document([tap(1000, count === 1 ? "single" : "double"), body(1000, 2000, count),
      tick(1500, count), release(2000, count)]));
    expect(p.result.score.earnedScore).toBe(p.compiled.theoreticalWeight);
    expect(p.result.score.judgmentCounts.perfect).toBe(3 * count);
    expect(p.session.snapshot.bodyUnits.every(unit => unit.state === "complete")).toBe(true);
    expectPhysical(p.events);
  });

  it.each([1, 2] as const)("탭 없는 hold %i개 바디도 실제 down으로 시작하고 틱 노트만 3점씩 정산", count => {
    const p = replay(document([body(1000, 2000, count), tick(1500, count)]));
    expect(p.result.score.earnedScore).toBe(3 * count);
    expect(p.compiled.totalJudgments).toBe(count);
    expectPhysical(p.events);
  });

  it("점수 노트 없는 바디는 down/up으로 실제 완료해도 점수·분모·확정 효과가 모두 0", () => {
    const p = replay(document([body(1000, 2000)]));
    expect(p.events.map(event => event.type)).toEqual(["down", "up"]);
    expect(p.result.snapshot.bodyUnits[0].state).toBe("complete");
    expect(p.result.score.earnedScore).toBe(0);
    expect(p.result.score.maxPossibleScore).toBe(0);
    expect(p.result.effects).toEqual([]);
  });

  it.each([0, 10, 60])("길이 %ims 바디는 실제 시작·완료하고 자동 끝 점수를 만들지 않음", length => {
    const p = replay(document([body(1000, 1000 + length), tick(1000 + length / 2)]));
    expect(p.result.score.earnedScore).toBe(3);
    expect(p.result.snapshot.bodyUnits[0].state).toBe("complete");
    expect(p.result.score.judgmentCounts.miss).toBe(0);
    expectPhysical(p.events);
  });

  it.each([1, 2] as const)("싱글 바디에 릴리즈 %i개를 명시하면 요구 수를 그대로 실제 up으로 충족", count => {
    const p = replay(document([body(1000, 2000), release(2000, count)]));
    expect(p.result.score.earnedScore).toBe(3 * count);
    expect(p.result.score.judgmentCounts.perfect).toBe(count);
    expectPhysical(p.events);
  });

  it.each([false, true])("단독 더블 릴리즈 grace=%s도 서로 다른 두 키의 실제 up으로 6점", grace => {
    const p = replay(document([release(1000, 2, grace)]));
    expect(p.result.score.earnedScore).toBe(6);
    expect(p.result.facts.filter(fact => fact.kind === "input" && fact.action === "up" && fact.consumedItemId)).toHaveLength(2);
    expectPhysical(p.events);
  });

  it("Grace 릴리즈가 2000ms에 있으면 실제 up을 보내고 raw 0ms·timing null을 보존", () => {
    const p = replay(document([tap(1000), body(1000, 2000), release(2000, 1, true)]));
    expect(p.result.facts.filter(fact => fact.kind === "settlement" && fact.itemKind === "release"))
      .toMatchObject([{ grade: "perfect", rawDeltaMs: 0, timingDeltaMs: null }]);
    expect(p.events.some(event => event.type === "up" && event.timeMs === 2000)).toBe(true);
  });

  it("1→2→1 연결은 유한 두 키로 실제 hold 수를 늘리고 줄여 명시 항목만 정산", () => {
    const p = replay(document([body(1000, 1500), body(1500, 2000, 2), tick(1750, 2),
      release(2000), body(2000, 2500), tick(2250), release(2500)]));
    expect(p.result.score.earnedScore).toBe(p.compiled.theoreticalWeight);
    expect(p.result.score.judgmentCounts.miss).toBe(0);
    expect(p.result.snapshot.bodyUnits.every(unit => unit.state === "complete")).toBe(true);
    expectPhysical(p.events);
  });

  it("트릴 탭 1000·1010·1020ms와 트릴 바디는 동일 zone에서 키를 교대하고 릴리즈를 만들지 않음", () => {
    const chart = document([tap(1000, "trill"), tap(1010, "trill"), tap(1020, "trill"),
      { type: "body", lane: 1, beat: beat(2), endBeat: beat(4), holdCount: 1, trill: true }], true);
    const p = replay(chart);
    expect(p.result.score.judgmentCounts.perfect).toBe(3);
    expect(p.result.score.judgmentCounts.goodTrill).toBe(0);
    const downs = p.events.filter(event => event.type === "down");
    expect(downs[0].key).not.toBe(downs[1].key);
    expect(downs[1].key).not.toBe(downs[2].key);
    expect(p.compiled.totalJudgments).toBe(3);
    expectPhysical(p.events);
  });

  it("더블 hold 중 1950ms 탭의 재누름 up은 2000ms 릴리즈를 Great로 일찍 소비하고 9점 중 8점", () => {
    const p = replay(document([body(1000, 2000, 2), tap(1950), release(2000, 2)]));
    const releaseFacts = p.result.facts.filter(fact => fact.kind === "settlement" && fact.itemKind === "release");
    expect(releaseFacts).toMatchObject([{ grade: "great", rawDeltaMs: -50 }, { grade: "perfect", rawDeltaMs: 0 }]);
    expect(p.result.score.earnedScore).toBe(8);
    expect(p.result.score.maxPossibleScore).toBe(9);
    expectPhysical(p.events);
  });

  it("틱 노트 0→3개를 추가해도 바디·탭·릴리즈의 합성 입력 배열이 같음", () => {
    const notes = [tap(1000), body(1000, 2000), release(2000)];
    const a = replay(document(notes));
    const b = replay(document([...notes, tick(1250), tick(1500), tick(1750)]));
    expect(a.events).toEqual(b.events);
    expect(b.result.score.earnedScore - a.result.score.earnedScore).toBe(9);
  });

  it("AutoEvent [1000,1000]은 시작 down만 만들고 2000ms 범위 밖 up도 전달하며 2500ms 수동 탭은 건드리지 않음", () => {
    const p = replay(document([tap(1000), body(1000, 2000), release(2000), tap(2500)]),
      { sections: [{ startMs: 1000, endMs: 1000 }] });
    expect(p.events.map(event => [event.timeMs, event.type])).toEqual([[1000, "down"], [2000, "up"]]);
    expect(p.result.score.judgmentCounts.perfect).toBe(2);
    expectPhysical(p.events);
  });

  it("AutoEvent []이면 단독 릴리즈와 수동 바디 끝에도 orphan up을 만들지 않음", () => {
    const p = replay(document([body(1000, 2000), release(2000), release(2500)]), { sections: [] });
    expect(p.events).toEqual([]);
  });

  it("eventsThrough 999→1000→1000→Infinity 호출은 각 입력을 한 번만 반환", () => {
    const player = new ExplicitAutoPlayer(compileExplicitJudgmentChart(document([tap(1000)])));
    expect(player.eventsThrough(999)).toEqual([]);
    expect(player.eventsThrough(1000)).toHaveLength(1);
    expect(player.eventsThrough(1000)).toEqual([]);
    expect(player.eventsThrough(Infinity)).toHaveLength(1);
    expect(player.eventsThrough(Infinity)).toEqual([]);
  });

  it("더블에 바인딩 키가 1개면 한 키를 두 몫으로 위장하지 않고 생성 시 거부", () => {
    const compiled = compileExplicitJudgmentChart(document([tap(1000, "double")]));
    expect(() => new ExplicitAutoPlayer(compiled, { bindings: [{ lane: 1, key: "KeyA" }] })).toThrow("2개");
  });

  it("동일 키를 L1·L2에 중복 바인딩하면 물리 키 수명 충돌을 생성 시 거부", () => {
    const compiled = compileExplicitJudgmentChart(document([tap(1000)]));
    expect(() => new ExplicitAutoPlayer(compiled, { bindings: [{ lane: 1, key: "KeyA" }, { lane: 2, key: "KeyA" }] }))
      .toThrow("중복");
  });
});

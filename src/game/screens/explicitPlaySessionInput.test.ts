import { describe, expect, it, vi } from "vitest";
import type { ChartDocument, ExplicitNoteEntity } from "../../shared/types/chart";
import { beat } from "../../shared/types/beat";
import { ExplicitAutoPlayer } from "../input/ExplicitAutoPlayer";
import type { ExplicitAutoSection } from "../input/ExplicitAutoPlayer";
import { InputTimeline } from "../input/InputTimeline";
import { compileExplicitJudgmentChart } from "../judgment/explicitCompiledChart";
import { ExplicitJudgmentSession } from "../judgment/ExplicitJudgmentSession";
import { GameClock } from "../time/GameClock";
import { canFinishExplicitPlaySession, createExplicitPlayInput, drainExplicitPlaySessionInputs,
  finishExplicitPlaySession, stepExplicitPlaySession } from "./explicitPlaySessionInput";

const point = (ms: number, lane = 1, kind: "single" | "double" = "single"): ExplicitNoteEntity =>
  ({ type: "point", kind, lane, beat: beat(ms, 500) });
const body = (start: number, end: number): ExplicitNoteEntity =>
  ({ type: "body", holdCount: 1, lane: 1, beat: beat(start, 500), endBeat: beat(end, 500) });
const release = (ms: number): ExplicitNoteEntity => ({ type: "release", count: 1, lane: 1, beat: beat(ms, 500) });
const sustain = (ms: number): ExplicitNoteEntity => ({ type: "sustain", count: 1, lane: 1, beat: beat(ms, 500) });
function play(notes: ExplicitNoteEntity[], offset = 0, sections: readonly ExplicitAutoSection[] = [], latency = 0, rate = 1) {
  const chart: ChartDocument = { meta: { title: "explicit input", artist: "test", difficultyLabel: "NORMAL", difficultyLevel: 1,
    imageFile: "", audioFile: "", previewAudioFile: "", offsetMs: 0 }, notes, trillZones: [],
  events: [{ type: "bpm", beat: beat(0), bpm: 120 }] };
  const compiled = compileExplicitJudgmentChart(chart);
  const session = new ExplicitJudgmentSession(compiled, { maintenanceGraceMs: 20 });
  const timeline = new InputTimeline();
  const audio = { currentTimeMs: 0, playbackRate: rate, getOutputLatencyMs: () => latency };
  const clock = new GameClock(audio, { visualOffsetMs: 0, inputOffsetMs: offset }, () => audio.currentTimeMs);
  const auto = new ExplicitAutoPlayer(compiled, { sections });
  return { session, timeline, audio, clock, auto,
    input(observed: number, rawEvent: number, key = "KeyA", type: "down" | "up" = "down", lane = 1) {
      audio.currentTimeMs = observed;
      timeline.enqueue({ inputAt: clock.toInputTimeMs(rawEvent), lane, key, type });
    },
    frame(at: number) {
      audio.currentTimeMs = at;
      return stepExplicitPlaySession(timeline, session, auto, clock, at);
    },
    canFinish(end: number, at: number) {
      audio.currentTimeMs = at;
      return canFinishExplicitPlaySession(session, clock, end, at);
    },
    finish() {
      finishExplicitPlaySession(timeline, session, auto);
      return session.finalize();
    },
  };
}
const settlements = (session: ExplicitJudgmentSession) => session.facts.filter(fact => fact.kind === "settlement");

describe("명시 실제 세션의 프레임 입력 drain", () => {
  it('입력−200ms에서J2000의core1800까지 복원하면J2050에 받은raw1850은 제외하고 이후 같은 입력을 Perfect로 다시 받는다', () => {
    const p = play([point(1850)], -200);
    p.frame(2000); p.input(2050, 2050); p.frame(2050);
    expect(p.session.score.earnedScore).toBe(3);
    const restored = p.session.reconstructAt(2000).session;
    expect(restored.snapshot.atMs).toBe(1800);
    expect(restored.score.processedNotes).toBe(0);
    restored.resumeAt(1800, [], 2000, 2000);
    p.audio.currentTimeMs = 2050;
    p.timeline.enqueue({ lane: 1, key: 'KeyA', type: 'down', inputAt: p.clock.toInputTimeMs(2050) });
    stepExplicitPlaySession(p.timeline, restored, p.auto, p.clock, 2050);
    expect(restored.score).toMatchObject({ earnedScore: 3, judgmentCounts: { perfect: 1, miss: 0 } });
  });

  it.each([-100, 100])("입력 offset %ims에서 1000ms Point의 raw 1120ms down은 포함 Good 경계를 보존", offset => {
    const p = play([point(1000)], offset);
    const physical = 1120 - offset;
    p.frame(physical - 1);
    expect(settlements(p.session)).toEqual([]);
    p.input(physical, physical); p.frame(physical);
    expect(settlements(p.session)).toMatchObject([{ grade: "good", atMs: 1120, rawDeltaMs: 120 }]);
    expect(p.finish().score.earnedScore).toBe(1);
  });

  it("1400ms 큰 프레임에 down1000/up1100을 drain해도 Point·릴리즈가 각각 Perfect 3점", () => {
    const p = play([point(1000), body(1000, 1100), release(1100)]);
    p.input(1000, 1000); p.input(1100, 1100, "KeyA", "up");
    p.frame(1400);
    expect(settlements(p.session)).toMatchObject([{ itemKind: "point", grade: "perfect", atMs: 1000 },
      { itemKind: "release", grade: "perfect", atMs: 1100 }]);
    expect(p.finish().score.earnedScore).toBe(6);
  });

  it("세션 1080ms 뒤 도착한 raw1000은 Perfect 오차 0을 보존하고 1080ms에 확정", () => {
    const p = play([point(1000)]);
    p.frame(1080); p.input(1080, 1000); p.frame(1080);
    expect(settlements(p.session)).toMatchObject([{ grade: "perfect", atMs: 1000, confirmedAt: 1080, rawDeltaMs: 0 }]);
  });

  it("세션 1080ms에서 과거 raw1000/1050/1060을 한 group으로 재생하여 10ms hold 공백 회복을 보존", () => {
    const p = play([point(1000), body(1000, 1500), sustain(1040), sustain(1060), release(1500)]);
    p.frame(1080);
    for (const [at, type] of [[1000, "down"], [1050, "up"], [1060, "down"]] as const) p.input(1080, at, "KeyA", type);
    const grouped = vi.spyOn(p.session, "processObservedBatches");
    p.frame(1080);
    expect(grouped).toHaveBeenCalledTimes(1);
    expect(grouped.mock.calls[0][0].map(group => group.rawAtMs)).toEqual([1000, 1050, 1060]);
    expect(grouped.mock.calls[0][1]).toBe(1080);
    expect(p.session.result().score.judgmentCounts.perfect).toBe(3);
    expect(p.session.snapshot.bodyUnits[0].state).toBe("active");
  });

  it("과거 raw1000과 미래 raw2000이 한 drain에 있어도 미래 관측으로 Point를 먼저 Miss 확정하지 않음", () => {
    const p = play([point(1000)]);
    p.frame(1080);
    p.timeline.enqueueMany([{ inputAt: 1000, lane: 1, key: "KeyA", type: "down" },
      { inputAt: 2000, lane: 2, key: "KeyB", type: "down" }]);
    p.frame(1080);
    expect(settlements(p.session)).toMatchObject([{ grade: "perfect", atMs: 1000, confirmedAt: 1080 }]);
    expect(p.session.snapshot.atMs).toBe(2000);
    expect(() => p.frame(1090)).not.toThrow();
  });

  it("raw1000 두 키와 다른 레인 입력을 한 batch로 전달해 double 두 몫과 single을 9점 정산", () => {
    const p = play([point(1000, 1, "double"), point(1000, 2)]);
    const batch = vi.spyOn(p.session, "processBatch");
    p.timeline.enqueueMany(["A", "B", "C"].map((key, index) =>
      ({ inputAt: 1000, key, lane: index === 2 ? 2 : 1, type: "down" as const })));
    p.frame(1500);
    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch.mock.calls[0][1].map(input => input.key)).toEqual(["A", "B", "C"]);
    expect(p.finish().score.earnedScore).toBe(9);
  });

  it("동일 raw1000 같은 키 down/up/down은 입력 인과를 유지하고 Point를 한 번만 정산", () => {
    const p = play([point(1000)]);
    p.timeline.enqueueMany((["down", "up", "down"] as const).map(type => ({ inputAt: 1000, key: "A", lane: 1, type })));
    p.frame(1000);
    expect(p.session.facts.filter(fact => fact.kind === "input").map(fact => fact.action)).toEqual(["down", "up", "down"]);
    expect(settlements(p.session)).toHaveLength(1);
    expect(p.finish().score.earnedScore).toBe(3);
  });

  it("through999에서는 future 큐를 남기고 through1000 반복 drain도 한 입력·한 정산만 생성", () => {
    const p = play([point(1000)]);
    p.timeline.enqueue({ inputAt: 1000, key: "A", lane: 1, type: "down" });
    expect(drainExplicitPlaySessionInputs(p.timeline, p.session, 999)).toBe(0);
    expect(p.timeline.size).toBe(1);
    expect(drainExplicitPlaySessionInputs(p.timeline, p.session, 1000)).toBe(1);
    expect(drainExplicitPlaySessionInputs(p.timeline, p.session)).toBe(0);
    expect(p.session.facts.filter(fact => fact.kind === "input")).toHaveLength(1);
    expect(p.session.drainEffects()).toHaveLength(1);
    expect(p.session.drainEffects()).toEqual([]);
  });

  it("1121ms Miss 확정 후 raw1000이 늦게 도착해도 정산과 효과를 되돌리지 않음", () => {
    const p = play([point(1000)]);
    p.frame(1121); p.input(1130, 1000); p.frame(1130);
    expect(settlements(p.session)).toMatchObject([{ grade: "miss" }]);
    expect(p.session.effects).toHaveLength(1);
  });

  it("+200ms offset 수동 큐가 raw1200으로 앞서면 raw1050 auto를 먼저 enqueue해 두 Point 모두 Perfect", () => {
    const p = play([point(1200), point(1050, 2)], 200, [{ startMs: 1050, endMs: 1050 }]);
    p.frame(900); p.input(1000, 1000); p.frame(1000);
    expect(settlements(p.session)).toMatchObject([{ grade: "perfect", atMs: 1050 }, { grade: "perfect", atMs: 1200 }]);
    expect(p.finish().score.earnedScore).toBe(6);
  });

  it("−50ms offset에서는 auto1125보다 수동 raw1100 Good을 먼저 받아 합법 입력 기한을 보존", () => {
    const p = play([point(1000), point(1125, 2)], -50, [{ startMs: 1100, endMs: 5000 }]);
    p.frame(1149);
    expect(settlements(p.session)).toEqual([]);
    p.input(1150, 1150); p.frame(1150); p.frame(1200);
    expect(settlements(p.session)).toMatchObject([{ grade: "good", atMs: 1100 }, { grade: "perfect", atMs: 1125 }]);
  });

  it("부분 AutoEvent는 수동 KeyA hold의 up을 만들지 않고 auto L2와 수동 L1을 같은 세션에서 9점", () => {
    const p = play([point(1000), body(1000, 1500), release(1500), point(1200, 2)], 0,
      [{ startMs: 1200, endMs: 1200 }]);
    p.input(1000, 1000); p.frame(1300);
    expect(p.session.snapshot.bodyUnits[0].state).toBe("active");
    p.input(1500, 1500, "KeyA", "up"); p.frame(1700);
    expect(p.finish().score.earnedScore).toBe(9);
  });

  it("raw1000에 수동 L1과 자동 L1·L2가 함께 enqueue되면 원래 키를 한 batch로 처리해 6점", () => {
    const p = play([point(1000), point(1000, 2)], 0, [{ startMs: 1000, endMs: 1000 }]);
    const source = createExplicitPlayInput([{ lane: 1, key: "KeyA" }], p.clock);
    const target = new EventTarget(); source.attach(target);
    const batch = vi.spyOn(p.session, "processBatch");
    p.audio.currentTimeMs = 1000;
    keyboard(target, "keydown", 1000);
    // 자동 L1도 허용된 구간이지만 추가 입력은 물리적으로 합법이며 이미 처리한 Point를 재정산하지 않는다.
    stepExplicitPlaySession(source.timeline, p.session, p.auto, p.clock, 1000);
    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch.mock.calls[0][0]).toBe(1000);
    expect(batch.mock.calls[0][1].map(input => input.key)).toContain("KeyA");
    expect(p.session.result().score.earnedScore).toBe(6);
    source.dispose();
  });

  it.each([[0, 0, 1, 2110], [-50, 15, 1, 2175], [-50, 20, 2, 2250]])(
    "offset %ims·출력 지연 %ims·배속 %i이면 마지막 Good 경계 물리 %ims 포함 후 다음 ms에 종료", (offset, latency, rate, last) => {
      const p = play([point(1990)], offset, [], latency, rate);
      p.frame(last);
      expect(p.canFinish(2000, last)).toBe(false);
      p.input(last, last); p.frame(last);
      expect(settlements(p.session)).toMatchObject([{ grade: "good", atMs: 2110 }]);
      expect(p.canFinish(2000, last + 1)).toBe(true);
      expect(p.finish().score.judgmentCounts.miss).toBe(0);
    });

  it("−50ms offset auto1990은 곡 끝2000에서 기다렸다가 2040ms에 입력하고 반복 finish도 3점 한 번", () => {
    const p = play([point(1990, 2)], -50, [{ startMs: 0, endMs: 5000 }]);
    p.frame(2000);
    expect(settlements(p.session)).toEqual([]);
    p.frame(2040);
    expect(settlements(p.session)).toMatchObject([{ grade: "perfect", atMs: 1990 }]);
    const first = p.finish();
    expect(p.finish()).toEqual(first);
    expect(first.score.earnedScore).toBe(3);
    expect(p.timeline.size).toBe(0);
  });

  it("차트 끝3000ms가 음원2000ms를 넘으면 기한3120ms 뒤에 종료하고 빈 차트·미로딩 길이도 구별", () => {
    const p = play([body(1000, 3000)]);
    expect(p.canFinish(2000, 3120)).toBe(false);
    expect(p.canFinish(2000, 3121)).toBe(true);
    const empty = play([]);
    expect(empty.canFinish(2000, 2000)).toBe(true);
    expect(empty.canFinish(0, 2000)).toBe(false);
  });

  it("1000～1001ms double 바디에 raw1120 한 키만 시작해도 종료1122에서 유지·릴리즈 5항목을 미정산 없이 확정", () => {
    const p = play([point(1000), { type: "body", holdCount: 2, lane: 1, beat: beat(2), endBeat: beat(1001, 500) },
      { type: "sustain", count: 2, lane: 1, beat: beat(2001, 1000) },
      { type: "release", count: 2, lane: 1, beat: beat(1001, 500) }]);
    p.input(1120, 1120); p.frame(1120);
    expect(p.session.latestJudgmentDeadlineMs).toBe(1121);
    expect(p.session.snapshot.bodyUnits.every(unit => unit.maintenanceDeadlineMs === null)).toBe(true);
    expect(p.canFinish(1001, 1121)).toBe(false);
    expect(p.canFinish(1001, 1122)).toBe(true);
    const result = p.finish();
    expect(result.snapshot.atMs).toBe(1122);
    expect(result.score.processedNotes).toBe(5);
    expect(result.score.earnedScore).toBe(4);
    expect(result.score.maxPossibleScore).toBe(15);
    expect(result.snapshot.items.every(item => item.settlementFactId !== null)).toBe(true);
  });
});

function keyboard(target: EventTarget, type: "keydown" | "keyup", at: number, code = "KeyA") {
  const event = new Event(type);
  Object.defineProperties(event, { code: { value: code }, timeStamp: { value: at }, repeat: { value: false } });
  target.dispatchEvent(event);
}

describe("InputSystem→GameClock→명시 입력 큐의 수명", () => {
  it('준비 중 KeyA down/up 뒤 KeyB hold만 남으면 큐0·현재 hold KeyB이며 활성화 후 up만 전달한다', () => {
    const source = createExplicitPlayInput([{ lane: 1, key: 'KeyA' }, { lane: 1, key: 'KeyB' }], { toInputTimeMs: at => at });
    const target = new EventTarget(); source.attach(target); source.setJudging(false);
    keyboard(target, 'keydown', 1000); keyboard(target, 'keyup', 1100); keyboard(target, 'keydown', 1200, 'KeyB');
    expect(source.timeline.size).toBe(0);
    expect(source.heldKeys).toEqual([{ lane: 1, key: 'KeyB' }]);
    source.setJudging(true); keyboard(target, 'keyup', 3000, 'KeyB');
    const batches: unknown[] = [];
    source.timeline.flushThrough(Infinity, (at, inputs) => batches.push({ at, inputs }));
    expect(batches).toEqual([{ at: 3000, inputs: [{ lane: 1, key: 'KeyB', type: 'up' }] }]);
    source.dispose(); expect(source.heldKeys).toEqual([]);
  });

  it('준비 종료 뒤 첫 down 직전 callback은 이전 hold만 보고 해당 down은 새 입력으로 큐에 남긴다', () => {
    const seen: unknown[] = [];
    const source = createExplicitPlayInput([{ lane: 1, key: 'KeyA' }], { toInputTimeMs: at => at }, at => {
      if (at >= 3000) { seen.push(source.heldKeys); source.setJudging(true); }
    });
    const target = new EventTarget(); source.attach(target); source.setJudging(false);
    keyboard(target, 'keydown', 3020);
    expect(seen).toEqual([[]]); expect(source.timeline.size).toBe(1);
    source.dispose();
  });

  it('일시정지 진입은 아직 소비하지 않은 raw 큐를 비우되 hold KeyA는 유지한다', () => {
    const source = createExplicitPlayInput([{ lane: 1, key: 'KeyA' }], { toInputTimeMs: at => at });
    const target = new EventTarget(); source.attach(target); keyboard(target, 'keydown', 1000);
    source.setJudging(false);
    expect(source.timeline.size).toBe(0); expect(source.heldKeys).toEqual([{ lane: 1, key: 'KeyA' }]);
    source.dispose();
  });

  it('3000ms 준비 종료 뒤 늦게 배달된 timestamp2990 down은 새 타격 큐에 넣지 않는다', () => {
    const source = createExplicitPlayInput([{ lane: 1, key: 'KeyA' }], { toInputTimeMs: at => at });
    const target = new EventTarget(); source.attach(target); source.setJudging(true, 3000);
    keyboard(target, 'keydown', 2990);
    expect(source.timeline.size).toBe(0);
    keyboard(target, 'keyup', 3020); keyboard(target, 'keydown', 3030);
    expect(source.timeline.size).toBe(2);
    source.dispose();
  });

  it("timestamp1000 down/up에 입력 offset100을 한 번만 적용하고 원래 KeyA·L1을 전달", () => {
    const p = play([point(1100)], 100);
    p.audio.currentTimeMs = 1000;
    const source = createExplicitPlayInput([{ lane: 1, key: "KeyA" }], p.clock);
    const target = new EventTarget(); source.attach(target);
    keyboard(target, "keydown", 1000); keyboard(target, "keyup", 1000);
    drainExplicitPlaySessionInputs(source.timeline, p.session);
    expect(p.session.facts.filter(fact => fact.kind === "input")).toMatchObject([
      { key: "KeyA", lane: 1, atMs: 1100, action: "down" }, { key: "KeyA", lane: 1, atMs: 1100, action: "up" },
    ]);
    source.dispose();
  });

  it("reset은 old raw queue와 held를 비워 이전 up을 무시하고 다음 같은 키 down을 새 입력으로 받음", () => {
    const p = play([point(1000)]);
    const source = createExplicitPlayInput([{ lane: 1, key: "KeyA" }], p.clock);
    const target = new EventTarget(); source.attach(target);
    keyboard(target, "keydown", 1000);
    expect(source.timeline.size).toBe(1);
    source.reset();
    expect(source.timeline.size).toBe(0);
    expect(source.inputSystem.isLaneHeld(1)).toBe(false);
    keyboard(target, "keyup", 1100);
    expect(source.timeline.size).toBe(0);
    keyboard(target, "keydown", 1200);
    expect(source.timeline.size).toBe(1);
    source.dispose(); source.dispose();
    keyboard(target, "keydown", 1300);
    expect(source.timeline.size).toBe(0);
    expect(() => source.attach(target)).toThrow("dispose");
  });
});

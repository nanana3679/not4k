import { describe, expect, it, vi } from "vitest";
import { beat } from "../../../shared/types/beat";
import type { ChartDocument, ExplicitNoteEntity } from "../../../shared/types/chart";
import { ExplicitAutoPlayer } from "../../input/ExplicitAutoPlayer";
import type { ExplicitAutoInput } from "../../input/ExplicitAutoPlayer";
import { InputTimeline } from "../../input/InputTimeline";
import { compileExplicitJudgmentChart } from "../../judgment/explicitCompiledChart";
import { ExplicitJudgmentSession } from "../../judgment/ExplicitJudgmentSession";
import type { ExplicitSessionResult } from "../../judgment/ExplicitJudgmentSession";
import type { ExplicitJudgmentEffect } from "../../judgment/ExplicitJudgmentState";
import { GameClock } from "../../time/GameClock";
import { drainExplicitPlaySessionInputs, stepExplicitPlaySession } from "../explicitPlaySessionInput";
import { createExplicitTutorialPreviewSessionController } from "./explicitTutorialPreviewSession";

const tap = (at: number, kind: "single" | "double" | "trill" = "single"): ExplicitNoteEntity =>
  ({ type: "tap", kind, lane: 1, beat: beat(at, 500) });
const body = (at: number, end: number, holdCount: 1 | 2 = 1): ExplicitNoteEntity =>
  ({ type: "body", holdCount, lane: 1, beat: beat(at, 500), endBeat: beat(end, 500) });
const release = (at: number, count: 1 | 2 = 1, grace = false): ExplicitNoteEntity =>
  ({ type: "release", count, grace, lane: 1, beat: beat(at, 500) });
const tick = (at: number, count: 1 | 2 = 1): ExplicitNoteEntity =>
  ({ type: "tick", count, lane: 1, beat: beat(at, 500) });
function document(notes: ExplicitNoteEntity[], trill = false): ChartDocument {
  return { meta: { title: "명시 튜토리얼", artist: "test", difficultyLabel: "NORMAL", difficultyLevel: 1,
    imageFile: "", audioFile: "", previewAudioFile: "", offsetMs: 0 }, notes,
  events: [{ type: "bpm", beat: beat(0), bpm: 120 }],
  trillZones: trill ? [{ lane: 1, beat: beat(0), endBeat: beat(6) }] : [] };
}
function manual(chart: ChartDocument, events: readonly ExplicitAutoInput[]) {
  const session = new ExplicitJudgmentSession(compileExplicitJudgmentChart(chart), { maintenanceGraceMs: 20 });
  const timeline = new InputTimeline();
  timeline.enqueueMany(events.map(event => ({ ...event, inputAt: event.timeMs })));
  drainExplicitPlaySessionInputs(timeline, session);
  return session.finalize();
}
function judgments(result: ExplicitSessionResult) {
  return { score: result.score, combo: result.combo,
    settlements: result.facts.filter(fact => fact.kind === "settlement").map(fact => ({ itemId: fact.itemId,
      outcome: fact.outcome, grade: fact.grade, rawDeltaMs: fact.rawDeltaMs, timingDeltaMs: fact.timingDeltaMs })),
    bodies: result.snapshot.bodyUnits.map(unit => ({ ref: unit.ref, state: unit.state })) };
}

describe("명시 튜토리얼과 실제 입력·AutoPlayer의 공통 세션", () => {
  it("aux note가 원본 index0에 있어도 main double 탭의 index1·ordinal0/1을 그대로 표시 상태에 보존", () => {
    const chart = document([{ type: "tap", kind: "single", lane: 5, beat: beat(2) }, tap(1000, "double")]);
    const controller = createExplicitTutorialPreviewSessionController(chart);
    controller.advanceTo(1000);
    expect(controller.session.snapshot.items.map(item => [item.sourceNoteIndex, item.ordinal])).toEqual([[1, 0], [1, 1]]);
    expect(controller.session.result().score.earnedScore).toBe(6);
    controller.dispose();
  });

  const cases: readonly [string, ChartDocument][] = [
    ["싱글 탭·hold1·틱·릴리즈", document([tap(1000), body(1000, 2000), tick(1500), release(2000)])],
    ["더블 탭·hold2·틱2·Grace 릴리즈2", document([tap(1000, "double"), body(1000, 2000, 2), tick(1500, 2), release(2000, 2, true)])],
    ["1→2→1 연결", document([body(1000, 1300), body(1300, 1600, 2), tick(1450, 2), release(1600), body(1600, 2000), release(2000)])],
    ["길이 0과 10ms 바디", document([body(1000, 1000), tick(1000), body(1500, 1510), release(1510)])],
    ["단독 Grace 릴리즈2", document([release(1000, 2, true)])],
    ["트릴 교대·바디", document([tap(1000, "trill"), tap(1100, "trill"), tap(1200, "trill"),
      { type: "body", holdCount: 1, trill: true, lane: 1, beat: beat(2), endBeat: beat(4) }], true)],
    ["더블 hold의 재누름이 릴리즈 창과 겹침", document([body(1000, 2000, 2), tap(1950), release(2000, 2)])],
  ];
  it.each(cases)("%s: 동일 physical events는 manual·auto·tutorial에서 같은 판정·점수·바디 상태", (_name, chart) => {
    const compiled = compileExplicitJudgmentChart(chart);
    const events = new ExplicitAutoPlayer(compiled).eventsThrough(Infinity);
    const expected = manual(chart, events);
    const tutorial = createExplicitTutorialPreviewSessionController(chart, { kind: "events", events }, { maintenanceGraceMs: 20 });
    tutorial.advanceTo(3000);
    expect(judgments(tutorial.session.finalize())).toEqual(judgments(expected));
    const session = new ExplicitJudgmentSession(compiled, { maintenanceGraceMs: 20 });
    const timeline = new InputTimeline();
    const auto = new ExplicitAutoPlayer(compiled);
    const audio = { currentTimeMs: 0, playbackRate: 1, getOutputLatencyMs: () => 0 };
    const clock = new GameClock(audio, { inputOffsetMs: 0, visualOffsetMs: 0 }, () => audio.currentTimeMs);
    for (const at of [0, 777, 1000, 1017, 1701, 3000]) {
      audio.currentTimeMs = at;
      stepExplicitPlaySession(timeline, session, auto, clock, at);
    }
    expect(judgments(session.finalize())).toEqual(judgments(expected));
    expect(expected.score.processedNotes).toBe(compiled.totalJudgments);
    tutorial.dispose();
  });

  it("authored 두 키 중 B를 1300ms에 놓으면 바디 한 몫만 실패하고 manual·tutorial이 18점 중 12점", () => {
    const chart = document([tap(1000, "double"), body(1000, 2000, 2), tick(1500, 2), release(2000, 2)]);
    const timings = [{ lane: 1, key: "A", startMs: 1000, endMs: 2000 }, { lane: 1, key: "B", startMs: 1000, endMs: 1300 }];
    const events: ExplicitAutoInput[] = timings.flatMap(timing => [
      { lane: timing.lane, key: timing.key, timeMs: timing.startMs, type: "down" as const },
      { lane: timing.lane, key: timing.key, timeMs: timing.endMs, type: "up" as const }]);
    const controller = createExplicitTutorialPreviewSessionController(chart, { kind: "timings", timings }, { maintenanceGraceMs: 20 });
    controller.advanceTo(2500);
    const result = controller.session.finalize();
    expect(judgments(result)).toEqual(judgments(manual(chart, events)));
    expect(result.score.earnedScore).toBe(12);
    expect(result.score.maxPossibleScore).toBe(18);
    expect(result.score.judgmentCounts.miss).toBe(1);
    expect(result.facts.filter(fact => fact.kind === "settlement" && fact.outcome === "dependentZero")).toHaveLength(2);
    controller.dispose();
  });

  it("1490ms up→1505ms down 회복은 틱1500을 보류 후 Perfect로 정산하고 총 6점", () => {
    const chart = document([body(1000, 2000), tick(1500), release(2000)]);
    const controller = createExplicitTutorialPreviewSessionController(chart, { kind: "timings", timings: [
      { lane: 1, key: "A", startMs: 1000, endMs: 1490 }, { lane: 1, key: "B", startMs: 1505, endMs: 2000 },
    ] }, { maintenanceGraceMs: 20 });
    controller.advanceTo(1500);
    expect(controller.session.snapshot.items[0].state).toBe("waiting");
    controller.advanceTo(1505);
    expect(controller.session.snapshot.items[0].state).toBe("success");
    expect(controller.repeat(2000).score.earnedScore).toBe(6);
    controller.dispose();
  });

  it("author down1120은 1000ms 탭의 포함 Good이고 다음 반복도 같은 1점·효과 한 번", () => {
    const received: ExplicitJudgmentEffect[][] = [];
    const controller = createExplicitTutorialPreviewSessionController(document([tap(1000)]), { kind: "timings", timings: [
      { lane: 1, key: "A", startMs: 1120, endMs: 1150 },
    ] }, { createPresentation(_session, iteration) {
      received[iteration] = [];
      return { applyConfirmedEffects(effects) { received[iteration].push(...effects); }, dispose() {} };
    } });
    for (let iteration = 0; iteration < 3; iteration++) {
      expect(controller.repeat(1200).score.earnedScore).toBe(1);
      expect(received[iteration]).toHaveLength(1);
      expect(received[iteration][0].grade).toBe("good");
    }
    controller.dispose();
  });
});

describe("명시 튜토리얼의 반복·seek·표시 인스턴스 수명", () => {
  it("repeat 경계2000ms의 마지막 up을 이전 세션에서 처리하고 새 세션·새 표시 인스턴스에는 효과가 없음", () => {
    const chart = document([tap(1000), body(1000, 2000), release(2000)]);
    const presentations: { render: ReturnType<typeof vi.fn>; effects: ExplicitJudgmentEffect[]; dispose: ReturnType<typeof vi.fn> }[] = [];
    const controller = createExplicitTutorialPreviewSessionController(chart, { kind: "auto" }, {
      createPresentation() {
        const value = { render: vi.fn(), effects: [] as ExplicitJudgmentEffect[], dispose: vi.fn() };
        presentations.push(value);
        return { renderer: value, applyConfirmedEffects(effects) { value.effects.push(...effects); }, dispose: value.dispose };
      },
    });
    const firstSession = controller.session;
    const first = controller.repeat(2000);
    expect(first.score.earnedScore).toBe(6);
    expect(first.facts.filter(fact => fact.kind === "input" && fact.action === "up")).toMatchObject([{ atMs: 2000 }]);
    expect(controller.session).not.toBe(firstSession);
    expect(controller.iteration).toBe(1);
    expect(presentations[0].dispose).toHaveBeenCalledTimes(1);
    expect(presentations[0].effects).toHaveLength(2);
    expect(presentations[1].effects).toEqual([]);
    expect(controller.session.facts).toEqual([]);
    controller.advanceTo(500);
    expect(controller.session.result().score.processedNotes).toBe(0);
    const second = controller.repeat(2000);
    expect(judgments(second)).toEqual(judgments(first));
    expect(presentations[1].effects).toHaveLength(2);
    controller.dispose(); controller.dispose();
    expect(presentations[2].dispose).toHaveBeenCalledTimes(1);
  });

  it("1000ms 효과를 drain한 뒤 renderer를 세 번 재부착해도 snapshot만 복구하고 과거 효과를 재생하지 않음", () => {
    const sink = vi.fn();
    const controller = createExplicitTutorialPreviewSessionController(document([tap(1000)]), { kind: "auto" }, {
      createPresentation: () => ({ applyConfirmedEffects: sink, dispose() {} }),
    });
    controller.advanceTo(1000);
    expect(sink).toHaveBeenCalledTimes(1);
    const renderer = { render: vi.fn() };
    controller.attachRenderer(renderer, 900); controller.attachRenderer(null); controller.attachRenderer(renderer, 1000);
    controller.advanceTo(1000);
    expect(renderer.render).toHaveBeenCalledTimes(3);
    expect(sink).toHaveBeenCalledTimes(1);
    expect(controller.session.drainEffects()).toEqual([]);
    controller.dispose();
  });

  it("1600→500ms 역방향 seek는 old held·미래 raw·pending 틱·effect cursor를 버리고 새 세션으로 재생", () => {
    const chart = document([tap(1000), body(1000, 2000), tick(1800), release(2000)]);
    const effectsByIteration: ExplicitJudgmentEffect[][] = [];
    const controller = createExplicitTutorialPreviewSessionController(chart, { kind: "auto" }, {
      createPresentation(_session, iteration) {
        effectsByIteration[iteration] = [];
        return { applyConfirmedEffects(effects) { effectsByIteration[iteration].push(...effects); }, dispose() {} };
      },
    });
    controller.advanceTo(1600);
    const old = controller.session;
    expect(old.snapshot.bodyUnits[0].state).toBe("active");
    controller.advanceTo(500);
    expect(controller.session).not.toBe(old);
    expect(controller.session.facts).toEqual([]);
    expect(controller.session.snapshot.bodyUnits[0].state).toBe("waiting");
    expect(effectsByIteration[1]).toEqual([]);
    // 이전 인스턴스에서 뒤늦게 생긴 효과도 새 adapter가 관측할 수 없다.
    old.processBatch(2000, [{ lane: 1, key: "explicit-auto:KeyW", type: "up" }]);
    controller.advanceTo(2500);
    expect(controller.session.result().score.earnedScore).toBe(9);
    expect(effectsByIteration[0]).toHaveLength(1);
    expect(effectsByIteration[1]).toHaveLength(3);
    expect(new Set(effectsByIteration[1].map(effect => effect.sequence)).size).toBe(3);
    controller.dispose();
  });

  it("1510ms 회복 대기 중 reset하면 이전 1500ms 미정산 틱과 hold 부족이 다음 반복에 유출되지 않음", () => {
    const chart = document([body(1000, 2000), tick(1500)]);
    const controller = createExplicitTutorialPreviewSessionController(chart, { kind: "timings", timings: [
      { lane: 1, key: "A", startMs: 1000, endMs: 1495 }, { lane: 1, key: "B", startMs: 1515, endMs: 2000 },
    ] }, { maintenanceGraceMs: 20 });
    controller.advanceTo(1510);
    expect(controller.session.snapshot.items[0].state).toBe("waiting");
    controller.reset(); controller.advanceTo(1000);
    expect(controller.session.snapshot.items[0].state).toBe("pending");
    expect(controller.session.result().score.judgmentCounts.miss).toBe(0);
    controller.advanceTo(1515);
    expect(controller.session.result().score.earnedScore).toBe(3);
    controller.dispose();
  });

  it("외부 authored event 배열을 수정해도 다음 반복의 입력은 생성 시 복사한 원본을 사용", () => {
    const events: ExplicitAutoInput[] = [{ lane: 1, key: "A", timeMs: 1000, type: "down" },
      { lane: 1, key: "A", timeMs: 1050, type: "up" }];
    const controller = createExplicitTutorialPreviewSessionController(document([tap(1000)]), { kind: "events", events });
    events.length = 0;
    expect(controller.repeat(1200).score.earnedScore).toBe(3);
    expect(controller.repeat(1200).score.earnedScore).toBe(3);
    controller.dispose();
  });

  it("dispose 뒤 advance·reset·attach는 거부하고 이전 표시 인스턴스는 한 번만 dispose", () => {
    const dispose = vi.fn();
    const controller = createExplicitTutorialPreviewSessionController(document([tap(1000)]), { kind: "auto" }, {
      createPresentation: () => ({ applyConfirmedEffects() {}, dispose }),
    });
    controller.dispose(); controller.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(() => controller.advanceTo(1000)).toThrow("dispose");
    expect(() => controller.reset()).toThrow("dispose");
    expect(() => controller.attachRenderer(null)).toThrow("dispose");
  });

  it("authored end900<start1000 또는 NaN 시각이면 명시 입력 재생 전에 거부", () => {
    const chart = document([tap(1000)]);
    expect(() => createExplicitTutorialPreviewSessionController(chart, { kind: "timings", timings: [
      { lane: 1, key: "A", startMs: 1000, endMs: 900 },
    ] })).toThrow("끝");
    expect(() => createExplicitTutorialPreviewSessionController(chart, { kind: "events", events: [
      { lane: 1, key: "A", timeMs: NaN, type: "down" },
    ] })).toThrow("유한");
  });
});


describe("명시 튜토리얼 직접 입력", () => {
  it("live 계획에서 1000ms 탭은 자동 입력 없이 기다리고 KeyQ down을 넣으면 Perfect 1", () => {
    const controller = createExplicitTutorialPreviewSessionController(document([tap(1000)]), { kind: "live" });
    controller.advanceTo(1000);
    expect(controller.session.score.processedNotes).toBe(0);
    controller.enqueue({ lane: 1, key: "KeyQ", type: "down", inputAt: 1000 });
    controller.advanceTo(1000);
    expect(controller.session.score.judgmentCounts.perfect).toBe(1);
    controller.dispose();
  });
});


it("시연 KeyQ를 1000ms에 유지하다 live로 바꾸면 합성 up 점수 없이 놓고 2000ms 탭도 자동 처리하지 않음", () => {
  const controller = createExplicitTutorialPreviewSessionController(document([tap(1000), body(1000, 1500), release(1500), tap(2000)]), {
    kind: "timings", timings: [{ lane: 1, key: "KeyQ", startMs: 1000, endMs: 1500 },
      { lane: 1, key: "KeyQ", startMs: 2000, endMs: 2100 }],
  });
  controller.advanceTo(1000);
  controller.setInputPlan({ kind: "live" });
  controller.advanceTo(2200);
  expect(controller.session.score.judgmentCounts).toMatchObject({ perfect: 1, miss: 2 });
  expect(controller.session.snapshot.bodyUnits[0].state).toBe("failed");
  expect(controller.session.facts.filter(fact => fact.kind === "input" && fact.action === "up")).toEqual([]);
  controller.dispose();
});


it("KeyQ를 누른 채 2000ms 경계를 넘으면 새 바디·틱은 preheld로 Perfect 1이고 새 탭 down은 만들지 않음", () => {
  const controller = createExplicitTutorialPreviewSessionController(document([body(0, 1000), tick(500), tap(250)]), { kind: "live" });
  controller.enqueue({ lane: 1, key: "KeyQ", type: "down", inputAt: 1900 });
  controller.repeat(2000, [{ lane: 1, key: "KeyQ" }]);
  controller.advanceTo(700);
  expect(controller.session.score.judgmentCounts).toMatchObject({ perfect: 1, miss: 1 });
  expect(controller.session.snapshot.bodyUnits[0].state).toBe("active");
  expect(controller.session.facts.filter(fact => fact.kind === "input")).toEqual([]);
  controller.dispose();
});

it("live의 새 패턴 0ms에서 timings로 바꾸면 0ms 탭도 시연 입력으로 Perfect 1", () => {
  const controller = createExplicitTutorialPreviewSessionController(document([tap(0)]), { kind: "live" });
  controller.advanceTo(0);
  controller.setInputPlan({ kind: "timings", timings: [{ lane: 1, key: "KeyQ", startMs: 0, endMs: 50 }] });
  controller.advanceTo(50);
  expect(controller.session.score.judgmentCounts.perfect).toBe(1);
  controller.dispose();
});

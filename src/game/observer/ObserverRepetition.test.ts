import { describe, expect, it } from "vitest";
import type { ExplicitNoteEntity } from "../../shared/types/chart";
import type { ExplicitAutoInput } from "../input/ExplicitAutoPlayer";
import type { KeyBinding } from "../input/InputSystem";
import { InputTimeline } from "../input/InputTimeline";
import { compileExplicitJudgmentChart } from "../judgment/explicitCompiledChart";
import { explicitFixtureBody as b, explicitFixtureTap as p, explicitFixtureRelease as r,
  explicitFixtureTick as s, makeExplicitReplayFixture } from "../judgment/explicitJudgmentTestHarness";
import type { ExplicitConfirmedFact, ExplicitHeldKey, ExplicitJudgmentInput } from "../judgment/ExplicitJudgmentState";
import type { ExplicitAutoInputSource } from "../screens/explicitPlaySessionInput";
import { canFinishExplicitPlaySession, createExplicitPlayInput, stepExplicitPlaySession } from "../screens/explicitPlaySessionInput";
import { GameClock } from "../time/GameClock";
import type { ObserverRange } from "./observerRepetitionPlan";
import { ObserverRepetition } from "./ObserverRepetition";

const windows = { PERFECT: 41, GREAT: 82, GOOD: 120, BAD: 160 };
const W: KeyBinding = { key: "KeyW", lane: 1 };
const AUTO_W = "explicit-auto:KeyW";
const down = (key = "KeyW", lane = 1): ExplicitJudgmentInput => ({ key, lane, type: "down" });
const up = (key = "KeyW", lane = 1): ExplicitJudgmentInput => ({ key, lane, type: "up" });
const compile = (notes: ExplicitNoteEntity[]) => compileExplicitJudgmentChart(makeExplicitReplayFixture("ENJ-observer-repetition",
  "옵저버 반복 1회", notes, [], { scoreItemCount: 0, theoreticalWeight: 0, earnedScore: 0, scope: "whole" }).chart);
const startRepetition = (notes: ExplicitNoteEntity[], range: ObserverRange,
  { auto, humanHeldKeys = [], audioDurationMs = 10000 }: { auto: boolean; humanHeldKeys?: readonly ExplicitHeldKey[]; audioDurationMs?: number }) =>
  new ObserverRepetition(compile(notes), { range, audioDurationMs, playbackRate: 1, auto, humanHeldKeys, windows, maintenanceGraceMs: 20 });

/** 미전달 입력이 없는 사례도 실제 입력 포트와 시계로 전환한다. */
function toggleAuto(repetition: ObserverRepetition, enabled: boolean, atMs: number, heldKeys: readonly KeyBinding[]): void {
  const audio = { currentTimeMs: atMs, playbackRate: 1, getOutputLatencyMs: () => 0 };
  const clock = new GameClock(audio, { inputOffsetMs: 0, visualOffsetMs: 0 }, () => atMs);
  const input = createExplicitPlayInput([], clock);
  repetition.setAuto(enabled, { ...input, heldKeys }, clock, atMs);
}

function keyboard(target: EventTarget, type: "keydown" | "keyup", atMs: number): void {
  const event = new Event(type);
  Object.defineProperties(event, { code: { value: "KeyW" }, timeStamp: { value: atMs }, repeat: { value: false } });
  target.dispatchEvent(event);
}

type HumanBatch = readonly [atMs: number, inputs: readonly ExplicitJudgmentInput[]];
/**
 * 런타임 한 프레임처럼 Auto 입력과 사람 입력을 시각 순서로 판정에 넣고 advance한 뒤, 확정 효과를 수동 집계로 보낸다.
 * 런타임은 사람 입력을 판정하지 않는 동안 입력 큐에 넣지 않으므로, 그때 사람 입력을 넘기면 테스트 작성 오류다.
 */
function playTo(repetition: ObserverRepetition, atMs: number, humanBatches: readonly HumanBatch[] = []): readonly ExplicitAutoInput[] {
  if (humanBatches.length && !repetition.judgesHumanInput) throw new Error("사람 입력을 판정하지 않는 중입니다");
  const autoEvents = repetition.autoInputSource.eventsThrough(atMs);
  const inputsByTime = new Map<number, ExplicitJudgmentInput[]>();
  const add = (at: number, input: ExplicitJudgmentInput) => inputsByTime.set(at, [...inputsByTime.get(at) ?? [], input]);
  for (const event of autoEvents) add(event.timeMs, { key: event.key, lane: event.lane, type: event.type });
  for (const [at, inputs] of humanBatches) for (const input of inputs) add(at, input);
  for (const [at, inputs] of [...inputsByTime].sort(([a], [c]) => a - c)) repetition.session.processBatch(at, inputs);
  repetition.session.advance(Math.max(atMs, repetition.session.snapshot.atMs));
  repetition.applyConfirmedEffects(repetition.session.drainEffects());
  return autoEvents;
}
type Settlement = Extract<ExplicitConfirmedFact, { kind: "settlement" }>;
const settlements = (repetition: ObserverRepetition) => repetition.session.facts
  .filter((fact): fact is Settlement => fact.kind === "settlement");
const inputFacts = (repetition: ObserverRepetition) => repetition.session.facts.flatMap(fact => fact.kind === "input"
  ? [[fact.action, fact.atMs, fact.key, fact.consumedItemId] as const] : []);
const eventSummary = (events: readonly ExplicitAutoInput[]) => events.map(event => [event.timeMs, event.type, event.key] as const);

describe("옵저버 반복 1회", () => {
  it("입력 오프셋 +100ms로 곡 1000ms에서 core 1100ms가 된 뒤 Auto를 켜도 곡 1016ms 프레임을 계속 처리", () => {
    const repetition = startRepetition([p(1100), p(1500)], { startMs: 1000, endMs: 2000 }, { auto: false });
    const audio = { currentTimeMs: 1000, playbackRate: 1, getOutputLatencyMs: () => 0 };
    const clock = new GameClock(audio, { inputOffsetMs: 100, visualOffsetMs: 0 }, () => audio.currentTimeMs);
    const input = createExplicitPlayInput([W], clock);
    const { timeline } = input;
    timeline.enqueue({ ...down(), inputAt: clock.toInputTimeMs(1000) });
    stepExplicitPlaySession(timeline, repetition.session, repetition.autoInputSource, clock, 1000);
    expect(repetition.session.snapshot.atMs).toBe(1100);
    repetition.setAuto(true, input, clock, 1000);
    audio.currentTimeMs = 1016;
    stepExplicitPlaySession(timeline, repetition.session, repetition.autoInputSource, clock, 1016);
    expect(repetition.session.snapshot.atMs).toBe(1100);
    expect(settlements(repetition)).toMatchObject([{ itemId: "n0:tap:0", grade: "perfect" }]);
    expect(repetition.session.reconstructAt(1016).session.snapshot.atMs).toBe(1100);
  });

  it("구간 1000～3000ms·음원 10000ms·1배속이면 음원 재생 0～6000ms와 판정 세션 시작 0ms, 구간 밖 탭 500ms는 판정하지 않음", () => {
    const repetition = startRepetition([p(500), p(1000), p(3000)], { startMs: 1000, endMs: 3000 }, { auto: true });
    expect(repetition.fadedSpan).toEqual({ fromMs: 0, fadeInUntilMs: 1000, fadeOutFromMs: 3000, toMs: 6000 });
    expect(repetition.session.snapshot.atMs).toBe(0);
    expect(repetition.session.playbackChart.scoreItems.map(item => item.timeMs)).toEqual([1000, 3000]);
    // Auto 입력 원천은 런타임의 stepExplicitPlaySession에 그대로 넘긴다.
    const source: ExplicitAutoInputSource = repetition.autoInputSource;
    expect(eventSummary(source.eventsThrough(1000))).toEqual([[1000, "down", AUTO_W]]);
  });

  it("Auto로 시작한 반복은 Auto 입력만으로 탭 1000·1000(레인 2)·1500·2000ms, 틱 2500ms, 릴리즈 3000ms를 모두 Perfect 18/18점으로 처리하고 내내 수동 집계 null", () => {
    const notes = [p(1000), p(1000, "single", 2), p(1500), p(2000), b(2000, 3000), s(2500), r(3000)];
    const repetition = startRepetition(notes, { startMs: 1000, endMs: 3000 }, { auto: true });
    expect([repetition.autoEnabled, repetition.judgesHumanInput, repetition.manualStats]).toEqual([true, false, null]);
    for (const atMs of [900, 1200, 2600, 6000]) {
      playTo(repetition, atMs);
      expect(repetition.manualStats).toBeNull();
    }
    expect(settlements(repetition).map(fact => [fact.itemId, fact.grade])).toEqual([
      ["n1:tap:0", "perfect"], ["n0:tap:0", "perfect"], ["n2:tap:0", "perfect"], ["n3:tap:0", "perfect"],
      ["n5:tick:0", "perfect"], ["n6:release:0", "perfect"],
    ]);
    expect(repetition.session.score).toMatchObject({ earnedScore: 18, processedNotes: 6, judgmentCounts: { miss: 0 } });
  });

  it("수동으로 시작한 반복은 Auto 입력을 내지 않고 사람 입력만 판정하며, 수동 집계가 매 단계 세션 combo·달성률과 같고 끝에 콤보 3·16/21점", () => {
    // 탭 1000ms 두 레인 Perfect → 탭 1500ms를 1560ms에 Great → 레인 2 탭 2000ms Miss → 바디 2500～3500ms 틱 Perfect·릴리즈 3560ms Great.
    const notes = [p(1000), p(1000, "single", 2), p(1500), p(2000, "single", 2), p(2500), b(2500, 3500), s(3000), r(3500)];
    const repetition = startRepetition(notes, { startMs: 1000, endMs: 3500 }, { auto: false });
    expect([repetition.autoEnabled, repetition.judgesHumanInput]).toEqual([false, true]);
    const expectParity = () => {
      const score = repetition.session.score;
      expect(repetition.manualStats).toEqual({ combo: repetition.session.combo,
        achievementRate: score.finalDenominatorWeight > 0 ? score.achievementRate : null });
    };
    expect(playTo(repetition, 1000, [[1000, [down("KeyW", 1), down("KeyE", 2)]]])).toEqual([]);
    expectParity();
    expect(playTo(repetition, 1600, [[1050, [up("KeyW", 1), up("KeyE", 2)]], [1560, [down()]], [1600, [up()]]])).toEqual([]);
    expectParity();
    expect(playTo(repetition, 2200)).toEqual([]);
    expectParity();
    expect(playTo(repetition, 3600, [[2500, [down()]], [3560, [up()]]])).toEqual([]);
    expectParity();
    playTo(repetition, 6500);
    expectParity();
    expect(settlements(repetition).map(fact => [fact.itemId, fact.grade])).toEqual([
      ["n1:tap:0", "perfect"], ["n0:tap:0", "perfect"], ["n2:tap:0", "great"], ["n3:tap:0", "miss"],
      ["n4:tap:0", "perfect"], ["n6:tick:0", "perfect"], ["n7:release:0", "great"],
    ]);
    expect(repetition.manualStats).toEqual({ combo: 3, achievementRate: (16 / 21) * 100 });
  });

  // 탭 500ms가 구간 800ms에서 잘려 헤드 없는 바디 800～2500ms만 남는다.
  const headCut = [p(500), b(500, 2500), s(1000), s(2000), r(2500)];

  it("수동으로 시작하는 반복은 준비 시작 0ms에 쥔 KeyW를 preheld로 넘겨 구간 시작 800ms에서 잘린 바디를 시작하고 틱 1000·2000ms·릴리즈 2500ms로 콤보 3·100%", () => {
    const repetition = startRepetition(headCut, { startMs: 800, endMs: 3000 }, { auto: false, humanHeldKeys: [W] });
    playTo(repetition, 2600, [[2500, [up()]]]);
    expect(repetition.session.facts.filter(fact => fact.kind === "bodyStarted"))
      .toMatchObject([{ via: "preheld", actualStartMs: 800 }]);
    expect(repetition.manualStats).toEqual({ combo: 3, achievementRate: 100 });
  });

  it("Auto로 시작하는 반복은 사람이 쥔 KeyW를 preheld로 넘기지 않고 800ms Auto down으로 잘린 바디를 시작", () => {
    const repetition = startRepetition(headCut, { startMs: 800, endMs: 3000 }, { auto: true, humanHeldKeys: [W] });
    playTo(repetition, 2600);
    expect(repetition.session.facts.filter(fact => fact.kind === "bodyStarted"))
      .toMatchObject([{ via: "down", actualStartMs: 800 }]);
    expect(inputFacts(repetition)[0]).toEqual(["down", 800, AUTO_W, null]);
  });

  // 탭 1000ms가 시작하는 바디 1000～3000ms, 틱 1500·2000·2500ms, 릴리즈 3000ms.
  const longBody = [p(1000), b(1000, 3000), s(1500), s(2000), s(2500), r(3000)];

  it("1000ms 시작 탭을 900ms에 친 바디를 910ms에 Auto로 넘기면 930ms에도 유지하고 중복 down 없이 3000ms에 릴리즈", () => {
    const repetition = startRepetition(longBody, { startMs: 1000, endMs: 3000 }, { auto: false });
    playTo(repetition, 900, [[900, [down()]]]);
    toggleAuto(repetition, true, 910, [W]);
    playTo(repetition, 930);
    expect(repetition.session.snapshot.bodyUnits[0].state).toBe("active");
    expect(eventSummary(playTo(repetition, 3100))).toEqual([[3000, "up", AUTO_W]]);
    expect(repetition.session.facts.some(fact => fact.kind === "bodyFailed")).toBe(false);
    expect(settlements(repetition).at(-1)).toMatchObject({ itemKind: "release", grade: "perfect", atMs: 3000 });
  });

  it("1000ms 시작 탭을 친 같은 900ms에 Auto로 넘기면 바디가 즉시 active이고 3000ms에 Perfect 릴리즈", () => {
    const repetition = startRepetition(longBody, { startMs: 1000, endMs: 3000 }, { auto: false });
    playTo(repetition, 900, [[900, [down()]]]);
    toggleAuto(repetition, true, 900, [W]);
    expect(repetition.session.snapshot.bodyUnits[0].state).toBe("active");
    expect(eventSummary(playTo(repetition, 3100))).toEqual([[3000, "up", AUTO_W]]);
    expect(settlements(repetition).at(-1)).toMatchObject({ itemKind: "release", grade: "perfect", atMs: 3000 });
  });

  it.each([[970, 980], [1000, 1000]])("1000ms 탭을 %ims에 수동 판정하고 %ims에 Auto를 켜면 다음 탭은 1080ms Perfect", (hitAtMs, toggleAtMs) => {
    const repetition = startRepetition([p(1000), p(1080)], { startMs: 1000, endMs: 2000 }, { auto: false });
    playTo(repetition, hitAtMs, [[hitAtMs, [down()]]]);
    toggleAuto(repetition, true, toggleAtMs, [W]);
    expect(eventSummary(playTo(repetition, 1200))).toEqual([[1080, "down", AUTO_W], [1130, "up", AUTO_W]]);
    expect(settlements(repetition)).toMatchObject([
      { itemId: "n0:tap:0", grade: "perfect", atMs: hitAtMs },
      { itemId: "n1:tap:0", grade: "perfect", atMs: 1080 },
    ]);
  });

  it("900ms에 시작하고 930ms에 실패한 바디를 980ms에 Auto로 넘겨도 1000ms 유지 down을 재생하지 않고 다음 탭은 1080ms Perfect", () => {
    const repetition = startRepetition([p(1000), b(1000, 3000), p(1080), r(3000)],
      { startMs: 1000, endMs: 3000 }, { auto: false });
    playTo(repetition, 950, [[900, [down()]], [910, [up()]]]);
    expect(repetition.session.snapshot.bodyUnits[0]).toMatchObject({ state: "failed", failedAtMs: 930 });
    toggleAuto(repetition, true, 980, []);
    playTo(repetition, 3200);
    expect(settlements(repetition).find(fact => fact.itemId === "n2:tap:0"))
      .toMatchObject({ grade: "perfect", atMs: 1080 });
    expect(repetition.session.snapshot.bodyUnits[0].state).toBe("failed");
  });

  it("Auto 탭 1800ms 효과를 drain 전에 같은 1800ms에 수동으로 전환하면 콤보 0·0%를 유지하고 이후 사람 탭만 집계", () => {
    const repetition = startRepetition([p(1800), p(1900)], { startMs: 1000, endMs: 2000 }, { auto: true });
    for (const event of repetition.autoInputSource.eventsThrough(1800)) repetition.session.processBatch(event.timeMs, [event]);
    toggleAuto(repetition, false, 1800, []);
    repetition.applyConfirmedEffects(repetition.session.drainEffects());
    expect(repetition.manualStats).toEqual({ combo: 0, achievementRate: 0 });
    playTo(repetition, 1900, [[1900, [down()]]]);
    expect(repetition.manualStats).toEqual({ combo: 1, achievementRate: 100 });
  });

  it("Auto→수동 전환의 advance가 1800ms 틱을 확정해도 늦게 drain한 수동 집계는 콤보 0·0%", () => {
    const repetition = startRepetition([p(1000), b(1000, 3000), s(1800), r(3000)],
      { startMs: 1000, endMs: 3000 }, { auto: true });
    playTo(repetition, 1700);
    toggleAuto(repetition, false, 1800, [W]);
    expect(settlements(repetition).at(-1)).toMatchObject({ itemKind: "tick", confirmedAt: 1800 });
    repetition.applyConfirmedEffects(repetition.session.drainEffects());
    expect(repetition.manualStats).toEqual({ combo: 0, achievementRate: 0 });
  });

  it("Auto를 990ms 프레임 뒤 1010ms에 끄면 미전달 1000ms 탭을 Perfect로 처리하고 수동 집계는 0", () => {
    const repetition = startRepetition([p(1000)], { startMs: 1000, endMs: 2000 }, { auto: true });
    playTo(repetition, 990);
    toggleAuto(repetition, false, 1010, []);
    playTo(repetition, 1121);
    expect(settlements(repetition)).toMatchObject([{ grade: "perfect", atMs: 1000 }]);
    expect(repetition.manualStats).toEqual({ combo: 0, achievementRate: 0 });
  });

  it("수동 큐에 1000ms down이 남은 채 1010ms에 Auto를 켜면 큐를 비우기 전에 탭을 Perfect로 판정", () => {
    const repetition = startRepetition([p(1000)], { startMs: 1000, endMs: 2000 }, { auto: false });
    const audio = { currentTimeMs: 1010, playbackRate: 1, getOutputLatencyMs: () => 0 };
    const clock = new GameClock(audio, { inputOffsetMs: 0, visualOffsetMs: 0 }, () => audio.currentTimeMs);
    const input = createExplicitPlayInput([], clock);
    playTo(repetition, 990);
    input.timeline.enqueue({ ...down(), inputAt: 1000 });
    repetition.setAuto(true, input, clock, 1010);
    playTo(repetition, 1121);
    expect(settlements(repetition)).toMatchObject([{ grade: "perfect", atMs: 1000 }]);
    expect(input.timeline.size).toBe(0);
  });

  it("1000ms에 Auto를 켜면 같은 시각의 대기 중 사람 down 대신 Auto가 탭을 판정하고 이후 1080ms 사람 입력은 큐에 넣지 않음", () => {
    const repetition = startRepetition([p(1000), p(1080)], { startMs: 1000, endMs: 2000 }, { auto: false });
    const audio = { currentTimeMs: 1000, playbackRate: 1, getOutputLatencyMs: () => 0 };
    const clock = new GameClock(audio, { inputOffsetMs: 0, visualOffsetMs: 0 }, () => audio.currentTimeMs);
    const input = createExplicitPlayInput([W], clock);
    const target = new EventTarget(); input.attach(target);
    keyboard(target, "keydown", 1000);
    repetition.setAuto(true, input, clock, 1000);
    expect(input.timeline.size).toBe(0);
    expect(settlements(repetition)).toEqual([]);
    stepExplicitPlaySession(input.timeline, repetition.session, repetition.autoInputSource, clock, 1000);
    audio.currentTimeMs = 1080;
    keyboard(target, "keyup", 1080); keyboard(target, "keydown", 1080);
    expect(input.heldKeys).toEqual([W]);
    expect(input.timeline.size).toBe(0);
    stepExplicitPlaySession(input.timeline, repetition.session, repetition.autoInputSource, clock, 1080);
    expect(inputFacts(repetition).every(fact => fact[2] === AUTO_W)).toBe(true);
    expect(settlements(repetition)).toMatchObject([{ grade: "perfect", atMs: 1000 }, { grade: "perfect", atMs: 1080 }]);
    input.dispose();
  });

  it("Auto를 990ms 프레임 뒤 1000ms에 끄면 경계의 Auto down을 보내지 않고 같은 1000ms 사람 down만 집계", () => {
    const repetition = startRepetition([p(1000)], { startMs: 1000, endMs: 2000 }, { auto: true });
    const audio = { currentTimeMs: 990, playbackRate: 1, getOutputLatencyMs: () => 0 };
    const clock = new GameClock(audio, { inputOffsetMs: 0, visualOffsetMs: 0 }, () => audio.currentTimeMs);
    const input = createExplicitPlayInput([W], clock);
    input.setJudging(false);
    const target = new EventTarget(); input.attach(target);
    stepExplicitPlaySession(input.timeline, repetition.session, repetition.autoInputSource, clock, 990);
    audio.currentTimeMs = 1000;
    repetition.setAuto(false, input, clock, 1000);
    keyboard(target, "keydown", 1000);
    stepExplicitPlaySession(input.timeline, repetition.session, repetition.autoInputSource, clock, 1000);
    repetition.applyConfirmedEffects(repetition.session.drainEffects());
    expect(inputFacts(repetition)).toEqual([["down", 1000, "KeyW", "n0:tap:0"]]);
    expect(repetition.manualStats).toEqual({ combo: 1, achievementRate: 100 });
    input.dispose();
  });

  it("입력 오프셋 -100ms에서 곡 1000ms에 Auto를 끈 뒤 곡 1050ms의 raw 950ms 탭은 수동 콤보 1·100%", () => {
    const repetition = startRepetition([p(950)], { startMs: 900, endMs: 2000 }, { auto: true });
    const audio = { currentTimeMs: 1000, playbackRate: 1, getOutputLatencyMs: () => 0 };
    const clock = new GameClock(audio, { inputOffsetMs: -100, visualOffsetMs: 0 }, () => audio.currentTimeMs);
    const input = createExplicitPlayInput([W], clock);
    repetition.setAuto(false, input, clock, 1000);
    audio.currentTimeMs = 1050;
    input.timeline.enqueue({ ...down(), inputAt: clock.toInputTimeMs(1050) });
    stepExplicitPlaySession(input.timeline, repetition.session, repetition.autoInputSource, clock, 1050);
    repetition.applyConfirmedEffects(repetition.session.drainEffects());
    expect(settlements(repetition)).toMatchObject([{ grade: "perfect", confirmedAt: 950 }]);
    expect(repetition.manualStats).toEqual({ combo: 1, achievementRate: 100 });
  });

  it("판정을 1700ms까지 진행한 Auto 반복을 바디 중 1800ms에 KeyW를 쥔 채 수동으로 바꾸면 같은 세션을 1800ms까지 진행해 바디가 이어지고, 전환 중 확정한 Auto 틱 1750ms를 늦게 drain해도 빼서 틱 2000·2500ms와 사람 릴리즈 3060ms Great만 세어 콤보 3·8/9점", () => {
    const repetition = startRepetition([...longBody, s(1750)], { startMs: 1000, endMs: 3000 }, { auto: true });
    const session = repetition.session;
    playTo(repetition, 1700);
    expect(session.combo).toBe(2);
    toggleAuto(repetition, false, 1800, [W]);
    expect(repetition.session).toBe(session);
    expect(session.snapshot.atMs).toBe(1800);
    expect([repetition.autoEnabled, repetition.judgesHumanInput]).toEqual([false, true]);
    expect(repetition.manualStats).toEqual({ combo: 0, achievementRate: 0 });
    // 1750ms 틱 효과는 아직 drain하지 않았다. 런타임처럼 다음 프레임에 함께 받는다.
    expect(playTo(repetition, 2600)).toEqual([]);
    expect(repetition.manualStats).toEqual({ combo: 2, achievementRate: 100 });
    playTo(repetition, 3200, [[3060, [up()]]]);
    expect(session.facts.some(fact => fact.kind === "bodyFailed")).toBe(false);
    expect(inputFacts(repetition).at(-1)).toEqual(["up", 3060, "KeyW", "n5:release:0"]);
    expect(settlements(repetition).map(fact => [fact.itemId, fact.grade, fact.confirmedAt])).toEqual([
      ["n0:tap:0", "perfect", 1000], ["n2:tick:0", "perfect", 1500], ["n6:tick:0", "perfect", 1750],
      ["n3:tick:0", "perfect", 2000], ["n4:tick:0", "perfect", 2500], ["n5:release:0", "great", 3060],
    ]);
    expect(session.combo).toBe(6);
    expect(repetition.manualStats).toEqual({ combo: 3, achievementRate: (8 / 9) * 100 });
  });

  it("Auto→수동을 바디 중 1800ms에 쥔 키 없이 하면 추가 시작 창 없이 유지 유예 20ms 뒤 1820ms에 유지 실패하고, 수동 탭 1810ms Perfect 뒤 그 무점수 Miss가 콤보를 0으로 끊으며 종속 0점 9점과 함께 3/12점", () => {
    const repetition = startRepetition([...longBody, p(1810, "single", 2)], { startMs: 1000, endMs: 3000 }, { auto: true });
    playTo(repetition, 1800);
    toggleAuto(repetition, false, 1800, []);
    playTo(repetition, 1819, [[1810, [down("KeyE", 2)]]]);
    expect(repetition.session.snapshot.bodyUnits[0]).toMatchObject({ state: "recovering", maintenanceDeadlineMs: 1820 });
    expect(repetition.manualStats).toEqual({ combo: 1, achievementRate: 100 });
    playTo(repetition, 1900);
    expect(repetition.session.facts.filter(fact => fact.kind === "bodyFailed"))
      .toMatchObject([{ reason: "maintenance", atMs: 1820, unscoredMiss: true }]);
    expect(settlements(repetition).filter(fact => fact.outcome === "dependentZero").map(fact => [fact.itemId, fact.atMs])).toEqual([
      ["n3:tick:0", 1820], ["n4:tick:0", 1820], ["n5:release:0", 1820],
    ]);
    expect(repetition.manualStats).toEqual({ combo: 0, achievementRate: 25 });
  });

  it("수동→Auto를 사람이 쥔 바디 중 1800ms에 하면 사람 입력 판정을 멈추고 Auto 키로 바로 이어받아 유지 실패 없이 틱 2000·2500ms와 Auto 릴리즈 3000ms Perfect로 끝내며 수동 집계 null", () => {
    const repetition = startRepetition(longBody, { startMs: 1000, endMs: 3000 }, { auto: false });
    playTo(repetition, 1800, [[1000, [down()]]]);
    expect(repetition.manualStats).toEqual({ combo: 2, achievementRate: 100 });
    toggleAuto(repetition, true, 1800, [W]);
    // 사람이 2200ms에 KeyW를 떼도 런타임은 판정에 넣지 않는다. Auto의 1000ms down은 건너뛰고 3000ms up만 남는다.
    expect([repetition.autoEnabled, repetition.judgesHumanInput, repetition.manualStats]).toEqual([true, false, null]);
    expect(eventSummary(playTo(repetition, 3200))).toEqual([[3000, "up", AUTO_W]]);
    expect(repetition.session.facts.some(fact => fact.kind === "bodyFailed")).toBe(false);
    expect(repetition.session.snapshot.bodyUnits[0]).toMatchObject({ state: "complete", completedAtMs: 3000 });
    expect(inputFacts(repetition).at(-1)).toEqual(["up", 3000, AUTO_W, "n5:release:0"]);
    expect(settlements(repetition).map(fact => [fact.itemId, fact.grade])).toEqual([
      ["n0:tap:0", "perfect"], ["n2:tick:0", "perfect"], ["n3:tick:0", "perfect"], ["n4:tick:0", "perfect"], ["n5:release:0", "perfect"],
    ]);
    expect(repetition.manualStats).toBeNull();
  });

  it("수동→Auto를 1800ms에 하면 사람이 놓친 1770ms 탭은 Auto가 대신 치지 않고 1890ms Miss로 확정되지만 수동 집계에 넣지 않으며, 2100ms에 수동으로 돌아오면 0부터", () => {
    const repetition = startRepetition([p(1000), p(1770), p(2000)], { startMs: 1000, endMs: 2000 }, { auto: false });
    playTo(repetition, 1800, [[1000, [down()]], [1050, [up()]]]);
    expect(repetition.manualStats).toEqual({ combo: 1, achievementRate: 100 });
    toggleAuto(repetition, true, 1800, []);
    playTo(repetition, 2100);
    expect(settlements(repetition).map(fact => [fact.itemId, fact.grade, fact.confirmedAt])).toEqual([
      ["n0:tap:0", "perfect", 1000], ["n1:tap:0", "miss", 1890], ["n2:tap:0", "perfect", 2000],
    ]);
    expect(repetition.manualStats).toBeNull();
    toggleAuto(repetition, false, 2100, []);
    expect(repetition.manualStats).toEqual({ combo: 0, achievementRate: 0 });
  });

  it("수동→Auto를 2000ms 탭과 같은 2000ms에 하면 그 시각 Auto down을 전환 뒤에 전달해 오차 0ms Perfect", () => {
    const repetition = startRepetition([p(1000), p(2000)], { startMs: 1000, endMs: 2000 }, { auto: false });
    playTo(repetition, 2000, [[1000, [down()]], [1050, [up()]]]);
    toggleAuto(repetition, true, 2000, []);
    expect(eventSummary(playTo(repetition, 2100))).toEqual([[2000, "down", AUTO_W], [2050, "up", AUTO_W]]);
    expect(settlements(repetition).at(-1)).toMatchObject({ itemId: "n1:tap:0", grade: "perfect", rawDeltaMs: 0 });
    expect(inputFacts(repetition).at(-2)).toEqual(["down", 2000, AUTO_W, "n1:tap:0"]);
  });

  it("이미 수동인 반복에 1500ms setAuto(false)를 다시 하면 아무것도 바꾸지 않아 콤보 1과 판정 시각 1200ms를 유지", () => {
    const repetition = startRepetition([p(1000), p(2000)], { startMs: 1000, endMs: 2000 }, { auto: false });
    playTo(repetition, 1200, [[1000, [down()]]]);
    toggleAuto(repetition, false, 1500, []);
    expect(repetition.manualStats).toEqual({ combo: 1, achievementRate: 100 });
    expect(repetition.session.snapshot.atMs).toBe(1200);
  });

  it("이미 Auto인 반복에 1500ms setAuto(true)를 다시 해도 판정 시각 1200ms와 다음 Auto 입력 2000ms를 유지", () => {
    const repetition = startRepetition([p(1000), p(2000)], { startMs: 1000, endMs: 2000 }, { auto: true });
    playTo(repetition, 1200);
    toggleAuto(repetition, true, 1500, []);
    expect(repetition.session.snapshot.atMs).toBe(1200);
    expect(eventSummary(repetition.autoInputSource.eventsThrough(2000))).toEqual([[2000, "down", AUTO_W]]);
  });

  it("곡 관측 시각 1200ms보다 이른 1100ms로 전환하면 RangeError이고 모드를 바꾸지 않음", () => {
    const repetition = startRepetition([p(1000), p(2000)], { startMs: 1000, endMs: 2000 }, { auto: true });
    playTo(repetition, 1200);
    expect(() => toggleAuto(repetition, false, 1100, [])).toThrow(RangeError);
    expect([repetition.autoEnabled, repetition.manualStats]).toEqual([true, null]);
  });

  it("구간 끝 2000ms 뒤 toMs 5000ms 전 4999ms에는 끝나지 않고 판정 마감 2120ms가 지난 5000ms에 끝남", () => {
    const repetition = startRepetition([p(1000), p(2000)], { startMs: 1000, endMs: 2000 }, { auto: true });
    expect(repetition.fadedSpan.toMs).toBe(5000);
    expect(repetition.session.latestJudgmentDeadlineMs).toBe(2120);
    expect(repetition.isFinished(4999, 4999)).toBe(false);
    expect(repetition.isFinished(5000, 5000)).toBe(true);
  });

  it("입력 오프셋 -100ms에서 곡 5000ms·판정 4900ms이면 toMs 5000ms와 마감 2120ms를 모두 지나 반복 종료", () => {
    const repetition = startRepetition([p(2000)], { startMs: 1000, endMs: 2000 }, { auto: false });
    const audio = { currentTimeMs: 5000, playbackRate: 1, getOutputLatencyMs: () => 0 };
    const clock = new GameClock(audio, { inputOffsetMs: -100, visualOffsetMs: 0 }, () => audio.currentTimeMs);
    stepExplicitPlaySession(new InputTimeline(), repetition.session, repetition.autoInputSource, clock, 5000);
    expect(repetition.session.snapshot.atMs).toBe(4900);
    expect(repetition.isFinished(clock.judgmentTimeMs(), clock.toInputTimeMs(5000))).toBe(true);
    expect(canFinishExplicitPlaySession(repetition.session, clock, 5000, 5000)).toBe(true);
  });

  it("입력 오프셋 -100ms에서 음원 끝 2000ms 뒤 곡 2220ms·판정 2120ms에는 기다리고 곡 2221ms에 종료", () => {
    const repetition = startRepetition([p(2000)], { startMs: 1000, endMs: 2000 }, { auto: false, audioDurationMs: 2000 });
    const audio = { currentTimeMs: 2220, playbackRate: 1, getOutputLatencyMs: () => 0 };
    const clock = new GameClock(audio, { inputOffsetMs: -100, visualOffsetMs: 0 }, () => audio.currentTimeMs);
    for (const [songTimeMs, finished] of [[2220, false], [2221, true]] as const) {
      audio.currentTimeMs = songTimeMs;
      stepExplicitPlaySession(new InputTimeline(), repetition.session, repetition.autoInputSource, clock, songTimeMs);
      expect(repetition.isFinished(clock.judgmentTimeMs(), clock.toInputTimeMs(songTimeMs))).toBe(finished);
      expect(canFinishExplicitPlaySession(repetition.session, clock, 2000, songTimeMs)).toBe(finished);
    }
  });

  it("음원 끝 60000ms의 탭을 놓치면 toMs 60000ms 전 59999ms·Miss 대기 중 60000·60120ms에는 끝나지 않고, 60120ms Miss를 확정한 60121ms에 끝나며 그 Miss를 수동 집계에 넣음", () => {
    const repetition = startRepetition([p(57000), p(60000)], { startMs: 57000, endMs: 60000 },
      { auto: false, audioDurationMs: 60000 });
    expect(repetition.fadedSpan).toEqual({ fromMs: 54000, fadeInUntilMs: 57000, fadeOutFromMs: 60000, toMs: 60000 });
    playTo(repetition, 59999, [[57000, [down()]], [57050, [up()]]]);
    expect(repetition.isFinished(59999, 59999)).toBe(false);
    for (const atMs of [60000, 60120]) {
      playTo(repetition, atMs);
      expect(repetition.isFinished(atMs, atMs)).toBe(false);
      expect(settlements(repetition)).toHaveLength(1);
    }
    playTo(repetition, 60121);
    expect(settlements(repetition).at(-1)).toMatchObject({ itemId: "n1:tap:0", grade: "miss", confirmedAt: 60120 });
    expect(repetition.isFinished(60121, 60121)).toBe(true);
    expect(repetition.manualStats).toEqual({ combo: 0, achievementRate: 50 });
  });
});

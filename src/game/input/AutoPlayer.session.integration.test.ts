import { describe, expect, it } from "vitest";
import { beat, type NoteEntity } from "../../shared";
import { compileJudgmentChart, selectCompiledJudgmentChart } from "../judgment/compiledJudgmentChart";
import { NoteJudgmentSession } from "../judgment/NoteJudgmentSession";
import { AutoPlayer, type AutoSectionMs } from "./AutoPlayer";

const always: AutoSectionMs[] = [{ startMs: 0, endMs: Number.POSITIVE_INFINITY }];

function replay(notes: readonly NoteEntity[], starts: readonly number[], ends: readonly (number | undefined)[] = [], cursor?: number) {
  const startMap = new Map(starts.map((time, index) => [index, time] as [number, number]));
  const endMap = new Map<number, number>();
  ends.forEach((time, index) => { if (time !== undefined) endMap.set(index, time); });
  const compiledBase = compileJudgmentChart(notes, startMap, endMap);
  const compiled = cursor === undefined ? compiledBase : selectCompiledJudgmentChart(compiledBase, cursor);
  const session = new NoteJudgmentSession(compiled);
  const player = new AutoPlayer(notes, startMap, endMap, always, compiled);
  const generatedPresses: { lane: number; timeMs: number; key: string }[] = [];
  const generatedReleases: { lane: number; timeMs: number; key: string }[] = [];
  const physicallyHeld = new Set<string>();
  const last = Math.max(...starts, ...ends.filter((time): time is number => time !== undefined)) + 300;

  for (let tick = 0; tick <= last; tick += 10) {
    const events = player.eventsThrough(tick);
    const byTime = new Map<number, typeof events>();
    for (const input of events) {
      if (input.type === "press") generatedPresses.push(input);
      else generatedReleases.push(input);
      const physicalKey = `${input.lane}:${input.key}`;
      if (input.type === "press") {
        if (physicallyHeld.has(physicalKey)) throw new Error(`이미 held인 key 재press: ${physicalKey}@${input.timeMs}`);
        physicallyHeld.add(physicalKey);
      } else {
        if (!physicallyHeld.has(physicalKey)) throw new Error(`미held key release: ${physicalKey}@${input.timeMs}`);
        physicallyHeld.delete(physicalKey);
      }
      const batch = byTime.get(input.timeMs) ?? [];
      batch.push(input);
      byTime.set(input.timeMs, batch);
    }
    for (const [timeMs, batch] of byTime) {
      session.processBatch(timeMs, batch.map((input) => ({
        key: input.key, lane: input.lane, type: input.type === "press" ? "down" : "up",
      })));
    }
    session.advance(tick);
  }
  if (physicallyHeld.size !== 0) throw new Error(`replay 종료 후 held key 잔류: ${[...physicallyHeld].join(",")}`);
  return { compiled, player, session, state: session.finalize(), generatedPresses, generatedReleases };
}

function expectAutoplaySuccess(result: ReturnType<typeof replay>): void {
  expect(result.state.achievementRate).toBe(100);
  expect(result.state.isFullCombo).toBe(true);
  expect(result.state.judgmentCounts.miss).toBe(0);
  expect(result.state.liveDenominatorWeight).toBe(result.compiled.theoreticalWeight);
  expect(result.state.finalDenominatorWeight).toBe(result.compiled.theoreticalWeight);
}

describe("AutoPlayer compiled topology와 NoteJudgmentSession 통합", () => {
  it("single head가 doubleLong body를 맡으면 부족한 unit에만 추가 start를 만들고 두 release를 정산한다", () => {
    const notes: NoteEntity[] = [
      { type: "single", lane: 1, beat: beat(0) },
      { type: "doubleLong", lane: 1, beat: beat(0), endBeat: beat(2) },
    ];
    const result = replay(notes, [1000, 1000], [undefined, 2000]);
    expect(result.generatedPresses.filter((input) => input.timeMs === 1000)).toHaveLength(2);
    expect(result.session.events.filter((event) => event.noteIndex === 0 && event.kind === "head")).toHaveLength(1);
    expect(result.session.events.filter((event) => event.noteIndex === 1 && event.kind === "release")).toHaveLength(2);
  });

  it("중간 single head 연결은 predecessor held key를 재press하지 않고 새 head tap으로 이어진다", () => {
    const notes: NoteEntity[] = [
      { type: "single", lane: 1, beat: beat(0) },
      { type: "long", lane: 1, beat: beat(0), endBeat: beat(1) },
      { type: "single", lane: 1, beat: beat(1) },
      { type: "long", lane: 1, beat: beat(1), endBeat: beat(2) },
    ];
    const result = replay(notes, [0, 0, 1000, 1000], [undefined, 1000, undefined, 2000]);
    expect(result.generatedPresses.filter((input) => input.timeMs === 1000)).toHaveLength(1);
    expectAutoplaySuccess(result);
  });

  it("중간 double head 연결은 두 fresh head key를 tap하고 held key를 중복 press하지 않는다", () => {
    const notes: NoteEntity[] = [
      { type: "double", lane: 1, beat: beat(0) },
      { type: "doubleLong", lane: 1, beat: beat(0), endBeat: beat(1) },
      { type: "double", lane: 1, beat: beat(1) },
      { type: "doubleLong", lane: 1, beat: beat(1), endBeat: beat(2) },
    ];
    const result = replay(notes, [0, 0, 1000, 1000], [undefined, 1000, undefined, 2000]);
    expect(result.generatedPresses.filter((input) => input.timeMs === 1000)).toHaveLength(2);
    expectAutoplaySuccess(result);
  });

  it("exact Beat로 이어진 headless chain은 불필요한 추가 down 없이 connection을 상속한다", () => {
    const notes: NoteEntity[] = [
      { type: "long", lane: 1, beat: beat(0), endBeat: beat(1), holdOnly: true },
      { type: "long", lane: 1, beat: beat(1), endBeat: beat(2) },
    ];
    const result = replay(notes, [1000, 1500], [1500, 2000]);
    expect(result.compiled.connections).toEqual([expect.objectContaining({ predecessorIndex: 0, successorIndex: 1 })]);
    expect(result.session.events.filter((event) => event.noteIndex === 1 && event.kind === "head")).toEqual([]);
    expectAutoplaySuccess(result);
  });

  it("2→1→2 normal chain은 감소 구간의 실제 release 한 개와 다음 double의 fresh press 한 개를 만든다", () => {
    const notes: NoteEntity[] = [
      { type: "doubleLong", lane: 1, beat: beat(0), endBeat: beat(1) },
      { type: "long", lane: 1, beat: beat(1), endBeat: beat(2) },
      { type: "doubleLong", lane: 1, beat: beat(2), endBeat: beat(3) },
    ];
    const result = replay(notes, [1000, 1500, 2000], [1500, 2000, 2500]);
    expect(result.generatedPresses.filter((input) => input.timeMs === 2000)).toHaveLength(1);
    expect(result.generatedReleases.filter((input) => input.timeMs === 1500)).toHaveLength(1);
    expectAutoplaySuccess(result);
  });

  it("holdOnly waiver는 AutoPlayer가 end까지 key를 유지해 holdOnly score item을 정산한다", () => {
    const notes: NoteEntity[] = [{ type: "long", lane: 1, beat: beat(0), endBeat: beat(1), holdOnly: true }];
    const result = replay(notes, [1000], [1500]);
    expect(result.session.events.filter((event) => event.kind === "holdOnly")).toHaveLength(1);
    expectAutoplaySuccess(result);
  });

  it("double terminal은 note별 fresh key 두 개로 두 release item을 독립 정산한다", () => {
    const notes: NoteEntity[] = [{ type: "doubleLong", lane: 1, beat: beat(0), endBeat: beat(1) }];
    const result = replay(notes, [1000], [1500]);
    const releases = result.session.events.filter((event) => event.kind === "release");
    expect(releases).toHaveLength(2);
    expect(new Set(releases.map((event) => event.key)).size).toBe(2);
    expectAutoplaySuccess(result);
  });

  it("zeroH는 같은 timestamp down 뒤 up을 core causal 순서로 전달해 한 item만 정산한다", () => {
    const notes: NoteEntity[] = [{ type: "long", lane: 1, beat: beat(0), endBeat: beat(0), holdOnly: true }];
    const result = replay(notes, [1000], [1000]);
    expect(result.session.events.filter((event) => event.kind === "holdOnly")).toHaveLength(1);
    expectAutoplaySuccess(result);
  });

  it("H 2→1→2 연결은 감소 경계에서 두 key를 유지하고 증가에도 새 down 없이 전부 성공한다", () => {
    const notes: NoteEntity[] = [
      { type: "doubleLong", lane: 1, beat: beat(0), endBeat: beat(1), holdOnly: true },
      { type: "long", lane: 1, beat: beat(1), endBeat: beat(2) },
      { type: "doubleLong", lane: 1, beat: beat(2), endBeat: beat(3) },
    ];
    const result = replay(notes, [1000, 1500, 2000], [1500, 2000, 2500]);
    expect(result.generatedReleases.filter((input) => input.timeMs === 1500)).toHaveLength(0);
    expect(result.generatedPresses.filter((input) => input.timeMs === 2000)).toHaveLength(0);
    expectAutoplaySuccess(result);
  });

  it("canonical Q1은 긴 ms 간격의 1→1 연결을 같은 key로 끝까지 성공시킨다", () => {
    const notes: NoteEntity[] = [
      { type: "double", lane: 1, beat: beat(0) },
      { type: "doubleLong", lane: 1, beat: beat(0), endBeat: beat(1) },
      { type: "long", lane: 1, beat: beat(1), endBeat: beat(2) },
      { type: "doubleLong", lane: 1, beat: beat(2), endBeat: beat(3) },
      { type: "long", lane: 1, beat: beat(3), endBeat: beat(4) },
    ];
    const result = replay(notes, [0, 0, 1000, 1060, 1100], [undefined, 1000, 1060, 1100, 2000]);
    expect(result.generatedPresses.filter((input) => input.timeMs === 0)).toHaveLength(2);
    expect(result.generatedPresses.filter((input) => input.timeMs === 1060)).toHaveLength(1);
    expectAutoplaySuccess(result);
  });

  it("canonical H02는 Q1의 두 holdOnly 감소 경계를 새 down 없이 100% 처리한다", () => {
    const notes: NoteEntity[] = [
      { type: "double", lane: 1, beat: beat(0) },
      { type: "doubleLong", lane: 1, beat: beat(0), endBeat: beat(1), holdOnly: true },
      { type: "long", lane: 1, beat: beat(1), endBeat: beat(2) },
      { type: "doubleLong", lane: 1, beat: beat(2), endBeat: beat(3), holdOnly: true },
      { type: "long", lane: 1, beat: beat(3), endBeat: beat(4) },
    ];
    const result = replay(notes, [0, 0, 1000, 1060, 1100], [undefined, 1000, 1060, 1100, 2000]);
    expect(result.generatedPresses.filter((input) => input.timeMs === 1060)).toHaveLength(0);
    expect(result.generatedReleases.filter((input) => input.timeMs === 1000)).toHaveLength(0);
    expectAutoplaySuccess(result);
  });

  it("선택 cursor가 이전·현재·이후에 놓여도 제외 note는 입력과 score에서 함께 사라진다", () => {
    const notes: NoteEntity[] = [
      { type: "single", lane: 1, beat: beat(0) },
      { type: "single", lane: 1, beat: beat(1) },
      { type: "single", lane: 1, beat: beat(2) },
    ];
    for (const cursor of [900, 1000, 1100, 1200]) {
      const result = replay(notes, [800, 1000, 1200], [], cursor);
      expect(result.generatedPresses.every((input) => input.timeMs >= cursor)).toBe(true);
      expectAutoplaySuccess(result);
    }
  });
});

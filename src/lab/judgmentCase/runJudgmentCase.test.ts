import { describe, expect, it } from "vitest";
import { compileJudgmentChart } from "../../game/judgment/compiledJudgmentChart";
import { NoteJudgmentSession } from "../../game/judgment/NoteJudgmentSession";
import { validateChart } from "../../shared/validation";
import { judgmentCaseFromSource } from "./chartCase";
import { runJudgmentCase, type JudgmentEngine } from "./runJudgmentCase";

const engine: JudgmentEngine = { compileJudgmentChart, NoteJudgmentSession, validateChart };

const R16 = "노트: head 0 | long 0-1000 | head 1000 | long 1000-2000\n입력: A 0-1015 | B 1020-2000";
const H08 = "노트: head 1000 | holdOnly 1000-1500 | holdOnly 1500-2000 | holdOnly 2000-2500 | long 2500-3000";

/** 실제 compile 결과는 쓰고 세션만 바꿔 호출을 기록하는 엔진. */
function recordingEngine(behavior: { throwAt?: number } = {}) {
  const calls: string[] = [];
  class RecordingSession {
    readonly events = [];
    readonly score = {
      getState: () => ({ judgmentCounts: { perfect: 0, great: 0, good: 0, goodTrill: 0, bad: 0, miss: 0 }, achievementRate: 0, isFullCombo: true, processedNotes: 0, totalNotes: 2 }),
    };
    advance(at: number) {
      if (behavior.throwAt !== undefined && at >= behavior.throwAt) throw new Error(`advance 폭발 ${at}`);
      calls.push(`advance ${at}`);
    }
    processBatch(at: number, inputs: readonly { key: string; lane?: number; type: string }[]) {
      if (behavior.throwAt !== undefined && at >= behavior.throwAt) throw new Error(`processBatch 폭발 ${at}`);
      calls.push(`batch ${at} ${inputs.map((input) => `${input.key}:${input.lane}:${input.type}`).join(",")}`);
    }
    finalize() { calls.push("finalize"); }
  }
  const fake = { compileJudgmentChart, NoteJudgmentSession: RecordingSession, validateChart } as unknown as JudgmentEngine;
  return { engine: fake, calls };
}

describe("runJudgmentCase — 실제 엔진 재현", () => {
  it("NJ-R16: A 0-1015 | B 1020-2000이면 head Perfect 0(A)·head Perfect +20(B)·release Perfect(B↑2000), 유지 Miss 없이 Perfect 3", () => {
    const run = runJudgmentCase(judgmentCaseFromSource(R16), engine);
    expect(run.events.map((event) => [event.kind, event.grade, event.deltaMs, event.key, event.inputAt])).toEqual([
      ["head", "perfect", 0, "A", 0],
      ["head", "perfect", 20, "B", 1020],
      ["release", "perfect", 0, "B", 2000],
    ]);
    expect(run.counts).toEqual({ perfect: 3, great: 0, good: 0, goodTrill: 0, miss: 0 });
    expect(run.isFullCombo).toBe(true);
    expect(run.unsettledItems).toEqual([]);
    expect(run.error).toBeNull();
  });

  it("NJ-H08: o-*-*-*-를 16ms 프레임으로 돌리고 A를 1030ms에 늦게 눌러 3000ms에 떼면 head·holdOnly 3개·release 모두 Perfect, 달성률 100%", () => {
    const run = runJudgmentCase(judgmentCaseFromSource(`${H08}\n입력: A 1030-3000`), engine);
    expect(run.events.map((event) => `${event.kind}:${event.grade}`)).toEqual([
      "head:perfect", "holdOnly:perfect", "holdOnly:perfect", "holdOnly:perfect", "release:perfect",
    ]);
    expect(run.counts.perfect).toBe(5);
    expect(run.achievementRate).toBe(100);
    expect(run.processedNotes).toBe(5);
    expect(run.totalNotes).toBe(5);
    expect(run.finalized).toBe(true);
  });

  it("NJ-H08 대조: head를 1121ms에 누르면 head Miss 1120 뒤 holdOnly·long 바디 4개(엔진 인덱스 1~4)가 모두 0점 처리되고 Full Combo 아님", () => {
    const run = runJudgmentCase(judgmentCaseFromSource(`${H08}\n입력: A 1121-3000`), engine);
    expect(run.events.filter((event) => event.kind === "head").map((event) => [event.grade, event.confirmedAt])).toEqual([["miss", 1120]]);
    expect(run.events.filter((event) => event.kind === "dependentZero").map((event) => event.noteIndex)).toEqual([1, 2, 3, 4]);
    expect(run.isFullCombo).toBe(false);
  });

  it("compile 결과의 score item을 id·kind·noteIndex·unitIndex·timeMs로 돌려줌", () => {
    const run = runJudgmentCase(judgmentCaseFromSource(R16), engine);
    expect(run.scoreItems).toEqual([
      { id: "n0:head", kind: "head", noteIndex: 0, unitIndex: 0, timeMs: 0 },
      { id: "n2:head", kind: "head", noteIndex: 2, unitIndex: 0, timeMs: 1000 },
      { id: "n3:release:0", kind: "release", noteIndex: 3, unitIndex: 0, timeMs: 2000 },
    ]);
  });

  it("A↓500이 시작 창 밖인 long 1000-2000은 재생 뒤 유닛 상태가 failed이고 한 번도 active가 아님(S+Good 1120의 A↑와 무관)", () => {
    const run = runJudgmentCase(judgmentCaseFromSource("노트: long 1000-2000\n입력: A 500-1120"), engine);
    expect(run.unitStates).toEqual([{ noteIndex: 0, unitIndex: 0, active: false, failed: true, complete: false, registeredKeys: [] }]);
  });

  it("head 1000 | long 1000-2000을 A 1000-1500으로 치면 1000 batch 직전 바디는 등록 키 없음, 1500 batch 직전에는 active·등록 키 [A]", () => {
    const run = runJudgmentCase(judgmentCaseFromSource("노트: head 1000 | long 1000-2000\n입력: A 1000-1500"), engine);
    expect(run.unitStatesBeforeBatch?.map((batch) => batch.atMs)).toEqual([1000, 1500]);
    expect(run.unitStatesBeforeBatch?.[0].unitStates).toEqual([{ noteIndex: 1, unitIndex: 0, active: false, failed: false, complete: false, registeredKeys: [] }]);
    expect(run.unitStatesBeforeBatch?.[1].unitStates).toEqual([{ noteIndex: 1, unitIndex: 0, active: true, failed: false, complete: false, registeredKeys: ["A"] }]);
  });

  it("validateChart 오류(같은 레인 long 1000-2000과 head 1500 겹침)를 rule·message로 담고 그래도 엔진을 돌림", () => {
    const run = runJudgmentCase(judgmentCaseFromSource("노트: long 1000-2000 | head 1500\n입력: A 1000-2000"), engine);
    expect(run.validationErrors.map((error) => error.rule)).toContain("longOverlap");
    expect(run.events.length).toBeGreaterThan(0);
  });
});

describe("runJudgmentCase — 세션 구동 순서", () => {
  it("입력 40ms 하나면 0·16·32ms 프레임을 advance한 뒤 40ms에 processBatch", () => {
    const { engine: fake, calls } = recordingEngine();
    runJudgmentCase(judgmentCaseFromSource("노트: head 40\n입력: A 40-"), fake);
    expect(calls.slice(0, 4)).toEqual(["advance 0", "advance 16", "advance 32", "batch 40 A:1:down"]);
  });

  it("같은 1000ms의 B down과 A down은 적은 순서대로 한 batch로 보냄", () => {
    const { engine: fake, calls } = recordingEngine();
    runJudgmentCase(judgmentCaseFromSource("노트: dhead 1000\n입력: B 1000-1100 | A 1000-1100"), fake);
    expect(calls).toContain("batch 1000 B:1:down,A:1:down");
    expect(calls).toContain("batch 1100 B:1:up,A:1:up");
  });

  it("마지막 노트 2000ms + Good 120ms 뒤 프레임까지 advance하고 finalize를 한 번 부름", () => {
    const { engine: fake, calls } = recordingEngine();
    runJudgmentCase(judgmentCaseFromSource("노트: head 0 | long 0-2000\n입력: A 0-2000"), fake);
    const advances = calls.filter((call) => call.startsWith("advance")).map((call) => Number(call.split(" ")[1]));
    expect(Math.max(...advances)).toBeGreaterThan(2120);
    expect(calls.at(-1)).toBe("finalize");
    expect(calls.filter((call) => call === "finalize")).toHaveLength(1);
  });

  it("떼지 않은 입력 A 0-는 up을 보내지 않음", () => {
    const { engine: fake, calls } = recordingEngine();
    runJudgmentCase(judgmentCaseFromSource("노트: head 0 | long 0-500\n입력: A 0-"), fake);
    expect(calls.filter((call) => call.startsWith("batch"))).toEqual(["batch 0 A:1:down"]);
  });

  it("세션이 1100ms에서 예외를 던지면 error에 메시지와 시각을 담고 결과를 돌려줌", () => {
    const { engine: fake } = recordingEngine({ throwAt: 1100 });
    const run = runJudgmentCase(judgmentCaseFromSource("노트: head 1000 | long 1000-2000\n입력: A 1000-1100"), fake);
    expect(run.error).toEqual({ message: "processBatch 폭발 1100", atMs: 1100 });
    expect(run.finalized).toBe(false);
  });

  it("compileJudgmentChart가 예외를 던지면 이벤트 없이 error와 검증 결과만 돌려줌", () => {
    const broken = { ...engine, compileJudgmentChart: () => { throw new Error("compile 실패"); } } as unknown as JudgmentEngine;
    const run = runJudgmentCase(judgmentCaseFromSource("노트: head 1000\n입력: A 1000-1100"), broken);
    expect(run.error).toEqual({ message: "compile 실패", atMs: null });
    expect(run.events).toEqual([]);
    expect(run.validationErrors).toEqual([]);
  });

  it("세션에 bodyStates가 없는 엔진이면 unitStates·unitStatesBeforeBatch는 null", () => {
    const { engine: fake } = recordingEngine();
    const run = runJudgmentCase(judgmentCaseFromSource("노트: head 1000 | long 1000-2000\n입력: A 1000-2000"), fake);
    expect(run.unitStates).toBeNull();
    expect(run.unitStatesBeforeBatch).toBeNull();
  });

  it("프레임 간격은 기본 16ms, frameMs 5를 주면 run.frameMs 5", () => {
    const judgmentCase = judgmentCaseFromSource("노트: head 1000\n입력: A 1000-1100");
    expect(runJudgmentCase(judgmentCase, engine).frameMs).toBe(16);
    expect(runJudgmentCase(judgmentCase, engine, { frameMs: 5 }).frameMs).toBe(5);
  });

  it("세션이 아무 이벤트도 내지 않으면 head·release score item 2개가 모두 미정산", () => {
    const { engine: fake } = recordingEngine();
    const run = runJudgmentCase(judgmentCaseFromSource("노트: head 1000 | long 1000-2000\n입력: A 1000-2000"), fake);
    expect(run.unsettledItems.map((item) => item.id)).toEqual(["n0:head", "n1:release:0"]);
  });
});

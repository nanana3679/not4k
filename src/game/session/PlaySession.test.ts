import { describe, it, expect, vi } from "vitest";
import { createPlaySession, type PlaySessionEffects, type PlaySessionClock } from "./PlaySession";
import { DebugLogger } from "../debug/DebugLogger";
import { beat, BEAT_ZERO } from "../../shared/types/beat";
import type { NoteEntity, ChartEvent } from "../../shared/types/chart";
import { createChartTiming, type ChartTimingSource } from "../../shared/timing/chartTiming";
import { JUDGMENT_WINDOWS, JudgmentGrade } from "../../shared/constants";
import type { Lane } from "../../shared/constants";

// ---------------------------------------------------------------------------
// Test rigs
// ---------------------------------------------------------------------------

interface RecordedCall {
  method: string;
  args: unknown[];
}

/** PlaySessionEffects의 모든 호출을 순서대로 기록하는 스파이 (이슈 #141 특성화 테스트 그물). */
function createSpyEffects() {
  const calls: RecordedCall[] = [];
  let heldFillQuery:
    | ((noteIndex: number, timeMs: number) => { filled: number; required: number } | null)
    | null = null;

  const record =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
    };

  const effects: PlaySessionEffects = {
    recordPerspectiveSurfaceJudgment: record("recordPerspectiveSurfaceJudgment"),
    showJudgment: record("showJudgment"),
    updateAccuracy: record("updateAccuracy"),
    showBombEffect: record("showBombEffect"),
    applyNoteDisplayEffect: record("applyNoteDisplayEffect"),
    updateCombo: record("updateCombo"),
    setKeyBeam: record("setKeyBeam"),
    setKeyState: record("setKeyState"),
    setHeadlessHeldFillQuery: (query) => {
      heldFillQuery = query;
      calls.push({ method: "setHeadlessHeldFillQuery", args: [query] });
    },
    renderFrame: record("renderFrame"),
  };

  return {
    effects,
    calls,
    methodNames: () => calls.map((c) => c.method),
    callsTo: (method: string) => calls.filter((c) => c.method === method),
    getHeldFillQuery: () => heldFillQuery,
  };
}

/** clock.judgmentTimeMs()=t, visualTimeMs()=t+30, toInputTimeMs(ts)=ts (설정 가능한 t). */
function createFakeClock(): PlaySessionClock & { t: number } {
  const clock = {
    t: 0,
    judgmentTimeMs() {
      return clock.t;
    },
    visualTimeMs() {
      return clock.t + 30;
    },
    toInputTimeMs(ts: number) {
      return ts;
    },
  };
  return clock;
}

const SCROLL_SPEED = 500;
const JUDGMENT_LINE_Y = 800;

function makeSession(opts: {
  notes: NoteEntity[];
  events?: ChartEvent[];
  startTimeMs?: number;
  debug?: boolean;
  audio?: { currentTimeMs: number; duration: number };
}) {
  const bpm: ChartEvent = { type: "bpm", beat: BEAT_ZERO, bpm: 120 };
  const events = opts.events ? [bpm, ...opts.events] : [bpm];
  const source: ChartTimingSource = {
    notes: opts.notes,
    trillZones: [],
    events,
    meta: { offsetMs: 0 },
  };
  const timing = createChartTiming(source);
  const spy = createSpyEffects();
  const clock = createFakeClock();
  const audio = opts.audio ?? { currentTimeMs: 0, duration: 100000 };
  const debugLogger = opts.debug ? new DebugLogger(SCROLL_SPEED, JUDGMENT_LINE_Y) : undefined;

  const session = createPlaySession({
    notes: opts.notes,
    events,
    timing,
    windows: JUDGMENT_WINDOWS,
    startTimeMs: opts.startTimeMs ?? 0,
    clock,
    effects: spy.effects,
    audio,
    debug: debugLogger
      ? { logger: debugLogger, judgmentLineY: JUDGMENT_LINE_Y, scrollSpeed: SCROLL_SPEED }
      : undefined,
  });

  return { session, spy, clock, audio, timing, debugLogger };
}

const single = (lane: number, b: number): NoteEntity => ({ type: "single", lane, beat: beat(b) });
const long = (lane: number, b: number, endB: number): NoteEntity => ({
  type: "long",
  lane,
  beat: beat(b),
  endBeat: beat(endB),
});
/** 항상 auto인 구간 이벤트 (beat 0..64). */
const autoEvent = (): ChartEvent => ({ type: "auto", beat: BEAT_ZERO, endBeat: beat(64) });

/** 판정 효과 5종(콤보/키비트 제외)만 순서 검사용으로 뽑는다. */
const APPLIER_METHODS = new Set([
  "recordPerspectiveSurfaceJudgment",
  "showJudgment",
  "updateAccuracy",
  "showBombEffect",
  "applyNoteDisplayEffect",
]);

// ===========================================================================
// 적용자(applier) 순서 계약 (§10.1)
// ===========================================================================

describe("PlaySession 판정 적용자 순서", () => {
  it("단일 노트 Perfect 판정 시 sink 호출 순서가 recordPerspectiveSurfaceJudgment → showJudgment → updateAccuracy → showBombEffect → applyNoteDisplayEffect 순임", () => {
    const { session, spy, timing } = makeSession({ notes: [single(1, 2)] });
    const noteMs = timing.noteTimesMs.get(0)!;

    session.onLanePress(1 as Lane, noteMs, "KeyA");

    const applierOrder = spy.methodNames().filter((m) => APPLIER_METHODS.has(m));
    expect(applierOrder).toEqual([
      "recordPerspectiveSurfaceJudgment",
      "showJudgment",
      "updateAccuracy",
      "showBombEffect",
      "applyNoteDisplayEffect",
    ]);
  });

  it("노트 1개 차트에서 Perfect 1회 직후 updateAccuracy가 기록 반영 후 달성률 100을 받음", () => {
    const { session, spy, timing } = makeSession({ notes: [single(1, 2)] });
    const noteMs = timing.noteTimesMs.get(0)!;

    session.onLanePress(1 as Lane, noteMs, "KeyA");

    const accuracyCall = spy.callsTo("updateAccuracy")[0];
    expect(accuracyCall).toBeDefined();
    expect(accuracyCall.args[0]).toBe(100);
  });

  it("Miss 판정이면 showBombEffect가 호출되지 않고 applyNoteDisplayEffect는 missed 전이를 받음", () => {
    const { session, spy, clock, timing } = makeSession({ notes: [single(1, 2)] });
    const noteMs = timing.noteTimesMs.get(0)!;
    // 입력 없이 BAD 윈도우를 지나 auto Miss 유도
    clock.t = noteMs + JUDGMENT_WINDOWS.BAD + 100;

    session.tick(1000);

    expect(spy.callsTo("showBombEffect")).toHaveLength(0);
    const displayCall = spy.callsTo("applyNoteDisplayEffect")[0];
    expect(displayCall).toBeDefined();
    expect((displayCall.args[1] as { visibility: string }).visibility).toBe("missed");
  });

  it("콤보 2 달성 시 updateCombo(2)가 호출됨", () => {
    const { session, spy, timing } = makeSession({ notes: [single(1, 2), single(2, 2)] });
    const note0Ms = timing.noteTimesMs.get(0)!;
    const note1Ms = timing.noteTimesMs.get(1)!;

    session.onLanePress(1 as Lane, note0Ms, "KeyA");
    session.onLanePress(2 as Lane, note1Ms, "KeyB");

    const comboArgs = spy.callsTo("updateCombo").map((c) => c.args[0]);
    expect(comboArgs).toContain(2);
  });

  it("debug 주입 시 판정마다 DebugLogger.recordJudgment가 noteIndex·grade·deltaMs로 기록됨", () => {
    const { session, timing, debugLogger } = makeSession({ notes: [single(1, 2)], debug: true });
    const spyRecord = vi.spyOn(debugLogger!, "recordJudgment");
    const noteMs = timing.noteTimesMs.get(0)!;

    session.onLanePress(1 as Lane, noteMs, "KeyA");

    expect(spyRecord).toHaveBeenCalledTimes(1);
    const [noteIndex, , grade, deltaMs] = spyRecord.mock.calls[0];
    expect(noteIndex).toBe(0);
    expect(grade).toBe(JudgmentGrade.PERFECT);
    expect(deltaMs).toBe(0);
  });

  it("debug 주입 시 바디(끝점) 판정은 endBeat 시각 기준 Y로 기록됨", () => {
    // 헤드 없는 롱노트(길이>0)를 auto로 몰아 끝점(바디) 판정을 낸다.
    const { session, clock, audio, timing, debugLogger } = makeSession({
      notes: [long(1, 2, 4)],
      events: [autoEvent()],
      debug: true,
    });
    const spyRecord = vi.spyOn(debugLogger!, "recordJudgment");
    const startMs = timing.noteTimesMs.get(0)!;
    const endMs = timing.noteEndTimesMs.get(0)!;

    // 시작 틱: press + 바디 활성화
    clock.t = startMs;
    audio.currentTimeMs = startMs;
    session.tick(0);
    // 끝점 틱: clock.t = endMs → 끝점 판정. posTimeMs=endMs=songTimeMs → Y=judgmentLineY
    clock.t = endMs;
    audio.currentTimeMs = endMs;
    session.tick(16);

    const bodyCall = spyRecord.mock.calls.find((c) => c[5] === true);
    expect(bodyCall).toBeDefined();
    // endBeat 시각 기준: posTimeMs=endMs, songTimeMs=endMs → noteCenterY === judgmentLineY.
    // (시작점 기준이었다면 judgmentLineY - (startMs-endMs)*scroll/1000 ≠ judgmentLineY)
    expect(bodyCall![1]).toBeCloseTo(JUDGMENT_LINE_Y, 5);
  });
});

// ===========================================================================
// 틱(tick) 순서 계약 (§10.2)
// ===========================================================================

describe("PlaySession 틱 순서", () => {
  it("AutoEvent 안 길이 0 롱노트에서 tick 한 번이 press → update → release 순으로 처리되어 끝점 판정이 누락되지 않음", () => {
    const { session, spy, clock, audio, timing } = makeSession({
      notes: [long(1, 2, 2)], // 길이 0 롱노트
      events: [autoEvent()],
    });
    const noteMs = timing.noteTimesMs.get(0)!;
    clock.t = noteMs;
    audio.currentTimeMs = noteMs;

    session.tick(0);

    // press → update(바디 auto-활성화) → release가 한 틱에 처리되어 끝점 Perfect가 나야 한다
    const judged = spy.callsTo("showJudgment");
    expect(judged.length).toBeGreaterThan(0);
    expect(judged[0].args[0]).toBe(JudgmentGrade.PERFECT);
  });

  it("auto press는 setKeyBeam(lane,true)만 켜고 setKeyState는 호출하지 않음", () => {
    const { session, spy, clock, audio, timing } = makeSession({
      notes: [single(1, 2)],
      events: [autoEvent()],
    });
    const noteMs = timing.noteTimesMs.get(0)!;
    clock.t = noteMs;
    audio.currentTimeMs = noteMs;

    session.tick(0);

    const beamOn = spy.callsTo("setKeyBeam").filter((c) => c.args[1] === true);
    expect(beamOn.length).toBeGreaterThan(0);
    expect(spy.callsTo("setKeyState")).toHaveLength(0);
  });

  it("tick은 판정에 judgmentTimeMs를, renderFrame에는 visualTimeMs를 사용함 — 두 값이 다르면 renderFrame이 시각 시간을 받음", () => {
    const { session, spy, clock } = makeSession({ notes: [] });
    clock.t = 1234;

    session.tick(0);

    const rf = spy.callsTo("renderFrame")[0];
    expect(rf).toBeDefined();
    // visualTimeMs = t + 30, judgmentTimeMs = t. renderFrame은 visualTimeMs를 받는다.
    expect(rf.args[0]).toBe(1264);
    expect(rf.args[0]).not.toBe(clock.judgmentTimeMs());
  });

  it("첫 tick은 frameDelta를 기록하지 않고 두 번째 tick부터 timestamp 차이로 recordFrameTiming함", () => {
    const { session, debugLogger } = makeSession({ notes: [], debug: true });
    const spyFrame = vi.spyOn(debugLogger!, "recordFrameTiming");

    session.tick(1000);
    expect(spyFrame).not.toHaveBeenCalled();

    session.tick(1016);
    expect(spyFrame).toHaveBeenCalledTimes(1);
    expect(spyFrame).toHaveBeenCalledWith(16);
  });
});

// ===========================================================================
// 곡 종료 감지
// ===========================================================================

describe("PlaySession 곡 종료 감지", () => {
  it("audio.currentTimeMs가 duration에 도달한 tick은 renderFrame까지 실행한 뒤 'ended'를 반환함", () => {
    const { session, spy } = makeSession({
      notes: [],
      audio: { currentTimeMs: 100, duration: 100 },
    });

    const status = session.tick(0);

    expect(status).toBe("ended");
    expect(spy.callsTo("renderFrame")).toHaveLength(1);
  });

  it("duration이 0이면 currentTimeMs와 무관하게 'ended'가 되지 않음", () => {
    const { session } = makeSession({
      notes: [],
      audio: { currentTimeMs: 100, duration: 0 },
    });

    expect(session.tick(0)).toBe("running");
  });
});

// ===========================================================================
// 입력 라우팅
// ===========================================================================

describe("PlaySession 입력 라우팅", () => {
  it("onLanePress는 clock.toInputTimeMs(timestamp)를 판정 시간으로 사용함 — 변환값이 노트 시각과 일치하면 Perfect", () => {
    const { session, spy, timing } = makeSession({ notes: [single(1, 2)] });
    const noteMs = timing.noteTimesMs.get(0)!;

    session.onLanePress(1 as Lane, noteMs, "KeyA");

    const judged = spy.callsTo("showJudgment")[0];
    expect(judged).toBeDefined();
    expect(judged.args[0]).toBe(JudgmentGrade.PERFECT);
  });

  it("onLanePress는 setKeyBeam(lane,true)와 setKeyState(key,true)를 함께 켜고 onLaneRelease는 둘 다 끔", () => {
    const { session, spy, timing } = makeSession({ notes: [single(1, 2)] });
    const noteMs = timing.noteTimesMs.get(0)!;

    session.onLanePress(1 as Lane, noteMs, "KeyA");
    expect(spy.callsTo("setKeyBeam")).toContainEqual({ method: "setKeyBeam", args: [1, true] });
    expect(spy.callsTo("setKeyState")).toContainEqual({ method: "setKeyState", args: ["KeyA", true] });

    session.onLaneRelease(1 as Lane, noteMs + 50, "KeyA");
    expect(spy.callsTo("setKeyBeam")).toContainEqual({ method: "setKeyBeam", args: [1, false] });
    expect(spy.callsTo("setKeyState")).toContainEqual({ method: "setKeyState", args: ["KeyA", false] });
  });
});

// ===========================================================================
// skip / 조립
// ===========================================================================

describe("PlaySession skip 및 조립", () => {
  it("startTimeMs=5000이면 생성 시점에 5000ms 이전 노트가 processed 표시로 전환되고 이후 판정 대상이 아님", () => {
    // 120bpm: beat 8 = 4000ms(<5000, skip), beat 12 = 6000ms(>5000, 유지)
    const { session, spy, timing } = makeSession({
      notes: [single(1, 8), single(1, 12)],
      startTimeMs: 5000,
    });
    const earlyMs = timing.noteTimesMs.get(0)!;
    expect(earlyMs).toBeLessThan(5000);

    // 생성 시점에 이른 노트가 processed 표시로 전환
    const processed = spy
      .callsTo("applyNoteDisplayEffect")
      .find((c) => c.args[0] === 0);
    expect(processed).toBeDefined();
    expect((processed!.args[1] as { visibility: string }).visibility).toBe("processed");

    // 이후 판정 대상 아님 — 그 시각에 눌러도 판정이 나오지 않는다
    spy.calls.length = 0;
    session.onLanePress(1 as Lane, earlyMs, "KeyA");
    expect(spy.callsTo("showJudgment")).toHaveLength(0);
  });

  it("startTimeMs 이전 노트의 판정 수는 달성률 분모에서 제외됨 — 남은 노트 전부 Perfect면 result().achievementRate가 100", () => {
    const { session, timing } = makeSession({
      notes: [single(1, 8), single(1, 12)],
      startTimeMs: 5000,
    });
    const remainingMs = timing.noteTimesMs.get(1)!;

    session.onLanePress(1 as Lane, remainingMs, "KeyA");

    expect(session.result().achievementRate).toBe(100);
  });

  it("세션 생성 시 setHeadlessHeldFillQuery가 등록되고 질의가 엔진 headlessHeldFill 결과를 그대로 반환함", () => {
    const { spy, timing } = makeSession({ notes: [long(1, 2, 4)] });
    const startMs = timing.noteTimesMs.get(0)!;

    const query = spy.getHeldFillQuery();
    expect(query).not.toBeNull();
    // 헤드 없는 롱노트 index 0, 시작 시각, 홀드 없음 → { filled: 0, required: 1 }
    expect(query!(0, startMs)).toEqual({ filled: 0, required: 1 });
  });
});

// ===========================================================================
// 결과
// ===========================================================================

describe("PlaySession 결과", () => {
  it("모든 노트 Perfect 완주 후 result()가 달성률 100·풀콤보·maxCombo·판정 카운트를 반환함", () => {
    const notes = [single(1, 2), single(2, 3), single(3, 4)];
    const { session, timing } = makeSession({ notes });

    notes.forEach((_, i) => {
      session.onLanePress((i + 1) as Lane, timing.noteTimesMs.get(i)!, `Key${i}`);
    });

    const result = session.result();
    expect(result.achievementRate).toBe(100);
    expect(result.isFullCombo).toBe(true);
    expect(result.maxCombo).toBe(3);
    expect(result.judgmentCounts[JudgmentGrade.PERFECT]).toBe(3);
  });
});

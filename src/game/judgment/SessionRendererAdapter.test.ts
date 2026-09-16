import { describe, expect, expectTypeOf, it } from "vitest";
import type { GameRenderer } from "../renderer/GameRenderer";
import type { JudgmentBodyStateQuery } from "../renderer/GameNoteRenderer";
import type { NoteEntity } from "../../shared/types";
import { compileJudgmentChart } from "./compiledJudgmentChart";
import { NoteJudgmentSession, type NoteJudgmentSessionView } from "./NoteJudgmentSession";
import { SessionRendererAdapter, type SessionRendererPort } from "./SessionRendererAdapter";
import { body, down, point, up } from "./noteJudgmentTestHarness";

function port() {
  const calls: string[] = [];
  const accuracy: number[] = [];
  let bodyQuery: JudgmentBodyStateQuery | null = null;
  const value: SessionRendererPort = {
    showJudgment: grade => calls.push(`judgment:${grade}`),
    recordPerspectiveSurfaceJudgment: grade => calls.push(`altitude:${grade}`),
    showBombEffect: lane => calls.push(`bomb:${lane}`),
    updateCombo: combo => calls.push(`combo:${combo}`),
    updateAccuracy: rate => { accuracy.push(rate); calls.push("accuracy"); },
    applyNoteDisplayEffect: (index, effect) => calls.push(`note:${index}:${effect.visibility}:${effect.body}`),
    setJudgmentBodyStateQuery: query => { bodyQuery = query; },
  };
  return { value, calls, accuracy, query: (index: number, at: number) => bodyQuery?.(index, at) };
}

function session(notes: readonly NoteEntity[]) {
  const starts = new Map(notes.map((note, index) => [index, note.beat.n] as [number, number]));
  const ends = new Map(notes.flatMap((note, index) => "endBeat" in note ? [[index, note.endBeat.n] as [number, number]] : []));
  const compiled = compileJudgmentChart(notes, starts, ends);
  const sessionRef: { current?: NoteJudgmentSession } = {};
  const p = port();
  let latestView: NoteJudgmentSessionView | undefined;
  const adapter = new SessionRendererAdapter({ notes, connections: compiled.connections, bodyStates: () => sessionRef.current?.bodyStates ?? [], scoreAccuracy: () => sessionRef.current?.score.getState().achievementRate ?? 0, port: p.value });
  const liveSession = new NoteJudgmentSession(compiled, { onBatchConfirmed: view => { latestView = view; adapter.apply(view); } });
  sessionRef.current = liveSession;
  return { session: liveSession, adapter, calls: p.calls, accuracy: p.accuracy, query: p.query, latestView: () => latestView };
}

describe("SessionRendererAdapter", () => {
  it("같은 렌더 시각의 여러 body 조회는 상태를 한 번만 복사하며 새 입력 묶음 뒤 같은 시각에도 갱신한다", () => {
    const p = port();
    let reads = 0;
    let active = false;
    const adapter = new SessionRendererAdapter({
      notes: [body(0, 1000), body(1000, 2000)], connections: [], scoreAccuracy: () => 0, port: p.value,
      bodyStates: () => { reads++; return [0, 1].map(noteIndex => ({ noteIndex, unitIndex: 0, active, failed: false, complete: false, registeredKeys: [] })); },
    });
    expect(p.query(0, 1000)?.units[0].active).toBe(false);
    p.query(1, 1000);
    expect(reads).toBe(1);
    active = true;
    adapter.apply({ at: 1000, events: [], effects: [], combo: 0 });
    expect(p.query(0, 1000)?.units[0].active).toBe(true);
    p.query(1, 1000);
    expect(reads).toBe(2);
    adapter.reset();
    p.query(0, 1000);
    expect(reads).toBe(3);
  });
  it("GameRenderer를 renderer port로 직접 주입할 수 있음", () => {
    expectTypeOf<GameRenderer>().toExtend<SessionRendererPort>();
  });
  it("head 성공은 judgment·altitude·bomb·accuracy·processed를 한 번 적용한다", () => {
    const h = session([point(1000)]);
    h.session.processBatch(1000, [down("A")]);
    expect(h.calls).toEqual(["judgment:perfect", "altitude:perfect", "bomb:1", "note:0:processed:null", "accuracy", "combo:1"]);
  });

  it("dependentZero는 점수 callback만 통과하고 화면 효과를 만들지 않는다", () => {
    const h = session([point(1000), body(1000, 2000)]);
    h.session.advance(1121);
    expect(h.calls.filter(call => call.startsWith("judgment:")).length).toBe(1);
    expect(h.calls.filter(call => call.startsWith("bomb:")).length).toBe(0);
  });

  it("double head 두 slot Miss는 두 번 정산된 뒤 missed visibility가 된다", () => {
    const h = session([point(1000, "double")]);
    h.session.advance(1121);
    expect(h.calls.filter(call => call === "note:0:missed:null")).toHaveLength(1);
  });

  it("double head 첫 성공은 doublePartial이고 남은 slot 기한 Miss는 missed로 확정됨", () => {
    const h = session([point(1000, "double")]);
    h.session.processBatch(1000, [down("A")]);
    h.session.advance(1121);
    expect(h.calls.filter(call => call.startsWith("note:"))).toEqual(["note:0:doublePartial:null", "note:0:missed:null"]);
  });

  it("루프 reset은 같은 double head를 다음 cycle에서 다시 partial로 시작한다", () => {
    const h = session([point(1000, "double")]);
    h.session.processBatch(1000, [down("A")]);
    const firstView = h.latestView();
    if (!firstView) throw new Error("first confirmed view missing");
    h.adapter.reset();
    h.adapter.apply(firstView);
    expect(h.calls.slice(-3)).toEqual(["note:0:doublePartial:null", "accuracy", "combo:1"]);
  });

  it("두 score item을 Perfect와 Miss로 정산하면 accuracy callback이 100%에서 50%로 갱신된다", () => {
    const h = session([point(1000), point(2000)]);
    h.session.processBatch(1000, [down("A")]);
    h.session.advance(2121);
    expect(h.accuracy).toEqual([100, 50]);
  });

  it("double body 한 unit만 실패하면 건강한 unit 전체를 failed 표시하지 않는다", () => {
    const h = session([body(1000, 2000, "doubleLong")]);
    h.session.processBatch(1000, [down("A"), down("B")]);
    h.session.processBatch(1500, [up("A")]);
    const states = h.query(0, 1500)?.units;
    expect(states?.filter(state => state.failed)).toHaveLength(1);
    expect(states?.filter(state => state.active && !state.failed && !state.complete)).toHaveLength(1);
    expect(h.calls.some(call => call.startsWith("note:0:"))).toBe(false);
  });

  it("연결 source query는 successorIndex와 unit 상태를 함께 전달함", () => {
    const h = session([point(0), body(0, 1000), point(1000), body(1000, 2000)]);
    h.session.processBatch(0, [down("A")]);
    expect(h.query(1, 0)).toMatchObject({ successorIndex: 3, units: [{ active: true, failed: false }] });
    expect(h.query(3, 0)?.successorIndex).toBeUndefined();
  });
});

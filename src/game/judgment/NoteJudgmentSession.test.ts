import { describe, expect, it } from "vitest";
import type { NoteEntity } from "../../shared";
import { JUDGMENT_WINDOWS_EASY } from "../../shared/constants";
import { compileJudgmentChart } from "./compiledJudgmentChart";
import { NoteJudgmentSession, type NoteJudgmentSessionView } from "./NoteJudgmentSession";
import { body, down, point, up } from "./noteJudgmentTestHarness";

function session(notes: readonly NoteEntity[]) {
  const starts = new Map(notes.map((note, index) => [index, note.beat.n / note.beat.d] as [number, number]));
  const ends = new Map<number, number>();
  notes.forEach((note, index) => { if ("endBeat" in note) ends.set(index, note.endBeat.n / note.endBeat.d); });
  return new NoteJudgmentSession(compileJudgmentChart(notes, starts, ends));
}

describe("NoteJudgmentSession", () => {
  it("1100ms까지 advance하면 1000ms holdOnly 성공과 1020ms head Miss를 논리 시각별 callback으로 한 번씩 전달함", () => {
    const views: NoteJudgmentSessionView[] = [];
    const notes = [point(900), body(800, 1000, "long", true, 2)];
    const compiled = compileJudgmentChart(notes, [900, 800], new Map([[1, 1000]]));
    const s = new NoteJudgmentSession(compiled, { onBatchConfirmed: view => {
      if (view.events.length) views.push(view);
    } });
    s.processBatch(800, [down("B", 2)]);
    s.advance(1100);
    expect(views.map(view => ({ at: view.at, combo: view.combo, kinds: view.events.map(e => e.kind) }))).toEqual([
      { at: 1000, combo: 1, kinds: ["holdOnly"] },
      { at: 1020, combo: 0, kinds: ["head"] },
    ]);
    expect(views.flatMap(view => view.events)).toEqual(s.events);
    expect(views.flatMap(view => view.effects)).toEqual(s.effects);
  });

  it("1020ms의 head Miss와 holdOnly Perfect가 같은 deadline 단계에서 확정되면 저장 순서와 관계없이 callback 콤보 0", () => {
    for (const reverse of [false, true]) {
      const notes = [point(900), body(800, 1020, "long", true, 2)];
      if (reverse) notes.reverse();
      const starts = notes.map(note => note.beat.n);
      const ends = new Map(notes.flatMap((note, index) => "endBeat" in note ? [[index, note.endBeat.n] as const] : []));
      const views: NoteJudgmentSessionView[] = [];
      const s = new NoteJudgmentSession(compileJudgmentChart(notes, starts, ends), { onBatchConfirmed: view => {
        if (view.events.length) views.push(view);
      } });
      s.processBatch(800, [down("B", 2)]);
      s.advance(1100);
      expect(views).toHaveLength(1);
      expect(views[0]).toMatchObject({ at: 1020, combo: 0 });
      expect(views[0].events).toHaveLength(2);
      expect(s.combo).toBe(0);
    }
  });

  it("다음 입력을 준비하며 지난 1020ms Miss도 callback에 누락 없이 전달하고 1100ms Perfect는 별도 combo 1", () => {
    const views: NoteJudgmentSessionView[] = [];
    const s = new NoteJudgmentSession(compileJudgmentChart([point(900), point(1100, "single", 2)], [900, 1100], new Map()), {
      onBatchConfirmed: view => { if (view.events.length) views.push(view); },
    });
    s.advance(800);
    s.processBatch(1100, [down("B", 2)]);
    expect(views.map(view => [view.at, view.combo, view.events[0].grade])).toEqual([[1020, 0, "miss"], [1100, 1, "perfect"]]);
    expect(views.flatMap(view => view.events)).toEqual(s.events);
  });

  it("1000ms에 시작한 2000ms 끝을 놓친 채 finalize하면 2120ms release Miss까지 정산함", () => {
    const s = session([point(1000), body(1000, 2000)]);
    s.processBatch(1000, [down("A")]);
    const state = s.finalize();
    expect(s.events).toHaveLength(2);
    expect(s.events[1]).toMatchObject({ kind: "release", grade: "miss", confirmedAt: 2120, consumed: false });
    expect(state).toMatchObject({ processedNotes: 2, earnedScore: 3, achievementRate: 50, liveDenominatorWeight: 6, finalDenominatorWeight: 6 });
  });

  it("Easy Point의 +24ms 입력을 session으로 정산하면 Perfect이며 SLOW 없음", () => {
    const compiled = compileJudgmentChart([point(1000)], [1000], new Map<number, number>());
    const s = new NoteJudgmentSession(compiled, { windows: JUDGMENT_WINDOWS_EASY });
    s.processBatch(1024, [down("A")]);
    expect(s.finalize()).toMatchObject({ earnedScore: 3, slowCount: 0 });
  });

  it("NJ-A05: double head와 doubleLong을 core 입력으로 처리하면 네 score item을 한 번씩 정산한다", () => {
    const s = session([point(1000, "double"), body(1000, 1060, "doubleLong")]);
    s.processBatch(1020, [down("A")]);
    s.processBatch(1025, [up("A")]);
    s.processBatch(1030, [down("B")]);
    s.processBatch(1035, [up("B")]);
    const state = s.finalize();
    expect(state.earnedScore).toBe(12);
    expect(state.processedNotes).toBe(4);
    expect(s.effects.map((effect) => effect.scoreAction.type)).toEqual(["settleItem", "settleItem", "settleItem", "settleItem"]);
  });

  it("=-=-에서 2000ms 두 키만 누르고 증가 입력을 생략해도 감소 release를 중복 정산하지 않고 40%로 종료한다", () => {
    const notes = [
      point(2000, "double"),
      body(2000, 2500, "doubleLong"),
      body(2500, 3000, "long"),
      body(3000, 3500, "doubleLong"),
      body(3500, 4000, "long"),
    ];
    const good = session(notes);
    good.processBatch(2000, [down("A"), down("B")]);
    good.processBatch(2500, [up("A")]);
    good.processBatch(3000, [down("C")]);
    good.processBatch(3500, [up("C")]);
    good.processBatch(4000, [up("B")]);
    expect(good.finalize()).toMatchObject({ judgmentCounts: { perfect: 5, miss: 0 }, isFullCombo: true, achievementRate: 100 });

    const bad = session(notes);
    bad.processBatch(2000, [down("A"), down("B")]);
    const badState = bad.finalize();
    expect(badState.judgmentCounts.miss).toBeGreaterThan(0);
    expect(badState.isFullCombo).toBe(false);
    expect(badState).toMatchObject({ judgmentCounts: { perfect: 2 }, achievementRate: 40, processedNotes: 5, finalDenominatorWeight: 15 });
    const scoredEvents = bad.events.filter(event => event.itemId !== undefined);
    expect(new Set(scoredEvents.map(event => event.itemId)).size).toBe(scoredEvents.length);
    expect(scoredEvents.filter(event => event.itemId === 'n3:release:0')).toHaveLength(1);
  });

  it("NJ-S01: 연결 바디 Miss 뒤에도 core 이벤트와 score effects가 중복 없이 기록된다", () => {
    const s = session([point(0), body(0, 1000), point(1000), body(1000, 2000)]);
    s.processBatch(0, [down("A")]);
    s.processBatch(500, [up("A")]);
    s.processBatch(1000, [down("B")]);
    s.processBatch(2000, [up("B")]);
    const first = s.finalize();
    const length = s.events.length;
    expect(first).toMatchObject({ earnedScore: 9, finalDenominatorWeight: 9, isFullCombo: false });
    expect(s.finalize()).toEqual(first);
    expect(s.events).toHaveLength(length);
  });

  it("NJ-S02: head Miss의 dependentZero는 Miss 통계 없이 item만 정산하고 종료 sweep은 멱등이다", () => {
    const s = session([point(1000), body(1000, 2000)]);
    s.advance(1121);
    expect(s.events.filter((event) => event.kind === "dependentZero")).toHaveLength(1);
    const before = s.events.length;
    const first = s.finalize();
    expect(s.events).toHaveLength(before);
    expect(first).toMatchObject({ earnedScore: 0, finalDenominatorWeight: 6, processedNotes: 2 });
    expect(s.finalize()).toEqual(first);
  });

  it("동일 timestamp 입력 배열의 up/down 순서를 session이 바꾸지 않고 view callback이 현재 combo를 받는다", () => {
    const views: number[] = [];
    const starts = new Map([[0, 1000]]);
    const compiled = compileJudgmentChart([point(1000)], starts, new Map<number, number>());
    const s = new NoteJudgmentSession(compiled, { onBatchConfirmed: (view) => views.push(view.combo) });
    s.processBatch(1000, [up("A"), down("A")]);
    expect(s.events[0]?.inputAt).toBe(1000);
    expect(views).toEqual([1]);
  });

  it("새 session 인스턴스는 이전 core 권한·pending up·점수 상태를 공유하지 않는다", () => {
    const notes = [body(1000, 1100)];
    const first = session(notes);
    first.processBatch(1000, [down("A")]);
    first.processBatch(1050, [up("A")]);
    first.finalize();

    const second = session(notes);
    second.advance(1000);
    expect(second.events).toEqual([]);
    expect(second.score.getState().processedNotes).toBe(0);
    second.processBatch(1100, [up("A")]);
    expect(second.events).toEqual([]);
  });
});

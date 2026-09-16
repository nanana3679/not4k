import { describe, expect, it } from "vitest";
import { beat, type NoteEntity } from "../../shared";
import { InputTimeline } from "../input";
import { compileJudgmentChart, selectCompiledJudgmentChart } from "../judgment/compiledJudgmentChart";
import { NoteJudgmentSession } from "../judgment/NoteJudgmentSession";
import { drainPlaySessionInputs } from "./playSessionInput";

describe("PlayScreen session 입력·종료 seam", () => {
  it("같은 timestamp의 auto와 manual 입력을 한 batch로 합쳐 두 head를 실제 정산한다", () => {
    const notes: NoteEntity[] = [
      { type: "single", lane: 1, beat: beat(0) },
      { type: "single", lane: 2, beat: beat(0) },
    ];
    const chart = compileJudgmentChart(notes, new Map([[0, 1000], [1, 1000]]), new Map());
    const session = new NoteJudgmentSession(chart);
    const timeline = new InputTimeline();
    timeline.enqueue({ lane: 1, key: "auto-A", type: "down", inputAt: 1000 });
    timeline.enqueue({ lane: 2, key: "manual-B", type: "down", inputAt: 1000 });
    expect(drainPlaySessionInputs(timeline, session, 1000)).toBe(1);
    const state = session.finalize();
    expect(session.events).toHaveLength(2);
    expect(state.achievementRate).toBe(100);
    expect(state.isFullCombo).toBe(true);
    expect(state.finalDenominatorWeight).toBe(chart.theoreticalWeight);
  });

  it("selected chart는 cursor 이전 note를 분모와 종료 정산에서 제외한다", () => {
    const notes: NoteEntity[] = [
      { type: "single", lane: 1, beat: beat(0) },
      { type: "single", lane: 1, beat: beat(1) },
    ];
    const base = compileJudgmentChart(notes, new Map([[0, 500], [1, 1000]]), new Map());
    const chart = selectCompiledJudgmentChart(base, 1000);
    const session = new NoteJudgmentSession(chart);
    const timeline = new InputTimeline();
    timeline.enqueue({ lane: 1, key: "A", type: "down", inputAt: 1000 });
    drainPlaySessionInputs(timeline, session, 1000);
    const state = session.finalize();
    expect(chart.items.every((item) => item.noteIndex === 1)).toBe(true);
    expect(state.processedNotes).toBe(chart.theoreticalWeight / 3);
    expect(state.achievementRate).toBe(100);
    expect(state.judgmentCounts.miss).toBe(0);
  });

  it("한 frame의 같은 timestamp down/up과 song end 미래 입력을 drain한 뒤 zero-H를 100% finalize한다", () => {
    const notes: NoteEntity[] = [{ type: "long", lane: 1, beat: beat(0), endBeat: beat(0), holdOnly: true }];
    const chart = compileJudgmentChart(notes, new Map([[0, 1000]]), new Map([[0, 1000]]));
    const session = new NoteJudgmentSession(chart);
    const timeline = new InputTimeline();
    timeline.enqueue({ lane: 1, key: "A", type: "down", inputAt: 1000 });
    timeline.enqueue({ lane: 1, key: "A", type: "up", inputAt: 1000 });
    expect(drainPlaySessionInputs(timeline, session, 900, Number.POSITIVE_INFINITY)).toBe(1);
    const state = session.finalize();
    expect(state.achievementRate).toBe(100);
    expect(state.judgmentCounts.miss).toBe(0);
  });
});

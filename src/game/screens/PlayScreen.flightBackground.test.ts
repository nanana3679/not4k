import { describe, expect, it } from "vitest";
import { beat, type NoteEntity } from "../../shared";
import { compileJudgmentChart } from "../judgment/compiledJudgmentChart";
import { NoteJudgmentSession } from "../judgment/NoteJudgmentSession";
import { SessionRendererAdapter, type SessionRendererPort } from "../judgment/SessionRendererAdapter";

describe("PlayScreen perspective surface altitude", () => {
  it("Session 확정 효과는 실제 renderer port에 Perfect altitude를 전달함", () => {
    const notes: NoteEntity[] = [{ type: "single", lane: 1, beat: beat(0) }];
    const chart = compileJudgmentChart(notes, new Map([[0, 1000]]), new Map());
    let altitude = 0;
    const port: SessionRendererPort = {
      showJudgment: () => undefined,
      recordFlightJudgment: () => { altitude++; },
      showBombEffect: () => undefined,
      updateCombo: () => undefined,
      updateAccuracy: () => undefined,
      applyNoteDisplayEffect: () => undefined,
      setJudgmentBodyStateQuery: () => undefined,
    };
    const session = new NoteJudgmentSession(chart, { onBatchConfirmed: view => adapter.apply(view) });
    const adapter = new SessionRendererAdapter({ notes, connections: [], bodyStates: () => session.bodyStates, scoreAccuracy: () => session.score.getState().achievementRate, port });
    session.processBatch(1000, [{ key: "A", lane: 1, type: "down" }]);
    expect(altitude).toBe(1);
  });
});

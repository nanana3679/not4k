import { describe, expect, it } from "vitest";
import { InputTimeline } from "../input/InputTimeline";
import { AutoPlayer } from "../input/AutoPlayer";
import { GameClock } from "../time/GameClock";
import { NoteJudgmentSession } from "../judgment/NoteJudgmentSession";
import { body, point } from "../judgment/noteJudgmentTestHarness";
import { compileJudgmentChart } from "../judgment/compiledJudgmentChart";
import type { NoteEntity } from "../../shared/types";
import { stepPlaySession } from "./playSessionInput";

function play(notes: readonly NoteEntity[], offset = 0, auto = false) {
  const starts = new Map(notes.map((note, i) => [i, note.beat.n / note.beat.d]));
  const ends = new Map(notes.flatMap((note, i) => "endBeat" in note ? [[i, note.endBeat.n / note.endBeat.d] as const] : []));
  const compiled = compileJudgmentChart(notes, starts, ends);
  const session = new NoteJudgmentSession(compiled);
  const timeline = new InputTimeline();
  const audio = { currentTimeMs: 0, getOutputLatencyMs: () => 15 };
  const clock = new GameClock(audio, { audioOffsetMs: 0, judgmentOffsetMs: offset }, () => audio.currentTimeMs);
  const player = new AutoPlayer(notes, starts, ends, auto ? [{ startMs: 0, endMs: 5000 }] : [], compiled);
  return {
    session, timeline, clock,
    input(observed: number, eventTime: number, key = "A", type: "down" | "up" = "down") {
      audio.currentTimeMs = observed;
      timeline.enqueue({ inputAt: clock.toInputTimeMs(eventTime), lane: 1, key, type });
    },
    frame(at: number) {
      audio.currentTimeMs = at;
      stepPlaySession(timeline, session, player, clock, at);
    },
  };
}

describe("실제 GameClock·입력 큐·Session 통합", () => {
  it("자동 구간 없이 입력 offset -100ms이면 다른 레인의 1150ms 끝점이 raw1050ms의 유효한 수동 입력을 Miss로 앞당기지 않는다", () => {
    const p = play([body(500, 1150, "long", false, 2), point(1000)], -100);
    p.frame(900);
    p.frame(1150);
    p.input(1150, 1150);
    p.frame(1150);
    expect(p.session.events.filter(event => event.noteIndex === 1)).toMatchObject([
      { kind: "head", grade: "great", deltaMs: 50, inputAt: 1050 },
    ]);
  });

  it("o-o-에서 A2000 down·B2500 down/2520 up·A3000 up을 실제 시계 순서로 전달하면 Perfect 3·Miss 0", () => {
    const p = play([point(2000), body(2000, 2500), point(2500), body(2500, 3000)]);
    for (const [at, key, type] of [[2000, "A", "down"], [2500, "B", "down"], [2520, "B", "up"], [3000, "A", "up"]] as const) {
      p.input(at, at, key, type);
      p.frame(at);
    }
    expect(p.session.finalize()).toMatchObject({ judgmentCounts: { perfect: 3, miss: 0 }, achievementRate: 100, isFullCombo: true });
  });

  it.each([-100, 100])("입력 offset %ims에서도 1000ms Point의 raw 1120ms 입력은 Good 경계까지 허용", offset => {
    const p = play([point(1000)], offset);
    const physicalTime = 1120 - offset;
    p.frame(physicalTime - 1);
    expect(p.session.events).toHaveLength(0);
    p.input(physicalTime, physicalTime);
    p.frame(physicalTime);
    expect(p.session.events).toMatchObject([{ kind: "head", grade: "good", deltaMs: 120, inputAt: 1120 }]);
    expect(p.clock.judgmentTimeMs()).toBe(physicalTime);
    expect(p.clock.visualTimeMs()).toBe(physicalTime + 15);
  });

  it("frame이 1400ms까지 늦어져도 큐의 down1000/up1100을 기한보다 먼저 원래 시각으로 처리", () => {
    const p = play([point(1000), body(1000, 1100)]);
    p.frame(900);
    p.input(1000, 1000); p.input(1100, 1100, "A", "up");
    p.frame(1400);
    expect(p.session.events.map(event => [event.kind, event.grade, event.inputAt])).toEqual([
      ["head", "perfect", 1000], ["release", "perfect", 1100],
    ]);
  });

  it("core가 1080ms까지 진행한 뒤 도착한 event timestamp1000은 raw Perfect를 유지하고 관측1080에 확정", () => {
    const p = play([point(1000)]);
    p.frame(1080);
    p.input(1080, 1000); p.frame(1080);
    expect(p.session.events).toMatchObject([{ grade: "perfect", deltaMs: 0, inputAt: 1000, confirmedAt: 1080 }]);
  });

  it("1000ms Point가 1121ms에 Miss 확정된 후 늦은 timestamp1000을 전달해도 다시 정산하지 않음", () => {
    const p = play([point(1000)]);
    p.frame(1121);
    p.input(1130, 1000); p.frame(1130);
    expect(p.session.events).toHaveLength(1);
    expect(p.session.events[0].grade).toBe("miss");
  });

  it("+200ms 입력 offset으로 manual이 raw1200까지 진행해도 raw1050 auto Point를 먼저 Perfect 처리", () => {
    const p = play([point(1050, "single", 2)], 200, true);
    p.frame(900);
    p.input(1000, 1000);
    p.frame(1000);
    expect(p.session.events).toMatchObject([{ kind: "head", grade: "perfect", inputAt: 1050 }]);
    expect(() => p.frame(1010)).not.toThrow();
    expect(p.session.events).toHaveLength(1);
  });
});

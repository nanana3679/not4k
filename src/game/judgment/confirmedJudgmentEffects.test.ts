import { describe, expect, it } from "vitest";
import { beat } from "../../shared";
import { decideConfirmedJudgmentEffects } from "./confirmedJudgmentEffects";
import type { NoteJudgmentEvent } from "./NoteJudgmentCore";
import type { NoteEntity } from "../../shared";

const single: NoteEntity = { type: "single", lane: 1, beat: beat(0) };
const long: NoteEntity = { type: "long", lane: 1, beat: beat(0), endBeat: beat(4) };
const grace: NoteEntity = { type: "single", lane: 1, beat: beat(0), grace: true };
function event(overrides: Partial<NoteJudgmentEvent>): NoteJudgmentEvent {
  return { kind: "head", noteIndex: 0, itemId: "n0:head", grade: "perfect", deltaMs: 0, inputAt: 0, confirmedAt: 0, consumed: true, ...overrides };
}

describe("decideConfirmedJudgmentEffects", () => {
  it("head는 score item 정산과 판정·altitude·bomb 효과를 함께 결정한다", () => {
    expect(decideConfirmedJudgmentEffects(event({ grade: "great", deltaMs: 12 }), single)).toEqual({
      noteIndex: 0, unitIndex: undefined,
      scoreAction: { type: "settleItem", itemId: "n0:head", grade: "great", deltaMs: 12 },
      display: { judgment: { grade: "great", deltaMs: 12 }, altitude: { grade: "great" }, bombLane: 1 },
      body: "unchanged",
    });
  });

  it("release는 raw deltaMs를 score와 표시 모두에 보존하고 성공 body 전체를 processed로 확정하지 않는다", () => {
    const result = decideConfirmedJudgmentEffects(event({ kind: "release", itemId: "n1:release:0", noteIndex: 1, grade: "good", deltaMs: -70, unitIndex: 0 }), long);
    expect(result.scoreAction).toEqual({ type: "settleItem", itemId: "n1:release:0", grade: "good", deltaMs: -70 });
    expect(result.display.judgment).toEqual({ grade: "good", deltaMs: -70 });
    expect(result.body).toBe("unchanged");
  });

  it("holdOnly와 Grace는 score 정산은 하되 timing 표시와 FAST/SLOW 입력을 생략한다", () => {
    const hold = decideConfirmedJudgmentEffects(event({ kind: "holdOnly", itemId: "n1:holdOnly:0", noteIndex: 1, deltaMs: 0, consumed: false }), long);
    const gr = decideConfirmedJudgmentEffects(event({ itemId: "n0:head", grade: "perfect", deltaMs: 31 }), grace);
    expect(hold.scoreAction).toEqual({ type: "settleItem", itemId: "n1:holdOnly:0", grade: "perfect" });
    expect(hold.display.judgment).toEqual({ grade: "perfect" });
    expect(gr.scoreAction).toEqual({ type: "settleItem", itemId: "n0:head", grade: "perfect" });
    expect(gr.display.judgment).toEqual({ grade: "perfect" });
  });

  it("dependentZero는 score만 정산하고 판정·altitude·bomb를 발생시키지 않는다", () => {
    const result = decideConfirmedJudgmentEffects(event({ kind: "dependentZero", itemId: "n1:release:0", grade: "miss" }), long);
    expect(result.scoreAction).toEqual({ type: "dependentZero", itemId: "n1:release:0" });
    expect(result.display).toEqual({ judgment: null, altitude: null, bombLane: null });
  });

  it("maintenanceMiss는 score unscoredMiss와 Miss 효과를 한 번만 결정한다", () => {
    const result = decideConfirmedJudgmentEffects(event({ kind: "maintenanceMiss", itemId: undefined, grade: "miss", deltaMs: 120 }), long);
    expect(result.scoreAction).toEqual({ type: "unscoredMiss" });
    expect(result.display).toEqual({ judgment: { grade: "miss" }, altitude: { grade: "miss" }, bombLane: null });
    expect(result.body).toBe("failed");
  });

  it("partial body 실패도 성공 unit 전체를 처리됨으로 덮어쓰지 않고 실패 효과만 반환한다", () => {
    const result = decideConfirmedJudgmentEffects(event({ kind: "maintenanceMiss", noteIndex: 2, unitIndex: 1, grade: "miss", bodyState: "failed" }), { ...long, type: "doubleLong" });
    expect(result.body).toBe("failed");
    expect(result.noteIndex).toBe(2);
    expect(result.unitIndex).toBe(1);
  });
});

import { describe, expect, it } from "vitest";
import { JUDGMENT_WINDOWS_EASY } from "../../shared/constants";
import { compileJudgmentChart } from "./compiledJudgmentChart";
import { PointJudgmentState } from "./PointJudgmentState";
import { body, point } from "./noteJudgmentTestHarness";
import type { NoteEntity } from "../../shared/types";

const compiled = (...notes: NoteEntity[]) => compileJudgmentChart(notes, notes.map(n => n.beat.n), new Map<number, number>(notes.flatMap((n, i) => "endBeat" in n ? [[i, n.endBeat.n] as [number, number]] : [])));

describe("PointJudgmentState", () => {
  it("±41/82/120ms 경계에서 Perfect/Great/Good을 판정하고 raw delta를 보존", () => {
    const state = new PointJudgmentState(compiled(point(1000)));
    expect(state.consume(state.peek(1, "A", 959)!, "A", 959)).toMatchObject({ grade: "perfect", deltaMs: -41 });
    const other = new PointJudgmentState(compiled(point(1000)));
    expect(other.consume(other.peek(1, "A", 1082)!, "A", 1082)).toMatchObject({ grade: "great", deltaMs: 82 });
    const third = new PointJudgmentState(compiled(point(1000)));
    expect(third.consume(third.peek(1, "A", 1120)!, "A", 1120)).toMatchObject({ grade: "good", deltaMs: 120 });
  });

  it("Easy windows 50/100/150ms를 사용해 Good 경계까지 허용", () => {
    const state = new PointJudgmentState(compiled(point(1000)), JUDGMENT_WINDOWS_EASY);
    expect(state.consume(state.peek(1, "A", 850)!, "A", 850).grade).toBe("good");
  });

  it("double에서 이미 사용한 물리 키를 제외하고 다른 head를 가장 먼저 탐색", () => {
    const state = new PointJudgmentState(compiled(point(1000, "double")));
    const first = state.peek(1, "A", 1000)!; state.consume(first, "A", 1000);
    const second = state.peek(1, "A", 1000); expect(second).toBeUndefined();
    const other = state.peek(1, "B", 1000)!; expect(other.unitIndex).not.toBe(first.unitIndex);
    state.consume(other, "B", 1000); expect(state.usedKeys(0)).toEqual(["A", "B"]);
  });

  it("두 성공 키를 등록하고 같은 head의 early/late 입력은 동일 item id를 재사용하지 않음", () => {
    const state = new PointJudgmentState(compiled(point(1000, "double")));
    const a = state.consume(state.peek(1, "A", 959)!, "A", 959);
    const b = state.consume(state.peek(1, "B", 1082)!, "B", 1082);
    expect(a.itemId).not.toBe(b.itemId); expect(state.isComplete(0)).toBe(true); expect(state.remaining(0)).toBe(0);
  });

  it("Grace Point는 Good 창 안의 120ms 입력도 Perfect이고 Bad 통계를 만들지 않음", () => {
    const state = new PointJudgmentState(compiled({ ...point(1000), grace: true }));
    const result = state.consume(state.peek(1, "A", 1120)!, "A", 1120);
    expect(result).toMatchObject({ grade: "perfect", deltaMs: 120 });
  });

  it("빈 point-only chart에서 Good 기한을 엄격히 지난 미충족 slot만 한 번 Miss로 만료", () => {
    const state = new PointJudgmentState(compiled(point(1000)));
    expect(state.expireBefore(1120)).toHaveLength(0);
    const missed = state.expireBefore(1121);
    expect(missed).toHaveLength(1); expect(missed[0]).toMatchObject({ grade: "miss", deltaMs: 120, confirmedAt: 1120, consumed: false, phase: "deadline" });
    expect(state.expireBefore(2000)).toHaveLength(0); expect(state.isComplete(0)).toBe(true);
  });

  it("trill zone에서 같은 키는 goodTrill이고 다른 키의 최고 타이밍 head 하나만 교대 성공", () => {
    const c = compiled(point(1000), point(1080));
    const state = new PointJudgmentState(c, undefined, new Map([[0, 0], [1, 0]]));
    const first = state.consume(state.peek(1, "A", 1080)!, "A", 1080);
    const second = state.consume(state.peek(1, "B", 1080)!, "B", 1080);
    expect(state.finalizeBatch([first, second]).map(e => e.grade)).toEqual(["goodTrill", "perfect"]);
    const sameZone = new PointJudgmentState(compiled(point(1000), point(1080)), undefined, new Map([[0, 0], [1, 0]]));
    const firstZone = sameZone.consume(sameZone.peek(1, "A", 1000)!, "A", 1000);
    sameZone.finalizeBatch([firstZone]);
    const same = sameZone.consume(sameZone.peek(1, "A", 1080)!, "A", 1080);
    expect(sameZone.finalizeBatch([same])[0].grade).toBe("goodTrill");
  });

  it("Grace가 교대에 실패하면 Perfect 대신 goodTrill로 표시하고 release 입력은 추적하지 않음", () => {
    const c = compiled({ ...point(1000), grace: true }, point(1000));
    const state = new PointJudgmentState(c, undefined, new Map([[0, 0], [1, 0]]));
    const first = state.consume(state.peek(1, "A", 1120)!, "A", 1120);
    const second = state.consume(state.peek(1, "B", 1120)!, "B", 1120);
    const release: never = { kind: "release", noteIndex: 99, grade: "perfect", deltaMs: 100, inputAt: 1120, confirmedAt: 1120, consumed: true } as never;
    const finalized = state.finalizeBatch([first, second, release]);
    expect(finalized.filter(e => e.kind === "head").map(e => e.grade)).toEqual(["perfect", "goodTrill"]);
    expect(finalized.find(e => e.kind === "release")?.grade).toBe("perfect");
  });

  it("trill zone별 교대 세트는 독립되고 head Miss는 해당 세트를 비움", () => {
    const c = compiled(point(1000), point(1000), point(2000), point(3000));
    const state = new PointJudgmentState(c, undefined, new Map([[0, 0], [1, 1], [2, 0], [3, 0]]));
    const a = state.consume(state.peek(1, "A", 1000)!, "A", 1000);
    const b = state.consume(state.peek(1, "B", 1000)!, "B", 1000);
    expect(state.finalizeBatch([a, b]).map(e => e.grade)).toEqual(["perfect", "perfect"]);
    const miss = state.expireBefore(2121);
    state.finalizeBatch(miss);
    const next = state.consume(state.peek(1, "A", 3000)!, "A", 3000);
    expect(state.finalizeBatch([next])[0].grade).toBe("perfect");
  });

  it("head가 붙은 body의 point slot만 만들고 body release는 생성하지 않음", () => {
    const result = compiled(point(0), body(0, 1000));
    const state = new PointJudgmentState(result);
    expect(state.peek(1, "A", 0)).toMatchObject({ noteIndex: 0, timeMs: 0 });
    expect(result.items.filter(item => item.kind === "head")).toHaveLength(1);
  });
});

import { describe, expect, it } from "vitest";
import { beat } from "../types/beat";
import type { DocumentNoteEntity } from "../types/chart";
import { deriveExplicitNoteRelations } from "./explicitNoteRelations";

const body = (start: number, end: number, holdCount: 1 | 2 = 1, lane = 1): DocumentNoteEntity =>
  ({ type: "body", lane, beat: beat(start), endBeat: beat(end), holdCount });
const tick = (at: number, count: 1 | 2 = 1, lane = 1): DocumentNoteEntity =>
  ({ type: "tick", lane, beat: beat(at), count });

describe("명시 노트의 정적 위치 관계", () => {
  it("1→2의 공유 경계 2/1=8/4 틱 노트는 뒤 바디에만, 릴리즈는 앞 바디에 귀속된다", () => {
    const notes: DocumentNoteEntity[] = [body(0, 2), body(2, 4, 2),
      { type: "tick", lane: 1, beat: { n: 8, d: 4 }, count: 2 },
      { type: "release", lane: 1, beat: beat(2), count: 1 }];
    const r = deriveExplicitNoteRelations(notes);
    expect(r.tickBodyByNote.get(2)).toBe(1);
    expect(r.releaseBodyByNote.get(3)).toBe(0);
    expect(r.bodyByNote.get(0)?.tickIndices).toEqual([]);
    expect(r.bodyByNote.get(1)?.tickIndices).toEqual([2]);
    expect(r.connections).toEqual([{ predecessorIndex: 0, successorIndex: 1, lane: 1,
      beat: beat(2), predecessorHoldCount: 1, successorHoldCount: 2 }]);
  });

  it("독립 바디의 시작0·내부1·끝2와 길이0 바디의4는 모두 해당 바디에 속한다", () => {
    const r = deriveExplicitNoteRelations([body(0, 2), tick(0), tick(1), tick(2), body(4, 4), tick(4)]);
    expect([...r.tickBodyByNote]).toEqual([[1, 0], [2, 0], [3, 0], [5, 4]]);
  });

  it("다른 레인의 같은 박과 구형 long은 explicit 틱 노트의 소속 바디가 되지 않는다", () => {
    const r = deriveExplicitNoteRelations([body(0, 2, 1, 2),
      { type: "long", lane: 1, beat: beat(0), endBeat: beat(2) }, tick(1)]);
    expect(r.tickBodyCandidatesByNote.get(2)).toEqual([]);
    expect(r.tickBodyByNote.has(2)).toBe(false);
  });

  it("겹친 두 바디 내부의 틱은 후보2개를 보존하고 임의 소속을 만들지 않는다", () => {
    const r = deriveExplicitNoteRelations([body(0, 3), body(1, 4), tick(2)]);
    expect(r.tickBodyCandidatesByNote.get(2)).toEqual([0, 1]);
    expect(r.tickBodyByNote.has(2)).toBe(false);
  });

  it("배열을 역순으로 바꿔도 앞뒤 바디와 시작 탭·내부 탭의 구분을 유지한다", () => {
    const notes: DocumentNoteEntity[] = [body(0, 2), body(2, 4),
      { type: "tap", kind: "single", lane: 1, beat: beat(2) },
      { type: "tap", kind: "single", lane: 1, beat: beat(3) }, tick(3)];
    const r = deriveExplicitNoteRelations([...notes].reverse());
    expect(r.connections.map(c => [c.predecessorIndex, c.successorIndex])).toEqual([[4, 3]]);
    expect(r.bodyByNote.get(3)?.startTapIndices).toEqual([2]);
    expect(r.bodyByNote.get(3)?.tickIndices).toEqual([0]);
    expect(r.bodyByNote.get(3)?.predecessorIndices).toEqual([4]);
  });
});

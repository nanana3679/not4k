import { describe, expect, it } from "vitest";
import { beat } from "../types/beat";
import type { DocumentNoteEntity } from "../types/chart";
import { deriveExplicitNoteRelations } from "./explicitNoteRelations";

const body = (start: number, end: number, holdCount: 1 | 2 = 1, lane = 1): DocumentNoteEntity =>
  ({ type: "body", lane, beat: beat(start), endBeat: beat(end), holdCount });
const sustain = (at: number, count: 1 | 2 = 1, lane = 1): DocumentNoteEntity =>
  ({ type: "sustain", lane, beat: beat(at), count });

describe("명시 노트의 정적 위치 관계", () => {
  it("1→2의 공유 경계 2/1=8/4 표식은 뒤 바디에만, 릴리즈는 앞 바디에 귀속된다", () => {
    const notes: DocumentNoteEntity[] = [body(0, 2), body(2, 4, 2),
      { type: "sustain", lane: 1, beat: { n: 8, d: 4 }, count: 2 },
      { type: "release", lane: 1, beat: beat(2), count: 1 }];
    const r = deriveExplicitNoteRelations(notes);
    expect(r.sustainBodyByNote.get(2)).toBe(1);
    expect(r.releaseBodyByNote.get(3)).toBe(0);
    expect(r.bodyByNote.get(0)?.sustainIndices).toEqual([]);
    expect(r.bodyByNote.get(1)?.sustainIndices).toEqual([2]);
    expect(r.connections).toEqual([{ predecessorIndex: 0, successorIndex: 1, lane: 1,
      beat: beat(2), predecessorHoldCount: 1, successorHoldCount: 2 }]);
  });

  it("독립 바디의 시작0·내부1·끝2와 길이0 바디의4는 모두 해당 바디에 속한다", () => {
    const r = deriveExplicitNoteRelations([body(0, 2), sustain(0), sustain(1), sustain(2), body(4, 4), sustain(4)]);
    expect([...r.sustainBodyByNote]).toEqual([[1, 0], [2, 0], [3, 0], [5, 4]]);
  });

  it("다른 레인의 같은 박과 구형 long은 explicit 유지 표식의 소속 바디가 되지 않는다", () => {
    const r = deriveExplicitNoteRelations([body(0, 2, 1, 2),
      { type: "long", lane: 1, beat: beat(0), endBeat: beat(2) }, sustain(1)]);
    expect(r.sustainBodyCandidatesByNote.get(2)).toEqual([]);
    expect(r.sustainBodyByNote.has(2)).toBe(false);
  });

  it("겹친 두 바디 내부의 표식은 후보2개를 보존하고 임의 소속을 만들지 않는다", () => {
    const r = deriveExplicitNoteRelations([body(0, 3), body(1, 4), sustain(2)]);
    expect(r.sustainBodyCandidatesByNote.get(2)).toEqual([0, 1]);
    expect(r.sustainBodyByNote.has(2)).toBe(false);
  });

  it("배열을 역순으로 바꿔도 앞뒤 바디와 시작 Point·내부 Point의 구분을 유지한다", () => {
    const notes: DocumentNoteEntity[] = [body(0, 2), body(2, 4),
      { type: "point", kind: "single", lane: 1, beat: beat(2) },
      { type: "point", kind: "single", lane: 1, beat: beat(3) }, sustain(3)];
    const r = deriveExplicitNoteRelations([...notes].reverse());
    expect(r.connections.map(c => [c.predecessorIndex, c.successorIndex])).toEqual([[4, 3]]);
    expect(r.bodyByNote.get(3)?.startPointIndices).toEqual([2]);
    expect(r.bodyByNote.get(3)?.sustainIndices).toEqual([0]);
    expect(r.bodyByNote.get(3)?.predecessorIndices).toEqual([4]);
  });
});

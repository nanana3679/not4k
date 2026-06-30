import { describe, it, expect } from "vitest";
import { computeConnectedLongNotePredecessors } from "./longNoteConnection";
import { beat } from "../../shared";
import type { NoteEntity } from "../../shared";

/** 테스트용 롱노트 생성 (beat 값은 연결 계산에 쓰이지 않음 — 시간은 맵으로 전달) */
function longNote(lane: 1 | 2 | 3 | 4): NoteEntity {
  return { type: "long", lane, beat: beat(0), endBeat: beat(1) };
}

function pointNote(lane: 1 | 2 | 3 | 4): NoteEntity {
  return { type: "single", lane, beat: beat(0) };
}

describe("computeConnectedLongNotePredecessors", () => {
  it("o-o- (같은 레인 끝=다음 시작) 두 번째 롱노트의 선행으로 첫 번째가 잡힌다", () => {
    const notes = [longNote(1), longNote(1)];
    const start = new Map([[0, 0], [1, 500]]);
    const end = new Map([[0, 500], [1, 1000]]);
    const result = computeConnectedLongNotePredecessors(notes, start, end);
    expect(result.get(1)).toBe(0);
  });

  it("o- o- (500ms 간격) 두 번째 롱노트는 선행이 없다", () => {
    const notes = [longNote(1), longNote(1)];
    const start = new Map([[0, 0], [1, 1000]]); // 첫 끝 500, 둘째 시작 1000 → 500ms 간격
    const end = new Map([[0, 500], [1, 1500]]);
    const result = computeConnectedLongNotePredecessors(notes, start, end);
    expect(result.has(1)).toBe(false);
  });

  it("끝-시작 차이가 정확히 10ms면 이어진 것으로 본다", () => {
    const notes = [longNote(1), longNote(1)];
    const start = new Map([[0, 0], [1, 510]]);
    const end = new Map([[0, 500], [1, 1010]]);
    const result = computeConnectedLongNotePredecessors(notes, start, end);
    expect(result.get(1)).toBe(0);
  });

  it("끝-시작 차이가 11ms면 이어지지 않는다", () => {
    const notes = [longNote(1), longNote(1)];
    const start = new Map([[0, 0], [1, 511]]);
    const end = new Map([[0, 500], [1, 1011]]);
    const result = computeConnectedLongNotePredecessors(notes, start, end);
    expect(result.has(1)).toBe(false);
  });

  it("끝=시작이어도 레인이 다르면 이어지지 않는다", () => {
    const notes = [longNote(1), longNote(2)];
    const start = new Map([[0, 0], [1, 500]]);
    const end = new Map([[0, 500], [1, 1000]]);
    const result = computeConnectedLongNotePredecessors(notes, start, end);
    expect(result.has(1)).toBe(false);
  });

  it("선행이 포인트 노트면 이어지지 않는다 (롱노트만 선행 후보)", () => {
    const notes = [pointNote(1), longNote(1)];
    const start = new Map([[0, 0], [1, 500]]);
    const end = new Map([[1, 1000]]); // 포인트 노트는 끝 시간 없음
    const result = computeConnectedLongNotePredecessors(notes, start, end);
    expect(result.has(1)).toBe(false);
  });

  it("o-o-o- 3연쇄는 각 롱노트가 직전 롱노트를 선행으로 가진다", () => {
    const notes = [longNote(1), longNote(1), longNote(1)];
    const start = new Map([[0, 0], [1, 500], [2, 1000]]);
    const end = new Map([[0, 500], [1, 1000], [2, 1500]]);
    const result = computeConnectedLongNotePredecessors(notes, start, end);
    expect(result.get(1)).toBe(0);
    expect(result.get(2)).toBe(1);
    expect(result.has(0)).toBe(false);
  });

  it("배열 순서가 시간 역순이어도 끝 시간 기준으로 선행을 찾는다", () => {
    // index 0 = 뒤 롱노트, index 1 = 앞 롱노트
    const notes = [longNote(1), longNote(1)];
    const start = new Map([[0, 500], [1, 0]]);
    const end = new Map([[0, 1000], [1, 500]]);
    const result = computeConnectedLongNotePredecessors(notes, start, end);
    expect(result.get(0)).toBe(1);
    expect(result.has(1)).toBe(false);
  });

  it("타입이 달라도 같은 레인에서 시간이 맞닿으면 이어진다 (long→doubleLong)", () => {
    const notes: NoteEntity[] = [
      { type: "long", lane: 1, beat: beat(0), endBeat: beat(1) },
      { type: "doubleLong", lane: 1, beat: beat(1), endBeat: beat(2) },
    ];
    const start = new Map([[0, 0], [1, 500]]);
    const end = new Map([[0, 500], [1, 1000]]);
    const result = computeConnectedLongNotePredecessors(notes, start, end);
    expect(result.get(1)).toBe(0);
  });
});

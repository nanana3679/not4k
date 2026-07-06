import { describe, it, expect } from "vitest";
import { beat } from "../../shared";
import type { NoteEntity, Lane } from "../../shared";
import { isCreatePlacementBlocked, type CreatePlacementQuery } from "./createPlacementGuard";

const point = (lane: Lane, n: number, d = 1): NoteEntity => ({
  type: "single",
  lane,
  beat: beat(n, d),
});

const long = (lane: Lane, headN: number, endN: number): NoteEntity => ({
  type: "long",
  lane,
  beat: beat(headN),
  endBeat: beat(endN),
});

const query = (over: Partial<CreatePlacementQuery> = {}): CreatePlacementQuery => ({
  inBounds: true,
  hitNote: null,
  lane: 1,
  beatFloatRaw: 0,
  notes: [],
  extraHit: null,
  ...over,
});

describe("isCreatePlacementBlocked", () => {
  it("시간 범위 밖이면 배치 차단", () => {
    expect(isCreatePlacementBlocked(query({ inBounds: false }))).toBe(true);
  });

  it("빈 곳(히트 없음)이면 배치 허용", () => {
    expect(isCreatePlacementBlocked(query())).toBe(false);
  });

  it("점노트를 히트하면 배치 차단", () => {
    expect(isCreatePlacementBlocked(query({ hitNote: point(1, 1) }))).toBe(true);
  });

  it("롱노트 body(1~3의 2박)를 히트하면 배치 차단", () => {
    expect(
      isCreatePlacementBlocked(query({ hitNote: long(1, 1, 3), beatFloatRaw: 2 })),
    ).toBe(true);
  });

  it("롱노트 범위 밖(region null)이면 배치 차단", () => {
    expect(
      isCreatePlacementBlocked(query({ hitNote: long(1, 1, 3), beatFloatRaw: 10 })),
    ).toBe(true);
  });

  it("롱노트를 히트했지만 레인이 null이면 배치 차단", () => {
    expect(
      isCreatePlacementBlocked(query({ hitNote: long(1, 1, 3), lane: null, beatFloatRaw: 1 })),
    ).toBe(true);
  });

  it("롱노트 head 캡이 비어 있으면 배치 허용", () => {
    expect(
      isCreatePlacementBlocked(query({ hitNote: long(1, 1, 3), beatFloatRaw: 1, notes: [] })),
    ).toBe(false);
  });

  it("롱노트 head 캡에 점노트가 이미 있으면 배치 차단", () => {
    expect(
      isCreatePlacementBlocked(
        query({ hitNote: long(1, 1, 3), beatFloatRaw: 1, notes: [point(1, 1)] }),
      ),
    ).toBe(true);
  });

  it("롱노트 end 캡이 비어 있으면 배치 허용", () => {
    expect(
      isCreatePlacementBlocked(query({ hitNote: long(1, 1, 3), beatFloatRaw: 3, notes: [] })),
    ).toBe(false);
  });

  it("엑스트라 노트를 히트하면 배치 차단", () => {
    expect(isCreatePlacementBlocked(query({ extraHit: 0 }))).toBe(true);
  });
});

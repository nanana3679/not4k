import { describe, it, expect } from "vitest";
import { beat } from "../../shared";
import type { NoteEntity, ExtraNoteEntity, Lane } from "../../shared";
import {
  captureMoveOrigins,
  buildMovedNotesGeneric,
  notesInBoundsByBeat,
  type LaneAxis,
} from "./moveKinematics";

const mainAxis: LaneAxis<NoteEntity> = {
  laneOf: (n) => n.lane,
  withLane: (n, l) => ({ ...n, lane: l as Lane }),
};
const extraAxis: LaneAxis<ExtraNoteEntity> = {
  laneOf: (n) => n.extraLane,
  withLane: (n, l) => ({ ...n, extraLane: l }),
};

const isRangeMain = (n: NoteEntity): boolean => "endBeat" in n;
const isRangeExtra = (n: ExtraNoteEntity): boolean => "endBeat" in n;

describe("captureMoveOrigins", () => {
  it("점노트는 beat와 lane만 기록하고 endBeat는 없음", () => {
    const notes: NoteEntity[] = [{ type: "single", lane: 2 as Lane, beat: beat(3, 4) }];
    const origins = captureMoveOrigins(notes, [0], (n) => n.lane);
    expect(origins.get(0)).toEqual({ beat: beat(3, 4), lane: 2 });
    expect(origins.get(0)).not.toHaveProperty("endBeat");
  });

  it("range노트는 beat·endBeat·lane을 모두 기록", () => {
    const notes: NoteEntity[] = [
      { type: "long", lane: 3 as Lane, beat: beat(1, 1), endBeat: beat(2, 1) },
    ];
    const origins = captureMoveOrigins(notes, [0], (n) => n.lane);
    expect(origins.get(0)).toEqual({ beat: beat(1, 1), endBeat: beat(2, 1), lane: 3 });
  });

  it("엑스트라 축은 extraLane 값을 중립 lane 필드에 기록", () => {
    const notes: ExtraNoteEntity[] = [{ type: "single", extraLane: 7, beat: beat(0) }];
    const origins = captureMoveOrigins(notes, [0], (n) => n.extraLane);
    expect(origins.get(0)).toEqual({ beat: beat(0), lane: 7 });
  });

  it("존재하지 않는 인덱스는 건너뛰어 기록되지 않음", () => {
    const notes: NoteEntity[] = [{ type: "single", lane: 1 as Lane, beat: beat(0) }];
    const origins = captureMoveOrigins(notes, [0, 5], (n) => n.lane);
    expect(origins.size).toBe(1);
    expect(origins.has(5)).toBe(false);
  });

  it("indices에 포함된 노트만 기록(선택 부분집합)", () => {
    const notes: NoteEntity[] = [
      { type: "single", lane: 1 as Lane, beat: beat(0) },
      { type: "single", lane: 2 as Lane, beat: beat(1) },
      { type: "single", lane: 3 as Lane, beat: beat(2) },
    ];
    const origins = captureMoveOrigins(notes, [0, 2], (n) => n.lane);
    expect([...origins.keys()].sort()).toEqual([0, 2]);
  });
});

describe("buildMovedNotesGeneric", () => {
  it("laneOffset은 축 좌표(lane)에 더해짐 — lane 1 + 2 = 3", () => {
    const notes: NoteEntity[] = [{ type: "single", lane: 1 as Lane, beat: beat(0) }];
    const origins = captureMoveOrigins(notes, [0], (n) => n.lane);
    const result = buildMovedNotesGeneric(notes, origins, 2, beat(0), mainAxis, isRangeMain);
    expect(result[0].lane).toBe(3);
  });

  it("beatOffset은 beat에 더해짐 — beat 0 + 1박 = beat(1)", () => {
    const notes: NoteEntity[] = [{ type: "single", lane: 1 as Lane, beat: beat(0) }];
    const origins = captureMoveOrigins(notes, [0], (n) => n.lane);
    const result = buildMovedNotesGeneric(notes, origins, 0, beat(1, 1), mainAxis, isRangeMain);
    expect(result[0].beat).toEqual(beat(1, 1));
  });

  it("range노트 이동 시 길이(endBeat-beat)를 보존 — [1,3] +2박 → [3,5]", () => {
    const notes: NoteEntity[] = [
      { type: "long", lane: 1 as Lane, beat: beat(1, 1), endBeat: beat(3, 1) },
    ];
    const origins = captureMoveOrigins(notes, [0], (n) => n.lane);
    const result = buildMovedNotesGeneric(notes, origins, 0, beat(2, 1), mainAxis, isRangeMain);
    const moved = result[0] as { beat: typeof notes[0]["beat"]; endBeat: typeof notes[0]["beat"] };
    expect(moved.beat).toEqual(beat(3, 1));
    expect(moved.endBeat).toEqual(beat(5, 1));
  });

  it("점노트 이동 결과에는 endBeat가 생기지 않음", () => {
    const notes: NoteEntity[] = [{ type: "single", lane: 1 as Lane, beat: beat(0) }];
    const origins = captureMoveOrigins(notes, [0], (n) => n.lane);
    const result = buildMovedNotesGeneric(notes, origins, 0, beat(1, 1), mainAxis, isRangeMain);
    expect(result[0]).not.toHaveProperty("endBeat");
  });

  it("엑스트라 축은 laneOffset을 extraLane에 적용 — extraLane 5 + 3 = 8", () => {
    const notes: ExtraNoteEntity[] = [{ type: "single", extraLane: 5, beat: beat(0) }];
    const origins = captureMoveOrigins(notes, [0], (n) => n.extraLane);
    const result = buildMovedNotesGeneric(notes, origins, 3, beat(0), extraAxis, isRangeExtra);
    expect(result[0].extraLane).toBe(8);
  });

  it("원본 배열은 변경되지 않고 복사본을 반환(불변)", () => {
    const notes: NoteEntity[] = [{ type: "single", lane: 1 as Lane, beat: beat(0) }];
    const origins = captureMoveOrigins(notes, [0], (n) => n.lane);
    const result = buildMovedNotesGeneric(notes, origins, 1, beat(1, 1), mainAxis, isRangeMain);
    expect(notes[0].lane).toBe(1);
    expect(notes[0].beat).toEqual(beat(0));
    expect(result).not.toBe(notes);
  });

  it("origins에 없는 인덱스의 노트는 그대로 유지", () => {
    const notes: NoteEntity[] = [
      { type: "single", lane: 1 as Lane, beat: beat(0) },
      { type: "single", lane: 2 as Lane, beat: beat(1) },
    ];
    const origins = captureMoveOrigins(notes, [0], (n) => n.lane);
    const result = buildMovedNotesGeneric(notes, origins, 1, beat(0), mainAxis, isRangeMain);
    expect(result[1]).toEqual(notes[1]);
  });

  it("type 등 다른 속성은 보존하면서 좌표만 갱신", () => {
    const notes: NoteEntity[] = [
      { type: "trillLong", lane: 2 as Lane, beat: beat(0), endBeat: beat(1, 1), holdOnly: true },
    ];
    const origins = captureMoveOrigins(notes, [0], (n) => n.lane);
    const result = buildMovedNotesGeneric(notes, origins, 1, beat(1, 1), mainAxis, isRangeMain);
    const moved = result[0] as { type: string; holdOnly?: boolean };
    expect(moved.type).toBe("trillLong");
    expect(moved.holdOnly).toBe(true);
  });
});

describe("notesInBoundsByBeat", () => {
  it("beat가 0에 정확히 걸치면 범위 안(경계 포함) → true", () => {
    const notes: NoteEntity[] = [{ type: "single", lane: 1 as Lane, beat: beat(0) }];
    expect(notesInBoundsByBeat(notes, [0], 10, isRangeMain)).toBe(true);
  });

  it("beat가 maxFloat에 정확히 걸치면 범위 안(경계 포함) → true", () => {
    const notes: NoteEntity[] = [{ type: "single", lane: 1 as Lane, beat: beat(10, 1) }];
    expect(notesInBoundsByBeat(notes, [0], 10, isRangeMain)).toBe(true);
  });

  it("beat가 0 미만이면 범위 밖 → false", () => {
    const notes: NoteEntity[] = [{ type: "single", lane: 1 as Lane, beat: beat(-1, 1) }];
    expect(notesInBoundsByBeat(notes, [0], 10, isRangeMain)).toBe(false);
  });

  it("beat가 maxFloat 초과면 범위 밖 → false", () => {
    const notes: NoteEntity[] = [{ type: "single", lane: 1 as Lane, beat: beat(11, 1) }];
    expect(notesInBoundsByBeat(notes, [0], 10, isRangeMain)).toBe(false);
  });

  it("range노트는 endBeat가 maxFloat 초과면 beat가 안이어도 → false", () => {
    const notes: NoteEntity[] = [
      { type: "long", lane: 1 as Lane, beat: beat(9, 1), endBeat: beat(11, 1) },
    ];
    expect(notesInBoundsByBeat(notes, [0], 10, isRangeMain)).toBe(false);
  });

  it("range노트 beat·endBeat 모두 범위 안이면 → true", () => {
    const notes: NoteEntity[] = [
      { type: "long", lane: 1 as Lane, beat: beat(1, 1), endBeat: beat(9, 1) },
    ];
    expect(notesInBoundsByBeat(notes, [0], 10, isRangeMain)).toBe(true);
  });

  it("빈 슬롯(존재하지 않는 인덱스)은 건너뛰어 검사에 영향 없음 → true", () => {
    const notes: ExtraNoteEntity[] = [{ type: "single", extraLane: 1, beat: beat(0) }];
    expect(notesInBoundsByBeat(notes, [0, 3], 10, isRangeExtra)).toBe(true);
  });

  it("여러 노트 중 하나라도 범위 밖이면 → false", () => {
    const notes: NoteEntity[] = [
      { type: "single", lane: 1 as Lane, beat: beat(1, 1) },
      { type: "single", lane: 2 as Lane, beat: beat(20, 1) },
    ];
    expect(notesInBoundsByBeat(notes, [0, 1], 10, isRangeMain)).toBe(false);
  });

  it("엑스트라 축도 beat만으로 범위 검사(레인 무관) → extraLane 큰 값이어도 beat 안이면 true", () => {
    const notes: ExtraNoteEntity[] = [{ type: "single", extraLane: 99, beat: beat(5, 1) }];
    expect(notesInBoundsByBeat(notes, [0], 10, isRangeExtra)).toBe(true);
  });
});

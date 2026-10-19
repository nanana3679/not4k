import { describe, it, expect } from "vitest";
import { hiddenViolationLaneMessages, hiddenViolationLanes } from "./unifiedNotes";
import { beat } from "../../shared";
import type { NoteEntity, TrillZone, ValidationError } from "../../shared";

describe("hiddenViolationLanes (§8-7 숨은 보조 위반 안내)", () => {
  const err = (indices: number[]): ValidationError => ({
    rule: "duplicate",
    message: "dup",
    refs: indices.map((index) => ({ kind: "note" as const, index })),
  });

  it("extraLaneCount 1에서 lane 6(보조 2) 위반 노트 → [6] (숨은 레인)", () => {
    const notes: NoteEntity[] = [
      { type: "single", lane: 6, beat: beat(0) },
      { type: "single", lane: 6, beat: beat(0) },
    ];
    expect(hiddenViolationLanes([err([0, 1])], notes, 1)).toEqual([6]);
  });

  it("extraLaneCount 2에서 lane 6 위반은 보이는 레인 — 빈 목록", () => {
    const notes: NoteEntity[] = [
      { type: "single", lane: 6, beat: beat(0) },
      { type: "single", lane: 6, beat: beat(0) },
    ];
    expect(hiddenViolationLanes([err([0, 1])], notes, 2)).toEqual([]);
  });

  it("메인 레인 위반은 extraLaneCount 0이어도 항상 보임 — 빈 목록", () => {
    const notes: NoteEntity[] = [
      { type: "single", lane: 2, beat: beat(0) },
      { type: "single", lane: 2, beat: beat(0) },
    ];
    expect(hiddenViolationLanes([err([0, 1])], notes, 0)).toEqual([]);
  });

  it("숨은 레인 6·8이 섞이면 오름차순 [6, 8], 중복 제거", () => {
    const notes: NoteEntity[] = [
      { type: "single", lane: 8, beat: beat(0) },
      { type: "single", lane: 8, beat: beat(0) },
      { type: "single", lane: 6, beat: beat(1) },
      { type: "single", lane: 6, beat: beat(1) },
    ];
    expect(hiddenViolationLanes([err([0, 1]), err([2, 3])], notes, 1)).toEqual([6, 8]);
  });

  it("refs 없는 위반은 무시", () => {
    const notes: NoteEntity[] = [{ type: "single", lane: 7, beat: beat(0) }];
    expect(hiddenViolationLanes([{ rule: "duplicate", message: "no refs" }], notes, 0)).toEqual([]);
  });

  it("malformed lane(0·-1·2.5) 위반 ref는 숨은 보조 레인이 아니라 제외된다 (음수 필요 레인 수 방지)", () => {
    const notes: NoteEntity[] = [
      { type: "single", lane: 0, beat: beat(0) },
      { type: "single", lane: -1, beat: beat(0) },
      { type: "single", lane: 2.5, beat: beat(0) },
    ];
    expect(hiddenViolationLanes([err([0, 1, 2])], notes, 0)).toEqual([]);
  });

  // 보조 레인 trillZone(trillZoneMainOnly, #102)도 숨은 레인에 있으면 저장 차단 안내에 들어가야 한다
  const zoneErr: ValidationError = {
    rule: "trillZoneMainOnly",
    message: "aux zone",
    refs: [{ kind: "trillZone", index: 0 }],
  };
  const lane15Zone = [{ lane: 15, beat: beat(0), endBeat: beat(4) }] as unknown as TrillZone[];

  it("extraLaneCount 2에서 lane 15 trillZone 위반 ref → [15] (숨은 존 레인도 안내)", () => {
    expect(hiddenViolationLanes([zoneErr], [], 2, lane15Zone)).toEqual([15]);
  });

  it("extraLaneCount 11이면 lane 15 trillZone은 보이는 레인 — 빈 목록", () => {
    expect(hiddenViolationLanes([zoneErr], [], 11, lane15Zone)).toEqual([]);
  });

  it("숨은 노트 lane 8과 숨은 trillZone lane 15가 섞이면 오름차순 [8, 15]", () => {
    const notes: NoteEntity[] = [
      { type: "single", lane: 8, beat: beat(0) },
      { type: "single", lane: 8, beat: beat(0) },
    ];
    expect(hiddenViolationLanes([err([0, 1]), zoneErr], notes, 2, lane15Zone)).toEqual([8, 15]);
  });
});

// 저장 차단 모달의 숨은 보조 레인 안내 — 툴바(보조 레인 수 최대 10)로 드러낼 수 있는 레인과 없는 레인을 나눈다
describe("hiddenViolationLaneMessages (저장 차단 모달 안내 문구)", () => {
  it("숨은 레인이 없으면 안내 0줄(빈 배열)", () => {
    expect(hiddenViolationLaneMessages([])).toEqual([]);
  });

  it("숨은 레인 6·8(보조 2·4)만 있으면 안내 1줄 — 보조 레인 수를 4 이상으로 늘리면 보인다", () => {
    expect(hiddenViolationLaneMessages([6, 8])).toEqual([
      "숨은 보조 레인(2, 4)의 위반이 포함되어 있습니다 — 보조 레인 수를 4 이상으로 늘리면 보입니다.",
    ]);
  });

  it("상한 경계 lane 14(보조 10)는 툴바로 드러낼 수 있어 '10 이상으로 늘리면 보입니다' 안내", () => {
    expect(hiddenViolationLaneMessages([14])).toEqual([
      "숨은 보조 레인(10)의 위반이 포함되어 있습니다 — 보조 레인 수를 10 이상으로 늘리면 보입니다.",
    ]);
  });

  it("상한 너머 lane 15·100000(보조 11·99996)만 있으면 안내 1줄 — 늘리라는 안내 없이 차트 파일을 직접 고치라고 알린다", () => {
    expect(hiddenViolationLaneMessages([15, 100000])).toEqual([
      "보조 레인 수 상한(10)을 넘는 보조 레인(11, 99996)의 위반이 포함되어 있습니다 — 에디터에서는 보이게 할 수 없으니 차트 파일을 직접 고쳐야 합니다.",
    ]);
  });

  it("숨은 레인 6과 상한 너머 lane 15가 섞이면 안내 2줄 — 늘리기 안내(보조 2) 다음에 파일 수정 안내(보조 11)", () => {
    expect(hiddenViolationLaneMessages([6, 15])).toEqual([
      "숨은 보조 레인(2)의 위반이 포함되어 있습니다 — 보조 레인 수를 2 이상으로 늘리면 보입니다.",
      "보조 레인 수 상한(10)을 넘는 보조 레인(11)의 위반이 포함되어 있습니다 — 에디터에서는 보이게 할 수 없으니 차트 파일을 직접 고쳐야 합니다.",
    ]);
  });
});

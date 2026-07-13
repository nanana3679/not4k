import { describe, it, expect } from "vitest";
import {
  trillZoneOverlapsNote,
  trillZoneOverlapsBox,
  getSelectedTrillZoneIndices,
  translateTrillZone,
  trillZoneIndexOfNote,
  noteSelectionKind,
  classifySelection,
  canAddNoteToSelection,
  selectionBlockReason,
  filterHomogeneousSelection,
  clampTrillBeatOffset,
  boxAnchorKind,
  selectionFromBox,
} from "./trillZoneSelection";
import { beat, beatToFloat } from "../../shared";
import type { NoteEntity, TrillZone } from "../../shared";

// ---------------------------------------------------------------------------
// trillZoneOverlapsNote
// ---------------------------------------------------------------------------

describe("trillZoneOverlapsNote", () => {
  const zone: TrillZone = { lane: 1, beat: beat(2), endBeat: beat(4) };

  it("같은 레인에서 포인트 노트 beat가 구간 안이면 겹침", () => {
    expect(trillZoneOverlapsNote(zone, { type: "single", lane: 1, beat: beat(3) })).toBe(true);
  });

  it("같은 레인에서 구간 경계(beat=2, endBeat=4)도 겹침으로 본다", () => {
    expect(trillZoneOverlapsNote(zone, { type: "single", lane: 1, beat: beat(2) })).toBe(true);
    expect(trillZoneOverlapsNote(zone, { type: "single", lane: 1, beat: beat(4) })).toBe(true);
  });

  it("같은 레인이라도 구간 밖이면 겹치지 않음", () => {
    expect(trillZoneOverlapsNote(zone, { type: "single", lane: 1, beat: beat(5) })).toBe(false);
  });

  it("다른 레인이면 겹치지 않음", () => {
    expect(trillZoneOverlapsNote(zone, { type: "single", lane: 2, beat: beat(3) })).toBe(false);
  });

  it("롱노트는 구간과 부분만 겹쳐도 겹침으로 본다", () => {
    // 롱노트 1~3 → 구간 2~4와 겹침
    expect(trillZoneOverlapsNote(zone, { type: "long", lane: 1, beat: beat(1), endBeat: beat(3) })).toBe(true);
  });

  it("롱노트가 구간을 완전히 벗어나면 겹치지 않음", () => {
    // 롱노트 5~6 → 구간 2~4 밖
    expect(trillZoneOverlapsNote(zone, { type: "long", lane: 1, beat: beat(5), endBeat: beat(6) })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getSelectedTrillZoneIndices
// ---------------------------------------------------------------------------

describe("getSelectedTrillZoneIndices", () => {
  const zones: TrillZone[] = [
    { lane: 1, beat: beat(2), endBeat: beat(4) }, // index 0
    { lane: 2, beat: beat(6), endBeat: beat(8) }, // index 1
  ];
  const notes: NoteEntity[] = [
    { type: "single", lane: 1, beat: beat(3) }, // index 0 → zone 0
    { type: "single", lane: 2, beat: beat(7) }, // index 1 → zone 1
    { type: "single", lane: 1, beat: beat(10) }, // index 2 → 어느 구간도 아님
  ];

  it("선택된 노트가 속한 트릴존 인덱스를 반환", () => {
    expect(getSelectedTrillZoneIndices(zones, notes, new Set([0]))).toEqual(new Set([0]));
    expect(getSelectedTrillZoneIndices(zones, notes, new Set([1]))).toEqual(new Set([1]));
  });

  it("여러 노트 선택 시 해당하는 모든 트릴존 반환", () => {
    expect(getSelectedTrillZoneIndices(zones, notes, new Set([0, 1]))).toEqual(new Set([0, 1]));
  });

  it("구간에 속하지 않는 노트만 선택하면 빈 집합", () => {
    expect(getSelectedTrillZoneIndices(zones, notes, new Set([2]))).toEqual(new Set());
  });

  it("선택이 없으면 빈 집합", () => {
    expect(getSelectedTrillZoneIndices(zones, notes, new Set())).toEqual(new Set());
  });

  it("한 구간 안 노트가 하나라도 선택되면 그 구간 포함", () => {
    // 구간 0 안에 노트 0이 있고, 구간 밖 노트 2도 함께 선택 → 구간 0만
    expect(getSelectedTrillZoneIndices(zones, notes, new Set([0, 2]))).toEqual(new Set([0]));
  });
});

// ---------------------------------------------------------------------------
// translateTrillZone
// ---------------------------------------------------------------------------

describe("translateTrillZone", () => {
  const zone: TrillZone = { lane: 1, beat: beat(2), endBeat: beat(4) };

  it("박자 오프셋(+1박)만큼 beat/endBeat가 이동", () => {
    expect(translateTrillZone(zone, 0, beat(1))).toEqual({ lane: 1, beat: beat(3), endBeat: beat(5) });
  });

  it("레인 오프셋(+1)만큼 lane이 이동", () => {
    expect(translateTrillZone(zone, 1, beat(0))).toEqual({ lane: 2, beat: beat(2), endBeat: beat(4) });
  });

  it("레인+박자 동시 이동", () => {
    expect(translateTrillZone(zone, 2, beat(2))).toEqual({ lane: 3, beat: beat(4), endBeat: beat(6) });
  });
});

// ---------------------------------------------------------------------------
// 선택 동질성 (트릴-같은구간 XOR 일반)
// ---------------------------------------------------------------------------

describe("trillZoneIndexOfNote / noteSelectionKind", () => {
  const zones: TrillZone[] = [
    { lane: 1, beat: beat(2), endBeat: beat(4) }, // index 0
    { lane: 2, beat: beat(6), endBeat: beat(8) }, // index 1
  ];

  it("트릴 노트는 속한 구간 인덱스를 반환", () => {
    expect(trillZoneIndexOfNote(zones, { type: "trill", lane: 1, beat: beat(3) })).toBe(0);
    expect(trillZoneIndexOfNote(zones, { type: "trill", lane: 2, beat: beat(7) })).toBe(1);
  });

  it("일반 노트는 null", () => {
    expect(trillZoneIndexOfNote(zones, { type: "single", lane: 1, beat: beat(3) })).toBeNull();
  });

  it("noteSelectionKind: 트릴은 trill+zoneIndex, 일반은 normal", () => {
    expect(noteSelectionKind(zones, { type: "trill", lane: 1, beat: beat(3) })).toEqual({ kind: "trill", zoneIndex: 0 });
    expect(noteSelectionKind(zones, { type: "single", lane: 1, beat: beat(3) })).toEqual({ kind: "normal" });
  });
});

describe("classifySelection / canAddNoteToSelection / selectionBlockReason", () => {
  const zones: TrillZone[] = [
    { lane: 1, beat: beat(2), endBeat: beat(4) }, // index 0
    { lane: 2, beat: beat(6), endBeat: beat(8) }, // index 1
  ];
  const notes: NoteEntity[] = [
    { type: "trill", lane: 1, beat: beat(2) },   // 0: zone 0
    { type: "trill", lane: 1, beat: beat(3) },   // 1: zone 0
    { type: "trill", lane: 2, beat: beat(7) },   // 2: zone 1
    { type: "single", lane: 3, beat: beat(1) },  // 3: normal
  ];

  it("빈 선택은 empty, 트릴 선택은 trill+zone, 일반 선택은 normal", () => {
    expect(classifySelection(zones, notes, new Set())).toEqual({ kind: "empty" });
    expect(classifySelection(zones, notes, new Set([0]))).toEqual({ kind: "trill", zoneIndex: 0 });
    expect(classifySelection(zones, notes, new Set([3]))).toEqual({ kind: "normal" });
  });

  it("빈 선택엔 어떤 노트든 추가 가능", () => {
    expect(canAddNoteToSelection({ kind: "empty" }, zones, notes[0])).toBe(true);
    expect(canAddNoteToSelection({ kind: "empty" }, zones, notes[3])).toBe(true);
  });

  it("트릴(구간0) 선택엔 같은 구간 트릴만 추가 가능", () => {
    const kind = classifySelection(zones, notes, new Set([0]));
    expect(canAddNoteToSelection(kind, zones, notes[1])).toBe(true);  // 같은 구간 트릴
    expect(canAddNoteToSelection(kind, zones, notes[2])).toBe(false); // 다른 구간 트릴
    expect(canAddNoteToSelection(kind, zones, notes[3])).toBe(false); // 일반
  });

  it("일반 선택엔 일반만 추가 가능", () => {
    const kind = classifySelection(zones, notes, new Set([3]));
    expect(canAddNoteToSelection(kind, zones, notes[3])).toBe(true);
    expect(canAddNoteToSelection(kind, zones, notes[0])).toBe(false); // 트릴
  });

  it("막히는 이유 문구: 트릴↔일반, 다른 구간", () => {
    const trillKind = classifySelection(zones, notes, new Set([0]));
    expect(selectionBlockReason(trillKind, zones, notes[3])).toContain("일반 노트");
    expect(selectionBlockReason(trillKind, zones, notes[2])).toContain("다른 트릴 구간");
    expect(selectionBlockReason(trillKind, zones, notes[1])).toBeNull(); // 추가 가능
  });
});

describe("filterHomogeneousSelection", () => {
  const zones: TrillZone[] = [
    { lane: 1, beat: beat(2), endBeat: beat(4) }, // index 0
    { lane: 2, beat: beat(6), endBeat: beat(8) }, // index 1
  ];
  const notes: NoteEntity[] = [
    { type: "trill", lane: 1, beat: beat(2) },   // 0: zone 0
    { type: "single", lane: 3, beat: beat(1) },  // 1: normal
    { type: "trill", lane: 1, beat: beat(3) },   // 2: zone 0
    { type: "trill", lane: 2, beat: beat(7) },   // 3: zone 1
  ];

  it("가장 작은 인덱스(0=trillZone0) 기준으로 같은 구간 트릴만 남기고 나머지 제외", () => {
    const { kept, dropped } = filterHomogeneousSelection(zones, notes, new Set([0, 1, 2, 3]));
    expect(kept).toEqual(new Set([0, 2])); // 구간0 트릴만
    expect(dropped).toBe(2); // 일반(1) + 다른 구간 트릴(3)
  });

  it("첫 노트가 일반이면 일반만 남긴다", () => {
    const { kept, dropped } = filterHomogeneousSelection(zones, notes, new Set([1, 0, 2]));
    // 가장 작은 인덱스는 0(트릴)이므로 사실 트릴 기준 → 주의: 정렬 후 첫 항목 기준
    expect(kept).toEqual(new Set([0, 2]));
    expect(dropped).toBe(1);
  });

  it("일반만 있으면 모두 유지", () => {
    const onlyNormal: NoteEntity[] = [
      { type: "single", lane: 1, beat: beat(1) },
      { type: "single", lane: 2, beat: beat(2) },
    ];
    const { kept, dropped } = filterHomogeneousSelection([], onlyNormal, new Set([0, 1]));
    expect(kept).toEqual(new Set([0, 1]));
    expect(dropped).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// clampTrillBeatOffset — 트릴 노트 이동을 구간 안으로 제한
// ---------------------------------------------------------------------------

describe("clampTrillBeatOffset", () => {
  const zone: TrillZone = { lane: 1, beat: beat(2), endBeat: beat(6) };

  it("구간 안 이동은 요청값 그대로", () => {
    expect(beatToFloat(clampTrillBeatOffset(zone, [{ beat: beat(3) }], beat(1)))).toBe(1);
  });

  it("위로 벗어나면 상단 경계까지만 (dMax)", () => {
    // 노트 beat3, +4 요청 → endBeat6까지 여유 +3
    expect(beatToFloat(clampTrillBeatOffset(zone, [{ beat: beat(3) }], beat(4)))).toBe(3);
  });

  it("아래로 벗어나면 하단 경계까지만 (dMin)", () => {
    // 노트 beat3, -2 요청 → zone.beat2까지 여유 -1
    expect(beatToFloat(clampTrillBeatOffset(zone, [{ beat: beat(3) }], { n: -2, d: 1 }))).toBe(-1);
  });

  it("롱노트는 끝점 기준으로 상단 클램프", () => {
    // 노트 beat3~endBeat5, +2 요청 → dMax = 6-5 = 1
    expect(beatToFloat(clampTrillBeatOffset(zone, [{ beat: beat(3), endBeat: beat(5) }], beat(2)))).toBe(1);
  });

  it("여러 노트는 가장 빡빡한 쪽 기준", () => {
    // beat3, beat5 둘 다 zone[2,6]; +2 요청 → 끝이 큰 5 기준 dMax=1
    expect(beatToFloat(clampTrillBeatOffset(zone, [{ beat: beat(3) }, { beat: beat(5) }], beat(2)))).toBe(1);
  });

  it("구간이 가득 차면 이동 0", () => {
    expect(beatToFloat(clampTrillBeatOffset(zone, [{ beat: beat(2), endBeat: beat(6) }], beat(1)))).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// trillZoneOverlapsBox — 박스 선택 겹침 판정 (RFD 0016 §4.3)
// ---------------------------------------------------------------------------

describe("trillZoneOverlapsBox", () => {
  const zone: TrillZone = { lane: 2, beat: beat(2), endBeat: beat(6) };

  it("레인 범위(1~3) 안 + 박 구간이 겹치면(0~4 vs 존 2~6) true", () => {
    expect(trillZoneOverlapsBox(zone, 1, 3, beat(0), beat(4))).toBe(true);
  });

  it("레인이 범위 밖(3~4, 존은 레인 2)이면 박이 겹쳐도 false", () => {
    expect(trillZoneOverlapsBox(zone, 3, 4, beat(0), beat(8))).toBe(false);
  });

  it("박 구간이 존보다 완전히 앞(0~1 vs 존 2~6)이면 false", () => {
    expect(trillZoneOverlapsBox(zone, 1, 4, beat(0), beat(1))).toBe(false);
  });

  it("경계 일치(박스 끝 2 == 존 시작 2)는 폐구간 의미론으로 true — trillZoneOverlapsNote와 동일", () => {
    expect(trillZoneOverlapsBox(zone, 1, 4, beat(0), beat(2))).toBe(true);
  });

  it("박스가 존을 완전히 포함(0~8 ⊇ 2~6)해도 true (포함 아닌 겹침 기준)", () => {
    expect(trillZoneOverlapsBox(zone, 1, 4, beat(0), beat(8))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// boxAnchorKind — 박스 시작 앵커의 첫 접촉 종류 잠금 (RFD 0016 §6-2)
// ---------------------------------------------------------------------------

describe("boxAnchorKind", () => {
  const zones: TrillZone[] = [
    { lane: 1, beat: beat(2), endBeat: beat(4) }, // 구간0
  ];
  const notes: NoteEntity[] = [
    { type: "trill", lane: 1, beat: beat(3) },   // 0: 구간0 트릴
    { type: "single", lane: 2, beat: beat(3) },  // 1: 일반
    { type: "trill", lane: 3, beat: beat(10) },  // 2: 어느 구간에도 없는 트릴
  ];

  it("앵커가 트릴 노트면 그 노트의 zone trill 모드로 잠근다", () => {
    expect(boxAnchorKind(zones, notes, 0)).toEqual({ kind: "trill", zoneIndex: 0 });
  });

  it("앵커가 일반 노트면 normal 모드", () => {
    expect(boxAnchorKind(zones, notes, 1)).toEqual({ kind: "normal" });
  });

  it("앵커가 null(빈 곳)이면 normal 모드", () => {
    expect(boxAnchorKind(zones, notes, null)).toEqual({ kind: "normal" });
  });

  it("앵커가 어느 zone에도 없는 트릴 노트면 zoneIndex=-1", () => {
    expect(boxAnchorKind(zones, notes, 2)).toEqual({ kind: "trill", zoneIndex: -1 });
  });

  it("앵커 인덱스가 배열 밖(존재하지 않는 노트)이면 normal 모드", () => {
    expect(boxAnchorKind(zones, notes, 99)).toEqual({ kind: "normal" });
  });
});

// ---------------------------------------------------------------------------
// selectionFromBox — 잠긴 종류에 따른 박스 선택 계산 (RFD 0016 §6-2)
// ---------------------------------------------------------------------------

describe("selectionFromBox", () => {
  const zones: TrillZone[] = [
    { lane: 1, beat: beat(2), endBeat: beat(4) }, // 구간0
    { lane: 2, beat: beat(2), endBeat: beat(4) }, // 구간1
  ];
  const notes: NoteEntity[] = [
    { type: "trill", lane: 1, beat: beat(2) },   // 0: 구간0
    { type: "trill", lane: 1, beat: beat(3) },   // 1: 구간0
    { type: "trill", lane: 2, beat: beat(3) },   // 2: 구간1
    { type: "single", lane: 3, beat: beat(3) },  // 3: 일반 (박스 안)
    { type: "single", lane: 3, beat: beat(9) },  // 4: 일반 (박스 밖)
  ];
  const box = { minLane: 1, maxLane: 3, minBeat: beat(0), maxBeat: beat(5) };

  it("trill 모드는 박스 안 해당 zone 트릴 노트만 담고 zones는 비운다", () => {
    const sel = selectionFromBox(zones, notes, box, { kind: "trill", zoneIndex: 0 });
    expect(sel.notes).toEqual(new Set([0, 1]));
    expect(sel.zones).toEqual(new Set());
  });

  it("trill 모드는 다른 zone 트릴(구간1)과 일반 노트를 제외한다", () => {
    const sel = selectionFromBox(zones, notes, box, { kind: "trill", zoneIndex: 0 });
    expect(sel.notes.has(2)).toBe(false); // 구간1 트릴
    expect(sel.notes.has(3)).toBe(false); // 일반
  });

  it("normal 모드는 박스 안 비트릴 노트와 겹치는 zone 유닛을 담는다", () => {
    const sel = selectionFromBox(zones, notes, box, { kind: "normal" });
    expect(sel.notes).toEqual(new Set([3]));
    expect(sel.zones).toEqual(new Set([0, 1]));
  });

  it("normal 모드는 개별 트릴 노트(0,1,2)를 제외한다", () => {
    const sel = selectionFromBox(zones, notes, box, { kind: "normal" });
    expect(sel.notes.has(0)).toBe(false);
    expect(sel.notes.has(1)).toBe(false);
    expect(sel.notes.has(2)).toBe(false);
  });

  it("박스 범위 밖 노트는 어느 모드든 제외 — normal 모드 beat9 일반 노트, trill 모드 maxBeat=2면 beat3 트릴 제외", () => {
    const normalSel = selectionFromBox(zones, notes, box, { kind: "normal" });
    expect(normalSel.notes.has(4)).toBe(false); // beat9 > maxBeat5

    const narrowBox = { minLane: 1, maxLane: 3, minBeat: beat(0), maxBeat: beat(2) };
    const trillSel = selectionFromBox(zones, notes, narrowBox, { kind: "trill", zoneIndex: 0 });
    expect(trillSel.notes).toEqual(new Set([0])); // beat3 트릴(1)은 범위 밖
  });
});

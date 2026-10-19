import { describe, it, expect } from "vitest";
import { resolveGrab, type GrabSelectionView } from "./resolveGrab";
import { makeFakeSpace } from "../timeline/makeFakeSpace";
import { createTimelineSpace, type TimelineSpace } from "../timeline/TimelineSpace";
import { beat } from "../../shared";
import type { Chart, ChartEvent, NoteEntity } from "../../shared";

/** 선택 없음 기본 뷰. */
const emptySel: GrabSelectionView = {
  notes: new Set<number>(),
  zones: new Set<number>(),
  restZones: new Set<number>(),
};

function grab(opts: {
  space?: Partial<TimelineSpace>;
  sel?: Partial<GrabSelectionView>;
  isRangeNote?: (i: number) => boolean;
}) {
  return resolveGrab({
    x: 1,
    y: 1,
    space: makeFakeSpace(opts.space),
    sel: { ...emptySel, ...opts.sel },
    // 기본은 모든 노트를 RangeNote로 취급(끝 캡 게이트 통과) — 케이스별 재정의.
    isRangeNote: opts.isRangeNote ?? (() => true),
  });
}

describe("resolveGrab — 사다리 1 (noteEndCap)", () => {
  it("선택된 롱노트(idx 0)의 끝 캡을 잡으면 noteEndCap", () => {
    expect(
      grab({ space: { hitTestNoteEnd: () => 0 }, sel: { notes: new Set([0]) } }),
    ).toEqual({ kind: "noteEndCap", index: 0 });
  });

  it("미선택이라도 z-order 최상위(topmost===endHit)인 롱노트 끝은 noteEndCap", () => {
    expect(
      grab({ space: { hitTestNoteEnd: () => 0, hitTestUnifiedNote: () => 0 } }),
    ).toEqual({ kind: "noteEndCap", index: 0 });
  });

  it("미선택 롱노트 끝 위에 다른 노트(idx 1)가 최상위로 겹치면 캡 대신 note(1)", () => {
    expect(
      grab({ space: { hitTestNoteEnd: () => 0, hitTestUnifiedNote: () => 1 } }),
    ).toEqual({ kind: "note", index: 1 });
  });

  it("endHit 노트가 포인트 노트(isRangeNote=false)면 캡을 건너뛰고 note로 내려간다", () => {
    expect(
      grab({
        space: { hitTestNoteEnd: () => 0, hitTestUnifiedNote: () => 0 },
        isRangeNote: () => false,
      }),
    ).toEqual({ kind: "note", index: 0 });
  });
});

describe("resolveGrab — 사다리 2 (eventEndCap)", () => {
  it("이벤트 끝 히트는 노트 히트보다 우선해 eventEndCap", () => {
    expect(
      grab({ space: { hitTestEventEnd: () => 2, hitTestUnifiedNote: () => 5 } }),
    ).toEqual({ kind: "eventEndCap", index: 2 });
  });
});

describe("resolveGrab — 사다리 3·4 (선택 게이트)", () => {
  it("선택된 trillZone 끝 캡은 겹친 노트보다 우선해 trillZoneEndCap", () => {
    expect(
      grab({
        space: { hitTestTrillZoneEnd: () => 3, hitTestUnifiedNote: () => 7 },
        sel: { zones: new Set([3]) },
      }),
    ).toEqual({ kind: "trillZoneEndCap", index: 3 });
  });

  it("미선택 trillZone 끝에 놓인 노트는 리사이즈가 아니라 note로 잡는다 (RFD 0016 §6-6)", () => {
    expect(
      grab({ space: { hitTestTrillZoneEnd: () => 3, hitTestUnifiedNote: () => 7 } }),
    ).toEqual({ kind: "note", index: 7 });
  });

  it("미선택 trillZone 끝 + 노트 없음이면 캡이 아니라 trillZoneBody로 내려간다", () => {
    expect(
      grab({ space: { hitTestTrillZoneEnd: () => 3, hitTestTrillZone: () => 3 } }),
    ).toEqual({ kind: "trillZoneBody", index: 3 });
  });

  it("선택된 restZone 끝 캡은 restZoneEndCap (trillZone 게이트 미러, RFD 0019)", () => {
    expect(
      grab({
        space: { hitTestRestZoneEnd: () => 1 },
        sel: { restZones: new Set([1]) },
      }),
    ).toEqual({ kind: "restZoneEndCap", index: 1 });
  });

  it("미선택 restZone 끝은 캡을 건너뛴다", () => {
    expect(
      grab({ space: { hitTestRestZoneEnd: () => 1, hitTestRestZone: () => 1 } }),
    ).toEqual({ kind: "restZoneBody", index: 1 });
  });

  it("같은 좌표라도 sel.zones에 그 존이 있냐에 따라 trillZoneEndCap과 note로 갈린다 (게이트=라이브 sel)", () => {
    const space = { hitTestTrillZoneEnd: () => 3, hitTestUnifiedNote: () => 7 };
    expect(grab({ space, sel: { zones: new Set([3]) } })).toEqual({
      kind: "trillZoneEndCap",
      index: 3,
    });
    expect(grab({ space })).toEqual({ kind: "note", index: 7 });
  });
});

describe("resolveGrab — 사다리 5~8 (순서·경계)", () => {
  it("노트와 trillZone 몸통이 겹치면 note가 이긴다 (사다리 5>6)", () => {
    expect(
      grab({ space: { hitTestUnifiedNote: () => 5, hitTestTrillZone: () => 3 } }),
    ).toEqual({ kind: "note", index: 5 });
  });

  it("노트 실패 + trillZone 몸통 히트면 trillZoneBody", () => {
    expect(grab({ space: { hitTestTrillZone: () => 3 } })).toEqual({
      kind: "trillZoneBody",
      index: 3,
    });
  });

  it("trillZone 실패 + restZone 몸통 히트면 restZoneBody (사다리 6>7)", () => {
    expect(grab({ space: { hitTestRestZone: () => 2 } })).toEqual({
      kind: "restZoneBody",
      index: 2,
    });
  });

  it("아무 히트도 없으면 empty", () => {
    expect(grab({})).toEqual({ kind: "empty" });
  });

  it("히트 인덱스 0(falsy)도 유효 대상으로 잡는다 (noteEndCap·note·trillZoneBody 각 1회)", () => {
    expect(
      grab({ space: { hitTestNoteEnd: () => 0 }, sel: { notes: new Set([0]) } }),
    ).toEqual({ kind: "noteEndCap", index: 0 });
    expect(grab({ space: { hitTestUnifiedNote: () => 0 } })).toEqual({
      kind: "note",
      index: 0,
    });
    expect(grab({ space: { hitTestTrillZone: () => 0 } })).toEqual({
      kind: "trillZoneBody",
      index: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// 실제 TimelineSpace 결합 — 보조 레인(lane 5+) 롱노트 끝 캡 (#100)
// LANE_WIDTH=60·TIMELINE_WIDTH=240·EXTRA_LANE_WIDTH=60, 120 BPM에서 y(px)=ms라 y=500이 1박.
// x=250은 보조 레인 1(lane 5)이자 이벤트 editorLane 1과 같은 칸이다.
// ---------------------------------------------------------------------------

function grabOnRealSpace(opts: {
  notes: NoteEntity[];
  events?: ChartEvent[];
  selectedNotes?: number[];
  x: number;
  y: number;
}) {
  const chart: Chart = {
    meta: {
      title: "", artist: "", difficultyLabel: "NORMAL", difficultyLevel: 1,
      imageFile: "", audioFile: "", previewAudioFile: "", offsetMs: 0,
    },
    notes: opts.notes,
    trillZones: [],
    events: opts.events ?? [
      { type: "bpm", beat: beat(0, 1), bpm: 120, editorLane: 1 },
    ],
  };
  // space의 선택 보너스(hitTestNoteAt)와 끝 캡 선택 게이트(sel)가 같은 선택을 읽는다 — SelectMode.resolveGrabAt과 동일.
  const selectedNotes = new Set(opts.selectedNotes ?? []);
  const sel: GrabSelectionView = { ...emptySel, notes: selectedNotes };
  const space = createTimelineSpace({
    getChart: () => chart,
    getSnapDivision: () => 4,
    getSelectedNotes: () => selectedNotes,
    getExtraLaneCount: () => 2,
    yToTime: (y) => y,
    getTotalTimelineMs: () => 8000,
  });
  return resolveGrab({
    x: opts.x,
    y: opts.y,
    space,
    sel,
    isRangeNote: (i) => chart.notes[i] !== undefined && "endBeat" in chart.notes[i],
  });
}

describe("resolveGrab × 실제 TimelineSpace — 보조 레인 롱노트 끝 캡 (#100)", () => {
  it("미선택 보조 lane 5 롱노트(0→2박)의 끝(x=250·y=1000)을 누르면 note가 아니라 noteEndCap", () => {
    expect(
      grabOnRealSpace({
        notes: [{ type: "long", lane: 5, beat: beat(0, 1), endBeat: beat(2, 1) }],
        x: 250,
        y: 1000,
      }),
    ).toEqual({ kind: "noteEndCap", index: 0 });
  });

  it("미선택 보조 롱노트 끝에 같은 lane 5 단노트(idx 1)가 최상위로 겹치면 메인 레인처럼 캡 대신 note(1)", () => {
    expect(
      grabOnRealSpace({
        notes: [
          { type: "long", lane: 5, beat: beat(0, 1), endBeat: beat(2, 1) },
          { type: "single", lane: 5, beat: beat(2, 1) },
        ],
        x: 250,
        y: 1000,
      }),
    ).toEqual({ kind: "note", index: 1 });
  });

  it("선택된 보조 롱노트(idx 0)는 끝에 단노트가 겹쳐도 noteEndCap", () => {
    expect(
      grabOnRealSpace({
        notes: [
          { type: "long", lane: 5, beat: beat(0, 1), endBeat: beat(2, 1) },
          { type: "single", lane: 5, beat: beat(2, 1) },
        ],
        selectedNotes: [0],
        x: 250,
        y: 1000,
      }),
    ).toEqual({ kind: "noteEndCap", index: 0 });
  });

  it("보조 lane 5 롱노트 끝과 editorLane 1 구간 이벤트 끝이 같은 칸(x=250)·같은 2박이면 z-order 1단계 noteEndCap이 2단계 eventEndCap보다 앞선다", () => {
    expect(
      grabOnRealSpace({
        notes: [{ type: "long", lane: 5, beat: beat(0, 1), endBeat: beat(2, 1) }],
        events: [
          { type: "bpm", beat: beat(0, 1), bpm: 120, editorLane: 1 },
          { type: "auto", beat: beat(0, 1), endBeat: beat(2, 1), editorLane: 1 },
        ],
        x: 250,
        y: 1000,
      }),
    ).toEqual({ kind: "noteEndCap", index: 0 });
  });
});

import { describe, it, expect } from "vitest";
import { resolveGrab, type GrabSelectionView } from "./resolveGrab";
import { makeFakeSpace } from "../timeline/makeFakeSpace";
import type { TimelineSpace } from "../timeline/TimelineSpace";

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

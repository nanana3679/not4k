import { describe, expect, it } from "vitest";
import { createTimelineLayout, eventPlacement, getEditorTimelineLayoutConfig } from "./TimelineLayout";
import type { RangeEvent } from "../../shared";

describe("곡 공통 영역을 접은 배치(RFD 0095)", () => {
  const collapsed = createTimelineLayout(getEditorTimelineLayoutConfig({ extraLaneCount: 2, songCommonCollapsed: true }));
  const expanded = createTimelineLayout(getEditorTimelineLayoutConfig({ extraLaneCount: 2, songCommonCollapsed: false }));

  it("접으면 곡 공통 폭이 108→0px이고 콘텐츠 폭이 468→360px, 메인 레인 1이 x=108→0으로 온다", () => {
    expect(expanded.songCommonWidth).toBe(108);
    expect(expanded.contentWidth).toBe(468);
    expect(expanded.noteLaneRange(1).x).toBe(108);
    expect(collapsed.songCommonWidth).toBe(0);
    expect(collapsed.contentWidth).toBe(360);
    expect(collapsed.noteLaneRange(1).x).toBe(0);
    expect(collapsed.auxiliaryLaneRange(1).x).toBe(240);
  });

  it("접으면 x=10이 bpm 열이 아니라 메인 레인 1이고 x<0은 콘텐츠 밖이다", () => {
    expect(expanded.classifyX(10)).toEqual({ kind: "common", column: "bpm" });
    expect(collapsed.classifyX(10)).toEqual({ kind: "main", lane: 1 });
    expect(collapsed.classifyX(-1)).toEqual({ kind: "outside" });
  });

  it("접으면 BPM·박자의 eventRange가 null이고 x=10 위에도 없지만 보조 레인 text는 x=240에 남는다", () => {
    expect(collapsed.eventRange({ type: "bpm" })).toBeNull();
    expect(collapsed.eventRange({ type: "timeSignature" })).toBeNull();
    expect(collapsed.isEventAtX({ type: "bpm" }, 10)).toBe(false);
    expect(collapsed.isEventAtX({ type: "timeSignature" }, 10)).toBe(false);
    expect(collapsed.eventRange({ type: "text" })).toEqual({ x: 240, width: 60 });
  });

  it("접으면 드래그 앵커 번호에 0 이하 곡 공통 번호가 없고 x=10은 레인 1이다", () => {
    expect(expanded.xToDragLane(10)).toBe(-1);
    expect(collapsed.xToDragLane(10)).toBe(1);
  });

  it("접고 펼쳐도 저장 레인 번호와 보조 레인 수는 그대로다", () => {
    expect(collapsed.auxiliaryLaneCount).toBe(expanded.auxiliaryLaneCount);
    expect(collapsed.xToNoteLane(collapsed.noteLaneRange(5).x)).toBe(5);
    expect(expanded.xToNoteLane(expanded.noteLaneRange(5).x)).toBe(5);
  });
});

describe("TimelineLayout", () => {
  it("보조 레인 2개에서 editorLane 0·1.5·3인 text는 메인·보조·숨겨진 위치에서 히트하지 않는다", () => {
    const layout = createTimelineLayout({ auxiliaryLaneCount: 2 });
    expect(layout.isEventAtX({ type: "text", editorLane: 0 }, 180)).toBe(false);
    expect(layout.isEventAtX({ type: "text", editorLane: 1.5 }, 280)).toBe(false);
    expect(layout.isEventAtX({ type: "text", editorLane: 3 }, 360)).toBe(false);
  });

  it.each([
    [0, 240, "outside"], [2, 360, "auxiliary"], [1, 300, "outside"],
  ] as const)("보조 레인 수 %i이면 폭 %ipx이고 x=310은 %s로 분류된다", (count, width, kind) => {
    const layout = createTimelineLayout({ auxiliaryLaneCount: count });
    expect(layout.contentWidth).toBe(width);
    expect(layout.classifyX(310).kind).toBe(kind);
    expect(layout.songCommonWidth).toBe(0);
    expect(layout.commonColumnRange("bpm")).toBeUndefined();
  });
  it("text 등 5종 구간 이벤트는 editorLane 생략 시 보조 1번, 지정 시 보조 2번에 놓인다", () => {
    const layout = createTimelineLayout({ auxiliaryLaneCount: 2 });
    const types: RangeEvent["type"][] = ["text", "auto", "stop", "tutorialInput", "tutorialDiagram"];
    for (const type of types) {
      expect(layout.eventPlacement({ type })).toEqual({ kind: "auxiliary", lane: 1 });
      expect(layout.eventRange({ type })).toEqual({ x: 240, width: 60 });
      expect(layout.eventRange({ type, editorLane: 2 })).toEqual({ x: 300, width: 60 });
      expect(layout.xToNoteLane(layout.eventRange({ type, editorLane: 2 })!.x)).toBe(6);
      expect(layout.isEventAtX({ type, editorLane: 2 }, 299.9)).toBe(false);
      expect(layout.isEventAtX({ type, editorLane: 2 }, 300)).toBe(true);
      expect(layout.isEventAtX({ type, editorLane: 2 }, 360)).toBe(false);
    }
  });
  it("곡 공통 열 폭 40·50px이면 메인·보조는 90px 이동하고 공통 열은 노트 레인이 아니다", () => {
    const layout = createTimelineLayout({
      auxiliaryLaneCount: 2,
      songCommonColumns: [{ id: "bpm", width: 40 }, { id: "timeSignature", width: 50 }],
    });
    expect(layout.contentWidth).toBe(450);
    expect(layout.commonColumnRange("bpm")).toEqual({ x: 0, width: 40 });
    expect(layout.commonColumnRange("timeSignature")).toEqual({ x: 40, width: 50 });
    expect(layout.mainArea).toEqual({ x: 90, width: 240 });
    expect(layout.noteLaneRange(1)).toEqual({ x: 90, width: 60 });
    expect(layout.noteLaneRange(4)).toEqual({ x: 270, width: 60 });
    expect(layout.auxiliaryLaneRange(1)).toEqual({ x: 330, width: 60 });
    expect(layout.auxiliaryLaneRange(2)).toEqual({ x: 390, width: 60 });
    expect(layout.eventRange({ type: "text" })).toEqual({ x: 330, width: 60 });
    expect(layout.isEventAtX({ type: "text" }, 40)).toBe(false);
    expect(layout.isEventAtX({ type: "text" }, 330)).toBe(true);
    expect([0, 39.9, 40, 89.9, 90, 330, 450].map(layout.classifyX)).toEqual([
      { kind: "common", column: "bpm" }, { kind: "common", column: "bpm" },
      { kind: "common", column: "timeSignature" }, { kind: "common", column: "timeSignature" },
      { kind: "main", lane: 1 }, { kind: "auxiliary", lane: 1 }, { kind: "outside" },
    ]);
    expect(layout.xToNoteLane(40)).toBeNull();
    expect(layout.xToNoteLane(90)).toBe(1);
    expect(layout.xToNoteLane(330)).toBe(5);
  });
  it("보조 레인 2개이면 콘텐츠 폭 360px, 메인 4번은 x=180, 보조 1번은 x=240이다", () => {
    const layout = createTimelineLayout({ auxiliaryLaneCount: 2 });
    expect(layout.contentWidth).toBe(360);
    expect(layout.measureRail).toEqual({ x: -32, width: 32 });
    expect(layout.mainArea).toEqual({ x: 0, width: 240 });
    expect(layout.noteLaneRange(4)).toEqual({ x: 180, width: 60 });
    expect(layout.auxiliaryLaneRange(1)).toEqual({ x: 240, width: 60 });
    expect(layout.noteLaneRange(5)).toEqual(layout.auxiliaryLaneRange(1));
  });

  it("x=-1·360은 밖, x=0·60·240·300은 각 레인 왼쪽 경계에 속한다", () => {
    const layout = createTimelineLayout({ auxiliaryLaneCount: 2 });
    expect([-1, 0, 59.9, 60, 239.9, 240, 299.9, 300, 359.9, 360].map(layout.classifyX)).toEqual([
      { kind: "outside" },
      { kind: "main", lane: 1 }, { kind: "main", lane: 1 },
      { kind: "main", lane: 2 }, { kind: "main", lane: 4 },
      { kind: "auxiliary", lane: 1 }, { kind: "auxiliary", lane: 1 },
      { kind: "auxiliary", lane: 2 }, { kind: "auxiliary", lane: 2 },
      { kind: "outside" },
    ]);
    for (const lane of [1, 2, 3, 4, 5, 6]) {
      const range = layout.noteLaneRange(lane);
      expect(layout.xToNoteLane(range.x)).toBe(lane);
      expect(layout.xToNoteLane(range.x + range.width / 2)).toBe(lane);
    }
  });

  describe("곡 공통 영역의 BPM·박자 열", () => {
    const layout = createTimelineLayout(getEditorTimelineLayoutConfig({ extraLaneCount: 2, songCommonCollapsed: false }));

    it("에디터 설정의 곡 공통 영역은 왼쪽부터 bpm 60px·timeSignature 48px이고 메인 영역은 x=108에서 시작한다", () => {
      expect(layout.songCommonColumns).toEqual([{ id: "bpm", width: 60 }, { id: "timeSignature", width: 48 }]);
      expect(layout.commonColumnRange("bpm")).toEqual({ x: 0, width: 60 });
      expect(layout.commonColumnRange("timeSignature")).toEqual({ x: 60, width: 48 });
      expect(layout.mainArea).toEqual({ x: 108, width: 240 });
      expect(layout.contentWidth).toBe(468);
    });

    it("editorLane 없는 BPM·박자는 종류에 맞는 열에 놓이고 text는 보조 레인1에 놓인다", () => {
      expect(eventPlacement({ type: "bpm" })).toEqual({ kind: "common", column: "bpm" });
      expect(eventPlacement({ type: "timeSignature" })).toEqual({ kind: "common", column: "timeSignature" });
      expect(eventPlacement({ type: "text" })).toEqual({ kind: "auxiliary", lane: 1 });
    });

    it("구형 값 editorLane 2가 남은 BPM도 보조 레인2가 아니라 bpm 열에 놓인다", () => {
      expect(eventPlacement({ type: "bpm", editorLane: 2 })).toEqual({ kind: "common", column: "bpm" });
      expect(layout.eventRange({ type: "bpm", editorLane: 2 })).toEqual({ x: 0, width: 60 });
    });

    it("BPM은 bpm 열 x=30에서만, 박자는 timeSignature 열 x=70에서만 히트하고 보조 레인1 x=350에서는 히트하지 않는다", () => {
      expect(layout.isEventAtX({ type: "bpm" }, 30)).toBe(true);
      expect(layout.isEventAtX({ type: "bpm" }, 70)).toBe(false);
      expect(layout.isEventAtX({ type: "timeSignature" }, 70)).toBe(true);
      expect(layout.isEventAtX({ type: "timeSignature" }, 30)).toBe(false);
      expect(layout.isEventAtX({ type: "bpm" }, 350)).toBe(false);
      expect(layout.isEventAtX({ type: "text" }, 30)).toBe(false);
    });

    it("곡 공통 열은 x=30이 노트 레인이 아니고 열 범위는 그 열 전체다", () => {
      expect(layout.xToNoteLane(30)).toBeNull();
      expect(layout.columnRangeAtX(70)).toEqual({ x: 60, width: 48 });
    });

    it("곡 공통 열이 없는 배치에서 BPM의 eventRange는 null이고 어떤 x에서도 히트하지 않는다", () => {
      const collapsed = createTimelineLayout({ auxiliaryLaneCount: 2, songCommonColumns: [] });
      expect(collapsed.eventRange({ type: "bpm" })).toBeNull();
      expect(collapsed.isEventAtX({ type: "bpm" }, 30)).toBe(false);
    });

    it("드래그 앵커 번호는 메인 1번 왼쪽으로 이어져 timeSignature 열 0, bpm 열 -1이고 레인은 통합 번호, 콘텐츠 밖은 null이다", () => {
      expect(layout.xToDragLane(70)).toBe(0);
      expect(layout.xToDragLane(30)).toBe(-1);
      expect(layout.xToDragLane(110)).toBe(1);
      expect(layout.xToDragLane(350)).toBe(5);
      expect(layout.xToDragLane(-1)).toBeNull();
      expect(layout.xToDragLane(468)).toBeNull();
    });
  });
});

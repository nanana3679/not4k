import { describe, expect, it } from "vitest";
import { createTimelineLayout } from "./TimelineLayout";
import type { ChartEvent } from "../../shared";

describe("TimelineLayout", () => {
  it("보조 레인 2개에서 editorLane 0·1.5·3인 이벤트는 메인·보조·숨겨진 위치에서 히트하지 않는다", () => {
    const layout = createTimelineLayout({ auxiliaryLaneCount: 2 });
    expect(layout.isEventAtX({ type: "bpm", editorLane: 0 }, 180)).toBe(false);
    expect(layout.isEventAtX({ type: "bpm", editorLane: 1.5 }, 280)).toBe(false);
    expect(layout.isEventAtX({ type: "bpm", editorLane: 3 }, 360)).toBe(false);
  });

  it.each([
    [0, 240, "outside"], [2, 360, "auxiliary"], [1, 300, "outside"],
  ] as const)("보조 레인 수 %i이면 폭 %ipx이고 x=310은 %s로 분류된다", (count, width, kind) => {
    const layout = createTimelineLayout({ auxiliaryLaneCount: count });
    expect(layout.contentWidth).toBe(width);
    expect(layout.classifyX(310).kind).toBe(kind);
    expect(layout.songCommonWidth).toBe(0);
    expect(layout.commonColumnRange("absent")).toBeUndefined();
  });
  it("BPM·박자표를 포함한 7종 이벤트는 editorLane 생략 시 보조 1번, 지정 시 보조 2번에 놓인다", () => {
    const layout = createTimelineLayout({ auxiliaryLaneCount: 2 });
    const types: ChartEvent["type"][] = ["bpm", "timeSignature", "text", "auto", "stop", "tutorialInput", "tutorialDiagram"];
    for (const type of types) {
      expect(layout.eventPlacement({ type })).toEqual({ kind: "auxiliary", lane: 1 });
      expect(layout.eventRange({ type })).toEqual({ x: 240, width: 60 });
      expect(layout.eventRange({ type, editorLane: 2 })).toEqual({ x: 300, width: 60 });
      expect(layout.xToNoteLane(layout.eventRange({ type, editorLane: 2 }).x)).toBe(6);
      expect(layout.isEventAtX({ type, editorLane: 2 }, 299.9)).toBe(false);
      expect(layout.isEventAtX({ type, editorLane: 2 }, 300)).toBe(true);
      expect(layout.isEventAtX({ type, editorLane: 2 }, 360)).toBe(false);
    }
  });
  it("곡 공통 열 폭 40·50px이면 메인·보조는 90px 이동하고 공통 열은 노트 레인이 아니다", () => {
    const layout = createTimelineLayout({
      auxiliaryLaneCount: 2,
      songCommonColumns: [{ id: "first", width: 40 }, { id: "second", width: 50 }],
    });
    expect(layout.contentWidth).toBe(450);
    expect(layout.commonColumnRange("first")).toEqual({ x: 0, width: 40 });
    expect(layout.commonColumnRange("second")).toEqual({ x: 40, width: 50 });
    expect(layout.mainArea).toEqual({ x: 90, width: 240 });
    expect(layout.noteLaneRange(1)).toEqual({ x: 90, width: 60 });
    expect(layout.noteLaneRange(4)).toEqual({ x: 270, width: 60 });
    expect(layout.auxiliaryLaneRange(1)).toEqual({ x: 330, width: 60 });
    expect(layout.auxiliaryLaneRange(2)).toEqual({ x: 390, width: 60 });
    expect(layout.eventRange({ type: "bpm" })).toEqual({ x: 330, width: 60 });
    expect(layout.isEventAtX({ type: "bpm" }, 40)).toBe(false);
    expect(layout.isEventAtX({ type: "bpm" }, 330)).toBe(true);
    expect([0, 39.9, 40, 89.9, 90, 330, 450].map(layout.classifyX)).toEqual([
      { kind: "common", column: "first" }, { kind: "common", column: "first" },
      { kind: "common", column: "second" }, { kind: "common", column: "second" },
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
});

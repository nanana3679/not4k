import { describe, expect, it } from "vitest";
import { GestureRecognizer, type PointerSample } from "./gestureRecognizer";

function touch(
  phase: PointerSample["phase"],
  pointerId: number,
  clientX: number,
  clientY: number,
  timeMs = 0,
): PointerSample {
  return {
    pointerId,
    pointerType: "touch",
    phase,
    x: clientX,
    y: clientY,
    clientX,
    clientY,
    timeMs,
    button: 0,
    buttons: 1,
  };
}

function mouse(
  phase: PointerSample["phase"],
  clientX: number,
  clientY: number,
): PointerSample {
  return {
    pointerId: 1,
    pointerType: "mouse",
    phase,
    x: clientX,
    y: clientY,
    clientX,
    clientY,
    timeMs: 0,
    button: 0,
    buttons: 1,
  };
}

describe("GestureRecognizer — 두 손가락 내비게이션", () => {
  it("한 손가락만 닿으면 내비게이션이 시작되지 않는다", () => {
    const r = new GestureRecognizer();
    const g = r.feed(touch("down", 1, 100, 100));
    expect(g).toEqual([]);
    expect(r.activeTouchCount).toBe(1);
    expect(r.isNavigating).toBe(false);
  });

  it("두 번째 손가락이 닿으면 내비 세션이 시작되고 editCancel을 방출한다", () => {
    const r = new GestureRecognizer();
    r.feed(touch("down", 1, 100, 100));
    const g = r.feed(touch("down", 2, 300, 100));
    expect(g).toEqual([{ kind: "editCancel" }]);
    expect(r.activeTouchCount).toBe(2);
    expect(r.isNavigating).toBe(true);
  });

  it("마우스 포인터는 내비게이션으로 추적되지 않는다", () => {
    const r = new GestureRecognizer();
    expect(r.feed(mouse("down", 100, 100))).toEqual([]);
    expect(r.feed(mouse("down", 300, 100))).toEqual([]);
    expect(r.activeTouchCount).toBe(0);
    expect(r.isNavigating).toBe(false);
  });

  it("두 손가락을 함께 왼쪽으로 옮기면 viewportScroll horizontal(deltaX=5)을 방출한다", () => {
    const r = new GestureRecognizer();
    r.feed(touch("down", 1, 100, 100));
    r.feed(touch("down", 2, 300, 100));
    // 첫 손가락만 옮긴 중간 프레임은 슬롭/디바운스 안이라 아직 잠기지 않음(방출 없음)
    expect(r.feed(touch("move", 1, 90, 100))).toEqual([]);
    // 두 번째 손가락이 따라오며 수평이 우세해져 잠긴다
    expect(r.feed(touch("move", 2, 290, 100))).toEqual([
      { kind: "viewportScroll", axis: "horizontal", deltaX: 5 },
    ]);
  });

  it("두 손가락을 함께 아래로 옮기면 viewportScroll vertical(deltaY=-5)을 방출한다", () => {
    const r = new GestureRecognizer();
    r.feed(touch("down", 1, 100, 100));
    r.feed(touch("down", 2, 300, 100));
    expect(r.feed(touch("move", 1, 100, 110))).toEqual([]);
    expect(r.feed(touch("move", 2, 300, 110))).toEqual([
      { kind: "viewportScroll", axis: "vertical", deltaY: -5 },
    ]);
  });

  it("두 손가락 간격을 200→250으로 벌리면 viewportZoom을 방출한다", () => {
    const r = new GestureRecognizer();
    r.feed(touch("down", 1, 100, 100));
    r.feed(touch("down", 2, 300, 100));
    expect(r.feed(touch("move", 1, 50, 100))).toEqual([
      { kind: "viewportZoom", previousDistance: 200, currentDistance: 250, centerClientY: 100 },
    ]);
  });

  it("한 번 수평 스크롤로 잠기면 이후 세로 성분 이동에도 수평으로 유지된다", () => {
    const r = new GestureRecognizer();
    r.feed(touch("down", 1, 100, 100));
    r.feed(touch("down", 2, 300, 100));
    r.feed(touch("move", 1, 90, 100));
    r.feed(touch("move", 2, 290, 100)); // 여기서 horizontalScroll로 잠김
    const g = r.feed(touch("move", 1, 90, 120)); // 세로로 움직여도
    expect(g).toEqual([{ kind: "viewportScroll", axis: "horizontal", deltaX: 0 }]);
  });

  it("손가락이 하나로 줄면 내비 세션이 종료된다", () => {
    const r = new GestureRecognizer();
    r.feed(touch("down", 1, 100, 100));
    r.feed(touch("down", 2, 300, 100));
    expect(r.isNavigating).toBe(true);
    r.feed(touch("up", 2, 300, 100));
    expect(r.activeTouchCount).toBe(1);
    expect(r.isNavigating).toBe(false);
  });

  it("취소(cancel)로 손가락이 빠져도 내비 세션이 종료된다", () => {
    const r = new GestureRecognizer();
    r.feed(touch("down", 1, 100, 100));
    r.feed(touch("down", 2, 300, 100));
    r.feed(touch("cancel", 1, 100, 100));
    expect(r.activeTouchCount).toBe(1);
    expect(r.isNavigating).toBe(false);
  });
});

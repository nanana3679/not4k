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

describe("GestureRecognizer — 롱프레스(Time-A)", () => {
  it("단일 터치를 450ms 유지하면 longPress를 down 좌표로 방출한다", () => {
    const r = new GestureRecognizer();
    expect(r.feed(touch("down", 1, 100, 200, 0))).toEqual([]);
    expect(r.tick(449)).toEqual([]);
    expect(r.tick(450)).toEqual([{ kind: "longPress", x: 100, y: 200 }]);
  });

  it("449ms까지는 롱프레스가 발화하지 않는다", () => {
    const r = new GestureRecognizer();
    r.feed(touch("down", 1, 100, 200, 0));
    expect(r.tick(200)).toEqual([]);
    expect(r.tick(449)).toEqual([]);
  });

  it("발화 후 다시 tick해도 롱프레스를 재방출하지 않는다", () => {
    const r = new GestureRecognizer();
    r.feed(touch("down", 1, 100, 200, 0));
    expect(r.tick(450)).toEqual([{ kind: "longPress", x: 100, y: 200 }]);
    expect(r.tick(600)).toEqual([]);
  });

  it("tap-slop(10px)을 넘게 움직이면 롱프레스가 취소된다", () => {
    const r = new GestureRecognizer();
    r.feed(touch("down", 1, 100, 200, 0));
    r.feed(touch("move", 1, 100, 215, 100)); // 15px 이동 > 10
    expect(r.tick(450)).toEqual([]);
  });

  it("tap-slop 안(5px) 이동은 롱프레스를 취소하지 않고 down 좌표로 발화한다", () => {
    const r = new GestureRecognizer();
    r.feed(touch("down", 1, 100, 200, 0));
    r.feed(touch("move", 1, 103, 204, 100)); // hypot(3,4)=5 <= 10
    expect(r.tick(450)).toEqual([{ kind: "longPress", x: 100, y: 200 }]);
  });

  it("두 번째 손가락이 닿으면 롱프레스가 취소된다", () => {
    const r = new GestureRecognizer();
    r.feed(touch("down", 1, 100, 200, 0));
    r.feed(touch("down", 2, 300, 200, 10));
    expect(r.tick(450)).toEqual([]);
  });

  it("손가락을 떼면 롱프레스가 취소된다", () => {
    const r = new GestureRecognizer();
    r.feed(touch("down", 1, 100, 200, 0));
    r.feed(touch("up", 1, 100, 200, 100));
    expect(r.tick(450)).toEqual([]);
  });
});

describe("GestureRecognizer — holdEnd(결말 방출)", () => {
  it("이동·발화 없이 뗀 up은 holdEnd{fired:false, moved:false} (탭)", () => {
    const r = new GestureRecognizer();
    r.feed(touch("down", 1, 100, 200, 0));
    expect(r.feed(touch("up", 1, 100, 200, 100))).toEqual([
      { kind: "holdEnd", pointerId: 1, fired: false, moved: false },
    ]);
  });

  it("tap-slop(10px) 넘게 이동 후 뗀 up은 holdEnd{fired:false, moved:true} (스크롤성)", () => {
    const r = new GestureRecognizer();
    r.feed(touch("down", 1, 100, 200, 0));
    r.feed(touch("move", 1, 100, 215, 100)); // 15px > 10
    expect(r.feed(touch("up", 1, 100, 215, 200))).toEqual([
      { kind: "holdEnd", pointerId: 1, fired: false, moved: true },
    ]);
  });

  it("이동으로 봉인된 hold는 이후 tick해도 longPress를 발화하지 않는다", () => {
    const r = new GestureRecognizer();
    r.feed(touch("down", 1, 100, 200, 0));
    r.feed(touch("move", 1, 100, 215, 100)); // 15px > 10 → moved 봉인
    expect(r.tick(450)).toEqual([]);
  });

  it("450ms 유지로 발화한 뒤 뗀 up은 holdEnd{fired:true, moved:false} (드래그)", () => {
    const r = new GestureRecognizer();
    r.feed(touch("down", 1, 100, 200, 0));
    expect(r.tick(450)).toEqual([{ kind: "longPress", x: 100, y: 200 }]);
    expect(r.feed(touch("up", 1, 100, 200, 500))).toEqual([
      { kind: "holdEnd", pointerId: 1, fired: true, moved: false },
    ]);
  });

  it("발화 후 tap-slop 안 이동은 moved를 켜지 않는다 (발화 뒤 드래그는 스크롤성 아님)", () => {
    const r = new GestureRecognizer();
    r.feed(touch("down", 1, 100, 200, 0));
    r.tick(450); // 발화
    r.feed(touch("move", 1, 100, 250, 500)); // 발화 후 이동
    expect(r.feed(touch("up", 1, 100, 250, 600))).toEqual([
      { kind: "holdEnd", pointerId: 1, fired: true, moved: false },
    ]);
  });

  it("두 번째 손가락으로 취소(editCancel)된 hold는 이후 up에서 holdEnd를 방출하지 않는다", () => {
    const r = new GestureRecognizer();
    r.feed(touch("down", 1, 100, 200, 0));
    r.feed(touch("down", 2, 300, 200, 10)); // editCancel, hold 폐기
    expect(r.feed(touch("up", 1, 100, 200, 100))).toEqual([]);
  });

  it("tap-slop 안(5px) 이동은 moved를 켜지 않아 발화·holdEnd{moved:false}", () => {
    const r = new GestureRecognizer();
    r.feed(touch("down", 1, 100, 200, 0));
    r.feed(touch("move", 1, 103, 204, 100)); // hypot(3,4)=5 <= 10
    expect(r.tick(450)).toEqual([{ kind: "longPress", x: 100, y: 200 }]);
    expect(r.feed(touch("up", 1, 103, 204, 200))).toEqual([
      { kind: "holdEnd", pointerId: 1, fired: true, moved: false },
    ]);
  });
});

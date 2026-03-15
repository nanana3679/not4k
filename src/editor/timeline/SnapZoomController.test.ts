import { describe, it, expect } from "vitest";
import { SnapZoomController } from "./SnapZoomController";
import { beat, BEAT_ZERO, beatToFloat } from "../../shared/types/beat";
import type { BpmMarker } from "../../shared/types/chart";

const SINGLE_BPM: BpmMarker[] = [{ beat: BEAT_ZERO, bpm: 120 }];
const noop = { onZoomChange: () => {}, onSnapChange: () => {} };

// ---------------------------------------------------------------------------
// snapBeat
// ---------------------------------------------------------------------------

describe("SnapZoomController.snapBeat", () => {
  it("snap=4 (4분음표)에서 정확한 박에 스냅", () => {
    const ctrl = new SnapZoomController(noop, { snapDivision: 4 });

    // beat(3) → 정확히 3박, 그대로
    expect(beatToFloat(ctrl.snapBeat(beat(3)))).toBeCloseTo(3, 10);

    // beat(4) → 정확히 4박
    expect(beatToFloat(ctrl.snapBeat(beat(4)))).toBeCloseTo(4, 10);
  });

  it("snap=4에서 중간값은 가까운 박으로 스냅", () => {
    const ctrl = new SnapZoomController(noop, { snapDivision: 4 });

    // beat(3, 2) = 1.5박 → 2박으로 스냅 (grid = 1)
    expect(beatToFloat(ctrl.snapBeat(beat(3, 2)))).toBeCloseTo(2, 10);

    // beat(5, 4) = 1.25박 → 1박으로 스냅
    expect(beatToFloat(ctrl.snapBeat(beat(5, 4)))).toBeCloseTo(1, 10);
  });

  it("snap=8 (8분음표)에서 반박 단위로 스냅", () => {
    const ctrl = new SnapZoomController(noop, { snapDivision: 8 });

    // grid = 4/8 = 0.5
    // beat(3, 4) = 0.75 → 1.0으로 스냅
    expect(beatToFloat(ctrl.snapBeat(beat(3, 4)))).toBeCloseTo(1, 10);

    // beat(1, 4) = 0.25 → 0.5로 스냅
    expect(beatToFloat(ctrl.snapBeat(beat(1, 4)))).toBeCloseTo(0.5, 10);
  });

  it("snap=16 (16분음표)에서 1/4박 단위로 스냅", () => {
    const ctrl = new SnapZoomController(noop, { snapDivision: 16 });

    // grid = 4/16 = 0.25
    // beat(1, 8) = 0.125 → 0.25로 스냅
    expect(beatToFloat(ctrl.snapBeat(beat(1, 8)))).toBeCloseTo(0.25, 10);
  });

  it("snap=1 (온음표)에서 4박 단위로 스냅", () => {
    const ctrl = new SnapZoomController(noop, { snapDivision: 1 });

    // grid = 4/1 = 4
    // beat(5) = 5박 → 4박으로 스냅
    expect(beatToFloat(ctrl.snapBeat(beat(5)))).toBeCloseTo(4, 10);

    // beat(6) = 6박 → 8박으로 스냅
    expect(beatToFloat(ctrl.snapBeat(beat(6)))).toBeCloseTo(8, 10);
  });
});

// ---------------------------------------------------------------------------
// snapTimeMs
// ---------------------------------------------------------------------------

describe("SnapZoomController.snapTimeMs", () => {
  it("120BPM snap=4에서 시간을 박 단위로 스냅", () => {
    const ctrl = new SnapZoomController(noop, { snapDivision: 4 });

    // 120 BPM: 1박 = 500ms
    // 600ms → 1박(500ms)으로 스냅
    expect(ctrl.snapTimeMs(600, SINGLE_BPM, 0)).toBeCloseTo(500, 5);

    // 1100ms → 2박(1000ms)으로 스냅
    expect(ctrl.snapTimeMs(1100, SINGLE_BPM, 0)).toBeCloseTo(1000, 5);
  });

  it("offset 적용", () => {
    const ctrl = new SnapZoomController(noop, { snapDivision: 4 });

    // offset 200ms: 0박=200ms, 1박=700ms
    // 800ms → 1박(700ms)으로 스냅
    expect(ctrl.snapTimeMs(800, SINGLE_BPM, 200)).toBeCloseTo(700, 5);
  });

  it("0ms는 0박으로 스냅", () => {
    const ctrl = new SnapZoomController(noop, { snapDivision: 4 });
    expect(ctrl.snapTimeMs(0, SINGLE_BPM, 0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// zoom
// ---------------------------------------------------------------------------

describe("SnapZoomController zoom", () => {
  it("초기 줌 값 설정", () => {
    const ctrl = new SnapZoomController(noop, { zoom: 300 });
    expect(ctrl.zoom).toBe(300);
  });

  it("기본 줌 값은 200", () => {
    const ctrl = new SnapZoomController(noop);
    expect(ctrl.zoom).toBe(200);
  });

  it("줌 최소/최대 클램핑", () => {
    const ctrl = new SnapZoomController(noop);

    ctrl.zoom = 10;
    expect(ctrl.zoom).toBe(SnapZoomController.MIN_ZOOM);

    ctrl.zoom = 99999;
    expect(ctrl.zoom).toBe(SnapZoomController.MAX_ZOOM);
  });

  it("Ctrl+wheel 줌 인/아웃", () => {
    let lastZoom = 200;
    const ctrl = new SnapZoomController({
      onZoomChange: (z) => { lastZoom = z; },
      onSnapChange: () => {},
    }, { zoom: 200 });

    // Ctrl+wheel up = zoom in
    const handled = ctrl.handleWheel({
      ctrlKey: true,
      deltaY: -1,
      preventDefault: () => {},
    } as unknown as WheelEvent);

    expect(handled).toBe(true);
    expect(ctrl.zoom).toBeGreaterThan(200);
    expect(lastZoom).toBe(ctrl.zoom);
  });

  it("Ctrl 없는 wheel은 무시", () => {
    const ctrl = new SnapZoomController(noop, { zoom: 200 });

    const handled = ctrl.handleWheel({
      ctrlKey: false,
      deltaY: -1,
      preventDefault: () => {},
    } as unknown as WheelEvent);

    expect(handled).toBe(false);
    expect(ctrl.zoom).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// snap cycling
// ---------------------------------------------------------------------------

describe("SnapZoomController snap cycling", () => {
  it("nextSnap으로 스냅 분할 증가", () => {
    let lastSnap = 4;
    const ctrl = new SnapZoomController({
      onZoomChange: () => {},
      onSnapChange: (s) => { lastSnap = s; },
    }, { snapDivision: 4 });

    ctrl.nextSnap();
    expect(ctrl.snapDivision).toBe(6);
    expect(lastSnap).toBe(6);
  });

  it("prevSnap으로 스냅 분할 감소", () => {
    const ctrl = new SnapZoomController(noop, { snapDivision: 4 });

    ctrl.prevSnap();
    expect(ctrl.snapDivision).toBe(3);
  });

  it("마지막에서 nextSnap은 처음으로 순환", () => {
    const ctrl = new SnapZoomController(noop, { snapDivision: 48 });

    ctrl.nextSnap();
    expect(ctrl.snapDivision).toBe(1);
  });

  it("처음에서 prevSnap은 마지막으로 순환", () => {
    const ctrl = new SnapZoomController(noop, { snapDivision: 1 });

    ctrl.prevSnap();
    expect(ctrl.snapDivision).toBe(48);
  });
});

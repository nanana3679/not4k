import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MIN_ZOOM,
  MAX_ZOOM,
  clampZoom,
  zoomAfterWheel,
  zoomAfterPinch,
  nextSnapDivision,
  prevSnapDivision,
  viewportSourceFromStore,
} from './viewportSlice';
import { useEditorStore } from './editorStore';

/** 뷰포트 상태만 초기값으로 되돌린다 (다른 슬라이스 필드는 건드리지 않음). */
function resetViewport() {
  useEditorStore.setState({
    zoom: 200,
    snapDivision: 4,
    scrollY: 0,
    horizontalPanX: 0,
    timelineRangeMs: null,
    viewportHeightPx: null,
  });
}

beforeEach(resetViewport);

// ---------------------------------------------------------------------------
// 순수 규칙 (구 SnapZoomController 승계)
// ---------------------------------------------------------------------------

describe('뷰포트 순수 규칙', () => {
  it('clampZoom: 49 → 50(MIN), 2001 → 2000(MAX), 200은 그대로', () => {
    expect(clampZoom(49)).toBe(MIN_ZOOM);
    expect(clampZoom(2001)).toBe(MAX_ZOOM);
    expect(clampZoom(200)).toBe(200);
  });

  it('zoomAfterWheel: 휠 위(deltaY<0)는 ×1.1 확대, 아래는 ÷1.1 축소', () => {
    expect(zoomAfterWheel(200, -1)).toBeCloseTo(220);
    expect(zoomAfterWheel(220.00000000000003, 1)).toBeCloseTo(200);
  });

  it('zoomAfterWheel: MAX(2000)에서 확대해도 2000에 클램프', () => {
    expect(zoomAfterWheel(2000, -1)).toBe(MAX_ZOOM);
  });

  it('zoomAfterPinch: 거리 100→200이면 줌 200→400, 거리 0은 무효(null)', () => {
    expect(zoomAfterPinch(200, 100, 200)).toBeCloseTo(400);
    expect(zoomAfterPinch(200, 0, 200)).toBeNull();
    expect(zoomAfterPinch(200, 100, 0)).toBeNull();
  });

  it('nextSnapDivision: 4 → 6, 마지막 프리셋 48 → 1로 순환', () => {
    expect(nextSnapDivision(4)).toBe(6);
    expect(nextSnapDivision(48)).toBe(1);
  });

  it('prevSnapDivision: 1 → 48로 역순환', () => {
    expect(prevSnapDivision(1)).toBe(48);
  });

  it('프리셋 밖 값(5)에서 next는 첫 프리셋(1)로 진입한다 (구 동작 보존)', () => {
    expect(nextSnapDivision(5)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 액션 — 클램프 내장
// ---------------------------------------------------------------------------

describe('뷰포트 액션', () => {
  it('setZoom(3000)은 MAX(2000)로 클램프된다', () => {
    useEditorStore.getState().setZoom(3000);
    expect(useEditorStore.getState().zoom).toBe(MAX_ZOOM);
  });

  it('setSnapDivision(0)은 무시된다 (1 미만 가드)', () => {
    useEditorStore.getState().setSnapDivision(0);
    expect(useEditorStore.getState().snapDivision).toBe(4);
  });

  it('cycleSnap("next")는 4 → 6으로 이동', () => {
    useEditorStore.getState().cycleSnap('next');
    expect(useEditorStore.getState().snapDivision).toBe(6);
  });

  it('클램프 입력 미배선(null)이면 setScrollY는 음수만 0으로 막고 큰 값은 통과', () => {
    useEditorStore.getState().setScrollY(-10);
    expect(useEditorStore.getState().scrollY).toBe(0);
    useEditorStore.getState().setScrollY(999999);
    expect(useEditorStore.getState().scrollY).toBe(999999);
  });

  it('범위(10초)·뷰포트(400px) 배선 시 zoom=100에서 maxScroll=700으로 클램프', () => {
    // timelineHeight = 10000ms × 100px/s ÷ 1000 + 50(패딩)×2 = 1100 → max = 1100 − 400 = 700
    const s = useEditorStore.getState();
    s.setZoom(100);
    s.setTimelineRangeMs({ minTimeMs: 0, totalTimelineMs: 10000 });
    s.setViewportHeightPx(400);
    useEditorStore.getState().setScrollY(9999);
    expect(useEditorStore.getState().scrollY).toBe(700);
  });

  it('줌아웃하면 scrollY가 새 maxScroll로 함께 재클램프된다', () => {
    const s = useEditorStore.getState();
    s.setZoom(100);
    s.setTimelineRangeMs({ minTimeMs: 0, totalTimelineMs: 10000 });
    s.setViewportHeightPx(400);
    useEditorStore.getState().setScrollY(700); // maxScroll(줌100) = 700
    useEditorStore.getState().setZoom(50); // timelineHeight = 500+100 → max = 200
    expect(useEditorStore.getState().scrollY).toBe(200);
  });

  it('setViewportHeightPx로 뷰포트가 커져도 scrollY가 범위 안으로 재클램프된다', () => {
    const s = useEditorStore.getState();
    s.setZoom(100);
    s.setTimelineRangeMs({ minTimeMs: 0, totalTimelineMs: 10000 });
    s.setViewportHeightPx(400);
    useEditorStore.getState().setScrollY(700);
    useEditorStore.getState().setViewportHeightPx(1000); // max = 1100 − 1000 = 100
    expect(useEditorStore.getState().scrollY).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// ViewportSource — 비-React 구독자용 읽기 seam
// ---------------------------------------------------------------------------

describe('ViewportSource', () => {
  it('get()은 뷰포트 4값 스냅샷을 돌려준다', () => {
    const source = viewportSourceFromStore(useEditorStore);
    expect(source.get()).toEqual({
      zoom: 200,
      snapDivision: 4,
      scrollY: 0,
      horizontalPanX: 0,
    });
  });

  it('zoom 변경 시 구독자에게 통지하고, unsubscribe 후에는 통지하지 않는다', () => {
    const source = viewportSourceFromStore(useEditorStore);
    const listener = vi.fn();
    const unsubscribe = source.subscribe(listener);

    useEditorStore.getState().setZoom(300);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    useEditorStore.getState().setZoom(400);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('뷰포트 외 상태 변경(setMode)에는 통지하지 않는다', () => {
    const source = viewportSourceFromStore(useEditorStore);
    const listener = vi.fn();
    source.subscribe(listener);

    useEditorStore.getState().setMode('select');
    expect(listener).not.toHaveBeenCalled();
    useEditorStore.getState().setMode('create'); // 원복
  });
});

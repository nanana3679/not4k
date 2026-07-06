/**
 * 뷰포트 슬라이스 — 에디터 뷰포트 상태의 단독 소유자.
 *
 * 소유권 헌장: zoom·snapDivision·scrollY·horizontalPanX의 쓰기는 이 슬라이스의
 * 액션으로만 한다. 렌더러·컨트롤러·훅에 뷰포트 상태를 복제 저장하지 말 것 —
 * 렌더러는 `ViewportSource`로 구독만 한다(내부 캐시는 구독 파생이지 소유가 아니다).
 * 이전에는 editorStore·TimelineRenderer·SnapZoomController 3곳이 같은 값을 들고
 * App.tsx의 useEffect 6개가 양방향 동기화했다 — 이중 쓰기 race와 규칙 산재의 원인.
 *
 * 클램프·제스처 규칙(줌 한계, 휠/핀치 변환, 스냅 프리셋 사이클)은 이 파일의
 * 순수 함수가 소유한다(구 SnapZoomController 승계). 스냅 "수학"(snapBeat)은
 * 상태와 무관한 순수 계산이라 여기 두지 않는다.
 *
 * 클램프 입력(타임라인 ms 범위, 뷰포트 높이)은 외부 세계의 사실로 이 슬라이스에
 * 입주한다. 아직 배선되지 않아 null이면 클램프는 관대하게 통과한다(inert 슬라이스).
 */
import { getTimelineTotalHeight } from '../timeline/timelineProjection';
import { clampVerticalScroll } from '../timeline/timelineViewport';
import { TIMELINE_PADDING } from '../timeline/constants';

// --- 순수 규칙 (구 SnapZoomController 승계) ---------------------------------

export const MIN_ZOOM = 50;
export const MAX_ZOOM = 2000;
/** 휠 틱당 줌 배율 */
export const ZOOM_WHEEL_FACTOR = 1.1;
/** 스냅 분할 프리셋 (사이클 순서) */
export const SNAP_DIVISIONS: readonly number[] = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48];

export function clampZoom(zoom: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
}

/** 휠 줌: 위(deltaY<0) = 확대, 아래 = 축소. */
export function zoomAfterWheel(zoom: number, deltaY: number): number {
  const factor = deltaY < 0 ? ZOOM_WHEEL_FACTOR : 1 / ZOOM_WHEEL_FACTOR;
  return clampZoom(zoom * factor);
}

/** 핀치 줌: 두 손가락 거리 비율. 유효하지 않은 거리(≤0)면 null. */
export function zoomAfterPinch(
  zoom: number,
  startDistance: number,
  currentDistance: number,
): number | null {
  if (startDistance <= 0 || currentDistance <= 0) return null;
  return clampZoom(zoom * (currentDistance / startDistance));
}

/** 프리셋 사이클 다음 값. 프리셋 밖 값에서는 첫 프리셋으로 진입(구 동작 보존). */
export function nextSnapDivision(current: number): number {
  const i = SNAP_DIVISIONS.indexOf(current);
  return SNAP_DIVISIONS[(i + 1) % SNAP_DIVISIONS.length];
}

export function prevSnapDivision(current: number): number {
  const i = SNAP_DIVISIONS.indexOf(current);
  return SNAP_DIVISIONS[(i - 1 + SNAP_DIVISIONS.length) % SNAP_DIVISIONS.length];
}

// --- 상태 -------------------------------------------------------------------

/** 타임라인이 커버하는 시간 범위(ms). 차트·음원 길이에서 파생되는 외부 사실. */
export interface TimelineRangeMs {
  minTimeMs: number;
  totalTimelineMs: number;
}

export interface ViewportSlice {
  zoom: number; // pixelPerSecond
  snapDivision: number; // 1/N beat
  scrollY: number;
  /** 가로 팬(px). 클램프 배선 전까지 렌더러의 clampHorizontalPan이 겸임한다. */
  horizontalPanX: number;
  /** 세로 스크롤 클램프 입력 — 미배선(null)이면 클램프하지 않는다. */
  timelineRangeMs: TimelineRangeMs | null;
  viewportHeightPx: number | null;

  setZoom: (zoom: number) => void;
  zoomByWheel: (deltaY: number) => void;
  zoomByPinch: (startDistance: number, currentDistance: number) => void;
  setSnapDivision: (snapDivision: number) => void;
  cycleSnap: (direction: 'next' | 'prev') => void;
  setScrollY: (scrollY: number) => void;
  setHorizontalPanX: (x: number) => void;
  setTimelineRangeMs: (range: TimelineRangeMs | null) => void;
  setViewportHeightPx: (heightPx: number | null) => void;
}

/** 현재 상태에서의 세로 스크롤 클램프. 입력 미배선이면 관대 통과. */
export function clampScrollYFor(
  state: Pick<ViewportSlice, 'zoom' | 'timelineRangeMs' | 'viewportHeightPx'>,
  requestedScrollY: number,
): number {
  if (state.timelineRangeMs === null || state.viewportHeightPx === null) {
    return Math.max(0, requestedScrollY);
  }
  return clampVerticalScroll({
    requestedScrollY,
    timelineHeight: getTimelineTotalHeight({
      totalTimelineMs: state.timelineRangeMs.totalTimelineMs,
      minTimeMs: state.timelineRangeMs.minTimeMs,
      zoom: state.zoom,
      padding: TIMELINE_PADDING,
    }),
    viewportHeight: state.viewportHeightPx,
  });
}

type SliceSet = (
  partial: Partial<ViewportSlice> | ((state: ViewportSlice) => Partial<ViewportSlice>),
) => void;

export function createViewportSlice(set: SliceSet, get: () => ViewportSlice): ViewportSlice {
  /** zoom 변경은 maxScroll을 바꾸므로 scrollY를 함께 재클램프한다. */
  const applyZoom = (zoom: number) => {
    set((state) => {
      const clamped = clampZoom(zoom);
      return {
        zoom: clamped,
        scrollY: clampScrollYFor({ ...state, zoom: clamped }, state.scrollY),
      };
    });
  };

  return {
    zoom: 200,
    snapDivision: 4,
    scrollY: 0,
    horizontalPanX: 0,
    timelineRangeMs: null,
    viewportHeightPx: null,

    setZoom: (zoom) => applyZoom(zoom),
    zoomByWheel: (deltaY) => applyZoom(zoomAfterWheel(get().zoom, deltaY)),
    zoomByPinch: (startDistance, currentDistance) => {
      const next = zoomAfterPinch(get().zoom, startDistance, currentDistance);
      if (next !== null) applyZoom(next);
    },
    setSnapDivision: (snapDivision) => {
      if (snapDivision < 1) return; // 구 SnapZoomController 가드 보존
      set({ snapDivision });
    },
    cycleSnap: (direction) =>
      set((state) => ({
        snapDivision:
          direction === 'next'
            ? nextSnapDivision(state.snapDivision)
            : prevSnapDivision(state.snapDivision),
      })),
    setScrollY: (scrollY) => set((state) => ({ scrollY: clampScrollYFor(state, scrollY) })),
    setHorizontalPanX: (horizontalPanX) => set({ horizontalPanX }),
    setTimelineRangeMs: (timelineRangeMs) =>
      set((state) => ({
        timelineRangeMs,
        // 범위가 줄면 기존 scrollY가 범위 밖일 수 있다 — 입주 시점에 재클램프
        scrollY: clampScrollYFor({ ...state, timelineRangeMs }, state.scrollY),
      })),
    setViewportHeightPx: (viewportHeightPx) =>
      set((state) => ({
        viewportHeightPx,
        scrollY: clampScrollYFor({ ...state, viewportHeightPx }, state.scrollY),
      })),
  };
}

// --- ViewportSource — 렌더러 등 비-React 구독자를 위한 좁은 읽기 seam --------

/** 읽기 전용 스냅샷. 이 통로로는 쓰기가 불가능하다. */
export interface ViewportSnapshot {
  readonly zoom: number;
  readonly snapDivision: number;
  readonly scrollY: number;
  readonly horizontalPanX: number;
}

export interface ViewportSource {
  get(): ViewportSnapshot;
  /** 뷰포트 4값 중 하나라도 바뀔 때만 통지한다. 반환값은 unsubscribe. */
  subscribe(listener: () => void): () => void;
}

export function viewportSnapshotOf(state: ViewportSlice): ViewportSnapshot {
  return {
    zoom: state.zoom,
    snapDivision: state.snapDivision,
    scrollY: state.scrollY,
    horizontalPanX: state.horizontalPanX,
  };
}

/** zustand store(editorStore)를 ViewportSource adapter로 감싼다. 테스트는 fake를 쓴다. */
export function viewportSourceFromStore(store: {
  getState(): ViewportSlice;
  subscribe(listener: (state: ViewportSlice, prev: ViewportSlice) => void): () => void;
}): ViewportSource {
  return {
    get: () => viewportSnapshotOf(store.getState()),
    subscribe: (listener) =>
      store.subscribe((state, prev) => {
        if (
          state.zoom !== prev.zoom ||
          state.snapDivision !== prev.snapDivision ||
          state.scrollY !== prev.scrollY ||
          state.horizontalPanX !== prev.horizontalPanX
        ) {
          listener();
        }
      }),
  };
}

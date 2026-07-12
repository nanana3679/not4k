/**
 * useCanvasEvents — 캔버스 포인터 이벤트 핸들러들
 */

import { useCallback, useRef } from 'react';
import type { RefObject } from 'react';
import type { TimelineRenderer } from '../timeline/TimelineRenderer';
import type { PlaybackController } from '../playback/PlaybackController';
import type { CreateMode, SelectMode, EntityType, EditResult } from '../modes';
import { DeleteMode, isEventEntityType, activeEditorMode } from '../modes';
import { MEASURE_LABEL_WIDTH, TIMELINE_WIDTH } from '../timeline/constants';
import { isPlaybackCursorSeekArea } from '../timeline/timelineViewport';
import { noteExistsAtSnap, extraNoteExistsAtSnap } from '../timeline/hitTest';
import { beatToMs, mainNotes, auxNotesAsExtra, withAuxNotes } from '../../shared';
import type { ExtraNoteEntity } from '../../shared';
import { useEditorStore } from '../stores';
import {
  deleteChartNoteAtLaneBeat,
  deleteEmptyTrillZoneAtIndex,
  deleteExtraNoteAtIndex,
  deleteExtraNoteAtLaneBeat,
} from '../editing/editApplication';
import type { CoordinateHelpers } from './useCoordinateHelpers';
import {
  TOUCH_MOVE_CANCEL_PX,
  didTouchMoveBeyondTapSlop,
  shouldPromoteTapToggleToBox,
  shouldRunTouchBoxSelectDrag,
} from './touchGesture';
import { GestureRecognizer, type Gesture, type PointerSample } from './gestureRecognizer';
import {
  nextTouchMultiSelectLatch,
  resolveHoldFireAction,
  resolveSelectTouchDownSchedule,
  resolveTouchCreateUpAction,
  shouldArmHoldTimer,
  shouldDeleteOnUp,
  shouldFireTapToggle,
  type EditorTouchMode,
  type HoldHits,
} from './touchEditRouting';

export interface CanvasEventHandlers {
  handlePointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  handlePointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  handlePointerUp: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  handlePointerCancel: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  handlePointerLeave: () => void;
  handleDoubleClick: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  handleContextMenu: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  rightDragDeletedRef: RefObject<boolean>;
}

const LONG_PRESS_MS = 450;

// 노트·엑스트라 탭 토글은 up에서 동일 처리되므로 후보는 한 형태다(kind 구분 불필요).
type TouchTapToggleCandidate = {
  pointerId: number;
  x: number;
  y: number;
  moved: boolean;
  startClientX: number;
  startClientY: number;
};

type TouchEmptySelectCandidate = {
  pointerId: number;
  x: number;
  y: number;
  moved: boolean;
  startClientX: number;
  startClientY: number;
};

function getLongPressRangeType(type: EntityType): "long" | "doubleLong" | null {
  if (type === "single") return "long";
  if (type === "double") return "doubleLong";
  return null;
}

export function useCanvasEvents(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  rendererRef: RefObject<TimelineRenderer | null>,
  playbackRef: RefObject<PlaybackController | null>,
  createModeRef: RefObject<CreateMode | null>,
  selectModeRef: RefObject<SelectMode | null>,
  deleteModeRef: RefObject<DeleteMode | null>,
  isDraggingCursorRef: RefObject<boolean>,
  coords: CoordinateHelpers,
  isTimeInBounds: (y: number) => boolean,
  onPinchZoom?: (previousDistance: number, currentDistance: number, centerCanvasY: number) => void,
  onHorizontalPan?: (deltaX: number) => void,
  onVerticalPan?: (deltaY: number) => void,
  onNavigationInteraction?: () => void,
): CanvasEventHandlers {
  const mode = useEditorStore((s) => s.mode);
  const entityType = useEditorStore((s) => s.entityType);
  const chart = useEditorStore((s) => s.chart);
  const setChart = useEditorStore((s) => s.setChart);
  // ③ 어댑터: 보조 편집을 chart.notes 재구성으로 번역 (RFD 0018) — 현재 메인 + 새 보조 병합.
  const applyExtraNotes = useCallback((extra: ExtraNoteEntity[]) => {
    const cur = useEditorStore.getState().chart;
    useEditorStore.getState().setChart({ ...cur, notes: withAuxNotes(cur.notes, extra) });
  }, []);
  const clearExtraSelection = useEditorStore((s) => s.clearExtraSelection);
  const setEditingMarker = useEditorStore((s) => s.setEditingMarker);
  const addToast = useEditorStore((s) => s.addToast);

  const {
    xToLane, xToExtraLane,
    yToBeat, snapBeat,
    bpmMarkers,
    hitTestNoteRef, hitTestNoteEndRef, hitTestExtraNoteRef,
    hitTestTrillZoneEndRef, hitTestTrillZoneHandleRef, hitTestTrillZoneRef,
    yToBeatRawRef,
    hitTestNote, hitTestTrillZone, hitTestExtraNote,
  } = coords;

  const rightDragDeletedRef = useRef(false);
  const recognizerRef = useRef(new GestureRecognizer());
  // 롱프레스 hold 생명주기(arm/moved/발화/결말)는 recognizer가 소유한다.
  // 훅은 tick을 ~450ms 시점에 한 번 poke하는 타이머만 붙든다(Time-A 스케줄러).
  const holdTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const touchEmptySelectCandidateRef = useRef<TouchEmptySelectCandidate | null>(null);
  const touchMultiSelectRef = useRef(false);
  const touchTapToggleRef = useRef<TouchTapToggleCandidate | null>(null);
  const suppressContextMenuUntilRef = useRef(0);

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const startTouchEmptySelectCandidate = useCallback((
    e: React.PointerEvent<HTMLCanvasElement>,
    x: number,
    y: number,
  ) => {
    touchEmptySelectCandidateRef.current = {
      pointerId: e.pointerId,
      x,
      y,
      moved: false,
      startClientX: e.clientX,
      startClientY: e.clientY,
    };
  }, []);

  const clearTouchEmptySelectCandidate = useCallback(() => {
    touchEmptySelectCandidateRef.current = null;
  }, []);

  const deleteAtPoint = useCallback((x: number, y: number) => {
    deleteModeRef.current?.onPointerDown(x, y);
  }, [deleteModeRef]);

  // 터치 down에서 롱프레스 hold 타이머를 무장한다. arm 여부는 (mode, rangeType, 히트)로 결정한다.
  // 발화(~450ms)하면 recognizer.tick을 poke해 longPress를 확인하고, 발화 좌표를 다시 히트테스트해
  // 액션(범위 생성/선택 드래그/삭제)을 재도출한다 — 후보 payload를 훅에 두지 않아 form A를 지킨다.
  // mode·entityType은 arm 시점 값을 클로저로 고정한다(수동 hold 동안 불변).
  const armHoldTimer = useCallback((
    x: number,
    y: number,
    hits: HoldHits,
    mode: EditorTouchMode,
    entityType: EntityType,
  ) => {
    const rangeType = getLongPressRangeType(entityType);
    const placementBlocked = mode === 'create'
      ? (createModeRef.current?.isPlacementBlocked(x, y) ?? false)
      : false;
    if (!shouldArmHoldTimer({ mode, rangeType, placementBlocked, hits })) return;
    clearHoldTimer();
    holdTimerRef.current = window.setTimeout(() => {
      const fired = recognizerRef.current
        .tick(performance.now())
        .find((g): g is Extract<Gesture, { kind: 'longPress' }> => g.kind === 'longPress');
      if (!fired) return;
      const { x: fx, y: fy } = fired;
      const fireHits: HoldHits = {
        noteHit: hitTestNoteRef.current(fx, fy),
        noteEndHit: hitTestNoteEndRef.current(fx, fy),
        extraHit: hitTestExtraNoteRef.current(fx, fy),
        zoneHit: hitTestTrillZoneRef.current(fx, fy),
      };
      const firePlacementBlocked = mode === 'create'
        ? (createModeRef.current?.isPlacementBlocked(fx, fy) ?? false)
        : false;
      const action = resolveHoldFireAction({ mode, rangeType, placementBlocked: firePlacementBlocked, hits: fireHits });
      if (action === 'none') return;
      suppressContextMenuUntilRef.current = Date.now() + 1200;
      if (action === 'delete') {
        deleteAtPoint(fx, fy);
      } else if (action === 'createRange' && rangeType) {
        createModeRef.current?.beginRangeNoteAt(fx, fy, rangeType);
        rendererRef.current?.hideGhostNote();
      } else if (action === 'selectDrag') {
        touchMultiSelectRef.current = true;
        useEditorStore.getState().setMode('select');
        selectModeRef.current?.beginLongPressDrag(fx, fy, {
          noteEndHit: fireHits.noteEndHit,
          noteHit: fireHits.noteHit,
          extraHit: fireHits.extraHit,
          zoneHit: fireHits.zoneHit,
        });
        rendererRef.current?.hideGhostNote();
      }
    }, LONG_PRESS_MS);
  }, [
    clearHoldTimer, deleteAtPoint, createModeRef, selectModeRef, rendererRef,
    hitTestNoteRef, hitTestNoteEndRef, hitTestExtraNoteRef, hitTestTrillZoneRef,
  ]);

  const toSample = useCallback((
    e: React.PointerEvent<HTMLCanvasElement>,
    phase: PointerSample['phase'],
  ): PointerSample => {
    // x/y는 편집 제스처(longPress/holdEnd)에 실려 모드로 전달되는 타임라인/캔버스 좌표다.
    // 발화 시 이 좌표로 히트테스트·생성·이동을 하므로 반드시 down 핸들러와 같은 변환이어야 한다.
    // (내비게이션은 clientX/clientY만 쓰므로 x/y 변경에 영향받지 않는다.)
    const rect = canvasRef.current?.getBoundingClientRect();
    const rawX = e.clientX - (rect?.left ?? 0);
    const canvasY = e.clientY - (rect?.top ?? 0);
    const timelineX = rendererRef.current?.screenXToTimelineX(rawX) ?? rawX;
    return {
      pointerId: e.pointerId,
      pointerType: e.pointerType as PointerSample['pointerType'],
      phase,
      x: timelineX,
      y: canvasY,
      clientX: e.clientX,
      clientY: e.clientY,
      // tick(performance.now())과 반드시 같은 시계여야 경과 계산이 맞다(Time-A).
      timeMs: performance.now(),
      button: e.button,
      buttons: e.buttons,
    };
  }, [canvasRef, rendererRef]);

  // 두 손가락 내비가 편집을 가로챌 때(editCancel) 진행 중이던 편집 후보를 폐기한다.
  // recognizer는 2번째 손가락 down에서 자기 hold를 이미 버렸다(editCancel 방출). 훅은 타이머와
  // 남은 후보(empty-select/tap-toggle)만 정리하고, 발화했을 수 있는 create 드래그를 취소한다.
  const handleEditCancel = useCallback(() => {
    clearHoldTimer();
    touchEmptySelectCandidateRef.current = null;
    touchTapToggleRef.current = null;
    createModeRef.current?.cancelDrag();
    // 발화했을 수 있는 select 드래그(이동/리사이즈/박스)도 폐기하고 프리뷰를 걷는다.
    const selectResult = selectModeRef.current?.cancel();
    if (selectResult?.clearDragPreview) {
      rendererRef.current?.clearMoveOrigins();
      rendererRef.current?.clearBoxSelectRect();
    }
    rendererRef.current?.hideGhostNote();
  }, [clearHoldTimer, createModeRef, selectModeRef, rendererRef]);

  const routeViewportGestures = useCallback((gestures: Gesture[], rect: DOMRect) => {
    for (const g of gestures) {
      if (g.kind === "viewportScroll" && g.axis === "horizontal") {
        onHorizontalPan?.(g.deltaX);
      } else if (g.kind === "viewportScroll" && g.axis === "vertical") {
        onVerticalPan?.(g.deltaY);
      } else if (g.kind === "viewportZoom") {
        onPinchZoom?.(g.previousDistance, g.currentDistance, g.centerClientY - rect.top);
      }
    }
  }, [onHorizontalPan, onPinchZoom, onVerticalPan]);

  // hold 후보(롱프레스/create/delete)의 tap-slop·moved 추적은 recognizer.feed(move)가 소유한다.
  // 훅은 아직 recognizer로 옮기지 않은 후보(empty-select/tap-toggle)의 moved만 여기서 갱신한다.
  const updateTouchMovement = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const emptySelectCandidate = touchEmptySelectCandidateRef.current;
    if (emptySelectCandidate?.pointerId === e.pointerId && !emptySelectCandidate.moved) {
      if (didTouchMoveBeyondTapSlop({
        startClientX: emptySelectCandidate.startClientX,
        startClientY: emptySelectCandidate.startClientY,
        clientX: e.clientX,
        clientY: e.clientY,
        tapSlopPx: TOUCH_MOVE_CANCEL_PX,
      })) {
        emptySelectCandidate.moved = true;
        rendererRef.current?.hideGhostNote();
      }
    }

    const tapToggle = touchTapToggleRef.current;
    if (tapToggle?.pointerId === e.pointerId && !tapToggle.moved) {
      if (didTouchMoveBeyondTapSlop({
        startClientX: tapToggle.startClientX,
        startClientY: tapToggle.startClientY,
        clientX: e.clientX,
        clientY: e.clientY,
        tapSlopPx: TOUCH_MOVE_CANCEL_PX,
      })) {
        tapToggle.moved = true;
      }
    }
  }, [rendererRef]);

  // 마커 히트테스트 (extra lane — editorLane 기반)
  const hitTestMarker = useCallback((x: number, y: number) => {
    const extraLane = xToExtraLane(x);
    if (!extraLane) return null;
    const beat = yToBeat(y);
    const testBeatFloat = beat.n / beat.d;
    const tolerance = 1 / 8;
    for (let i = 0; i < chart.events.length; i++) {
      const evt = chart.events[i];
      if ((evt.editorLane ?? 1) !== extraLane) continue;
      const startFloat = evt.beat.n / evt.beat.d;
      const endFloat = 'endBeat' in evt ? evt.endBeat.n / evt.endBeat.d : startFloat;
      if (testBeatFloat >= startFloat - tolerance && testBeatFloat <= endFloat + tolerance) {
        return { type: 'event' as const, index: i };
      }
    }
    return null;
  }, [chart.events, xToExtraLane, yToBeat]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'touch') {
      e.preventDefault();
      suppressContextMenuUntilRef.current = Date.now() + 1200;
      const navGestures = recognizerRef.current.feed(toSample(e, 'down'));
      canvasRef.current?.setPointerCapture(e.pointerId);
      if (navGestures.some((g) => g.kind === 'editCancel')) {
        handleEditCancel();
        return;
      }
    }

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const rawX = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (rendererRef.current?.handleMinimapPointerDown(rawX, y)) {
      onNavigationInteraction?.();
      canvasRef.current?.setPointerCapture(e.pointerId);
      return;
    }

    const renderer = rendererRef.current;
    const x = renderer?.screenXToTimelineX(rawX) ?? rawX;
    const curTimelineWidth = rendererRef.current?.currentTimelineWidth ?? TIMELINE_WIDTH;
    if (renderer && isPlaybackCursorSeekArea({
      screenX: rawX,
      timelineX: x,
      timelineWidth: curTimelineWidth,
      leftRailWidth: MEASURE_LABEL_WIDTH,
      railStartX: renderer.contentCenterShiftX,
    })) {
      isDraggingCursorRef.current = true;
      const timeMs = renderer.clampToMeasureRange(renderer.yToTime(y));
      playbackRef.current?.seekTo(timeMs);
      canvasRef.current?.setPointerCapture(e.pointerId);
      return;
    }

    const touchNoteHit = e.pointerType === 'touch' ? hitTestNoteRef.current(x, y) : null;
    const touchNoteEndHit = e.pointerType === 'touch' ? hitTestNoteEndRef.current(x, y) : null;
    const touchExtraHit = e.pointerType === 'touch' ? hitTestExtraNoteRef.current(x, y) : null;

    if (e.button === 2) {
      rightDragDeletedRef.current = false;
      canvasRef.current?.setPointerCapture(e.pointerId);
      return;
    }

    if (e.pointerType === 'touch') {
      // 롱프레스 hold(범위 생성/선택 드래그/드래그 삭제) 타이머를 무장한다.
      // arm 여부·발화 액션은 순수함수가 (mode, rangeType, 히트)로 정한다(recognizer가 hold 생명주기 소유).
      armHoldTimer(
        x,
        y,
        {
          noteHit: touchNoteHit,
          noteEndHit: touchNoteEndHit,
          extraHit: touchExtraHit,
          zoneHit: hitTestTrillZoneRef.current(x, y),
        },
        mode,
        entityType as EntityType,
      );

      if (mode === 'create' && createModeRef.current) {
        if (createModeRef.current.isPlacementBlocked(x, y)) return;
        // 범위 엔티티(single/double 롱프레스)는 hold가 처리 — down에서 점노트를 배치하지 않는다.
        if (getLongPressRangeType(entityType as EntityType)) return;
        // 점노트는 아래 다형 디스패치로 폴스루(down 즉시 배치).
      } else if (mode === 'select' && selectModeRef.current) {
        // 트릴존 핸들/끝은 경계에 겹친 노트보다 우선(마우스 onPointerDown 우선순위와 일치).
        const schedule = resolveSelectTouchDownSchedule({
          noteHit: touchNoteHit,
          extraHit: touchExtraHit,
          zoneHandleHit: hitTestTrillZoneHandleRef.current(x, y),
          zoneEndHit: hitTestTrillZoneEndRef.current(x, y),
        });
        if (schedule === 'tapToggle') {
          touchTapToggleRef.current = {
            pointerId: e.pointerId,
            x,
            y,
            moved: false,
            startClientX: e.clientX,
            startClientY: e.clientY,
          };
        } else {
          startTouchEmptySelectCandidate(e, x, y);
        }
        return;
      } else if (mode === 'delete' && deleteModeRef.current) {
        // 드래그 삭제(hold 발화)와 탭 삭제(up)는 hold + holdEnd 경로가 처리한다.
        return;
      }
    }

    // 마우스 down(및 레인지 타입 아닌 터치 create)은 모드 다형 디스패치로 통합한다.
    activeEditorMode(mode, createModeRef.current, selectModeRef.current, deleteModeRef.current)
      ?.handlePointerDown({ x, y, shiftKey: e.shiftKey, altKey: e.altKey, toggleSelection: false });
  }, [
    mode, entityType,
    toSample, handleEditCancel, armHoldTimer, hitTestTrillZoneRef,
    startTouchEmptySelectCandidate,
    canvasRef, createModeRef, deleteModeRef, hitTestExtraNoteRef,
    hitTestNoteEndRef, hitTestNoteRef, hitTestTrillZoneHandleRef, hitTestTrillZoneEndRef,
    isDraggingCursorRef, playbackRef, rendererRef,
    selectModeRef, onNavigationInteraction,
  ]);

  // 모드가 반환한 EditResult를 렌더러에 PUSH한다(훅이 모드 내부 getter를 PULL하던 것을 대체).
  const applyEditResult = useCallback((result?: EditResult) => {
    const renderer = rendererRef.current;
    if (!renderer || !result) return;
    const preview = result.preview;
    if (preview?.boxSelectRect) {
      renderer.setBoxSelectRect(preview.boxSelectRect);
      renderer.render();
    }
    if (preview?.moveOrigins) {
      renderer.setMoveOrigins(preview.moveOrigins);
    }
    if (result.clearDragPreview) {
      renderer.clearMoveOrigins();
      renderer.clearBoxSelectRect();
    }
    if (result.hideGhost) {
      renderer.hideGhostNote();
    }
  }, [rendererRef]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    let navGestures: Gesture[] = [];
    if (e.pointerType === 'touch') {
      e.preventDefault();
      navGestures = recognizerRef.current.feed(toSample(e, 'move'));
      updateTouchMovement(e);
    }

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    if (e.pointerType === 'touch' && recognizerRef.current.activeTouchCount >= 2) {
      routeViewportGestures(navGestures, rect);
      return;
    }

    const rawX = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (rendererRef.current?.handleMinimapPointerMove(rawX, y)) {
      onNavigationInteraction?.();
      return;
    }

    const x = rendererRef.current?.screenXToTimelineX(rawX) ?? rawX;

    // hold 생명주기는 recognizer가 소유 — 이 pointer의 발화/이동 상태를 조회해 연속 처리를 가른다.
    const holdState = e.pointerType === 'touch'
      ? recognizerRef.current.holdState(e.pointerId)
      : null;

    // 드래그 삭제: 발화한 delete hold는 이동마다 히트 지점을 삭제한다.
    if (mode === 'delete' && holdState?.fired) {
      deleteAtPoint(x, y);
      return;
    }

    // create 범위 후보가 발화 전 tap-slop을 넘으면(스크롤성) 고스트를 숨기고 만다.
    // (범위 엔티티일 때만 — 점노트 모드에서 노트를 롱프레스한 hold는 select-drag 의도라 여기서 걸지 않는다.)
    if (
      mode === 'create' &&
      getLongPressRangeType(entityType as EntityType) &&
      holdState &&
      holdState.moved &&
      !holdState.fired
    ) {
      rendererRef.current?.hideGhostNote();
      return;
    }

    // 노트/엑스트라 위에서 시작한 tapToggle 후보도 slop을 넘으면 박스로 승격한다 (RFD 0016 §4.4).
    // 승격은 후보를 empty-select 후보로 전환해 기존 박스 재생·up 경로를 그대로 태운다
    // (beginBoxSelect가 드래그를 시작하므로 재생 onPointerDown은 idempotency 가드에 걸려 no-op).
    const tapCand = touchTapToggleRef.current;
    if (
      tapCand &&
      shouldPromoteTapToggleToBox({
        pointerType: e.pointerType,
        editorMode: mode,
        candidatePointerId: tapCand.pointerId,
        pointerId: e.pointerId,
        moved: tapCand.moved,
        activeTouchCount: recognizerRef.current.activeTouchCount,
        holdFired: holdState?.fired ?? false,
      }) &&
      selectModeRef.current
    ) {
      selectModeRef.current.beginBoxSelect(tapCand.x, tapCand.y);
      touchEmptySelectCandidateRef.current = {
        pointerId: tapCand.pointerId,
        x: tapCand.x,
        y: tapCand.y,
        moved: true,
        startClientX: tapCand.startClientX,
        startClientY: tapCand.startClientY,
      };
      touchTapToggleRef.current = null;
    }

    const emptySelectCandidate = touchEmptySelectCandidateRef.current;
    if (
      emptySelectCandidate &&
      shouldRunTouchBoxSelectDrag({
        pointerType: e.pointerType,
        editorMode: mode,
        candidatePointerId: emptySelectCandidate.pointerId,
        pointerId: e.pointerId,
        moved: emptySelectCandidate.moved,
        activeTouchCount: recognizerRef.current.activeTouchCount,
      }) &&
      selectModeRef.current
    ) {
      // 박스 시작은 SelectMode.onPointerDown이 idempotent하게 처리한다(진행 중이면 no-op).
      selectModeRef.current.onPointerDown(
        emptySelectCandidate.x,
        emptySelectCandidate.y,
        false,
        false,
      );
      const boxResult = selectModeRef.current.onPointerMove(x, y);
      applyEditResult(boxResult);
      return;
    }

    const hoverNoteHit = hitTestNoteRef.current(x, y);
    const hoverExtraHit = hitTestExtraNoteRef.current(x, y);
    // trillZone hover는 select 모드에서만. 드래그(리사이즈/구간 이동) 중이면 SelectMode가
    // 그 구간을 래치해 커서가 밖으로 나가도 계속 표시한다(래치 결정을 모드가 소유 = PUSH).
    const hoveredTrillZone = mode === 'select'
      ? selectModeRef.current?.computeHoveredTrillZone(x, y) ?? null
      : null;
    if (rendererRef.current) {
      // 렌더러 hover는 통합 인덱스 공간 (RFD 0018 ② — 보조 = 메인 개수 + extraIdx)
      const hoverUnified = hoverNoteHit !== null
        ? hoverNoteHit
        : hoverExtraHit !== null
          ? useEditorStore.getState().chart.notes.length + hoverExtraHit
          : null;
      rendererRef.current.setHoveredNote(hoverUnified);
      rendererRef.current.setHoveredTrillZone(hoveredTrillZone);
      // 롱노트 리사이즈 캡은 select 모드에서 노트에 hover했을 때만 표시한다.
      rendererRef.current.setResizeHoverNote(mode === 'select' ? hoverNoteHit : null);
    }

    // 트릴 핸들 위 커서: 이동 필=move, 리사이즈 캡=ns-resize(↕). select 모드에서만.
    const canvasEl = canvasRef.current;
    if (canvasEl) {
      let cursor = '';
      if (mode === 'select') {
        if (hitTestTrillZoneHandleRef.current(x, y) !== null) cursor = 'move';
        else if (hitTestTrillZoneEndRef.current(x, y) !== null) cursor = 'ns-resize';
        else {
          // 롱노트 끝 캡 위: z-order 최상위 노트일 때만 리사이즈 커서(겹친 끝점 가로채기 방지)
          const noteEnd = hitTestNoteEndRef.current(x, y);
          if (noteEnd !== null && hitTestNoteRef.current(x, y) === noteEnd) cursor = 'ns-resize';
        }
      }
      if (canvasEl.style.cursor !== cursor) canvasEl.style.cursor = cursor;
    }
    const isHoveringEntity = hoverNoteHit !== null || hoverExtraHit !== null;

    if (isDraggingCursorRef.current && rendererRef.current) {
      const timeMs = rendererRef.current.clampToMeasureRange(rendererRef.current.yToTime(y));
      playbackRef.current?.seekTo(timeMs);
      return;
    }

    // 선택 드래그: 발화한 select hold(롱프레스 이동/리사이즈)는 이동을 모드로 흘려보낸다.
    if (mode === 'select' && holdState?.fired && selectModeRef.current) {
      const longPressResult = selectModeRef.current.onPointerMove(x, y);
      applyEditResult(longPressResult);
      return;
    }

    // 우클릭 드래그 삭제
    if (e.buttons & 2) {
      const rawBeatDel = yToBeatRawRef.current(y);
      const beatFloat = rawBeatDel.n / rawBeatDel.d;

      const extraLane = xToExtraLane(x);
      if (extraLane !== null) {
        const currentExtra = auxNotesAsExtra(useEditorStore.getState().chart.notes);
        const updatedExtra = deleteExtraNoteAtLaneBeat(currentExtra, { extraLane, beatFloat });
        if (updatedExtra !== null) {
          rightDragDeletedRef.current = true;
          applyExtraNotes(updatedExtra);
          clearExtraSelection();
        }
        return;
      }

      const lane = xToLane(x);
      if (!lane) return;

      const current = useEditorStore.getState().chart;
      const updatedChart = deleteChartNoteAtLaneBeat(current, { lane, beatFloat });
      if (updatedChart !== null) {
        rightDragDeletedRef.current = true;
        setChart(updatedChart);
      }
      return;
    }

    if (mode === 'create' && createModeRef.current) {
      if (!isTimeInBounds(y) || isHoveringEntity) {
        rendererRef.current?.hideGhostNote();
        return;
      }

      createModeRef.current.onPointerMove(x, y);

      if (rendererRef.current) {
        const beat = yToBeat(y);
        const snapped = snapBeat(beat);
        const timeMs = beatToMs(snapped, bpmMarkers, useEditorStore.getState().chart.meta.offsetMs);

        if (createModeRef.current?.dragging && createModeRef.current.dragBeat) {
          if (createModeRef.current.dragType === 'event') {
            rendererRef.current.showGhostMarker(createModeRef.current.dragExtraLane ?? 1, timeMs);
          } else if (createModeRef.current.dragType === 'extraRangeNote' && createModeRef.current.dragExtraLane) {
            const startTimeMs = beatToMs(createModeRef.current.dragBeat, bpmMarkers, useEditorStore.getState().chart.meta.offsetMs);
            rendererRef.current.showGhostExtraRange(createModeRef.current.dragExtraLane, startTimeMs, timeMs);
          } else if (createModeRef.current.dragLane) {
            const startTimeMs = beatToMs(createModeRef.current.dragBeat, bpmMarkers, useEditorStore.getState().chart.meta.offsetMs);
            rendererRef.current.showGhostRange(createModeRef.current.dragLane, startTimeMs, timeMs);
          }
        } else {
          const snappedBeatFloat = snapped.n / snapped.d;
          const extraLane = xToExtraLane(x);
          if (extraLane) {
            if (isEventEntityType(entityType as import('../modes').EntityType)) {
              // Show ghost marker for event entity types on extra lanes
              rendererRef.current.showGhostMarker(extraLane, timeMs);
            } else {
              const existingExtra = extraNoteExistsAtSnap(auxNotesAsExtra(useEditorStore.getState().chart.notes), extraLane, snappedBeatFloat);
              if (existingExtra === null) {
                rendererRef.current.showGhostExtraNote(extraLane, timeMs);
              } else {
                rendererRef.current.hideGhostNote();
                // chart.notes 인덱스 공간: 보조 노트 i는 chart.notes[mainCount + i] (RFD 0018 ③)
                rendererRef.current.setHoveredNote(mainNotes(useEditorStore.getState().chart.notes).length + existingExtra);
              }
            }
          } else {
            const lane = xToLane(x);
            if (lane) {
              const existingNote = noteExistsAtSnap(useEditorStore.getState().chart.notes, lane, snappedBeatFloat);
              if (existingNote === null) {
                rendererRef.current.showGhostNote(lane, timeMs);
              } else {
                rendererRef.current.hideGhostNote();
                rendererRef.current.setHoveredNote(existingNote);
              }
            } else {
              rendererRef.current.hideGhostNote();
            }
          }
        }
      }
    } else if (mode === 'select' && selectModeRef.current) {
      const selectResult = selectModeRef.current.onPointerMove(x, y);
      applyEditResult(selectResult);
    }
  }, [
    mode, entityType, xToLane, xToExtraLane, yToBeat, snapBeat,
    bpmMarkers, isTimeInBounds, setChart, applyExtraNotes,
    clearExtraSelection, toSample, updateTouchMovement,
    routeViewportGestures, canvasRef, createModeRef, hitTestExtraNoteRef,
    hitTestNoteRef, isDraggingCursorRef, playbackRef, rendererRef,
    selectModeRef, yToBeatRawRef, deleteAtPoint,
    onNavigationInteraction, applyEditResult,
  ]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    let wasPinching = false;
    // hold 결말은 recognizer가 feed(up)에서 holdEnd로 알려준다(fired·moved·down 좌표).
    let holdFired = false;
    let holdMoved = false;
    let holdDown: { x: number; y: number } | null = null; // 있으면 = 이 pointer에 hold가 있었음
    let touchEmptySelectCandidate: TouchEmptySelectCandidate | null = null;
    if (e.pointerType === 'touch') {
      e.preventDefault();
      updateTouchMovement(e);
      wasPinching = recognizerRef.current.isNavigating || recognizerRef.current.activeTouchCount >= 2;
      const holdEnd = recognizerRef.current
        .feed(toSample(e, 'up'))
        .find((g): g is Extract<Gesture, { kind: 'holdEnd' }> => g.kind === 'holdEnd');
      if (holdEnd) {
        holdFired = holdEnd.fired;
        holdMoved = holdEnd.moved;
        holdDown = { x: holdEnd.x, y: holdEnd.y };
      }
      clearHoldTimer();
      const pendingEmptySelect = touchEmptySelectCandidateRef.current;
      if (pendingEmptySelect?.pointerId === e.pointerId) {
        touchEmptySelectCandidate = pendingEmptySelect;
        touchEmptySelectCandidateRef.current = null;
      }
    }

    rendererRef.current?.handleMinimapPointerUp();

    if (isDraggingCursorRef.current) {
      isDraggingCursorRef.current = false;
      return;
    }

    if (wasPinching) {
      return;
    }

    if (e.button === 2) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const rawX = e.clientX - rect.left;
    const x = rendererRef.current?.screenXToTimelineX(rawX) ?? rawX;
    const y = e.clientY - rect.top;

    // 드래그 삭제(발화) / 탭 삭제(무이동). delete 모드에서 hold가 있었을 때만.
    if (mode === 'delete' && holdDown) {
      if (shouldDeleteOnUp({ fired: holdFired, moved: holdMoved })) {
        deleteAtPoint(x, y);
      }
      rendererRef.current?.hideGhostNote();
      return;
    }

    if (touchEmptySelectCandidate) {
      if (mode === 'select' && selectModeRef.current) {
        // 박스 시작은 SelectMode.onPointerDown이 idempotent하게 처리한다(진행 중이면 no-op).
        selectModeRef.current.onPointerDown(touchEmptySelectCandidate.x, touchEmptySelectCandidate.y, false, false);
        selectModeRef.current.onPointerUp(
          touchEmptySelectCandidate.moved ? x : touchEmptySelectCandidate.x,
          touchEmptySelectCandidate.moved ? y : touchEmptySelectCandidate.y,
        );
        rendererRef.current?.clearMoveOrigins();
        rendererRef.current?.clearBoxSelectRect();
        const sel = useEditorStore.getState();
        const selectionSize =
          sel.selection.notes.size + sel.selection.extraNotes.size + sel.selection.zones.size;
        // 박스 드래그(moved)가 비어있지 않게 끝나면 래치 on — 이후 탭이 토글이 된다 (RFD 0016 §4.4).
        // 탭(빈 곳 탭·핸들 탭)은 기존 규칙 유지: 선택이 비면 off, 아니면 현 상태 유지.
        touchMultiSelectRef.current = touchEmptySelectCandidate.moved
          ? selectionSize > 0
          : nextTouchMultiSelectLatch(touchMultiSelectRef.current, selectionSize);
      }
      rendererRef.current?.hideGhostNote();
      return;
    }

    // 범위 노트 후보의 up: create 모드 + 범위 엔티티(single/double)에서 hold가 있었을 때만.
    // (점노트 모드에서 노트를 롱프레스한 hold는 select-drag 의도라 발화 시 select 모드로 넘어가 있다.)
    if (mode === 'create' && getLongPressRangeType(entityType as EntityType) && holdDown && createModeRef.current) {
      const createAction = resolveTouchCreateUpAction({
        fired: holdFired,
        moved: holdMoved,
        endInBounds: isTimeInBounds(y),
        candidateStartInBounds: isTimeInBounds(holdDown.y),
      });
      if (createAction === 'commitDrag') {
        createModeRef.current.onPointerUp(x, y);
      } else if (createAction === 'cancelDrag') {
        createModeRef.current.cancelDrag();
      } else if (createAction === 'createPointTap') {
        // 탭 = 길이 0 드래그 → 단노트. CreateMode가 down→up을 길이로 판정하므로 둘 다 호출한다.
        createModeRef.current.onPointerDown(holdDown.x, holdDown.y);
        createModeRef.current.onPointerUp(holdDown.x, holdDown.y);
      }
      rendererRef.current?.hideGhostNote();
      return;
    }

    // 마우스 up(및 롱프레스 이동 커밋)은 모드 다형 디스패치로 통합한다.
    const upGesture = { x, y, shiftKey: e.shiftKey, altKey: e.altKey, toggleSelection: false };
    if (holdFired && mode === 'select' && selectModeRef.current) {
      applyEditResult(selectModeRef.current.handlePointerUp(upGesture));
    } else {
      applyEditResult(
        activeEditorMode(mode, createModeRef.current, selectModeRef.current, deleteModeRef.current)
          ?.handlePointerUp(upGesture),
      );
    }

    // 노트·엑스트라 탭 토글은 동일 처리 — 하나로 합친다.
    const tapToggle = touchTapToggleRef.current;
    if (
      e.pointerType === 'touch' &&
      tapToggle?.pointerId === e.pointerId &&
      selectModeRef.current &&
      shouldFireTapToggle({ moved: tapToggle.moved, longPressFired: holdFired })
    ) {
      selectModeRef.current.onPointerDown(
        tapToggle.x,
        tapToggle.y,
        false,
        false,
        touchMultiSelectRef.current,
      );
      // 토글로 마지막 선택까지 해제됐으면 다중선택 래치를 끈다(누적 토글 모드 종료).
      const sel = useEditorStore.getState();
      touchMultiSelectRef.current = nextTouchMultiSelectLatch(
        touchMultiSelectRef.current,
        sel.selection.notes.size + sel.selection.extraNotes.size + sel.selection.zones.size,
      );
    }
    if (tapToggle?.pointerId === e.pointerId) {
      touchTapToggleRef.current = null;
    }
  }, [
    mode, entityType, isTimeInBounds, toSample, clearHoldTimer,
    updateTouchMovement, canvasRef, createModeRef, deleteModeRef, isDraggingCursorRef,
    deleteAtPoint, rendererRef, selectModeRef, applyEditResult,
  ]);

  const handlePointerCancel = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'touch') {
      // recognizer.feed(cancel)이 hold를 버린다(holdEnd 반환은 무시 — 취소 경로는 결말을 쓰지 않는다).
      recognizerRef.current.feed(toSample(e, 'cancel'));
      recognizerRef.current.clearNavigation();
      clearHoldTimer();
      clearTouchEmptySelectCandidate();
      touchTapToggleRef.current = null;
    }
    rendererRef.current?.handleMinimapPointerUp();
    rendererRef.current?.clearMoveOrigins();
    rendererRef.current?.clearBoxSelectRect();
    createModeRef.current?.cancelDrag();
  }, [clearHoldTimer, clearTouchEmptySelectCandidate, createModeRef, toSample, rendererRef]);

  const handlePointerLeave = useCallback(() => {
    rendererRef.current?.hideGhostNote();
  }, [rendererRef]);

  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const rawX = e.clientX - rect.left;
    const x = rendererRef.current?.screenXToTimelineX(rawX) ?? rawX;
    const y = e.clientY - rect.top;

    const hit = hitTestMarker(x, y);
    if (hit) {
      setEditingMarker(hit);
    }
  }, [canvasRef, hitTestMarker, rendererRef, setEditingMarker]);

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();

    if (Date.now() < suppressContextMenuUntilRef.current) return;
    if (rightDragDeletedRef.current) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const rawX = e.clientX - rect.left;
    const x = rendererRef.current?.screenXToTimelineX(rawX) ?? rawX;
    const y = e.clientY - rect.top;

    const extraHitIdx = hitTestExtraNote(x, y);
    if (extraHitIdx !== null) {
      const currentExtra = auxNotesAsExtra(useEditorStore.getState().chart.notes);
      const updatedExtra = deleteExtraNoteAtIndex(currentExtra, extraHitIdx);
      if (updatedExtra === null) return;
      applyExtraNotes(updatedExtra);
      clearExtraSelection();
      return;
    }

    const currentChart = useEditorStore.getState().chart;
    const result = DeleteMode.deleteNoteAtPoint(currentChart, hitTestNote, x, y);
    if (result) {
      setChart(result);
      return;
    }

    const zoneIdx = hitTestTrillZone(x, y);
    if (zoneIdx !== null) {
      const zoneDelete = deleteEmptyTrillZoneAtIndex(currentChart, zoneIdx);
      if (zoneDelete.blockedReason) addToast(zoneDelete.blockedReason);
      if (zoneDelete.chart) setChart(zoneDelete.chart);
      return;
    }

    const markerHit = hitTestMarker(x, y);
    if (markerHit) {
      const evt = currentChart.events[markerHit.index];
      if (evt && evt.beat.n === 0 && (evt.type === 'bpm' || evt.type === 'timeSignature')) {
        addToast('Cannot delete initial event marker');
        return;
      }
      setChart({
        ...currentChart,
        events: currentChart.events.filter((_, i) => i !== markerHit.index),
      });
    }
  }, [canvasRef, hitTestNote, hitTestTrillZone, hitTestMarker, hitTestExtraNote, rendererRef, setChart, applyExtraNotes, clearExtraSelection, addToast]);

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handlePointerLeave,
    handleDoubleClick,
    handleContextMenu,
    rightDragDeletedRef,
  };
}

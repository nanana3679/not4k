export const TOUCH_MOVE_CANCEL_PX = 10;
export const TOUCH_NAVIGATION_LOCK_PX = 8;
export const TOUCH_NAVIGATION_MODE_DEBOUNCE_PX = 6;

export type TouchNavigationMode = "horizontalScroll" | "verticalScroll" | "resize";

export interface TouchGesturePoint {
  clientX: number;
  clientY: number;
}

export interface TouchNavigationSession {
  mode: TouchNavigationMode | null;
  startCenter: TouchGesturePoint;
  startDistance: number;
  previousCenter: TouchGesturePoint;
  previousDistance: number;
}

export interface TouchNavigationUpdate {
  mode: TouchNavigationMode | null;
  session: TouchNavigationSession;
  deltaX?: number;
  deltaY?: number;
  previousDistance?: number;
  currentDistance?: number;
  center: TouchGesturePoint;
}

export function isTouchNavigationGesture(activeTouchCount: number): boolean {
  return activeTouchCount >= 2;
}

export function getTouchDistance(points: readonly TouchGesturePoint[]): number {
  if (points.length < 2) return 0;
  return Math.hypot(
    points[0].clientX - points[1].clientX,
    points[0].clientY - points[1].clientY,
  );
}

export function getTouchCenter(points: readonly TouchGesturePoint[]): TouchGesturePoint {
  return {
    clientX: (points[0].clientX + points[1].clientX) / 2,
    clientY: (points[0].clientY + points[1].clientY) / 2,
  };
}

export function beginTouchNavigationSession(
  points: readonly TouchGesturePoint[],
): TouchNavigationSession | null {
  if (!isTouchNavigationGesture(points.length)) return null;
  const startDistance = getTouchDistance(points);
  if (startDistance <= 0) return null;
  const startCenter = getTouchCenter(points);
  return {
    mode: null,
    startCenter,
    startDistance,
    previousCenter: startCenter,
    previousDistance: startDistance,
  };
}

export function advanceTouchNavigationSession(
  session: TouchNavigationSession,
  points: readonly TouchGesturePoint[],
): TouchNavigationUpdate | null {
  if (!isTouchNavigationGesture(points.length)) return null;

  const currentDistance = getTouchDistance(points);
  const center = getTouchCenter(points);
  const mode = resolveTouchNavigationMode({
    currentMode: session.mode,
    startCenter: session.startCenter,
    currentCenter: center,
    startDistance: session.startDistance,
    currentDistance,
  });

  const nextSession: TouchNavigationSession = {
    ...session,
    mode,
    previousCenter: center,
    previousDistance: currentDistance > 0 ? currentDistance : session.previousDistance,
  };

  if (mode === "horizontalScroll") {
    return {
      mode,
      session: nextSession,
      deltaX: session.previousCenter.clientX - center.clientX,
      center,
    };
  }

  if (mode === "verticalScroll") {
    return {
      mode,
      session: nextSession,
      deltaY: session.previousCenter.clientY - center.clientY,
      center,
    };
  }

  if (mode === "resize" && currentDistance > 0) {
    return {
      mode,
      session: nextSession,
      previousDistance: session.previousDistance,
      currentDistance,
      center,
    };
  }

  return {
    mode: null,
    session: nextSession,
    center,
  };
}

export function shouldRunTouchBoxSelectDrag(input: {
  pointerType: string;
  editorMode: string;
  candidatePointerId: number | null;
  pointerId: number;
  moved: boolean;
  activeTouchCount: number;
}): boolean {
  return (
    input.pointerType === "touch" &&
    input.editorMode === "select" &&
    input.candidatePointerId === input.pointerId &&
    input.moved &&
    input.activeTouchCount === 1
  );
}

export function didTouchMoveBeyondTapSlop(input: {
  startClientX: number;
  startClientY: number;
  clientX: number;
  clientY: number;
  tapSlopPx?: number;
}): boolean {
  const tapSlopPx = input.tapSlopPx ?? TOUCH_MOVE_CANCEL_PX;
  return Math.hypot(
    input.clientX - input.startClientX,
    input.clientY - input.startClientY,
  ) > tapSlopPx;
}

export function resolveTouchNavigationMode(input: {
  currentMode: TouchNavigationMode | null;
  startCenter: TouchGesturePoint;
  currentCenter: TouchGesturePoint;
  startDistance: number;
  currentDistance: number;
  lockSlopPx?: number;
  modeDebouncePx?: number;
}): TouchNavigationMode | null {
  if (input.currentMode) return input.currentMode;

  const lockSlopPx = input.lockSlopPx ?? TOUCH_NAVIGATION_LOCK_PX;
  const modeDebouncePx = input.modeDebouncePx ?? TOUCH_NAVIGATION_MODE_DEBOUNCE_PX;
  const horizontalTravel = Math.abs(input.currentCenter.clientX - input.startCenter.clientX);
  const verticalTravel = Math.abs(input.currentCenter.clientY - input.startCenter.clientY);
  const resizeTravel = Math.abs(input.currentDistance - input.startDistance);
  const maxTravel = Math.max(horizontalTravel, verticalTravel, resizeTravel);
  if (maxTravel < lockSlopPx) return null;

  const ranked = [
    { mode: "horizontalScroll" as const, travel: horizontalTravel },
    { mode: "verticalScroll" as const, travel: verticalTravel },
    { mode: "resize" as const, travel: resizeTravel },
  ].sort((a, b) => b.travel - a.travel);

  if (ranked[0].travel - ranked[1].travel < modeDebouncePx) return null;
  return ranked[0].mode;
}

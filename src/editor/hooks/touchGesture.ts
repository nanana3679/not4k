export const TOUCH_MOVE_CANCEL_PX = 10;
export const TOUCH_NAVIGATION_LOCK_PX = 8;
export const TOUCH_NAVIGATION_MODE_DEBOUNCE_PX = 6;

export type TouchNavigationMode = "horizontalScroll" | "verticalScroll" | "resize";

export interface TouchGesturePoint {
  clientX: number;
  clientY: number;
}

export function isTouchNavigationGesture(activeTouchCount: number): boolean {
  return activeTouchCount >= 2;
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

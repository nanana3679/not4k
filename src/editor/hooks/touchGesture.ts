export const TOUCH_MOVE_CANCEL_PX = 10;
export const TOUCH_NAVIGATION_LOCK_PX = 8;

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
}): TouchNavigationMode | null {
  if (input.currentMode) return input.currentMode;

  const lockSlopPx = input.lockSlopPx ?? TOUCH_NAVIGATION_LOCK_PX;
  const horizontalTravel = Math.abs(input.currentCenter.clientX - input.startCenter.clientX);
  const verticalTravel = Math.abs(input.currentCenter.clientY - input.startCenter.clientY);
  const resizeTravel = Math.abs(input.currentDistance - input.startDistance);
  const maxTravel = Math.max(horizontalTravel, verticalTravel, resizeTravel);
  if (maxTravel < lockSlopPx) return null;

  if (resizeTravel > horizontalTravel && resizeTravel > verticalTravel) {
    return "resize";
  }
  if (horizontalTravel >= verticalTravel) {
    return "horizontalScroll";
  }
  return "verticalScroll";
}

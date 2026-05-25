export const TOUCH_MOVE_CANCEL_PX = 10;

export function isTouchNavigationGesture(activeTouchCount: number): boolean {
  return activeTouchCount >= 2;
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

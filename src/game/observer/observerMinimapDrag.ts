import type { ObserverPlayRuntime } from '../screens/ObserverPlayRuntime';
import { dragMinimapRange, hitMinimapRange, OBSERVER_MINIMAP_WIDTH } from './observerMinimapGeometry';
import type { ObserverMinimapDragPart } from './observerMinimapGeometry';
import type { ObserverRange } from './observerRepetitionPlan';

type RangeRuntime = Pick<ObserverPlayRuntime, 'range' | 'beginRangeEdit' | 'setRange' | 'endRangeEdit'>;

/** 포인터 수명만 소유한다. 키 이벤트는 등록하지 않고 레인 입력은 window로 통과시킨다. */
export function attachObserverMinimapDrag(
  element: HTMLElement, getRuntime: () => RangeRuntime | null, durationMs: number,
): () => void {
  let drag: { pointerId: number; player: RangeRuntime; part: ObserverMinimapDragPart;
    initial: ObserverRange; downY: number; height: number; top: number } | null = null;
  let pendingY: number | null = null;
  let frame: number | null = null;

  const flush = () => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    if (drag && pendingY !== null) {
      const next = dragMinimapRange(drag.part, drag.initial, drag.downY, pendingY, durationMs, drag.height);
      const current = drag.player.range;
      if (next.startMs !== current?.startMs || next.endMs !== current?.endMs) drag.player.setRange(next);
    }
    pendingY = null;
  };
  const finish = () => {
    if (!drag) return;
    flush(); // 마지막 move가 rAF 전에 끝나도 set → end 순서와 마지막 위치를 보존한다.
    const { player, pointerId } = drag;
    drag = null;
    player.endRangeEdit();
    if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
    element.style.cursor = '';
  };
  const down = (event: PointerEvent) => {
    if (drag || event.button !== 0 || !event.isPrimary || durationMs <= 0) return;
    const player = getRuntime();
    const initial = player?.range;
    if (!player || !initial) return;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0) return;
    const y = event.clientY - rect.top;
    const part = hitMinimapRange((event.clientX - rect.left) / rect.width * OBSERVER_MINIMAP_WIDTH,
      y, initial, durationMs, rect.height);
    if (!part) return;
    event.preventDefault(); // 버튼/입력 포커스를 만들지 않는다. 키 이벤트는 건드리지 않는다.
    // 직전에 누른 Play/Retry에도 포커스를 남기지 않아 Space·Enter가 그 버튼을 다시 누르지 않게 한다.
    const focused = element.ownerDocument.activeElement;
    if (focused && 'blur' in focused) (focused as HTMLElement).blur();
    element.setPointerCapture(event.pointerId);
    drag = { pointerId: event.pointerId, player, part, initial: { ...initial }, downY: y, height: rect.height, top: rect.top };
    element.style.cursor = part === 'move' ? 'grabbing' : 'ns-resize';
    player.beginRangeEdit();
  };
  const move = (event: PointerEvent) => {
    if (!drag) {
      const range = getRuntime()?.range;
      if (!range) return;
      const rect = element.getBoundingClientRect();
      const part = hitMinimapRange((event.clientX - rect.left) / rect.width * OBSERVER_MINIMAP_WIDTH,
        event.clientY - rect.top, range, durationMs, rect.height);
      element.style.cursor = part === 'move' ? 'grab' : part ? 'ns-resize' : '';
      return;
    }
    if (drag.pointerId !== event.pointerId) return;
    const rect = element.getBoundingClientRect();
    // ResizeObserver의 React 갱신 전에 입력이 와도 서로 다른 좌표계를 섞지 않는다.
    if (rect.height !== drag.height || rect.top !== drag.top) { finish(); return; }
    pendingY = event.clientY - drag.top;
    if (frame === null) frame = requestAnimationFrame(flush);
  };
  const up = (event: PointerEvent) => {
    if (drag?.pointerId !== event.pointerId) return;
    // cancel/lostcapture의 좌표는 0일 수 있으므로 마지막 실제 move만 적용한다.
    const rect = element.getBoundingClientRect();
    if (event.type === 'pointerup' && rect.height === drag.height && rect.top === drag.top) {
      pendingY = event.clientY - drag.top;
    }
    finish();
  };
  element.addEventListener('pointerdown', down);
  element.addEventListener('pointermove', move);
  element.addEventListener('pointerup', up);
  element.addEventListener('pointercancel', up);
  element.addEventListener('lostpointercapture', up);
  return () => {
    element.removeEventListener('pointerdown', down);
    element.removeEventListener('pointermove', move);
    element.removeEventListener('pointerup', up);
    element.removeEventListener('pointercancel', up);
    element.removeEventListener('lostpointercapture', up);
    finish();
  };
}

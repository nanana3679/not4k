import { Children, createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PreviewRangeSelector } from './PreviewRangeSelector';

type CanvasProps = {
  ref: { current: unknown };
  style: { touchAction?: string };
  onPointerDown: (event: unknown) => void;
  onPointerMove: (event: unknown) => void;
  onPointerUp: (event: unknown) => void;
  onPointerCancel?: (event: unknown) => void;
  onLostPointerCapture?: (event: unknown) => void;
};

/** 렌더하지 않은 요소 트리에서 canvas의 props를 찾는다. */
function canvasOf(node: ReactNode): CanvasProps | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ children?: ReactNode }>(child)) continue;
    if (child.type === 'canvas') return child.props as unknown as CanvasProps;
    const found = canvasOf(child.props.children);
    if (found) return found;
  }
  return undefined;
}

/** 120초 음원을 폭 240px(1px = 0.5초)에 그린 캔버스. */
const canvasBox = { getBoundingClientRect: () => ({ left: 0, width: 240 }), style: {} };
const pointer = (clientX: number) => ({
  clientX, pointerId: 1, preventDefault() {},
  target: { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() },
});

/**
 * 프리뷰 10～20초·페이드 0.5초로 연 선택기를 한 번 렌더하며 캔버스의 포인터 처리기를 `interact`로 부른다.
 * 처리기는 선택기를 그린 Probe의 훅을 쓰므로, 끌기로 구간이 바뀌어 다시 그려도 상호작용은 처음 한 번만 한다.
 */
function probe(interact: (canvas: CanvasProps) => void) {
  const onDragEnd = vi.fn();
  let canvas: CanvasProps | undefined;
  let done = false;
  function Probe() {
    const node = PreviewRangeSelector({ audioBuffer: { duration: 120 } as AudioBuffer, onChange() {}, onDragEnd,
      initialStart: 10, initialEnd: 20 });
    canvas = canvasOf(node);
    if (!done) {
      done = true;
      canvas!.ref.current = canvasBox;
      interact(canvas!);
    }
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  return { onDragEnd, canvas: canvas! };
}

describe('구간 선택기의 터치 끌기(PreviewRangeSelector)', () => {
  it('캔버스는 touch-action none이라 끄는 동안 브라우저가 스크롤로 가로채지 않는다', () => {
    expect(probe(() => {}).canvas.style.touchAction).toBe('none');
  });

  it('10～20초의 끝 핸들(40px)을 100px까지 끈 뒤 pointercancel이 오면 마지막으로 끈 10～50초를 적용한다', () => {
    const { onDragEnd } = probe(canvas => {
      canvas.onPointerDown(pointer(40));
      canvas.onPointerMove(pointer(100));
      canvas.onPointerCancel!(pointer(0));
    });

    expect(onDragEnd).toHaveBeenCalledExactlyOnceWith({ startTime: 10, endTime: 50, enabled: true, fadeInTime: 0.5, fadeOutTime: 0.5 });
  });

  it('끝 핸들을 100px까지 끈 뒤 손을 떼지 못한 채 캡처를 잃으면(lostpointercapture) 10～50초를 적용한다', () => {
    const { onDragEnd } = probe(canvas => {
      canvas.onPointerDown(pointer(40));
      canvas.onPointerMove(pointer(100));
      canvas.onLostPointerCapture!(pointer(0));
    });

    expect(onDragEnd).toHaveBeenCalledExactlyOnceWith({ startTime: 10, endTime: 50, enabled: true, fadeInTime: 0.5, fadeOutTime: 0.5 });
  });

  it('구간 밖 200px(100초)을 눌러 구간을 95～105초로 옮긴 뒤 pointercancel이 오면 95～105초를 적용한다', () => {
    const { onDragEnd } = probe(canvas => {
      canvas.onPointerDown(pointer(200));
      canvas.onPointerCancel!(pointer(0));
    });

    expect(onDragEnd).toHaveBeenCalledExactlyOnceWith({ startTime: 95, endTime: 105, enabled: true, fadeInTime: 0.5, fadeOutTime: 0.5 });
  });

  it('끝 핸들을 100px에서 손을 떼 10～50초를 적용한 뒤 따라오는 lostpointercapture는 다시 적용하지 않는다', () => {
    const { onDragEnd } = probe(canvas => {
      canvas.onPointerDown(pointer(40));
      canvas.onPointerMove(pointer(100));
      canvas.onPointerUp(pointer(100));
      canvas.onLostPointerCapture!(pointer(0));
    });

    expect(onDragEnd).toHaveBeenCalledExactlyOnceWith({ startTime: 10, endTime: 50, enabled: true, fadeInTime: 0.5, fadeOutTime: 0.5 });
  });

  it('누르지 않은 채 오는 pointercancel은 아무것도 적용하지 않는다', () => {
    const { onDragEnd } = probe(canvas => canvas.onPointerCancel!(pointer(0)));

    expect(onDragEnd).not.toHaveBeenCalled();
  });
});

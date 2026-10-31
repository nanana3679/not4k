import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InputSystem } from '../input/InputSystem';
import { attachObserverMinimapDrag } from './observerMinimapDrag';
import type { ObserverRange } from './observerRepetitionPlan';

class Surface extends EventTarget {
  style = { cursor: '' };
  ownerDocument = { activeElement: { blur: vi.fn() } };
  capture = new Set<number>();
  setPointerCapture = vi.fn((id: number) => this.capture.add(id));
  hasPointerCapture = (id: number) => this.capture.has(id);
  releasePointerCapture = vi.fn((id: number) => this.capture.delete(id));
  rect = { left: 100, top: 100, width: 60, height: 624 };
  getBoundingClientRect = () => this.rect;
}
const frames = new Map<number, FrameRequestCallback>();
let nextFrame = 0;
let detach: (() => void) | undefined;
beforeEach(() => {
  nextFrame = 0; frames.clear();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++nextFrame, callback); return nextFrame; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
});
afterEach(() => { detach?.(); detach = undefined; vi.unstubAllGlobals(); });
function setup(range: ObserverRange = { startMs: 0, endMs: 30000 }) {
  const calls: unknown[] = [];
  const player = { range,
    beginRangeEdit: vi.fn(() => calls.push('begin')),
    setRange: vi.fn((next: ObserverRange) => { calls.push(next); player.range = next; }),
    endRangeEdit: vi.fn(() => calls.push('end')) };
  const surface = new Surface();
  detach = attachObserverMinimapDrag(surface as unknown as HTMLElement, () => player, 30000);
  const pointer = (type: string, y: number, overrides: object = {}) => {
    const event = Object.assign(new Event(type, { cancelable: true }),
      { clientX: 109, clientY: y + 100, button: 0, pointerId: 1, isPrimary: true }, overrides);
    surface.dispatchEvent(event);
    return event;
  };
  return { calls, player, surface, pointer };
}
function frame() {
  const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(16));
}

describe('Observer 미니맵 포인터 수명', () => {
  it('A=6000ms 핸들의 y500을 클릭만 하면 set 없이 끝나고 다시 잡아 y480으로 옮기면 A=7000ms가 된다', () => {
    const { pointer, calls } = setup({ startMs: 6000, endMs: 18000 });
    pointer('pointerdown', 500); pointer('pointerup', 500);
    expect(calls).toEqual(['begin', 'end']);
    pointer('pointerdown', 500); pointer('pointermove', 480); pointer('pointerup', 480);
    expect(calls).toEqual(['begin', 'end', 'begin', { startMs: 7000, endMs: 18000 }, 'end']);
  });

  it('12000ms 이동 예약 중 높이가 624→824px로 바뀌면 이전 이동만 반영하고 capture·rAF·드래그를 끝낸다', () => {
    const { pointer, calls, surface } = setup();
    pointer('pointerdown', 612); pointer('pointermove', 372);
    surface.rect.height = 824;
    pointer('pointermove', 452); pointer('pointerup', 452); frame();
    expect(calls).toEqual(['begin', { startMs: 12000, endMs: 30000 }, 'end']);
    expect(surface.capture.size).toBe(0); expect(frames.size).toBe(0);
  });

  it('A를 0→12000ms로 끌면 capture·begin 뒤 한 프레임에 마지막 set 1회·up의 end 순서로 호출한다', () => {
    const { pointer, calls, surface, player } = setup();
    expect(pointer('pointerdown', 612).defaultPrevented).toBe(true);
    expect(surface.setPointerCapture).toHaveBeenCalledExactlyOnceWith(1);
    expect(surface.ownerDocument.activeElement.blur).toHaveBeenCalledOnce();
    pointer('pointermove', 500); pointer('pointermove', 400); pointer('pointermove', 372);
    expect(calls).toEqual(['begin']); expect(frames.size).toBe(1);
    frame();
    expect(player.setRange).toHaveBeenCalledExactlyOnceWith({ startMs: 12000, endMs: 30000 });
    pointer('pointerup', 372);
    expect(calls).toEqual(['begin', { startMs: 12000, endMs: 30000 }, 'end']);
    expect(surface.capture.size).toBe(0); expect(frames.size).toBe(0);
  });
  it('rAF 전 y372에서 pointerup하면 12000ms를 먼저 set하고 end하며 늦은 프레임은 다시 호출하지 않는다', () => {
    const { pointer, calls } = setup();
    pointer('pointerdown', 612); pointer('pointermove', 492); pointer('pointerup', 372); frame();
    expect(calls).toEqual(['begin', { startMs: 12000, endMs: 30000 }, 'end']);
  });
  it('12000ms 이동 예약 중 좌표 0인 pointercancel이 오면 마지막 이동만 set하고 end를 1회 호출한다', () => {
    const { pointer, calls, surface } = setup();
    pointer('pointerdown', 612); pointer('pointermove', 372);
    pointer('pointercancel', -100); pointer('lostpointercapture', -100); pointer('pointerup', 0); frame();
    expect(calls).toEqual(['begin', { startMs: 12000, endMs: 30000 }, 'end']);
    expect(surface.capture.size).toBe(0);
  });
  it('B를 18000→24000ms로 끈 뒤 몸통을 3000ms 옮기면 begin·set·end를 각 드래그마다 호출한다', () => {
    const { pointer, calls } = setup({ startMs: 6000, endMs: 18000 });
    pointer('pointerdown', 252, { clientX: 151 }); pointer('pointerup', 132);
    pointer('pointerdown', 312); pointer('pointermove', 252); frame(); pointer('pointerup', 252);
    expect(calls).toEqual(['begin', { startMs: 6000, endMs: 24000 }, 'end',
      'begin', { startMs: 9000, endMs: 27000 }, 'end']);
  });
  it('우클릭·범위 밖 down·두 번째 포인터는 무시하고 캡처한 포인터의 범위 밖 이동만 30000ms로 제한한다', () => {
    const { pointer, calls } = setup({ startMs: 6000, endMs: 18000 });
    pointer('pointerdown', 492, { button: 2 }); pointer('pointerdown', 100);
    expect(calls).toEqual([]);
    pointer('pointerdown', 252); pointer('pointerdown', 492, { pointerId: 2, isPrimary: false });
    pointer('pointermove', 0, { pointerId: 2 }); pointer('pointercancel', 0, { pointerId: 2 });
    expect(calls).toEqual(['begin']);
    pointer('pointermove', -100); pointer('pointerup', -100);
    expect(calls).toEqual(['begin', { startMs: 6000, endMs: 30000 }, 'end']);
  });
  it('12000ms 이동 예약 중 unmount하면 set·end 뒤 capture와 rAF를 해제하고 추가 move를 무시한다', () => {
    const { pointer, calls, surface } = setup();
    pointer('pointerdown', 612); pointer('pointermove', 372); detach!(); detach!();
    pointer('pointermove', 252); frame();
    expect(calls).toEqual(['begin', { startMs: 12000, endMs: 30000 }, 'end']);
    expect(surface.capture.size).toBe(0); expect(frames.size).toBe(0);
  });
  it('드래그 후 Space·Enter·KeyQ는 레인 down/up을 3회 전달하고 Escape는 미니맵 조작 없이 통과한다', () => {
    const { pointer, calls, surface } = setup();
    pointer('pointerdown', 612); pointer('pointerup', 372);
    const before = [...calls];
    const press = vi.fn(); const release = vi.fn();
    const input = new InputSystem(['Space', 'Enter', 'KeyQ'].map(key => ({ lane: 1, key })),
      { onLanePress: press, onLaneRelease: release });
    input.attach(surface);
    for (const code of ['Space', 'Enter', 'KeyQ', 'Escape']) {
      for (const type of ['keydown', 'keyup']) {
        const event = Object.assign(new Event(type, { cancelable: true }), { code });
        surface.dispatchEvent(event);
        // InputSystem 자체는 레인 키의 기본 동작을 막는다. 미바인딩 Esc는 그대로 남는다.
        if (code === 'Escape') expect(event.defaultPrevented).toBe(false);
      }
    }
    expect(press).toHaveBeenCalledTimes(3); expect(release).toHaveBeenCalledTimes(3);
    expect(calls).toEqual(before); input.detach();
  });
});

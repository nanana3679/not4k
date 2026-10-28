import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExplicitTutorialPlaybackLoop } from './ExplicitTutorialPlaybackLoop';

const frames = new Map<number, FrameRequestCallback>();
let sequence = 0;
beforeEach(() => {
  frames.clear(); sequence = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++sequence, callback); return sequence; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
});
afterEach(() => vi.unstubAllGlobals());
function frame(at: number) { const callbacks = [...frames.values()]; frames.clear(); for (const callback of callbacks) callback(at); }
function setup(repeat = false) {
  const session = { iteration: 0, advanceTo: vi.fn(), repeat: vi.fn(() => { session.iteration++; }) };
  const presentation = { render: vi.fn(), restarted: vi.fn(), completed: vi.fn(), failed: vi.fn() };
  const loop = new ExplicitTutorialPlaybackLoop(session, 4000, presentation, repeat);
  return { loop, session, presentation };
}
describe('실제 튜토리얼 preview RAF 수명', () => {
  it('반복 끄기로 4000ms 완료한 뒤 다시 켜면 controller가 새 session을 만들고 0ms부터 RAF를 재개한다', () => {
    const { loop, session, presentation } = setup();
    loop.start(); frame(100); frame(4100);
    expect(presentation.completed).toHaveBeenCalledOnce(); expect(frames.size).toBe(0);
    loop.setRepeat(true);
    expect(session.repeat).toHaveBeenCalledWith(4000); expect(session.iteration).toBe(1);
    expect(frames.size).toBe(1); frame(9999);
    expect(session.advanceTo).toHaveBeenLastCalledWith(0);
    expect(presentation.render).toHaveBeenLastCalledWith(0, 0);
    expect(presentation.restarted).toHaveBeenCalledWith(1);
    loop.dispose();
  });
  it('반복 켜기와 start를 여러 번 호출해도 RAF는1개이고 끝 경계마다 새 session을 한 번만 만든다', () => {
    const { loop, session } = setup(true);
    loop.start(); loop.start(); loop.setRepeat(true);
    expect(frames.size).toBe(1); frame(0); frame(4000);
    expect(session.repeat).toHaveBeenCalledOnce(); expect(frames.size).toBe(1);
    loop.dispose(); expect(frames.size).toBe(0);
    loop.setRepeat(true); loop.start(); expect(frames.size).toBe(0);
  });
  it('controller 진행 실패는 RAF를 종료하고 failed를 한 번 알린다', () => {
    const { loop, session, presentation } = setup();
    session.advanceTo.mockImplementation(() => { throw new Error('session'); });
    loop.start(); frame(0);
    expect(presentation.failed).toHaveBeenCalledOnce(); expect(frames.size).toBe(0);
  });
});

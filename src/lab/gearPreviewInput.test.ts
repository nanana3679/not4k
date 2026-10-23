import { describe, expect, it, vi } from 'vitest';
import { GearButtonState } from '../game/renderer/gearButtons';
import { createGearPreviewInput } from './gearPreviewInput';

function setup() {
  let bindings = new Map([['KeyD', 2], ['KeyO', 2]]);
  const states = Array.from({ length: 4 }, () => new GearButtonState());
  const target = {
    setKeyState: vi.fn(),
    setGearButtonKey: vi.fn((lane: number, key: string, pressed: boolean) => {
      if (pressed) states[lane - 1].press(key);
      else states[lane - 1].release(key);
    }),
  };
  const input = createGearPreviewInput(target, () => bindings);
  return {
    ...input, target, states,
    bind(next: [string, number][]) { bindings = new Map(next); },
    down(code = 'KeyD', shiftKey = false, repeat = false) { const event = { type: 'keydown', code, shiftKey, repeat }; input.onKey(event); },
    up(code = 'KeyD') { input.onKey({ type: 'keyup', code, repeat: false }); },
  };
}

describe('Lab Gear 키 입력', () => {
  it('Shift+KeyD도 hold 1개라 연파랑이고 Shift 없는 repeat keydown은 무시해 hold 1개와 누름 호출 1회를 유지한다', () => {
    const p = setup();
    p.down('KeyD', true);
    p.down('KeyD', false, true);
    expect(p.states[1]).toMatchObject({ phase: 'pressed', color: 'single', heldKeys: 1 });
    expect(p.target.setGearButtonKey).toHaveBeenCalledTimes(1);
    expect(p.target.setKeyState).toHaveBeenCalledTimes(1);
  });

  it.each(['KeyD', 'KeyO'])('KeyD·KeyO 공입력은 키 2개로 금색이고 %s를 떼면 남은 키 1개로 연파랑이 된다', (releasedKey) => {
    const p = setup();
    p.down();
    expect(p.states[1].color).toBe('single');
    p.down('KeyO');
    expect(p.states[1]).toMatchObject({ phase: 'pressed', color: 'double', heldKeys: 2 });
    p.up(releasedKey);
    expect(p.states[1]).toMatchObject({ phase: 'pressed', color: 'single', heldKeys: 1 });
  });

  it.each([
    ['바인딩을 레인 1로 바꿔도', 1],
    ['바인딩에서 KeyD가 빠져도', undefined],
  ] as const)('레인 2 KeyD를 누른 뒤 %s keyup은 원래 레인 2를 뗀다', (_case, lane) => {
    const p = setup();
    p.down();
    p.bind(lane === undefined ? [] : [['KeyD', lane]]);
    p.up();
    expect(p.states[1]).toMatchObject({ phase: 'releasing', heldKeys: 0 });
    expect(p.states[0].phase).toBe('idle');
    expect(p.target.setGearButtonKey).toHaveBeenLastCalledWith(2, 'KeyD', false);
  });

  it('레인 2 KeyD를 누른 채 바인딩을 레인 1로 바꿔도 중복 down은 무시하고, keyup 후 새 down부터 레인 1을 누른다', () => {
    const p = setup();
    p.down();
    p.bind([['KeyD', 1]]);
    p.down();
    expect(p.states[0].phase).toBe('idle');
    p.up();
    p.down();
    expect(p.states[0]).toMatchObject({ phase: 'pressed', heldKeys: 1 });
    expect(p.states[1].heldKeys).toBe(0);
  });

  it('KeyD·KeyO를 누른 뒤 프리셋에서 두 키가 사라져도 blur는 원래 레인 2와 키보드 표시를 모두 끄고 두 번째 blur는 아무것도 하지 않는다', () => {
    const p = setup();
    p.down();
    p.down('KeyO');
    p.bind([['Numpad1', 1]]);
    p.releaseAll();
    expect(p.states[1]).toMatchObject({ phase: 'releasing', heldKeys: 0 });
    expect(p.target.setKeyState.mock.calls.slice(-2)).toEqual([['KeyD', false], ['KeyO', false]]);
    p.target.setGearButtonKey.mockClear();
    p.releaseAll();
    expect(p.target.setGearButtonKey).not.toHaveBeenCalled();
  });
});

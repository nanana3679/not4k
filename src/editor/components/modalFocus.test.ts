import { describe, expect, it } from 'vitest';
import { dialogKeyAction } from './modalFocus';

describe('확인 창의 키 처리(dialogKeyAction)', () => {
  it('버튼 3개 중 마지막(index 2)에서 Tab을 누르면 첫 버튼(index 0)으로 돈다', () => {
    expect(dialogKeyAction({ key: 'Tab', shiftKey: false }, 2, 3)).toEqual({ type: 'focus', index: 0 });
  });

  it('첫 버튼(index 0)에서 Shift+Tab을 누르면 마지막 버튼(index 2)으로 돈다', () => {
    expect(dialogKeyAction({ key: 'Tab', shiftKey: true }, 0, 3)).toEqual({ type: 'focus', index: 2 });
  });

  it('포커스가 창 밖(index -1)이면 Tab은 첫 버튼, Shift+Tab은 마지막 버튼으로 간다', () => {
    expect(dialogKeyAction({ key: 'Tab', shiftKey: false }, -1, 3)).toEqual({ type: 'focus', index: 0 });
    expect(dialogKeyAction({ key: 'Tab', shiftKey: true }, -1, 3)).toEqual({ type: 'focus', index: 2 });
  });

  it('포커스할 버튼이 0개면 Tab은 창 자체에 포커스를 둔다', () => {
    expect(dialogKeyAction({ key: 'Tab', shiftKey: false }, -1, 0)).toEqual({ type: 'frame' });
  });

  it('Escape는 창을 취소로 닫는 동작이다', () => {
    expect(dialogKeyAction({ key: 'Escape', shiftKey: false }, 1, 3)).toEqual({ type: 'escape' });
  });

  it('Enter·Space·글자 키는 창이 가로채지 않는다', () => {
    for (const key of ['Enter', ' ', 'a']) expect(dialogKeyAction({ key, shiftKey: false }, 0, 3)).toBeNull();
  });
});

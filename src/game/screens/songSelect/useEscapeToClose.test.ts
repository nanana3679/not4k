import { describe, expect, it } from 'vitest';
import { shouldCloseOnEscape } from './useEscapeToClose';
import useEscapeToCloseSource from './useEscapeToClose.ts?raw';
import deleteSongModalSource from './DeleteSongModal.tsx?raw';
import addSongModalSource from './AddSongModal.tsx?raw';
import difficultyModalSource from './DifficultyModal.tsx?raw';

function keyDown(overrides: Partial<{ key: string; isComposing: boolean; defaultPrevented: boolean }> = {}) {
  return { key: 'Escape', isComposing: false, defaultPrevented: false, ...overrides };
}

describe('shouldCloseOnEscape', () => {
  it('Escape keydown → 닫음', () => {
    expect(shouldCloseOnEscape(keyDown())).toBe(true);
  });

  it('Enter·ArrowDown·Tab keydown → 닫지 않음', () => {
    for (const key of ['Enter', 'ArrowDown', 'Tab']) {
      expect(shouldCloseOnEscape(keyDown({ key }))).toBe(false);
    }
  });

  it('IME 조합 중(isComposing=true)의 Escape → 조합 취소에 양보하고 닫지 않음', () => {
    expect(shouldCloseOnEscape(keyDown({ isComposing: true }))).toBe(false);
  });

  it('다른 리스너가 이미 처리한(defaultPrevented=true) Escape → 닫지 않음', () => {
    expect(shouldCloseOnEscape(keyDown({ defaultPrevented: true }))).toBe(false);
  });

  it('disabled=true(삭제·업로드 진행 중)이면 Escape여도 닫지 않음', () => {
    expect(shouldCloseOnEscape(keyDown(), { disabled: true })).toBe(false);
  });

  it('disabled=false이면 Escape로 닫음', () => {
    expect(shouldCloseOnEscape(keyDown(), { disabled: false })).toBe(true);
  });
});

describe('곡 선택 관리 모달의 Escape 닫기 배선', () => {
  it('DeleteSongModal은 deleting=true 동안 Escape 닫기를 끔 (백드롭 클릭과 같은 조건)', () => {
    expect(deleteSongModalSource).toContain('useEscapeToClose(onClose, { disabled: deleting });');
    expect(deleteSongModalSource).toContain('onMouseDown={deleting ? undefined : onClose}');
  });

  it('AddSongModal은 submitting=true 동안 Escape 닫기를 끔 (백드롭 클릭과 같은 조건)', () => {
    expect(addSongModalSource).toContain('useEscapeToClose(onClose, { disabled: submitting });');
    expect(addSongModalSource).toContain('onMouseDown={submitting ? undefined : onClose}');
  });

  it('DifficultyModal은 진행 중 상태가 없어 항상 Escape로 닫음 (백드롭 클릭과 같은 조건)', () => {
    expect(difficultyModalSource).toContain('useEscapeToClose(onClose);');
    expect(difficultyModalSource).toContain('onMouseDown={onClose}');
  });

  it('Escape 리스너를 곡 선택 네비와 같은 window bubble 단계에 등록해 Escape 한 번이 모달 닫기와 타이틀 이탈을 함께 일으키지 않음', () => {
    // useSongNavigation도 window bubble 단계에서 듣는다. 같은 대상·단계면 모달을 닫은 뒤 다시 등록된
    // 곡 선택 네비 리스너가 같은 Escape를 받지 않는다. document나 capture 단계로 옮기면 깨진다.
    expect(useEscapeToCloseSource).toContain("window.addEventListener('keydown', handleKeyDown);");
    expect(useEscapeToCloseSource).toContain("window.removeEventListener('keydown', handleKeyDown);");
    expect(useEscapeToCloseSource).not.toContain('document.addEventListener');
  });
});

import { describe, expect, it } from 'vitest';
import { shouldCloseOnEscape } from './useEscapeToClose';
import { shouldBlockSongNavKey, shouldPreventSongNavKeyDefault } from './helpers';
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

  it('DifficultyModal은 백드롭 클릭·Cancel처럼 항상 Escape로 닫음 (createChartAsset 진행 중에도)', () => {
    expect(difficultyModalSource).toContain('useEscapeToClose(onClose);');
    expect(difficultyModalSource).toContain('onMouseDown={onClose}');
  });

  it('Escape로 닫을 때 preventDefault로 처리됨을 표시하고 곡 선택 네비와 같은 window bubble 단계에서 들음 — Escape 한 번이 모달 닫기와 타이틀 이탈을 함께 일으키지 않음', () => {
    // 곡 선택 네비(shouldBlockSongNavKey)는 처리된(defaultPrevented) 키를 무시한다. 또 같은 window bubble 단계면
    // 모달을 닫은 뒤 다시 등록된 네비 리스너가 같은 Escape를 받지 않는다.
    expect(useEscapeToCloseSource).toContain('event.preventDefault();\n      onClose();');
    expect(useEscapeToCloseSource).toContain("window.addEventListener('keydown', handleKeyDown);");
    expect(useEscapeToCloseSource).toContain("window.removeEventListener('keydown', handleKeyDown);");
    expect(useEscapeToCloseSource).not.toContain('document.addEventListener');
  });
});

/** 같은 대상에 등록 순서대로 리스너를 실행하려고 Node의 Event에 KeyboardEvent 필드를 붙인다. */
function keyboardEvent(key: string, repeat: boolean) {
  const event = new Event('keydown', { cancelable: true });
  Object.defineProperties(event, {
    key: { value: key },
    repeat: { value: repeat },
    isComposing: { value: false },
  });
  return event as KeyboardEvent;
}

describe('곡 선택 네비 뒤에 등록된 모달 리스너', () => {
  it('곡 추가 업로드가 실패해 모달 리스너가 곡 선택 네비 뒤로 다시 등록돼도 → 누르고 있는 Escape의 반복 keydown으로 모달이 닫힘', () => {
    const fakeWindow = new EventTarget();
    let closeCount = 0;
    // 곡 선택 네비(useSongNavigation): 먼저 등록돼 먼저 실행된다. 모달이 열려 있어 키를 막는다.
    fakeWindow.addEventListener('keydown', (event) => {
      const e = event as KeyboardEvent;
      if (shouldBlockSongNavKey({
        blockingModalOpen: true,
        hasPendingChartTarget: false,
        songsEmpty: false,
        key: e.key,
        defaultPrevented: e.defaultPrevented,
        repeat: e.repeat,
      })) {
        if (shouldPreventSongNavKeyDefault({ key: e.key, repeat: e.repeat, target: e.target })) e.preventDefault();
      }
    });
    // 곡 추가 모달(useEscapeToClose): 모달 안 상태 submitting이 true→false로 바뀌면 이 리스너만 다시 등록돼 네비 뒤에 온다.
    fakeWindow.addEventListener('keydown', (event) => {
      const e = event as KeyboardEvent;
      if (!shouldCloseOnEscape(e, { disabled: false })) return;
      e.preventDefault();
      closeCount += 1;
    });

    fakeWindow.dispatchEvent(keyboardEvent('Escape', true));
    expect(closeCount).toBe(1);
  });
});

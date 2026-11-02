/**
 * 모달 확인 창의 키보드 포커스(접근성). 열리면 기본 동작 버튼(autoFocus, 없으면 첫 버튼)에 포커스를 두고, 열린 동안 Tab·Shift+Tab은
 * 창 안에서만 돌며, Escape는 창을 취소로 닫는다. 닫히면 열리기 전에 포커스가 있던 요소로 돌려준다. 뒤 화면은 호출한 쪽이 `inert`로
 * 막고 이 창은 그 영역 밖(형제)에 그린다(LegacyConversionModal과 같은 배치).
 */
import { useEffect, useRef, useState, type RefObject } from 'react';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** 창이 가로채는 키의 동작. `frame`은 포커스할 요소가 없어 창 자체에 포커스를 둔다. */
export type DialogKeyAction = { type: 'focus'; index: number } | { type: 'frame' } | { type: 'escape' } | null;

/**
 * 키 하나의 동작. `focusedIndex`는 창 안 포커스 가능한 요소 가운데 지금 포커스의 위치(창 밖이면 -1)다.
 * Tab은 다음, Shift+Tab은 이전 요소로 돌고 끝에서는 반대쪽 끝으로 간다. Escape는 취소다. 다른 키는 가로채지 않는다.
 */
export function dialogKeyAction(
  event: { key: string; shiftKey: boolean },
  focusedIndex: number,
  focusableCount: number,
): DialogKeyAction {
  if (event.key === 'Escape') return { type: 'escape' };
  if (event.key !== 'Tab') return null;
  if (focusableCount === 0) return { type: 'frame' };
  if (event.shiftKey) return { type: 'focus', index: focusedIndex <= 0 ? focusableCount - 1 : focusedIndex - 1 };
  return { type: 'focus', index: focusedIndex === -1 || focusedIndex === focusableCount - 1 ? 0 : focusedIndex + 1 };
}

/**
 * 창(`frameRef`)이 마운트된 동안 포커스를 가두고 Escape로 `onEscape`를 부른다. 키는 문서 전체에서 capture로 받아
 * 에디터 단축키보다 먼저 처리한다. `onEscape`는 렌더마다 바뀌어도 마지막 값을 쓴다.
 */
export function useModalFocus(frameRef: RefObject<HTMLElement | null>, onEscape: () => void): void {
  // 렌더 중에 읽어야 autoFocus가 포커스를 옮기기 전의 요소를 잡는다. 서버 렌더(단위 테스트)에는 document가 없다.
  const [returnFocusTo] = useState(() => (typeof document === 'undefined' ? null : document.activeElement));
  const onEscapeRef = useRef(onEscape);
  useEffect(() => { onEscapeRef.current = onEscape; });

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    if (!frame.contains(document.activeElement)) {
      (frame.querySelector<HTMLElement>(FOCUSABLE) ?? frame).focus();
    }
    const onKeyDown = (event: KeyboardEvent) => {
      const items = [...frame.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const action = dialogKeyAction(event, items.indexOf(document.activeElement as HTMLElement), items.length);
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      if (action.type === 'escape') onEscapeRef.current();
      else if (action.type === 'frame') frame.focus();
      else items[action.index].focus();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [frameRef]);

  // 닫히면 열리기 전 포커스로 돌려준다. passive cleanup은 뒤 화면의 inert가 풀린 뒤에 돈다.
  useEffect(() => () => {
    if (returnFocusTo instanceof HTMLElement && returnFocusTo !== document.body && returnFocusTo.isConnected) {
      returnFocusTo.focus({ preventScroll: true });
    }
  }, [returnFocusTo]);
}

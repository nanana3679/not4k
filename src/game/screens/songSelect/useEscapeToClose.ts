import { useEffect } from 'react';

interface EscapeToCloseOptions {
  /** true인 동안 Escape로 닫지 않는다. 백드롭 클릭도 막는 삭제·업로드 진행 중에 쓴다. */
  disabled?: boolean;
}

/**
 * keydown 하나가 곡 선택의 관리 모달(곡 삭제·곡 추가·새 차트 난이도)을 닫아야 하는지 판정한다.
 *
 * - Escape만 닫는다. 자동 반복(`repeat`)은 거르지 않는다 — 설정·튜토리얼 모달의 Escape 닫기와 같다.
 * - IME 조합 중(`isComposing`)의 Escape는 조합 취소에 양보한다.
 * - 다른 리스너가 이미 처리한(`defaultPrevented`) 이벤트는 닫지 않는다.
 * - `disabled`(삭제·업로드 진행 중)이면 닫지 않는다. 백드롭 클릭과 같은 조건이다.
 */
export function shouldCloseOnEscape(
  event: Pick<KeyboardEvent, 'key' | 'isComposing' | 'defaultPrevented'>,
  { disabled = false }: EscapeToCloseOptions = {},
): boolean {
  if (disabled) return false;
  if (event.key !== 'Escape') return false;
  if (event.isComposing) return false;
  return !event.defaultPrevented;
}

/**
 * Escape를 누르면 `onClose`로 모달을 닫는다. `disabled`인 동안에는 닫지 않는다.
 *
 * 리스너는 곡 선택 키 네비(`useSongNavigation`)와 같은 `window`의 bubble 단계에 둔다. 곡 선택 네비는
 * 모달이 열린 동안 Escape를 무시하지만, 모달을 닫으면 React가 다음 리스너 전에 다시 렌더링해 네비 리스너를
 * 새로 등록할 수 있다. 같은 대상·단계에서는 디스패치 중 새로 등록한 리스너가 그 이벤트를 받지 않고 제거된
 * 옛 리스너도 실행되지 않으므로, Escape 한 번이 모달을 닫으면서 타이틀로 나가지 않는다. `document`나
 * capture 단계로 옮기면 이 보장이 깨진다(`e2e/game/song-select-modal-escape.spec.ts`가 확인).
 */
export function useEscapeToClose(onClose: () => void, { disabled = false }: EscapeToCloseOptions = {}): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!shouldCloseOnEscape(event, { disabled })) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, disabled]);
}

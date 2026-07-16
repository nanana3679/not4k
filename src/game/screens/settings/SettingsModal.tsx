import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { SettingsPanel } from './SettingsPanel';
import { CalibrationView } from './CalibrationView';

interface SettingsModalProps {
  onClose: () => void;
}

type ModalView = 'settings' | 'calibration';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * 설정을 모달로 띄우는 래퍼. 프레임(오버레이·크기·닫기 상호작용·포커스 트랩)과 내부 뷰
 * 전환만 담당하고, 내용은 {@link SettingsPanel} / {@link CalibrationView}에 위임한다.
 *
 * Calibration은 별도 화면(route)이 아니라 이 모달의 서브뷰다. 설정에서 Calibrate를
 * 누르면 보정 뷰로 전환하고, 보정 뷰의 Back은 다시 설정 뷰로 돌아온다(모달은 유지).
 * 두 뷰는 상호배타적으로 마운트되므로 ESC/탭 keydown 리스너가 서로 충돌하지 않는다.
 */
export function SettingsModal({ onClose }: SettingsModalProps) {
  const [view, setView] = useState<ModalView>('settings');
  const frameRef = useRef<HTMLElement>(null);

  // 보정 중에는 실수로 진행이 날아가지 않도록 백드롭 클릭 닫기를 막는다.
  const dismissOnBackdrop = view === 'settings';

  // 열릴 때 포커스를 모달 안으로 가두고(Tab 트랩), 닫히면 이전 포커스로 복원한다.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const visibleFocusables = () => {
      const frame = frameRef.current;
      if (!frame) return [] as HTMLElement[];
      return Array.from(frame.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = visibleFocusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const frame = frameRef.current;
      if (frame && !frame.contains(active)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      previouslyFocused?.focus?.();
    };
  }, []);

  // 뷰가 바뀌면(설정↔보정) 새 뷰의 첫 포커스 요소로 이동한다. 사라진 요소에 포커스가
  // 남아 body로 떨어지는 것을 막는다.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    // 설정 뷰에서는 현재 섹션 내비 항목에 포커스를 둔다. 첫 포커스가 헤더 Close 버튼이면
    // 열자마자 Enter로 즉시 닫히므로. 없으면(보정 뷰) 첫 포커스 가능 요소로.
    const isFocusable = (el: HTMLElement | null): el is HTMLElement =>
      !!el && !el.hasAttribute('disabled') && el.offsetParent !== null;
    const preferred = frame.querySelector<HTMLElement>('[aria-current="page"]');
    const target = isFocusable(preferred)
      ? preferred
      : Array.from(frame.querySelectorAll<HTMLElement>(FOCUSABLE)).find(isFocusable);
    target?.focus();
  }, [view]);

  return (
    <div
      style={modalStyles.overlay}
      onMouseDown={dismissOnBackdrop ? onClose : undefined}
      data-settings-modal-overlay="true"
    >
      <section
        ref={frameRef}
        role="dialog"
        aria-modal="true"
        aria-label={view === 'calibration' ? 'Offset calibration' : 'Settings'}
        style={modalStyles.frame}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {view === 'settings' ? (
          <SettingsPanel
            onClose={onClose}
            onCalibrate={() => setView('calibration')}
          />
        ) : (
          <CalibrationView onExit={() => setView('settings')} />
        )}
      </section>
    </div>
  );
}

const modalStyles: Record<string, CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 2200,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    backgroundColor: 'rgba(0, 0, 0, 0.68)',
    backdropFilter: 'blur(2px)',
  },
  frame: {
    width: 'min(96vw, 720px)',
    height: 'min(88vh, 760px)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    borderRadius: '8px',
    border: '1px solid #333',
    boxShadow: '0 22px 64px rgba(0, 0, 0, 0.48)',
  },
};

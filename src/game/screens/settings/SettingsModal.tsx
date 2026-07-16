import { useState, type CSSProperties } from 'react';
import { SettingsPanel } from './SettingsPanel';
import { CalibrationView } from './CalibrationView';

interface SettingsModalProps {
  onClose: () => void;
}

type ModalView = 'settings' | 'calibration';

/**
 * 설정을 모달로 띄우는 래퍼. 프레임(오버레이·크기·닫기 상호작용)과 내부 뷰 전환만
 * 담당하고, 내용은 {@link SettingsPanel} / {@link CalibrationView}에 위임한다.
 *
 * Calibration은 별도 화면(route)이 아니라 이 모달의 서브뷰다. 설정에서 Calibrate를
 * 누르면 보정 뷰로 전환하고, 보정 뷰의 Back은 다시 설정 뷰로 돌아온다(모달은 유지).
 * 두 뷰는 상호배타적으로 마운트되므로 ESC/탭 keydown 리스너가 서로 충돌하지 않는다.
 */
export function SettingsModal({ onClose }: SettingsModalProps) {
  const [view, setView] = useState<ModalView>('settings');

  // 보정 중에는 실수로 진행이 날아가지 않도록 백드롭 클릭 닫기를 막는다.
  const dismissOnBackdrop = view === 'settings';

  return (
    <div
      style={modalStyles.overlay}
      onMouseDown={dismissOnBackdrop ? onClose : undefined}
      data-settings-modal-overlay="true"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
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

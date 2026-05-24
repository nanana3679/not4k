import { useState } from 'react';
import { modalStyles } from './modalStyles';

export interface OffsetModalProps {
  offsetMs: number;
  onChange: (offsetMs: number) => void;
  onClose: () => void;
}

export function OffsetModal({ offsetMs, onChange, onClose }: OffsetModalProps) {
  const [draft, setDraft] = useState(String(offsetMs));
  const stepButtonStyle = { ...modalStyles.cancelBtn, marginLeft: 0, padding: '8px 0' };

  const applyOffset = (next: number) => {
    setDraft(String(next));
    onChange(next);
  };

  const commitDraft = () => {
    const parsed = parseFloat(draft);
    if (!Number.isNaN(parsed)) {
      onChange(parsed);
    } else {
      setDraft(String(offsetMs));
    }
  };

  return (
    <div style={modalStyles.overlay} onMouseDown={onClose}>
      <div style={{ ...modalStyles.modal, width: '320px', maxWidth: 'calc(100vw - 32px)' }} onMouseDown={(e) => e.stopPropagation()}>
        <h3 style={modalStyles.title}>Offset</h3>
        <label style={modalStyles.field}>
          <span>Audio offset (ms)</span>
          <input
            type="number"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                commitDraft();
              }
            }}
            style={{ ...modalStyles.input, textAlign: 'center' }}
          />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
          <button style={stepButtonStyle} onClick={() => applyOffset(offsetMs - 10)}>-10</button>
          <button style={stepButtonStyle} onClick={() => applyOffset(offsetMs - 1)}>-1</button>
          <button style={stepButtonStyle} onClick={() => applyOffset(offsetMs + 1)}>+1</button>
          <button style={stepButtonStyle} onClick={() => applyOffset(offsetMs + 10)}>+10</button>
        </div>
        <div style={modalStyles.buttons}>
          <button style={modalStyles.saveBtn} onClick={() => { commitDraft(); onClose(); }}>Done</button>
        </div>
      </div>
    </div>
  );
}

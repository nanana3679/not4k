import { useState } from 'react';
import { modalStyles } from './modalStyles';

export interface CustomSnapModalProps {
  currentSnap: number;
  onSave: (value: number) => void;
  onClose: () => void;
}

export function CustomSnapModal({ currentSnap, onSave, onClose }: CustomSnapModalProps) {
  const [value, setValue] = useState(String(currentSnap));

  const handleSave = () => {
    const n = parseInt(value);
    if (isNaN(n) || n < 1 || n > 128) return;
    onSave(n);
  };

  return (
    <div style={modalStyles.overlay} onMouseDown={onClose}>
      <div style={modalStyles.modal} onMouseDown={(e) => e.stopPropagation()}>
        <h3 style={modalStyles.title}>Custom Snap Division</h3>
        <label style={modalStyles.field}>
          <span>1 / N (1~128)</span>
          <input
            style={modalStyles.input}
            type="number"
            min="1"
            max="128"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
            autoFocus
          />
        </label>
        <div style={modalStyles.buttons}>
          <button style={modalStyles.saveBtn} onClick={handleSave}>Apply</button>
          <button style={modalStyles.cancelBtn} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

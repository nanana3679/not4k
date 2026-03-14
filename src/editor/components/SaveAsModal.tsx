import { useState } from 'react';
import { modalStyles } from './modalStyles';

const DIFFICULTY_OPTIONS = ['EASY', 'NORMAL', 'HARD', 'EXPERT'] as const;

export interface SaveAsModalProps {
  currentDifficulty: string;
  title: string;
  level: number;
  isDirty: boolean;
  onSave: (difficulty: string, level: number) => void;
  onClose: () => void;
}

export function SaveAsModal({ currentDifficulty, title, level, isDirty, onSave, onClose }: SaveAsModalProps) {
  const currentUpper = currentDifficulty.toUpperCase();
  const defaultTarget = DIFFICULTY_OPTIONS.find((d) => d !== currentUpper) ?? 'EASY';
  const [targetDifficulty, setTargetDifficulty] = useState<string>(defaultTarget);
  const [targetLevel, setTargetLevel] = useState(level);

  return (
    <div style={modalStyles.overlay} onMouseDown={onClose}>
      <div style={{ ...modalStyles.modal, minWidth: '320px' }} onMouseDown={(e) => e.stopPropagation()}>
        <h3 style={modalStyles.title}>Save As (다른 이름으로 저장)</h3>

        <p style={{ fontSize: '13px', margin: '0 0 12px', color: '#aaa' }}>
          현재: <strong style={{ color: '#e0e0e0' }}>{title} — {currentUpper} Lv.{level}</strong>
        </p>

        {isDirty && (
          <p style={{ fontSize: '12px', margin: '0 0 12px', color: '#ff9966', backgroundColor: '#332200', padding: '6px 8px', borderRadius: '4px' }}>
            현재 차트에 저장되지 않은 변경사항이 있습니다. Save As를 하면 현재 변경사항이 대상 난이도에 저장됩니다.
          </p>
        )}

        <label style={modalStyles.field}>
          <span>Target Difficulty</span>
          <select
            style={modalStyles.input}
            value={targetDifficulty}
            onChange={(e) => setTargetDifficulty(e.target.value)}
          >
            {DIFFICULTY_OPTIONS.map((d) => (
              <option key={d} value={d} disabled={d === currentUpper}>
                {d}{d === currentUpper ? ' (current)' : ''}
              </option>
            ))}
          </select>
        </label>

        <label style={modalStyles.field}>
          <span>Difficulty Level</span>
          <input
            style={modalStyles.input}
            type="number"
            min={1}
            max={15}
            value={targetLevel}
            onChange={(e) => {
              const v = parseInt(e.target.value);
              if (!isNaN(v)) setTargetLevel(Math.max(1, Math.min(15, v)));
            }}
          />
        </label>

        <div style={modalStyles.buttons}>
          <button style={modalStyles.saveBtn} onClick={() => onSave(targetDifficulty, targetLevel)}>Save</button>
          <button style={modalStyles.cancelBtn} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

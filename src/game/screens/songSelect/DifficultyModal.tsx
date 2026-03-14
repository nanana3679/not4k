import { useMemo, useState } from 'react';
import { modalStyles } from './modalStyles';
import { DIFFICULTIES } from './helpers';

export interface DifficultyModalProps {
  existingDifficulties: string[];
  onSelect: (difficulty: string, level: number) => void;
  onClose: () => void;
}

export function DifficultyModal({ existingDifficulties, onSelect, onClose }: DifficultyModalProps) {
  const available = useMemo(
    () => DIFFICULTIES.filter((d) => !existingDifficulties.includes(d.toLowerCase())),
    [existingDifficulties],
  );

  const [difficulty, setDifficulty] = useState(() => available.length > 0 ? available[0] : '');
  const [level, setLevel] = useState('1');

  return (
    <div style={modalStyles.overlay} onMouseDown={onClose}>
      <div style={modalStyles.modal} onMouseDown={(e) => e.stopPropagation()}>
        <h3 style={modalStyles.title}>New Chart</h3>

        <label style={modalStyles.field}>
          <span>Difficulty</span>
          {available.length > 0 ? (
            <select style={modalStyles.input} value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
              {available.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          ) : (
            <span style={{ color: '#888', fontSize: '13px' }}>All difficulties taken</span>
          )}
        </label>

        <label style={modalStyles.field}>
          <span>Level (1~15)</span>
          <input style={modalStyles.input} type="number" min="1" max="15" value={level} onChange={(e) => setLevel(e.target.value)} />
        </label>

        <div style={modalStyles.buttons}>
          <button
            style={modalStyles.saveBtn}
            disabled={!difficulty}
            onClick={() => {
              const lv = parseInt(level);
              onSelect(difficulty.toLowerCase(), isNaN(lv) ? 1 : Math.max(1, Math.min(15, lv)));
            }}
          >
            Create
          </button>
          <button style={modalStyles.cancelBtn} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

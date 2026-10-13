import { clampTimingOffsetMs } from '../../stores/gameStore';

export function NumberRow({
  label, unit, text, onText, onCommit,
}: {
  label: string; unit: string; text: string;
  onText: (v: string) => void; onCommit: (n: number) => void;
}) {
  return (
    <div className="stg-row">
      <span className="stg-row-label">{label}</span>
      <div className="stg-number-wrap">
        <input
          type="number"
          className="stg-number"
          min={-1000}
          max={1000}
          value={text}
          aria-label={`${label} (${unit})`}
          onChange={(e) => onText(e.target.value)}
          onBlur={() => onCommit(clampTimingOffsetMs(Number(text)))}
        />
        <span className="stg-number-unit">{unit}</span>
      </div>
    </div>
  );
}

import { clampTimingOffsetMs, TIMING_OFFSET_LIMIT_MS } from '../../stores/gameStore';

export function OffsetRow({
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
          min={-TIMING_OFFSET_LIMIT_MS}
          max={TIMING_OFFSET_LIMIT_MS}
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

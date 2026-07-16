import { useGameStore, PRESET_BINDINGS } from '../../stores';
import { AVAILABLE_SKINS } from '../../skin';
import { useState, useEffect, useRef, type ReactNode } from 'react';

type Lane = 'lane1' | 'lane2' | 'lane3' | 'lane4';
type SectionId = 'controls' | 'gameplay' | 'skin' | 'advanced';
type ToastTone = 'info' | 'error';

interface SettingsPanelProps {
  /**
   * 설정을 닫는 동작. 풀스크린 래퍼는 라우팅 이동을, 모달 래퍼는 모달 닫기를 주입한다.
   * 패널은 "어디로 가는지"를 모른 채 닫기 의사만 전달한다.
   */
  onClose: () => void;
  /** 오프셋 보정 뷰로 전환하는 동작. 모달 래퍼가 내부 뷰 전환을 주입한다. */
  onCalibrate: () => void;
}

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: 'controls', label: 'Controls' },
  { id: 'gameplay', label: 'Gameplay' },
  { id: 'skin', label: 'Skin' },
  { id: 'advanced', label: 'Advanced' },
];

const LANES: Lane[] = ['lane1', 'lane2', 'lane3', 'lane4'];

export function SettingsPanel({ onClose, onCalibrate }: SettingsPanelProps) {
  const { settings, updateSettings } = useGameStore();
  const [section, setSection] = useState<SectionId>('controls');
  const [listeningLane, setListeningLane] = useState<Lane | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [audioOffsetText, setAudioOffsetText] = useState(String(settings.audioOffsetMs));
  const [judgmentOffsetText, setJudgmentOffsetText] = useState(String(settings.judgmentOffsetMs));

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  const showToast = (message: string, tone: ToastTone = 'error', duration = 3000) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ message, tone });
    toastTimeoutRef.current = setTimeout(() => setToast(null), duration);
  };

  // Listening mode: capture next keydown event
  useEffect(() => {
    if (!listeningLane) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      // capture phase에서 이 이벤트를 독점한다 — 리바인딩 중 눌린 키가 곡 선택 네비 등
      // bubble 단계의 다른 window 리스너로 새지 않게 한다.
      event.stopPropagation();
      const keyCode = event.code;

      // ESC cancels rebinding instead of binding Escape.
      if (keyCode === 'Escape') {
        setListeningLane(null);
        return;
      }

      const allKeys = Object.values(settings.keyBindings).flat();
      if (allKeys.includes(keyCode)) {
        showToast(`"${keyCode}" is already bound to another lane`);
        setListeningLane(null);
        return;
      }

      updateSettings({
        keyBindings: {
          ...settings.keyBindings,
          [listeningLane]: [...settings.keyBindings[listeningLane], keyCode],
        },
      });
      setListeningLane(null);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [listeningLane, settings.keyBindings, updateSettings]);

  // ESC closes the panel when not in the middle of rebinding a key.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (listeningLane) return; // listening effect handles ESC (cancel)
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [listeningLane, onClose]);

  const handleRemoveKey = (lane: Lane, keyToRemove: string) => {
    const currentKeys = settings.keyBindings[lane];
    if (currentKeys.length <= 2) {
      showToast('Each lane must keep at least 2 keys');
      return;
    }
    updateSettings({
      keyBindings: {
        ...settings.keyBindings,
        [lane]: currentKeys.filter((key) => key !== keyToRemove),
      },
    });
  };

  const handleResetToPreset = (preset: 'tkl' | 'numpad') => {
    updateSettings({ keyBindings: PRESET_BINDINGS[preset], preset });
    showToast(`Reset to ${preset.toUpperCase()} preset`, 'info', 2000);
  };

  return (
    <div className="stg-panel">
      <style>{settingsPanelCss}</style>

      <header className="stg-header">
        <h1 className="stg-title">Settings</h1>
        <button className="stg-close" onClick={onClose}>Close</button>
      </header>

      <div className="stg-body">
        <nav className="stg-nav" aria-label="Settings sections">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              className="stg-nav-item"
              aria-current={section === s.id ? 'page' : undefined}
              onClick={() => {
                // 섹션을 떠나면 리바인딩 리스닝을 반드시 해제한다. 아니면 "Press any key…"
                // 버튼은 언마운트돼도 window capture 리스너가 살아남아, 다른 섹션의 입력을
                // 삼키고 눌린 키를 조용히 바인딩한다.
                setListeningLane(null);
                setSection(s.id);
              }}
            >
              {s.label}
            </button>
          ))}
        </nav>

        <div className="stg-content" aria-label={SECTIONS.find((s) => s.id === section)?.label}>
          {section === 'controls' && (
            <ControlsSection
              keyBindings={settings.keyBindings}
              listeningLane={listeningLane}
              onStartListening={setListeningLane}
              onRemoveKey={handleRemoveKey}
              onResetPreset={handleResetToPreset}
            />
          )}

          {section === 'gameplay' && (
            <div className="stg-section">
              <Group title="Audio">
                <SliderRow
                  label="Master Volume"
                  value={settings.masterVolume ?? 1}
                  display={`${Math.round((settings.masterVolume ?? 1) * 100)}%`}
                  min={0} max={1} step={0.01}
                  onChange={(v) => updateSettings({ masterVolume: v })}
                />
                <NumberRow
                  label="Audio Offset"
                  unit="ms"
                  text={audioOffsetText}
                  onText={setAudioOffsetText}
                  onCommit={(n) => { updateSettings({ audioOffsetMs: n }); setAudioOffsetText(String(n)); }}
                />
                <NumberRow
                  label="Judgment Offset"
                  unit="ms"
                  text={judgmentOffsetText}
                  onText={setJudgmentOffsetText}
                  onCommit={(n) => { updateSettings({ judgmentOffsetMs: n }); setJudgmentOffsetText(String(n)); }}
                />
                <div className="stg-row stg-row--action">
                  <span className="stg-row-label">Calibrate offsets</span>
                  <button className="stg-btn stg-btn--accent" onClick={onCalibrate}>
                    Calibrate…
                  </button>
                </div>
              </Group>

              <Group title="Judgment">
                <SelectRow
                  label="Judgment Mode"
                  value={settings.judgmentMode ?? 'normal'}
                  options={[{ value: 'normal', label: 'Normal' }, { value: 'easy', label: 'Easy' }]}
                  onChange={(v) => updateSettings({ judgmentMode: v as 'normal' | 'easy' })}
                />
                <ToggleRow
                  label="Show FAST / SLOW"
                  checked={settings.showFastSlow}
                  onChange={(c) => updateSettings({ showFastSlow: c })}
                />
                <ToggleRow
                  label="Show Timing Diff"
                  checked={settings.showTimingDiff}
                  onChange={(c) => updateSettings({ showTimingDiff: c })}
                />
              </Group>

              <Group title="Speed & Scroll">
                <SliderRow
                  label="Play Speed"
                  value={settings.playSpeed ?? 1}
                  display={`×${(settings.playSpeed ?? 1).toFixed(2)}`}
                  min={0.5} max={2} step={0.05}
                  onChange={(v) => updateSettings({ playSpeed: v })}
                />
                <SliderRow
                  label="Scroll Speed"
                  value={settings.scrollSpeed}
                  display={String(settings.scrollSpeed)}
                  min={200} max={2000} step={50}
                  onChange={(v) => updateSettings({ scrollSpeed: v })}
                />
                <SliderRow
                  label="Lift"
                  value={settings.liftPercent}
                  display={`${settings.liftPercent}%`}
                  min={0} max={100} step={1}
                  onChange={(v) => updateSettings({ liftPercent: v })}
                />
                <SliderRow
                  label="Sudden"
                  value={settings.suddenPercent}
                  display={`${settings.suddenPercent}%`}
                  min={0} max={100} step={1}
                  disabled
                  badge="Coming soon"
                  onChange={() => {}}
                />
              </Group>

              <Group title="Display">
                <SelectRow
                  label="Render Resolution"
                  value={String(settings.renderHeight)}
                  options={[
                    { value: '720', label: '720p' },
                    { value: '1080', label: '1080p' },
                    { value: '1440', label: '1440p' },
                  ]}
                  onChange={(v) => updateSettings({ renderHeight: Number(v) })}
                />
              </Group>
            </div>
          )}

          {section === 'skin' && (
            <div className="stg-section">
              <div className="stg-skin-grid">
                {AVAILABLE_SKINS.map((skin) => {
                  const isSelected = settings.skinId === skin.theme.id;
                  return (
                    <button
                      key={skin.theme.id}
                      className={`stg-skin-card${isSelected ? ' is-selected' : ''}`}
                      aria-pressed={isSelected}
                      onClick={() => updateSettings({ skinId: skin.theme.id })}
                    >
                      <span
                        className="stg-skin-swatch"
                        style={{ backgroundColor: `#${skin.theme.accent.toString(16).padStart(6, '0')}` }}
                      />
                      <span className="stg-skin-name">{skin.theme.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {section === 'advanced' && (
            <div className="stg-section">
              <Group title="Developer">
                <ToggleRow
                  label="Debug Mode"
                  desc="Show on-screen debug overlays."
                  checked={settings.debugMode ?? false}
                  onChange={(c) => updateSettings({ debugMode: c })}
                />
              </Group>
            </div>
          )}
        </div>
      </div>

      <div className="stg-toast-slot" aria-live="polite">
        {toast && (
          <div className={`stg-toast stg-toast--${toast.tone}`}>
            {toast.message}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Section: Controls (key bindings) ---
function ControlsSection({
  keyBindings, listeningLane, onStartListening, onRemoveKey, onResetPreset,
}: {
  keyBindings: Record<Lane, string[]>;
  listeningLane: Lane | null;
  onStartListening: (lane: Lane) => void;
  onRemoveKey: (lane: Lane, key: string) => void;
  onResetPreset: (preset: 'tkl' | 'numpad') => void;
}) {
  return (
    <div className="stg-section">
      <Group title="Key Bindings">
        {LANES.map((lane, i) => (
          <div key={lane} className="stg-row stg-row--keys">
            <span className="stg-row-label">Lane {i + 1}</span>
            <div className="stg-chips">
              {keyBindings[lane].map((keyCode) => (
                <span key={keyCode} className="stg-chip">
                  <span className="stg-chip-key">{keyCode}</span>
                  <button
                    className="stg-chip-x"
                    onClick={() => onRemoveKey(lane, keyCode)}
                    aria-label={`Remove ${keyCode} from lane ${i + 1}`}
                    title="Remove key"
                  >
                    ×
                  </button>
                </span>
              ))}
              <button
                className={`stg-addkey${listeningLane === lane ? ' is-listening' : ''}`}
                onClick={() => onStartListening(lane)}
                disabled={listeningLane !== null && listeningLane !== lane}
              >
                {listeningLane === lane ? 'Press any key…' : '+ Add'}
              </button>
            </div>
          </div>
        ))}
      </Group>

      <div className="stg-preset-row">
        <button className="stg-btn" onClick={() => onResetPreset('tkl')}>Reset to TKL</button>
        <button className="stg-btn" onClick={() => onResetPreset('numpad')}>Reset to Numpad</button>
      </div>
    </div>
  );
}

// --- Shared row primitives ---
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="stg-group">
      <h2 className="stg-group-title">{title}</h2>
      <div className="stg-group-body">{children}</div>
    </section>
  );
}

function SliderRow({
  label, value, display, min, max, step, onChange, disabled, badge,
}: {
  label: string; value: number; display: string;
  min: number; max: number; step: number;
  onChange: (v: number) => void; disabled?: boolean; badge?: string;
}) {
  return (
    <div className={`stg-row${disabled ? ' is-disabled' : ''}`}>
      <span className="stg-row-label">
        {label}
        {badge && <span className="stg-badge">{badge}</span>}
      </span>
      <input
        type="range"
        className="stg-slider"
        min={min} max={max} step={step}
        value={value}
        disabled={disabled}
        aria-label={badge ? `${label} (${badge})` : label}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="stg-row-value">{display}</span>
    </div>
  );
}

function SelectRow({
  label, value, options, onChange,
}: {
  label: string; value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="stg-row">
      <span className="stg-row-label">{label}</span>
      <select className="stg-select" value={value} aria-label={label} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function NumberRow({
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
          value={text}
          aria-label={`${label} (${unit})`}
          onChange={(e) => onText(e.target.value)}
          onBlur={() => { const n = Number(text); onCommit(isNaN(n) ? 0 : n); }}
        />
        <span className="stg-number-unit">{unit}</span>
      </div>
    </div>
  );
}

function ToggleRow({
  label, desc, checked, onChange,
}: {
  label: string; desc?: string; checked: boolean; onChange: (c: boolean) => void;
}) {
  return (
    <label className="stg-row stg-row--toggle">
      <span className="stg-row-label">
        {label}
        {desc && <span className="stg-row-desc">{desc}</span>}
      </span>
      <input
        type="checkbox"
        className="stg-check"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

const settingsPanelCss = `
.stg-panel {
  --bg: #1a1a1a; --surface: #232323; --nav: #161616; --border: #2f2f2f; --border-soft: #2a2a2a;
  --ink: #e6e6e6; --muted: #8c8c8c; --accent: #00e5e5; --accent-ink: #06181a; --danger: #ff6b6b;
  position: relative;
  display: flex; flex-direction: column; height: 100%; min-height: 0; overflow: hidden;
  background: var(--bg); color: var(--ink);
  font-family: system-ui, -apple-system, sans-serif; font-size: 14px;
}
.stg-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 20px; border-bottom: 1px solid var(--border); flex-shrink: 0;
}
.stg-title { margin: 0; font-size: 16px; font-weight: 650; letter-spacing: -0.01em; }
.stg-close {
  padding: 6px 14px; font-size: 13px; color: var(--muted);
  background: transparent; border: 1px solid var(--border); border-radius: 6px; cursor: pointer;
  transition: color 160ms ease, border-color 160ms ease, background 160ms ease;
}
.stg-close:hover { color: var(--ink); border-color: #4a4a4a; background: #202020; }
.stg-close:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }

.stg-body { flex: 1; min-height: 0; display: flex; }
.stg-nav {
  width: 168px; flex-shrink: 0; display: flex; flex-direction: column; gap: 2px;
  padding: 12px 10px; background: var(--nav); border-right: 1px solid var(--border);
  overflow-y: auto;
}
.stg-nav-item {
  text-align: left; padding: 8px 12px; font-size: 13.5px; font-weight: 500;
  color: var(--muted); background: transparent; border: 0; border-radius: 6px; cursor: pointer;
  transition: color 160ms ease, background 160ms ease;
}
.stg-nav-item:hover { color: var(--ink); background: #202020; }
.stg-nav-item:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.stg-nav-item[aria-current="page"] { color: var(--accent); background: #14201f; font-weight: 600; }

.stg-content { flex: 1; min-width: 0; overflow-y: auto; padding: 20px 22px; }
.stg-section { display: flex; flex-direction: column; gap: 22px; }
.stg-group { display: flex; flex-direction: column; gap: 4px; }
.stg-group-title {
  margin: 0 0 6px; font-size: 12px; font-weight: 700; letter-spacing: 0.04em;
  text-transform: uppercase; color: var(--muted);
}
.stg-group-body {
  display: flex; flex-direction: column;
  background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
  overflow: hidden;
}

.stg-row {
  display: flex; align-items: center; gap: 14px; min-height: 46px;
  padding: 10px 14px;
}
.stg-row + .stg-row { border-top: 1px solid var(--border-soft); }
.stg-row.is-disabled { opacity: 0.45; }
.stg-row--toggle { cursor: pointer; }
.stg-row--keys { align-items: flex-start; }
.stg-row-label {
  display: flex; flex-direction: column; gap: 3px;
  flex: 0 0 128px; font-size: 13.5px; font-weight: 500; color: var(--ink);
}
.stg-row--keys .stg-row-label { padding-top: 6px; }
.stg-row-desc { font-size: 11.5px; font-weight: 400; color: var(--muted); }
.stg-row-value {
  flex: 0 0 auto; min-width: 52px; text-align: right;
  font-variant-numeric: tabular-nums; font-size: 13px; font-weight: 600; color: var(--accent);
}
.stg-badge {
  display: inline-block; margin-top: 3px; padding: 1px 6px; width: fit-content;
  font-size: 10px; font-weight: 600; letter-spacing: 0.02em; text-transform: uppercase;
  color: var(--muted); background: #2c2c2c; border-radius: 4px;
}

.stg-slider { flex: 1; min-width: 0; accent-color: var(--accent); cursor: pointer; }
.stg-slider:disabled { cursor: not-allowed; }
.stg-slider:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }

.stg-select {
  flex: 1; min-width: 0; padding: 7px 10px; font-size: 13px; color: var(--ink);
  background: #1b1b1b; border: 1px solid var(--border); border-radius: 6px; cursor: pointer;
  transition: border-color 160ms ease;
}
.stg-select:hover { border-color: #4a4a4a; }
.stg-select:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; border-color: var(--accent); }

.stg-number-wrap { display: flex; align-items: center; gap: 8px; }
.stg-number {
  width: 96px; padding: 7px 10px; font-size: 13px; color: var(--ink);
  font-variant-numeric: tabular-nums;
  background: #1b1b1b; border: 1px solid var(--border); border-radius: 6px;
  transition: border-color 160ms ease;
}
.stg-number:hover { border-color: #4a4a4a; }
.stg-number:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; border-color: var(--accent); }
.stg-number-unit { font-size: 12px; color: var(--muted); }

.stg-check { width: 18px; height: 18px; accent-color: var(--accent); cursor: pointer; margin-left: auto; }
.stg-check:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.stg-row--toggle .stg-row-label { flex: 1; }

.stg-chips { display: flex; flex-wrap: wrap; gap: 6px; flex: 1; }
.stg-chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 6px 4px 9px; font-size: 12.5px; font-variant-numeric: tabular-nums;
  color: var(--accent); background: #142020; border: 1px solid #245050; border-radius: 6px;
}
.stg-chip-x {
  display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px;
  font-size: 15px; line-height: 1; color: var(--muted);
  background: transparent; border: 0; border-radius: 4px; cursor: pointer;
  transition: color 140ms ease, background 140ms ease;
}
.stg-chip-x:hover { color: var(--danger); background: #2a1414; }
.stg-chip-x:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.stg-addkey {
  padding: 4px 12px; font-size: 12.5px; color: var(--muted);
  background: #1f1f1f; border: 1px dashed #454545; border-radius: 6px; cursor: pointer;
  transition: color 160ms ease, border-color 160ms ease, background 160ms ease;
}
.stg-addkey:hover:not(:disabled) { color: var(--ink); border-color: #5a5a5a; }
.stg-addkey:disabled { opacity: 0.4; cursor: not-allowed; }
.stg-addkey.is-listening {
  color: var(--accent-ink); background: var(--accent); border-color: var(--accent); border-style: solid;
  font-weight: 600; animation: stgPulse 1.1s ease-in-out infinite;
}

.stg-preset-row { display: flex; gap: 10px; }
.stg-btn {
  padding: 8px 16px; font-size: 13px; font-weight: 500; color: var(--ink);
  background: #2a2a2a; border: 1px solid var(--border); border-radius: 6px; cursor: pointer;
  transition: background 160ms ease, border-color 160ms ease;
}
.stg-btn:hover { background: #333; border-color: #4a4a4a; }
.stg-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.stg-btn--accent {
  color: var(--accent-ink); background: var(--accent); border-color: var(--accent); font-weight: 600;
  margin-left: auto;
}
.stg-btn--accent:hover { background: #16d1d1; border-color: #16d1d1; }
.stg-row--action { justify-content: space-between; }

.stg-skin-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); gap: 10px; }
.stg-skin-card {
  display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 14px 10px;
  background: var(--surface); border: 1px solid var(--border); border-radius: 10px; cursor: pointer;
  transition: border-color 160ms ease, background 160ms ease;
}
.stg-skin-card:hover { border-color: #4a4a4a; background: #262626; }
.stg-skin-card:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.stg-skin-card.is-selected { border-color: var(--accent); background: #14201f; }
.stg-skin-swatch { width: 44px; height: 44px; border-radius: 50%; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08); }
.stg-skin-name { font-size: 12.5px; font-weight: 500; }
.stg-skin-card.is-selected .stg-skin-name { color: var(--accent); }

.stg-toast-slot {
  position: absolute; left: 0; right: 0; bottom: 16px;
  display: flex; justify-content: center; pointer-events: none; padding: 0 16px;
}
.stg-toast {
  max-width: 90%; padding: 9px 16px; font-size: 13px; font-weight: 500; border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4); animation: stgToastIn 180ms cubic-bezier(0.22,1,0.36,1);
}
.stg-toast--error { color: #ffd9d9; background: #3a1f1f; border: 1px solid #7a3a3a; }
.stg-toast--info { color: var(--accent); background: #14201f; border: 1px solid #245050; }

@keyframes stgPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
@keyframes stgToastIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

@media (max-width: 620px) {
  .stg-body { flex-direction: column; }
  .stg-nav {
    width: auto; flex-direction: row; gap: 4px; overflow-x: auto;
    border-right: 0; border-bottom: 1px solid var(--border); padding: 8px 10px;
  }
  .stg-nav-item { white-space: nowrap; }
  .stg-row { flex-wrap: wrap; }
  .stg-row-label { flex-basis: 100%; }
}

@media (prefers-reduced-motion: reduce) {
  .stg-panel *, .stg-addkey.is-listening, .stg-toast {
    animation-duration: 1ms !important; transition-duration: 1ms !important;
  }
}
`;

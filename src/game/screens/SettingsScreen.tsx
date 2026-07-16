import { useGameStore, PRESET_BINDINGS } from '../stores';
import { AVAILABLE_SKINS } from '../skin';
import { useState, useEffect, useRef } from 'react';
import { font, color, surface, edge, radius, primitives } from '../../shared/theme';

type Lane = 'lane1' | 'lane2' | 'lane3' | 'lane4';

export function SettingsScreen() {
  const { settings, updateSettings, setScreen } = useGameStore();
  const [listeningLane, setListeningLane] = useState<Lane | null>(null);
  const [warningMessage, setWarningMessage] = useState<string>('');
  const warningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [audioOffsetText, setAudioOffsetText] = useState(String(settings.audioOffsetMs));
  const [judgmentOffsetText, setJudgmentOffsetText] = useState(String(settings.judgmentOffsetMs));

  // Cleanup warning timeout on unmount
  useEffect(() => {
    return () => {
      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
      }
    };
  }, []);

  const showWarning = (message: string, duration = 3000) => {
    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current);
    }
    setWarningMessage(message);
    warningTimeoutRef.current = setTimeout(() => setWarningMessage(''), duration);
  };

  // Listening mode: capture next keydown event
  useEffect(() => {
    if (!listeningLane) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      const keyCode = event.code;

      // Check if key is already bound to any lane
      const allKeys = Object.values(settings.keyBindings).flat();
      if (allKeys.includes(keyCode)) {
        showWarning(`Key "${keyCode}" is already bound to another lane`);
        setListeningLane(null);
        return;
      }

      // Add key to the listening lane
      const updatedLane = [...settings.keyBindings[listeningLane], keyCode];
      updateSettings({
        keyBindings: {
          ...settings.keyBindings,
          [listeningLane]: updatedLane,
        },
      });
      setListeningLane(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [listeningLane, settings.keyBindings, updateSettings]);

  const handleRemoveKey = (lane: Lane, keyToRemove: string) => {
    const currentKeys = settings.keyBindings[lane];
    if (currentKeys.length <= 2) {
      showWarning('Each lane must have at least 2 keys');
      return;
    }

    const updatedKeys = currentKeys.filter((key) => key !== keyToRemove);
    updateSettings({
      keyBindings: {
        ...settings.keyBindings,
        [lane]: updatedKeys,
      },
    });
  };

  const handleResetToPreset = (preset: 'tkl' | 'numpad') => {
    updateSettings({
      keyBindings: PRESET_BINDINGS[preset],
      preset,
    });
    showWarning(`Reset to ${preset.toUpperCase()} preset`, 2000);
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>
          <span style={styles.titleAccent} aria-hidden="true" />
          Settings
        </h1>
        <button style={styles.backBtn} onClick={() => setScreen('songSelect')}>
          Back
        </button>
      </div>

      <div style={styles.content}>
        <div style={styles.settingsGrid}>
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Key Bindings</h2>

            {warningMessage && (
              <div style={styles.warning}>{warningMessage}</div>
            )}

            <div style={styles.keyBindings}>
              {(['lane1', 'lane2', 'lane3', 'lane4'] as const).map((lane) => (
                <div key={lane} style={styles.laneRow}>
                  <span style={styles.label}>{lane}:</span>
                  <div style={styles.keyChipsContainer}>
                    {settings.keyBindings[lane].map((keyCode) => (
                      <div key={keyCode} style={styles.keyChip}>
                        <span>{keyCode}</span>
                        <button
                          style={styles.removeKeyButton}
                          onClick={() => handleRemoveKey(lane, keyCode)}
                          title="Remove key"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button
                      style={{
                        ...styles.addKeyButton,
                        ...(listeningLane === lane ? styles.addKeyButtonListening : {}),
                      }}
                      onClick={() => setListeningLane(lane)}
                      disabled={listeningLane !== null && listeningLane !== lane}
                    >
                      {listeningLane === lane ? 'Press any key...' : '+ Add Key'}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div style={styles.presetButtons}>
              <button
                style={styles.presetButton}
                onClick={() => handleResetToPreset('tkl')}
              >
                Reset to TKL Preset
              </button>
              <button
                style={styles.presetButton}
                onClick={() => handleResetToPreset('numpad')}
              >
                Reset to Numpad Preset
              </button>
            </div>
          </div>

          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Gameplay</h2>

            <div style={styles.setting}>
              <label style={styles.label}>Master Volume: {Math.round((settings.masterVolume ?? 1) * 100)}%</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={settings.masterVolume ?? 1}
                onChange={(e) => updateSettings({ masterVolume: Number(e.target.value) })}
                style={styles.slider}
              />
            </div>

            <div style={styles.setting}>
              <label style={styles.label}>Judgment Mode:</label>
              <select
                value={settings.judgmentMode ?? 'normal'}
                onChange={(e) => updateSettings({ judgmentMode: e.target.value as 'normal' | 'easy' })}
                style={styles.select}
              >
                <option value="normal">Normal</option>
                <option value="easy">Easy</option>
              </select>
            </div>

            <div style={styles.setting}>
              <label style={styles.label}>Play Speed: x{(settings.playSpeed ?? 1).toFixed(2)}</label>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.05"
                value={settings.playSpeed}
                onChange={(e) => updateSettings({ playSpeed: Number(e.target.value) })}
                style={styles.slider}
              />
            </div>

            <div style={styles.setting}>
              <label style={styles.label}>Scroll Speed: {settings.scrollSpeed}</label>
              <input
                type="range"
                min="200"
                max="2000"
                step="50"
                value={settings.scrollSpeed}
                onChange={(e) => updateSettings({ scrollSpeed: Number(e.target.value) })}
                style={styles.slider}
              />
            </div>

            <div style={styles.setting}>
              <label style={styles.label}>Lift (%): {settings.liftPercent}</label>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={settings.liftPercent}
                onChange={(e) => updateSettings({ liftPercent: Number(e.target.value) })}
                style={styles.slider}
              />
            </div>

            <div style={{ ...styles.setting, opacity: 0.4 }}>
              <label style={styles.label}>Sudden (%): {settings.suddenPercent} (미구현)</label>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={settings.suddenPercent}
                disabled
                style={styles.slider}
              />
            </div>

            <div style={styles.setting}>
              <label style={styles.label}>Render Resolution:</label>
              <select
                value={settings.renderHeight}
                onChange={(e) => updateSettings({ renderHeight: Number(e.target.value) })}
                style={styles.select}
              >
                <option value="720">720p</option>
                <option value="1080">1080p</option>
                <option value="1440">1440p</option>
              </select>
            </div>

            <div style={styles.setting}>
              <label style={styles.label}>Audio Offset (ms):</label>
              <input
                type="number"
                value={audioOffsetText}
                onChange={(e) => setAudioOffsetText(e.target.value)}
                onBlur={() => {
                  const n = Number(audioOffsetText);
                  updateSettings({ audioOffsetMs: isNaN(n) ? 0 : n });
                  setAudioOffsetText(String(isNaN(n) ? 0 : n));
                }}
                style={styles.numberInput}
              />
            </div>

            <div style={styles.setting}>
              <label style={styles.label}>Judgment Offset (ms):</label>
              <input
                type="number"
                value={judgmentOffsetText}
                onChange={(e) => setJudgmentOffsetText(e.target.value)}
                onBlur={() => {
                  const n = Number(judgmentOffsetText);
                  updateSettings({ judgmentOffsetMs: isNaN(n) ? 0 : n });
                  setJudgmentOffsetText(String(isNaN(n) ? 0 : n));
                }}
                style={styles.numberInput}
              />
            </div>

            <div style={styles.setting}>
              <button
                style={styles.calibrationBtn}
                onClick={() => setScreen('calibration')}
              >
                Calibrate Offsets
              </button>
            </div>

            <div style={styles.setting}>
              <label style={styles.label}>
                <input
                  type="checkbox"
                  checked={settings.showFastSlow}
                  onChange={(e) => updateSettings({ showFastSlow: e.target.checked })}
                  style={styles.checkbox}
                />
                Show FAST/SLOW
              </label>
            </div>

            <div style={styles.setting}>
              <label style={styles.label}>
                <input
                  type="checkbox"
                  checked={settings.showTimingDiff}
                  onChange={(e) => updateSettings({ showTimingDiff: e.target.checked })}
                  style={styles.checkbox}
                />
                Show Timing Diff
              </label>
            </div>

            <div style={styles.setting}>
              <label style={styles.label}>
                <input
                  type="checkbox"
                  checked={settings.debugMode ?? false}
                  onChange={(e) => updateSettings({ debugMode: e.target.checked })}
                  style={styles.checkbox}
                />
                Debug Mode
              </label>
            </div>
          </div>

          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Skin</h2>
            <div style={styles.skinGrid}>
              {AVAILABLE_SKINS.map((skin) => {
                const isSelected = settings.skinId === skin.theme.id;
                return (
                  <button
                    key={skin.theme.id}
                    style={{
                      ...styles.skinCard,
                      ...(isSelected ? styles.skinCardSelected : {}),
                    }}
                    onClick={() => updateSettings({ skinId: skin.theme.id })}
                  >
                    <div
                      style={{
                        ...styles.skinSwatch,
                        backgroundColor: `#${skin.theme.accent.toString(16).padStart(6, '0')}`,
                      }}
                    />
                    <span style={styles.skinName}>{skin.theme.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    ...primitives.screen,
  },
  header: {
    ...primitives.header,
    padding: '16px 24px',
  },
  title: {
    ...primitives.title,
  },
  titleAccent: {
    ...primitives.titleAccent,
  },
  backBtn: {
    ...primitives.ghostButton,
    padding: '6px 16px',
    fontSize: '13px',
  },
  content: {
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '24px',
  },
  settingsGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    width: '100%',
    maxWidth: '600px',
  },
  section: {
    background: surface.card,
    padding: '24px',
    borderRadius: radius.md,
    border: `1px solid ${color.line}`,
    boxShadow: edge.metal,
  },
  sectionTitle: {
    fontFamily: font.display,
    fontSize: '16px',
    fontWeight: 600,
    letterSpacing: '0.04em',
    color: color.ink,
    margin: '0 0 16px',
  },
  warning: {
    backgroundColor: color.danger,
    color: '#ffffff',
    padding: '12px',
    borderRadius: radius.sm,
    marginBottom: '16px',
    textAlign: 'center',
    fontSize: '14px',
    fontWeight: 'bold',
  },
  keyBindings: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  laneRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: '14px',
  },
  keyChipsContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    flex: 1,
  },
  keyChip: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    background: surface.button,
    border: `1px solid ${color.neon}`,
    borderRadius: radius.sm,
    padding: '6px 10px',
    fontFamily: font.numeric,
    fontSize: '13px',
    color: color.neon,
  },
  removeKeyButton: {
    backgroundColor: 'transparent',
    border: 'none',
    color: color.danger,
    fontSize: '18px',
    cursor: 'pointer',
    padding: '0',
    width: '18px',
    height: '18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold',
  },
  addKeyButton: {
    background: surface.button,
    border: `1px solid ${color.line}`,
    borderRadius: radius.sm,
    padding: '6px 10px',
    fontFamily: font.display,
    fontSize: '13px',
    color: color.ink,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  addKeyButtonListening: {
    background: color.neon,
    color: color.bg,
    border: `1px solid ${color.neon}`,
    boxShadow: edge.neonFocus,
    animation: 'pulse 1s infinite',
  },
  presetButtons: {
    display: 'flex',
    gap: '12px',
    marginTop: '16px',
  },
  presetButton: {
    ...primitives.metalButton,
    flex: 1,
    fontSize: '13px',
  },
  setting: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginBottom: '16px',
  },
  label: {
    fontSize: '14px',
    fontWeight: 600,
    minWidth: '60px',
    color: color.ink,
  },
  slider: {
    width: '100%',
    accentColor: color.neon,
  },
  select: {
    padding: '8px',
    fontSize: '14px',
    background: surface.button,
    color: color.ink,
    border: `1px solid ${color.line}`,
    borderRadius: radius.sm,
  },
  numberInput: {
    padding: '8px',
    fontFamily: font.numeric,
    fontSize: '14px',
    background: surface.button,
    color: color.ink,
    border: `1px solid ${color.line}`,
    borderRadius: radius.sm,
    width: '150px',
  },
  checkbox: {
    marginRight: '8px',
    width: '18px',
    height: '18px',
    verticalAlign: 'middle',
    accentColor: color.neon,
  },
  skinGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
    gap: '12px',
  },
  skinCard: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '8px',
    padding: '12px',
    background: surface.card,
    // border 단축 대신 롱핸드 — 선택 시 borderColor만 토글해도 React 경고가 없다
    borderWidth: '2px',
    borderStyle: 'solid',
    borderColor: color.line,
    borderRadius: radius.md,
    boxShadow: edge.metal,
    cursor: 'pointer',
    transition: 'border-color 0.2s',
  },
  skinCardSelected: {
    borderColor: color.neon,
    boxShadow: edge.neonFocus,
  },
  skinSwatch: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
  },
  skinName: {
    fontFamily: font.display,
    fontSize: '13px',
    fontWeight: 600,
    color: color.ink,
  },
  calibrationBtn: {
    ...primitives.neonButton,
    width: '100%',
  },
};

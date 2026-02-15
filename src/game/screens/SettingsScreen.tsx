import { useGameStore, PRESET_BINDINGS } from '../stores';
import { useState, useEffect, useRef } from 'react';

type Lane = 'lane1' | 'lane2' | 'lane3' | 'lane4';

export function SettingsScreen() {
  const { settings, updateSettings, setScreen } = useGameStore();
  const [listeningLane, setListeningLane] = useState<Lane | null>(null);
  const [warningMessage, setWarningMessage] = useState<string>('');
  const warningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      <h1 style={styles.title}>Settings</h1>

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

          <div style={styles.setting}>
            <label style={styles.label}>Sudden (%): {settings.suddenPercent}</label>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={settings.suddenPercent}
              onChange={(e) => updateSettings({ suddenPercent: Number(e.target.value) })}
              style={styles.slider}
            />
          </div>

          <div style={styles.setting}>
            <label style={styles.label}>Target FPS:</label>
            <select
              value={settings.targetFps}
              onChange={(e) => updateSettings({ targetFps: Number(e.target.value) })}
              style={styles.select}
            >
              <option value="60">60</option>
              <option value="120">120</option>
              <option value="144">144</option>
              <option value="0">Unlimited</option>
            </select>
          </div>

          <div style={styles.setting}>
            <label style={styles.label}>Audio Offset (ms):</label>
            <input
              type="number"
              value={settings.offsetMs}
              onChange={(e) => updateSettings({ offsetMs: Number(e.target.value) })}
              style={styles.numberInput}
            />
          </div>
        </div>
      </div>

      <button style={styles.button} onClick={() => setScreen('songSelect')}>
        Back
      </button>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    padding: '32px',
    minHeight: '100vh',
    overflow: 'auto' as const,
    backgroundColor: '#1a1a1a',
    color: '#ffffff',
  },
  title: {
    fontSize: '48px',
    marginBottom: '32px',
  },
  settingsGrid: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '32px',
    width: '100%',
    maxWidth: '600px',
    marginBottom: '32px',
  },
  section: {
    backgroundColor: '#2a2a2a',
    padding: '24px',
    borderRadius: '8px',
  },
  sectionTitle: {
    fontSize: '24px',
    marginBottom: '16px',
  },
  warning: {
    backgroundColor: '#ff6b6b',
    color: '#ffffff',
    padding: '12px',
    borderRadius: '4px',
    marginBottom: '16px',
    textAlign: 'center' as const,
    fontSize: '14px',
    fontWeight: 'bold',
  },
  keyBindings: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  laneRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: '16px',
  },
  keyChipsContainer: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '8px',
    flex: 1,
  },
  keyChip: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: '#1a1a1a',
    border: '1px solid #00ffff',
    borderRadius: '4px',
    padding: '6px 10px',
    fontSize: '14px',
    color: '#00ffff',
  },
  removeKeyButton: {
    backgroundColor: 'transparent',
    border: 'none',
    color: '#ff6b6b',
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
    backgroundColor: '#3a3a3a',
    border: '1px solid #666666',
    borderRadius: '4px',
    padding: '6px 10px',
    fontSize: '14px',
    color: '#ffffff',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  addKeyButtonListening: {
    backgroundColor: '#00ffff',
    color: '#1a1a1a',
    border: '1px solid #00ffff',
    animation: 'pulse 1s infinite',
  },
  presetButtons: {
    display: 'flex',
    gap: '12px',
    marginTop: '16px',
  },
  presetButton: {
    flex: 1,
    padding: '10px 16px',
    fontSize: '14px',
    backgroundColor: '#3a3a3a',
    color: '#ffffff',
    border: '1px solid #666666',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  setting: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
    marginBottom: '16px',
  },
  label: {
    fontSize: '16px',
    fontWeight: 'bold',
    minWidth: '60px',
  },
  slider: {
    width: '100%',
  },
  select: {
    padding: '8px',
    fontSize: '16px',
    backgroundColor: '#1a1a1a',
    color: '#ffffff',
    border: '1px solid #666666',
    borderRadius: '4px',
  },
  numberInput: {
    padding: '8px',
    fontSize: '16px',
    backgroundColor: '#1a1a1a',
    color: '#ffffff',
    border: '1px solid #666666',
    borderRadius: '4px',
    width: '150px',
  },
  button: {
    fontSize: '18px',
    padding: '12px 24px',
    backgroundColor: '#00ffff',
    color: '#1a1a1a',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
};

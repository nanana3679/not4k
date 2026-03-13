import { useGameStore, PRESET_BINDINGS } from '../stores';
import { SKIN_LIST } from '../skin';
import { useState, useEffect, useRef } from 'react';
import css from './SettingsScreen.module.css';
import arcCss from '../styles/arcade.module.css';

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
    <div className={css.container}>
      <div className={css.header}>
        <h1 className={css.headerTitle}>Settings</h1>
        <button className={arcCss.btnGhost} onClick={() => setScreen('songSelect')}>
          Back
        </button>
      </div>

      <div className={css.content}>
        <div className={css.settingsGrid}>
          <div className={css.section}>
            <h2 className={css.sectionTitle}>Key Bindings</h2>

            {warningMessage && (
              <div className={css.warning}>{warningMessage}</div>
            )}

            <div className={css.keyBindings}>
              {(['lane1', 'lane2', 'lane3', 'lane4'] as const).map((lane) => (
                <div key={lane} className={css.laneRow}>
                  <span className={css.laneLabel}>{lane}</span>
                  <div className={css.keyChipsContainer}>
                    {settings.keyBindings[lane].map((keyCode) => (
                      <div key={keyCode} className={css.keyChip}>
                        <span>{keyCode}</span>
                        <button
                          className={css.removeKeyBtn}
                          onClick={() => handleRemoveKey(lane, keyCode)}
                          title="Remove key"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button
                      className={`${css.addKeyBtn} ${listeningLane === lane ? css.addKeyBtnListening : ''}`}
                      onClick={() => setListeningLane(lane)}
                      disabled={listeningLane !== null && listeningLane !== lane}
                    >
                      {listeningLane === lane ? 'Press any key...' : '+ Add Key'}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className={css.presetButtons}>
              <button
                className={css.presetBtn}
                onClick={() => handleResetToPreset('tkl')}
              >
                Reset to TKL
              </button>
              <button
                className={css.presetBtn}
                onClick={() => handleResetToPreset('numpad')}
              >
                Reset to Numpad
              </button>
            </div>
          </div>

          <div className={css.section}>
            <h2 className={css.sectionTitle}>Gameplay</h2>

            <div className={css.setting}>
              <label className={css.label}>Judgment Mode</label>
              <select
                value={settings.judgmentMode ?? 'normal'}
                onChange={(e) => updateSettings({ judgmentMode: e.target.value as 'normal' | 'easy' })}
                className={css.select}
              >
                <option value="normal">Normal</option>
                <option value="easy">Easy</option>
              </select>
            </div>

            <div className={css.setting}>
              <label className={css.label}>Play Speed: x{(settings.playSpeed ?? 1).toFixed(2)}</label>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.05"
                value={settings.playSpeed}
                onChange={(e) => updateSettings({ playSpeed: Number(e.target.value) })}
                className={css.slider}
              />
            </div>

            <div className={css.setting}>
              <label className={css.label}>Scroll Speed: {settings.scrollSpeed}</label>
              <input
                type="range"
                min="200"
                max="2000"
                step="50"
                value={settings.scrollSpeed}
                onChange={(e) => updateSettings({ scrollSpeed: Number(e.target.value) })}
                className={css.slider}
              />
            </div>

            <div className={css.setting}>
              <label className={css.label}>Lift (%): {settings.liftPercent}</label>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={settings.liftPercent}
                onChange={(e) => updateSettings({ liftPercent: Number(e.target.value) })}
                className={css.slider}
              />
            </div>

            <div className={css.setting}>
              <label className={css.label}>Sudden (%): {settings.suddenPercent}</label>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={settings.suddenPercent}
                onChange={(e) => updateSettings({ suddenPercent: Number(e.target.value) })}
                className={css.slider}
              />
            </div>

            <div className={css.setting}>
              <label className={css.label}>Render Resolution</label>
              <select
                value={settings.renderHeight}
                onChange={(e) => updateSettings({ renderHeight: Number(e.target.value) })}
                className={css.select}
              >
                <option value="720">720p</option>
                <option value="1080">1080p</option>
                <option value="1440">1440p</option>
              </select>
            </div>

            <div className={css.setting}>
              <label className={css.label}>Target FPS</label>
              <select
                value={settings.targetFps}
                onChange={(e) => updateSettings({ targetFps: Number(e.target.value) })}
                className={css.select}
              >
                <option value="60">60</option>
                <option value="120">120</option>
                <option value="144">144</option>
                <option value="0">Unlimited</option>
              </select>
            </div>

            <div className={css.setting}>
              <label className={css.label}>Audio Offset (ms)</label>
              <input
                type="number"
                value={audioOffsetText}
                onChange={(e) => setAudioOffsetText(e.target.value)}
                onBlur={() => {
                  const n = Number(audioOffsetText);
                  updateSettings({ audioOffsetMs: isNaN(n) ? 0 : n });
                  setAudioOffsetText(String(isNaN(n) ? 0 : n));
                }}
                className={css.numberInput}
              />
            </div>

            <div className={css.setting}>
              <label className={css.label}>Judgment Offset (ms)</label>
              <input
                type="number"
                value={judgmentOffsetText}
                onChange={(e) => setJudgmentOffsetText(e.target.value)}
                onBlur={() => {
                  const n = Number(judgmentOffsetText);
                  updateSettings({ judgmentOffsetMs: isNaN(n) ? 0 : n });
                  setJudgmentOffsetText(String(isNaN(n) ? 0 : n));
                }}
                className={css.numberInput}
              />
            </div>

            <div className={css.setting}>
              <button
                className={css.calibrationBtn}
                onClick={() => setScreen('calibration')}
              >
                Calibrate Offsets
              </button>
            </div>

            <div className={css.setting}>
              <label className={css.label}>
                <input
                  type="checkbox"
                  checked={settings.showFastSlow}
                  onChange={(e) => updateSettings({ showFastSlow: e.target.checked })}
                  className={css.checkbox}
                />
                Show FAST/SLOW
              </label>
            </div>

            <div className={css.setting}>
              <label className={css.label}>
                <input
                  type="checkbox"
                  checked={settings.showTimingDiff}
                  onChange={(e) => updateSettings({ showTimingDiff: e.target.checked })}
                  className={css.checkbox}
                />
                Show Timing Diff
              </label>
            </div>

            <div className={css.setting}>
              <label className={css.label}>
                <input
                  type="checkbox"
                  checked={settings.debugMode ?? false}
                  onChange={(e) => updateSettings({ debugMode: e.target.checked })}
                  className={css.checkbox}
                />
                Debug Mode
              </label>
            </div>
          </div>

          <div className={css.section}>
            <h2 className={css.sectionTitle}>Skin</h2>
            <div className={css.skinGrid}>
              {SKIN_LIST.map((skin) => {
                const isSelected = settings.skinId === skin.theme.id;
                return (
                  <button
                    key={skin.theme.id}
                    className={`${css.skinCard} ${isSelected ? css.skinCardSelected : ''}`}
                    onClick={() => updateSettings({ skinId: skin.theme.id })}
                  >
                    <div
                      className={css.skinSwatch}
                      style={{
                        backgroundColor: `#${skin.theme.accent.toString(16).padStart(6, '0')}`,
                      }}
                    />
                    <span className={css.skinName}>{skin.theme.name}</span>
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

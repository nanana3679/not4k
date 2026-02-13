import { useGameStore } from '../stores';

export function SettingsScreen() {
  const { settings, updateSettings, setScreen } = useGameStore();

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Settings</h1>

      <div style={styles.settingsGrid}>
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Key Bindings</h2>
          <div style={styles.keyBindings}>
            {(['lane1', 'lane2', 'lane3', 'lane4'] as const).map((lane) => (
              <div key={lane} style={styles.laneRow}>
                <span style={styles.label}>{lane}:</span>
                <span style={styles.keys}>
                  {settings.keyBindings[lane].join(', ')}
                </span>
              </div>
            ))}
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
            <label style={styles.label}>Lift (px): {settings.liftPx}</label>
            <input
              type="range"
              min="0"
              max="200"
              step="10"
              value={settings.liftPx}
              onChange={(e) => updateSettings({ liftPx: Number(e.target.value) })}
              style={styles.slider}
            />
          </div>

          <div style={styles.setting}>
            <label style={styles.label}>Sudden (px): {settings.suddenPx}</label>
            <input
              type="range"
              min="0"
              max="200"
              step="10"
              value={settings.suddenPx}
              onChange={(e) => updateSettings({ suddenPx: Number(e.target.value) })}
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
  keyBindings: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  laneRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '16px',
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
  },
  keys: {
    color: '#00ffff',
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

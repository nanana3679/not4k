import { useGameStore, PRESET_BINDINGS } from '../stores';

export function PresetSetupScreen() {
  const { updateSettings, completeFirstLaunch, setScreen } = useGameStore();

  const handlePreset = (preset: 'numpad' | 'tkl') => {
    updateSettings({
      preset,
      keyBindings: PRESET_BINDINGS[preset],
    });
    completeFirstLaunch();
    setScreen('songSelect');
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Choose Your Keyboard Layout</h1>
      <div style={styles.buttonContainer}>
        <button style={styles.button} onClick={() => handlePreset('numpad')}>
          Numpad
        </button>
        <button style={styles.button} onClick={() => handlePreset('tkl')}>
          TKL (Tenkeyless)
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    backgroundColor: '#1a1a1a',
    color: '#ffffff',
  },
  title: {
    fontSize: '32px',
    marginBottom: '48px',
  },
  buttonContainer: {
    display: 'flex',
    gap: '32px',
  },
  button: {
    fontSize: '24px',
    padding: '24px 48px',
    backgroundColor: '#00ffff',
    color: '#1a1a1a',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
};

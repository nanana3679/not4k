import { useGameStore, PRESET_BINDINGS } from '../stores';
import { primitives } from '../../shared/theme';

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
      <h1 style={styles.title}>
        <span style={styles.titleAccent} aria-hidden="true" />
        Choose Your Keyboard Layout
      </h1>
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
    ...primitives.screen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...primitives.title,
    fontSize: '32px',
    marginBottom: '48px',
  },
  titleAccent: {
    ...primitives.titleAccent,
    height: '30px',
  },
  buttonContainer: {
    display: 'flex',
    gap: '32px',
  },
  button: {
    ...primitives.neonButton,
    fontSize: '24px',
    minHeight: '72px',
    padding: '24px 48px',
  },
};

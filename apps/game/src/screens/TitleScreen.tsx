import { useGameStore } from '../stores';

export function TitleScreen() {
  const { settings, setScreen } = useGameStore();

  const handleStart = () => {
    if (settings.isFirstLaunch) {
      setScreen('presetSetup');
    } else {
      setScreen('songSelect');
    }
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>not4k</h1>
      <button style={styles.button} onClick={handleStart}>
        Start
      </button>
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
    fontSize: '72px',
    fontWeight: 'bold',
    marginBottom: '48px',
    color: '#00ffff',
  },
  button: {
    fontSize: '24px',
    padding: '16px 48px',
    backgroundColor: '#00ffff',
    color: '#1a1a1a',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
};

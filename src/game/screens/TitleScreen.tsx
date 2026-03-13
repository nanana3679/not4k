import { useGameStore } from '../stores';
import { useAuth } from '../../shared/hooks/useAuth';

export function TitleScreen() {
  const { settings, setScreen } = useGameStore();
  const { user, loading, signInWithGoogle, signOut } = useAuth();

  const handleStart = () => {
    if (settings.isFirstLaunch) {
      setScreen('presetSetup');
    } else {
      setScreen('songSelect');
    }
  };

  return (
    <div style={styles.container}>
      {/* Auth area (top-right) */}
      <div style={styles.authArea}>
        {loading ? null : user ? (
          <>
            <span style={styles.email}>{user.email}</span>
            <button style={styles.authBtn} onClick={signOut}>Logout</button>
          </>
        ) : (
          <button style={styles.authBtn} onClick={() => signInWithGoogle().catch(() => {})}>Login</button>
        )}
      </div>

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
    position: 'relative' as const,
  },
  authArea: {
    position: 'absolute' as const,
    top: '16px',
    right: '24px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  email: {
    fontSize: '13px',
    color: '#999',
  },
  authBtn: {
    padding: '6px 16px',
    backgroundColor: '#3a3a3a',
    color: '#e0e0e0',
    border: '1px solid #555',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
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

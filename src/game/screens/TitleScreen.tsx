import { useGameStore } from '../stores';
import { useAuth } from '../../shared/hooks/useAuth';
import { font, color, primitives } from '../../shared/theme';

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
    ...primitives.screen,
    alignItems: 'center',
    justifyContent: 'center',
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
    fontFamily: font.body,
    color: color.inkDim,
  },
  authBtn: {
    ...primitives.ghostButton,
    minHeight: '32px',
    padding: '6px 16px',
    fontSize: '13px',
  },
  title: {
    fontFamily: font.display,
    fontSize: '72px',
    fontWeight: 800,
    letterSpacing: '0.14em',
    textTransform: 'uppercase' as const,
    marginBottom: '48px',
    color: color.ink,
    textShadow: `0 0 24px ${color.neonGlow}`,
  },
  button: {
    ...primitives.neonButton,
    fontSize: '24px',
    minHeight: '56px',
    padding: '16px 48px',
  },
};

import { useGameStore } from '../stores';
import { useAuth } from '../../shared/hooks/useAuth';
import css from './TitleScreen.module.css';

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
    <div className={css.container}>
      {/* Auth area (top-right) */}
      <div className={css.authArea}>
        {loading ? null : user ? (
          <>
            <span className={css.email}>{user.email}</span>
            <button className={css.authBtn} onClick={signOut}>Logout</button>
          </>
        ) : (
          <button className={css.authBtn} onClick={() => signInWithGoogle().catch(() => {})}>Login</button>
        )}
      </div>

      <div className={css.titleFrame}>
        <span className={css.cornerBL} />
        <span className={css.cornerBR} />
        <h1 className={css.title}>not4k</h1>
        <span className={css.subtitle}>rhythm game</span>
      </div>

      <button className={css.startBtn} onClick={handleStart}>
        Press Start
      </button>
    </div>
  );
}

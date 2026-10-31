import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../../shared/hooks/useAuth';
import { useGameStore } from '../../stores/gameStore';
import { signInFromProfile, signOutFromProfile } from './profileAuth';

export function ProfileSection() {
  const { user, loading, signInWithGoogle, signOut } = useAuth();
  const error = useGameStore(state => state.profileAuthError);
  const [pending, setPending] = useState(false);
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  const handleAuth = async () => {
    setPending(true);
    useGameStore.setState({ profileAuthError: null });
    const message = user
      ? await signOutFromProfile(signOut, () => useGameStore.getState().setScreen('title'))
      : await signInFromProfile(signInWithGoogle);
    if (!active.current) return;
    useGameStore.setState({ profileAuthError: message });
    setPending(false);
  };

  return (
    <div className="stg-section">
      <div className="stg-group">
        <h2 className="stg-group-title">Profile</h2>
        <div className="stg-group-body">
          <div className="stg-row stg-profile-row">
            <div className="stg-profile-status">
              {loading ? <span role="status">Checking sign-in…</span> : user ? (
                // RFD 0094의 후속 닉네임 편집기는 이 로그인 상태 표시 자리를 확장한다.
                <>
                  <span>Signed in</span>
                  {user.email && <span className="stg-row-desc">{user.email}</span>}
                </>
              ) : <span>Sign in with your Google account.</span>}
            </div>
            <button className="stg-btn" disabled={loading || pending} aria-busy={pending} onClick={handleAuth}>
              {user ? 'Logout' : 'Login'}
            </button>
          </div>
        </div>
        {error && <p className="stg-profile-error" role="alert">{error}</p>}
      </div>
    </div>
  );
}

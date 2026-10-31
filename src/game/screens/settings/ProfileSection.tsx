import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useStore } from 'zustand';
import { useAuth } from '../../../shared/hooks/useAuth';
import { useGameStore } from '../../stores/gameStore';
import { handleProfileAuth } from './profileAuthAction';
import { guestNickname } from '../../profile/guestNickname';
import { profileNickname } from '../../profile/profileNicknameStore';

function GuestNickname() {
  const nickname = useSyncExternalStore(guestNickname.subscribe, guestNickname.get, guestNickname.get);
  return <span>{nickname}</span>;
}

function NicknameForm({ userId, nickname }: { userId: string; nickname: string }) {
  const [draft, setDraft] = useState(nickname);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const request = useRef<AbortController | null>(null);

  useEffect(() => () => { request.current?.abort(); }, []);

  const handleSave = async () => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setSaving(true);
    setMessage(null);
    const result = await profileNickname.saveNickname(userId, draft, controller.signal);
    if (controller.signal.aborted) return;
    request.current = null;
    setSaving(false);
    if (result.status === 'ignored') return;
    setMessage(result.status === 'saved'
      ? { text: 'Nickname saved.', error: false }
      : { text: result.message, error: true });
  };

  return (
    <form className="stg-profile-form" onSubmit={event => { event.preventDefault(); void handleSave(); }}>
      <div className="stg-row stg-profile-row">
        <div className="stg-profile-status">
          <label className="stg-row-label" htmlFor="profile-nickname">Nickname</label>
          <input
            id="profile-nickname" className="stg-nickname" value={draft} disabled={saving}
            autoComplete="off" autoCapitalize="off" spellCheck={false}
            aria-invalid={message?.error || undefined}
            aria-describedby={message ? 'profile-nickname-message' : undefined}
            onChange={event => { setDraft(event.target.value); setMessage(null); }}
          />
        </div>
        <button className="stg-btn" type="submit" disabled={saving} aria-busy={saving}>Save</button>
      </div>
      {message && (
        <p id="profile-nickname-message" className={message.error ? 'stg-profile-error' : 'stg-profile-message'}
          role={message.error ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}
    </form>
  );
}

function AccountNickname({ userId }: { userId: string }) {
  const account = useStore(profileNickname.store);
  if (account.userId !== userId || account.status === 'loading') {
    return <div className="stg-row"><span role="status">Loading nickname…</span></div>;
  }
  if (account.status === 'error') {
    return (
      <div className="stg-row stg-profile-row">
        <p className="stg-profile-error" role="alert">Couldn't load your nickname.</p>
        <button className="stg-btn" onClick={() => { void profileNickname.retry(); }}>Retry</button>
      </div>
    );
  }
  return account.nickname !== null ? <NicknameForm userId={userId} nickname={account.nickname} /> : null;
}

export function ProfileSection() {
  const { user, loading, signInWithGoogle, signOut } = useAuth();
  const signedInUser = user && !user.is_anonymous ? user : null;
  const error = useGameStore(state => state.profileAuthError);
  const [pending, setPending] = useState(false);
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  const handleAuth = () => handleProfileAuth({
    signedIn: Boolean(signedInUser), signIn: signInWithGoogle, signOut,
    isActive: () => active.current, setPending,
  });

  return (
    <div className="stg-section">
      <div className="stg-group">
        <h2 className="stg-group-title">Profile</h2>
        <div className="stg-group-body">
          <div className="stg-row stg-profile-row">
            <div className="stg-profile-status">
              {loading ? <span role="status">Checking sign-in…</span> : signedInUser ? (
                <>
                  <span>Signed in</span>
                  {signedInUser.email && <span className="stg-row-desc">{signedInUser.email}</span>}
                </>
              ) : (
                <>
                  <GuestNickname />
                  <span className="stg-row-desc">Sign in with your Google account.</span>
                </>
              )}
            </div>
            <button className="stg-btn" disabled={loading || pending} aria-busy={pending} onClick={handleAuth}>
              {signedInUser ? 'Logout' : 'Login'}
            </button>
          </div>
          {!loading && signedInUser && <AccountNickname key={signedInUser.id} userId={signedInUser.id} />}
        </div>
        {error && <p className="stg-profile-error" role="alert">{error}</p>}
      </div>
    </div>
  );
}

import { useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../supabase/client';
import { showToast } from '../../shared/toast';
import { DEV_ADMIN } from '../../shared/hooks/useAuth';
import { useGameStore } from '../stores/gameStore';
import { createAccountSettingsAdapter } from './accountSettingsAdapter';
import {
  ACCOUNT_SETTINGS_LOAD_FAILURE_MESSAGE, createAccountSettingsSync, type UnsyncedAccountSettingsStorage,
} from './accountSettingsSync';

const UNSYNCED_ACCOUNT_SETTINGS_KEY = 'not4k-account-settings-unsynced';

/** `unsyncedAccountSettings`를 localStorage에 둔다. 저장소를 쓸 수 없으면 기록 없음으로 보고 동기화는 계속한다. */
const browserUnsyncedStorage: UnsyncedAccountSettingsStorage = {
  read: () => {
    try { return localStorage.getItem(UNSYNCED_ACCOUNT_SETTINGS_KEY); } catch { return null; }
  },
  write: raw => {
    try {
      if (raw === null) localStorage.removeItem(UNSYNCED_ACCOUNT_SETTINGS_KEY);
      else localStorage.setItem(UNSYNCED_ACCOUNT_SETTINGS_KEY, raw);
    } catch { /* 기록 없이 진행한다. */ }
  },
};

/** 게임 루트에서 한 번 구독하며 화면 전환과 독립적으로 살아 있다. */
export function subscribeAccountSettingsSync(): () => void {
  if (DEV_ADMIN) return () => {};
  const sync = createAccountSettingsSync({
    ...createAccountSettingsAdapter(supabase),
    store: {
      getSettings: () => useGameStore.getState().settings,
      applySettings: settings => {
        useGameStore.setState({ settings });
        const { screen, setScreen } = useGameStore.getState();
        // 계정 설정으로 최초 실행이 끝나면 프리셋을 고른 뒤와 같은 곡 선택으로 간다(PresetSetupScreen).
        if (screen === 'presetSetup' && !settings.isFirstLaunch) setScreen('songSelect');
      },
      subscribe: listener => useGameStore.subscribe(listener),
    },
    notice: message => showToast(message, 'error'),
    unsyncedStorage: browserUnsyncedStorage,
    timers: { setTimeout: (callback, ms) => setTimeout(callback, ms), clearTimeout: id => clearTimeout(id) },
  });
  let active = true;
  let receivedAuthEvent = false;
  let currentUserId: string | null | undefined;
  const handleSession = (session: Session | null, retryLoad: boolean) => {
    if (!active) return;
    const user = session?.user ?? null;
    const userId = user && !user.is_anonymous ? user.id : null;
    if (userId === currentUserId && !retryLoad) return;
    currentUserId = userId;
    void sync.setUser(user).catch(() => {
      if (active && currentUserId === userId) showToast(ACCOUNT_SETTINGS_LOAD_FAILURE_MESSAGE, 'error');
    });
  };
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') sync.flush();
  };
  document.addEventListener('visibilitychange', onVisibilityChange);
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    receivedAuthEvent = true;
    handleSession(session, event === 'SIGNED_IN');
  });
  void supabase.auth.getSession().then(({ data: { session }, error }) => {
    if (!receivedAuthEvent && !error) handleSession(session, false);
  }).catch(() => { /* 세션 확인 실패를 설정 없음으로 해석하지 않는다. */ });

  return () => {
    active = false;
    document.removeEventListener('visibilitychange', onVisibilityChange);
    subscription.unsubscribe();
    sync.dispose();
  };
}

export function useAccountSettingsSync() {
  useEffect(subscribeAccountSettingsSync, []);
}

import { useEffect, useState } from 'react';
import { supabase } from '../../supabase';
import type { User } from '@supabase/supabase-js';
import { getAuthRedirectTo, type AuthRedirectLocation } from './authRedirect';

// 개발 전용: .env.local에 VITE_DEV_ADMIN=true 설정 시 로그인 없이 admin으로 진입 (로컬 OAuth redirect 우회).
// 배포 빌드에서는 import.meta.env.DEV가 false라 DEV_ADMIN 분기가 제거된다.
const DEV_ADMIN = import.meta.env.DEV && import.meta.env.VITE_DEV_ADMIN === 'true';

export function getGoogleRedirectTo(location: AuthRedirectLocation): string {
  return getAuthRedirectTo(location);
}

async function fetchIsAdmin(uid: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', uid)
      .single();
    return data?.is_admin ?? false;
  } catch {
    return false;
  }
}

export function useAuth() {
  // DEV_ADMIN이면 첫 렌더부터 dev admin 상태로 시작하고, effect에서 세션을 구독하지 않는다.
  const [user, setUser] = useState<User | null>(
    DEV_ADMIN ? ({ id: 'dev-user', email: 'dev@local' } as User) : null,
  );
  const [isAdmin, setIsAdmin] = useState(DEV_ADMIN);
  const [loading, setLoading] = useState(!DEV_ADMIN);
  // 세션 주체가 아직 미확정이라는 뜻이다. 조회 실패만으로 게스트로 확정하지 않는다.
  const [sessionLoading, setSessionLoading] = useState(!DEV_ADMIN);

  useEffect(() => {
    if (DEV_ADMIN) return;

    let active = true;
    let sessionEventReceived = false;
    let sessionGeneration = 0;
    let currentUserId: string | null | undefined;

    const handleSession = async (session: { user: User } | null) => {
      if (!active) return;
      const generation = ++sessionGeneration;
      const u = session?.user ?? null;
      setUser(u);
      setSessionLoading(false);
      // 토큰 갱신처럼 같은 계정의 세션 이벤트에서는 admin 표시를 깜빡이지 않는다. 계정이 바뀔 때만 다시 확인 중으로 둔다.
      const userChanged = (u?.id ?? null) !== currentUserId;
      currentUserId = u?.id ?? null;
      if (userChanged) {
        setIsAdmin(false);
        setLoading(!!u);
      }
      const admin = u ? await fetchIsAdmin(u.id) : false;
      if (!active || generation !== sessionGeneration) return;
      setIsAdmin(admin);
      setLoading(false);
    };

    // 1. 리스너 먼저 등록 (이벤트 놓치지 않도록)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        sessionEventReceived = true;
        void handleSession(session);
      },
    );

    // 2. 현재 세션 확인 (리스너 등록 이후)
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) throw error;
      if (!sessionEventReceived) void handleSession(session);
    }).catch(() => {
      if (active && !sessionEventReceived) {
        setLoading(false);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: getGoogleRedirectTo(window.location) },
    });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return { user, isAdmin, loading, sessionLoading, signInWithGoogle, signOut };
}

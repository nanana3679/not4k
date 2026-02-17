import { useEffect, useState } from 'react';
import { supabase } from '../../supabase';
import type { User } from '@supabase/supabase-js';

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
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const handleSession = async (session: { user: User } | null) => {
      if (!active) return;
      const u = session?.user ?? null;
      setUser(u);
      setIsAdmin(u ? await fetchIsAdmin(u.id) : false);
      if (active) setLoading(false);
    };

    // 1. 리스너 먼저 등록 (이벤트 놓치지 않도록)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => { handleSession(session); },
    );

    // 2. 현재 세션 확인 (리스너 등록 이후)
    supabase.auth.getSession().then(({ data: { session } }) => {
      handleSession(session);
    }).catch(() => {
      if (active) setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return { user, isAdmin, loading, signInWithGoogle, signOut };
}

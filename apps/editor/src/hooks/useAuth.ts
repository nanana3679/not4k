import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
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
    // 1. 초기 세션 확인
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) setIsAdmin(await fetchIsAdmin(u.id));
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });

    // 2. 이후 세션 변경 감지 (OAuth 리다이렉트, 로그아웃 등)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const u = session?.user ?? null;
        setUser(u);
        if (u) {
          setIsAdmin(await fetchIsAdmin(u.id));
        } else {
          setIsAdmin(false);
        }
        setLoading(false);
      },
    );

    return () => subscription.unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return { user, isAdmin, loading, signInWithGoogle, signOut };
}

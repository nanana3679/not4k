import type { SupabaseClient } from '@supabase/supabase-js';
import type { AccountSettingsIO, LoadAccountSettingsResult } from './accountSettingsSync';

/** I/O 결과에서 행 없음과 요청 실패를 구분한다. 클라이언트는 앱에서 주입한다. */
export function createAccountSettingsAdapter(client: Pick<SupabaseClient, 'from'>): AccountSettingsIO {
  return {
    async load(userId, signal): Promise<LoadAccountSettingsResult> {
      try {
        const { data, error } = await client.from('user_settings')
          .select('settings').eq('user_id', userId).abortSignal(signal).maybeSingle();
        if (error) return { status: 'failed' };
        return data === null ? { status: 'notFound' } : { status: 'found', settings: data.settings };
      } catch {
        return { status: 'failed' };
      }
    },
    async save(userId, settings, signal) {
      try {
        const { error } = await client.from('user_settings')
          .upsert({ user_id: userId, settings }, { onConflict: 'user_id' }).abortSignal(signal);
        return !error;
      } catch {
        return false;
      }
    },
  };
}

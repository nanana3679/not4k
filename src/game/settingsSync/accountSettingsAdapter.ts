import type { SupabaseClient } from '@supabase/supabase-js';
import type { AccountSettingsIO, LoadAccountSettingsResult } from './accountSettingsSync';

/** I/O 결과에서 행 없음과 요청 실패를 구분한다. 클라이언트는 앱에서 주입한다. */
export function createAccountSettingsAdapter(
  client: Pick<SupabaseClient, 'from'>,
  now: () => Date = () => new Date(),
): AccountSettingsIO {
  return {
    async load(userId, signal): Promise<LoadAccountSettingsResult> {
      try {
        const { data, error, status } = await client.from('user_settings')
          .select('settings').eq('user_id', userId).abortSignal(signal).maybeSingle();
        if (error || status !== 200) return { status: 'failed' };
        if (data === null) return { status: 'notFound' };
        const settings: unknown = data.settings;
        if (settings === null || typeof settings !== 'object' || Array.isArray(settings)) {
          return { status: 'failed' };
        }
        return { status: 'found', settings: settings as Record<string, unknown> };
      } catch {
        return { status: 'failed' };
      }
    },
    async insertIfAbsent(userId, settings, signal) {
      try {
        const { data, error, status } = await client.from('user_settings')
          .upsert({ user_id: userId, settings, updated_at: now().toISOString() }, { onConflict: 'user_id', ignoreDuplicates: true })
          .select('user_id').abortSignal(signal);
        if (error || (status !== 200 && status !== 201) || !Array.isArray(data)) return 'failed';
        if (data.length === 0) return 'conflict';
        return data.length === 1 && data[0]?.user_id === userId ? 'inserted' : 'failed';
      } catch {
        return 'failed';
      }
    },
    async save(userId, settings, signal) {
      try {
        const { error } = await client.from('user_settings')
          .upsert({ user_id: userId, settings, updated_at: now().toISOString() }, { onConflict: 'user_id' }).abortSignal(signal);
        return !error;
      } catch {
        return false;
      }
    },
  };
}

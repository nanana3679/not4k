import { supabase } from '../../supabase/client';
import { guestNickname } from './guestNickname';
import { createAccountNicknameService } from './accountNickname';

// 응답 없이 멈춘 요청도 이 시간이 지나면 끊어 불러오기 오류(Retry)나 저장 오류로 끝낸다.
const NICKNAME_REQUEST_TIMEOUT_MS = 15_000;

export const accountNicknameService = createAccountNicknameService({
  guest: guestNickname,
  async link(nickname) {
    const { data, error } = await supabase.rpc('link_guest_nickname', { guest_nickname: nickname })
      .abortSignal(AbortSignal.timeout(NICKNAME_REQUEST_TIMEOUT_MS));
    if (error) throw error;
    const row = Array.isArray(data) && data.length === 1 ? data[0] : null;
    if (!row || typeof row.nickname !== 'string' || typeof row.first_link !== 'boolean'
      || (row.first_link_guest_nickname !== null && typeof row.first_link_guest_nickname !== 'string')) {
      throw new Error('Invalid nickname link response');
    }
    return {
      nickname: row.nickname,
      first_link: row.first_link,
      first_link_guest_nickname: row.first_link_guest_nickname,
    };
  },
  async save(userId, draft) {
    const { data, error } = await supabase.from('profiles')
      .update({ display_name: draft }).eq('id', userId).select('display_name')
      .abortSignal(AbortSignal.timeout(NICKNAME_REQUEST_TIMEOUT_MS)).single();
    if (error) throw error;
    if (!data || typeof data.display_name !== 'string') throw new Error('Invalid nickname save response');
    return data.display_name;
  },
});

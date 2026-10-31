import { supabase } from '../../supabase/client';
import { guestNickname } from './guestNickname';
import { createProfileNickname } from './profileNickname';

export const profileNickname = createProfileNickname({
  guest: guestNickname,
  async link(nickname) {
    const { data, error } = await supabase.rpc('link_guest_nickname', { guest_nickname: nickname });
    if (error) throw error;
    const row = Array.isArray(data) && data.length === 1 ? data[0] : null;
    if (!row || typeof row.nickname !== 'string' || typeof row.first_link !== 'boolean') {
      throw new Error('Invalid nickname link response');
    }
    return { nickname: row.nickname, first_link: row.first_link };
  },
  async save(userId, draft) {
    const { data, error } = await supabase.from('profiles')
      .update({ display_name: draft }).eq('id', userId).select('display_name').single();
    if (error) throw error;
    if (!data || typeof data.display_name !== 'string') throw new Error('Invalid nickname save response');
    return data.display_name;
  },
});

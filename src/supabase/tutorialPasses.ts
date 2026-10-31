import { supabase } from './client';

export async function fetchTutorialPasses(userId: string): Promise<string[]> {
  const { data, error } = await supabase.from('tutorial_passes').select('tutorial_id').eq('user_id', userId);
  if (error) throw error;
  return (data ?? []).map(row => row.tutorial_id as string);
}

export async function addTutorialPass(userId: string, tutorialId: string): Promise<void> {
  const { error } = await supabase.from('tutorial_passes').upsert(
    { user_id: userId, tutorial_id: tutorialId },
    { onConflict: 'user_id,tutorial_id', ignoreDuplicates: true },
  );
  if (error) throw error;
}

/** true이면 이 영수증의 인계를 확정했다(응답 유실 뒤 동일 요청 재확인 포함). */
export async function handoffTutorialPasses(
  userId: string, requestId: string, tutorialIds: readonly string[],
): Promise<boolean> {
  if (!tutorialIds.length) return false;
  const { data, error } = await supabase.rpc('handoff_tutorial_passes', {
    target_user_id: userId, request_id: requestId, tutorial_ids: [...tutorialIds],
  });
  if (error) throw error;
  if (typeof data !== 'boolean') throw new Error('Invalid tutorial handoff response');
  return data;
}

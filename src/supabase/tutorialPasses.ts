import { supabase } from './client';

/** 완료 순간 시작한 세션 조회. 이후 렌더의 계정으로 미확정 통과를 재분류하지 않는다. */
export async function readTutorialPassOwner(): Promise<string | null> {
  let identityChanged = false;
  const { data: { subscription } } = supabase.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') identityChanged = true;
  });
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    // getSession도 내부 잠금을 기다릴 수 있다. 그 사이 바뀐 주체에 소급 귀속하지 않는다.
    if (identityChanged) throw new Error('Tutorial completion owner is unresolved');
    const user = data.session?.user;
    return user && !user.is_anonymous && user.id !== 'dev-user' ? user.id : null;
  } finally {
    subscription.unsubscribe();
  }
}

function validateTutorialId(id: string) {
  if (id.length < 1 || id.length > 64 || /[^a-z0-9-]/.test(id)) {
    throw new Error('Tutorial ID must contain 1–64 lowercase letters, digits or hyphens');
  }
}

export async function fetchTutorialPasses(userId: string): Promise<string[]> {
  const { data, error } = await supabase.from('tutorial_passes').select('tutorial_id').eq('user_id', userId);
  if (error) throw error;
  return (data ?? []).map(row => row.tutorial_id as string);
}

export async function addTutorialPass(userId: string, tutorialId: string): Promise<void> {
  validateTutorialId(tutorialId);
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
  if (tutorialIds.length > 100) throw new Error('Tutorial handoff accepts at most 100 IDs');
  tutorialIds.forEach(validateTutorialId);
  if (!tutorialIds.length) return false;
  const { data, error } = await supabase.rpc('handoff_tutorial_passes', {
    target_user_id: userId, request_id: requestId, tutorial_ids: [...tutorialIds],
  });
  if (error) throw error;
  if (typeof data !== 'boolean') throw new Error('Invalid tutorial handoff response');
  return data;
}

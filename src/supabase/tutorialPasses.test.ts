import { beforeEach, expect, it, vi } from 'vitest';
import { addTutorialPass, fetchTutorialPasses, handoffTutorialPasses, readTutorialPassOwner } from './tutorialPasses';
import { ALL_TUTORIAL_PREVIEWS } from '../game/screens/songSelect/tutorialCatalog';

const client = vi.hoisted(() => ({
  from: vi.fn(), select: vi.fn(), eq: vi.fn(), upsert: vi.fn(), rpc: vi.fn(),
  auth: { getSession: vi.fn(), onAuthStateChange: vi.fn() },
}));
vi.mock('./client', () => ({ supabase: client }));

beforeEach(() => {
  vi.resetAllMocks();
  client.from.mockReturnValue(client);
  client.select.mockReturnValue(client);
  client.eq.mockResolvedValue({ data: [], error: null });
  client.upsert.mockResolvedValue({ error: null });
  client.rpc.mockResolvedValue({ data: true, error: null });
});

it('완료 시 세션 조회가 대기하는 동안 B 로그인 이벤트가 오면 늦은 B 응답을 원래 소유자로 쓰지 않는다', async () => {
  let changeSession!: (event: string) => void;
  const unsubscribe = vi.fn();
  client.auth.onAuthStateChange.mockImplementation(callback => {
    changeSession = callback;
    return { data: { subscription: { unsubscribe } } };
  });
  let finishSession!: () => void;
  client.auth.getSession.mockReturnValue(new Promise(resolve => {
    finishSession = () => resolve({ data: { session: { user: { id: 'B' } } }, error: null });
  }));
  const owner = readTutorialPassOwner();
  changeSession?.('SIGNED_IN');
  finishSession();
  await expect(owner).rejects.toThrow();
  expect(unsubscribe).toHaveBeenCalled();
});

it.each(['', 'A', 'single_note', 'single-note\n', 'a'.repeat(65)])('잘못된 ID %j의 통과 저장·게스트 인계는 Supabase 호출 전에 거부한다', async id => {
  await expect(addTutorialPass('A', id)).rejects.toThrow();
  await expect(handoffTutorialPasses('A', 'receipt-1', ['single-note', id])).rejects.toThrow();
  expect(client.from).not.toHaveBeenCalled();
  expect(client.rpc).not.toHaveBeenCalled();
});

it('101개 ID의 인계는 RPC 전에 거부하고 100개·길이 1과 64인 ID·현재 카탈로그 전체는 허용한다', async () => {
  await expect(handoffTutorialPasses('A', 'receipt-1', Array(101).fill('single-note'))).rejects.toThrow();
  expect(client.rpc).not.toHaveBeenCalled();
  await expect(handoffTutorialPasses('A', 'receipt-2', Array(100).fill('single-note'))).resolves.toBe(true);
  await expect(addTutorialPass('A', 'a')).resolves.toBeUndefined();
  await expect(addTutorialPass('A', 'a'.repeat(64))).resolves.toBeUndefined();
  await expect(handoffTutorialPasses('A', 'receipt-3', ALL_TUTORIAL_PREVIEWS.map(preview => preview.id))).resolves.toBe(true);
});

it('인계 RPC가 boolean 대신 null을 반환하면 거절로 확정하지 않고 오류로 남겨 재인계를 막는다', async () => {
  client.rpc.mockResolvedValue({ data: null, error: null });
  await expect(handoffTutorialPasses('A', 'receipt-1', ['single-note'])).rejects.toThrow();
});

it('다른 기기가 이미 인계한 계정에 요청하면 false를 반환하고 게스트 삭제를 승인하지 않는다', async () => {
  client.rpc.mockResolvedValue({ data: false, error: null });
  expect(await handoffTutorialPasses('A', 'receipt-2', ['double-note'])).toBe(false);
});

it.each(['fetch', 'add', 'handoff'] as const)('Supabase %s가 실패하면 빈 성공 결과 대신 오류를 호출자에게 전달한다', async operation => {
  const error = { message: 'unavailable' };
  client.eq.mockResolvedValue({ data: null, error });
  client.upsert.mockResolvedValue({ error });
  client.rpc.mockResolvedValue({ data: null, error });
  const result = operation === 'fetch' ? fetchTutorialPasses('A')
    : operation === 'add' ? addTutorialPass('A', 'single-note')
      : handoffTutorialPasses('A', 'receipt-1', ['single-note']);
  await expect(result).rejects.toEqual(error);
});

it('게스트 기록 0개로 인계를 요청하면 RPC를 호출하지 않고 false를 반환한다', async () => {
  expect(await handoffTutorialPasses('A', 'receipt-empty', [])).toBe(false);
  expect(client.rpc).not.toHaveBeenCalled();
});

it('A의 single-note 인계가 성공하면 계정·영수증·ID만 RPC로 보내고 true를 반환한다', async () => {
  expect(await handoffTutorialPasses('A', 'receipt-1', ['single-note'])).toBe(true);
  expect(client.rpc).toHaveBeenCalledWith('handoff_tutorial_passes', {
    target_user_id: 'A', request_id: 'receipt-1', tutorial_ids: ['single-note'],
  });
});

it('A가 single-note를 다시 통과하면 중복을 무시해 첫 passed_at을 덮어쓰거나 UPDATE 권한을 요구하지 않는다', async () => {
  await addTutorialPass('A', 'single-note');
  expect(client.from).toHaveBeenCalledWith('tutorial_passes');
  expect(client.upsert).toHaveBeenCalledWith(
    { user_id: 'A', tutorial_id: 'single-note' },
    { onConflict: 'user_id,tutorial_id', ignoreDuplicates: true },
  );
});

it('A의 통과 기록을 조회하면 user_id=A로 제한하고 single-note·future-lesson ID를 반환한다', async () => {
  client.eq.mockResolvedValue({ data: [{ tutorial_id: 'single-note' }, { tutorial_id: 'future-lesson' }], error: null });
  expect(await fetchTutorialPasses('A')).toEqual(['single-note', 'future-lesson']);
  expect(client.from).toHaveBeenCalledWith('tutorial_passes');
  expect(client.eq).toHaveBeenCalledWith('user_id', 'A');
});

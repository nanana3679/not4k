import { beforeEach, expect, it, vi } from 'vitest';
import { addTutorialPass, fetchTutorialPasses, handoffTutorialPasses } from './tutorialPasses';

const client = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), eq: vi.fn(), upsert: vi.fn(), rpc: vi.fn() }));
vi.mock('./client', () => ({ supabase: client }));

beforeEach(() => {
  vi.resetAllMocks();
  client.from.mockReturnValue(client);
  client.select.mockReturnValue(client);
  client.eq.mockResolvedValue({ data: [], error: null });
  client.upsert.mockResolvedValue({ error: null });
  client.rpc.mockResolvedValue({ data: true, error: null });
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

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createTutorialPassSync } from './tutorialPassSync';

const client = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), eq: vi.fn(), upsert: vi.fn(), rpc: vi.fn() }));
vi.mock('../../../supabase/client', () => ({ supabase: client }));

function makeStorage(guestIds: string[] = []) {
  const valueByKey = new Map([['not4k-tutorial-passed-ids', JSON.stringify(guestIds)]]);
  return {
    getItem: (key: string) => valueByKey.get(key) ?? null,
    setItem: (key: string, value: string) => { valueByKey.set(key, value); },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  let queued: Promise<unknown> = Promise.resolve();
  vi.stubGlobal('navigator', { locks: { request: (_name: string, run: () => unknown) => {
    const request = queued.then(run);
    queued = request.catch(() => {});
    return request;
  } } });
  client.from.mockReturnValue(client);
  client.select.mockReturnValue(client);
  client.eq.mockResolvedValue({ data: [], error: null });
  client.upsert.mockResolvedValue({ error: null });
  client.rpc.mockResolvedValue({ data: true, error: null });
});

it('오프라인에 A가 통과한 single-note는 다음 조회 성공 때 서버에 없으면 재전송하고 게스트 기록은 보내지 않는다', async () => {
  const storage = makeStorage(['guest-only']);
  const sync = createTutorialPassSync(storage);
  client.upsert.mockRejectedValueOnce(new Error('offline'));
  await sync.recordPass('A', 'single-note');
  client.upsert.mockClear();
  client.rpc.mockResolvedValue({ data: false, error: null });
  await createTutorialPassSync(storage).syncAccount('A');
  expect(client.upsert).toHaveBeenCalledTimes(1);
  expect(client.upsert).toHaveBeenCalledWith(
    { user_id: 'A', tutorial_id: 'single-note' }, expect.any(Object),
  );
});

it('통과를 구독한 화면은 게스트 single-note 저장·다른 탭의 double-note 저장·게스트 초기화를 반영하고 A 캐시는 유지한다', async () => {
  const storage = makeStorage();
  const sync = createTutorialPassSync(storage);
  await sync.recordPass('A', 'account-only');
  const listener = vi.fn();
  const unsubscribe = sync.subscribe(listener);
  await sync.recordPass(null, 'single-note');
  expect(listener).toHaveBeenCalled();
  await createTutorialPassSync(storage).recordPass(null, 'double-note');
  sync.refresh();
  expect(sync.getPassedIds(null)).toEqual(['single-note', 'double-note']);
  await sync.resetGuest();
  expect(sync.getPassedIds(null)).toEqual([]);
  expect(sync.getPassedIds('A')).toEqual(['account-only']);
  expect(createTutorialPassSync(storage).getPassedIds(null)).toEqual([]);
  unsubscribe();
  listener.mockClear();
  await sync.recordPass(null, 'trill-note');
  expect(listener).not.toHaveBeenCalled();
});

it.each([null, 'A'])('%s의 오래된 두 탭이 single-note·double-note·trill-note를 차례로 저장하면 세 기록과 다른 주체의 캐시를 모두 보존한다', async userId => {
  const storage = makeStorage(['guest-only']);
  await createTutorialPassSync(storage).recordPass('B', 'account-only');
  const firstTab = createTutorialPassSync(storage);
  const secondTab = createTutorialPassSync(storage);

  await firstTab.recordPass(userId, 'single-note');
  await secondTab.recordPass(userId, 'double-note');
  await firstTab.recordPass(userId, 'trill-note');

  const reopened = createTutorialPassSync(storage);
  expect(reopened.getPassedIds(userId)).toEqual([
    ...(userId === null ? ['guest-only'] : []), 'single-note', 'double-note', 'trill-note',
  ]);
  expect(reopened.getPassedIds('B')).toEqual(['account-only']);
  expect(reopened.getPassedIds(userId === null ? 'A' : null)).toEqual(userId === null ? [] : ['guest-only']);
  secondTab.refresh();
  expect(secondTab.getSnapshot()).toEqual(reopened.getSnapshot());
});

it('A의 조회 응답 전에 다른 탭이 A·B·게스트 통과를 저장하면 늦은 서버 single-note와 세 주체의 최신 기록을 합친다', async () => {
  let resolveFetch!: (value: { data: { tutorial_id: string }[]; error: null }) => void;
  client.eq.mockReturnValueOnce(new Promise(resolve => { resolveFetch = resolve; }));
  const storage = makeStorage();
  const firstTab = createTutorialPassSync(storage);
  const secondTab = createTutorialPassSync(storage);
  const loading = firstTab.syncAccount('A');
  await vi.waitFor(() => expect(client.eq).toHaveBeenCalled());

  await secondTab.recordPass('A', 'double-note');
  await secondTab.recordPass('B', 'trill-note');
  await secondTab.recordPass(null, 'long-note');
  resolveFetch({ data: [{ tutorial_id: 'single-note' }], error: null });
  await loading;

  const reopened = createTutorialPassSync(storage);
  expect(reopened.getPassedIds('A')).toEqual(['double-note', 'single-note']);
  expect(reopened.getPassedIds('B')).toEqual(['trill-note']);
  expect(reopened.getPassedIds(null)).toEqual(['long-note']);
  expect(client.upsert).toHaveBeenLastCalledWith(
    { user_id: 'A', tutorial_id: 'double-note' }, expect.any(Object),
  );
  expect(client.rpc).not.toHaveBeenCalled();
});

afterEach(() => { vi.unstubAllGlobals(); });

it.each(['', 'Legacy_ID', 'single-note\n', 'a'.repeat(65)])('게스트 single-note·잘못된 ID %j·double-note 중 유효한 두 ID만 인계하고 잘못된 ID는 예약 없이 보존한다', async invalidId => {
  const storage = makeStorage(['single-note', invalidId, 'double-note']);
  const sync = createTutorialPassSync(storage);

  await sync.syncAccount('A');

  expect(client.rpc).toHaveBeenCalledExactlyOnceWith('handoff_tutorial_passes', {
    target_user_id: 'A', request_id: expect.any(String), tutorial_ids: ['single-note', 'double-note'],
  });
  const reopened = createTutorialPassSync(storage);
  expect(reopened.getPassedIds('A')).toEqual(['single-note', 'double-note']);
  expect(reopened.getPassedIds(null)).toEqual([invalidId]);
  expect(reopened.getSnapshot().pendingHandoffs).toEqual([]);
  await reopened.syncAccount('B');
  expect(client.rpc).toHaveBeenCalledTimes(1);
  expect(reopened.getPassedIds(null)).toEqual([invalidId]);
  expect(reopened.getSnapshot().pendingHandoffs).toEqual([]);
});

it('유효한 게스트 ID 101개와 Legacy_ID가 있으면 100개만 A에 인계하고 나머지 두 ID는 게스트에 남긴다', async () => {
  const validIds = Array.from({ length: 101 }, (_, index) => `lesson-${index}`);
  const sync = createTutorialPassSync(makeStorage(['Legacy_ID', ...validIds]));

  await sync.syncAccount('A');

  expect(client.rpc).toHaveBeenCalledExactlyOnceWith('handoff_tutorial_passes', {
    target_user_id: 'A', request_id: expect.any(String), tutorial_ids: validIds.slice(0, 100),
  });
  expect(sync.getPassedIds('A')).toHaveLength(100);
  expect(sync.getPassedIds(null)).toEqual(['Legacy_ID', 'lesson-100']);
  expect(sync.getSnapshot().pendingHandoffs).toEqual([]);
});

it.each([
  { error: { code: '23514', message: 'limit' } },
  { error: { code: '42501', message: 'forbidden' } },
  { error: { code: 'PGRST301', message: 'expired token' } },
  { error: { status: 403, message: 'forbidden' } },
  { error: { code: '', message: 'unavailable' }, status: 503 },
])('인계 서버 오류 $error 응답이면 single-note를 게스트로 복원하고 A는 새 영수증으로 인계할 수 있다', async response => {
  const storage = makeStorage(['single-note']);
  client.rpc.mockResolvedValueOnce({ data: null, ...response });
  await createTutorialPassSync(storage).syncAccount('A');
  const failedReceipt = client.rpc.mock.calls[0][1].request_id;

  const reopened = createTutorialPassSync(storage);
  expect(reopened.getPassedIds(null)).toEqual(['single-note']);
  expect(reopened.getPassedIds('A')).toEqual([]);
  expect(reopened.getSnapshot().pendingHandoffs).toEqual([]);
  expect(client.upsert).not.toHaveBeenCalled();

  await reopened.syncAccount('A');
  expect(client.rpc).toHaveBeenCalledTimes(2);
  expect(client.rpc.mock.calls[1][1]).toEqual({
    target_user_id: 'A', request_id: expect.any(String), tutorial_ids: ['single-note'],
  });
  expect(client.rpc.mock.calls[1][1].request_id).not.toBe(failedReceipt);
  expect(reopened.getPassedIds('A')).toEqual(['single-note']);
  expect(reopened.getPassedIds(null)).toEqual([]);
});

it('세션 조회가 실패한 single-note는 재개방·B 로그인 뒤에도 미확정으로 남고 B나 게스트에 섞이지 않는다', async () => {
  const storage = makeStorage();
  const sync = createTutorialPassSync(storage);
  await sync.recordPass(Promise.reject(new Error('identity unavailable')), 'single-note');
  const reopened = createTutorialPassSync(storage);
  await reopened.syncAccount('B');
  expect(reopened.getSnapshot().unresolvedPasses).toEqual([
    { completionId: expect.any(String), tutorialId: 'single-note' },
  ]);
  expect(reopened.getPassedIds('B')).toEqual([]);
  expect(reopened.getPassedIds(null)).toEqual([]);
  expect(client.upsert).not.toHaveBeenCalled();
  expect(client.rpc).not.toHaveBeenCalled();
});

it('구형 A 단일 예약을 읽으면 새 게스트 double-note만 B로 넘기고 A의 원래 영수증은 유지한다', async () => {
  const storage = makeStorage();
  storage.setItem('not4k-tutorial-pass-state', JSON.stringify({
    guestIds: ['double-note'], accountPassedIdsByUser: {},
    pendingHandoff: { userId: 'A', requestId: 'old-receipt', tutorialIds: ['single-note'] },
  }));
  const sync = createTutorialPassSync(storage);
  await sync.syncAccount('B');
  await sync.syncAccount('A');
  expect(client.rpc.mock.calls.map(call => call[1])).toEqual([
    { target_user_id: 'B', request_id: expect.any(String), tutorial_ids: ['double-note'] },
    { target_user_id: 'A', request_id: 'old-receipt', tutorial_ids: ['single-note'] },
  ]);
});

it('A 조회 도중 로그아웃 후 다시 A로 돌아와도 이전 세대의 응답은 누락 통과를 재전송하지 않는다', async () => {
  const sync = createTutorialPassSync(makeStorage());
  await sync.recordPass('A', 'single-note');
  client.upsert.mockClear();
  let finish!: () => void;
  client.eq.mockReturnValueOnce(new Promise(resolve => {
    finish = () => resolve({ data: [], error: null });
  }));
  const pending = sync.syncAccount('A');
  await vi.waitFor(() => expect(client.eq).toHaveBeenCalled());
  sync.setSessionUser(null);
  sync.setSessionUser('A');
  finish();
  await pending;
  expect(client.upsert).not.toHaveBeenCalled();
  await sync.syncAccount('A');
  expect(client.upsert).toHaveBeenCalledExactlyOnceWith(
    { user_id: 'A', tutorial_id: 'single-note' }, expect.any(Object),
  );
});

it.each(['handoff', 'fetch'] as const)('A의 %s 응답 전에 로그아웃하면 이후 조회·누락 통과 재전송을 시작하지 않는다', async pendingRequest => {
  const sync = createTutorialPassSync(makeStorage(pendingRequest === 'handoff' ? ['single-note'] : []));
  await sync.recordPass('A', 'double-note');
  client.upsert.mockClear();
  let finish!: () => void;
  const requestMock = pendingRequest === 'handoff' ? client.rpc : client.eq;
  requestMock.mockReturnValueOnce(new Promise(resolve => {
    finish = () => resolve({ data: pendingRequest === 'handoff' ? true : [], error: null });
  }));
  const pending = sync.syncAccount('A');
  await vi.waitFor(() => expect(requestMock).toHaveBeenCalled());
  sync.setSessionUser(null);
  finish();
  await pending;
  expect(client.eq).toHaveBeenCalledTimes(pendingRequest === 'handoff' ? 0 : 1);
  expect(client.upsert).not.toHaveBeenCalled();
});

it('A의 single-note 인계 응답 유실 뒤 새 게스트 double-note는 B에 인계하고 A는 원래 영수증만 재시도한다', async () => {
  client.rpc.mockRejectedValueOnce(new Error('response lost'));
  const storage = makeStorage(['single-note']);
  await createTutorialPassSync(storage).syncAccount('A');
  const receiptA = client.rpc.mock.calls[0][1].request_id;
  const reopened = createTutorialPassSync(storage);
  await reopened.recordPass(null, 'double-note');
  await reopened.syncAccount('B');
  expect(client.rpc).toHaveBeenCalledTimes(2);
  expect(client.rpc.mock.calls[1][1]).toMatchObject({ target_user_id: 'B', tutorial_ids: ['double-note'] });
  expect(reopened.getPassedIds('B')).toEqual(['double-note']);
  await reopened.syncAccount('A');
  expect(client.rpc.mock.calls[2][1]).toEqual({
    target_user_id: 'A', request_id: receiptA, tutorial_ids: ['single-note'],
  });
  expect(reopened.getPassedIds('A')).toEqual(['single-note']);
  expect(reopened.getPassedIds(null)).toEqual([]);
});

it('저장 실패한 탭이 오래된 게스트 single-note를 기억해도 다른 탭의 A 인계 뒤 B에게 다시 보내지 않는다', async () => {
  const storage = makeStorage(['single-note']);
  let blocked = true;
  const staleTab = createTutorialPassSync({
    getItem: storage.getItem,
    setItem: (key, value) => { if (blocked) throw new Error('quota'); storage.setItem(key, value); },
  });
  await staleTab.recordPass(null, 'double-note');
  await createTutorialPassSync(storage).syncAccount('A');
  blocked = false;
  await staleTab.syncAccount('B');
  expect(client.rpc).toHaveBeenCalledTimes(1);
  expect(createTutorialPassSync(storage).getPassedIds('A')).toEqual(['single-note']);
  expect(createTutorialPassSync(storage).getPassedIds(null)).toEqual([]);
});

it('같은 브라우저 두 탭에서 A·B가 동시에 로그인하면 single-note 인계를 먼저 예약한 A에게만 보낸다', async () => {
  const storage = makeStorage(['single-note']);
  const tabA = createTutorialPassSync(storage);
  const tabB = createTutorialPassSync(storage);
  await Promise.all([tabA.syncAccount('A'), tabB.syncAccount('B')]);
  tabA.refresh();
  tabB.refresh();
  expect(client.rpc).toHaveBeenCalledTimes(1);
  expect(client.rpc.mock.calls[0][1].target_user_id).toBe('A');
  expect(tabA.getPassedIds('A')).toEqual(['single-note']);
  expect(tabB.getPassedIds('B')).toEqual([]);
  expect(tabB.getPassedIds(null)).toEqual([]);
});

it('브라우저 잠금을 사용할 수 없으면 게스트 single-note 인계를 보류하고 A의 계정 기록은 조회한다', async () => {
  vi.stubGlobal('navigator', {});
  const sync = createTutorialPassSync(makeStorage(['single-note']));
  await sync.syncAccount('A');
  expect(client.rpc).not.toHaveBeenCalled();
  expect(sync.getPassedIds(null)).toEqual(['single-note']);
  expect(client.eq).toHaveBeenCalledWith('user_id', 'A');
});

it('A의 조회가 늦게 끝나도 도중에 통과한 double-note를 보존하고 B·게스트 화면에는 A 기록을 넣지 않는다', async () => {
  let resolveFetch!: (value: { data: { tutorial_id: string }[]; error: null }) => void;
  client.eq.mockReturnValueOnce(new Promise(resolve => { resolveFetch = resolve; }));
  const sync = createTutorialPassSync(makeStorage(['guest-only']));
  client.rpc.mockResolvedValue({ data: false, error: null });
  const loading = sync.syncAccount('A');
  await vi.waitFor(() => expect(client.eq).toHaveBeenCalled());
  await sync.recordPass('A', 'double-note');
  await sync.syncAccount('B');
  resolveFetch({ data: [{ tutorial_id: 'single-note' }], error: null });
  await loading;
  expect(sync.getPassedIds('A')).toEqual(['double-note', 'single-note']);
  expect(sync.getPassedIds('B')).toEqual([]);
  expect(sync.getPassedIds(null)).toEqual(['guest-only']);
});

it('인계 기회를 쓴 A가 다시 로그인하면 새 게스트 single-note는 A에게 숨기고 로그아웃할 때만 표시한다', async () => {
  client.rpc.mockResolvedValue({ data: false, error: null });
  const sync = createTutorialPassSync(makeStorage(['single-note']));
  await sync.syncAccount('A');
  expect(sync.getPassedIds('A')).toEqual([]);
  expect(sync.getPassedIds(null)).toEqual(['single-note']);
});

it('게스트 기록이 없는 A로 로그인하면 RPC 없이 계정 기록만 가져온다', async () => {
  client.eq.mockResolvedValue({ data: [{ tutorial_id: 'single-note' }], error: null });
  const sync = createTutorialPassSync(makeStorage());
  await sync.syncAccount('A');
  expect(client.rpc).not.toHaveBeenCalled();
  expect(sync.getPassedIds('A')).toEqual(['single-note']);
});

it('A의 계정 조회가 실패하면 저장된 single-note 캐시를 유지하고 B로 로그인하면 빈 기록을 표시한다', async () => {
  const sync = createTutorialPassSync(makeStorage());
  await sync.recordPass('A', 'single-note');
  client.eq.mockRejectedValue(new Error('unavailable'));
  await sync.syncAccount('A');
  await sync.syncAccount('B');
  expect(sync.getPassedIds('A')).toEqual(['single-note']);
  expect(sync.getPassedIds('B')).toEqual([]);
  expect(sync.getPassedIds(null)).toEqual([]);
});

it('이전 캐시가 있고 저장소 쓰기가 차단되어도 새 single-note·double-note 통과가 현재 화면에 모두 남는다', async () => {
  const storage = makeStorage();
  const sync = createTutorialPassSync(storage);
  await sync.recordPass('A', 'future-lesson');
  storage.setItem = () => { throw new Error('blocked'); };
  await sync.recordPass('A', 'single-note');
  await sync.recordPass('A', 'double-note');
  expect(sync.getPassedIds('A')).toEqual(['future-lesson', 'single-note', 'double-note']);
});

it('A의 로그인과 모달 열기가 겹쳐도 진행 중인 single-note 인계 RPC는 한 번만 실행한다', async () => {
  let resolveHandoff!: (value: { data: boolean; error: null }) => void;
  client.rpc.mockReturnValue(new Promise(resolve => { resolveHandoff = resolve; }));
  const sync = createTutorialPassSync(makeStorage(['single-note']));
  const first = sync.syncAccount('A');
  const second = sync.syncAccount('A');
  await vi.waitFor(() => expect(client.rpc).toHaveBeenCalled());
  expect(client.rpc).toHaveBeenCalledTimes(1);
  resolveHandoff({ data: true, error: null });
  await Promise.all([first, second]);
});

it.each(['{broken', 'null', '{}', '{"guestIds":42,"accountPassedIdsByUser":null}'])(
  '새 저장값이 %s로 손상되면 구형 게스트를 다시 인계하지 않고 빈 기록으로 복구한다', async value => {
    const storage = makeStorage(['already-handed-off']);
    storage.setItem('not4k-tutorial-pass-state', value);
    const sync = createTutorialPassSync(storage);
    expect(sync.getPassedIds(null)).toEqual([]);
    await sync.syncAccount('B');
    expect(client.rpc).not.toHaveBeenCalled();
  },
);

it('인계 영수증의 localStorage 저장이 거부되면 single-note를 게스트에 남기고 서버 인계를 시작하지 않는다', async () => {
  const storage = makeStorage(['single-note']);
  const sync = createTutorialPassSync({ ...storage, setItem: () => { throw new Error('quota'); } });
  await sync.syncAccount('A');
  expect(client.rpc).not.toHaveBeenCalled();
  expect(sync.getPassedIds(null)).toEqual(['single-note']);
  expect(sync.getPassedIds('A')).toEqual([]);
});

it.each([
  { label: 'fetch 예외', thrown: new TypeError('Failed to fetch') },
  { label: 'timeout', thrown: new DOMException('timeout', 'AbortError') },
  { label: 'ECONNRESET', thrown: { code: 'ECONNRESET', message: 'connection reset' } },
  { label: '알 수 없는 예외', thrown: new Error('response lost') },
  { label: '빈 code·status 0', response: { data: null, error: { code: '', message: 'Failed to fetch' }, status: 0 } },
  { label: 'code·status 없는 오류', response: { data: null, error: { message: 'unknown' } } },
  { label: '결과 불명 응답', response: { data: null, error: null, status: 200 } },
])('A의 인계가 $label 때문에 미확정이면 B에게 재인계하지 않고 A로 재접속하면 같은 영수증으로 확인한다', async failure => {
  if ('thrown' in failure) client.rpc.mockRejectedValueOnce(failure.thrown);
  else client.rpc.mockResolvedValueOnce(failure.response);
  const storage = makeStorage(['single-note']);
  const sync = createTutorialPassSync(storage);
  await expect(sync.syncAccount('A')).resolves.toBeUndefined();
  const receipt = client.rpc.mock.calls[0][1].request_id;
  const reopened = createTutorialPassSync(storage);
  expect(reopened.getSnapshot().pendingHandoffs).toEqual([
    { userId: 'A', requestId: receipt, tutorialIds: ['single-note'] },
  ]);
  await reopened.syncAccount('B');
  expect(client.rpc).toHaveBeenCalledTimes(1);
  expect(reopened.getPassedIds('B')).toEqual([]);
  expect(reopened.getPassedIds(null)).toEqual([]);
  await reopened.syncAccount('A');
  expect(client.rpc.mock.calls[1][1].request_id).toBe(receipt);
  expect(reopened.getPassedIds('A')).toEqual(['single-note']);
  expect(reopened.getSnapshot().pendingHandoffs).toEqual([]);
});

it('A의 단일 single-note 저장이 23514로 거절돼도 계정 캐시를 게스트로 바꾸지 않고 다음 A 동기화에서만 재전송한다', async () => {
  const storage = makeStorage();
  client.upsert.mockResolvedValueOnce({ error: { code: '23514', message: 'limit' } });
  await createTutorialPassSync(storage).recordPass('A', 'single-note');
  client.upsert.mockClear();

  const reopened = createTutorialPassSync(storage);
  expect(reopened.getPassedIds('A')).toEqual(['single-note']);
  expect(reopened.getPassedIds(null)).toEqual([]);
  expect(reopened.getSnapshot().pendingHandoffs).toEqual([]);
  await reopened.syncAccount('B');
  expect(client.rpc).not.toHaveBeenCalled();
  expect(client.upsert).not.toHaveBeenCalled();
  await reopened.syncAccount('A');
  expect(client.upsert).toHaveBeenCalledExactlyOnceWith(
    { user_id: 'A', tutorial_id: 'single-note' }, expect.any(Object),
  );
});

it('A로 로그인하면 서버 double-note와 게스트 single-note를 합치고 다시 열어 B로 로그인해도 이미 인계한 기록을 보내지 않는다', async () => {
  client.eq.mockResolvedValue({ data: [{ tutorial_id: 'double-note' }], error: null });
  const storage = makeStorage(['single-note']);
  const sync = createTutorialPassSync(storage);
  await sync.syncAccount('A');
  expect([...sync.getPassedIds('A')].sort()).toEqual(['double-note', 'single-note']);
  expect(sync.getPassedIds(null)).toEqual([]);
  expect(client.rpc).toHaveBeenCalledTimes(1);
  expect(client.rpc).toHaveBeenCalledWith('handoff_tutorial_passes', {
    target_user_id: 'A', request_id: expect.any(String), tutorial_ids: ['single-note'],
  });
  client.eq.mockResolvedValue({ data: [], error: null });
  const reopened = createTutorialPassSync(storage);
  await reopened.syncAccount('B');
  expect(reopened.getPassedIds('B')).toEqual([]);
  expect(reopened.getPassedIds(null)).toEqual([]);
  expect(client.rpc).toHaveBeenCalledTimes(1);
});

it('A의 저장이 오프라인으로 실패해도 double-note 통과는 로컬에 남고 게스트 기록으로 바뀌지 않는다', async () => {
  client.upsert.mockRejectedValue(new Error('offline'));
  const storage = makeStorage();
  const sync = createTutorialPassSync(storage);
  await expect(sync.recordPass('A', 'double-note')).resolves.toBeUndefined();
  const reopened = createTutorialPassSync(storage);
  expect(reopened.getPassedIds('A')).toEqual(['double-note']);
  expect(reopened.getPassedIds(null)).toEqual([]);
});

it('기존 single-note 저장값을 읽으면 게스트에만 보이고 A의 double-note 통과는 새로 열어도 A에게만 보인다', async () => {
  const storage = makeStorage(['single-note']);
  const sync = createTutorialPassSync(storage);
  expect(sync.getPassedIds(null)).toEqual(['single-note']);
  expect(sync.getPassedIds('A')).toEqual([]);
  await sync.recordPass('A', 'double-note');
  const reopened = createTutorialPassSync(storage);
  expect(reopened.getPassedIds('A')).toEqual(['double-note']);
  expect(reopened.getPassedIds('B')).toEqual([]);
  expect(reopened.getPassedIds(null)).toEqual(['single-note']);
  expect(client.upsert).toHaveBeenCalledWith(
    { user_id: 'A', tutorial_id: 'double-note' }, expect.any(Object),
  );
});

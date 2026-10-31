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

afterEach(() => { vi.unstubAllGlobals(); });

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

it('A의 인계 응답이 유실돼도 B에게 재인계하지 않고 A로 재접속하면 같은 영수증으로 확인한다', async () => {
  client.rpc.mockRejectedValueOnce(new Error('response lost'));
  const storage = makeStorage(['single-note']);
  const sync = createTutorialPassSync(storage);
  await expect(sync.syncAccount('A')).resolves.toBeUndefined();
  const receipt = client.rpc.mock.calls[0][1].request_id;
  const reopened = createTutorialPassSync(storage);
  await reopened.syncAccount('B');
  expect(client.rpc).toHaveBeenCalledTimes(1);
  expect(reopened.getPassedIds('B')).toEqual([]);
  expect(reopened.getPassedIds(null)).toEqual([]);
  await reopened.syncAccount('A');
  expect(client.rpc.mock.calls[1][1].request_id).toBe(receipt);
  expect(reopened.getPassedIds('A')).toEqual(['single-note']);
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

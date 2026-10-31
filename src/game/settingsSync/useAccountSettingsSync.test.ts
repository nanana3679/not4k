import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(), onAuthStateChange: vi.fn(), unsubscribe: vi.fn(),
  from: vi.fn(), maybeSingle: vi.fn(), upsert: vi.fn(), saveResponse: vi.fn(), toast: vi.fn(),
}));
vi.mock('../../supabase/client', () => ({ supabase: { from: mocks.from,
  auth: { getSession: mocks.getSession, onAuthStateChange: mocks.onAuthStateChange } } }));
vi.mock('../../shared/toast', () => ({ showToast: mocks.toast }));

function session(id: string, is_anonymous = false): Session {
  return { user: { id, is_anonymous } } as Session;
}

let emit: (event: AuthChangeEvent, session: Session | null) => void;
let cleanup: (() => void) | undefined;
let visibility: EventTarget & { visibilityState: string };
const browserValues = new Map<string, string>();

async function mount() {
  const { subscribeAccountSettingsSync } = await import('./useAccountSettingsSync');
  const { useGameStore } = await import('../stores/gameStore');
  cleanup = subscribeAccountSettingsSync();
  await vi.advanceTimersByTimeAsync(0);
  return useGameStore;
}

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.stubEnv('DEV', true);
  vi.stubEnv('VITE_DEV_ADMIN', 'false');
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('이 테스트는 네트워크를 사용하지 않는다'); }));
  browserValues.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => browserValues.get(key) ?? null,
    setItem: (key: string, value: string) => { browserValues.set(key, value); },
    removeItem: (key: string) => { browserValues.delete(key); },
  });
  vi.stubGlobal('window', { localStorage });
  visibility = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  vi.stubGlobal('document', visibility);
  mocks.onAuthStateChange.mockImplementation(callback => {
    emit = callback;
    return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
  });
  mocks.getSession.mockResolvedValue({ data: { session: session('A') }, error: null });
  mocks.maybeSingle.mockResolvedValue({ data: { settings: { scrollSpeed: 1200 } }, error: null });
  mocks.saveResponse.mockResolvedValue({ error: null });
  mocks.upsert.mockReturnValue({ abortSignal: mocks.saveResponse });
  mocks.from.mockReturnValue({
    select: () => ({ eq: () => ({ abortSignal: () => ({ maybeSingle: mocks.maybeSingle }) }) }),
    upsert: mocks.upsert,
  });
});

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  expect(fetch).not.toHaveBeenCalled();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('게임 루트 계정 설정 동기화 연결', () => {
  it('익명 세션으로 앱을 시작하고 로그인 이벤트를 받아도 설정 I/O·안내는 0회다', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: session('guest', true) }, error: null });
    const store = await mount();
    emit('SIGNED_IN', session('guest', true));
    store.getState().updateSettings({ scrollSpeed: 900 });
    await vi.advanceTimersByTimeAsync(500);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it('최초 실행 완료는 저장하지 않고 lane1을 KeyA로 바꾸면 500ms 뒤 키 바인딩을 저장한다', async () => {
    const store = await mount();
    store.getState().completeFirstLaunch();
    await vi.advanceTimersByTimeAsync(500);
    expect(mocks.upsert).not.toHaveBeenCalled();
    store.getState().updateKeyBindings({ lane1: ['KeyA'] });
    await vi.advanceTimersByTimeAsync(500);
    expect(mocks.upsert.mock.calls[0][0].settings.keyBindings.lane1).toEqual(['KeyA']);
    expect(mocks.upsert.mock.calls[0][0].settings).not.toHaveProperty('isFirstLaunch');
  });

  it('구독 해제 시 A의 대기 저장을 취소하고 이후 hidden·SIGNED_IN·설정 변경을 무시한다', async () => {
    const store = await mount();
    store.getState().updateSettings({ scrollSpeed: 900 });
    cleanup?.();
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
    cleanup = undefined;
    visibility.visibilityState = 'hidden';
    visibility.dispatchEvent(new Event('visibilitychange'));
    emit('SIGNED_IN', session('B'));
    store.getState().updateSettings({ scrollSpeed: 1000 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.maybeSingle).toHaveBeenCalledTimes(1);
  });

  it('로그아웃 후 900을 유지하고 B 로그인 시 서버 1300으로 바꿔도 자동 저장은 없다', async () => {
    const store = await mount();
    store.getState().updateSettings({ scrollSpeed: 900 });
    emit('SIGNED_OUT', null);
    await vi.advanceTimersByTimeAsync(500);
    expect(store.getState().settings.scrollSpeed).toBe(900);
    mocks.maybeSingle.mockResolvedValue({ data: { settings: { scrollSpeed: 1300 } }, error: null });
    emit('SIGNED_IN', session('B'));
    await vi.advanceTimersByTimeAsync(500);
    expect(store.getState().settings.scrollSpeed).toBe(1300);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it('불러오기 실패 뒤 TOKEN_REFRESHED는 재시도하지 않고 다음 SIGNED_IN 성공 뒤에만 900을 저장한다', async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
    const store = await mount();
    expect(mocks.toast).toHaveBeenCalledWith(
      "Couldn't load your account settings. Using this browser's settings.", 'error',
    );
    emit('TOKEN_REFRESHED', session('A'));
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.maybeSingle).toHaveBeenCalledTimes(1);
    store.getState().updateSettings({ scrollSpeed: 950 });
    await vi.advanceTimersByTimeAsync(500);
    expect(mocks.upsert).not.toHaveBeenCalled();
    emit('SIGNED_IN', session('A'));
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState().settings.scrollSpeed).toBe(1200);
    store.getState().updateSettings({ scrollSpeed: 900 });
    await vi.advanceTimersByTimeAsync(500);
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });
  it('앱 시작의 A 세션 조회보다 B SIGNED_IN이 먼저 오면 늦은 A를 무시하고 B만 불러온다', async () => {
    let resolve!: (value: { data: { session: Session }; error: null }) => void;
    mocks.getSession.mockReturnValue(new Promise(done => { resolve = done; }));
    const store = await mount();
    emit('SIGNED_IN', session('B'));
    await vi.advanceTimersByTimeAsync(0);
    mocks.maybeSingle.mockResolvedValue({ data: { settings: { scrollSpeed: 1500 } }, error: null });
    resolve({ data: { session: session('A') }, error: null });
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.maybeSingle).toHaveBeenCalledTimes(1);
    expect(store.getState().settings.scrollSpeed).toBe(1200);
  });
  it('900 변경 100ms 뒤 document가 hidden이 되면 즉시 1회 저장한다', async () => {
    const store = await mount();
    store.getState().updateSettings({ scrollSpeed: 900 });
    await vi.advanceTimersByTimeAsync(100);
    visibility.dispatchEvent(new Event('visibilitychange'));
    expect(mocks.upsert).not.toHaveBeenCalled();
    visibility.visibilityState = 'hidden';
    visibility.dispatchEvent(new Event('visibilitychange'));
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });
  it('DEV_ADMIN=true면 dev-user를 위해 세션 구독·조회·설정 I/O·안내를 하지 않는다', async () => {
    vi.stubEnv('VITE_DEV_ADMIN', 'true');
    const store = await mount();
    store.getState().updateSettings({ scrollSpeed: 900 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(mocks.onAuthStateChange).not.toHaveBeenCalled();
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
  });
  it('실제 세션 A가 있는 앱 시작 시 서버 1200을 로컬에 저장하고 900 변경은 500ms 뒤 저장한다', async () => {
    const store = await mount();
    expect(store.getState().settings.scrollSpeed).toBe(1200);
    expect(JSON.parse(browserValues.get('not4k-settings')!).state.settings.scrollSpeed).toBe(1200);
    store.getState().updateSettings({ scrollSpeed: 900 });
    expect(JSON.parse(browserValues.get('not4k-settings')!).state.settings.scrollSpeed).toBe(900);
    expect(mocks.upsert).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(mocks.upsert).toHaveBeenCalledWith(
      { user_id: 'A', settings: expect.objectContaining({ scrollSpeed: 900 }) }, { onConflict: 'user_id' },
    );
  });
});

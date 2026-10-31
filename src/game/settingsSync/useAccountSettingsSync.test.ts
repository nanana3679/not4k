import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(), onAuthStateChange: vi.fn(), unsubscribe: vi.fn(),
  from: vi.fn(), maybeSingle: vi.fn(), upsert: vi.fn(), saveResponse: vi.fn(), insertResponse: vi.fn(), toast: vi.fn(),
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

/** 최초 실행을 이미 끝낸 브라우저로 시작한다. 최초 실행 중의 변경은 unsyncedAccountSettings에 기록하지 않는다. */
function finishFirstLaunch(settings: Record<string, unknown> = {}) {
  browserValues.set('not4k-settings', JSON.stringify({ state: { settings: { isFirstLaunch: false, ...settings } }, version: 0 }));
}

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
  mocks.maybeSingle.mockResolvedValue({ data: { settings: { scrollSpeed: 1200 } }, error: null, status: 200 });
  mocks.saveResponse.mockResolvedValue({ error: null, status: 200 });
  mocks.insertResponse.mockResolvedValue({ data: [{ user_id: 'A' }], error: null, status: 201 });
  // 일반 저장은 upsert().abortSignal(), 최초 삽입은 upsert().select().abortSignal()이다.
  mocks.upsert.mockReturnValue({ abortSignal: mocks.saveResponse, select: () => ({ abortSignal: mocks.insertResponse }) });
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
  vi.restoreAllMocks();
});

describe('게임 루트 계정 설정 동기화 연결', () => {
  it('SIGNED_IN의 setUser가 거부되면 불러오기 실패를 안내하고 미처리 거부를 남기지 않는다', async () => {
    const module = await import('./accountSettingsSync');
    const create = module.createAccountSettingsSync;
    vi.spyOn(module, 'createAccountSettingsSync').mockImplementation(options => {
      const sync = create(options);
      vi.spyOn(sync, 'setUser').mockRejectedValueOnce(new Error('unexpected load failure'));
      return sync;
    });
    // 앱 시작의 빈 세션 처리를 건너뛰고 실제 로그인 이벤트에서 거부를 일으킨다.
    mocks.getSession.mockReturnValue(new Promise(() => {}));
    await mount();
    emit('SIGNED_IN', session('A'));
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.toast).toHaveBeenCalledWith(
      "Couldn't load your account settings. Using this browser's settings.", 'error',
    );
  });

  it('서버 1200의 localStorage 저장이 실패하면 안내하고 이후 900 변경은 바로 업로드하지 않다가 다음 SIGNED_IN에서 서버 행 위에 900을 얹어 업로드한다', async () => {
    finishFirstLaunch();
    const write = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota exceeded'); });
    const store = await mount();
    expect(mocks.toast).toHaveBeenCalledWith(
      "Couldn't load your account settings. Using this browser's settings.", 'error',
    );
    write.mockRestore();
    store.getState().updateSettings({ scrollSpeed: 900 });
    await vi.advanceTimersByTimeAsync(500);
    expect(mocks.upsert).not.toHaveBeenCalled();
    emit('SIGNED_IN', session('A'));
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState().settings.scrollSpeed).toBe(900);
    expect(mocks.upsert.mock.calls.map(([row]) => row.settings.scrollSpeed)).toEqual([900]);
  });
  it('익명 세션으로 앱을 시작하고 로그인 이벤트를 받아도 설정 I/O·안내는 0회다', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: session('guest', true) }, error: null });
    const store = await mount();
    emit('SIGNED_IN', session('guest', true));
    store.getState().updateSettings({ scrollSpeed: 900 });
    await vi.advanceTimersByTimeAsync(500);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it('기기 전용 debugMode=true 변경은 저장하지 않고 lane1을 KeyA·KeyZ로 바꾸면 500ms 뒤 키 바인딩을 저장한다', async () => {
    const store = await mount();
    store.getState().updateSettings({ debugMode: true });
    await vi.advanceTimersByTimeAsync(500);
    expect(mocks.upsert).not.toHaveBeenCalled();
    store.getState().updateKeyBindings({ lane1: ['KeyA', 'KeyZ'] });
    await vi.advanceTimersByTimeAsync(500);
    expect(mocks.upsert.mock.calls[0][0].settings.keyBindings.lane1).toEqual(['KeyA', 'KeyZ']);
    expect(mocks.upsert.mock.calls[0][0].settings).not.toHaveProperty('isFirstLaunch');
    expect(mocks.upsert.mock.calls[0][0].settings).not.toHaveProperty('debugMode');
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
    mocks.maybeSingle.mockResolvedValue({ data: { settings: { scrollSpeed: 1300 } }, error: null, status: 200 });
    emit('SIGNED_IN', session('B'));
    await vi.advanceTimersByTimeAsync(500);
    expect(store.getState().settings.scrollSpeed).toBe(1300);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it('불러오기 실패 뒤 TOKEN_REFRESHED는 재시도하지 않고 다음 SIGNED_IN 성공에서 실패 중 바꾼 950을 서버 행 위에 얹어 업로드한다', async () => {
    finishFirstLaunch();
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
    expect(store.getState().settings.scrollSpeed).toBe(950);
    store.getState().updateSettings({ scrollSpeed: 900 });
    await vi.advanceTimersByTimeAsync(500);
    expect(mocks.upsert.mock.calls.map(([row]) => row.settings.scrollSpeed)).toEqual([950, 900]);
  });
  it('앱 시작의 A 세션 조회보다 B SIGNED_IN이 먼저 오면 늦은 A를 무시하고 B만 불러온다', async () => {
    let resolve!: (value: { data: { session: Session }; error: null }) => void;
    mocks.getSession.mockReturnValue(new Promise(done => { resolve = done; }));
    const store = await mount();
    emit('SIGNED_IN', session('B'));
    await vi.advanceTimersByTimeAsync(0);
    mocks.maybeSingle.mockResolvedValue({ data: { settings: { scrollSpeed: 1500 } }, error: null, status: 200 });
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
      { user_id: 'A', settings: expect.objectContaining({ scrollSpeed: 900 }), updated_at: expect.any(String) }, { onConflict: 'user_id' },
    );
  });
});

describe('새 브라우저의 프리셋 선택 화면', () => {
  const accountBindings = { lane1: ['KeyA', 'KeyZ'], lane2: ['KeyD', 'KeyF'],
    lane3: ['KeyJ', 'KeyK'], lane4: ['KeyL', 'Semicolon'] };

  it('presetSetup 화면에서 A의 서버 행을 적용하면 isFirstLaunch=false와 서버 바인딩으로 songSelect 화면이 된다', async () => {
    const { useGameStore } = await import('../stores/gameStore');
    useGameStore.setState({ screen: 'presetSetup' });
    mocks.maybeSingle.mockResolvedValue({ data: { settings: { keyBindings: accountBindings } }, error: null, status: 200 });
    const store = await mount();
    expect(store.getState().screen).toBe('songSelect');
    expect(store.getState().settings).toMatchObject({ isFirstLaunch: false, keyBindings: accountBindings });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('title 화면에서 A의 서버 행 keyBindings를 적용하면 화면은 title에 두고 isFirstLaunch=false로 바꾼다', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { settings: { keyBindings: accountBindings } }, error: null, status: 200 });
    const store = await mount();
    expect(store.getState().screen).toBe('title');
    expect(store.getState().settings.isFirstLaunch).toBe(false);
  });

  it('presetSetup 화면에서 A의 서버 행이 없어 로컬을 삽입하면 presetSetup에 남고 isFirstLaunch=true를 유지한다', async () => {
    const { useGameStore } = await import('../stores/gameStore');
    useGameStore.setState({ screen: 'presetSetup' });
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null, status: 200 });
    const store = await mount();
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'A' }),
      { onConflict: 'user_id', ignoreDuplicates: true });
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(store.getState().screen).toBe('presetSetup');
    expect(store.getState().settings.isFirstLaunch).toBe(true);
  });
});

describe('localStorage의 unsyncedAccountSettings', () => {
  const UNSYNCED_KEY = 'not4k-account-settings-unsynced';
  const unsyncedEntries = () => JSON.parse(browserValues.get(UNSYNCED_KEY) ?? '{}');

  it('A의 900 변경을 예약하면 not4k-account-settings-unsynced에 A의 scrollSpeed=900을 기록하고 저장 성공 뒤 키를 지운다', async () => {
    finishFirstLaunch();
    const store = await mount();
    store.getState().updateSettings({ scrollSpeed: 900 });
    expect(unsyncedEntries()).toEqual({ A: { scrollSpeed: 900 } });
    await vi.advanceTimersByTimeAsync(500);
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(browserValues.has(UNSYNCED_KEY)).toBe(false);
  });

  it('localStorage에 A의 scrollSpeed=900 기록이 있으면 앱 시작 시 서버 행 1200·liftPercent=10 위에 900을 얹어 upsert하고 기록을 지운다', async () => {
    finishFirstLaunch({ liftPercent: 70 });
    browserValues.set(UNSYNCED_KEY, JSON.stringify({ A: { scrollSpeed: 900 } }));
    mocks.maybeSingle.mockResolvedValue({ data: { settings: { scrollSpeed: 1200, liftPercent: 10 } }, error: null, status: 200 });
    const store = await mount();
    expect(store.getState().settings).toMatchObject({ scrollSpeed: 900, liftPercent: 10 });
    expect(mocks.upsert).toHaveBeenCalledWith({ user_id: 'A',
      settings: expect.objectContaining({ scrollSpeed: 900, liftPercent: 10 }), updated_at: expect.any(String) }, { onConflict: 'user_id' });
    expect(browserValues.has(UNSYNCED_KEY)).toBe(false);
  });

  it('localStorage에 B의 기록만 있으면 A 앱 시작은 서버 1200을 적용하고 B 기록을 그대로 둔다', async () => {
    browserValues.set(UNSYNCED_KEY, JSON.stringify({ B: { scrollSpeed: 1300 } }));
    const store = await mount();
    expect(store.getState().settings.scrollSpeed).toBe(1200);
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(unsyncedEntries()).toEqual({ B: { scrollSpeed: 1300 } });
  });

  it('A 저장 실패로 A 기록이 남은 뒤 B 서버 행을 적용하고 다시 A로 로그인하면 A 서버 행 위에 A의 900만 얹어 업로드한다', async () => {
    finishFirstLaunch();
    const rowA = { scrollSpeed: 1200, liftPercent: 5 };
    mocks.maybeSingle.mockResolvedValue({ data: { settings: rowA }, error: null, status: 200 });
    const store = await mount();
    mocks.saveResponse.mockResolvedValueOnce({ error: { message: 'offline' }, status: 0 });
    store.getState().updateSettings({ scrollSpeed: 900 });
    await vi.advanceTimersByTimeAsync(500);
    expect(unsyncedEntries()).toEqual({ A: { scrollSpeed: 900 } });
    emit('SIGNED_OUT', null);
    mocks.maybeSingle.mockResolvedValueOnce({ data: { settings: { scrollSpeed: 1300, liftPercent: 20 } }, error: null, status: 200 });
    emit('SIGNED_IN', session('B'));
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState().settings).toMatchObject({ scrollSpeed: 1300, liftPercent: 20 });
    expect(unsyncedEntries()).toEqual({ A: { scrollSpeed: 900 } });
    emit('SIGNED_OUT', null);
    emit('SIGNED_IN', session('A'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(store.getState().settings).toMatchObject({ scrollSpeed: 900, liftPercent: 5 });
    expect(mocks.upsert.mock.calls.map(([row]) => [row.user_id, row.settings.scrollSpeed, row.settings.liftPercent]))
      .toEqual([['A', 900, 5], ['A', 900, 5]]);
    expect(browserValues.has(UNSYNCED_KEY)).toBe(false);
  });

  it('unsyncedAccountSettings를 localStorage에 쓰지 못해도 A의 900 변경은 500ms 뒤 저장한다', async () => {
    finishFirstLaunch();
    const store = await mount();
    const write = localStorage.setItem;
    vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      if (key === UNSYNCED_KEY) throw new Error('quota exceeded');
      write(key, value);
    });
    store.getState().updateSettings({ scrollSpeed: 900 });
    await vi.advanceTimersByTimeAsync(500);
    expect(mocks.upsert.mock.calls[0][0].settings.scrollSpeed).toBe(900);
  });
});

describe('인증 이벤트 반복', () => {
  it('A 불러오기 성공 뒤 900 변경 대기 중 같은 A의 SIGNED_IN이 오면 다시 불러오지 않고 500ms 뒤 900을 저장한다', async () => {
    const store = await mount();
    store.getState().updateSettings({ scrollSpeed: 900 });
    emit('SIGNED_IN', session('A'));
    await vi.advanceTimersByTimeAsync(500);
    expect(mocks.maybeSingle).toHaveBeenCalledTimes(1);
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.upsert.mock.calls[0][0].settings.scrollSpeed).toBe(900);
  });

  it('A 불러오기가 계속 실패하는 동안 탭 재진입의 SIGNED_IN이 3번 와도 불러오기 실패 안내는 1번이다', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { message: 'offline' } });
    await mount();
    for (let attempt = 0; attempt < 3; attempt++) {
      emit('SIGNED_IN', session('A'));
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(mocks.maybeSingle).toHaveBeenCalledTimes(4);
    expect(mocks.toast).toHaveBeenCalledTimes(1);
  });
});

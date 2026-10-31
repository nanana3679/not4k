import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '../stores/gameStore';
import { mergeAccountSettings, selectAccountSettings, createAccountSettingsSync,
  ACCOUNT_SETTINGS_LOAD_FAILURE_MESSAGE, ACCOUNT_SETTINGS_SAVE_FAILURE_MESSAGE,
  type AccountSettings, type AccountSettingsUpload, type InsertAccountSettingsResult, type LoadAccountSettingsResult } from './accountSettingsSync';

describe('계정 설정 분리', () => {
  it.each([
    ['lane1 키 40개(레인당 개수 상한 없음)', Array.from({ length: 40 }, (_, i) => `Test${i}`), true],
    ['lane1 키 1개', ['KeyA'], false],
    ['키 코드 32자', ['K'.repeat(32), 'KeyA'], true],
    ['키 코드 33자', ['K'.repeat(33), 'KeyA'], false],
  ] as const)('서버 %s는 레인당 2개 이상·키 코드 32자 이하일 때만 keyBindings를 적용한다', (_label, lane1, accepted) => {
    const local = useGameStore.getInitialState().settings;
    const keyBindings = { ...local.keyBindings, lane1: [...lane1] };
    expect(mergeAccountSettings(local, { keyBindings, scrollSpeed: 1200 }))
      .toEqual({ ...local, keyBindings: accepted ? keyBindings : local.keyBindings, scrollSpeed: 1200 });
  });
  it('로컬 skinId=crystal에 서버 skinId=classic을 병합하면 스킨 목록에 있는 classic을 적용한다', () => {
    const local = { ...useGameStore.getInitialState().settings, skinId: 'crystal' };
    expect(mergeAccountSettings(local, { skinId: 'classic', scrollSpeed: 1200 }))
      .toEqual({ ...local, skinId: 'classic', scrollSpeed: 1200 });
  });
  it.each([['neon', 'neon'], ['64자 문자열', 's'.repeat(64)]])(
    '로컬 skinId=crystal에 스킨 목록에 없는 서버 skinId(%s)를 병합하면 로컬 crystal을 유지한다', (_label, skinId) => {
      const local = { ...useGameStore.getInitialState().settings, skinId: 'crystal' };
      expect(mergeAccountSettings(local, { skinId, scrollSpeed: 1200 }))
        .toEqual({ ...local, scrollSpeed: 1200 });
    },
  );
  it('서버 preset=numpad·judgmentMode=easy는 지원 값이므로 그대로 적용한다', () => {
    const local = useGameStore.getInitialState().settings;
    expect(mergeAccountSettings(local, { preset: 'numpad', judgmentMode: 'easy' }))
      .toEqual({ ...local, preset: 'numpad', judgmentMode: 'easy' });
  });
  it('서버 scrollSpeed=5000·liftPercent=-10·renderHeight=4320은 설정 UI 범위 끝값 2000·0·1440으로 제한해 적용한다', () => {
    const local = useGameStore.getInitialState().settings;
    expect(mergeAccountSettings(local, { scrollSpeed: 5000, liftPercent: -10, renderHeight: 4320 }))
      .toEqual({ ...local, scrollSpeed: 2000, liftPercent: 0, renderHeight: 1440 });
  });
  it('불러오기·저장 실패 안내 문구는 게임 코어 스펙의 영어 문장과 같다', () => {
    expect(ACCOUNT_SETTINGS_LOAD_FAILURE_MESSAGE).toBe("Couldn't load your account settings. Using this browser's settings.");
    expect(ACCOUNT_SETTINGS_SAVE_FAILURE_MESSAGE).toBe("Couldn't save settings to your account. They're kept in this browser.");
  });
  it.each([
    ['lane1·lane2의 KeyA 중복', ['KeyA', 'KeyS'], ['KeyA', 'KeyD']],
    ['lane1 안의 KeyA 중복', ['KeyA', 'KeyA'], ['KeyD', 'KeyF']],
    ['lane1 키 1개', ['KeyA'], ['KeyD', 'KeyF']],
    ['lane1 키 0개', [], ['KeyD', 'KeyF']],
  ])('서버 %s는 keyBindings 전체를 로컬로 유지하고 scrollSpeed=1200만 적용한다', (_label, lane1, lane2) => {
    const local = useGameStore.getInitialState().settings;
    const keyBindings = { lane1, lane2, lane3: ['KeyJ', 'KeyK'], lane4: ['KeyL', 'Semicolon'] };
    expect(mergeAccountSettings(local, { keyBindings, scrollSpeed: 1200 }))
      .toEqual({ ...local, scrollSpeed: 1200 });
  });
  it('18개 설정에서 계정 설정을 고르면 기기 전용 5개와 알 수 없는 키를 제외한 13개만 남는다', () => {
    const settings = { ...useGameStore.getInitialState().settings, obsolete: 42 };
    const account = selectAccountSettings(settings);
    expect(Object.keys(account).sort()).toEqual([
      'bombScale', 'gearMotion', 'judgmentMode', 'keyBindings', 'liftPercent',
      'playSpeed', 'preset', 'renderHeight', 'scrollSpeed', 'showFastSlow',
      'showTimingDiff', 'skinId', 'suddenPercent',
    ].sort());
    expect(account).toMatchObject({ scrollSpeed: 800, preset: 'tkl', gearMotion: true });
  });

  it('서버 scrollSpeed=1200을 적용하면 로컬의 오프셋 −15·30ms, 볼륨 0.4, 최초 실행 false, 디버그 true를 유지한다', () => {
    const local = { ...useGameStore.getInitialState().settings,
      inputOffsetMs: -15, visualOffsetMs: 30, masterVolume: 0.4,
      isFirstLaunch: false, debugMode: true };
    expect(mergeAccountSettings(local, {
      scrollSpeed: 1200, inputOffsetMs: 99, visualOffsetMs: 99,
      masterVolume: 1, isFirstLaunch: true, debugMode: false,
    })).toEqual({ ...local, scrollSpeed: 1200 });
  });

  it.each([
    ['null', null], ['배열 []', []], ['문자열 settings', 'settings'], ['숫자 123', 123],
    ['scrollSpeed="900"·showFastSlow=0·불완전한 바인딩',
      { scrollSpeed: '900', showFastSlow: 0, keyBindings: { lane1: ['KeyA'] } }],
    ['scrollSpeed=Infinity·bombScale=NaN·preset=unknown·judgmentMode=hard',
      { scrollSpeed: Infinity, bombScale: NaN, preset: 'unknown', judgmentMode: 'hard' }],
    ['lane3에 문자열 대신 숫자 4가 있는 바인딩',
      { keyBindings: { lane1: ['KeyA'], lane2: [], lane3: [4], lane4: [] } }],
    ['lane5가 추가된 바인딩',
      { keyBindings: { lane1: [], lane2: [], lane3: [], lane4: [], lane5: [] } }],
  ])('서버 %s를 받으면 해당 키는 기본 scrollSpeed=800 등 로컬값을 유지한다', (_label, server) => {
    const local = useGameStore.getInitialState().settings;
    expect(mergeAccountSettings(local, server)).toEqual(local);
  });

  it('레인마다 서로 다른 키 2개와 gearMotion=false만 적용하고 잘못된 scrollSpeed·옛 키는 버린다', () => {
    const local = { ...useGameStore.getInitialState().settings, inputOffsetMs: 1500 };
    const keyBindings = { lane1: ['KeyA', 'KeyS'], lane2: ['KeyD', 'KeyF'],
      lane3: ['KeyJ', 'KeyK'], lane4: ['KeyL', 'Semicolon'] };
    const applied = mergeAccountSettings(local, {
      keyBindings, gearMotion: false, scrollSpeed: NaN, frameMotion: true, unknown: 3,
    });
    expect(applied).toEqual({ ...local, keyBindings, gearMotion: false, inputOffsetMs: 1000 });
  });
});

function setupSync(initialUnsyncedUserId: string | null = null) {
  let settings = { ...useGameStore.getInitialState().settings };
  const listeners = new Set<() => void>();
  const store = {
    getSettings: () => settings,
    applySettings: vi.fn((next: typeof settings) => {
      settings = next;
      listeners.forEach(listener => listener());
    }),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
  const load = vi.fn<(...args: [string, AbortSignal]) => Promise<LoadAccountSettingsResult>>()
    .mockResolvedValue({ status: 'found', settings: { scrollSpeed: 1200 } });
  const save = vi.fn<(...args: [string, AccountSettingsUpload, AbortSignal]) => Promise<boolean>>()
    .mockResolvedValue(true);
  const insertIfAbsent = vi.fn<(...args: [string, AccountSettings, AbortSignal]) => Promise<InsertAccountSettingsResult>>()
    .mockResolvedValue('inserted');
  const notice = vi.fn();
  // 브라우저 저장소 대신 메모리 한 칸에 미동기화 표시의 사용자 id를 둔다.
  let unsyncedUserId = initialUnsyncedUserId;
  const unsyncedMarker = {
    owner: () => unsyncedUserId,
    set: (userId: string) => { unsyncedUserId = userId; },
    clear: () => { unsyncedUserId = null; },
  };
  const sync = createAccountSettingsSync({ store, load, insertIfAbsent, save, notice, unsyncedMarker,
    timers: { setTimeout: (callback, ms) => setTimeout(callback, ms), clearTimeout: id => clearTimeout(id) } });
  return { ...store, load, insertIfAbsent, save, notice, sync,
    // zustand persist처럼 메모리 상태를 바꾸고 구독자에 알린 뒤 저장소 쓰기만 실패하는 경우를 흉내 낸다.
    commitInMemory: (next: typeof settings) => { settings = next; listeners.forEach(listener => listener()); },
    unsyncedOwner: () => unsyncedUserId,
    setUnsyncedOwner: (userId: string | null) => { unsyncedUserId = userId; },
    change: (partial: Partial<typeof settings>) => store.applySettings({ ...settings, ...partial }) };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

describe('계정 설정 동기화 수명', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('서버 1200 적용 중 저장소 예외가 나면 실패 안내 후 900 변경을 바로 올리지 않고 다음 A 로그인에서 서버 1200 대신 900을 저장한다', async () => {
    const test = setupSync();
    test.applySettings.mockImplementationOnce(() => { throw new Error('quota exceeded'); });
    await expect(test.sync.setUser({ id: 'A' })).resolves.toBeUndefined();
    expect(test.notice).toHaveBeenCalledWith(ACCOUNT_SETTINGS_LOAD_FAILURE_MESSAGE);
    test.change({ scrollSpeed: 900 });
    await vi.advanceTimersByTimeAsync(500);
    expect(test.save).not.toHaveBeenCalled();
    expect(test.insertIfAbsent).not.toHaveBeenCalled();
    await test.sync.setUser({ id: 'A' });
    await vi.advanceTimersByTimeAsync(0);
    expect(test.getSettings().scrollSpeed).toBe(900);
    expect(test.save.mock.calls.map(([, settings]) => settings.scrollSpeed)).toEqual([900]);
    test.sync.dispose();
  });

  it.each([
    [16384, 'a', true], [16385, 'a', false], [16384, '가', true], [16385, '가', false],
  ] as const)('서버 JSON UTF-8 %i바이트(%s)는 16KiB까지 적용하고 초과하면 전체 불러오기 실패로 처리한다', async (bytes, character, accepted) => {
    const test = setupSync();
    const settings = { scrollSpeed: 1200, ignored: '' };
    const paddingBytes = bytes - new TextEncoder().encode(JSON.stringify(settings)).byteLength;
    const characterBytes = new TextEncoder().encode(character).byteLength;
    settings.ignored = character.repeat(Math.floor(paddingBytes / characterBytes)) + 'a'.repeat(paddingBytes % characterBytes);
    expect(new TextEncoder().encode(JSON.stringify(settings)).byteLength).toBe(bytes);
    test.load.mockResolvedValue({ status: 'found', settings });
    await test.sync.setUser({ id: 'A' });
    expect(test.getSettings().scrollSpeed).toBe(accepted ? 1200 : 800);
    if (accepted) expect(test.notice).not.toHaveBeenCalled();
    else expect(test.notice).toHaveBeenCalledWith(ACCOUNT_SETTINGS_LOAD_FAILURE_MESSAGE);
    test.change({ scrollSpeed: 900 });
    await vi.advanceTimersByTimeAsync(500);
    expect(test.save).toHaveBeenCalledTimes(accepted ? 1 : 0);
    expect(test.insertIfAbsent).not.toHaveBeenCalled();
    test.sync.dispose();
  });

  it('800 최초 삽입 중 900으로 변경하면 삽입 성공 전에는 저장하지 않고 성공 뒤 최신 900을 저장한다', async () => {
    const test = setupSync();
    const pending = deferred<InsertAccountSettingsResult>();
    test.load.mockResolvedValue({ status: 'notFound' });
    test.insertIfAbsent.mockReturnValueOnce(pending.promise);
    const loading = test.sync.setUser({ id: 'A' });
    await vi.advanceTimersByTimeAsync(0);
    test.change({ scrollSpeed: 900 });
    await test.sync.setUser({ id: 'A' });
    await vi.advanceTimersByTimeAsync(500);
    expect(test.insertIfAbsent).toHaveBeenCalledTimes(1);
    expect(test.save).not.toHaveBeenCalled();
    pending.resolve('inserted');
    await loading;
    await vi.advanceTimersByTimeAsync(500);
    expect(test.save.mock.calls.map(([, settings]) => settings.scrollSpeed)).toEqual([900]);
    test.sync.dispose();
  });

  it.each<LoadAccountSettingsResult>([{ status: 'notFound' }, { status: 'failed' }])(
    '삽입 충돌 뒤 재조회가 %j이면 실패 안내 후 저장하지 않고 다음 SIGNED_IN에서도 충돌하면 안내 없이 같은 처리를 한다', async reload => {
      const test = setupSync();
      test.load.mockResolvedValueOnce({ status: 'notFound' }).mockResolvedValueOnce(reload)
        .mockResolvedValueOnce({ status: 'notFound' }).mockResolvedValueOnce(reload);
      test.insertIfAbsent.mockResolvedValue('conflict');
      for (const speed of [900, 1000]) {
        await test.sync.setUser({ id: 'A' });
        test.change({ scrollSpeed: speed });
        test.sync.flush();
        await vi.advanceTimersByTimeAsync(1000);
        expect(test.save).not.toHaveBeenCalled();
      }
      expect(test.load).toHaveBeenCalledTimes(4);
      expect(test.insertIfAbsent).toHaveBeenCalledTimes(2);
      expect(test.notice).toHaveBeenCalledTimes(1);
      expect(test.notice).toHaveBeenCalledWith(ACCOUNT_SETTINGS_LOAD_FAILURE_MESSAGE);
      test.sync.dispose();
    },
  );

  it('최초 삽입 오류는 불러오기 실패로 안내하고 재조회·이후 900 변경 업로드를 하지 않는다', async () => {
    const test = setupSync();
    test.load.mockResolvedValue({ status: 'notFound' });
    test.insertIfAbsent.mockResolvedValue('failed');
    await test.sync.setUser({ id: 'A' });
    expect(test.notice).toHaveBeenCalledWith(ACCOUNT_SETTINGS_LOAD_FAILURE_MESSAGE);
    test.change({ scrollSpeed: 900 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(test.load).toHaveBeenCalledTimes(1);
    expect(test.save).not.toHaveBeenCalled();
    test.sync.dispose();
  });

  it.each<InsertAccountSettingsResult>(['inserted', 'conflict', 'failed'])(
    'A 삽입 대기 중 B로 전환하면 A의 늦은 %s 응답을 재조회·적용·안내하지 않는다', async result => {
      const test = setupSync();
      const pending = deferred<InsertAccountSettingsResult>();
      test.load.mockResolvedValueOnce({ status: 'notFound' });
      test.insertIfAbsent.mockReturnValueOnce(pending.promise);
      const loading = test.sync.setUser({ id: 'A' });
      await vi.advanceTimersByTimeAsync(0);
      await test.sync.setUser({ id: 'B' });
      pending.resolve(result);
      await loading;
      expect(test.insertIfAbsent.mock.calls[0][2].aborted).toBe(true);
      expect(test.load).toHaveBeenCalledTimes(2);
      expect(test.getSettings().scrollSpeed).toBe(1200);
      expect(test.save).not.toHaveBeenCalled();
      expect(test.notice).not.toHaveBeenCalled();
      test.sync.dispose();
    },
  );

  it('거짓 notFound 뒤 숨겨진 서버 1600과 삽입이 충돌하면 덮어쓰지 않고 1회 재조회해 1600을 적용한다', async () => {
    const test = setupSync();
    let server = { scrollSpeed: 1600 };
    test.load.mockResolvedValueOnce({ status: 'notFound' })
      .mockImplementation(async () => ({ status: 'found', settings: server }));
    test.insertIfAbsent.mockResolvedValue('conflict');
    test.save.mockImplementation(async (_id, settings) => { server = settings; return true; });
    await test.sync.setUser({ id: 'A' });
    expect(server.scrollSpeed).toBe(1600);
    expect(test.getSettings().scrollSpeed).toBe(1600);
    expect(test.load).toHaveBeenCalledTimes(2);
    expect(test.insertIfAbsent).toHaveBeenCalledTimes(1);
    expect(test.save).not.toHaveBeenCalled();
    expect(test.notice).not.toHaveBeenCalled();
    test.change({ scrollSpeed: 900 });
    await vi.advanceTimersByTimeAsync(500);
    expect(server.scrollSpeed).toBe(900);
    test.sync.dispose();
  });

  it('A 저장 도중 로그아웃→B 로그인하면 A 요청을 취소하고 A의 대기값 1000과 늦은 실패 안내를 버린다', async () => {
    const test = setupSync();
    await test.sync.setUser({ id: 'A' });
    const pending = deferred<boolean>();
    test.save.mockReturnValueOnce(pending.promise);
    test.change({ scrollSpeed: 900 });
    await vi.advanceTimersByTimeAsync(500);
    test.change({ scrollSpeed: 1000 });
    await test.sync.setUser(null);
    expect(test.getSettings().scrollSpeed).toBe(1000);
    await test.sync.setUser({ id: 'B' });
    expect(test.save.mock.calls[0][2].aborted).toBe(true);
    pending.resolve(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(test.getSettings().scrollSpeed).toBe(1200);
    expect(test.save).toHaveBeenCalledTimes(1);
    expect(test.notice).not.toHaveBeenCalled();
    test.change({ scrollSpeed: 1300 });
    await vi.advanceTimersByTimeAsync(500);
    expect(test.save.mock.calls[1][0]).toBe('B');
    expect(test.save.mock.calls[1][1].scrollSpeed).toBe(1300);
    test.sync.dispose();
  });

  it('A의 900 저장 타이머 도중 B가 로그인하면 A의 대기 저장은 취소한다', async () => {
    const test = setupSync();
    await test.sync.setUser({ id: 'A' });
    test.change({ scrollSpeed: 900 });
    await test.sync.setUser({ id: 'B' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(test.save).not.toHaveBeenCalled();
    test.sync.dispose();
  });

  it('A 불러오기 중 로컬을 900으로 바꾸고 서버 행이 없다고 확인하면 최신 900을 업로드한다', async () => {
    const test = setupSync();
    const pending = deferred<LoadAccountSettingsResult>();
    test.load.mockReturnValueOnce(pending.promise);
    const loading = test.sync.setUser({ id: 'A' });
    test.change({ scrollSpeed: 900 });
    await vi.advanceTimersByTimeAsync(500);
    expect(test.save).not.toHaveBeenCalled();
    pending.resolve({ status: 'notFound' });
    await loading;
    expect(test.insertIfAbsent.mock.calls[0][1].scrollSpeed).toBe(900);
    test.sync.dispose();
  });

  it('A 불러오기 실패 뒤 다시 로그인하여 성공하면 그 이후 900 변경은 저장한다', async () => {
    const test = setupSync();
    test.load.mockResolvedValueOnce({ status: 'failed' });
    await test.sync.setUser({ id: 'A' });
    await test.sync.setUser({ id: 'A' });
    test.change({ scrollSpeed: 900 });
    await vi.advanceTimersByTimeAsync(500);
    expect(test.load).toHaveBeenCalledTimes(2);
    expect(test.save).toHaveBeenCalledTimes(1);
    test.sync.dispose();
  });

  it('익명 사용자로 로그인하고 900으로 변경하면 불러오기·저장·안내는 0회다', async () => {
    const test = setupSync();
    await test.sync.setUser({ id: 'anonymous', is_anonymous: true });
    test.change({ scrollSpeed: 900 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(test.load).not.toHaveBeenCalled();
    expect(test.save).not.toHaveBeenCalled();
    expect(test.notice).not.toHaveBeenCalled();
    test.sync.dispose();
  });

  it('불러오기 중 dispose하면 늦은 1500을 적용하지 않고 이후 로그인·변경에도 I/O가 없다', async () => {
    const test = setupSync();
    const pending = deferred<LoadAccountSettingsResult>();
    test.load.mockReturnValueOnce(pending.promise);
    const loading = test.sync.setUser({ id: 'A' });
    test.sync.dispose();
    pending.resolve({ status: 'found', settings: { scrollSpeed: 1500 } });
    await loading;
    expect(test.getSettings().scrollSpeed).toBe(800);
    await test.sync.setUser({ id: 'B' });
    test.change({ scrollSpeed: 900 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(test.load).toHaveBeenCalledTimes(1);
    expect(test.save).not.toHaveBeenCalled();
  });

  it('900 저장 중 1000→1100 변경을 flush하면 먼저 저장이 끝난 뒤 최신 1100만 순서대로 저장한다', async () => {
    const test = setupSync();
    await test.sync.setUser({ id: 'A' });
    const pending = deferred<boolean>();
    test.save.mockReturnValueOnce(pending.promise);
    test.change({ scrollSpeed: 900 });
    await vi.advanceTimersByTimeAsync(500);
    test.change({ scrollSpeed: 1000 });
    await vi.advanceTimersByTimeAsync(500);
    test.change({ scrollSpeed: 1100 });
    test.sync.flush();
    expect(test.save).toHaveBeenCalledTimes(1);
    pending.resolve(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(test.save.mock.calls.map(([, settings]) => settings.scrollSpeed)).toEqual([900, 1100]);
    test.sync.dispose();
  });

  it('900 저장 대기 중 100ms에 flush하면 즉시 한 번 저장하고 남은 500ms 타이머는 취소한다', async () => {
    const test = setupSync();
    await test.sync.setUser({ id: 'A' });
    test.change({ scrollSpeed: 900 });
    await vi.advanceTimersByTimeAsync(100);
    test.sync.flush();
    expect(test.save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(test.save).toHaveBeenCalledTimes(1);
    test.sync.dispose();
  });

  it.each<LoadAccountSettingsResult>([
    { status: 'found', settings: { scrollSpeed: 1500 } },
    { status: 'notFound' }, { status: 'failed' },
  ])('A→B 전환 후 A의 늦은 %j 응답은 B의 1200을 바꾸거나 업로드·안내하지 않는다', async result => {
    const test = setupSync();
    const pending = deferred<LoadAccountSettingsResult>();
    test.load.mockReturnValueOnce(pending.promise);
    const loadingA = test.sync.setUser({ id: 'A' });
    await test.sync.setUser({ id: 'B' });
    pending.resolve(result);
    await loadingA;
    expect(test.getSettings().scrollSpeed).toBe(1200);
    expect(test.load.mock.calls[0][1].aborted).toBe(true);
    expect(test.save).not.toHaveBeenCalled();
    expect(test.notice).not.toHaveBeenCalled();
    test.sync.dispose();
  });

  it('불러오기 성공 후 기기 전용 5개만 변경하면 1000ms 뒤에도 저장은 0회다', async () => {
    const test = setupSync();
    await test.sync.setUser({ id: 'A' });
    test.change({ inputOffsetMs: -20, visualOffsetMs: 40, masterVolume: 0.2,
      isFirstLaunch: false, debugMode: true });
    await vi.advanceTimersByTimeAsync(1000);
    expect(test.save).not.toHaveBeenCalled();
    test.sync.dispose();
  });

  it('scrollSpeed=900 저장이 실패하면 저장 실패를 안내하고 로컬 900을 유지한다', async () => {
    const test = setupSync();
    await test.sync.setUser({ id: 'A' });
    test.save.mockResolvedValue(false);
    test.change({ scrollSpeed: 900 });
    await vi.advanceTimersByTimeAsync(500);
    expect(test.notice).toHaveBeenCalledWith(ACCOUNT_SETTINGS_SAVE_FAILURE_MESSAGE);
    expect(test.getSettings().scrollSpeed).toBe(900);
    test.sync.dispose();
  });

  it('불러오기 성공 후 900→1000으로 300ms 간격 변경하면 마지막 변경 500ms 뒤 1000을 한 번 저장한다', async () => {
    const test = setupSync();
    await test.sync.setUser({ id: 'A' });
    test.change({ scrollSpeed: 900 });
    expect(test.getSettings().scrollSpeed).toBe(900);
    await vi.advanceTimersByTimeAsync(300);
    test.change({ scrollSpeed: 1000 });
    await vi.advanceTimersByTimeAsync(499);
    expect(test.save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(test.save).toHaveBeenCalledTimes(1);
    expect(test.save).toHaveBeenCalledWith('A', selectAccountSettings(test.getSettings()), expect.any(AbortSignal));
    expect(test.save.mock.calls[0][1].scrollSpeed).toBe(1000);
    test.sync.dispose();
  });

  it('A 불러오기가 실패하면 로컬 800을 유지하고 안내하며 이후 900으로 바꿔도 업로드하지 않는다', async () => {
    const test = setupSync();
    test.load.mockResolvedValue({ status: 'failed' });
    await test.sync.setUser({ id: 'A' });
    expect(test.getSettings().scrollSpeed).toBe(800);
    expect(test.notice).toHaveBeenCalledWith(ACCOUNT_SETTINGS_LOAD_FAILURE_MESSAGE);
    test.change({ scrollSpeed: 900 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(test.save).not.toHaveBeenCalled();
    expect(test.getSettings().scrollSpeed).toBe(900);
    test.sync.dispose();
  });

  it('A의 서버 행이 없다고 확인하면 로컬 scrollSpeed=900과 계정 설정 13개만 업로드한다', async () => {
    const test = setupSync();
    test.load.mockResolvedValue({ status: 'notFound' });
    test.change({ scrollSpeed: 900, masterVolume: 0.3 });
    await test.sync.setUser({ id: 'A' });
    expect(test.insertIfAbsent).toHaveBeenCalledTimes(1);
    expect(test.insertIfAbsent).toHaveBeenCalledWith('A', selectAccountSettings(test.getSettings()), expect.any(AbortSignal));
    expect(test.insertIfAbsent.mock.calls[0][1]).toMatchObject({ scrollSpeed: 900 });
    expect(Object.keys(test.insertIfAbsent.mock.calls[0][1])).toHaveLength(13);
    expect(test.save).not.toHaveBeenCalled();
    test.change({ scrollSpeed: 1000 });
    await vi.advanceTimersByTimeAsync(500);
    expect(test.save.mock.calls[0][1].scrollSpeed).toBe(1000);
    test.sync.dispose();
  });

  it('A 로그인 시 서버 scrollSpeed=1200을 적용해도 500ms 뒤 서버 저장은 0회다', async () => {
    const test = setupSync();
    await test.sync.setUser({ id: 'A' });
    await vi.advanceTimersByTimeAsync(500);
    expect(test.getSettings().scrollSpeed).toBe(1200);
    expect(test.save).not.toHaveBeenCalled();
    test.sync.dispose();
  });
});

describe('새 브라우저의 최초 실행', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const accountBindings = { lane1: ['KeyA', 'KeyZ'], lane2: ['KeyD', 'KeyF'],
    lane3: ['KeyJ', 'KeyK'], lane4: ['KeyL', 'Semicolon'] };

  it('isFirstLaunch=true인 브라우저가 A의 서버 행에서 lane1=KeyA·KeyZ 바인딩을 적용하면 최초 실행을 끝내고 그 바인딩을 유지하며 저장은 0회다', async () => {
    const test = setupSync();
    test.load.mockResolvedValue({ status: 'found', settings: { keyBindings: accountBindings, isFirstLaunch: true } });
    expect(test.getSettings().isFirstLaunch).toBe(true);
    await test.sync.setUser({ id: 'A' });
    expect(test.getSettings()).toMatchObject({ isFirstLaunch: false, keyBindings: accountBindings });
    await vi.advanceTimersByTimeAsync(500);
    expect(test.save).not.toHaveBeenCalled();
    test.sync.dispose();
  });

  it.each<[string, LoadAccountSettingsResult]>([
    ['서버 행이 없어 로컬을 삽입', { status: 'notFound' }],
    ['불러오기 실패', { status: 'failed' }],
  ])('isFirstLaunch=true인 브라우저에서 A가 %s하면 최초 실행을 유지한다', async (_label, result) => {
    const test = setupSync();
    test.load.mockResolvedValue(result);
    await test.sync.setUser({ id: 'A' });
    expect(test.getSettings().isFirstLaunch).toBe(true);
    test.sync.dispose();
  });
});

describe('미동기화 표시', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('A 불러오기 성공 뒤 scrollSpeed=900 변경을 예약하면 A 표시를 남기고 900 저장 성공 뒤 지운다', async () => {
    const test = setupSync();
    await test.sync.setUser({ id: 'A' });
    expect(test.unsyncedOwner()).toBeNull();
    test.change({ scrollSpeed: 900 });
    expect(test.unsyncedOwner()).toBe('A');
    await vi.advanceTimersByTimeAsync(500);
    expect(test.save.mock.calls.map(([, settings]) => settings.scrollSpeed)).toEqual([900]);
    expect(test.unsyncedOwner()).toBeNull();
    test.sync.dispose();
  });

  it('다른 탭이 A 표시를 지운 뒤 이 탭의 900 저장이 실패하면 A 표시를 다시 남긴다', async () => {
    const test = setupSync();
    await test.sync.setUser({ id: 'A' });
    test.save.mockResolvedValue(false);
    test.change({ scrollSpeed: 900 });
    test.setUnsyncedOwner(null);
    await vi.advanceTimersByTimeAsync(500);
    expect(test.unsyncedOwner()).toBe('A');
    expect(test.notice).toHaveBeenCalledWith(ACCOUNT_SETTINGS_SAVE_FAILURE_MESSAGE);
    test.sync.dispose();
  });

  it('900 저장 중 1000으로 바꾸면 900 저장 성공 뒤에도 A 표시를 유지하고 1000 저장 성공 뒤 지운다', async () => {
    const test = setupSync();
    await test.sync.setUser({ id: 'A' });
    const pending = deferred<boolean>();
    test.save.mockReturnValueOnce(pending.promise);
    test.change({ scrollSpeed: 900 });
    await vi.advanceTimersByTimeAsync(500);
    test.change({ scrollSpeed: 1000 });
    pending.resolve(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(test.unsyncedOwner()).toBe('A');
    await vi.advanceTimersByTimeAsync(500);
    expect(test.save.mock.calls.map(([, settings]) => settings.scrollSpeed)).toEqual([900, 1000]);
    expect(test.unsyncedOwner()).toBeNull();
    test.sync.dispose();
  });

  it('A 표시가 있으면 서버 행 1200을 적용하지 않고 로컬 900과 서버의 모르는 키 futureKey를 바로 저장한 뒤 표시를 지운다', async () => {
    const test = setupSync('A');
    test.change({ scrollSpeed: 900 });
    test.load.mockResolvedValue({ status: 'found', settings: { scrollSpeed: 1200, futureKey: 'keep' } });
    await test.sync.setUser({ id: 'A' });
    await vi.advanceTimersByTimeAsync(0);
    expect(test.getSettings()).toMatchObject({ scrollSpeed: 900, isFirstLaunch: true });
    expect(test.save).toHaveBeenCalledTimes(1);
    expect(test.save.mock.calls[0][1]).toEqual({ ...selectAccountSettings(test.getSettings()), futureKey: 'keep' });
    expect(test.insertIfAbsent).not.toHaveBeenCalled();
    expect(test.unsyncedOwner()).toBeNull();
    expect(test.notice).not.toHaveBeenCalled();
    test.sync.dispose();
  });

  it('A 표시가 있고 서버 행이 없으면 save 없이 insertIfAbsent로 로컬 900을 올리고 표시를 지운다', async () => {
    const test = setupSync('A');
    test.change({ scrollSpeed: 900 });
    test.load.mockResolvedValue({ status: 'notFound' });
    await test.sync.setUser({ id: 'A' });
    expect(test.insertIfAbsent.mock.calls.map(([, settings]) => settings.scrollSpeed)).toEqual([900]);
    expect(test.save).not.toHaveBeenCalled();
    expect(test.unsyncedOwner()).toBeNull();
    test.sync.dispose();
  });

  it('A 표시가 있고 삽입이 conflict이면 재조회한 서버 1600을 적용하지 않고 로컬 900을 저장한다', async () => {
    const test = setupSync('A');
    test.change({ scrollSpeed: 900 });
    test.load.mockResolvedValueOnce({ status: 'notFound' })
      .mockResolvedValueOnce({ status: 'found', settings: { scrollSpeed: 1600 } });
    test.insertIfAbsent.mockResolvedValue('conflict');
    await test.sync.setUser({ id: 'A' });
    await vi.advanceTimersByTimeAsync(0);
    expect(test.getSettings().scrollSpeed).toBe(900);
    expect(test.save.mock.calls.map(([, settings]) => settings.scrollSpeed)).toEqual([900]);
    expect(test.unsyncedOwner()).toBeNull();
    test.sync.dispose();
  });

  it('B 표시가 있을 때 A가 로그인해 서버 1200을 적용하면 B로 업로드하지 않고 B 표시를 지운다', async () => {
    const test = setupSync('B');
    test.change({ scrollSpeed: 900 });
    await test.sync.setUser({ id: 'A' });
    await vi.advanceTimersByTimeAsync(500);
    expect(test.getSettings().scrollSpeed).toBe(1200);
    expect(test.save).not.toHaveBeenCalled();
    expect(test.unsyncedOwner()).toBeNull();
    test.sync.dispose();
  });

  it('서버 1200을 메모리에 반영한 뒤 저장소 쓰기에서 예외가 나도 그 1200을 A의 미동기화 변경으로 표시하지 않아 다음 A 로그인은 서버 값을 적용한다', async () => {
    const test = setupSync();
    test.applySettings.mockImplementationOnce(next => {
      test.commitInMemory(next);
      throw new Error('quota exceeded');
    });
    await test.sync.setUser({ id: 'A' });
    expect(test.notice).toHaveBeenCalledWith(ACCOUNT_SETTINGS_LOAD_FAILURE_MESSAGE);
    expect(test.unsyncedOwner()).toBeNull();
    await test.sync.setUser({ id: 'A' });
    await vi.advanceTimersByTimeAsync(500);
    expect(test.save).not.toHaveBeenCalled();
    test.sync.dispose();
  });

  it('A 로그인으로 서버 1200을 적용하는 변경 자체는 A 표시를 남기지 않는다', async () => {
    const test = setupSync();
    await test.sync.setUser({ id: 'A' });
    expect(test.getSettings().scrollSpeed).toBe(1200);
    expect(test.unsyncedOwner()).toBeNull();
    test.sync.dispose();
  });

  it('B 표시가 있을 때 A의 900 변경을 예약하면 한 칸의 표시가 A로 바뀐다', async () => {
    const test = setupSync();
    await test.sync.setUser({ id: 'A' });
    test.setUnsyncedOwner('B');
    test.change({ scrollSpeed: 900 });
    expect(test.unsyncedOwner()).toBe('A');
    test.sync.dispose();
  });

  it('A의 900 저장 중 다른 탭이 표시를 B로 바꾸면 A 저장 성공 뒤에도 B 표시를 지우지 않는다', async () => {
    const test = setupSync();
    await test.sync.setUser({ id: 'A' });
    const pending = deferred<boolean>();
    test.save.mockReturnValueOnce(pending.promise);
    test.change({ scrollSpeed: 900 });
    await vi.advanceTimersByTimeAsync(500);
    test.setUnsyncedOwner('B');
    pending.resolve(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(test.unsyncedOwner()).toBe('B');
    test.sync.dispose();
  });

  it('A 저장 실패로 A 표시가 남은 뒤 B가 로그인해 서버 1300을 적용하면 표시를 지우고, 다시 A로 로그인하면 서버 1200을 적용하며 A 계정에 B 설정을 올리지 않는다', async () => {
    const test = setupSync();
    const serverByUser: Record<string, { scrollSpeed: number }> = { A: { scrollSpeed: 1200 }, B: { scrollSpeed: 1300 } };
    test.load.mockImplementation(async userId => ({ status: 'found', settings: serverByUser[userId] }));
    await test.sync.setUser({ id: 'A' });
    test.save.mockResolvedValueOnce(false);
    test.change({ scrollSpeed: 900 });
    await vi.advanceTimersByTimeAsync(500);
    expect(test.unsyncedOwner()).toBe('A');
    await test.sync.setUser(null);
    await test.sync.setUser({ id: 'B' });
    expect(test.getSettings().scrollSpeed).toBe(1300);
    expect(test.unsyncedOwner()).toBeNull();
    await test.sync.setUser(null);
    await test.sync.setUser({ id: 'A' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(test.getSettings().scrollSpeed).toBe(1200);
    expect(test.save.mock.calls.map(([id, settings]) => [id, settings.scrollSpeed])).toEqual([['A', 900]]);
    expect(test.insertIfAbsent).not.toHaveBeenCalled();
    test.sync.dispose();
  });

  it('A 표시가 있어 로컬 900을 올리는 저장이 실패하면 저장 실패를 안내하고 표시를 유지하며 이후 1000 변경도 저장한다', async () => {
    const test = setupSync('A');
    test.change({ scrollSpeed: 900 });
    test.save.mockResolvedValueOnce(false);
    await test.sync.setUser({ id: 'A' });
    await vi.advanceTimersByTimeAsync(0);
    expect(test.getSettings().scrollSpeed).toBe(900);
    expect(test.notice).toHaveBeenCalledWith(ACCOUNT_SETTINGS_SAVE_FAILURE_MESSAGE);
    expect(test.unsyncedOwner()).toBe('A');
    test.change({ scrollSpeed: 1000 });
    await vi.advanceTimersByTimeAsync(500);
    expect(test.save.mock.calls.map(([, settings]) => settings.scrollSpeed)).toEqual([900, 1000]);
    expect(test.unsyncedOwner()).toBeNull();
    test.sync.dispose();
  });

  it('A 표시가 있어도 불러오기가 실패하면 업로드하지 않고 표시를 유지한다', async () => {
    const test = setupSync('A');
    test.load.mockResolvedValue({ status: 'failed' });
    await test.sync.setUser({ id: 'A' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(test.save).not.toHaveBeenCalled();
    expect(test.insertIfAbsent).not.toHaveBeenCalled();
    expect(test.unsyncedOwner()).toBe('A');
    test.sync.dispose();
  });

  it('A의 900 저장 대기 중 로그아웃하면 대기 저장을 버리고 표시를 남겨 다음 A 로그인에서 서버 1200 대신 로컬 900을 저장한다', async () => {
    const test = setupSync();
    await test.sync.setUser({ id: 'A' });
    test.change({ scrollSpeed: 900 });
    await test.sync.setUser(null);
    await vi.advanceTimersByTimeAsync(1000);
    expect(test.save).not.toHaveBeenCalled();
    expect(test.unsyncedOwner()).toBe('A');
    await test.sync.setUser({ id: 'A' });
    await vi.advanceTimersByTimeAsync(0);
    expect(test.getSettings().scrollSpeed).toBe(900);
    expect(test.save.mock.calls.map(([id, settings]) => [id, settings.scrollSpeed])).toEqual([['A', 900]]);
    expect(test.unsyncedOwner()).toBeNull();
    test.sync.dispose();
  });
});

describe('서버의 모르는 키 보존', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('서버 행에 모르는 futureKey와 기기 전용 inputOffsetMs=99가 있으면 900 저장에 futureKey만 함께 보내고 scrollSpeed는 로컬 900이 우선한다', async () => {
    const test = setupSync();
    test.load.mockResolvedValue({ status: 'found',
      settings: { scrollSpeed: 1200, futureKey: { mode: 'x' }, inputOffsetMs: 99 } });
    await test.sync.setUser({ id: 'A' });
    test.change({ scrollSpeed: 900 });
    await vi.advanceTimersByTimeAsync(500);
    expect(test.save.mock.calls[0][1]).toEqual({ ...selectAccountSettings(test.getSettings()), futureKey: { mode: 'x' } });
    expect(test.save.mock.calls[0][1].scrollSpeed).toBe(900);
    test.sync.dispose();
  });

  it('A 서버 행의 futureKey를 불러온 뒤 B로 전환하면 B의 900 저장에는 A의 futureKey를 보내지 않는다', async () => {
    const test = setupSync();
    test.load.mockResolvedValueOnce({ status: 'found', settings: { futureKey: 'A-only' } });
    await test.sync.setUser({ id: 'A' });
    await test.sync.setUser({ id: 'B' });
    test.change({ scrollSpeed: 900 });
    await vi.advanceTimersByTimeAsync(500);
    expect(test.save.mock.calls[0][0]).toBe('B');
    expect(test.save.mock.calls[0][1]).not.toHaveProperty('futureKey');
    test.sync.dispose();
  });
});

describe('불러오기 실패 안내 반복', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('A 불러오기가 SIGNED_IN마다 3번 연속 실패하면 불러오기 실패 안내는 처음 1번만 한다', async () => {
    const test = setupSync();
    test.load.mockResolvedValue({ status: 'failed' });
    for (let attempt = 0; attempt < 3; attempt++) await test.sync.setUser({ id: 'A' });
    expect(test.load).toHaveBeenCalledTimes(3);
    expect(test.notice).toHaveBeenCalledTimes(1);
    expect(test.notice).toHaveBeenCalledWith(ACCOUNT_SETTINGS_LOAD_FAILURE_MESSAGE);
    test.sync.dispose();
  });

  it('A 실패 안내 뒤 로그아웃하고 다시 A로 로그인해 실패하면 다시 안내한다', async () => {
    const test = setupSync();
    test.load.mockResolvedValue({ status: 'failed' });
    await test.sync.setUser({ id: 'A' });
    await test.sync.setUser(null);
    await test.sync.setUser({ id: 'A' });
    expect(test.notice).toHaveBeenCalledTimes(2);
    test.sync.dispose();
  });

  it('A 실패 안내 뒤 B로 전환해 실패하면 B에도 1번 안내한다', async () => {
    const test = setupSync();
    test.load.mockResolvedValue({ status: 'failed' });
    await test.sync.setUser({ id: 'A' });
    await test.sync.setUser({ id: 'B' });
    await test.sync.setUser({ id: 'B' });
    expect(test.notice).toHaveBeenCalledTimes(2);
    test.sync.dispose();
  });
});

describe('로그인 중 아직 저장하지 못한 변경', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('A 불러오기 중 900으로 바꾸면 A 표시를 남기고 서버 행 1200이 오면 적용하지 않고 900을 저장한다', async () => {
    const test = setupSync();
    const pending = deferred<LoadAccountSettingsResult>();
    test.load.mockReturnValueOnce(pending.promise);
    const loading = test.sync.setUser({ id: 'A' });
    test.change({ scrollSpeed: 900 });
    expect(test.unsyncedOwner()).toBe('A');
    pending.resolve({ status: 'found', settings: { scrollSpeed: 1200 } });
    await loading;
    await vi.advanceTimersByTimeAsync(0);
    expect(test.getSettings().scrollSpeed).toBe(900);
    expect(test.save.mock.calls.map(([, settings]) => settings.scrollSpeed)).toEqual([900]);
    expect(test.unsyncedOwner()).toBeNull();
    test.sync.dispose();
  });

  it('A 불러오기 실패 뒤 900으로 바꾸면 바로 올리지 않고 A 표시를 남겨 다음 A 로그인 성공에서 서버 1200 대신 900을 저장한다', async () => {
    const test = setupSync();
    test.load.mockResolvedValueOnce({ status: 'failed' });
    await test.sync.setUser({ id: 'A' });
    test.change({ scrollSpeed: 900 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(test.save).not.toHaveBeenCalled();
    expect(test.unsyncedOwner()).toBe('A');
    await test.sync.setUser({ id: 'A' });
    await vi.advanceTimersByTimeAsync(0);
    expect(test.getSettings().scrollSpeed).toBe(900);
    expect(test.save.mock.calls.map(([id, settings]) => [id, settings.scrollSpeed])).toEqual([['A', 900]]);
    expect(test.unsyncedOwner()).toBeNull();
    test.sync.dispose();
  });

  it('A의 서버 행이 없어 로컬 900을 삽입하다 실패하면 A 표시를 남겨 다음 A 로그인에서 서버 1200 대신 900을 저장한다', async () => {
    const test = setupSync();
    test.change({ scrollSpeed: 900 });
    test.load.mockResolvedValueOnce({ status: 'notFound' });
    test.insertIfAbsent.mockResolvedValueOnce('failed');
    await test.sync.setUser({ id: 'A' });
    expect(test.notice).toHaveBeenCalledWith(ACCOUNT_SETTINGS_LOAD_FAILURE_MESSAGE);
    expect(test.unsyncedOwner()).toBe('A');
    await test.sync.setUser({ id: 'A' });
    await vi.advanceTimersByTimeAsync(0);
    expect(test.getSettings().scrollSpeed).toBe(900);
    expect(test.save.mock.calls.map(([id, settings]) => [id, settings.scrollSpeed])).toEqual([['A', 900]]);
    test.sync.dispose();
  });

  it('로그아웃 상태에서 900으로 바꾸면 표시를 남기지 않고 다음 A 로그인은 서버 1200을 적용한다', async () => {
    const test = setupSync();
    test.change({ scrollSpeed: 900 });
    expect(test.unsyncedOwner()).toBeNull();
    await test.sync.setUser({ id: 'A' });
    await vi.advanceTimersByTimeAsync(500);
    expect(test.getSettings().scrollSpeed).toBe(1200);
    expect(test.save).not.toHaveBeenCalled();
    test.sync.dispose();
  });

  it('직전 A가 남긴 표시가 있으면 로그아웃 중 바꾼 1000까지 다음 A 로그인에서 서버 1200 대신 올린다', async () => {
    const test = setupSync();
    await test.sync.setUser({ id: 'A' });
    test.change({ scrollSpeed: 900 });
    await test.sync.setUser(null);
    test.change({ scrollSpeed: 1000 });
    expect(test.unsyncedOwner()).toBe('A');
    await test.sync.setUser({ id: 'A' });
    await vi.advanceTimersByTimeAsync(0);
    expect(test.getSettings().scrollSpeed).toBe(1000);
    expect(test.save.mock.calls.map(([id, settings]) => [id, settings.scrollSpeed])).toEqual([['A', 1000]]);
    test.sync.dispose();
  });
});

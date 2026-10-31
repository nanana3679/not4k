import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '../stores/gameStore';
import { applyAccountSettings, selectAccountSettings, createAccountSettingsSync,
  type AccountSettings, type InsertAccountSettingsResult, type LoadAccountSettingsResult } from './accountSettingsSync';

describe('계정 설정 분리', () => {
  it.each([
    ['lane1 키 16개', Array.from({ length: 16 }, (_, i) => `Test${i}`), true],
    ['lane1 키 17개', Array.from({ length: 17 }, (_, i) => `Test${i}`), false],
    ['키 코드 32자', ['K'.repeat(32), 'KeyA'], true],
    ['키 코드 33자', ['K'.repeat(33), 'KeyA'], false],
  ] as const)('서버 %s는 상한 이내일 때만 keyBindings를 적용한다', (_label, lane1, accepted) => {
    const local = useGameStore.getInitialState().settings;
    const keyBindings = { ...local.keyBindings, lane1: [...lane1] };
    expect(applyAccountSettings(local, { keyBindings, scrollSpeed: 1200 }))
      .toEqual({ ...local, keyBindings: accepted ? keyBindings : local.keyBindings, scrollSpeed: 1200 });
  });
  it.each([64, 65])('서버 skinId %i자는 64자까지 적용하고 초과하면 로컬 skinId를 유지한다', length => {
    const local = useGameStore.getInitialState().settings;
    const skinId = 's'.repeat(length);
    expect(applyAccountSettings(local, { skinId, scrollSpeed: 1200 }))
      .toEqual({ ...local, skinId: length === 64 ? skinId : local.skinId, scrollSpeed: 1200 });
  });
  it.each([
    ['lane1·lane2의 KeyA 중복', ['KeyA', 'KeyS'], ['KeyA', 'KeyD']],
    ['lane1 안의 KeyA 중복', ['KeyA', 'KeyA'], ['KeyD', 'KeyF']],
    ['lane1 키 1개', ['KeyA'], ['KeyD', 'KeyF']],
    ['lane1 키 0개', [], ['KeyD', 'KeyF']],
  ])('서버 %s는 keyBindings 전체를 로컬로 유지하고 scrollSpeed=1200만 적용한다', (_label, lane1, lane2) => {
    const local = useGameStore.getInitialState().settings;
    const keyBindings = { lane1, lane2, lane3: ['KeyJ', 'KeyK'], lane4: ['KeyL', 'Semicolon'] };
    expect(applyAccountSettings(local, { keyBindings, scrollSpeed: 1200 }))
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
    expect(applyAccountSettings(local, {
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
    expect(applyAccountSettings(local, server)).toEqual(local);
  });

  it('레인마다 서로 다른 키 2개와 gearMotion=false만 적용하고 잘못된 scrollSpeed·옛 키는 버린다', () => {
    const local = { ...useGameStore.getInitialState().settings, inputOffsetMs: 1500 };
    const keyBindings = { lane1: ['KeyA', 'KeyS'], lane2: ['KeyD', 'KeyF'],
      lane3: ['KeyJ', 'KeyK'], lane4: ['KeyL', 'Semicolon'] };
    const applied = applyAccountSettings(local, {
      keyBindings, gearMotion: false, scrollSpeed: NaN, frameMotion: true, unknown: 3,
    });
    expect(applied).toEqual({ ...local, keyBindings, gearMotion: false, inputOffsetMs: 1000 });
  });
});

function setupSync() {
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
  const save = vi.fn<(...args: [string, AccountSettings, AbortSignal]) => Promise<boolean>>()
    .mockResolvedValue(true);
  const insertIfAbsent = vi.fn<(...args: [string, AccountSettings, AbortSignal]) => Promise<InsertAccountSettingsResult>>()
    .mockResolvedValue('inserted');
  const notice = vi.fn();
  const sync = createAccountSettingsSync({ store, load, insertIfAbsent, save, notice,
    timers: { setTimeout: (callback, ms) => setTimeout(callback, ms), clearTimeout: id => clearTimeout(id) } });
  return { ...store, load, insertIfAbsent, save, notice, sync,
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

  it('서버 1200 적용 중 저장소 예외가 나면 setUser는 실패 안내 후 종료하고 900 변경을 업로드하지 않는다', async () => {
    const test = setupSync();
    test.applySettings.mockImplementationOnce(() => { throw new Error('quota exceeded'); });
    await expect(test.sync.setUser({ id: 'A' })).resolves.toBeUndefined();
    expect(test.notice).toHaveBeenCalledWith("Couldn't load your account settings. Using this browser's settings.");
    test.change({ scrollSpeed: 900 });
    await vi.advanceTimersByTimeAsync(500);
    expect(test.save).not.toHaveBeenCalled();
    expect(test.insertIfAbsent).not.toHaveBeenCalled();
    await test.sync.setUser({ id: 'A' });
    expect(test.getSettings().scrollSpeed).toBe(1200);
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
    else expect(test.notice).toHaveBeenCalledWith("Couldn't load your account settings. Using this browser's settings.");
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
    '삽입 충돌 뒤 재조회가 %j이면 실패 안내 후 저장하지 않고 다음 로그인에서도 충돌하면 같은 처리를 한다', async reload => {
      const test = setupSync();
      test.load.mockResolvedValueOnce({ status: 'notFound' }).mockResolvedValueOnce(reload)
        .mockResolvedValueOnce({ status: 'notFound' }).mockResolvedValueOnce(reload);
      test.insertIfAbsent.mockResolvedValue('ignored');
      for (const speed of [900, 1000]) {
        await test.sync.setUser({ id: 'A' });
        test.change({ scrollSpeed: speed });
        test.sync.flush();
        await vi.advanceTimersByTimeAsync(1000);
        expect(test.save).not.toHaveBeenCalled();
      }
      expect(test.load).toHaveBeenCalledTimes(4);
      expect(test.insertIfAbsent).toHaveBeenCalledTimes(2);
      expect(test.notice).toHaveBeenCalledTimes(2);
      expect(test.notice).toHaveBeenCalledWith("Couldn't load your account settings. Using this browser's settings.");
      test.sync.dispose();
    },
  );

  it('최초 삽입 오류는 불러오기 실패로 안내하고 재조회·이후 900 변경 업로드를 하지 않는다', async () => {
    const test = setupSync();
    test.load.mockResolvedValue({ status: 'notFound' });
    test.insertIfAbsent.mockResolvedValue('failed');
    await test.sync.setUser({ id: 'A' });
    expect(test.notice).toHaveBeenCalledWith("Couldn't load your account settings. Using this browser's settings.");
    test.change({ scrollSpeed: 900 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(test.load).toHaveBeenCalledTimes(1);
    expect(test.save).not.toHaveBeenCalled();
    test.sync.dispose();
  });

  it.each<InsertAccountSettingsResult>(['inserted', 'ignored', 'failed'])(
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
    test.insertIfAbsent.mockResolvedValue('ignored');
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
    expect(test.notice).toHaveBeenCalledWith("Couldn't save settings to your account. They're kept in this browser.");
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
    expect(test.notice).toHaveBeenCalledWith("Couldn't load your account settings. Using this browser's settings.");
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

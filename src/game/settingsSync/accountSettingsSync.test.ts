import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, PRESET_BINDINGS, useGameStore, type GameSettings } from '../stores/gameStore';
import { mergeAccountSettings, selectAccountSettings, createAccountSettingsSync, parseUnsyncedAccountSettings,
  ACCOUNT_SETTINGS_LOAD_FAILURE_MESSAGE, ACCOUNT_SETTINGS_SAVE_FAILURE_MESSAGE,
  type AccountSettings, type AccountSettingsUpload, type UnsyncedAccountSettings, type InsertAccountSettingsResult, type LoadAccountSettingsResult } from './accountSettingsSync';

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
  it('서버 scrollSpeed=5000·liftPercent=-10은 설정 UI 범위 끝값 2000·0으로 제한해 적용한다', () => {
    const local = useGameStore.getInitialState().settings;
    expect(mergeAccountSettings(local, { scrollSpeed: 5000, liftPercent: -10 }))
      .toEqual({ ...local, scrollSpeed: 2000, liftPercent: 0 });
  });
  it.each([
    ['playSpeed=0.25(슬라이더 최솟값 0.5 미만)', { playSpeed: 0.25 }, { playSpeed: 1 }],
    ['playSpeed=0.5', { playSpeed: 0.5 }, { playSpeed: 0.5 }],
    ['playSpeed=3', { playSpeed: 3 }, { playSpeed: 2 }],
    ['renderHeight=900(선택지 밖)', { renderHeight: 900 }, { renderHeight: 1080 }],
    ['renderHeight=4320(선택지 밖)', { renderHeight: 4320 }, { renderHeight: 1080 }],
    ['renderHeight=720', { renderHeight: 720 }, { renderHeight: 720 }],
  ])('로컬 playSpeed=1·renderHeight=1080에 서버 %s를 병합하면 %j → %j', (_label, server, expected) => {
    const local = useGameStore.getInitialState().settings;
    expect(mergeAccountSettings(local, server)).toEqual({ ...local, ...expected });
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

/** 여러 탭이 함께 쓰는 localStorage 대신 메모리에 `unsyncedAccountSettings` 원문을 둔다. */
function createUnsyncedStorage(initial: UnsyncedAccountSettings = {}) {
  let raw: string | null = Object.keys(initial).length > 0 ? JSON.stringify(initial) : null;
  return {
    read: () => raw,
    write: (value: string | null) => { raw = value; },
    entries: (): Record<string, Record<string, unknown>> => (raw === null ? {} : JSON.parse(raw)),
    replaceRaw: (value: string | null) => { raw = value; },
  };
}

/** 기본은 최초 실행을 이미 끝낸 브라우저다. */
function setupSync({ storage = createUnsyncedStorage(), settings: initial = {} }: {
  storage?: ReturnType<typeof createUnsyncedStorage>; settings?: Partial<GameSettings>;
} = {}) {
  let settings: GameSettings = { ...useGameStore.getInitialState().settings, isFirstLaunch: false, ...initial };
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
  const sync = createAccountSettingsSync({ store, load, insertIfAbsent, save, notice,
    unsyncedStorage: { read: storage.read, write: storage.write },
    timers: { setTimeout: (callback, ms) => setTimeout(callback, ms), clearTimeout: id => clearTimeout(id) } });
  return { ...store, load, insertIfAbsent, save, notice, sync, unsynced: storage,
    // zustand persist처럼 메모리 상태를 바꾸고 구독자에 알린 뒤 저장소 쓰기만 실패하는 경우를 흉내 낸다.
    commitInMemory: (next: typeof settings) => { settings = next; listeners.forEach(listener => listener()); },
    change: (partial: Partial<typeof settings>) => store.applySettings({ ...settings, ...partial }),
    // PresetSetupScreen.handlePreset과 같은 순서로 프리셋을 고르고 최초 실행을 끝낸다.
    pickPreset: (preset: 'numpad' | 'tkl') => {
      store.applySettings({ ...settings, preset, keyBindings: PRESET_BINDINGS[preset] });
      store.applySettings({ ...settings, isFirstLaunch: false });
    } };
}

/** 이 클라이언트가 업로드하는 계정 설정 전체 행. */
function accountRow(overrides: Partial<AccountSettings> = {}): Record<string, unknown> {
  return { ...selectAccountSettings(DEFAULT_SETTINGS), ...overrides };
}

const accountBindings = { lane1: ['KeyA', 'KeyZ'], lane2: ['KeyD', 'KeyF'],
  lane3: ['KeyJ', 'KeyK'], lane4: ['KeyL', 'Semicolon'] };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

describe('계정 설정 동기화 수명', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('서버 1200 적용 중 저장소 예외가 나면 실패 안내 후 900 변경을 바로 업로드하지 않고 다음 A 로그인에서 서버 행 위에 900을 얹어 업로드한다', async () => {
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

  it('A 저장 도중 로그아웃→B 로그인하면 A 요청·대기 저장·늦은 실패 안내를 버리되 A의 1000은 A 기록으로 남겨 다음 A 접속에 업로드한다', async () => {
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
    expect(test.unsynced.entries()).toEqual({ A: { scrollSpeed: 1000 } });
    pending.resolve(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(test.getSettings().scrollSpeed).toBe(1200);
    expect(test.save).toHaveBeenCalledTimes(1);
    expect(test.notice).not.toHaveBeenCalled();
    test.change({ scrollSpeed: 1300 });
    await vi.advanceTimersByTimeAsync(500);
    expect(test.save.mock.calls[1][0]).toBe('B');
    expect(test.save.mock.calls[1][1].scrollSpeed).toBe(1300);
    expect(test.unsynced.entries()).toEqual({ A: { scrollSpeed: 1000 } });
    await test.sync.setUser(null);
    await test.sync.setUser({ id: 'A' });
    await vi.advanceTimersByTimeAsync(0);
    expect(test.save.mock.calls.map(([id, settings]) => [id, settings.scrollSpeed])).toEqual([['A', 900], ['B', 1300], ['A', 1000]]);
    expect(test.unsynced.entries()).toEqual({});
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

  it('isFirstLaunch=true인 브라우저가 A의 서버 행에서 lane1=KeyA·KeyZ 바인딩을 적용하면 최초 실행을 끝내고 그 바인딩을 유지하며 저장은 0회다', async () => {
    const test = setupSync({ settings: { isFirstLaunch: true } });
    test.load.mockResolvedValue({ status: 'found', settings: { keyBindings: accountBindings, isFirstLaunch: true } });
    await test.sync.setUser({ id: 'A' });
    expect(test.getSettings()).toMatchObject({ isFirstLaunch: false, keyBindings: accountBindings });
    await vi.advanceTimersByTimeAsync(500);
    expect(test.save).not.toHaveBeenCalled();
    test.sync.dispose();
  });

  it.each<[string, LoadAccountSettingsResult]>([
    ['서버 행이 없어 로컬을 삽입', { status: 'notFound' }],
    ['불러오기 실패', { status: 'failed' }],
    ['scrollSpeed=1200만 있는 서버 행을 적용', { status: 'found', settings: { scrollSpeed: 1200 } }],
    ['레인 사이 KeyA가 중복된 keyBindings 행을 적용', { status: 'found', settings: { keyBindings:
      { lane1: ['KeyA', 'KeyS'], lane2: ['KeyA', 'KeyD'], lane3: ['KeyJ', 'KeyK'], lane4: ['KeyL', 'Semicolon'] } } }],
  ])('isFirstLaunch=true인 브라우저에서 A가 %s하면 받을 수 있는 서버 keyBindings가 없어 최초 실행을 유지한다', async (_label, result) => {
    const test = setupSync({ settings: { isFirstLaunch: true } });
    test.load.mockResolvedValue(result);
    await test.sync.setUser({ id: 'A' });
    expect(test.getSettings().isFirstLaunch).toBe(true);
    test.sync.dispose();
  });

  it('isFirstLaunch=true인 새 브라우저에서 A 불러오기 중 numpad 프리셋을 고르면 기록하지 않고 서버 행의 사용자 바인딩을 적용하며 업로드하지 않는다', async () => {
    const test = setupSync({ settings: { isFirstLaunch: true } });
    const pending = deferred<LoadAccountSettingsResult>();
    test.load.mockReturnValueOnce(pending.promise);
    const loading = test.sync.setUser({ id: 'A' });
    test.pickPreset('numpad');
    expect(test.unsynced.entries()).toEqual({});
    pending.resolve({ status: 'found', settings: accountRow({ keyBindings: accountBindings }) });
    await loading;
    await vi.advanceTimersByTimeAsync(500);
    expect(test.getSettings()).toMatchObject({ keyBindings: accountBindings, preset: 'tkl', isFirstLaunch: false });
    expect(test.save).not.toHaveBeenCalled();
    test.sync.dispose();
  });

  it('isFirstLaunch=true인 새 브라우저에서 A 불러오기 실패 뒤 numpad 프리셋을 고르면 기록하지 않고 다음 불러오기에서 사용자 바인딩을 적용하며 업로드하지 않는다', async () => {
    const test = setupSync({ settings: { isFirstLaunch: true } });
    test.load.mockResolvedValueOnce({ status: 'failed' })
      .mockResolvedValue({ status: 'found', settings: accountRow({ keyBindings: accountBindings }) });
    await test.sync.setUser({ id: 'A' });
    test.pickPreset('numpad');
    expect(test.unsynced.entries()).toEqual({});
    await test.sync.setUser({ id: 'A' });
    await vi.advanceTimersByTimeAsync(500);
    expect(test.getSettings().keyBindings).toEqual(accountBindings);
    expect(test.save).not.toHaveBeenCalled();
    test.sync.dispose();
  });

  it('isFirstLaunch=true인 브라우저에서 A 불러오기 실패 뒤 preset·keyBindings·isFirstLaunch=false를 한 번에 바꾸는 갱신도 A 항목에 기록하지 않는다', async () => {
    const test = setupSync({ settings: { isFirstLaunch: true } });
    test.load.mockResolvedValue({ status: 'failed' });
    await test.sync.setUser({ id: 'A' });
    test.change({ preset: 'numpad', keyBindings: PRESET_BINDINGS.numpad, isFirstLaunch: false });
    expect(test.unsynced.entries()).toEqual({});
    test.sync.dispose();
  });

  it('isFirstLaunch=true인 새 브라우저에서 A 불러오기 실패 뒤 프리셋을 고르고 scrollSpeed=900으로 바꾸면 다음 불러오기에서 계정의 사용자 바인딩을 유지하고 900만 얹어 업로드한다', async () => {
    const test = setupSync({ settings: { isFirstLaunch: true } });
    const row = accountRow({ keyBindings: accountBindings, scrollSpeed: 1200 });
    test.load.mockResolvedValueOnce({ status: 'failed' }).mockResolvedValue({ status: 'found', settings: row });
    await test.sync.setUser({ id: 'A' });
    test.pickPreset('numpad');
    test.change({ scrollSpeed: 900 });
    expect(test.unsynced.entries()).toEqual({ A: { scrollSpeed: 900 } });
    await test.sync.setUser({ id: 'A' });
    await vi.advanceTimersByTimeAsync(0);
    expect(test.getSettings()).toMatchObject({ keyBindings: accountBindings, scrollSpeed: 900 });
    expect(test.save.mock.calls.map(([id, settings]) => [id, settings])).toEqual([['A', { ...row, scrollSpeed: 900 }]]);
    test.sync.dispose();
  });
});

describe('최초 실행 중 삽입한 계정의 프리셋 선택', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** 삽입·저장한 값을 그대로 돌려주는 서버 행 하나. */
  function serverRowFor(test: ReturnType<typeof setupSync>, initial: Record<string, unknown> | null = null) {
    const server = { row: initial };
    test.load.mockImplementation(async () => (server.row ? { status: 'found', settings: server.row } : { status: 'notFound' }));
    test.insertIfAbsent.mockImplementation(async (_userId, settings) => {
      if (server.row) return 'conflict';
      server.row = { ...settings };
      return 'inserted';
    });
    test.save.mockImplementation(async (_userId, settings) => {
      server.row = { ...settings };
      return true;
    });
    return server;
  }

  it('isFirstLaunch=true인 브라우저의 최초 삽입도 고르지 않은 기본 keyBindings·preset을 포함한 계정 설정 13개를 업로드한다', async () => {
    const test = setupSync({ settings: { isFirstLaunch: true } });
    const server = serverRowFor(test);
    await test.sync.setUser({ id: 'A' });
    expect(server.row).toEqual(selectAccountSettings(DEFAULT_SETTINGS));
    test.sync.dispose();
  });

  it('isFirstLaunch=true로 삽입한 뒤 프리셋을 고르지 않으면 1000ms가 지나도 추가 저장은 0회다', async () => {
    const test = setupSync({ settings: { isFirstLaunch: true } });
    serverRowFor(test);
    await test.sync.setUser({ id: 'A' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(test.save).not.toHaveBeenCalled();
    test.sync.dispose();
  });

  it('isFirstLaunch=true로 최초 삽입하는 중에 numpad를 고르면 삽입은 기본 TKL로 하고 삽입 성공 500ms 뒤 numpad를 저장한다', async () => {
    const test = setupSync({ settings: { isFirstLaunch: true } });
    test.load.mockResolvedValue({ status: 'notFound' });
    const pending = deferred<InsertAccountSettingsResult>();
    test.insertIfAbsent.mockReturnValueOnce(pending.promise);
    const loading = test.sync.setUser({ id: 'A' });
    await vi.advanceTimersByTimeAsync(0);
    test.pickPreset('numpad');
    pending.resolve('inserted');
    await loading;
    expect(test.insertIfAbsent.mock.calls[0][1]).toMatchObject({ preset: 'tkl', keyBindings: PRESET_BINDINGS.tkl });
    await vi.advanceTimersByTimeAsync(500);
    expect(test.save.mock.calls.map(([, settings]) => [settings.preset, settings.keyBindings]))
      .toEqual([['numpad', PRESET_BINDINGS.numpad]]);
    test.sync.dispose();
  });

  it('isFirstLaunch=true로 최초 삽입하는 중에 numpad를 고르고 이어진 저장이 실패하면 기록이 남아 다음 접속에서 TKL 행 위에 numpad를 업로드한다', async () => {
    const test = setupSync({ settings: { isFirstLaunch: true } });
    const server = serverRowFor(test);
    const inserting = deferred<void>();
    test.insertIfAbsent.mockImplementationOnce(async (_userId, settings) => {
      await inserting.promise;
      server.row = { ...settings };
      return 'inserted';
    });
    const loading = test.sync.setUser({ id: 'A' });
    await vi.advanceTimersByTimeAsync(0);
    test.pickPreset('numpad');
    expect(test.unsynced.entries()).toEqual({ A: { preset: 'numpad', keyBindings: PRESET_BINDINGS.numpad } });
    inserting.resolve();
    await loading;
    test.save.mockResolvedValueOnce(false);
    await vi.advanceTimersByTimeAsync(500);
    expect(server.row).toMatchObject({ preset: 'tkl', keyBindings: PRESET_BINDINGS.tkl });
    await test.sync.setUser(null);
    await test.sync.setUser({ id: 'A' });
    await vi.advanceTimersByTimeAsync(0);
    expect(test.getSettings()).toMatchObject({ preset: 'numpad', keyBindings: PRESET_BINDINGS.numpad });
    expect(server.row).toMatchObject({ preset: 'numpad', keyBindings: PRESET_BINDINGS.numpad });
    expect(test.unsynced.entries()).toEqual({});
    test.sync.dispose();
  });

  it('isFirstLaunch=true에서 행 없음으로 최초 삽입이 실패한 뒤 numpad를 고르면 계정 행을 모르는 상태라 기록하지 않는다', async () => {
    const test = setupSync({ settings: { isFirstLaunch: true } });
    test.load.mockResolvedValue({ status: 'notFound' });
    test.insertIfAbsent.mockResolvedValue('failed');
    await test.sync.setUser({ id: 'A' });
    test.pickPreset('numpad');
    expect(test.unsynced.entries()).toEqual({});
    test.sync.dispose();
  });

  it('isFirstLaunch=true에서 삽입이 conflict라 재조회하는 중에 numpad를 고르면 기록하지 않고 재조회한 행의 사용자 바인딩을 적용한다', async () => {
    const test = setupSync({ settings: { isFirstLaunch: true } });
    const reloading = deferred<LoadAccountSettingsResult>();
    test.load.mockResolvedValueOnce({ status: 'notFound' }).mockReturnValueOnce(reloading.promise);
    test.insertIfAbsent.mockResolvedValue('conflict');
    const loading = test.sync.setUser({ id: 'A' });
    await vi.advanceTimersByTimeAsync(0);
    test.pickPreset('numpad');
    expect(test.unsynced.entries()).toEqual({});
    reloading.resolve({ status: 'found', settings: accountRow({ keyBindings: accountBindings }) });
    await loading;
    await vi.advanceTimersByTimeAsync(500);
    expect(test.getSettings().keyBindings).toEqual(accountBindings);
    expect(test.save).not.toHaveBeenCalled();
    test.sync.dispose();
  });

  it('isFirstLaunch=true에서 keyBindings 없는 서버 행 scrollSpeed=1200을 적용한 뒤 numpad를 고르고 저장이 실패하면 기록이 남아 다음 접속에서 업로드한다', async () => {
    const test = setupSync({ settings: { isFirstLaunch: true } });
    const server = serverRowFor(test, { scrollSpeed: 1200 });
    await test.sync.setUser({ id: 'A' });
    expect(test.getSettings().isFirstLaunch).toBe(true);
    test.save.mockResolvedValueOnce(false);
    test.pickPreset('numpad');
    await vi.advanceTimersByTimeAsync(500);
    expect(test.unsynced.entries()).toEqual({ A: { preset: 'numpad', keyBindings: PRESET_BINDINGS.numpad } });
    await test.sync.setUser(null);
    await test.sync.setUser({ id: 'A' });
    await vi.advanceTimersByTimeAsync(0);
    expect(server.row).toMatchObject({ scrollSpeed: 1200, preset: 'numpad', keyBindings: PRESET_BINDINGS.numpad });
    expect(test.unsynced.entries()).toEqual({});
    test.sync.dispose();
  });

  it('최초 실행 중 로그인해 프리셋을 고르기 전에 떠난 계정의 기본 TKL 행을 다른 새 브라우저가 불러오면 프리셋 선택을 건너뛴다(알려진 동작)', async () => {
    const first = setupSync({ settings: { isFirstLaunch: true } });
    const server = serverRowFor(first);
    await first.sync.setUser({ id: 'A' });
    first.sync.dispose();
    const second = setupSync({ settings: { isFirstLaunch: true } });
    serverRowFor(second, server.row);
    await second.sync.setUser({ id: 'A' });
    expect(second.getSettings()).toMatchObject({ isFirstLaunch: false, keyBindings: PRESET_BINDINGS.tkl });
    second.sync.dispose();
  });

  it('행 없음으로 삽입해 준비된 뒤 numpad를 고르고 저장이 실패하면 기록이 남아 다음 접속에서 numpad를 유지하고 업로드한다', async () => {
    const test = setupSync({ settings: { isFirstLaunch: true } });
    const server = serverRowFor(test);
    await test.sync.setUser({ id: 'A' });
    test.save.mockResolvedValueOnce(false);
    test.pickPreset('numpad');
    await vi.advanceTimersByTimeAsync(500);
    expect(test.unsynced.entries()).toEqual({ A: { preset: 'numpad', keyBindings: PRESET_BINDINGS.numpad } });
    await test.sync.setUser(null);
    await test.sync.setUser({ id: 'A' });
    await vi.advanceTimersByTimeAsync(0);
    expect(test.getSettings()).toMatchObject({ preset: 'numpad', keyBindings: PRESET_BINDINGS.numpad });
    expect(server.row).toMatchObject({ preset: 'numpad', keyBindings: PRESET_BINDINGS.numpad });
    expect(test.unsynced.entries()).toEqual({});
    test.sync.dispose();
  });

  it('행 없음으로 삽입해 준비된 뒤 numpad를 고르고 500ms 안에 로그아웃하면 기록이 남아 다음 접속에서 numpad를 업로드한다', async () => {
    const test = setupSync({ settings: { isFirstLaunch: true } });
    const server = serverRowFor(test);
    await test.sync.setUser({ id: 'A' });
    test.pickPreset('numpad');
    await test.sync.setUser(null);
    await vi.advanceTimersByTimeAsync(1000);
    expect(test.save).not.toHaveBeenCalled();
    await test.sync.setUser({ id: 'A' });
    await vi.advanceTimersByTimeAsync(0);
    expect(server.row).toMatchObject({ preset: 'numpad', keyBindings: PRESET_BINDINGS.numpad });
    expect(test.unsynced.entries()).toEqual({});
    test.sync.dispose();
  });
});

describe('unsyncedAccountSettings 기록과 업로드', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it.each([['JSON이 아닌 문자열', 'not json'], ['배열', '[]'], ['숫자', '42'], ['null', 'null'], ['A 항목이 문자열', '{"A":"x"}']])(
    'unsyncedAccountSettings 저장값이 %s이면 빈 기록으로 읽는다', (_label, raw) => {
      expect(parseUnsyncedAccountSettings(raw)).toEqual({});
    },
  );

  it('A 항목의 모르는 키 futureKey·기기 전용 inputOffsetMs=5·문자열 scrollSpeed는 버리고 liftPercent=30만 읽는다', () => {
    expect(parseUnsyncedAccountSettings(JSON.stringify({
      A: { futureKey: 1, inputOffsetMs: 5, scrollSpeed: '900', liftPercent: 30 },
    }))).toEqual({ A: { liftPercent: 30 } });
  });

  it('unsyncedAccountSettings 저장값이 깨져 있으면 A 로그인은 서버 1200을 적용하고 업로드하지 않는다', async () => {
    const storage = createUnsyncedStorage();
    storage.replaceRaw('{broken');
    const test = setupSync({ storage });
    await test.sync.setUser({ id: 'A' });
    await vi.advanceTimersByTimeAsync(500);
    expect(test.getSettings().scrollSpeed).toBe(1200);
    expect(test.save).not.toHaveBeenCalled();
    test.sync.dispose();
  });

  it('A 불러오기 성공 뒤 scrollSpeed=900으로 바꾸면 A 항목에 scrollSpeed=900을 기록하고 900 저장 성공 뒤 지운다', async () => {
    const test = setupSync();
    await test.sync.setUser({ id: 'A' });
    expect(test.unsynced.entries()).toEqual({});
    test.change({ scrollSpeed: 900 });
    expect(test.unsynced.entries()).toEqual({ A: { scrollSpeed: 900 } });
    await vi.advanceTimersByTimeAsync(500);
    expect(test.save.mock.calls.map(([, settings]) => settings.scrollSpeed)).toEqual([900]);
    expect(test.unsynced.entries()).toEqual({});
    test.sync.dispose();
  });

  it('900 저장 중 같은 탭에서 1000으로 바꾸면 900 저장 성공 뒤에도 A 항목의 scrollSpeed=1000을 남기고 1000 저장 성공 뒤 지운다', async () => {
    const test = setupSync();
    await test.sync.setUser({ id: 'A' });
    const pending = deferred<boolean>();
    test.save.mockReturnValueOnce(pending.promise);
    test.change({ scrollSpeed: 900 });
    await vi.advanceTimersByTimeAsync(500);
    test.change({ scrollSpeed: 1000 });
    pending.resolve(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(test.unsynced.entries()).toEqual({ A: { scrollSpeed: 1000 } });
    await vi.advanceTimersByTimeAsync(500);
    expect(test.save.mock.calls.map(([, settings]) => settings.scrollSpeed)).toEqual([900, 1000]);
    expect(test.unsynced.entries()).toEqual({});
    test.sync.dispose();
  });

  it('이 탭의 900 저장 중 다른 탭이 A 항목에 scrollSpeed=1000·liftPercent=30을 기록하면 900 저장 성공 뒤에도 두 값을 지우지 않는다', async () => {
    const test = setupSync();
    await test.sync.setUser({ id: 'A' });
    const pending = deferred<boolean>();
    test.save.mockReturnValueOnce(pending.promise);
    test.change({ scrollSpeed: 900 });
    await vi.advanceTimersByTimeAsync(500);
    test.unsynced.replaceRaw(JSON.stringify({ A: { scrollSpeed: 1000, liftPercent: 30 } }));
    pending.resolve(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(test.unsynced.entries()).toEqual({ A: { scrollSpeed: 1000, liftPercent: 30 } });
    test.sync.dispose();
  });

  it('A 항목에 scrollSpeed=900이 있으면 서버 행 1200·liftPercent=10 위에 900만 얹어 적용하고 futureKey와 함께 바로 업로드한 뒤 A 항목만 지우고 B 항목은 둔다', async () => {
    const test = setupSync({ storage: createUnsyncedStorage({ A: { scrollSpeed: 900 }, B: { scrollSpeed: 900 } }),
      settings: { liftPercent: 70 } });
    const row = accountRow({ scrollSpeed: 1200, liftPercent: 10 });
    test.load.mockResolvedValue({ status: 'found', settings: { ...row, futureKey: 'keep' } });
    await test.sync.setUser({ id: 'A' });
    await vi.advanceTimersByTimeAsync(0);
    expect(test.getSettings()).toMatchObject({ scrollSpeed: 900, liftPercent: 10 });
    expect(test.save.mock.calls.map(([id, settings]) => [id, settings]))
      .toEqual([['A', { ...row, scrollSpeed: 900, futureKey: 'keep' }]]);
    expect(test.insertIfAbsent).not.toHaveBeenCalled();
    expect(test.unsynced.entries()).toEqual({ B: { scrollSpeed: 900 } });
    expect(test.notice).not.toHaveBeenCalled();
    test.sync.dispose();
  });

  it('keyBindings 저장 중 다른 탭이 같은 바인딩을 lane4→lane1 순서로 다시 기록해도 저장 성공 때 같은 값으로 보고 지운다', async () => {
    const test = setupSync();
    await test.sync.setUser({ id: 'A' });
    const pending = deferred<boolean>();
    test.save.mockReturnValueOnce(pending.promise);
    test.change({ keyBindings: accountBindings });
    await vi.advanceTimersByTimeAsync(500);
    const { lane1, lane2, lane3, lane4 } = accountBindings;
    test.unsynced.replaceRaw(JSON.stringify({ A: { keyBindings: { lane4, lane3, lane2, lane1 } } }));
    pending.resolve(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(test.unsynced.entries()).toEqual({});
    test.sync.dispose();
  });

  it('A 항목에 scrollSpeed=900이 있고 서버 행이 없으면 save 없이 insertIfAbsent로 900을 얹은 로컬을 업로드하고 항목을 지운다', async () => {
    const test = setupSync({ storage: createUnsyncedStorage({ A: { scrollSpeed: 900 } }) });
    test.load.mockResolvedValue({ status: 'notFound' });
    await test.sync.setUser({ id: 'A' });
    expect(test.getSettings().scrollSpeed).toBe(900);
    expect(test.insertIfAbsent.mock.calls.map(([, settings]) => settings.scrollSpeed)).toEqual([900]);
    expect(test.save).not.toHaveBeenCalled();
    expect(test.unsynced.entries()).toEqual({});
    test.sync.dispose();
  });

  it('A 항목에 scrollSpeed=900이 있고 삽입이 conflict이면 재조회한 서버 행 1600·liftPercent=10 위에 900을 얹어 저장한다', async () => {
    const test = setupSync({ storage: createUnsyncedStorage({ A: { scrollSpeed: 900 } }) });
    const row = accountRow({ scrollSpeed: 1600, liftPercent: 10 });
    test.load.mockResolvedValueOnce({ status: 'notFound' }).mockResolvedValueOnce({ status: 'found', settings: row });
    test.insertIfAbsent.mockResolvedValue('conflict');
    await test.sync.setUser({ id: 'A' });
    await vi.advanceTimersByTimeAsync(0);
    expect(test.getSettings()).toMatchObject({ scrollSpeed: 900, liftPercent: 10 });
    expect(test.save.mock.calls.map(([, settings]) => settings)).toEqual([{ ...row, scrollSpeed: 900 }]);
    expect(test.unsynced.entries()).toEqual({});
    test.sync.dispose();
  });

  it('A 항목으로 업로드한 저장이 실패하면 저장 실패를 안내하고 항목을 유지하며 이후 1000 변경을 저장하면 항목을 지운다', async () => {
    const test = setupSync({ storage: createUnsyncedStorage({ A: { scrollSpeed: 900 } }) });
    test.save.mockResolvedValueOnce(false);
    await test.sync.setUser({ id: 'A' });
    await vi.advanceTimersByTimeAsync(0);
    expect(test.notice).toHaveBeenCalledWith(ACCOUNT_SETTINGS_SAVE_FAILURE_MESSAGE);
    expect(test.unsynced.entries()).toEqual({ A: { scrollSpeed: 900 } });
    test.change({ scrollSpeed: 1000 });
    await vi.advanceTimersByTimeAsync(500);
    expect(test.save.mock.calls.map(([, settings]) => settings.scrollSpeed)).toEqual([900, 1000]);
    expect(test.unsynced.entries()).toEqual({});
    test.sync.dispose();
  });

  it('A 항목이 있어도 불러오기가 실패하면 업로드하지 않고 항목을 유지한다', async () => {
    const test = setupSync({ storage: createUnsyncedStorage({ A: { scrollSpeed: 900 } }) });
    test.load.mockResolvedValue({ status: 'failed' });
    await test.sync.setUser({ id: 'A' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(test.save).not.toHaveBeenCalled();
    expect(test.insertIfAbsent).not.toHaveBeenCalled();
    expect(test.unsynced.entries()).toEqual({ A: { scrollSpeed: 900 } });
    test.sync.dispose();
  });

  it('A의 900 저장 대기 중 로그아웃하면 대기 저장을 버리고 다음 A 로그인에서 서버 행 1200·liftPercent=10 위에 900을 얹어 업로드한다', async () => {
    const test = setupSync();
    const row = accountRow({ scrollSpeed: 1200, liftPercent: 10 });
    test.load.mockResolvedValue({ status: 'found', settings: row });
    await test.sync.setUser({ id: 'A' });
    test.change({ scrollSpeed: 900 });
    await test.sync.setUser(null);
    await vi.advanceTimersByTimeAsync(1000);
    expect(test.save).not.toHaveBeenCalled();
    expect(test.unsynced.entries()).toEqual({ A: { scrollSpeed: 900 } });
    await test.sync.setUser({ id: 'A' });
    await vi.advanceTimersByTimeAsync(0);
    expect(test.save.mock.calls.map(([id, settings]) => [id, settings])).toEqual([['A', { ...row, scrollSpeed: 900 }]]);
    expect(test.unsynced.entries()).toEqual({});
    test.sync.dispose();
  });

  it('B 항목 scrollSpeed=1300이 있어도 A 로그인은 서버 1200을 적용하고 B 항목을 그대로 두며 B 값을 업로드하지 않는다', async () => {
    const test = setupSync({ storage: createUnsyncedStorage({ B: { scrollSpeed: 1300 } }) });
    await test.sync.setUser({ id: 'A' });
    await vi.advanceTimersByTimeAsync(500);
    expect(test.getSettings().scrollSpeed).toBe(1200);
    expect(test.save).not.toHaveBeenCalled();
    expect(test.unsynced.entries()).toEqual({ B: { scrollSpeed: 1300 } });
    test.sync.dispose();
  });

  it('서버 1200을 메모리에 반영한 뒤 저장소 쓰기에서 예외가 나도 그 1200을 A 항목에 기록하지 않아 다음 A 로그인은 서버 값을 적용한다', async () => {
    const test = setupSync();
    test.applySettings.mockImplementationOnce(next => {
      test.commitInMemory(next);
      throw new Error('quota exceeded');
    });
    await test.sync.setUser({ id: 'A' });
    expect(test.notice).toHaveBeenCalledWith(ACCOUNT_SETTINGS_LOAD_FAILURE_MESSAGE);
    expect(test.unsynced.entries()).toEqual({});
    await test.sync.setUser({ id: 'A' });
    await vi.advanceTimersByTimeAsync(500);
    expect(test.save).not.toHaveBeenCalled();
    test.sync.dispose();
  });

  it('A 로그인으로 서버 1200을 적용하는 변경 자체는 A 항목에 기록하지 않는다', async () => {
    const test = setupSync();
    await test.sync.setUser({ id: 'A' });
    expect(test.getSettings().scrollSpeed).toBe(1200);
    expect(test.unsynced.entries()).toEqual({});
    test.sync.dispose();
  });

  it('A 저장 실패로 A 항목에 900이 남은 뒤 B 서버 행을 적용하고 다시 A로 로그인하면 A 서버 행 위에 A의 900만 얹어 업로드하고 B 값은 업로드하지 않는다', async () => {
    const test = setupSync();
    const rowA = accountRow({ scrollSpeed: 1200, liftPercent: 5 });
    const rowB = accountRow({ scrollSpeed: 1300, liftPercent: 20, gearMotion: false, skinId: 'crystal' });
    test.load.mockImplementation(async userId => ({ status: 'found', settings: userId === 'A' ? rowA : rowB }));
    await test.sync.setUser({ id: 'A' });
    test.save.mockResolvedValueOnce(false);
    test.change({ scrollSpeed: 900 });
    await vi.advanceTimersByTimeAsync(500);
    await test.sync.setUser(null);
    await test.sync.setUser({ id: 'B' });
    expect(test.getSettings()).toMatchObject({ scrollSpeed: 1300, liftPercent: 20, gearMotion: false });
    expect(test.unsynced.entries()).toEqual({ A: { scrollSpeed: 900 } });
    await test.sync.setUser(null);
    await test.sync.setUser({ id: 'A' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(test.save.mock.calls.map(([id, settings]) => [id, settings])).toEqual([
      ['A', { ...rowA, scrollSpeed: 900 }], ['A', { ...rowA, scrollSpeed: 900 }],
    ]);
    expect(test.getSettings()).toMatchObject({ scrollSpeed: 900, liftPercent: 5, gearMotion: true, skinId: 'classic' });
    expect(test.unsynced.entries()).toEqual({});
    test.sync.dispose();
  });

  it('A 저장이 실패한 탭 1의 900 기록은 메모리가 오래된 탭 2가 다음 A 불러오기에서 서버 행 위에 얹어 업로드하고 탭 2의 liftPercent=70은 업로드하지 않는다', async () => {
    const storage = createUnsyncedStorage();
    const tab1 = setupSync({ storage });
    const tab2 = setupSync({ storage, settings: { liftPercent: 70 } });
    const row = accountRow({ scrollSpeed: 1200, liftPercent: 10 });
    tab1.load.mockResolvedValue({ status: 'found', settings: row });
    tab2.load.mockResolvedValueOnce({ status: 'failed' }).mockResolvedValue({ status: 'found', settings: row });
    await tab1.sync.setUser({ id: 'A' });
    await tab2.sync.setUser({ id: 'A' });
    tab1.save.mockResolvedValueOnce(false);
    tab1.change({ scrollSpeed: 900 });
    await vi.advanceTimersByTimeAsync(500);
    expect(storage.entries()).toEqual({ A: { scrollSpeed: 900 } });
    await tab2.sync.setUser({ id: 'A' });
    await vi.advanceTimersByTimeAsync(0);
    expect(tab2.save.mock.calls.map(([id, settings]) => [id, settings])).toEqual([['A', { ...row, scrollSpeed: 900 }]]);
    expect(storage.entries()).toEqual({});
    tab1.sync.dispose();
    tab2.sync.dispose();
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

describe('로그인 중 불러오기 성공 전·실패 뒤의 변경', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('A 불러오기 중 900으로 바꾸면 A 항목에 기록하고 서버 행 1200·liftPercent=10이 오면 900만 얹어 업로드한다', async () => {
    const test = setupSync();
    const pending = deferred<LoadAccountSettingsResult>();
    test.load.mockReturnValueOnce(pending.promise);
    const loading = test.sync.setUser({ id: 'A' });
    test.change({ scrollSpeed: 900 });
    expect(test.unsynced.entries()).toEqual({ A: { scrollSpeed: 900 } });
    const row = accountRow({ scrollSpeed: 1200, liftPercent: 10 });
    pending.resolve({ status: 'found', settings: row });
    await loading;
    await vi.advanceTimersByTimeAsync(0);
    expect(test.getSettings()).toMatchObject({ scrollSpeed: 900, liftPercent: 10 });
    expect(test.save.mock.calls.map(([, settings]) => settings)).toEqual([{ ...row, scrollSpeed: 900 }]);
    expect(test.unsynced.entries()).toEqual({});
    test.sync.dispose();
  });

  it('A 불러오기 실패 뒤 900으로 바꾸면 바로 업로드하지 않고 기록해 다음 A 불러오기 성공에서 서버 행 위에 900을 얹어 업로드한다', async () => {
    const test = setupSync();
    test.load.mockResolvedValueOnce({ status: 'failed' });
    await test.sync.setUser({ id: 'A' });
    test.change({ scrollSpeed: 900 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(test.save).not.toHaveBeenCalled();
    expect(test.unsynced.entries()).toEqual({ A: { scrollSpeed: 900 } });
    await test.sync.setUser({ id: 'A' });
    await vi.advanceTimersByTimeAsync(0);
    expect(test.getSettings().scrollSpeed).toBe(900);
    expect(test.save.mock.calls.map(([id, settings]) => [id, settings.scrollSpeed])).toEqual([['A', 900]]);
    expect(test.unsynced.entries()).toEqual({});
    test.sync.dispose();
  });

  it('A의 서버 행이 없어 로컬 900을 삽입하다 실패하면 A 항목에 아무것도 기록하지 않고 다음 A 로그인은 서버 1200을 적용한다', async () => {
    const test = setupSync();
    test.change({ scrollSpeed: 900 });
    test.load.mockResolvedValueOnce({ status: 'notFound' });
    test.insertIfAbsent.mockResolvedValueOnce('failed');
    await test.sync.setUser({ id: 'A' });
    expect(test.notice).toHaveBeenCalledWith(ACCOUNT_SETTINGS_LOAD_FAILURE_MESSAGE);
    expect(test.unsynced.entries()).toEqual({});
    await test.sync.setUser({ id: 'A' });
    await vi.advanceTimersByTimeAsync(500);
    expect(test.getSettings().scrollSpeed).toBe(1200);
    expect(test.save).not.toHaveBeenCalled();
    test.sync.dispose();
  });

  it('로그아웃 상태에서 900으로 바꾸면 기록하지 않고 다음 A 로그인은 서버 1200을 적용한다', async () => {
    const test = setupSync();
    test.change({ scrollSpeed: 900 });
    expect(test.unsynced.entries()).toEqual({});
    await test.sync.setUser({ id: 'A' });
    await vi.advanceTimersByTimeAsync(500);
    expect(test.getSettings().scrollSpeed).toBe(1200);
    expect(test.save).not.toHaveBeenCalled();
    test.sync.dispose();
  });

  it('A 항목에 900이 남은 채 로그아웃 중 scrollSpeed=1000·liftPercent=50으로 바꿔도 다음 A 로그인은 서버 행 위에 기록된 900만 얹어 업로드하고 로그아웃 중 값은 업로드하지 않는다', async () => {
    const test = setupSync();
    await test.sync.setUser({ id: 'A' });
    test.change({ scrollSpeed: 900 });
    await test.sync.setUser(null);
    test.change({ scrollSpeed: 1000, liftPercent: 50 });
    expect(test.unsynced.entries()).toEqual({ A: { scrollSpeed: 900 } });
    const row = accountRow({ scrollSpeed: 1200, liftPercent: 10 });
    test.load.mockResolvedValue({ status: 'found', settings: row });
    await test.sync.setUser({ id: 'A' });
    await vi.advanceTimersByTimeAsync(0);
    expect(test.getSettings()).toMatchObject({ scrollSpeed: 900, liftPercent: 10 });
    expect(test.save.mock.calls.map(([id, settings]) => [id, settings])).toEqual([['A', { ...row, scrollSpeed: 900 }]]);
    test.sync.dispose();
  });
});

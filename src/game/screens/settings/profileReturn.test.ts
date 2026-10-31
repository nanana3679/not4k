import { afterEach, expect, it, vi } from 'vitest';
import { useGameStore } from '../../stores/gameStore';
import { signInFromProfile } from './profileAuth';
import { bindProfileReturnRestoration, createProfileReturnRestorer } from './profileReturn';
import appSource from '../../App.tsx?raw';

vi.hoisted(() => {
  vi.stubGlobal('window', { localStorage: { getItem: () => null, setItem: () => {} } });
});

const initialize = vi.hoisted(() => vi.fn(async () => ({ error: null as Error | null })));
vi.mock('../../../supabase/client', () => ({ supabase: { auth: { initialize } } }));

function mockBrowser(href = 'https://example.test/game') {
  let marker: string | null = null;
  const history = { state: { router: 1 }, replaceState: vi.fn() };
  const events = new EventTarget();
  vi.stubGlobal('window', {
    sessionStorage: {
      getItem: () => marker,
      setItem: (_key: string, value: string) => { marker = value; },
      removeItem: () => { marker = null; },
    },
    location: { href },
    history,
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
  });
  return history;
}

afterEach(() => {
  initialize.mockClear();
  useGameStore.setState(useGameStore.getInitialState(), true);
  vi.unstubAllGlobals();
});

it('첫 실행이 아닌 앱 시작에 복귀 의도가 있으면 songSelect·Settings·Profile을 열고 재실행해도 다시 열지 않는다', async () => {
  mockBrowser();
  useGameStore.getState().completeFirstLaunch();
  await signInFromProfile(async () => {});
  const restore = createProfileReturnRestorer();
  await restore(false);
  expect(useGameStore.getState()).toMatchObject({
    screen: 'songSelect', settingsOpen: true, settingsInitialSection: 'profile', profileAuthError: null,
  });
  useGameStore.getState().setSettingsOpen(false);
  await restore(false);
  await createProfileReturnRestorer()(false);
  expect(useGameStore.getState().settingsOpen).toBe(false);
});

it('앱 시작에 server_error가 있으면 Profile에 Provider unavailable을 남기고 history에서 오류만 제거한다', async () => {
  const history = mockBrowser('https://example.test/game?keep=1&error=server_error#error_description=Provider+unavailable');
  useGameStore.getState().completeFirstLaunch();
  await signInFromProfile(async () => {});
  await createProfileReturnRestorer()(false);
  expect(useGameStore.getState().profileAuthError).toBe('Provider unavailable');
  expect(history.replaceState).toHaveBeenCalledWith({ router: 1 }, '', 'https://example.test/game?keep=1');
});

it('첫 실행인 데스크톱 복귀는 presetSetup을 거친 뒤 첫 설정 완료 시 Profile을 연다', async () => {
  mockBrowser();
  await signInFromProfile(async () => {});
  const restore = createProfileReturnRestorer();
  await restore(false);
  expect(useGameStore.getState()).toMatchObject({ screen: 'presetSetup', settingsOpen: false });
  expect(useGameStore.getState().settings.isFirstLaunch).toBe(true);
  useGameStore.getState().completeFirstLaunch();
  useGameStore.getState().setScreen('songSelect');
  await restore(false);
  expect(useGameStore.getState()).toMatchObject({ screen: 'songSelect', settingsOpen: true, settingsInitialSection: 'profile' });
});

it('mobileListOnly 복귀는 첫 실행이어도 presetSetup 없이 Profile을 열고 isFirstLaunch=true를 유지한다', async () => {
  mockBrowser('https://example.test/game#error=access_denied');
  await signInFromProfile(async () => {});
  await createProfileReturnRestorer()(true);
  expect(useGameStore.getState()).toMatchObject({
    screen: 'songSelect', settingsOpen: true, settingsInitialSection: 'profile', profileAuthError: null,
    settings: { isFirstLaunch: true },
  });
});

it('복귀 의도가 없는 일반 시작은 title을 유지하고 OAuth 오류 URL에도 관여하지 않는다', async () => {
  const history = mockBrowser('https://example.test/game?error=server_error');
  await createProfileReturnRestorer()(false);
  expect(useGameStore.getState()).toMatchObject({ screen: 'title', settingsOpen: false });
  expect(history.replaceState).not.toHaveBeenCalled();
});

// DOM 렌더러가 없어 React effect의 연결만 소스로 확인한다. 복귀·재실행·pageshow는 아래에서 실행한다.
it('GameApp의 effect는 첫 실행·모바일 변경에 복귀 구독을 연결하고 정리 함수를 반환한다', () => {
  expect(appSource).toContain('useState(createProfileReturnRestorer)');
  expect(appSource).toContain('return bindProfileReturnRestoration(restoreProfileReturn, mobileListOnly)');
  expect(appSource).toContain('[restoreProfileReturn, mobileListOnly, isFirstLaunch]');
});

it.each(['close', 'title'] as const)('Profile 복귀 후 %s로 나가 설정을 다시 열면 Controls이고 이전 오류는 없다', async (exit) => {
  mockBrowser('https://example.test/game?error=server_error');
  useGameStore.getState().completeFirstLaunch();
  await signInFromProfile(async () => {});
  await createProfileReturnRestorer()(false);
  if (exit === 'close') useGameStore.getState().setSettingsOpen(false);
  else useGameStore.getState().setScreen('title');
  expect(useGameStore.getState()).toMatchObject({ settingsInitialSection: 'controls', profileAuthError: null });
  useGameStore.getState().setSettingsOpen(true);
  expect(useGameStore.getState()).toMatchObject({ settingsOpen: true, settingsInitialSection: 'controls', profileAuthError: null });
});

it('토큰 복귀에서 SDK 초기화가 User lookup failed를 반환하면 세션이 없어도 Profile에 오류를 표시한다', async () => {
  mockBrowser('https://example.test/game#access_token=token&refresh_token=refresh&expires_in=3600&token_type=bearer');
  useGameStore.getState().completeFirstLaunch();
  await signInFromProfile(async () => {});
  const initializeAuth = vi.fn(async () => ({ error: new Error('User lookup failed') }));
  await createProfileReturnRestorer(initializeAuth)(false);
  expect(initializeAuth).toHaveBeenCalledOnce();
  expect(useGameStore.getState()).toMatchObject({
    settingsOpen: true, settingsInitialSection: 'profile', profileAuthError: 'User lookup failed',
  });
});

it('access_denied로 취소하면 SDK 초기화 오류 User cancelled가 있어도 Profile의 오류는 null이다', async () => {
  mockBrowser('https://example.test/game#error=access_denied');
  useGameStore.getState().completeFirstLaunch();
  await signInFromProfile(async () => {});
  const initializeAuth = vi.fn(async () => ({ error: new Error('User cancelled') }));
  await createProfileReturnRestorer(initializeAuth)(false);
  expect(initializeAuth).toHaveBeenCalledOnce();
  expect(useGameStore.getState()).toMatchObject({ settingsOpen: true, profileAuthError: null });
});

it('access_denied 취소 후 새 Login 마커로 pageshow persisted 복귀하면 캐시된 User cancelled 오류 없이 Profile을 연다', async () => {
  const history = mockBrowser('https://example.test/game#error=access_denied&error_description=User+cancelled');
  history.replaceState.mockImplementation((_state, _unused, url: string) => { window.location.href = url; });
  useGameStore.getState().completeFirstLaunch();
  await signInFromProfile(async () => {});
  const initializeAuth = vi.fn(async () => ({ error: new Error('User cancelled') }));
  const restore = vi.fn(createProfileReturnRestorer(initializeAuth));
  const stop = bindProfileReturnRestoration(restore, false);
  try {
    await restore.mock.results[0].value;
    expect(useGameStore.getState()).toMatchObject({ settingsOpen: true, profileAuthError: null });
    expect(window.location.href).toBe('https://example.test/game');
    useGameStore.getState().setSettingsOpen(false);

    await signInFromProfile(async () => {});
    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
    await restore.mock.results[1].value;
    expect(useGameStore.getState()).toMatchObject({
      screen: 'songSelect', settingsOpen: true, settingsInitialSection: 'profile', profileAuthError: null,
    });
    expect(window.sessionStorage.getItem('not4k-profile-return')).toBeNull();
  } finally {
    stop();
  }
});

it('첫 실행 presetSetup 중 새로고침해도 원래 타임스탬프를 유지하고 완료 후 Profile을 1회만 연다', async () => {
  mockBrowser();
  await signInFromProfile(async () => {});
  const marker = window.sessionStorage.getItem('not4k-profile-return');
  await createProfileReturnRestorer()(false);
  expect(useGameStore.getState().screen).toBe('presetSetup');
  expect(window.sessionStorage.getItem('not4k-profile-return')).toBe(marker);
  const afterReload = createProfileReturnRestorer();
  await afterReload(false);
  useGameStore.getState().completeFirstLaunch();
  await Promise.all([afterReload(false), afterReload(false)]);
  expect(useGameStore.getState()).toMatchObject({ settingsOpen: true, settingsInitialSection: 'profile' });
  expect(window.sessionStorage.getItem('not4k-profile-return')).toBeNull();
  useGameStore.getState().setSettingsOpen(false);
  await afterReload(false);
  await createProfileReturnRestorer()(false);
  expect(useGameStore.getState().settingsOpen).toBe(false);
});

it('Google 이동 후 pageshow persisted=true로 돌아오면 Profile을 1회 열고 마커를 소비하며 구독 해제 후에는 복귀하지 않는다', async () => {
  mockBrowser();
  useGameStore.getState().completeFirstLaunch();
  const restore = vi.fn(createProfileReturnRestorer());
  const stop = bindProfileReturnRestoration(restore, false);
  await restore.mock.results[0].value;
  await signInFromProfile(async () => {});
  window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: false }));
  expect(restore).toHaveBeenCalledTimes(1);
  window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
  expect(restore).toHaveBeenCalledTimes(2);
  await restore.mock.results[1].value;
  expect(useGameStore.getState()).toMatchObject({ settingsOpen: true, settingsInitialSection: 'profile' });
  expect(window.sessionStorage.getItem('not4k-profile-return')).toBeNull();
  useGameStore.getState().setSettingsOpen(false);
  window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
  await restore.mock.results[2].value;
  expect(useGameStore.getState().settingsOpen).toBe(false);
  stop();
  await signInFromProfile(async () => {});
  window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
  expect(restore).toHaveBeenCalledTimes(3);
});

it('StrictMode처럼 초기화 대기 중 복귀를 2회 실행해도 SDK 완료 후 Profile을 1회만 연다', async () => {
  mockBrowser();
  useGameStore.getState().completeFirstLaunch();
  await signInFromProfile(async () => {});
  let finish!: (result: { error: Error | null }) => void;
  const initializeAuth = vi.fn(() => new Promise<{ error: Error | null }>(resolve => { finish = resolve; }));
  const restore = createProfileReturnRestorer(initializeAuth);
  const opened = vi.fn();
  const unsubscribe = useGameStore.subscribe((state, previous) => {
    if (state.settingsOpen && !previous.settingsOpen) opened();
  });
  try {
    const attempts = [restore(false), restore(false)];
    expect(initializeAuth).toHaveBeenCalledOnce();
    expect(useGameStore.getState().settingsOpen).toBe(false);
    finish({ error: null });
    await Promise.all(attempts);
    expect(opened).toHaveBeenCalledOnce();
    expect(useGameStore.getState().settingsInitialSection).toBe('profile');
  } finally {
    unsubscribe();
  }
});

it('첫 실행 모바일 복귀의 초기화 대기 중 데스크톱으로 재구독하면 마커를 유지한 채 presetSetup을 거쳐 Profile을 1회만 연다', async () => {
  mockBrowser();
  await signInFromProfile(async () => {});
  const marker = window.sessionStorage.getItem('not4k-profile-return');
  let finish!: (result: { error: Error | null }) => void;
  const initializeAuth = vi.fn(() => new Promise<{ error: Error | null }>(resolve => { finish = resolve; }));
  const restore = vi.fn(createProfileReturnRestorer(initializeAuth));
  const opened = vi.fn();
  const unsubscribe = useGameStore.subscribe((state, previous) => {
    if (state.settingsOpen && !previous.settingsOpen) opened();
  });
  let stop = bindProfileReturnRestoration(restore, true);
  try {
    stop();
    stop = bindProfileReturnRestoration(restore, false);
    expect(initializeAuth).toHaveBeenCalledOnce();
    finish({ error: null });
    await Promise.all(restore.mock.results.map(result => result.value));
    expect(useGameStore.getState()).toMatchObject({
      screen: 'presetSetup', settingsOpen: false, settings: { isFirstLaunch: true },
    });
    expect(window.sessionStorage.getItem('not4k-profile-return')).toBe(marker);
    expect(opened).not.toHaveBeenCalled();

    useGameStore.getState().completeFirstLaunch();
    stop();
    stop = bindProfileReturnRestoration(restore, false);
    await restore.mock.results[2].value;
    expect(useGameStore.getState()).toMatchObject({
      screen: 'songSelect', settingsOpen: true, settingsInitialSection: 'profile',
    });
    expect(window.sessionStorage.getItem('not4k-profile-return')).toBeNull();
    expect(opened).toHaveBeenCalledOnce();
    expect(initializeAuth).toHaveBeenCalledOnce();

    useGameStore.getState().setSettingsOpen(false);
    stop();
    stop = bindProfileReturnRestoration(restore, false);
    await restore.mock.results[3].value;
    expect(useGameStore.getState().settingsOpen).toBe(false);
    expect(opened).toHaveBeenCalledOnce();
  } finally {
    stop();
    unsubscribe();
  }
});

it('11분 지난 복귀 마커는 앱 시작에서 지우고 SDK 초기화와 Profile 열기를 건너뛴다', async () => {
  mockBrowser();
  window.sessionStorage.setItem('not4k-profile-return', String(Date.now() - 11 * 60 * 1000));
  await createProfileReturnRestorer()(false);
  expect(initialize).not.toHaveBeenCalled();
  expect(window.sessionStorage.getItem('not4k-profile-return')).toBeNull();
  expect(useGameStore.getState()).toMatchObject({ screen: 'title', settingsOpen: false });
});

it('SDK 초기화가 Lock unavailable 예외로 끝나도 Profile에 오류를 표시하고 복귀 마커를 소비한다', async () => {
  mockBrowser();
  useGameStore.getState().completeFirstLaunch();
  await signInFromProfile(async () => {});
  const initializeAuth = async () => { throw new Error('Lock unavailable'); };
  await createProfileReturnRestorer(initializeAuth)(false);
  expect(useGameStore.getState()).toMatchObject({ settingsOpen: true, profileAuthError: 'Lock unavailable' });
  expect(window.sessionStorage.getItem('not4k-profile-return')).toBeNull();
});

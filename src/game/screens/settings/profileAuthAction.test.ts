import { afterEach, expect, it, vi } from 'vitest';
import { useGameStore } from '../../stores/gameStore';
import { signOutFromProfile } from './profileAuth';
import { handleProfileAuth } from './profileAuthAction';

const storage = vi.hoisted(() => {
  const createStorage = () => {
    const valueByKey = new Map<string, string>();
    return {
      getItem: (key: string) => valueByKey.get(key) ?? null,
      setItem: (key: string, value: string) => { valueByKey.set(key, value); },
      removeItem: (key: string) => { valueByKey.delete(key); },
    };
  };
  const storage = createStorage();
  // Login 실패 테스트의 복귀 마커는 sessionStorage에 쓰고, Login은 떠나기 전에 location의 OAuth 결과를 확인한다.
  vi.stubGlobal('window', {
    localStorage: storage, sessionStorage: createStorage(),
    location: { href: 'https://example.test/game' }, history: { state: null, replaceState: () => {} },
  });
  return storage;
});

afterEach(() => useGameStore.setState(useGameStore.getInitialState(), true));

it('Logout 완료 전에는 Profile을 유지하고 완료 후 title·설정 닫기로 전환하며 키·속도 1200·오프셋 −50/+30을 보존한다', async () => {
  const state = useGameStore.getState();
  state.updateSettings({ scrollSpeed: 1200, inputOffsetMs: -50, visualOffsetMs: 30 });
  state.updateKeyBindings({ lane1: ['KeyA', 'KeyS'] });
  state.setScreen('songSelect');
  state.setSettingsOpen(true);
  useGameStore.setState({ settingsInitialSection: 'profile' });
  const saved = storage.getItem('not4k-settings');
  expect(JSON.parse(saved!).state.settings).toMatchObject({ scrollSpeed: 1200, inputOffsetMs: -50, visualOffsetMs: 30 });
  let finish!: () => void;
  const signOut = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));

  const result = handleProfileAuth({
    signedIn: true, signIn: vi.fn(), signOut, isActive: () => true, setPending: vi.fn(),
  });
  expect(signOut).toHaveBeenCalledOnce();
  expect(useGameStore.getState()).toMatchObject({ screen: 'songSelect', settingsOpen: true });
  finish();
  await result;
  expect(useGameStore.getState()).toMatchObject({ screen: 'title', settingsOpen: false });
  expect(useGameStore.getState().settings).toMatchObject({
    scrollSpeed: 1200, inputOffsetMs: -50, visualOffsetMs: 30, keyBindings: { lane1: ['KeyA', 'KeyS'] },
  });
  expect(storage.getItem('not4k-settings')).toBe(saved);
});

it('Logout이 Session unavailable 예외로 실패하면 오류 메시지를 반환하고 title로 이동하지 않아 songSelect·설정·Profile을 유지한다', async () => {
  useGameStore.getState().setScreen('songSelect');
  useGameStore.getState().setSettingsOpen(true);
  useGameStore.setState({ settingsInitialSection: 'profile' });
  const error = await signOutFromProfile(async () => { throw new Error('Session unavailable'); },
    () => useGameStore.getState().setScreen('title'));
  expect(error).toBe('Session unavailable');
  expect(useGameStore.getState()).toMatchObject({ screen: 'songSelect', settingsOpen: true, settingsInitialSection: 'profile' });
});

it('Logout이 { error: Session unavailable }을 반환하면 songSelect·설정·Profile을 유지한 채 그 오류를 표시하고 setPending을 true→false로 호출한다', async () => {
  useGameStore.getState().setScreen('songSelect');
  useGameStore.getState().setSettingsOpen(true);
  useGameStore.setState({ settingsInitialSection: 'profile' });
  const setPending = vi.fn();
  await handleProfileAuth({
    signedIn: true, signIn: vi.fn(),
    signOut: async () => ({ error: new Error('Session unavailable') }),
    isActive: () => true, setPending,
  });
  expect(useGameStore.getState()).toMatchObject({
    screen: 'songSelect', settingsOpen: true, settingsInitialSection: 'profile', profileAuthError: 'Session unavailable',
  });
  expect(setPending.mock.calls).toEqual([[true], [false]]);
});

it('Profile Login이 Network unavailable로 reject되면 Profile에 그 오류를 표시하고 setPending을 true→false로 호출한다', async () => {
  useGameStore.getState().setScreen('songSelect');
  useGameStore.getState().setSettingsOpen(true);
  const setPending = vi.fn();
  await handleProfileAuth({
    signedIn: false, signIn: () => Promise.reject(new Error('Network unavailable')), signOut: vi.fn(),
    isActive: () => true, setPending,
  });
  expect(useGameStore.getState()).toMatchObject({
    screen: 'songSelect', settingsOpen: true, profileAuthError: 'Network unavailable',
  });
  expect(setPending.mock.calls).toEqual([[true], [false]]);
});

it('Logout 대기 중 Profile을 언마운트하고 play로 이동하면 로그아웃 완료 후에도 play를 유지한다', async () => {
  useGameStore.getState().setScreen('songSelect');
  useGameStore.getState().setSettingsOpen(true);
  let active = true;
  let finish!: () => void;
  const signOut = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  const setPending = vi.fn();
  const result = handleProfileAuth({
    signedIn: true, signIn: vi.fn(), signOut, isActive: () => active, setPending,
  });
  expect(signOut).toHaveBeenCalledOnce();
  expect(setPending).toHaveBeenCalledWith(true);
  active = false;
  useGameStore.getState().setSettingsOpen(false);
  useGameStore.getState().setScreen('play');
  finish();
  await result;
  expect(useGameStore.getState()).toMatchObject({ screen: 'play', settingsOpen: false });
  expect(setPending).toHaveBeenCalledTimes(1);
});

it('Logout 대기 중 설정이 닫혔지만 unmount 정리 전이면 완료 후 songSelect를 유지한다', async () => {
  useGameStore.getState().setScreen('songSelect');
  useGameStore.getState().setSettingsOpen(true);
  let finish!: () => void;
  const result = handleProfileAuth({
    signedIn: true, signIn: vi.fn(),
    signOut: () => new Promise<void>(resolve => { finish = resolve; }),
    isActive: () => true, setPending: vi.fn(),
  });
  useGameStore.getState().setSettingsOpen(false);
  finish();
  await result;
  expect(useGameStore.getState()).toMatchObject({ screen: 'songSelect', settingsOpen: false });
});

it('이전 Profile의 Logout이 Late failure로 실패해도 새 설정의 New error를 덮어쓰지 않는다', async () => {
  useGameStore.getState().setSettingsOpen(true);
  let active = true;
  let finish!: (value: { error: Error }) => void;
  const setPending = vi.fn();
  const result = handleProfileAuth({
    signedIn: true, signIn: vi.fn(),
    signOut: () => new Promise<{ error: Error }>(resolve => { finish = resolve; }),
    isActive: () => active, setPending,
  });
  active = false;
  useGameStore.getState().setSettingsOpen(false);
  useGameStore.getState().setSettingsOpen(true);
  useGameStore.setState({ profileAuthError: 'New error' });
  finish({ error: new Error('Late failure') });
  await result;
  expect(useGameStore.getState().profileAuthError).toBe('New error');
  expect(setPending.mock.calls).toEqual([[true]]);
});

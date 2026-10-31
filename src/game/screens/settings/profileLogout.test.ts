import { afterEach, expect, it, vi } from 'vitest';
import { useGameStore } from '../../stores/gameStore';
import { signOutFromProfile } from './profileAuth';

const storage = vi.hoisted(() => {
  const valueByKey = new Map<string, string>();
  const storage = {
    getItem: (key: string) => valueByKey.get(key) ?? null,
    setItem: (key: string, value: string) => { valueByKey.set(key, value); },
    removeItem: (key: string) => { valueByKey.delete(key); },
  };
  vi.stubGlobal('window', { localStorage: storage });
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

  const result = signOutFromProfile(signOut, () => useGameStore.getState().setScreen('title'));
  expect(signOut).toHaveBeenCalledOnce();
  expect(useGameStore.getState()).toMatchObject({ screen: 'songSelect', settingsOpen: true });
  finish();
  expect(await result).toBeNull();
  expect(useGameStore.getState()).toMatchObject({ screen: 'title', settingsOpen: false });
  expect(useGameStore.getState().settings).toMatchObject({
    scrollSpeed: 1200, inputOffsetMs: -50, visualOffsetMs: 30, keyBindings: { lane1: ['KeyA', 'KeyS'] },
  });
  expect(storage.getItem('not4k-settings')).toBe(saved);
});

it('Logout에서 Session unavailable이 발생하면 title로 이동하지 않고 Profile·오류 메시지를 유지한다', async () => {
  useGameStore.getState().setScreen('songSelect');
  useGameStore.getState().setSettingsOpen(true);
  useGameStore.setState({ settingsInitialSection: 'profile' });
  const error = await signOutFromProfile(async () => { throw new Error('Session unavailable'); },
    () => useGameStore.getState().setScreen('title'));
  expect(error).toBe('Session unavailable');
  expect(useGameStore.getState()).toMatchObject({ screen: 'songSelect', settingsOpen: true, settingsInitialSection: 'profile' });
});

it('Logout이 반환한 오류 Returned failure도 화면 이동 없이 표시한다', async () => {
  const onSignedOut = vi.fn();
  expect(await signOutFromProfile(async () => ({ error: new Error('Returned failure') }), onSignedOut)).toBe('Returned failure');
  expect(onSignedOut).not.toHaveBeenCalled();
});

import { createElement, type ComponentType, type EffectCallback } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { createProfileNickname } from './profile/profileNickname';
import GameApp from './App';
import { ProfileSection } from './screens/settings/ProfileSection';

const fixture = vi.hoisted(() => ({
  devAdmin: true,
  user: { id: 'dev-user' } as { id: string; is_anonymous?: boolean } | null,
  loading: false,
  effects: [] as EffectCallback[],
}));
// DOM 없이 실제 컴포넌트의 effect 등록을 모아 렌더가 끝난 뒤 실행한다.
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useEffect: (effect: EffectCallback) => { fixture.effects.push(effect); },
}));
vi.mock('../shared/hooks/useAuth', () => ({
  get DEV_ADMIN() { return fixture.devAdmin; },
  useAuth: () => ({ user: fixture.user, loading: fixture.loading }),
}));
const guest = { get: () => 'Guest000042', rotate: vi.fn(), subscribe: () => () => {} };
const link = vi.fn(async () => ({ nickname: 'Pilot7', first_link: false, first_link_guest_nickname: null }));
const profile = createProfileNickname({ guest, link, save: async (_userId, nickname) => nickname });
vi.mock('./profile/profileNicknameStore', () => ({ get profileNickname() { return profile; } }));
vi.mock('./profile/guestNickname', () => ({ get guestNickname() { return guest; } }));
vi.mock('./stores/gameStore', () => ({
  useGameStore: (select: (state: unknown) => unknown) => select({ profileAuthError: null }),
}));
vi.mock('./stores', () => ({
  useGameStore: (select: (state: unknown) => unknown) => select({
    screen: 'title', editorReturnUrl: null, settings: { gearMotion: true, isFirstLaunch: false },
  }),
}));
vi.mock('./hooks/useGameExperience', () => ({ useGameExperience: () => 'fullGame' }));
vi.mock('./screens', () => ({ TitleScreen: () => null }));
vi.mock('./screens/settings/profileReturn', () => ({
  createProfileReturnRestorer: () => ({}), bindProfileReturnRestoration: () => () => {},
}));

async function mountEffects(Component: ComponentType) {
  renderToStaticMarkup(createElement(Component));
  const cleanups = fixture.effects.splice(0).map(effect => effect());
  await Promise.resolve();
  return () => { for (const cleanup of cleanups) cleanup?.(); };
}

beforeEach(async () => {
  await profile.setUser(null);
  vi.clearAllMocks();
  fixture.devAdmin = true;
  fixture.user = { id: 'dev-user' };
  fixture.loading = false;
  fixture.effects.length = 0;
});

it('DEV_ADMIN의 GameApp 진입은 연동하지 않고 Profile 첫 마운트에서만 Guest000042를 한 번 연동한다', async () => {
  const unmountApp = await mountEffects(GameApp);
  expect(link).not.toHaveBeenCalled();
  const closeProfile = await mountEffects(ProfileSection);
  expect(link).toHaveBeenCalledExactlyOnceWith('Guest000042');
  expect(profile.store.getState().nickname).toBe('Pilot7');
  closeProfile();
  const closeReopenedProfile = await mountEffects(ProfileSection);
  expect(link).toHaveBeenCalledTimes(1);
  closeReopenedProfile();
  unmountApp();
});

it('실제 user-1 로그인은 Profile을 열기 전에 연동하고 로그아웃하면 계정 닉네임을 비운다', async () => {
  fixture.devAdmin = false;
  fixture.user = null;
  fixture.loading = true;
  const stopLoading = await mountEffects(GameApp);
  expect(link).not.toHaveBeenCalled();
  stopLoading();
  fixture.user = { id: 'user-1' };
  const stopSignedIn = await mountEffects(GameApp);
  expect(link).toHaveBeenCalledExactlyOnceWith('Guest000042');
  expect(profile.store.getState().nickname).toBe('Pilot7');
  fixture.loading = false;
  const closeProfile = await mountEffects(ProfileSection);
  expect(link).toHaveBeenCalledTimes(1);
  closeProfile();
  stopSignedIn();
  fixture.user = null;
  const stopSignedOut = await mountEffects(GameApp);
  expect(profile.store.getState().userId).toBeNull();
  expect(profile.store.getState().nickname).toBeNull();
  stopSignedOut();
});

it.each([
  { user: null, loading: false },
  { user: { id: 'dev-user', is_anonymous: true }, loading: false },
  { user: { id: 'dev-user' }, loading: true },
])('DEV_ADMIN에서 인증 상태가 %j이면 Profile을 열어도 닉네임을 연동하지 않는다', async state => {
  Object.assign(fixture, state);
  const closeProfile = await mountEffects(ProfileSection);
  expect(link).not.toHaveBeenCalled();
  closeProfile();
});

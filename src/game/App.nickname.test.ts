import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import GameApp from './App';
import { useAccountNicknameLink } from './profile/useAccountNicknameLink';

// 연동 조건과 의존성은 useAccountNicknameLink.test.ts가 검사한다. 여기서는 GameApp이 자기 인증 상태를 넘기는지만 본다.
const auth = vi.hoisted(() => ({ user: null as { id: string } | null, loading: true }));
vi.mock('../shared/hooks/useAuth', () => ({ useAuth: () => auth }));
vi.mock('./profile/useAccountNicknameLink', () => ({ useAccountNicknameLink: vi.fn() }));
vi.mock('./stores', () => ({
  useGameStore: (select: (state: unknown) => unknown) => select({
    screen: 'title', editorReturnUrl: null, settings: { gearMotion: true, isFirstLaunch: false },
  }),
}));
vi.mock('./hooks/useGameExperience', () => ({ useGameExperience: () => 'fullGame' }));
vi.mock('./screens', () => ({ TitleScreen: () => null }));

beforeEach(() => {
  vi.mocked(useAccountNicknameLink).mockClear();
});

it.each([
  { user: null, loading: true },
  { user: { id: 'user-1' }, loading: false },
])('GameApp은 타이틀 화면에서도 useAuth가 준 user $user·loading $loading 값을 그대로 useAccountNicknameLink에 넘긴다', state => {
  Object.assign(auth, state);
  renderToStaticMarkup(createElement(GameApp));
  expect(useAccountNicknameLink).toHaveBeenCalledWith(auth.user, auth.loading);
});

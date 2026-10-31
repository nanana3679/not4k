import { afterEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProfileSection } from './ProfileSection';
import type { useAuth } from '../../../shared/hooks/useAuth';

const auth = vi.hoisted(() => ({
  user: null as ReturnType<typeof useAuth>['user'], loading: false,
  signInWithGoogle: vi.fn(), signOut: vi.fn(),
}));
const profileState = vi.hoisted(() => ({ profileAuthError: null as string | null }));
vi.mock('../../../shared/hooks/useAuth', () => ({ useAuth: () => auth }));
// 서버 렌더는 Zustand의 초기 snapshot만 읽으므로 현재 오류 상태를 직접 주입한다.
vi.mock('../../stores/gameStore', () => ({
  useGameStore: (select: (state: typeof profileState) => unknown) => select(profileState),
}));

afterEach(() => {
  auth.user = null;
  auth.loading = false;
  profileState.profileAuthError = null;
});

it('인증 세션 확인 중에는 Checking sign-in과 비활성 Login을 표시한다', () => {
  auth.loading = true;
  const html = renderToStaticMarkup(createElement(ProfileSection));
  expect(html).toContain('Checking sign-in');
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Login<\/button>/);
});

it('Profile의 Provider unavailable 오류는 alert로 표시되고 같은 Login 버튼이 남는다', () => {
  profileState.profileAuthError = 'Provider unavailable';
  const html = renderToStaticMarkup(createElement(ProfileSection));
  expect(html).toContain('role="alert">Provider unavailable</p>');
  expect(html).toContain('>Login</button>');
});

it('이메일 없는 로그인 사용자도 Signed in·Logout을 표시한다', () => {
  auth.user = { id: 'user-1' } as NonNullable<typeof auth.user>;
  const html = renderToStaticMarkup(createElement(ProfileSection));
  expect(html).toContain('Signed in');
  expect(html).toContain('>Logout</button>');
  expect(html).not.toContain('undefined');
});

it('비로그인 Profile은 Login 버튼을 표시하고 닉네임 입력과 Logout은 표시하지 않는다', () => {
  const html = renderToStaticMarkup(createElement(ProfileSection));
  expect(html).toContain('>Login</button>');
  expect(html).not.toContain('Logout');
  expect(html).not.toContain('<input');
});

it('dev@local 로그인 Profile은 Signed in·이메일·Logout을 표시하고 Login과 닉네임 입력은 없다', () => {
  auth.user = { id: 'dev-user', email: 'dev@local' } as NonNullable<typeof auth.user>;
  const html = renderToStaticMarkup(createElement(ProfileSection));
  expect(html).toContain('Signed in');
  expect(html).toContain('dev@local');
  expect(html).toContain('>Logout</button>');
  expect(html).not.toContain('>Login</button>');
  expect(html).not.toContain('<input');
});

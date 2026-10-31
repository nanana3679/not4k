import { afterEach, expect, it, vi } from 'vitest';
import { createElement, type EffectCallback } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProfileSection } from './ProfileSection';
import type { useAuth } from '../../../shared/hooks/useAuth';
import { createStore } from 'zustand/vanilla';
import { accountNicknameService } from '../../profile/accountNicknameService';

const auth = vi.hoisted(() => ({
  user: null as ReturnType<typeof useAuth>['user'], loading: false,
  signInWithGoogle: vi.fn(), signOut: vi.fn(),
}));
const profileState = vi.hoisted(() => ({ profileAuthError: null as string | null }));
const nicknameState = {
  userId: 'dev-user', nickname: 'Pilot7', status: 'ready' as 'loading' | 'ready' | 'error', saving: false,
};
const nicknameStore = createStore(() => nicknameState);
vi.mock('../../profile/accountNicknameService', () => ({
  accountNicknameService: {
    get store() { return nicknameStore; }, retryLoad: vi.fn(), saveNickname: vi.fn(), setUser: vi.fn(),
  },
}));
vi.mock('../../profile/guestNickname', () => ({
  guestNickname: { get: () => 'Guest123456', subscribe: () => () => {} },
}));
// DEV_ADMIN은 내보내지 않는다. Profile은 실제 로그인과 DEV_ADMIN을 가리지 않고 같은 방식으로 계정 닉네임을 연동한다.
vi.mock('../../../shared/hooks/useAuth', () => ({ useAuth: () => auth }));
// 서버 렌더는 effect를 실행하지 않으므로 등록만 모았다가 mountProfile이 렌더 뒤에 실행한다.
const effects = vi.hoisted(() => [] as EffectCallback[]);
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useEffect: (effect: EffectCallback) => { effects.push(effect); },
}));
// 서버 렌더는 Zustand의 초기 snapshot만 읽으므로 현재 오류 상태를 직접 주입한다.
vi.mock('../../stores/gameStore', () => ({
  useGameStore: (select: (state: typeof profileState) => unknown) => select(profileState),
}));

/** Profile을 처음 연 것처럼 렌더한 뒤 mount effect를 실행한다. */
function mountProfile() {
  const html = renderToStaticMarkup(createElement(ProfileSection));
  for (const effect of effects.splice(0)) effect();
  return html;
}

const tagOf = (html: string, pattern: RegExp) => html.match(pattern)?.[0] ?? '';

afterEach(() => {
  effects.length = 0;
  vi.mocked(accountNicknameService.setUser).mockClear();
  auth.user = null;
  auth.loading = false;
  profileState.profileAuthError = null;
  Object.assign(nicknameState, { userId: 'dev-user', nickname: 'Pilot7', status: 'ready', saving: false });
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

it('비로그인 Profile은 Guest123456·Login 버튼을 표시하고 닉네임 입력과 Logout은 표시하지 않는다', () => {
  const html = renderToStaticMarkup(createElement(ProfileSection));
  expect(html).toContain('>Login</button>');
  expect(html).toContain('Guest123456');
  expect(html).not.toContain('Logout');
  expect(html).not.toContain('<input');
});

it('익명 dev-user의 Profile은 계정 Pilot7 입력 대신 Guest123456·Login을 표시한다', () => {
  auth.user = { id: 'dev-user', is_anonymous: true } as NonNullable<typeof auth.user>;
  const html = renderToStaticMarkup(createElement(ProfileSection));
  expect(html).toContain('Guest123456');
  expect(html).toContain('>Login</button>');
  expect(html).not.toContain('Pilot7');
  expect(html).not.toContain('<input');
});

it('dev@local 로그인 Profile은 편집할 수 있는 Pilot7 입력·Save·이메일·Logout을 표시하고 Login은 없다', () => {
  auth.user = { id: 'dev-user', email: 'dev@local' } as NonNullable<typeof auth.user>;
  const html = renderToStaticMarkup(createElement(ProfileSection));
  expect(html).toContain('Signed in');
  expect(html).toContain('dev@local');
  expect(html).toContain('>Logout</button>');
  expect(html).not.toContain('>Login</button>');
  expect(html).toContain('<input');
  expect(html).toContain('value="Pilot7"');
  expect(html).toContain('>Nickname</label>');
  expect(html).toContain('>Save</button>');
  expect(tagOf(html, /<input[^>]*>/)).not.toMatch(/readonly|disabled/i);
  expect(tagOf(html, /<button[^>]*>Save<\/button>/)).not.toContain('disabled');
});

it('실제 로그인 user-1의 Profile을 열면 GameApp의 인증 구독과 별개로 계정 닉네임에 user-1을 알린다', () => {
  auth.user = { id: 'user-1' } as NonNullable<typeof auth.user>;
  mountProfile();
  expect(accountNicknameService.setUser).toHaveBeenCalledExactlyOnceWith({ id: 'user-1' });
});

it.each([
  { user: null, loading: false },
  { user: { id: 'user-1', is_anonymous: true }, loading: false },
  { user: { id: 'user-1' }, loading: true },
])('인증 상태가 %j인 Profile을 열면 계정 닉네임의 사용자를 바꾸지 않는다', state => {
  Object.assign(auth, state);
  mountProfile();
  expect(accountNicknameService.setUser).not.toHaveBeenCalled();
});

it('dev-user의 닉네임 loading 상태는 Loading nickname과 Logout을 표시하고 Save는 숨긴다', () => {
  auth.user = { id: 'dev-user' } as NonNullable<typeof auth.user>;
  nicknameState.status = 'loading';
  const html = renderToStaticMarkup(createElement(ProfileSection));
  expect(html).toContain('role="status">Loading nickname…');
  expect(html).toContain('>Logout</button>');
  expect(html).not.toContain('>Save</button>');
});

it('dev-user 계정의 저장이 진행 중이면 Pilot7 입력은 readonly·aria-disabled, Save는 aria-disabled·aria-busy이고 둘 다 포커스를 잃는 disabled 속성은 없다', () => {
  auth.user = { id: 'dev-user' } as NonNullable<typeof auth.user>;
  nicknameState.saving = true;
  const html = renderToStaticMarkup(createElement(ProfileSection));
  const input = tagOf(html, /<input[^>]*>/);
  expect(input).toContain('value="Pilot7"');
  expect(input).toContain('readOnly=""');
  expect(input).toContain('aria-disabled="true"');
  expect(input).not.toMatch(/\sdisabled=/);
  const save = tagOf(html, /<button[^>]*>Save<\/button>/);
  expect(save).toContain('aria-disabled="true"');
  expect(save).toContain('aria-busy="true"');
  expect(save).not.toMatch(/\sdisabled=/);
});

it('dev-user의 닉네임 error 상태는 로드 실패 안내·Retry·Logout을 표시하고 입력은 숨긴다', () => {
  auth.user = { id: 'dev-user' } as NonNullable<typeof auth.user>;
  nicknameState.status = 'error';
  const html = renderToStaticMarkup(createElement(ProfileSection));
  expect(html).toContain('role="alert">Couldn&#x27;t load your nickname.');
  expect(html).toContain('>Retry</button>');
  expect(html).toContain('>Logout</button>');
  expect(html).not.toContain('<input');
});

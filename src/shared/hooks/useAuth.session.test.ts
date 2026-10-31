import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';
import { useAuth } from './useAuth';

const hooks = vi.hoisted(() => ({ cursor: 0, values: [] as unknown[], effect: undefined as (() => (() => void) | void) | undefined }));
vi.mock('react', () => ({
  useState(initial: unknown) {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = initial;
    return [hooks.values[index], (value: unknown) => { hooks.values[index] = value; }];
  },
  useEffect(effect: () => (() => void) | void) { hooks.effect = effect; },
}));
const client = vi.hoisted(() => ({
  from: vi.fn(), select: vi.fn(), eq: vi.fn(), single: vi.fn(),
  auth: { getSession: vi.fn(), onAuthStateChange: vi.fn() },
}));
vi.mock('../../supabase/client', () => ({ supabase: client }));

type Session = { user: User } | null;
let authChanged: (event: string, session: Session) => void;
let cleanup: (() => void) | void;
let finishInitialSession: (session: Session) => void;
const user = (id: string) => ({ id } as User);
function AuthProbe() { return useAuth(); }
function render() { hooks.cursor = 0; return AuthProbe(); }

beforeEach(() => {
  vi.resetAllMocks();
  hooks.values = []; hooks.cursor = 0;
  client.from.mockReturnValue(client);
  client.select.mockReturnValue(client);
  client.eq.mockReturnValue(client);
  client.single.mockReturnValue(new Promise(() => {}));
  client.auth.getSession.mockReturnValue(new Promise(resolve => {
    finishInitialSession = session => resolve({ data: { session } });
  }));
  client.auth.onAuthStateChange.mockImplementation(callback => {
    authChanged = callback;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
  render();
  cleanup = hooks.effect?.();
});
afterEach(() => { cleanup?.(); });

it('A 세션을 받으면 프로필 조회가 대기 중이어도 sessionLoading은 false이고 user는 A이다', () => {
  authChanged('SIGNED_IN', { user: user('A') });
  expect(render()).toMatchObject({ user: { id: 'A' }, loading: true, sessionLoading: false });
});

it('B 로그인 이벤트 뒤 초기 A 세션 조회가 끝나도 현재 소유자는 B로 유지한다', async () => {
  authChanged('SIGNED_IN', { user: user('B') });
  finishInitialSession({ user: user('A') });
  await Promise.resolve();
  expect(render()).toMatchObject({ user: { id: 'B' }, sessionLoading: false });
});

it('A의 admin 프로필 응답이 로그아웃 뒤 도착해도 게스트 권한과 세션 확정을 바꾸지 않는다', async () => {
  let finishProfile!: () => void;
  client.single.mockReturnValueOnce(new Promise(resolve => {
    finishProfile = () => resolve({ data: { is_admin: true } });
  }));
  authChanged('SIGNED_IN', { user: user('A') });
  authChanged('SIGNED_OUT', null);
  finishProfile();
  await vi.waitFor(() => expect(render()).toMatchObject({ user: null, isAdmin: false, loading: false, sessionLoading: false }));
  await Promise.resolve();
  expect(render().isAdmin).toBe(false);
});

it('admin A가 확인된 뒤 같은 A의 TOKEN_REFRESHED 이벤트가 오면 admin 확인 응답을 기다리는 동안에도 isAdmin true·loading false를 유지한다', async () => {
  client.single.mockReturnValueOnce(Promise.resolve({ data: { is_admin: true } }));
  authChanged('SIGNED_IN', { user: user('A') });
  await vi.waitFor(() => expect(render()).toMatchObject({ isAdmin: true, loading: false }));
  client.single.mockReturnValueOnce(new Promise(() => {}));

  authChanged('TOKEN_REFRESHED', { user: user('A') });

  expect(render()).toMatchObject({ user: { id: 'A' }, isAdmin: true, loading: false, sessionLoading: false });
});

it('초기 세션 조회가 실패하고 세션 이벤트도 없으면 sessionLoading은 true로 유지하고 loading만 false로 끝낸다', async () => {
  cleanup?.();
  hooks.values = []; hooks.cursor = 0;
  client.auth.getSession.mockReturnValue(Promise.reject(new Error('offline')));
  render();
  cleanup = hooks.effect?.();

  await vi.waitFor(() => expect(render()).toMatchObject({ user: null, sessionLoading: true, loading: false }));
});

it.each(['SIGNED_IN', 'INITIAL_SESSION'])('초기 세션 조회 실패 뒤 %s로 A를 받으면 sessionLoading은 false가 되고 user는 A이다', async event => {
  cleanup?.();
  hooks.values = []; hooks.cursor = 0;
  client.auth.getSession.mockResolvedValue({ data: { session: null }, error: new Error('offline') });
  render();
  cleanup = hooks.effect?.();
  await vi.waitFor(() => expect(render()).toMatchObject({ sessionLoading: true, loading: false }));

  authChanged(event, { user: user('A') });

  expect(render()).toMatchObject({ user: { id: 'A' }, sessionLoading: false, loading: true });
});

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { createAccountNicknameService, type AuthUser } from './accountNickname';
import { useAccountNicknameLink } from './useAccountNicknameLink';

// DOM 없이 React의 effect 규칙을 흉내 낸다. 같은 자리의 effect는 의존성 중 하나라도 Object.is로 달라졌을 때만
// 이전 cleanup 뒤에 다시 실행한다. 의존성 배열이 없으면 매 렌더 실행한다.
const effects = vi.hoisted(() => {
  type Effect = () => void | (() => void);
  const slots: { deps: readonly unknown[] | undefined; cleanup: void | (() => void) }[] = [];
  const queued: (() => void)[] = [];
  let cursor = 0;
  const depsChanged = (previous: readonly unknown[] | undefined, next: readonly unknown[] | undefined) =>
    previous === undefined || next === undefined || previous.length !== next.length
    || next.some((dep, index) => !Object.is(dep, previous[index]));
  return {
    useEffect(effect: Effect, deps?: readonly unknown[]) {
      const index = cursor++;
      const previous = slots[index];
      if (previous && !depsChanged(previous.deps, deps)) return;
      queued.push(() => {
        if (typeof previous?.cleanup === 'function') previous.cleanup();
        slots[index] = { deps, cleanup: effect() };
      });
    },
    beginRender() { cursor = 0; },
    commit() { for (const run of queued.splice(0)) run(); },
    reset() { slots.length = 0; queued.length = 0; cursor = 0; },
  };
});
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useEffect: effects.useEffect,
}));
const fixture = vi.hoisted(() => ({ devAdmin: false }));
vi.mock('../../shared/hooks/useAuth', () => ({ get DEV_ADMIN() { return fixture.devAdmin; } }));
const link = vi.fn(async (_guestNickname: string) => ({
  nickname: 'Pilot7', first_link: false, first_link_guest_nickname: null as string | null,
}));
const service = createAccountNicknameService({
  guest: { get: () => 'Guest000042', rotate: vi.fn() }, link, save: async (_userId, nickname) => nickname,
});
vi.mock('./accountNicknameService', () => ({ get accountNicknameService() { return service; } }));

function GameAppAuth({ user, authLoading }: { user: AuthUser | null; authLoading: boolean }) {
  useAccountNicknameLink(user, authLoading);
  return null;
}

/** 같은 GameApp 인스턴스를 새 인증 상태로 다시 렌더하고 commit한 뒤 연동 응답까지 기다린다. */
async function rerender(user: AuthUser | null, authLoading: boolean) {
  effects.beginRender();
  renderToStaticMarkup(createElement(GameAppAuth, { user, authLoading }));
  effects.commit();
  await new Promise(resolve => setTimeout(resolve));
}

beforeEach(async () => {
  await service.setUser(null);
  effects.reset();
  link.mockClear();
  fixture.devAdmin = false;
});

it('loading true인 채 user가 null에서 user-1로 바뀌면 Guest000042로 한 번 연동해 Pilot7을 불러온다', async () => {
  await rerender(null, true);
  expect(link).not.toHaveBeenCalled();
  expect(service.store.getState().userId).toBeNull();
  await rerender({ id: 'user-1' }, true);
  expect(link).toHaveBeenCalledExactlyOnceWith('Guest000042');
  expect(service.store.getState()).toEqual({ userId: 'user-1', nickname: 'Pilot7', status: 'ready', saving: false });
});

it('user-1 연동 뒤 같은 id의 새 user 객체와 loading false가 와도 다시 연동하지 않는다', async () => {
  await rerender({ id: 'user-1' }, true);
  await rerender({ id: 'user-1' }, false);
  await rerender({ id: 'user-1' }, false);
  expect(link).toHaveBeenCalledOnce();
  expect(service.store.getState().nickname).toBe('Pilot7');
});

it('user-1 연동 뒤 세션 확인이 끝나 user null·loading false가 되면 계정 닉네임을 비운다', async () => {
  await rerender({ id: 'user-1' }, false);
  expect(service.store.getState().userId).toBe('user-1');
  await rerender(null, false);
  expect(service.store.getState()).toEqual({ userId: null, nickname: null, status: 'ready', saving: false });
});

it('로그아웃 뒤 user-2가 로그인하면 user-2로 다시 연동한다', async () => {
  await rerender({ id: 'user-1' }, false);
  await rerender(null, false);
  await rerender({ id: 'user-2' }, false);
  expect(link).toHaveBeenCalledTimes(2);
  expect(service.store.getState().userId).toBe('user-2');
});

it('익명 user-1은 연동하지 않고 계정 닉네임을 비운 채로 둔다', async () => {
  await rerender({ id: 'user-1', is_anonymous: true }, false);
  expect(link).not.toHaveBeenCalled();
  expect(service.store.getState().userId).toBeNull();
});

it('DEV_ADMIN에서는 dev-user가 처음부터 로그인 상태여도 GameApp이 연동하지 않고 Profile 마운트에 맡긴다', async () => {
  fixture.devAdmin = true;
  await rerender({ id: 'dev-user' }, false);
  await rerender({ id: 'dev-user' }, false);
  expect(link).not.toHaveBeenCalled();
  expect(service.store.getState().userId).toBeNull();
});

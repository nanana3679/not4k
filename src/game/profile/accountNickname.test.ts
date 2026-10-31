import { expect, it, vi } from 'vitest';
import { createAccountNicknameService } from './accountNickname';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

type LinkResult = { nickname: string; first_link: boolean; first_link_guest_nickname: string | null };
const SAVE_ERROR = { status: 'error', message: "Couldn't save your nickname. Please try again." };
/** 저장 실패 뒤 백그라운드로 다시 읽는 연동처럼 기다릴 promise가 없는 작업을 끝까지 돌린다. */
const flushBackground = () => new Promise(resolve => setTimeout(resolve));

function setup() {
  const guest = { get: vi.fn(() => 'Guest000042'), rotate: vi.fn() };
  const link = vi.fn(async (_nickname: string) => ({ nickname: 'Pilot7', first_link: false, first_link_guest_nickname: null as string | null }));
  const save = vi.fn(async (_userId: string, nickname: string) => nickname);
  const service = createAccountNicknameService({ guest, link, save });
  return { ...service, guest, link, save };
}

it('user-1 초기 세션은 Guest000042로 연동하고 응답 전 loading·응답 후 Pilot7 ready가 된다', async () => {
  const service = setup();
  const response = deferred<{ nickname: string; first_link: boolean; first_link_guest_nickname: string | null }>();
  service.link.mockReturnValueOnce(response.promise);
  const pending = service.setUser({ id: 'user-1' });
  expect(service.link).toHaveBeenCalledWith('Guest000042');
  expect(service.store.getState()).toEqual({ userId: 'user-1', nickname: null, status: 'loading', saving: false });
  response.resolve({ nickname: 'Pilot7', first_link: false, first_link_guest_nickname: null });
  await pending;
  expect(service.store.getState()).toEqual({ userId: 'user-1', nickname: 'Pilot7', status: 'ready', saving: false });
  expect(service.guest.rotate).not.toHaveBeenCalled();
});

it('user-1의 연동이 늦게 실패해도 user-2의 ready 상태를 error로 바꾸지 않는다', async () => {
  const service = setup();
  const response = deferred<{ nickname: string; first_link: boolean; first_link_guest_nickname: string | null }>();
  service.link.mockReturnValueOnce(response.promise);
  const old = service.setUser({ id: 'user-1' });
  await service.setUser({ id: 'user-2' });
  response.reject(new Error('Late failure'));
  await old;
  expect(service.store.getState()).toEqual({ userId: 'user-2', nickname: 'Pilot7', status: 'ready', saving: false });
});

it('Profile을 닫은 뒤 NewPilot 저장이 실패해도 이전 요청의 오류 안내를 반환하지 않는다', async () => {
  const service = setup();
  await service.setUser({ id: 'user-1' });
  const response = deferred<string>();
  service.save.mockReturnValueOnce(response.promise);
  const controller = new AbortController();
  const pending = service.saveNickname('user-1', 'NewPilot', controller.signal);
  controller.abort();
  response.reject(new Error('Late failure'));
  expect(await pending).toEqual({ status: 'ignored' });
  expect(service.store.getState().nickname).toBe('Pilot7');
});

it('user-2가 로그인한 동안 user-1의 폼이 저장을 요청해도 서버에 보내지 않는다', async () => {
  const service = setup();
  await service.setUser({ id: 'user-2' });
  expect(await service.saveNickname('user-1', 'NewPilot', new AbortController().signal))
    .toEqual({ status: 'ignored' });
  expect(service.save).not.toHaveBeenCalled();
});

it('Profile을 닫은 뒤 NewPilot 저장이 성공하면 계정 이름은 NewPilot으로 갱신하고 폼 안내는 무시한다', async () => {
  const service = setup();
  await service.setUser({ id: 'user-1' });
  const response = deferred<string>();
  service.save.mockReturnValueOnce(response.promise);
  const controller = new AbortController();
  const pending = service.saveNickname('user-1', 'NewPilot', controller.signal);
  controller.abort();
  response.resolve('NewPilot');
  expect(await pending).toEqual({ status: 'ignored' });
  expect(service.store.getState()).toEqual({ userId: 'user-1', nickname: 'NewPilot', status: 'ready', saving: false });
});

it('FirstPilot 저장 중 Profile을 닫고 다시 열어도 SecondPilot은 무시하고 FirstPilot 완료 후 저장해야 SecondPilot이 된다', async () => {
  const service = setup();
  await service.setUser({ id: 'user-1' });
  const response = deferred<string>();
  service.save.mockReturnValueOnce(response.promise);
  const closedForm = new AbortController();
  const first = service.saveNickname('user-1', 'FirstPilot', closedForm.signal);
  closedForm.abort();
  await service.setUser({ id: 'user-1' });
  const reopenedForm = new AbortController();
  expect(await service.saveNickname('user-1', 'SecondPilot', reopenedForm.signal)).toEqual({ status: 'ignored' });
  expect(service.save).toHaveBeenCalledExactlyOnceWith('user-1', 'FirstPilot');
  expect(service.store.getState().saving).toBe(true);
  response.resolve('FirstPilot');
  expect(await first).toEqual({ status: 'ignored' });
  expect(service.store.getState().nickname).toBe('FirstPilot');
  expect(service.store.getState().saving).toBe(false);
  expect(await service.saveNickname('user-1', 'SecondPilot', reopenedForm.signal)).toEqual({ status: 'saved' });
  expect(service.save).toHaveBeenCalledTimes(2);
  expect(service.store.getState().nickname).toBe('SecondPilot');
  expect(service.store.getState().saving).toBe(false);
});

it('FirstPilot 저장 중 user-1이 재로그인하면 saving과 연동 대기를 유지하고 완료 후 SecondPilot을 저장한다', async () => {
  const service = setup();
  await service.setUser({ id: 'user-1' });
  const response = deferred<string>();
  const linked = deferred<Awaited<ReturnType<typeof service.link>>>();
  service.save.mockReturnValueOnce(response.promise);
  service.link.mockReturnValueOnce(linked.promise);
  const closedForm = new AbortController();
  const first = service.saveNickname('user-1', 'FirstPilot', closedForm.signal);
  closedForm.abort();
  await service.setUser(null);
  const relogin = service.setUser({ id: 'user-1' });
  const reopenedForm = new AbortController();
  expect(service.store.getState()).toEqual({ userId: 'user-1', nickname: null, status: 'loading', saving: true });
  expect(await service.saveNickname('user-1', 'SecondPilot', reopenedForm.signal)).toEqual({ status: 'ignored' });
  expect(service.save).toHaveBeenCalledExactlyOnceWith('user-1', 'FirstPilot');
  expect(service.link).toHaveBeenCalledTimes(1);

  response.resolve('FirstPilot');
  expect(await first).toEqual({ status: 'ignored' });
  expect(service.store.getState()).toEqual({ userId: 'user-1', nickname: 'FirstPilot', status: 'loading', saving: false });
  linked.resolve({ nickname: 'FirstPilot', first_link: false, first_link_guest_nickname: null });
  await relogin;
  expect(service.link).toHaveBeenCalledTimes(2);
  expect(service.store.getState().status).toBe('ready');
  expect(await service.saveNickname('user-1', 'SecondPilot', reopenedForm.signal)).toEqual({ status: 'saved' });
  expect(service.save).toHaveBeenNthCalledWith(2, 'user-1', 'SecondPilot');
  expect(service.store.getState()).toEqual({ userId: 'user-1', nickname: 'SecondPilot', status: 'ready', saving: false });
});

it('user-1 재로그인 중 FirstPilot 저장이 500으로 실패해도 연동으로 Pilot7을 불러오고 SecondPilot을 저장한다', async () => {
  const service = setup();
  await service.setUser({ id: 'user-1' });
  const response = deferred<string>();
  service.save.mockReturnValueOnce(response.promise);
  const closedForm = new AbortController();
  const first = service.saveNickname('user-1', 'FirstPilot', closedForm.signal);
  closedForm.abort();
  await service.setUser(null);
  const relogin = service.setUser({ id: 'user-1' });
  expect(service.store.getState().saving).toBe(true);
  expect(service.link).toHaveBeenCalledTimes(1);

  response.reject(new Error('HTTP 500'));
  expect(await first).toEqual({ status: 'ignored' });
  await relogin;
  expect(service.link).toHaveBeenCalledTimes(2);
  expect(service.store.getState()).toEqual({ userId: 'user-1', nickname: 'Pilot7', status: 'ready', saving: false });
  expect(await service.saveNickname('user-1', 'SecondPilot', new AbortController().signal)).toEqual({ status: 'saved' });
  expect(service.store.getState().nickname).toBe('SecondPilot');
});

it.each([
  { userId: 'user-2', nickname: 'Pilot7' },
  { userId: null, nickname: null },
])(
  'user-1의 NewPilot 저장 중 userId=$userId로 바꾸면 늦은 성공은 nickname=$nickname을 유지한다', async ({ userId, nickname }) => {
    const service = setup();
    await service.setUser({ id: 'user-1' });
    const response = deferred<string>();
    service.save.mockReturnValueOnce(response.promise);
    const controller = new AbortController();
    const pending = service.saveNickname('user-1', 'NewPilot', controller.signal);
    await service.setUser(userId ? { id: userId } : null);
    response.resolve('NewPilot');
    expect(await pending).toEqual({ status: 'ignored' });
    expect(service.store.getState()).toEqual({ userId, nickname, status: 'ready', saving: false });
  },
);

it(
  'user-1의 FirstPilot 저장 중 user-2는 SecondPilot을 저장하고 user-1 응답은 user-2의 이름과 saving을 바꾸지 않는다', async () => {
    const service = setup();
    await service.setUser({ id: 'user-1' });
    const firstResponse = deferred<string>();
    const secondResponse = deferred<string>();
    service.save.mockReturnValueOnce(firstResponse.promise).mockReturnValueOnce(secondResponse.promise);
    const signal = new AbortController().signal;
    const first = service.saveNickname('user-1', 'FirstPilot', signal);
    const userId = 'user-2';
    await service.setUser({ id: userId });
    expect(service.store.getState().saving).toBe(false);
    const second = service.saveNickname(userId, 'SecondPilot', signal);
    expect(service.save).toHaveBeenCalledTimes(2);
    firstResponse.resolve('FirstPilot');
    expect(await first).toEqual({ status: 'ignored' });
    expect(service.store.getState().saving).toBe(true);
    expect(service.store.getState().nickname).toBe('Pilot7');
    expect(await service.saveNickname(userId, 'ThirdPilot', signal)).toEqual({ status: 'ignored' });
    expect(service.save).toHaveBeenCalledTimes(2);
    secondResponse.resolve('SecondPilot');
    expect(await second).toEqual({ status: 'saved' });
    expect(service.store.getState().nickname).toBe('SecondPilot');
    expect(service.store.getState().saving).toBe(false);
  },
);

it('user-1 FirstPilot 저장 중 user-2가 SecondPilot을 저장한 뒤 user-1로 돌아오면 FirstPilot 완료 전까지 연동·추가 저장을 하지 않는다', async () => {
  const service = setup();
  await service.setUser({ id: 'user-1' });
  const firstResponse = deferred<string>();
  const secondResponse = deferred<string>();
  service.save.mockReturnValueOnce(firstResponse.promise).mockReturnValueOnce(secondResponse.promise);
  const signal = new AbortController().signal;
  const first = service.saveNickname('user-1', 'FirstPilot', signal);
  await service.setUser({ id: 'user-2' });
  const second = service.saveNickname('user-2', 'SecondPilot', signal);
  service.link.mockClear();
  const back = service.setUser({ id: 'user-1' });
  expect(service.store.getState().saving).toBe(true);
  await Promise.resolve();
  expect(service.link).not.toHaveBeenCalled();
  expect(await service.saveNickname('user-1', 'ThirdPilot', signal)).toEqual({ status: 'ignored' });
  expect(service.save).toHaveBeenCalledTimes(2);
  service.link.mockResolvedValueOnce({ nickname: 'FirstPilot', first_link: false, first_link_guest_nickname: null });
  firstResponse.resolve('FirstPilot');
  await first;
  await back;
  expect(service.link).toHaveBeenCalledTimes(1);
  expect(service.store.getState()).toEqual({ userId: 'user-1', nickname: 'FirstPilot', status: 'ready', saving: false });
  secondResponse.resolve('SecondPilot');
  expect(await second).toEqual({ status: 'ignored' });
  expect(service.store.getState().nickname).toBe('FirstPilot');
});

it('user-1이 NewPilot을 저장하면 응답 전 Pilot7을 유지하고 성공 후 서버 이름 NewPilot을 확정한다', async () => {
  const service = setup();
  await service.setUser({ id: 'user-1' });
  const response = deferred<string>();
  service.save.mockReturnValueOnce(response.promise);
  const pending = service.saveNickname('user-1', 'NewPilot', new AbortController().signal);
  expect(service.save).toHaveBeenCalledWith('user-1', 'NewPilot');
  expect(service.store.getState().nickname).toBe('Pilot7');
  response.resolve('NewPilot');
  expect(await pending).toEqual({ status: 'saved' });
  expect(service.store.getState().nickname).toBe('NewPilot');
});

it('a b를 저장하면 공백 오류를 반환하고 서버 요청 없이 Pilot7을 유지한다', async () => {
  const service = setup();
  await service.setUser({ id: 'user-1' });
  expect(await service.saveNickname('user-1', 'a b', new AbortController().signal))
    .toEqual({ status: 'error', message: 'Nicknames cannot contain spaces.' });
  expect(service.save).not.toHaveBeenCalled();
  expect(service.link).toHaveBeenCalledOnce();
  expect(service.store.getState().nickname).toBe('Pilot7');
});

it('user-1의 NewPilot 저장이 500으로 실패하면 status ready를 유지한 채 연동으로 다시 읽어 서버에 반영된 NewPilot을 계정 이름으로 둔다', async () => {
  const service = setup();
  await service.setUser({ id: 'user-1' });
  service.save.mockRejectedValueOnce(new Error('HTTP 500'));
  const refreshed = deferred<LinkResult>();
  service.link.mockReturnValueOnce(refreshed.promise);
  expect(await service.saveNickname('user-1', 'NewPilot', new AbortController().signal)).toEqual(SAVE_ERROR);
  expect(service.link).toHaveBeenCalledTimes(2);
  expect(service.link).toHaveBeenLastCalledWith('Guest000042');
  expect(service.store.getState()).toEqual({ userId: 'user-1', nickname: 'Pilot7', status: 'ready', saving: false });
  refreshed.resolve({ nickname: 'NewPilot', first_link: false, first_link_guest_nickname: null });
  await flushBackground();
  expect(service.store.getState()).toEqual({ userId: 'user-1', nickname: 'NewPilot', status: 'ready', saving: false });
});

it('Profile을 닫은 뒤 NewPilot 저장이 실패해도 같은 로그인이면 다시 읽은 서버 이름 NewPilot을 계정에 반영한다', async () => {
  const service = setup();
  await service.setUser({ id: 'user-1' });
  const response = deferred<string>();
  service.save.mockReturnValueOnce(response.promise);
  service.link.mockResolvedValueOnce({ nickname: 'NewPilot', first_link: false, first_link_guest_nickname: null });
  const closedForm = new AbortController();
  const pending = service.saveNickname('user-1', 'NewPilot', closedForm.signal);
  closedForm.abort();
  response.reject(new Error('Timed out'));
  expect(await pending).toEqual({ status: 'ignored' });
  await flushBackground();
  expect(service.link).toHaveBeenCalledTimes(2);
  expect(service.store.getState().nickname).toBe('NewPilot');
});

it('NewPilot 저장 실패 뒤 다시 읽는 동안 SecondPilot 저장이 성공하면 늦게 온 연동 응답 Pilot7은 SecondPilot을 덮지 않는다', async () => {
  const service = setup();
  await service.setUser({ id: 'user-1' });
  service.save.mockRejectedValueOnce(new Error('HTTP 500'));
  const refreshed = deferred<LinkResult>();
  service.link.mockReturnValueOnce(refreshed.promise);
  const signal = new AbortController().signal;
  expect(await service.saveNickname('user-1', 'NewPilot', signal)).toEqual(SAVE_ERROR);
  expect(await service.saveNickname('user-1', 'SecondPilot', signal)).toEqual({ status: 'saved' });
  refreshed.resolve({ nickname: 'Pilot7', first_link: false, first_link_guest_nickname: null });
  await flushBackground();
  expect(service.store.getState()).toEqual({ userId: 'user-1', nickname: 'SecondPilot', status: 'ready', saving: false });
});

it('user-1 저장 실패 뒤 다시 읽는 중 로그아웃하면 늦게 온 NewPilot 응답은 비운 계정 닉네임을 채우지 않는다', async () => {
  const service = setup();
  await service.setUser({ id: 'user-1' });
  service.save.mockRejectedValueOnce(new Error('HTTP 500'));
  const refreshed = deferred<LinkResult>();
  service.link.mockReturnValueOnce(refreshed.promise);
  expect(await service.saveNickname('user-1', 'NewPilot', new AbortController().signal)).toEqual(SAVE_ERROR);
  await service.setUser(null);
  refreshed.resolve({ nickname: 'NewPilot', first_link: false, first_link_guest_nickname: null });
  await flushBackground();
  expect(service.store.getState()).toEqual({ userId: null, nickname: null, status: 'ready', saving: false });
});

it('user-1 저장 중 user-2로 바꾼 뒤 그 저장이 실패하면 user-2 세션의 연동으로 다시 읽지 않는다', async () => {
  const service = setup();
  await service.setUser({ id: 'user-1' });
  const response = deferred<string>();
  service.save.mockReturnValueOnce(response.promise);
  const pending = service.saveNickname('user-1', 'NewPilot', new AbortController().signal);
  await service.setUser({ id: 'user-2' });
  response.reject(new Error('HTTP 500'));
  expect(await pending).toEqual({ status: 'ignored' });
  await flushBackground();
  expect(service.link).toHaveBeenCalledTimes(2);
  expect(service.store.getState()).toEqual({ userId: 'user-2', nickname: 'Pilot7', status: 'ready', saving: false });
});

it('NewPilot 저장 실패 뒤 다시 읽는 연동도 500이면 Pilot7·ready를 유지하고 불러오기 error로 바꾸지 않는다', async () => {
  const service = setup();
  await service.setUser({ id: 'user-1' });
  service.save.mockRejectedValueOnce(new Error('HTTP 500'));
  service.link.mockRejectedValueOnce(new Error('HTTP 500'));
  expect(await service.saveNickname('user-1', 'NewPilot', new AbortController().signal)).toEqual(SAVE_ERROR);
  await flushBackground();
  expect(service.link).toHaveBeenCalledTimes(2);
  expect(service.store.getState()).toEqual({ userId: 'user-1', nickname: 'Pilot7', status: 'ready', saving: false });
});

it('NewPilot 저장이 500으로 실패하면 Pilot7을 유지하고 같은 NewPilot 재시도로 저장할 수 있다', async () => {
  const service = setup();
  await service.setUser({ id: 'user-1' });
  service.save.mockRejectedValueOnce(new Error('HTTP 500'));
  const signal = new AbortController().signal;
  expect(await service.saveNickname('user-1', 'NewPilot', signal))
    .toEqual({ status: 'error', message: "Couldn't save your nickname. Please try again." });
  expect(service.store.getState().nickname).toBe('Pilot7');
  expect(await service.saveNickname('user-1', 'NewPilot', signal)).toEqual({ status: 'saved' });
  expect(service.store.getState().nickname).toBe('NewPilot');
});

it('user-1의 중복 SIGNED_IN은 연동을 반복하지 않고 user-2 전환·로그아웃 후 재로그인은 다시 연동한다', async () => {
  const service = setup();
  const first = service.setUser({ id: 'user-1' });
  await service.setUser({ id: 'user-1' });
  await first;
  await service.setUser({ id: 'user-1' });
  expect(service.link).toHaveBeenCalledTimes(1);
  await service.setUser({ id: 'user-2' });
  expect(service.link).toHaveBeenCalledTimes(2);
  await service.setUser(null);
  expect(service.store.getState()).toEqual({ userId: null, nickname: null, status: 'ready', saving: false });
  await service.setUser({ id: 'user-2' });
  expect(service.link).toHaveBeenCalledTimes(3);
});

it('익명 user-1은 연동하지 않고 같은 id의 정식 계정 전환 때 한 번 연동한다', async () => {
  const service = setup();
  await service.setUser({ id: 'user-1', is_anonymous: true });
  expect(service.link).not.toHaveBeenCalled();
  expect(service.store.getState().userId).toBeNull();
  await service.setUser({ id: 'user-1', is_anonymous: false });
  expect(service.link).toHaveBeenCalledOnce();
});

it('첫 연동에서 충돌 대체 Guest999999를 받으면 계정에 적용하고 기기는 Guest000042와 Guest999999를 제외해 교체한다', async () => {
  const service = setup();
  service.link.mockResolvedValueOnce({ nickname: 'Guest999999', first_link: true, first_link_guest_nickname: 'Guest000042' });
  await service.setUser({ id: 'user-1' });
  expect(service.store.getState().nickname).toBe('Guest999999');
  expect(service.guest.rotate).toHaveBeenCalledExactlyOnceWith('Guest000042', 'Guest999999');
});

it('로그아웃 후 첫 연동 성공이 도착하면 계정은 비운 채 인계된 Guest000042만 교체한다', async () => {
  const service = setup();
  const response = deferred<{ nickname: string; first_link: boolean; first_link_guest_nickname: string | null }>();
  service.link.mockReturnValueOnce(response.promise);
  const old = service.setUser({ id: 'user-1' });
  await service.setUser(null);
  response.resolve({ nickname: 'Guest000042', first_link: true, first_link_guest_nickname: 'Guest000042' });
  await old;
  expect(service.store.getState()).toEqual({ userId: null, nickname: null, status: 'ready', saving: false });
  expect(service.guest.rotate).toHaveBeenCalledExactlyOnceWith('Guest000042', 'Guest000042');
});

it('연동 실패는 error로 남고 중복 SIGNED_IN 대신 Retry로 다시 요청해 Pilot7을 불러온다', async () => {
  const service = setup();
  service.link.mockRejectedValueOnce(new Error('HTTP 500'));
  await service.setUser({ id: 'user-1' });
  expect(service.store.getState()).toEqual({ userId: 'user-1', nickname: null, status: 'error', saving: false });
  await service.setUser({ id: 'user-1' });
  expect(service.link).toHaveBeenCalledTimes(1);
  const retrying = service.retryLoad();
  expect(service.store.getState().status).toBe('loading');
  await retrying;
  expect(service.store.getState()).toEqual({ userId: 'user-1', nickname: 'Pilot7', status: 'ready', saving: false });
  expect(service.link).toHaveBeenCalledTimes(2);
  expect(service.guest.rotate).not.toHaveBeenCalled();
});

it('첫 연동 응답 유실 후 Retry가 Guest999999와 최초 기기 Guest000042를 반환하면 기기 이름을 교체한다', async () => {
  const service = setup();
  service.link.mockRejectedValueOnce(new Error('Response lost'));
  await service.setUser({ id: 'user-1' });
  expect(service.store.getState().status).toBe('error');
  expect(service.guest.rotate).not.toHaveBeenCalled();
  service.link.mockResolvedValueOnce({ nickname: 'Guest999999', first_link: false, first_link_guest_nickname: 'Guest000042' });
  await service.retryLoad();
  expect(service.store.getState()).toEqual({ userId: 'user-1', nickname: 'Guest999999', status: 'ready', saving: false });
  expect(service.guest.rotate).toHaveBeenCalledExactlyOnceWith('Guest000042', 'Guest999999');
});

it('연동 중 다른 탭이 기기를 Guest000043으로 바꾸면 최초 기기 Guest000042 응답으로 다시 교체하지 않는다', async () => {
  const service = setup();
  const response = deferred<{ nickname: string; first_link: boolean; first_link_guest_nickname: string | null }>();
  service.link.mockReturnValueOnce(response.promise);
  const pending = service.setUser({ id: 'user-1' });
  expect(service.link).toHaveBeenCalledWith('Guest000042');
  service.guest.get.mockReturnValue('Guest000043');
  response.resolve({ nickname: 'Guest000043', first_link: false, first_link_guest_nickname: 'Guest000042' });
  await pending;
  expect(service.store.getState().nickname).toBe('Guest000043');
  expect(service.guest.rotate).not.toHaveBeenCalled();
});

it.each([false, true])(
  'first_link %s여도 최초 기기 이름이 null이면 수동 변경한 Guest000042와 같은 기기 이름을 교체하지 않는다',
  async first_link => {
    const service = setup();
    service.link.mockResolvedValueOnce({ nickname: 'Guest000042', first_link, first_link_guest_nickname: null });
    await service.setUser({ id: 'user-1' });
    expect(service.store.getState().nickname).toBe('Guest000042');
    expect(service.guest.rotate).not.toHaveBeenCalled();
  },
);

it('첫 연동 기기가 Guest000041이면 현재 기기와 계정 이름이 Guest000042로 같아도 교체하지 않는다', async () => {
  const service = setup();
  service.link.mockResolvedValueOnce({
    nickname: 'Guest000042', first_link: true, first_link_guest_nickname: 'Guest000041',
  });
  await service.setUser({ id: 'user-1' });
  expect(service.guest.rotate).not.toHaveBeenCalled();
});

it('연동 응답의 최초 기기 Guest000043이 현재 기기와 같으면 요청 때의 Guest000042와 달라도 교체한다', async () => {
  const service = setup();
  const response = deferred<Awaited<ReturnType<typeof service.link>>>();
  service.link.mockReturnValueOnce(response.promise);
  const pending = service.setUser({ id: 'user-1' });
  service.guest.get.mockReturnValue('Guest000043');
  response.resolve({ nickname: 'Pilot7', first_link: false, first_link_guest_nickname: 'Guest000043' });
  await pending;
  expect(service.guest.rotate).toHaveBeenCalledExactlyOnceWith('Guest000043', 'Pilot7');
});

it('user-1 재로그인 뒤 이전 첫 연동 응답이 와도 현재 Pilot7은 유지하고 인계된 Guest000042는 교체한다', async () => {
  const service = setup();
  const response = deferred<{ nickname: string; first_link: boolean; first_link_guest_nickname: string | null }>();
  service.link.mockReturnValueOnce(response.promise);
  const old = service.setUser({ id: 'user-1' });
  await service.setUser(null);
  await service.setUser({ id: 'user-1' });
  response.resolve({ nickname: 'OldName', first_link: true, first_link_guest_nickname: 'Guest000042' });
  await old;
  expect(service.store.getState()).toEqual({ userId: 'user-1', nickname: 'Pilot7', status: 'ready', saving: false });
  expect(service.guest.rotate).toHaveBeenCalledExactlyOnceWith('Guest000042', 'OldName');
});

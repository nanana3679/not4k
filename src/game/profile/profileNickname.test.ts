import { expect, it, vi } from 'vitest';
import { createProfileNickname } from './profileNickname';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function setup() {
  const guest = { get: vi.fn(() => 'Guest000042'), rotate: vi.fn() };
  const link = vi.fn(async (_nickname: string) => ({ nickname: 'Pilot7', first_link: false, first_link_guest_nickname: null as string | null }));
  const save = vi.fn(async (_userId: string, nickname: string) => nickname);
  const profile = createProfileNickname({ guest, link, save });
  return { ...profile, guest, link, save };
}

it('user-1 초기 세션은 Guest000042로 연동하고 응답 전 loading·응답 후 Pilot7 ready가 된다', async () => {
  const profile = setup();
  const response = deferred<{ nickname: string; first_link: boolean; first_link_guest_nickname: string | null }>();
  profile.link.mockReturnValueOnce(response.promise);
  const pending = profile.setUser({ id: 'user-1' });
  expect(profile.link).toHaveBeenCalledWith('Guest000042');
  expect(profile.store.getState()).toEqual({ userId: 'user-1', nickname: null, status: 'loading', saving: false });
  response.resolve({ nickname: 'Pilot7', first_link: false, first_link_guest_nickname: null });
  await pending;
  expect(profile.store.getState()).toEqual({ userId: 'user-1', nickname: 'Pilot7', status: 'ready', saving: false });
  expect(profile.guest.rotate).not.toHaveBeenCalled();
});

it('user-1의 연동이 늦게 실패해도 user-2의 ready 상태를 error로 바꾸지 않는다', async () => {
  const profile = setup();
  const response = deferred<{ nickname: string; first_link: boolean; first_link_guest_nickname: string | null }>();
  profile.link.mockReturnValueOnce(response.promise);
  const old = profile.setUser({ id: 'user-1' });
  await profile.setUser({ id: 'user-2' });
  response.reject(new Error('Late failure'));
  await old;
  expect(profile.store.getState()).toEqual({ userId: 'user-2', nickname: 'Pilot7', status: 'ready', saving: false });
});

it('Profile을 닫은 뒤 NewPilot 저장이 실패해도 이전 요청의 오류 안내를 반환하지 않는다', async () => {
  const profile = setup();
  await profile.setUser({ id: 'user-1' });
  const response = deferred<string>();
  profile.save.mockReturnValueOnce(response.promise);
  const controller = new AbortController();
  const pending = profile.saveNickname('user-1', 'NewPilot', controller.signal);
  controller.abort();
  response.reject(new Error('Late failure'));
  expect(await pending).toEqual({ status: 'ignored' });
  expect(profile.store.getState().nickname).toBe('Pilot7');
});

it('user-2가 로그인한 동안 user-1의 폼이 저장을 요청해도 서버에 보내지 않는다', async () => {
  const profile = setup();
  await profile.setUser({ id: 'user-2' });
  expect(await profile.saveNickname('user-1', 'NewPilot', new AbortController().signal))
    .toEqual({ status: 'ignored' });
  expect(profile.save).not.toHaveBeenCalled();
});

it('Profile을 닫은 뒤 NewPilot 저장이 성공하면 계정 이름은 NewPilot으로 갱신하고 폼 안내는 무시한다', async () => {
  const profile = setup();
  await profile.setUser({ id: 'user-1' });
  const response = deferred<string>();
  profile.save.mockReturnValueOnce(response.promise);
  const controller = new AbortController();
  const pending = profile.saveNickname('user-1', 'NewPilot', controller.signal);
  controller.abort();
  response.resolve('NewPilot');
  expect(await pending).toEqual({ status: 'ignored' });
  expect(profile.store.getState()).toEqual({ userId: 'user-1', nickname: 'NewPilot', status: 'ready', saving: false });
});

it('FirstPilot 저장 중 Profile을 닫고 다시 열어도 SecondPilot은 무시하고 FirstPilot 완료 후 저장해야 SecondPilot이 된다', async () => {
  const profile = setup();
  await profile.setUser({ id: 'user-1' });
  const response = deferred<string>();
  profile.save.mockReturnValueOnce(response.promise);
  const closedForm = new AbortController();
  const first = profile.saveNickname('user-1', 'FirstPilot', closedForm.signal);
  closedForm.abort();
  await profile.setUser({ id: 'user-1' });
  const reopenedForm = new AbortController();
  expect(await profile.saveNickname('user-1', 'SecondPilot', reopenedForm.signal)).toEqual({ status: 'ignored' });
  expect(profile.save).toHaveBeenCalledExactlyOnceWith('user-1', 'FirstPilot');
  expect(profile.store.getState().saving).toBe(true);
  response.resolve('FirstPilot');
  expect(await first).toEqual({ status: 'ignored' });
  expect(profile.store.getState().nickname).toBe('FirstPilot');
  expect(profile.store.getState().saving).toBe(false);
  expect(await profile.saveNickname('user-1', 'SecondPilot', reopenedForm.signal)).toEqual({ status: 'saved' });
  expect(profile.save).toHaveBeenCalledTimes(2);
  expect(profile.store.getState().nickname).toBe('SecondPilot');
  expect(profile.store.getState().saving).toBe(false);
});

it.each(['user-switch', 'sign-out-and-back'])(
  'NewPilot 저장 대기 중 %s가 발생하면 늦은 성공을 무시하고 현재 계정 이름을 유지한다', async change => {
    const profile = setup();
    await profile.setUser({ id: 'user-1' });
    const response = deferred<string>();
    profile.save.mockReturnValueOnce(response.promise);
    const controller = new AbortController();
    const pending = profile.saveNickname('user-1', 'NewPilot', controller.signal);
    if (change === 'user-switch') await profile.setUser({ id: 'user-2' });
    else {
      await profile.setUser(null);
      await profile.setUser({ id: 'user-1' });
    }
    response.resolve('NewPilot');
    expect(await pending).toEqual({ status: 'ignored' });
    expect(profile.store.getState().nickname).toBe('Pilot7');
  },
);

it.each(['user-switch', 'sign-out-and-back'])(
  'FirstPilot 저장 중 %s 후 SecondPilot을 저장하면 이전 응답은 새 세션의 saving 잠금을 풀지 않는다', async change => {
    const profile = setup();
    await profile.setUser({ id: 'user-1' });
    const firstResponse = deferred<string>();
    const secondResponse = deferred<string>();
    profile.save.mockReturnValueOnce(firstResponse.promise).mockReturnValueOnce(secondResponse.promise);
    const signal = new AbortController().signal;
    const first = profile.saveNickname('user-1', 'FirstPilot', signal);
    const userId = change === 'user-switch' ? 'user-2' : 'user-1';
    if (change === 'sign-out-and-back') await profile.setUser(null);
    await profile.setUser({ id: userId });
    expect(profile.store.getState().saving).toBe(false);
    const second = profile.saveNickname(userId, 'SecondPilot', signal);
    expect(profile.save).toHaveBeenCalledTimes(2);
    firstResponse.resolve('FirstPilot');
    expect(await first).toEqual({ status: 'ignored' });
    expect(profile.store.getState().saving).toBe(true);
    expect(profile.store.getState().nickname).toBe('Pilot7');
    expect(await profile.saveNickname(userId, 'ThirdPilot', signal)).toEqual({ status: 'ignored' });
    expect(profile.save).toHaveBeenCalledTimes(2);
    secondResponse.resolve('SecondPilot');
    expect(await second).toEqual({ status: 'saved' });
    expect(profile.store.getState().nickname).toBe('SecondPilot');
    expect(profile.store.getState().saving).toBe(false);
  },
);

it('user-1이 NewPilot을 저장하면 응답 전 Pilot7을 유지하고 성공 후 서버 이름 NewPilot을 확정한다', async () => {
  const profile = setup();
  await profile.setUser({ id: 'user-1' });
  const response = deferred<string>();
  profile.save.mockReturnValueOnce(response.promise);
  const pending = profile.saveNickname('user-1', 'NewPilot', new AbortController().signal);
  expect(profile.save).toHaveBeenCalledWith('user-1', 'NewPilot');
  expect(profile.store.getState().nickname).toBe('Pilot7');
  response.resolve('NewPilot');
  expect(await pending).toEqual({ status: 'saved' });
  expect(profile.store.getState().nickname).toBe('NewPilot');
});

it('a b를 저장하면 공백 오류를 반환하고 서버 요청 없이 Pilot7을 유지한다', async () => {
  const profile = setup();
  await profile.setUser({ id: 'user-1' });
  expect(await profile.saveNickname('user-1', 'a b', new AbortController().signal))
    .toEqual({ status: 'error', message: 'Nicknames cannot contain spaces.' });
  expect(profile.save).not.toHaveBeenCalled();
  expect(profile.store.getState().nickname).toBe('Pilot7');
});

it('NewPilot 저장이 500으로 실패하면 Pilot7을 유지하고 같은 NewPilot 재시도로 저장할 수 있다', async () => {
  const profile = setup();
  await profile.setUser({ id: 'user-1' });
  profile.save.mockRejectedValueOnce(new Error('HTTP 500'));
  const signal = new AbortController().signal;
  expect(await profile.saveNickname('user-1', 'NewPilot', signal))
    .toEqual({ status: 'error', message: "Couldn't save your nickname. Please try again." });
  expect(profile.store.getState().nickname).toBe('Pilot7');
  expect(await profile.saveNickname('user-1', 'NewPilot', signal)).toEqual({ status: 'saved' });
  expect(profile.store.getState().nickname).toBe('NewPilot');
});

it('user-1의 중복 SIGNED_IN은 연동을 반복하지 않고 user-2 전환·로그아웃 후 재로그인은 다시 연동한다', async () => {
  const profile = setup();
  const first = profile.setUser({ id: 'user-1' });
  await profile.setUser({ id: 'user-1' });
  await first;
  await profile.setUser({ id: 'user-1' });
  expect(profile.link).toHaveBeenCalledTimes(1);
  await profile.setUser({ id: 'user-2' });
  expect(profile.link).toHaveBeenCalledTimes(2);
  await profile.setUser(null);
  expect(profile.store.getState()).toEqual({ userId: null, nickname: null, status: 'ready', saving: false });
  await profile.setUser({ id: 'user-2' });
  expect(profile.link).toHaveBeenCalledTimes(3);
});

it('익명 user-1은 연동하지 않고 같은 id의 정식 계정 전환 때 한 번 연동한다', async () => {
  const profile = setup();
  await profile.setUser({ id: 'user-1', is_anonymous: true });
  expect(profile.link).not.toHaveBeenCalled();
  expect(profile.store.getState().userId).toBeNull();
  await profile.setUser({ id: 'user-1', is_anonymous: false });
  expect(profile.link).toHaveBeenCalledOnce();
});

it('첫 연동에서 충돌 대체 Guest999999를 받으면 계정에 적용하고 기기는 Guest000042와 Guest999999를 제외해 교체한다', async () => {
  const profile = setup();
  profile.link.mockResolvedValueOnce({ nickname: 'Guest999999', first_link: true, first_link_guest_nickname: 'Guest000042' });
  await profile.setUser({ id: 'user-1' });
  expect(profile.store.getState().nickname).toBe('Guest999999');
  expect(profile.guest.rotate).toHaveBeenCalledExactlyOnceWith('Guest000042', 'Guest999999');
});

it('로그아웃 후 첫 연동 성공이 도착하면 계정은 비운 채 인계된 Guest000042만 교체한다', async () => {
  const profile = setup();
  const response = deferred<{ nickname: string; first_link: boolean; first_link_guest_nickname: string | null }>();
  profile.link.mockReturnValueOnce(response.promise);
  const old = profile.setUser({ id: 'user-1' });
  await profile.setUser(null);
  response.resolve({ nickname: 'Guest000042', first_link: true, first_link_guest_nickname: 'Guest000042' });
  await old;
  expect(profile.store.getState()).toEqual({ userId: null, nickname: null, status: 'ready', saving: false });
  expect(profile.guest.rotate).toHaveBeenCalledExactlyOnceWith('Guest000042', 'Guest000042');
});

it('연동 실패는 error로 남고 중복 SIGNED_IN 대신 Retry로 다시 요청해 Pilot7을 불러온다', async () => {
  const profile = setup();
  profile.link.mockRejectedValueOnce(new Error('HTTP 500'));
  await profile.setUser({ id: 'user-1' });
  expect(profile.store.getState()).toEqual({ userId: 'user-1', nickname: null, status: 'error', saving: false });
  await profile.setUser({ id: 'user-1' });
  expect(profile.link).toHaveBeenCalledTimes(1);
  const retry = profile.retry();
  expect(profile.store.getState().status).toBe('loading');
  await retry;
  expect(profile.store.getState()).toEqual({ userId: 'user-1', nickname: 'Pilot7', status: 'ready', saving: false });
  expect(profile.link).toHaveBeenCalledTimes(2);
  expect(profile.guest.rotate).not.toHaveBeenCalled();
});

it('첫 연동 응답 유실 후 Retry가 Guest999999와 최초 기기 Guest000042를 반환하면 기기 이름을 교체한다', async () => {
  const profile = setup();
  profile.link.mockRejectedValueOnce(new Error('Response lost'));
  await profile.setUser({ id: 'user-1' });
  expect(profile.store.getState().status).toBe('error');
  expect(profile.guest.rotate).not.toHaveBeenCalled();
  profile.link.mockResolvedValueOnce({ nickname: 'Guest999999', first_link: false, first_link_guest_nickname: 'Guest000042' });
  await profile.retry();
  expect(profile.store.getState()).toEqual({ userId: 'user-1', nickname: 'Guest999999', status: 'ready', saving: false });
  expect(profile.guest.rotate).toHaveBeenCalledExactlyOnceWith('Guest000042', 'Guest999999');
});

it('연동 중 다른 탭이 기기를 Guest000043으로 바꾸면 최초 기기 Guest000042 응답으로 다시 교체하지 않는다', async () => {
  const profile = setup();
  const response = deferred<{ nickname: string; first_link: boolean; first_link_guest_nickname: string | null }>();
  profile.link.mockReturnValueOnce(response.promise);
  const pending = profile.setUser({ id: 'user-1' });
  expect(profile.link).toHaveBeenCalledWith('Guest000042');
  profile.guest.get.mockReturnValue('Guest000043');
  response.resolve({ nickname: 'Guest000043', first_link: false, first_link_guest_nickname: 'Guest000042' });
  await pending;
  expect(profile.store.getState().nickname).toBe('Guest000043');
  expect(profile.guest.rotate).not.toHaveBeenCalled();
});

it.each([false, true])(
  'first_link %s여도 최초 기기 이름이 null이면 수동 변경한 Guest000042와 같은 기기 이름을 교체하지 않는다',
  async first_link => {
    const profile = setup();
    profile.link.mockResolvedValueOnce({ nickname: 'Guest000042', first_link, first_link_guest_nickname: null });
    await profile.setUser({ id: 'user-1' });
    expect(profile.store.getState().nickname).toBe('Guest000042');
    expect(profile.guest.rotate).not.toHaveBeenCalled();
  },
);

it('첫 연동 기기가 Guest000041이면 현재 기기와 계정 이름이 Guest000042로 같아도 교체하지 않는다', async () => {
  const profile = setup();
  profile.link.mockResolvedValueOnce({
    nickname: 'Guest000042', first_link: true, first_link_guest_nickname: 'Guest000041',
  });
  await profile.setUser({ id: 'user-1' });
  expect(profile.guest.rotate).not.toHaveBeenCalled();
});

it('연동 응답의 최초 기기 Guest000043이 현재 기기와 같으면 요청 때의 Guest000042와 달라도 교체한다', async () => {
  const profile = setup();
  const response = deferred<Awaited<ReturnType<typeof profile.link>>>();
  profile.link.mockReturnValueOnce(response.promise);
  const pending = profile.setUser({ id: 'user-1' });
  profile.guest.get.mockReturnValue('Guest000043');
  response.resolve({ nickname: 'Pilot7', first_link: false, first_link_guest_nickname: 'Guest000043' });
  await pending;
  expect(profile.guest.rotate).toHaveBeenCalledExactlyOnceWith('Guest000043', 'Pilot7');
});

it('user-1 재로그인 뒤 이전 첫 연동 응답이 와도 현재 Pilot7은 유지하고 인계된 Guest000042는 교체한다', async () => {
  const profile = setup();
  const response = deferred<{ nickname: string; first_link: boolean; first_link_guest_nickname: string | null }>();
  profile.link.mockReturnValueOnce(response.promise);
  const old = profile.setUser({ id: 'user-1' });
  await profile.setUser(null);
  await profile.setUser({ id: 'user-1' });
  response.resolve({ nickname: 'OldName', first_link: true, first_link_guest_nickname: 'Guest000042' });
  await old;
  expect(profile.store.getState()).toEqual({ userId: 'user-1', nickname: 'Pilot7', status: 'ready', saving: false });
  expect(profile.guest.rotate).toHaveBeenCalledExactlyOnceWith('Guest000042', 'OldName');
});

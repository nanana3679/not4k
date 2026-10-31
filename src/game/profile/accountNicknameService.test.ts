import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { accountNicknameService } from './accountNicknameService';
import { guestNickname } from './guestNickname';

// supabase-js builder는 마지막에 await하는 단계가 응답을 준다. 연동은 rpc().abortSignal(), 저장은 ….abortSignal().single()이다.
const api = vi.hoisted(() => {
  const single = vi.fn();
  const saveAbortSignal = vi.fn((_signal: AbortSignal) => ({ single }));
  const select = vi.fn(() => ({ abortSignal: saveAbortSignal }));
  const eq = vi.fn(() => ({ select }));
  const update = vi.fn(() => ({ eq }));
  const linkAbortSignal = vi.fn();
  const rpc = vi.fn(() => ({ abortSignal: linkAbortSignal }));
  return { rpc, linkAbortSignal, from: vi.fn(() => ({ update })), update, eq, select, saveAbortSignal, single };
});
vi.mock('../../supabase/client', () => ({ supabase: api }));
vi.mock('./guestNickname', () => ({ guestNickname: { get: () => 'Guest123456', rotate: vi.fn() } }));

const SAVE_ERROR = { status: 'error', message: "Couldn't save your nickname. Please try again." };

/** postgrest-js처럼 신호가 끊기면 throw 대신 error를 담은 응답으로 끝난다. */
function responseEndedBy(signal: AbortSignal) {
  return new Promise(resolve => {
    signal.addEventListener('abort', () => {
      resolve({ data: null, error: { message: 'TimeoutError: signal timed out' } });
    }, { once: true });
  });
}

beforeEach(async () => {
  await accountNicknameService.setUser(null);
  vi.clearAllMocks();
  api.linkAbortSignal.mockResolvedValue({
    data: [{ nickname: 'RoutedPilot', first_link: false, first_link_guest_nickname: null }], error: null,
  });
  api.single.mockResolvedValue({ data: { display_name: 'SavedPilot' }, error: null });
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('dev-user도 link_guest_nickname에 guest_nickname Guest123456을 보내고 RoutedPilot을 읽는다', async () => {
  await accountNicknameService.setUser({ id: 'dev-user' });
  expect(api.rpc).toHaveBeenCalledExactlyOnceWith('link_guest_nickname', { guest_nickname: 'Guest123456' });
  expect(accountNicknameService.store.getState()).toEqual({ userId: 'dev-user', nickname: 'RoutedPilot', status: 'ready', saving: false });
});

it('first_link false여도 최초 기기 Guest123456을 반환하면 기기 이름을 교체하고 RoutedPilot을 확정한다', async () => {
  api.linkAbortSignal.mockResolvedValueOnce({
    data: [{ nickname: 'RoutedPilot', first_link: false, first_link_guest_nickname: 'Guest123456' }], error: null,
  });
  await accountNicknameService.setUser({ id: 'dev-user' });
  expect(guestNickname.rotate).toHaveBeenCalledExactlyOnceWith('Guest123456', 'RoutedPilot');
  expect(accountNicknameService.store.getState().nickname).toBe('RoutedPilot');
});

it('dev-user의 SavedPilot 저장은 profiles.display_name을 id로 갱신하고 반환된 이름을 확정한다', async () => {
  await accountNicknameService.setUser({ id: 'dev-user' });
  expect(await accountNicknameService.saveNickname('dev-user', 'SavedPilot', new AbortController().signal))
    .toEqual({ status: 'saved' });
  expect(api.from).toHaveBeenCalledExactlyOnceWith('profiles');
  expect(api.update).toHaveBeenCalledExactlyOnceWith({ display_name: 'SavedPilot' });
  expect(api.eq).toHaveBeenCalledExactlyOnceWith('id', 'dev-user');
  expect(api.select).toHaveBeenCalledExactlyOnceWith('display_name');
  expect(api.single).toHaveBeenCalledOnce();
  expect(accountNicknameService.store.getState().nickname).toBe('SavedPilot');
});

it.each([
  { data: null }, { data: [] }, { data: [{ nickname: 'Pilot7' }] },
  { data: [{ nickname: 7, first_link: false }] },
  { data: [{ nickname: 'Pilot7', first_link: false }] },
  { data: [{ nickname: 'Pilot7', first_link: false, first_link_guest_nickname: 42 }] },
  { data: [{ nickname: 'Pilot7', first_link: false, first_link_guest_nickname: false }] },
  { data: [{ nickname: 'Pilot7', first_link: false, first_link_guest_nickname: {} }] },
])(
  '연동 응답 %j가 nickname 문자열·first_link 불리언·first_link_guest_nickname 문자열 또는 null 한 행이 아니면 error로 표시한다', async ({ data }) => {
    api.linkAbortSignal.mockResolvedValueOnce({ data, error: null });
    await accountNicknameService.setUser({ id: 'dev-user' });
    expect(accountNicknameService.store.getState().status).toBe('error');
  },
);

it.each([{ data: null, error: { message: 'HTTP 500' } }, { data: {}, error: null }])(
  '저장 응답 %j에 이름이 없거나 오류가 있으면 RoutedPilot을 유지한다', async response => {
    await accountNicknameService.setUser({ id: 'dev-user' });
    api.single.mockResolvedValueOnce(response);
    expect(await accountNicknameService.saveNickname('dev-user', 'SavedPilot', new AbortController().signal))
      .toEqual(SAVE_ERROR);
    expect(accountNicknameService.store.getState().nickname).toBe('RoutedPilot');
  },
);

it('연동 RPC와 닉네임 저장은 각각 AbortSignal.timeout(15000) 신호를 붙여 보낸다', async () => {
  const timeout = vi.spyOn(AbortSignal, 'timeout');
  await accountNicknameService.setUser({ id: 'dev-user' });
  expect(timeout).toHaveBeenNthCalledWith(1, 15000);
  expect(api.linkAbortSignal).toHaveBeenCalledExactlyOnceWith(timeout.mock.results[0].value);
  expect(await accountNicknameService.saveNickname('dev-user', 'SavedPilot', new AbortController().signal))
    .toEqual({ status: 'saved' });
  expect(timeout).toHaveBeenNthCalledWith(2, 15000);
  expect(api.saveAbortSignal).toHaveBeenCalledExactlyOnceWith(timeout.mock.results[1].value);
});

it('연동 응답이 15000ms 안에 오지 않아 시간 제한으로 끊기면 loading에 머물지 않고 error가 되어 Retry할 수 있다', async () => {
  const expired = new AbortController();
  vi.spyOn(AbortSignal, 'timeout').mockReturnValueOnce(expired.signal);
  api.linkAbortSignal.mockImplementationOnce((signal: AbortSignal) => responseEndedBy(signal));
  const pending = accountNicknameService.setUser({ id: 'dev-user' });
  expect(accountNicknameService.store.getState().status).toBe('loading');
  expired.abort();
  await pending;
  expect(accountNicknameService.store.getState().status).toBe('error');
  await accountNicknameService.retryLoad();
  expect(accountNicknameService.store.getState()).toEqual({ userId: 'dev-user', nickname: 'RoutedPilot', status: 'ready', saving: false });
});

it('SavedPilot 저장이 15000ms 시간 제한으로 끊기면 저장 오류를 반환하고 다시 읽은 연동으로 서버에 반영된 SavedPilot을 표시한다', async () => {
  await accountNicknameService.setUser({ id: 'dev-user' });
  const expired = new AbortController();
  vi.spyOn(AbortSignal, 'timeout').mockReturnValueOnce(expired.signal);
  api.single.mockImplementationOnce(() => responseEndedBy(expired.signal));
  api.linkAbortSignal.mockResolvedValueOnce({
    data: [{ nickname: 'SavedPilot', first_link: false, first_link_guest_nickname: null }], error: null,
  });
  const pending = accountNicknameService.saveNickname('dev-user', 'SavedPilot', new AbortController().signal);
  expect(accountNicknameService.store.getState().saving).toBe(true);
  expired.abort();
  expect(await pending).toEqual(SAVE_ERROR);
  await new Promise(resolve => setTimeout(resolve));
  expect(api.rpc).toHaveBeenCalledTimes(2);
  expect(accountNicknameService.store.getState()).toEqual({ userId: 'dev-user', nickname: 'SavedPilot', status: 'ready', saving: false });
});

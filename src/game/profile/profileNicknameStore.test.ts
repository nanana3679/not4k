import { beforeEach, expect, it, vi } from 'vitest';
import { profileNickname } from './profileNicknameStore';

const api = vi.hoisted(() => {
  const single = vi.fn();
  const select = vi.fn(() => ({ single }));
  const eq = vi.fn(() => ({ select }));
  const update = vi.fn(() => ({ eq }));
  return { rpc: vi.fn(), from: vi.fn(() => ({ update })), update, eq, select, single };
});
vi.mock('../../supabase/client', () => ({ supabase: api }));
vi.mock('./guestNickname', () => ({ guestNickname: { get: () => 'Guest123456', rotate: vi.fn() } }));

beforeEach(async () => {
  await profileNickname.setUser(null);
  vi.clearAllMocks();
  api.rpc.mockResolvedValue({ data: [{ nickname: 'RoutedPilot', first_link: false }], error: null });
  api.single.mockResolvedValue({ data: { display_name: 'SavedPilot' }, error: null });
});

it('dev-user도 link_guest_nickname에 guest_nickname Guest123456을 보내고 RoutedPilot을 읽는다', async () => {
  await profileNickname.setUser({ id: 'dev-user' });
  expect(api.rpc).toHaveBeenCalledExactlyOnceWith('link_guest_nickname', { guest_nickname: 'Guest123456' });
  expect(profileNickname.store.getState()).toEqual({ userId: 'dev-user', nickname: 'RoutedPilot', status: 'ready' });
});

it('dev-user의 SavedPilot 저장은 profiles.display_name을 id로 갱신하고 반환된 이름을 확정한다', async () => {
  await profileNickname.setUser({ id: 'dev-user' });
  expect(await profileNickname.saveNickname('dev-user', 'SavedPilot', new AbortController().signal))
    .toEqual({ status: 'saved' });
  expect(api.from).toHaveBeenCalledExactlyOnceWith('profiles');
  expect(api.update).toHaveBeenCalledExactlyOnceWith({ display_name: 'SavedPilot' });
  expect(api.eq).toHaveBeenCalledExactlyOnceWith('id', 'dev-user');
  expect(api.select).toHaveBeenCalledExactlyOnceWith('display_name');
  expect(api.single).toHaveBeenCalledOnce();
  expect(profileNickname.store.getState().nickname).toBe('SavedPilot');
});

it.each([
  { data: null }, { data: [] }, { data: [{ nickname: 'Pilot7' }] },
  { data: [{ nickname: 7, first_link: false }] },
])(
  '연동 응답 %j가 nickname·first_link 한 행이 아니면 error로 표시한다', async ({ data }) => {
    api.rpc.mockResolvedValueOnce({ data, error: null });
    await profileNickname.setUser({ id: 'dev-user' });
    expect(profileNickname.store.getState().status).toBe('error');
  },
);

it.each([{ data: null, error: { message: 'HTTP 500' } }, { data: {}, error: null }])(
  '저장 응답 %j에 이름이 없거나 오류가 있으면 RoutedPilot을 유지한다', async response => {
    await profileNickname.setUser({ id: 'dev-user' });
    api.single.mockResolvedValueOnce(response);
    expect(await profileNickname.saveNickname('dev-user', 'SavedPilot', new AbortController().signal))
      .toEqual({ status: 'error', message: "Couldn't save your nickname. Please try again." });
    expect(profileNickname.store.getState().nickname).toBe('RoutedPilot');
  },
);

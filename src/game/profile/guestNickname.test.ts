import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createGuestNickname } from './guestNickname';

const valueByKey = new Map<string, string>();
const storage = {
  getItem: vi.fn((key: string) => valueByKey.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => { valueByKey.set(key, value); }),
};
const random = vi.fn((values: Uint32Array) => { values[0] = 42; return values; });
const unsubscribes: Array<() => void> = [];

function subscribe(guest: ReturnType<typeof createGuestNickname>, listener: () => void) {
  const unsubscribe = guest.subscribe(listener);
  unsubscribes.push(unsubscribe);
  return unsubscribe;
}

function storageEvent(key: string | null, newValue: string | null) {
  window.dispatchEvent(Object.assign(new Event('storage'), { key, newValue, storageArea: storage }));
}

beforeEach(() => {
  valueByKey.clear();
  vi.clearAllMocks();
  vi.stubGlobal('window', Object.assign(new EventTarget(), { localStorage: storage }));
  vi.stubGlobal('crypto', { getRandomValues: random });
});
afterEach(() => {
  for (const unsubscribe of unsubscribes.splice(0)) unsubscribe();
  vi.unstubAllGlobals();
});

it('저장값이 없고 난수가 42이면 Guest000042를 별도 키에 저장하고 같은 페이지에서 재사용한다', () => {
  const guest = createGuestNickname();
  expect(guest.get()).toBe('Guest000042');
  expect(guest.get()).toBe('Guest000042');
  expect([...valueByKey]).toEqual([['not4k-guest-nickname', 'Guest000042']]);
  expect(random).toHaveBeenCalledOnce();
});

it('저장된 Guest999999가 있으면 새 페이지에서도 그대로 읽고 난수를 생성하지 않는다', () => {
  valueByKey.set('not4k-guest-nickname', 'Guest999999');
  expect(createGuestNickname().get()).toBe('Guest999999');
  expect(random).not.toHaveBeenCalled();
});

it.each([{ number: 0, nickname: 'Guest000000' }, { number: 999999, nickname: 'Guest999999' }])(
  '난수 $number를 생성하면 6자리 $nickname으로 저장한다', ({ number, nickname }) => {
    random.mockImplementationOnce(values => { values[0] = number; return values; });
    expect(createGuestNickname().get()).toBe(nickname);
    expect(valueByKey.get('not4k-guest-nickname')).toBe(nickname);
  },
);

it.each(['Guest12345', 'Guest1234567', 'guest123456', 'Guest１２３４５６', 'Guest123456\n', ''])(
  '저장값 %j가 Guest와 6자리 숫자가 아니면 Guest000042로 교체한다', stored => {
    valueByKey.set('not4k-guest-nickname', stored);
    expect(createGuestNickname().get()).toBe('Guest000042');
    expect(valueByKey.get('not4k-guest-nickname')).toBe('Guest000042');
  },
);

it('Guest000042를 계정에 넘기고 난수가 다시 42여도 다른 Guest 이름을 저장한다', () => {
  const guest = createGuestNickname();
  expect(guest.get()).toBe('Guest000042');
  guest.rotate('Guest000042');
  expect(guest.get()).toMatch(/^Guest\d{6}$/);
  expect(guest.get()).not.toBe('Guest000042');
  expect(createGuestNickname().get()).toBe(guest.get());
});

it.each([
  { sent: 'Guest000042', assigned: 'Guest999999', number: 999_998, expected: 'Guest000000' },
  { sent: 'Guest000000', assigned: 'Guest000001', number: 0, expected: 'Guest000002' },
  { sent: 'Guest999999', assigned: 'Guest000000', number: 999_997, expected: 'Guest999998' },
  { sent: 'Guest000042', assigned: 'Guest000042', number: 42, expected: 'Guest000043' },
  { sent: 'Guest000042', assigned: 'Pilot7', number: 42, expected: 'Guest000043' },
])('$sent 전송 후 $assigned를 배정받고 난수가 $number이면 두 이름을 제외한 $expected로 교체한다',
  ({ sent, assigned, number, expected }) => {
    valueByKey.set('not4k-guest-nickname', sent);
    const guest = createGuestNickname();
    expect(guest.get()).toBe(sent);
    random.mockImplementationOnce(values => { values[0] = number; return values; });
    guest.rotate(sent, assigned);
    expect(guest.get()).toBe(expected);
    expect(valueByKey.get('not4k-guest-nickname')).toBe(expected);
  },
);

it('Guest000042 교체를 구독하면 새 이름을 알리고 같은 인계의 늦은 응답은 다시 교체하지 않는다', () => {
  const guest = createGuestNickname();
  const changed = vi.fn();
  const unsubscribe = subscribe(guest, changed);
  expect(guest.get()).toBe('Guest000042');
  expect(changed).not.toHaveBeenCalled();
  guest.rotate('Guest000042');
  const rotated = guest.get();
  expect(changed).toHaveBeenCalledOnce();
  guest.rotate('Guest000042');
  expect(guest.get()).toBe(rotated);
  expect(changed).toHaveBeenCalledOnce();
  unsubscribe();
  guest.rotate(rotated);
  expect(changed).toHaveBeenCalledOnce();
});

it('Guest000042 교체 시 저장이 차단되어도 새 이름을 메모리에 유지하고 구독자에게 알린다', () => {
  const guest = createGuestNickname();
  expect(guest.get()).toBe('Guest000042');
  const changed = vi.fn();
  subscribe(guest, changed);
  storage.setItem.mockImplementationOnce(() => { throw new Error('Quota exceeded'); });
  guest.rotate('Guest000042');
  const rotated = guest.get();
  expect(rotated).toMatch(/^Guest\d{6}$/);
  expect(rotated).not.toBe('Guest000042');
  expect(guest.get()).toBe(rotated);
  expect(changed).toHaveBeenCalledOnce();
});

it('다른 탭이 Guest000042를 Guest999999로 바꾸면 storage 이벤트로 캐시와 구독자를 갱신한다', () => {
  const guest = createGuestNickname();
  expect(guest.get()).toBe('Guest000042');
  const changed = vi.fn();
  subscribe(guest, changed);
  valueByKey.set('not4k-guest-nickname', 'Guest999999');
  storageEvent('not4k-guest-nickname', 'Guest999999');
  expect(guest.get()).toBe('Guest999999');
  expect(changed).toHaveBeenCalledOnce();
  expect(storage.setItem).toHaveBeenCalledOnce();
});

it('구독 없이 Guest000042를 읽은 뒤 다른 탭이 Guest999999를 저장하면 다음 get은 Guest999999를 반환한다', () => {
  const guest = createGuestNickname();
  expect(guest.get()).toBe('Guest000042');
  valueByKey.set('not4k-guest-nickname', 'Guest999999');
  expect(guest.get()).toBe('Guest999999');
  expect(storage.setItem).toHaveBeenCalledOnce();
});

it('storage 이벤트 전에 다른 탭이 Guest999999를 저장하면 Guest000042의 늦은 rotate는 최신 이름을 유지하고 알린다', () => {
  const guest = createGuestNickname();
  expect(guest.get()).toBe('Guest000042');
  const changed = vi.fn();
  subscribe(guest, changed);
  valueByKey.set('not4k-guest-nickname', 'Guest999999');
  guest.rotate('Guest000042');
  expect(guest.get()).toBe('Guest999999');
  expect(valueByKey.get('not4k-guest-nickname')).toBe('Guest999999');
  expect(storage.setItem).toHaveBeenCalledOnce();
  expect(random).toHaveBeenCalledOnce();
  expect(changed).toHaveBeenCalledOnce();
});

it('구독 2개를 모두 해제하면 storage 리스너를 제거하고 재구독 때 놓친 Guest999999를 읽는다', () => {
  const add = vi.spyOn(window, 'addEventListener');
  const remove = vi.spyOn(window, 'removeEventListener');
  const guest = createGuestNickname();
  expect(guest.get()).toBe('Guest000042');
  expect(add).not.toHaveBeenCalled();
  const changed = vi.fn();
  const stopFirst = subscribe(guest, changed);
  const stopSecond = subscribe(guest, vi.fn());
  expect(add).toHaveBeenCalledOnce();
  stopFirst();
  expect(remove).not.toHaveBeenCalled();
  stopSecond();
  expect(remove).toHaveBeenCalledExactlyOnceWith('storage', add.mock.calls[0][1]);
  valueByKey.set('not4k-guest-nickname', 'Guest999999');
  storageEvent('not4k-guest-nickname', 'Guest999999');
  expect(changed).not.toHaveBeenCalled();
  subscribe(guest, changed);
  expect(guest.get()).toBe('Guest999999');
  expect(changed).toHaveBeenCalledOnce();
  expect(add).toHaveBeenCalledTimes(2);
});

it('Guest000043 저장이 차단된 뒤 Guest000042의 늦은 rotate가 와도 메모리 이름을 되돌리거나 다시 저장하지 않는다', () => {
  const guest = createGuestNickname();
  expect(guest.get()).toBe('Guest000042');
  const changed = vi.fn();
  subscribe(guest, changed);
  storage.setItem.mockImplementationOnce(() => { throw new Error('Quota exceeded'); });
  guest.rotate('Guest000042');
  expect(guest.get()).toBe('Guest000043');
  guest.rotate('Guest000042');
  expect(guest.get()).toBe('Guest000043');
  expect(storage.setItem).toHaveBeenCalledTimes(2);
  expect(changed).toHaveBeenCalledOnce();
});

it.each(['access', 'getItem', 'setItem'] as const)(
  'localStorage %s가 예외를 던져도 Guest000042를 페이지 메모리에서 재사용한다', operation => {
    const fail = () => { throw new Error('Storage blocked'); };
    if (operation === 'access') vi.stubGlobal('window', { get localStorage() { return fail(); } });
    else storage[operation].mockImplementationOnce(fail);
    const guest = createGuestNickname();
    expect(guest.get()).toBe('Guest000042');
    expect(guest.get()).toBe('Guest000042');
    expect(random).toHaveBeenCalledOnce();
  },
);

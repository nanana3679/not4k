const STORAGE_KEY = 'not4k-guest-nickname';

function generateGuestNickname(excluded: string[] = []): string {
  const excludedNumbers = [...new Set(excluded.filter(name => /^Guest\d{6}$/.test(name))
    .map(name => Number(name.slice(5))))].sort((a, b) => a - b);
  const values = crypto.getRandomValues(new Uint32Array(1));
  let number = values[0] % (1_000_000 - excludedNumbers.length);
  for (const excludedNumber of excludedNumbers) {
    if (number >= excludedNumber) number++;
  }
  return `Guest${String(number).padStart(6, '0')}`;
}

/** 페이지 수명 동안 같은 이름을 사용한다. 생성만으로는 storage에 접근하지 않는다. */
export function createGuestNickname() {
  let nickname: string | null = null;
  let lastStoredNickname: string | null = null;
  const listeners = new Set<() => void>();
  const readStored = () => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      return stored && /^Guest\d{6}$/.test(stored) ? stored : null;
    } catch {
      return null;
    }
  };
  const notify = () => { for (const listener of listeners) listener(); };
  const refresh = () => {
    const stored = readStored();
    if (stored && stored !== lastStoredNickname) {
      lastStoredNickname = stored;
      if (stored !== nickname) {
        nickname = stored;
        notify();
      }
    }
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    try {
      if (event.storageArea !== window.localStorage) return;
    } catch { return; }
    refresh();
  };
  const save = (value: string) => {
    nickname = value;
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
      lastStoredNickname = value;
    } catch { /* 메모리 값 유지: 이전 저장값을 다시 읽어도 되돌리지 않는다. */ }
    return value;
  };
  const get = (): string => {
    if (nickname !== null) {
      // 구독이 없는 동안에는 storage 이벤트를 받지 않으므로 읽을 때 따라잡는다.
      if (listeners.size === 0) refresh();
      return nickname;
    }
    const stored = readStored();
    if (stored) return nickname = lastStoredNickname = stored;
    return save(generateGuestNickname());
  };
  return {
    get,
    rotate(expectedNickname: string, excludedNickname = expectedNickname) {
      refresh();
      // 다른 연동 응답이 이미 교체했다면 현재 기기 이름을 유지한다.
      if (get() !== expectedNickname) return;
      save(generateGuestNickname([expectedNickname, excludedNickname]));
      notify();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1) {
        window.addEventListener('storage', onStorage);
        refresh();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) window.removeEventListener('storage', onStorage);
      };
    },
  };
}

export const guestNickname = createGuestNickname();

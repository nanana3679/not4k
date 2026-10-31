const STORAGE_KEY = 'not4k-guest-nickname';

function generateGuestNickname(excluded?: string): string {
  const values = crypto.getRandomValues(new Uint32Array(1));
  let number = values[0] % (excluded ? 999_999 : 1_000_000);
  if (excluded && number >= Number(excluded.slice(5))) number++;
  return `Guest${String(number).padStart(6, '0')}`;
}

/** 페이지 수명 동안 같은 이름을 사용한다. 생성만으로는 storage에 접근하지 않는다. */
export function createGuestNickname() {
  let nickname: string | null = null;
  const listeners = new Set<() => void>();
  const save = (value: string) => {
    nickname = value;
    try { window.localStorage.setItem(STORAGE_KEY, value); } catch { /* 메모리 값 유지 */ }
    return value;
  };
  const get = (): string => {
    if (nickname !== null) return nickname;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored && /^Guest\d{6}$/.test(stored)) {
        nickname = stored;
        return nickname;
      }
    } catch {
      // 저장소 접근이 차단되어도 페이지 내에서는 같은 이름을 유지한다.
    }
    return save(generateGuestNickname());
  };
  return {
    get,
    rotate(sentNickname: string) {
      // 다른 연동 응답이 이미 교체했다면 현재 기기 이름을 유지한다.
      if (get() !== sentNickname) return;
      save(generateGuestNickname(sentNickname));
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

export const guestNickname = createGuestNickname();

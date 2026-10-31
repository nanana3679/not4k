import { createStore } from 'zustand/vanilla';
import { validateNickname } from './nicknameValidation';

interface NicknameState {
  userId: string | null;
  nickname: string | null;
  status: 'loading' | 'ready' | 'error';
}

interface NicknameDependencies {
  guest: { get: () => string; rotate: (sentNickname: string) => void };
  link: (guestNickname: string) => Promise<{ nickname: string; first_link: boolean }>;
  save: (userId: string, nickname: string) => Promise<string>;
}

type SaveResult = { status: 'saved' } | { status: 'error'; message: string } | { status: 'ignored' };

/** 인증과 계정 닉네임의 페이지 수명. 게임 설정 persist와 독립적이다. */
export function createProfileNickname({ guest, link, save }: NicknameDependencies) {
  const store = createStore<NicknameState>(() => ({ userId: null, nickname: null, status: 'ready' }));
  let session = 0;
  const load = async () => {
    const startedIn = session;
    store.setState({ status: 'loading' });
    try {
      const sentNickname = guest.get();
      const result = await link(sentNickname);
      // 서버가 인계한 기기 이름은 로그아웃 후 도착한 응답이라도 교체한다.
      if (result.first_link) guest.rotate(sentNickname);
      if (startedIn !== session) return;
      store.setState({ nickname: result.nickname, status: 'ready' });
    } catch {
      if (startedIn === session) store.setState({ status: 'error' });
    }
  };
  return {
    store,
    retry: () => store.getState().status === 'error' ? load() : Promise.resolve(),
    async saveNickname(userId: string, draft: string, signal: AbortSignal): Promise<SaveResult> {
      const startedIn = session;
      const isCurrent = () => !signal.aborted && startedIn === session && store.getState().userId === userId;
      if (!isCurrent() || store.getState().status !== 'ready') return { status: 'ignored' };
      const message = validateNickname(draft);
      if (message) return { status: 'error', message };
      try {
        const nickname = await save(userId, draft);
        if (!isCurrent()) return { status: 'ignored' };
        store.setState({ nickname });
        return { status: 'saved' };
      } catch {
        if (!isCurrent()) return { status: 'ignored' };
        return { status: 'error', message: "Couldn't save your nickname. Please try again." };
      }
    },
    async setUser(user: { id: string; is_anonymous?: boolean } | null) {
      const userId = user && !user.is_anonymous ? user.id : null;
      if (userId === store.getState().userId) return;
      session++;
      store.setState({ userId, nickname: null, status: userId ? 'loading' : 'ready' });
      if (!userId) return;
      await load();
    },
  };
}

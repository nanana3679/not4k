import { createStore } from 'zustand/vanilla';
import { validateNickname } from './nicknameValidation';

interface NicknameState {
  userId: string | null;
  nickname: string | null;
  status: 'loading' | 'ready' | 'error';
  saving: boolean;
}

interface NicknameDependencies {
  guest: { get: () => string; rotate: (expectedNickname: string, excludedNickname: string) => void };
  link: (guestNickname: string) => Promise<{
    nickname: string;
    first_link: boolean;
    first_link_guest_nickname: string | null;
  }>;
  save: (userId: string, nickname: string) => Promise<string>;
}

type SaveResult = { status: 'saved' } | { status: 'error'; message: string } | { status: 'ignored' };

/** 인증과 계정 닉네임의 페이지 수명. 게임 설정 persist와 독립적이다. */
export function createProfileNickname({ guest, link, save }: NicknameDependencies) {
  const store = createStore<NicknameState>(() => ({ userId: null, nickname: null, status: 'ready', saving: false }));
  let session = 0;
  // 진행 중인 저장은 로그인 세션이 아니라 계정에 묶는다. 같은 계정의 재로그인도 이 저장이 끝나길 기다린다.
  const savesByUserId = new Map<string, Promise<string>>();
  const load = async () => {
    const startedIn = session;
    const userId = store.getState().userId;
    store.setState({ status: 'loading' });
    try {
      const pendingSave = userId ? savesByUserId.get(userId) : undefined;
      if (pendingSave) {
        await pendingSave.catch(() => {});
        if (startedIn !== session) return;
      }
      const sentNickname = guest.get();
      const result = await link(sentNickname);
      // 서버가 인계한 기기 이름은 로그아웃 후 도착한 응답이라도 교체한다.
      // 재시도·수동 이름 변경 뒤에도 서버가 보존한 최초 기기 이름으로 인계를 확인한다.
      // 우연히 같은 Guest 번호를 가진 다른 기기도 교체된다(기기 쌍마다 확률 100만 분의 1).
      // 그 기기의 Guest 번호만 바뀌므로 영속적인 기기 식별자는 추가하지 않는다.
      const linkedGuestNickname = result.first_link_guest_nickname;
      if (typeof linkedGuestNickname === 'string' && linkedGuestNickname === guest.get()) {
        guest.rotate(linkedGuestNickname, result.nickname);
      }
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
      const isCurrentUser = () => store.getState().userId === userId;
      const isCurrentForm = () => startedIn === session && isCurrentUser() && !signal.aborted;
      const state = store.getState();
      if (!isCurrentForm() || state.status !== 'ready' || state.saving || savesByUserId.has(userId)) {
        return { status: 'ignored' };
      }
      const message = validateNickname(draft);
      if (message) return { status: 'error', message };
      store.setState({ saving: true });
      const request = (async () => save(userId, draft))();
      savesByUserId.set(userId, request);
      try {
        const nickname = await request;
        if (!isCurrentUser()) return { status: 'ignored' };
        store.setState({ nickname });
        return { status: isCurrentForm() ? 'saved' : 'ignored' };
      } catch {
        if (!isCurrentForm()) return { status: 'ignored' };
        return { status: 'error', message: "Couldn't save your nickname. Please try again." };
      } finally {
        if (savesByUserId.get(userId) === request) savesByUserId.delete(userId);
        if (isCurrentUser()) store.setState({ saving: false });
      }
    },
    async setUser(user: { id: string; is_anonymous?: boolean } | null) {
      const userId = user && !user.is_anonymous ? user.id : null;
      if (userId === store.getState().userId) return;
      session++;
      store.setState({
        userId, nickname: null, status: userId ? 'loading' : 'ready', saving: userId !== null && savesByUserId.has(userId),
      });
      if (!userId) return;
      await load();
    },
  };
}

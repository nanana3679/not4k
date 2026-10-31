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

/** 인증이 알려 준 사용자. 익명 사용자는 계정 닉네임이 없는 것으로 본다. */
export interface AuthUser {
  id: string;
  is_anonymous?: boolean;
}

/** 인증과 계정 닉네임의 페이지 수명. 게임 설정 persist와 독립적이다. */
export function createAccountNicknameService({ guest, link, save }: NicknameDependencies) {
  const store = createStore<NicknameState>(() => ({ userId: null, nickname: null, status: 'ready', saving: false }));
  // 다른 계정으로 바꾸거나 로그아웃·재로그인할 때마다 늘린다. 이전 값에서 시작한 응답은 지금 로그인의 상태를 바꾸지 않는다.
  let userGeneration = 0;
  // 서버 저장을 시작할 때마다 늘린다. 저장 실패 뒤 다시 읽은 이름이 그 뒤에 시작한 저장의 결과를 덮지 않게 한다.
  let saveGeneration = 0;
  // 진행 중인 저장은 로그인 세션이 아니라 계정에 묶는다. 같은 계정의 재로그인도 이 저장이 끝나길 기다린다.
  const savesByUserId = new Map<string, Promise<string>>();
  /** 기기의 Guest 닉네임으로 연동해 계정의 현재 닉네임을 받는다. 계정이 이 기기의 이름을 가져갔으면 기기 이름을 교체한다. */
  const fetchLinkedNickname = async () => {
    const result = await link(guest.get());
    // 서버가 인계한 기기 이름은 로그아웃 후 도착한 응답이라도 교체한다.
    // 재시도·수동 이름 변경 뒤에도 서버가 보존한 최초 기기 이름으로 인계를 확인한다.
    // 우연히 같은 Guest 번호를 가진 다른 기기도 교체된다(기기 쌍마다 확률 100만 분의 1).
    // 그 기기의 Guest 번호만 바뀌므로 영속적인 기기 식별자는 추가하지 않는다.
    const linkedGuestNickname = result.first_link_guest_nickname;
    if (typeof linkedGuestNickname === 'string' && linkedGuestNickname === guest.get()) {
      guest.rotate(linkedGuestNickname, result.nickname);
    }
    return result.nickname;
  };
  const load = async () => {
    const startedIn = userGeneration;
    const userId = store.getState().userId;
    store.setState({ status: 'loading' });
    try {
      const pendingSave = userId ? savesByUserId.get(userId) : undefined;
      if (pendingSave) {
        await pendingSave.catch(() => {});
        if (startedIn !== userGeneration) return;
      }
      const nickname = await fetchLinkedNickname();
      if (startedIn !== userGeneration) return;
      store.setState({ nickname, status: 'ready' });
    } catch {
      if (startedIn === userGeneration) store.setState({ status: 'error' });
    }
  };
  // 오류로 끝난 저장도 서버에는 반영됐을 수 있다(응답 유실·시간 제한).
  // 불러오기 상태는 그대로 두고 계정 이름만 다시 읽는다. 폼은 저장하지 않은 초안을 계정 이름보다 먼저 보여 준다.
  // 다시 읽기가 바로잡는 것은 DB에 닿기 전에 실패한 저장(이전 이름)과 다시 읽기 전에 커밋된 저장(새 이름)이다.
  // 시간 제한으로 끊긴 뒤에도 서버에서 이어지던 UPDATE가 다시 읽기보다 늦게 커밋되면 이전 이름이 남고,
  // 서버의 새 이름은 다음에 계정 닉네임을 불러올 때(새로고침·재로그인) 반영된다. Profile을 다시 열어도 다시 읽지 않는다.
  const refreshAfterFailedSave = async () => {
    const startedIn = userGeneration;
    const saveGenerationAtStart = saveGeneration;
    try {
      const nickname = await fetchLinkedNickname();
      if (startedIn === userGeneration && saveGenerationAtStart === saveGeneration) store.setState({ nickname });
    } catch {
      // 저장 오류 안내가 이미 보이므로 다시 읽기 실패는 알리지 않고 기존 이름을 유지한다.
    }
  };
  return {
    store,
    retryLoad: () => store.getState().status === 'error' ? load() : Promise.resolve(),
    async saveNickname(userId: string, draft: string, signal: AbortSignal): Promise<SaveResult> {
      const startedIn = userGeneration;
      const isCurrentUser = () => store.getState().userId === userId;
      const isCurrentForm = () => startedIn === userGeneration && isCurrentUser() && !signal.aborted;
      const state = store.getState();
      if (!isCurrentForm() || state.status !== 'ready' || state.saving || savesByUserId.has(userId)) {
        return { status: 'ignored' };
      }
      const message = validateNickname(draft);
      if (message) return { status: 'error', message };
      store.setState({ saving: true });
      saveGeneration++;
      const request = (async () => save(userId, draft))();
      savesByUserId.set(userId, request);
      try {
        const nickname = await request;
        if (!isCurrentUser()) return { status: 'ignored' };
        store.setState({ nickname });
        return { status: isCurrentForm() ? 'saved' : 'ignored' };
      } catch {
        // 연동은 지금 로그인한 세션의 계정을 읽는다. 그 사이 계정이 바뀌었으면 읽지 않고,
        // 같은 계정으로 다시 로그인했으면 새 load가 이 저장이 끝난 뒤에 읽는다.
        if (startedIn === userGeneration) void refreshAfterFailedSave();
        if (!isCurrentForm()) return { status: 'ignored' };
        return { status: 'error', message: "Couldn't save your nickname. Please try again." };
      } finally {
        if (savesByUserId.get(userId) === request) savesByUserId.delete(userId);
        if (isCurrentUser()) store.setState({ saving: false });
      }
    },
    async setUser(user: AuthUser | null) {
      const userId = user && !user.is_anonymous ? user.id : null;
      if (userId === store.getState().userId) return;
      userGeneration++;
      store.setState({
        userId, nickname: null, status: userId ? 'loading' : 'ready', saving: userId !== null && savesByUserId.has(userId),
      });
      if (!userId) return;
      await load();
    },
  };
}

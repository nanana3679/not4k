import { addTutorialPass, fetchTutorialPasses, handoffTutorialPasses } from '../../../supabase/tutorialPasses';
import { readTutorialPassedIdsFromStorage } from './tutorialPassRecords';
import { completeTutorialGuestHandoff, getVisibleTutorialPassedIds, prepareTutorialGuestHandoff, type TutorialPassState } from './tutorialPassState';

export const TUTORIAL_PASS_STATE_STORAGE_KEY = 'not4k-tutorial-pass-state';
type PassStorage = Pick<Storage, 'getItem' | 'setItem'>;

function withStorageLock<T>(run: () => T): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request(TUTORIAL_PASS_STATE_STORAGE_KEY, run);
  }
  return Promise.resolve(run());
}

function emptyState(): TutorialPassState {
  return { guestIds: [], accountPassedIdsByUser: {}, pendingHandoff: null };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIds(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(id => typeof id === 'string');
}

function isPassState(value: unknown): value is TutorialPassState {
  if (!isObject(value) || !isIds(value.guestIds) || !isObject(value.accountPassedIdsByUser)
    || !Object.values(value.accountPassedIdsByUser).every(isIds)) return false;
  const pending = value.pendingHandoff;
  return pending === null || (isObject(pending) && typeof pending.userId === 'string'
    && typeof pending.requestId === 'string' && isIds(pending.tutorialIds));
}

export function createTutorialPassSync(storage: PassStorage | null) {
  let storageDirty = false;
  function readState(fallback?: TutorialPassState): TutorialPassState {
    if (storageDirty && fallback) return fallback;
    try {
      const saved = storage?.getItem(TUTORIAL_PASS_STATE_STORAGE_KEY);
      if (saved !== null && saved !== undefined) {
        const parsed: unknown = JSON.parse(saved);
        return isPassState(parsed) ? parsed : fallback ?? emptyState();
      }
    } catch { return fallback ?? emptyState(); }
    return fallback ?? {
      guestIds: [...readTutorialPassedIdsFromStorage(storage)], accountPassedIdsByUser: {}, pendingHandoff: null,
    };
  }
  let state = readState();
  const syncByUser = new Map<string, Promise<void>>();
  const listeners = new Set<() => void>();

  function notify() { for (const listener of listeners) listener(); }

  function writeState(next: TutorialPassState, requirePersistence = false): boolean {
    // 쓰기 실패 뒤의 메모리는 다른 탭의 인계와 대조할 수 없다. 이 수명에서는 다시 영구 저장하지 않는다.
    if (storageDirty) {
      if (requirePersistence) return false;
      state = next;
      notify();
      return true;
    }
    try {
      if (requirePersistence && !storage) return false;
      storage?.setItem(TUTORIAL_PASS_STATE_STORAGE_KEY, JSON.stringify(next));
      storageDirty = !storage;
    } catch {
      if (requirePersistence) return false;
      storageDirty = true;
    }
    state = next;
    notify();
    return true;
  }

  async function recordPass(userId: string | null, tutorialId: string) {
    await withStorageLock(() => {
      state = readState(state);
      if (getVisibleTutorialPassedIds(state, userId).includes(tutorialId)) return;
      const ids = [...new Set([...getVisibleTutorialPassedIds(state, userId), tutorialId])];
      writeState(userId === null ? { ...state, guestIds: ids } : {
        ...state, accountPassedIdsByUser: { ...state.accountPassedIdsByUser, [userId]: ids },
      });
    });
    if (userId !== null) {
      try { await addTutorialPass(userId, tutorialId); } catch { /* 해당 계정의 로컬 캐시로 남긴다. */ }
    }
  }

  async function synchronizeAccount(userId: string) {
    // 같은 브라우저의 다른 탭도 예약 읽기·쓰기만 배타적으로 처리한다. 네트워크 응답은 잠금 밖에서 기다린다.
    const handoff = await withStorageLock(() => {
      state = readState(state);
      if (typeof navigator === 'undefined' || !navigator.locks) return null;
      writeState(prepareTutorialGuestHandoff(state, userId, crypto.randomUUID()), true);
      return state.pendingHandoff;
    });
    if (handoff?.userId === userId) {
      try {
        const consumed = await handoffTutorialPasses(userId, handoff.requestId, handoff.tutorialIds);
        await withStorageLock(() => {
          state = readState(state);
          if (state.pendingHandoff?.requestId === handoff.requestId) {
            writeState(completeTutorialGuestHandoff(state, handoff, consumed));
          }
        });
      } catch { /* 확정 전 기록은 원래 계정의 같은 요청으로만 재확인한다. */ }
    }
    try {
      const ids = await fetchTutorialPasses(userId);
      await withStorageLock(() => {
        state = readState(state);
        writeState({ ...state, accountPassedIdsByUser: {
          ...state.accountPassedIdsByUser,
          [userId]: [...new Set([...getVisibleTutorialPassedIds(state, userId), ...ids])],
        } });
      });
      // 로그인·팝업 재개방 때만 누락된 캐시를 재전송한다. 타이머·백그라운드 재시도는 없다.
      const missingIds = getVisibleTutorialPassedIds(state, userId).filter(id => !ids.includes(id));
      await Promise.allSettled(missingIds.map(id => addTutorialPass(userId, id)));
    } catch { /* 캐시가 있으면 해당 계정의 기록만 계속 표시한다. */ }
  }

  function syncAccount(userId: string): Promise<void> {
    const existing = syncByUser.get(userId);
    if (existing) return existing;
    const request = synchronizeAccount(userId).finally(() => { syncByUser.delete(userId); });
    syncByUser.set(userId, request);
    return request;
  }

  return {
    getPassedIds: (userId: string | null) => getVisibleTutorialPassedIds(state, userId),
    getSnapshot: () => state,
    recordPass,
    syncAccount,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    refresh: () => { state = readState(state); notify(); },
    resetGuest: () => withStorageLock(() => { writeState({ ...readState(state), guestIds: [] }); }),
  };
}

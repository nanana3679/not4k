import { addTutorialPass, fetchTutorialPasses, handoffTutorialPasses } from '../../../supabase/tutorialPasses';
import { readTutorialPassedIdsFromStorage } from './tutorialPassRecords';
import { completeTutorialGuestHandoff, getVisibleTutorialPassedIds, prepareTutorialGuestHandoff, type TutorialGuestHandoff, type TutorialPassState } from './tutorialPassState';

export const TUTORIAL_PASS_STATE_STORAGE_KEY = 'not4k-tutorial-pass-state';
type PassStorage = Pick<Storage, 'getItem' | 'setItem'>;

function withStorageLock<T>(run: () => T): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request(TUTORIAL_PASS_STATE_STORAGE_KEY, run);
  }
  return Promise.resolve(run());
}

function emptyState(): TutorialPassState {
  return { guestIds: [], accountPassedIdsByUser: {}, pendingHandoffs: [], unresolvedPasses: [] };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIds(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(id => typeof id === 'string');
}

function isHandoff(value: unknown): value is TutorialGuestHandoff {
  return isObject(value) && typeof value.userId === 'string'
    && typeof value.requestId === 'string' && isIds(value.tutorialIds);
}

function parsePassState(value: unknown): TutorialPassState | null {
  if (!isObject(value) || !isIds(value.guestIds) || !isObject(value.accountPassedIdsByUser)
    || !Object.values(value.accountPassedIdsByUser).every(isIds)) return null;
  // 이전 단일 예약도 원래 계정과 영수증을 그대로 보존한다.
  const pendingHandoffs = value.pendingHandoffs ?? (value.pendingHandoff === null ? [] : [value.pendingHandoff]);
  if (!Array.isArray(pendingHandoffs) || !pendingHandoffs.every(isHandoff)) return null;
  const unresolved = value.unresolvedPasses ?? [];
  if (!Array.isArray(unresolved) || !unresolved.every(pass => isObject(pass)
    && typeof pass.completionId === 'string' && typeof pass.tutorialId === 'string')) return null;
  return {
    guestIds: value.guestIds,
    accountPassedIdsByUser: value.accountPassedIdsByUser as Record<string, string[]>,
    pendingHandoffs, unresolvedPasses: unresolved,
  };
}

export function createTutorialPassSync(storage: PassStorage | null) {
  let storageDirty = false;
  function readState(fallback?: TutorialPassState): TutorialPassState {
    if (storageDirty && fallback) return fallback;
    try {
      const saved = storage?.getItem(TUTORIAL_PASS_STATE_STORAGE_KEY);
      if (saved !== null && saved !== undefined) {
        const parsed: unknown = JSON.parse(saved);
        return parsePassState(parsed) ?? fallback ?? emptyState();
      }
    } catch { return fallback ?? emptyState(); }
    return fallback ?? {
      guestIds: [...readTutorialPassedIdsFromStorage(storage)], accountPassedIdsByUser: {}, pendingHandoffs: [], unresolvedPasses: [],
    };
  }
  let state = readState();
  const syncByUser = new Map<string, Promise<void>>();
  const listeners = new Set<() => void>();
  let sessionUser: string | null | undefined;
  let authGeneration = 0;

  function setSessionUser(userId: string | null | undefined) {
    if (sessionUser === userId) return;
    sessionUser = userId;
    authGeneration++;
    syncByUser.clear();
  }

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

  async function recordPass(owner: string | null | Promise<string | null>, tutorialId: string) {
    const generation = authGeneration;
    let userId: string | null;
    let completionId: string | undefined;
    if (owner instanceof Promise) {
      completionId = crypto.randomUUID();
      // 화면 종료 전에 저장하고, 이후 로그인 상태가 아닌 완료 시 시작한 조회 결과만 사용한다.
      const resolvedOwner = owner.then(id => ({ id }), () => null);
      await withStorageLock(() => {
        state = readState(state);
        writeState({ ...state, unresolvedPasses: [
          ...state.unresolvedPasses, { completionId: completionId!, tutorialId },
        ] });
      });
      const resolved = await resolvedOwner;
      if (!resolved) return; // 원래 주체를 확인하지 못하면 추측하지 않고 미확정으로 보존한다.
      userId = resolved.id;
    } else {
      userId = owner;
    }
    await withStorageLock(() => {
      state = readState(state);
      if (completionId) state = {
        ...state, unresolvedPasses: state.unresolvedPasses.filter(pass => pass.completionId !== completionId),
      };
      if (!completionId && getVisibleTutorialPassedIds(state, userId).includes(tutorialId)) return;
      const ids = [...new Set([...getVisibleTutorialPassedIds(state, userId), tutorialId])];
      writeState(userId === null ? { ...state, guestIds: ids } : {
        ...state, accountPassedIdsByUser: { ...state.accountPassedIdsByUser, [userId]: ids },
      });
    });
    if (userId !== null && generation === authGeneration && (sessionUser === undefined || sessionUser === userId)) {
      try { await addTutorialPass(userId, tutorialId); } catch { /* 해당 계정의 로컬 캐시로 남긴다. */ }
    }
  }

  async function synchronizeAccount(userId: string) {
    const generation = authGeneration;
    const isCurrent = () => generation === authGeneration;
    // 같은 브라우저의 다른 탭도 예약 읽기·쓰기만 배타적으로 처리한다. 네트워크 응답은 잠금 밖에서 기다린다.
    const handoff = await withStorageLock(() => {
      if (!isCurrent()) return null;
      state = readState(state);
      if (typeof navigator === 'undefined' || !navigator.locks) return null;
      writeState(prepareTutorialGuestHandoff(state, userId, crypto.randomUUID()), true);
      return state.pendingHandoffs.find(pending => pending.userId === userId);
    });
    if (!isCurrent()) return;
    if (handoff?.userId === userId) {
      try {
        const consumed = await handoffTutorialPasses(userId, handoff.requestId, handoff.tutorialIds);
        await withStorageLock(() => {
          state = readState(state);
          if (state.pendingHandoffs.some(pending => pending.userId === userId && pending.requestId === handoff.requestId)) {
            writeState(completeTutorialGuestHandoff(state, handoff, consumed));
          }
        });
      } catch { /* 확정 전 기록은 원래 계정의 같은 요청으로만 재확인한다. */ }
    }
    if (!isCurrent()) return;
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
      for (const id of missingIds) {
        if (!isCurrent()) return;
        try { await addTutorialPass(userId, id); } catch { /* 다음 동기화 때 해당 계정으로 재시도한다. */ }
      }
    } catch { /* 캐시가 있으면 해당 계정의 기록만 계속 표시한다. */ }
  }

  function syncAccount(userId: string): Promise<void> {
    setSessionUser(userId);
    const existing = syncByUser.get(userId);
    if (existing) return existing;
    const request = synchronizeAccount(userId).finally(() => {
      if (syncByUser.get(userId) === request) syncByUser.delete(userId);
    });
    syncByUser.set(userId, request);
    return request;
  }

  return {
    getPassedIds: (userId: string | null) => getVisibleTutorialPassedIds(state, userId),
    getSnapshot: () => state,
    recordPass,
    syncAccount,
    setSessionUser,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    refresh: () => { state = readState(state); notify(); },
    resetGuest: () => withStorageLock(() => { writeState({ ...readState(state), guestIds: [] }); }),
  };
}

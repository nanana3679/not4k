import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createTutorialPassSync, TUTORIAL_PASS_STATE_STORAGE_KEY } from './tutorialPassSync';
import { TUTORIAL_PASSED_STORAGE_KEY } from './tutorialPassRecords';
import { getVisibleTutorialPassedIds } from './tutorialPassState';

export interface TutorialPassRecordsView {
  passedIds: readonly string[];
  isGuest: boolean;
  recordPass: (tutorialId: string) => void;
  resetGuest: () => void;
}

function createBrowserSync() {
  let storage: Storage | null = null;
  try { storage = window.localStorage; } catch { /* SSR 또는 저장소 접근 거부 */ }
  return createTutorialPassSync(storage);
}

/** 곡 선택 화면 수명으로 유지해 팝업이 닫혀 있어도 로그인 인계를 시작한다. */
export function useTutorialPassRecords(
  userId: string | null, authLoading: boolean, modalOpen: boolean,
): TutorialPassRecordsView {
  const [sync] = useState(createBrowserSync);
  const state = useSyncExternalStore(sync.subscribe, sync.getSnapshot, sync.getSnapshot);
  const awaitingAuthIds = useRef(new Set<string>());

  useEffect(() => {
    if (authLoading) return;
    for (const id of awaitingAuthIds.current) void sync.recordPass(userId, id);
    awaitingAuthIds.current.clear();
    sync.refresh();
    if (userId !== null) void sync.syncAccount(userId);
  }, [authLoading, sync, userId]);

  useEffect(() => {
    if (!modalOpen || authLoading) return;
    sync.refresh();
    if (userId !== null) void sync.syncAccount(userId);
  }, [authLoading, modalOpen, sync, userId]);

  useEffect(() => {
    const refresh = (event: StorageEvent) => {
      if (event.key === null || event.key === TUTORIAL_PASS_STATE_STORAGE_KEY || event.key === TUTORIAL_PASSED_STORAGE_KEY) {
        sync.refresh();
      }
    };
    window.addEventListener('storage', refresh);
    return () => window.removeEventListener('storage', refresh);
  }, [sync]);

  const recordPass = useCallback((id: string) => {
    // 세션 확인 중의 null을 게스트로 확정하지 않는다. 인증 결과가 오면 원래 완료를 저장한다.
    if (authLoading) awaitingAuthIds.current.add(id);
    else void sync.recordPass(userId, id);
  }, [authLoading, sync, userId]);
  const resetGuest = useCallback(() => { if (!authLoading && userId === null) void sync.resetGuest(); }, [authLoading, sync, userId]);

  return {
    passedIds: authLoading ? [] : getVisibleTutorialPassedIds(state, userId),
    isGuest: !authLoading && userId === null,
    recordPass, resetGuest,
  };
}

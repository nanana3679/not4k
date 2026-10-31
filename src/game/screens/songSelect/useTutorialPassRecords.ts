import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { createTutorialPassSync, TUTORIAL_PASS_STATE_STORAGE_KEY } from './tutorialPassSync';
import { readTutorialPassOwner } from '../../../supabase/tutorialPasses';
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
  userId: string | null, sessionLoading: boolean, modalOpen: boolean,
): TutorialPassRecordsView {
  const [sync] = useState(createBrowserSync);
  const state = useSyncExternalStore(sync.subscribe, sync.getSnapshot, sync.getSnapshot);

  useEffect(() => {
    sync.setSessionUser(sessionLoading ? undefined : userId);
    if (sessionLoading) return;
    sync.refresh();
    if (userId !== null) void sync.syncAccount(userId);
  }, [sessionLoading, sync, userId]);

  useEffect(() => {
    if (!modalOpen || sessionLoading) return;
    sync.refresh();
    if (userId !== null) void sync.syncAccount(userId);
  }, [sessionLoading, modalOpen, sync, userId]);

  useEffect(() => {
    const refresh = (event: StorageEvent) => {
      if (event.key === null || event.key === TUTORIAL_PASS_STATE_STORAGE_KEY || event.key === TUTORIAL_PASSED_STORAGE_KEY) {
        sync.refresh();
      }
    };
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      sync.setSessionUser(null);
    };
  }, [sync]);

  const recordPass = useCallback((id: string) => {
    const owner = sessionLoading && userId === null ? readTutorialPassOwner() : userId;
    void sync.recordPass(owner, id);
  }, [sessionLoading, sync, userId]);
  const resetGuest = useCallback(() => { if (!sessionLoading && userId === null) void sync.resetGuest(); }, [sessionLoading, sync, userId]);

  return {
    passedIds: sessionLoading ? [] : getVisibleTutorialPassedIds(state, userId),
    isGuest: !sessionLoading && userId === null,
    recordPass, resetGuest,
  };
}

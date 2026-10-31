export const TUTORIAL_PASSED_STORAGE_KEY = 'not4k-tutorial-passed-ids';

export function readTutorialPassedIdsFromStorage(
  storage: Pick<Storage, 'getItem'> | null | undefined,
): ReadonlySet<string> {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(TUTORIAL_PASSED_STORAGE_KEY) ?? '[]');
    // 카탈로그 밖 ID도 보존한다. 후속 계정 동기화에 필요한 기록을 표시 때문에 삭제하지 않는다.
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

export function persistTutorialPassedIds(
  storage: Pick<Storage, 'setItem'> | null | undefined,
  passedIds: ReadonlySet<string>,
): void {
  try {
    storage?.setItem(TUTORIAL_PASSED_STORAGE_KEY, JSON.stringify([...passedIds]));
  } catch {
    // 저장이 차단되어도 현재 모달의 통과 상태는 유지한다.
  }
}

export function clearTutorialPassedIds(storage: Pick<Storage, 'removeItem'> | null | undefined): void {
  try {
    storage?.removeItem(TUTORIAL_PASSED_STORAGE_KEY);
  } catch {
    // 브라우저에서 localStorage 접근을 거부할 수 있다.
  }
}

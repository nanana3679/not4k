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

/**
 * 저장소의 최신 통과 기록에 한 항목을 더해 저장하고 합친 집합을 돌려준다. 다른 탭이 그사이 저장한 통과를
 * 메모리의 오래된 집합으로 덮어쓰지 않도록 저장 직전에 다시 읽는다.
 */
export function addTutorialPassedId(
  storage: Pick<Storage, 'getItem' | 'setItem'> | null | undefined,
  knownPassedIds: ReadonlySet<string>,
  tutorialId: string,
): ReadonlySet<string> {
  const merged = new Set([...readTutorialPassedIdsFromStorage(storage), ...knownPassedIds, tutorialId]);
  persistTutorialPassedIds(storage, merged);
  return merged;
}

export function clearTutorialPassedIds(storage: Pick<Storage, 'removeItem'> | null | undefined): void {
  try {
    storage?.removeItem(TUTORIAL_PASSED_STORAGE_KEY);
  } catch {
    // 브라우저에서 localStorage 접근을 거부할 수 있다.
  }
}

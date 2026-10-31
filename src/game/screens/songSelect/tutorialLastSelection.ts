import { ALL_TUTORIAL_PREVIEWS, TUTORIAL_SECTIONS } from './tutorialCatalog';

/**
 * 마지막으로 선택한 튜토리얼 항목 id. 탭은 항목에서 정해지므로 따로 저장하지 않는다.
 * 이 기기의 브라우저에만 두고 계정과 동기화하지 않는다(docs/spec/tutorial.md "통과 기록과 재진입").
 * 숫자 인덱스가 아니라 id를 저장해 목록 순서가 바뀌어도 같은 항목을 열고, 항목이 사라지면 첫 항목으로 돌아간다.
 */
export const TUTORIAL_LAST_SELECTED_STORAGE_KEY = 'not4k-tutorial-last-selected-id';

const BASIC_FIRST_TUTORIAL_INDEX = TUTORIAL_SECTIONS[0].startIndex;

type TutorialLastSelectionReadStorage = Pick<Storage, 'getItem'>;
type TutorialLastSelectionWriteStorage = Pick<Storage, 'setItem'>;

/** 저장된 마지막 선택 항목의 전체 인덱스. 이력이 없거나 읽을 수 없거나 모르는 id면 `Basic` 첫 항목. */
export function readLastSelectedTutorialIndexFromStorage(
  storage: TutorialLastSelectionReadStorage | null | undefined,
): number {
  if (!storage) return BASIC_FIRST_TUTORIAL_INDEX;

  try {
    const lastSelectedTutorialId = storage.getItem(TUTORIAL_LAST_SELECTED_STORAGE_KEY);
    if (!lastSelectedTutorialId) return BASIC_FIRST_TUTORIAL_INDEX;

    const lastSelectedTutorialIndex = ALL_TUTORIAL_PREVIEWS.findIndex(
      (tutorial) => tutorial.id === lastSelectedTutorialId,
    );
    return lastSelectedTutorialIndex >= 0 ? lastSelectedTutorialIndex : BASIC_FIRST_TUTORIAL_INDEX;
  } catch {
    return BASIC_FIRST_TUTORIAL_INDEX;
  }
}

export function persistLastSelectedTutorialId(
  storage: TutorialLastSelectionWriteStorage | null | undefined,
  tutorialId: string,
): void {
  if (!storage) return;

  try {
    storage.setItem(TUTORIAL_LAST_SELECTED_STORAGE_KEY, tutorialId);
  } catch {
    // localStorage can be unavailable in private mode, tests, or embedded browsers.
  }
}

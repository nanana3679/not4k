import { TUTORIAL_PREVIEWS } from './tutorialPreviewChart';

export const TUTORIAL_VIEWED_STORAGE_KEY = 'not4k-tutorial-viewed-ids';

const TUTORIAL_PREVIEW_IDS = TUTORIAL_PREVIEWS.map((tutorial) => tutorial.id);
const TUTORIAL_PREVIEW_ID_SET = new Set(TUTORIAL_PREVIEW_IDS);

type TutorialViewedReadStorage = Pick<Storage, 'getItem'>;
type TutorialViewedWriteStorage = Pick<Storage, 'setItem'>;
type TutorialViewedClearStorage = Pick<Storage, 'removeItem'>;

export function readTutorialViewedIdsFromStorage(
  storage: TutorialViewedReadStorage | null | undefined,
): ReadonlySet<string> {
  const viewedIds = new Set<string>([TUTORIAL_PREVIEWS[0].id]);
  if (!storage) return viewedIds;

  try {
    const rawViewedIds = storage.getItem(TUTORIAL_VIEWED_STORAGE_KEY);
    if (!rawViewedIds) return viewedIds;

    const parsedViewedIds: unknown = JSON.parse(rawViewedIds);
    if (!Array.isArray(parsedViewedIds)) return viewedIds;

    for (const viewedId of parsedViewedIds) {
      if (typeof viewedId === 'string' && TUTORIAL_PREVIEW_ID_SET.has(viewedId)) {
        viewedIds.add(viewedId);
      }
    }
  } catch {
    return viewedIds;
  }

  return viewedIds;
}

export function persistTutorialViewedIds(
  storage: TutorialViewedWriteStorage | null | undefined,
  viewedIds: ReadonlySet<string>,
): void {
  if (!storage) return;

  try {
    const orderedViewedIds = TUTORIAL_PREVIEW_IDS.filter((tutorialId) => viewedIds.has(tutorialId));
    storage.setItem(TUTORIAL_VIEWED_STORAGE_KEY, JSON.stringify(orderedViewedIds));
  } catch {
    // localStorage can be unavailable in private mode, tests, or embedded browsers.
  }
}

export function clearTutorialViewedIds(storage: TutorialViewedClearStorage | null | undefined): void {
  if (!storage) return;

  try {
    storage.removeItem(TUTORIAL_VIEWED_STORAGE_KEY);
  } catch {
    // localStorage can be unavailable in private mode, tests, or embedded browsers.
  }
}

export function canShowTutorialCacheInvalidationButton({
  isAdmin,
  isDev,
}: {
  isAdmin: boolean;
  isDev: boolean;
}): boolean {
  return isDev || isAdmin;
}

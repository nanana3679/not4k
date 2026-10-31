import { ALL_TUTORIAL_PREVIEWS } from './tutorialCatalog';

export const TUTORIAL_VIEWED_STORAGE_KEY = 'not4k-tutorial-viewed-ids';

const TUTORIAL_PREVIEW_IDS = ALL_TUTORIAL_PREVIEWS.map((tutorial) => tutorial.id);

type TutorialViewedReadStorage = Pick<Storage, 'getItem'>;
type TutorialViewedWriteStorage = Pick<Storage, 'setItem'>;
type TutorialViewedClearStorage = Pick<Storage, 'removeItem'>;

export function readTutorialViewedIdsFromStorage(
  storage: TutorialViewedReadStorage | null | undefined,
): ReadonlySet<string> {
  const viewedIds = new Set<string>([ALL_TUTORIAL_PREVIEWS[0].id]);
  if (!storage) return viewedIds;

  try {
    const rawViewedIds = storage.getItem(TUTORIAL_VIEWED_STORAGE_KEY);
    if (!rawViewedIds) return viewedIds;

    const parsedViewedIds: unknown = JSON.parse(rawViewedIds);
    if (!Array.isArray(parsedViewedIds)) return viewedIds;

    const storedIds = new Set<unknown>(parsedViewedIds);
    for (const viewedId of TUTORIAL_PREVIEW_IDS) {
      if (storedIds.has(viewedId)) {
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

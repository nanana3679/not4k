import { ADVANCED_TUTORIAL_PREVIEWS } from './advancedTutorialPreviews';
import { TUTORIAL_PREVIEWS } from './tutorialPreviewChart';

export const TUTORIAL_SECTIONS = [
  { id: 'basic', label: 'Basic', previews: TUTORIAL_PREVIEWS, startIndex: 0 },
  { id: 'advanced', label: 'Advanced', previews: ADVANCED_TUTORIAL_PREVIEWS, startIndex: TUTORIAL_PREVIEWS.length },
] as const;

export type TutorialSectionId = (typeof TUTORIAL_SECTIONS)[number]['id'];
export const ALL_TUTORIAL_PREVIEWS = [...TUTORIAL_PREVIEWS, ...ADVANCED_TUTORIAL_PREVIEWS];

export function getTutorialSection(index: number) {
  return TUTORIAL_SECTIONS[index >= TUTORIAL_PREVIEWS.length ? 1 : 0];
}

/**
 * Per-tab last position when the popup opens: the selected item's tab starts at that item,
 * every other tab at its first item. In-session tab memory only; it is not persisted.
 */
export function createLastSectionIndexes(selectedTutorialIndex: number): Record<TutorialSectionId, number> {
  const lastSectionIndexes = Object.fromEntries(
    TUTORIAL_SECTIONS.map((section) => [section.id, section.startIndex]),
  ) as Record<TutorialSectionId, number>;
  lastSectionIndexes[getTutorialSection(selectedTutorialIndex).id] = selectedTutorialIndex;
  return lastSectionIndexes;
}

/** Previous/next stays within the selected level, including the first/last page. */
export function getAdjacentTutorialIndex(index: number, direction: -1 | 1): number {
  const section = getTutorialSection(index);
  const length = section.previews.length;
  return section.startIndex + ((index - section.startIndex + direction + length) % length);
}

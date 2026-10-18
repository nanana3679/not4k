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

/** Previous/next stays within the selected level, including the first/last page. */
export function getAdjacentTutorialIndex(index: number, direction: -1 | 1): number {
  const section = getTutorialSection(index);
  const length = section.previews.length;
  return section.startIndex + ((index - section.startIndex + direction + length) % length);
}

import { ADVANCED_TUTORIAL_EXPLICIT_PREVIEWS } from './advancedTutorialExplicitPreviews';
import { BASIC_TUTORIAL_EXPLICIT_PREVIEWS } from './basicTutorialExplicitPreviews';

export const TUTORIAL_SECTIONS = [
  { id: 'basic', label: 'Basic', previews: BASIC_TUTORIAL_EXPLICIT_PREVIEWS, startIndex: 0 },
  { id: 'advanced', label: 'Advanced', previews: ADVANCED_TUTORIAL_EXPLICIT_PREVIEWS, startIndex: BASIC_TUTORIAL_EXPLICIT_PREVIEWS.length },
] as const;

export type TutorialSectionId = (typeof TUTORIAL_SECTIONS)[number]['id'];
export const ALL_TUTORIAL_PREVIEWS = [...BASIC_TUTORIAL_EXPLICIT_PREVIEWS, ...ADVANCED_TUTORIAL_EXPLICIT_PREVIEWS];

export function getTutorialSection(index: number) {
  return TUTORIAL_SECTIONS[index >= BASIC_TUTORIAL_EXPLICIT_PREVIEWS.length ? 1 : 0];
}

/** Previous/next stays within the selected level, including the first/last page. */
export function getAdjacentTutorialIndex(index: number, direction: -1 | 1): number {
  const section = getTutorialSection(index);
  const length = section.previews.length;
  return section.startIndex + ((index - section.startIndex + direction + length) % length);
}

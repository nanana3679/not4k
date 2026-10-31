import { ADVANCED_TUTORIAL_EXPLICIT_PREVIEWS } from './advancedTutorialExplicitPreviews';
import { BASIC_TUTORIAL_EXPLICIT_PREVIEWS } from './basicTutorialExplicitPreviews';

import type { ExplicitTutorialPreviewDefinition } from './explicitTutorialPreviewChart';
import { createTutorialPracticeSpec, DEFAULT_MAX_GREAT_OR_WORSE_COUNT, type TutorialPracticeSpec } from './tutorialPractice';

export interface TutorialLesson extends ExplicitTutorialPreviewDefinition {
  readonly practice?: TutorialPracticeSpec;
}

function withPractice(preview: ExplicitTutorialPreviewDefinition): TutorialLesson {
  if (!preview.chart.notes.some(note => note.type !== 'body')) return preview;
  // 트릴 교대는 goodTrill 0회, 틱을 둘 수 없는 트릴 바디 유지는 Miss 0회를 요구한다.
  const teachesTrillAlternation = ['trill-note', 'connected-trill-long'].includes(preview.id);
  const teachesTrillLongHolding = ['long-note', 'connected-trill-long'].includes(preview.id);
  return { ...preview, practice: createTutorialPracticeSpec({
    playingMethods: [{ id: 'default' }],
    conditions: [
      { kind: 'maxGreatOrWorseCount', count: DEFAULT_MAX_GREAT_OR_WORSE_COUNT },
      ...(teachesTrillLongHolding ? [{ kind: 'maxMissCount' as const, count: 0 }] : []),
      ...(teachesTrillAlternation ? [{ kind: 'maxGoodTrillCount' as const, count: 0 }] : []),
    ],
  }) };
}

export const TUTORIAL_SECTIONS = [
  { id: 'basic', label: 'Basic', previews: BASIC_TUTORIAL_EXPLICIT_PREVIEWS.map(withPractice), startIndex: 0 },
  { id: 'advanced', label: 'Advanced', previews: ADVANCED_TUTORIAL_EXPLICIT_PREVIEWS.map(withPractice), startIndex: BASIC_TUTORIAL_EXPLICIT_PREVIEWS.length },
] as const;

export type TutorialSectionId = (typeof TUTORIAL_SECTIONS)[number]['id'];
export const ALL_TUTORIAL_PREVIEWS = TUTORIAL_SECTIONS.flatMap(section => section.previews);

export function getTutorialSection(index: number) {
  return TUTORIAL_SECTIONS[index >= BASIC_TUTORIAL_EXPLICIT_PREVIEWS.length ? 1 : 0];
}

/** Previous/next stays within the selected level, including the first/last page. */
export function getAdjacentTutorialIndex(index: number, direction: -1 | 1): number {
  const section = getTutorialSection(index);
  const length = section.previews.length;
  return section.startIndex + ((index - section.startIndex + direction + length) % length);
}

import { describe, expect, it } from 'vitest';
import { ALL_TUTORIAL_PREVIEWS, TUTORIAL_SECTIONS, getAdjacentTutorialIndex, getTutorialSection } from './tutorialCatalog';
import { DEFAULT_MAX_GREAT_OR_WORSE_COUNT } from './tutorialPractice';

describe('튜토리얼 Basic / Advanced 분류', () => {
  it('Basic 명시 17개와 Advanced 명시 8개는 중복 ID 없이 Basic 순서 다음에 배치된다', () => {
    expect(TUTORIAL_SECTIONS.map(section => [section.id, section.previews.length])).toEqual([
      ['basic', 17], ['advanced', 8],
    ]);
    expect(ALL_TUTORIAL_PREVIEWS).toHaveLength(25);
    expect(new Set(ALL_TUTORIAL_PREVIEWS.map(preview => preview.id)).size).toBe(25);
    expect(ALL_TUTORIAL_PREVIEWS.every(preview => 'engine' in preview && preview.engine === 'explicit')).toBe(true);
    expect(ALL_TUTORIAL_PREVIEWS[16].id).toBe('vertical-movement');
    expect(ALL_TUTORIAL_PREVIEWS[17].id).toBe('advanced-double-hold');
  });

  it.each([
    [0, -1, 16], [16, 1, 0], [17, -1, 24], [24, 1, 17],
    [18, -1, 17], [18, 1, 19],
  ] as const)('전체 인덱스 %i에서 방향 %i로 넘기면 같은 탭의 %i로 이동한다', (index, direction, expected) => {
    expect(getAdjacentTutorialIndex(index, direction)).toBe(expected);
    expect(getTutorialSection(expected).id).toBe(getTutorialSection(index).id);
  });
});


it('점수 있는 24항목은 Great 이하 기본 1개·누적 3회·방법 1개이며 트릴 교대·유지 항목에만 추가 조건을 요구한다', () => {
  expect(DEFAULT_MAX_GREAT_OR_WORSE_COUNT).toBe(1);
  expect(ALL_TUTORIAL_PREVIEWS[0].practice).toBeUndefined();
  expect(ALL_TUTORIAL_PREVIEWS.filter(item => item.practice)).toHaveLength(24);
  for (const item of ALL_TUTORIAL_PREVIEWS.slice(1)) {
    expect(item.practice, item.id).toEqual({
      requiredSuccessCount: 3,
      playingMethods: [{ id: 'default' }],
      conditions: [{ kind: 'maxGreatOrWorseCount', count: DEFAULT_MAX_GREAT_OR_WORSE_COUNT },
        ...(['long-note', 'connected-trill-long'].includes(item.id)
          ? [{ kind: 'maxMissCount', count: 0 }] : []),
        ...(['trill-note', 'connected-trill-long'].includes(item.id)
          ? [{ kind: 'maxGoodTrillCount', count: 0 }] : [])],
    });
  }
});

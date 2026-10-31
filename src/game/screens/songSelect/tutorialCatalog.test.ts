import { describe, expect, it } from 'vitest';
import { ALL_TUTORIAL_PREVIEWS, TUTORIAL_SECTIONS, getAdjacentTutorialIndex, getTutorialSection } from './tutorialCatalog';

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


it('점수 있는 24항목은 목표 90%·누적 3회·방법 1개이고 trill-note와 connected-trill-long만 goodTrill 0회를 요구한다', () => {
  expect(ALL_TUTORIAL_PREVIEWS[0].practice).toBeUndefined();
  for (const item of ALL_TUTORIAL_PREVIEWS.slice(1)) {
    expect(item.practice, item.id).toMatchObject({
      requiredSuccessCount: 3,
      playingMethods: [{ id: 'default' }],
      conditions: [{ kind: 'targetAchievementRate', percent: 90 },
        ...(['trill-note', 'connected-trill-long'].includes(item.id)
          ? [{ kind: 'maxGoodTrillCount', count: 0 }] : [])],
    });
  }
});

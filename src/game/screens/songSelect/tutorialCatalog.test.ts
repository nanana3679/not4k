import { describe, expect, it } from 'vitest';
import { ALL_TUTORIAL_PREVIEWS, TUTORIAL_SECTIONS, getAdjacentTutorialIndex, getTutorialSection } from './tutorialCatalog';
import { persistTutorialViewedIds, readTutorialViewedIdsFromStorage } from './tutorialViewedCache';

describe('튜토리얼 Basic / Advanced 분류', () => {
  it('Basic 17개와 Advanced 12개는 중복 ID 없이 기존 Basic 순서 다음에 배치된다', () => {
    expect(TUTORIAL_SECTIONS.map(section => [section.id, section.previews.length])).toEqual([
      ['basic', 17], ['advanced', 12],
    ]);
    expect(ALL_TUTORIAL_PREVIEWS).toHaveLength(29);
    expect(new Set(ALL_TUTORIAL_PREVIEWS.map(preview => preview.id)).size).toBe(29);
    expect(ALL_TUTORIAL_PREVIEWS[16].id).toBe('vertical-movement');
    expect(ALL_TUTORIAL_PREVIEWS[17].id).toBe('advanced-double-hold');
  });

  it.each([
    [0, -1, 16], [16, 1, 0], [17, -1, 28], [28, 1, 17],
    [18, -1, 17], [18, 1, 19],
  ] as const)('전체 인덱스 %i에서 방향 %i로 넘기면 같은 탭의 %i로 이동한다', (index, direction, expected) => {
    expect(getAdjacentTutorialIndex(index, direction)).toBe(expected);
    expect(getTutorialSection(expected).id).toBe(getTutorialSection(index).id);
  });

  it('기존 Basic 체크와 Advanced 체크를 함께 저장하고 다시 읽어도 둘 다 유지한다', () => {
    let value: string | null = JSON.stringify(['single-note']);
    const storage = { getItem: () => value, setItem: (_key: string, next: string) => { value = next; } };
    const viewed = new Set(readTutorialViewedIdsFromStorage(storage));
    viewed.add('advanced-recovery');
    viewed.add('unknown-id');
    persistTutorialViewedIds(storage, viewed);
    expect(JSON.parse(value!)).toEqual(['hand-placement', 'single-note', 'advanced-recovery']);
    expect([...readTutorialViewedIdsFromStorage(storage)]).toEqual(['hand-placement', 'single-note', 'advanced-recovery']);
  });
});

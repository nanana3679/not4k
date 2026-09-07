import { describe, expect, it } from 'vitest';
import { ALL_TUTORIAL_PREVIEWS, TUTORIAL_SECTIONS, getAdjacentTutorialIndex, getTutorialSection } from './tutorialCatalog';
import { persistTutorialViewedIds, readTutorialViewedIdsFromStorage } from './tutorialViewedCache';

describe('튜토리얼 Basic / Advanced 분류', () => {
  it('Basic 15개와 Advanced 12개는 중복 ID 없이 기존 Basic 순서 다음에 배치된다', () => {
    expect(TUTORIAL_SECTIONS.map(section => [section.id, section.previews.length])).toEqual([
      ['basic', 15], ['advanced', 12],
    ]);
    expect(ALL_TUTORIAL_PREVIEWS).toHaveLength(27);
    expect(new Set(ALL_TUTORIAL_PREVIEWS.map(preview => preview.id)).size).toBe(27);
    expect(ALL_TUTORIAL_PREVIEWS[14].id).toBe('vertical-movement');
    expect(ALL_TUTORIAL_PREVIEWS[15].id).toBe('advanced-double-hold');
  });

  it.each([
    [0, -1, 14], [14, 1, 0], [15, -1, 26], [26, 1, 15],
    [16, -1, 15], [16, 1, 17],
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

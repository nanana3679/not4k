import { describe, expect, it } from 'vitest';
import { ALL_TUTORIAL_PREVIEWS, TUTORIAL_SECTIONS, getAdjacentTutorialIndex, getTutorialSection } from './tutorialCatalog';
import { persistTutorialViewedIds, readTutorialViewedIdsFromStorage } from './tutorialViewedCache';

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

  it('구형 29개 viewed ID를 역순으로 복원하면 제거된 holdOnly 4개를 버리고 25개를 카탈로그 순서로 읽고 저장한다', () => {
    const retainedIds = ALL_TUTORIAL_PREVIEWS.map(preview => preview.id);
    const removedIds = [
      'advanced-holdonly-decrease', 'advanced-independent-holdonly',
      'advanced-short-holdonly', 'advanced-zero-holdonly',
    ];
    let value = JSON.stringify([...retainedIds, ...removedIds].reverse());
    const storage = { getItem: () => value, setItem: (_key: string, next: string) => { value = next; } };
    const viewed = readTutorialViewedIdsFromStorage(storage);
    expect([...viewed]).toEqual(retainedIds);
    expect(viewed.size).toBe(25);
    persistTutorialViewedIds(storage, new Set([...viewed, ...removedIds]));
    expect(JSON.parse(value)).toEqual(retainedIds);
  });
});

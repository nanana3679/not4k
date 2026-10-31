import { describe, expect, it } from 'vitest';
import {
  TUTORIAL_LAST_SELECTED_STORAGE_KEY,
  persistLastSelectedTutorialId,
  readLastSelectedTutorialIndexFromStorage,
} from './tutorialLastSelection';

function createMemoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

describe('튜토리얼 마지막 선택 항목 저장', () => {
  it('마지막 선택 항목은 not4k-tutorial-last-selected-id 키에 항목 id 문자열 그대로 저장', () => {
    const storage = createMemoryStorage();

    persistLastSelectedTutorialId(storage, 'advanced-recovery');

    expect(TUTORIAL_LAST_SELECTED_STORAGE_KEY).toBe('not4k-tutorial-last-selected-id');
    expect(storage.getItem(TUTORIAL_LAST_SELECTED_STORAGE_KEY)).toBe('advanced-recovery');
  });

  it.each([
    ['double-note', 2],
    ['vertical-movement', 16],
    ['advanced-double-hold', 17],
    ['advanced-recovery', 23],
    ['advanced-double-release', 28],
  ] as const)('%s를 저장한 뒤 다시 읽으면 전체 인덱스 %i로 복원', (tutorialId, expectedIndex) => {
    const storage = createMemoryStorage();

    persistLastSelectedTutorialId(storage, tutorialId);

    expect(readLastSelectedTutorialIndexFromStorage(storage)).toBe(expectedIndex);
  });

  it('같은 저장소에 advanced-recovery 다음 single-note를 저장하면 마지막 값 single-note의 인덱스 1을 읽음', () => {
    const storage = createMemoryStorage();

    persistLastSelectedTutorialId(storage, 'advanced-recovery');
    persistLastSelectedTutorialId(storage, 'single-note');

    expect(readLastSelectedTutorialIndexFromStorage(storage)).toBe(1);
  });

  it('선택 이력이 없으면(저장값 null) Basic 첫 항목 인덱스 0', () => {
    expect(readLastSelectedTutorialIndexFromStorage(createMemoryStorage())).toBe(0);
  });

  it('카탈로그에서 사라진 id removed-tutorial이 저장돼 있으면 Basic 첫 항목 인덱스 0', () => {
    const storage = createMemoryStorage({ [TUTORIAL_LAST_SELECTED_STORAGE_KEY]: 'removed-tutorial' });

    expect(readLastSelectedTutorialIndexFromStorage(storage)).toBe(0);
  });

  it.each([
    ['빈 문자열', ''],
    ['깨진 JSON', '{broken'],
    ['JSON 따옴표로 감싼 id', '"single-note"'],
    ['JSON 배열', '["single-note"]'],
    ['앞에 공백이 붙은 id', ' single-note'],
    ['숫자 인덱스', '3'],
  ])('저장값이 %s이면 Basic 첫 항목 인덱스 0', (_label, rawValue) => {
    const storage = createMemoryStorage({ [TUTORIAL_LAST_SELECTED_STORAGE_KEY]: rawValue });

    expect(readLastSelectedTutorialIndexFromStorage(storage)).toBe(0);
  });

  it('저장소를 쓸 수 없으면(null·undefined) 읽기는 Basic 첫 항목 인덱스 0이고 저장은 아무것도 하지 않음', () => {
    expect(readLastSelectedTutorialIndexFromStorage(null)).toBe(0);
    expect(readLastSelectedTutorialIndexFromStorage(undefined)).toBe(0);
    expect(() => persistLastSelectedTutorialId(null, 'single-note')).not.toThrow();
    expect(() => persistLastSelectedTutorialId(undefined, 'single-note')).not.toThrow();
  });

  it('getItem이 던지면 Basic 첫 항목 인덱스 0', () => {
    const storage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
    };

    expect(readLastSelectedTutorialIndexFromStorage(storage)).toBe(0);
  });

  it('setItem이 던져도(QuotaExceededError) 저장은 예외 없이 끝남', () => {
    const storage = {
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };

    expect(() => persistLastSelectedTutorialId(storage, 'single-note')).not.toThrow();
  });
});

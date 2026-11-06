import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COMPACT_EDITOR_QUERY,
  SONG_COMMON_COLLAPSED_STORAGE_KEY,
  initialSongCommonCollapsed,
  isCompactEditorScreen,
  readStoredSongCommonCollapsed,
  storeSongCommonCollapsed,
} from './songCommonCollapse';

const storageWith = (value: string | null) => {
  const values = new Map(value === null ? [] : [[SONG_COMMON_COLLAPSED_STORAGE_KEY, value]]);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, next: string) => { values.set(key, next); },
    stored: () => values.get(SONG_COMMON_COLLAPSED_STORAGE_KEY) ?? null,
  };
};
const blockedStorage = {
  getItem: (): string | null => { throw new Error('blocked'); },
  setItem: (): void => { throw new Error('blocked'); },
};

afterEach(() => vi.unstubAllGlobals());

describe('곡 공통 영역 접힘의 브라우저 저장(RFD 0095)', () => {
  it.each([
    ['저장값 없음·넓은 화면', null, false, false],
    ['저장값 없음·좁은 화면', null, true, true],
    ['저장값 false·좁은 화면', 'false', true, false],
    ['저장값 true·넓은 화면', 'true', false, true],
  ] as const)('%s이면 시작 접힘은 %s·%s에서 %s다', (_label, stored, compact, expected) => {
    expect(initialSongCommonCollapsed(storageWith(stored), compact)).toBe(expected);
  });

  it('저장값이 true·false가 아닌 "yes"면 저장값이 없는 것으로 보고 좁은 화면에서 접힌 채 시작한다', () => {
    expect(readStoredSongCommonCollapsed(storageWith('yes'))).toBeNull();
    expect(initialSongCommonCollapsed(storageWith('yes'), true)).toBe(true);
  });

  it('읽기가 막힌 브라우저에서는 저장값 없음으로 보아 넓은 화면은 펼치고 좁은 화면은 접은 채 시작한다', () => {
    expect(readStoredSongCommonCollapsed(blockedStorage)).toBeNull();
    expect(initialSongCommonCollapsed(blockedStorage, false)).toBe(false);
    expect(initialSongCommonCollapsed(blockedStorage, true)).toBe(true);
  });

  it('쓰기가 막혀도 storeSongCommonCollapsed는 던지지 않는다', () => {
    expect(() => storeSongCommonCollapsed(true, blockedStorage)).not.toThrow();
  });

  it('localStorage 접근 자체가 던지는 브라우저에서도 읽기·쓰기가 던지지 않는다', () => {
    vi.stubGlobal('window', { get localStorage(): Storage { throw new Error('denied'); } });
    expect(readStoredSongCommonCollapsed()).toBeNull();
    expect(() => storeSongCommonCollapsed(true)).not.toThrow();
  });

  it('true를 저장하면 다음 읽기가 true, false를 저장하면 false다', () => {
    const storage = storageWith(null);
    storeSongCommonCollapsed(true, storage);
    expect(storage.stored()).toBe('true');
    expect(readStoredSongCommonCollapsed(storage)).toBe(true);
    storeSongCommonCollapsed(false, storage);
    expect(readStoredSongCommonCollapsed(storage)).toBe(false);
  });
});

describe('좁은 화면 판정', () => {
  it('matchMedia가 COMPACT_EDITOR_QUERY에 맞으면 true다', () => {
    const matchMedia = vi.fn(() => ({ matches: true }));
    vi.stubGlobal('window', { matchMedia });
    expect(isCompactEditorScreen()).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith(COMPACT_EDITOR_QUERY);
  });

  it('window가 없는 환경과 matchMedia가 없는 브라우저에서는 false다', () => {
    expect(isCompactEditorScreen()).toBe(false);
    vi.stubGlobal('window', {});
    expect(isCompactEditorScreen()).toBe(false);
  });
});

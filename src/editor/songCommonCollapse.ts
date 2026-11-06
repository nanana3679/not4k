/**
 * 곡 공통 영역의 접힘은 브라우저별 표시 상태다(RFD 0095). 차트 파일·곡 행·Undo 이력에 들어가지 않고 localStorage에만 남는다.
 * 저장소를 쓸 수 없는 브라우저(개인 정보 모드, 차단된 사이트 데이터)는 저장값이 없는 것과 같다.
 */

/** 좁은 화면·터치 기기. 에디터 배치와 곡 공통 영역의 시작 접힘이 같은 기준을 쓴다. */
export const COMPACT_EDITOR_QUERY = '(max-width: 767px), (pointer: coarse)';

export const SONG_COMMON_COLLAPSED_STORAGE_KEY = 'not4k-editor-song-common-collapsed';

function browserStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** 사용자가 고른 값. 없거나 읽을 수 없으면 null이다. */
export function readStoredSongCommonCollapsed(
  storage: Pick<Storage, 'getItem'> | null = browserStorage(),
): boolean | null {
  try {
    const stored = storage?.getItem(SONG_COMMON_COLLAPSED_STORAGE_KEY);
    return stored === 'true' ? true : stored === 'false' ? false : null;
  } catch {
    return null;
  }
}

export function storeSongCommonCollapsed(
  collapsed: boolean,
  storage: Pick<Storage, 'setItem'> | null = browserStorage(),
): void {
  try {
    storage?.setItem(SONG_COMMON_COLLAPSED_STORAGE_KEY, String(collapsed));
  } catch {
    // 저장하지 못해도 이번 세션의 접힘은 store에 남는다.
  }
}

export function isCompactEditorScreen(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(COMPACT_EDITOR_QUERY).matches;
}

/** 저장값이 있으면 그 값을, 없으면 좁은 화면은 접고 넓은 화면은 펼친 채 시작한다. */
export function initialSongCommonCollapsed(
  storage?: Pick<Storage, 'getItem'> | null,
  compactScreen: boolean = isCompactEditorScreen(),
): boolean {
  return readStoredSongCommonCollapsed(storage) ?? compactScreen;
}

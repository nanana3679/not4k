import type { PlaybackRange } from '../shared';

/**
 * 곡 행 없이 연 차트에서 Meta로 고른 대기 미디어·구간. 곡 행이 있는 차트는 곡 상태(`song`)가 같은 값을 소유한다.
 * 곡 행이 없는 차트는 곡 저장 이전의 기존 규칙대로 Save가 차트를 올린 뒤 이 값을 올리고 비운다.
 */
export interface SonglessMedia {
  previewRange: PlaybackRange | null;
  gameplayRange: PlaybackRange | null;
  jacketFile: File | null;
  audioFile: File | null;
}

export const EMPTY_SONGLESS_MEDIA: SonglessMedia = Object.freeze({
  previewRange: null, gameplayRange: null, jacketFile: null, audioFile: null,
});

/** 올릴 대기 미디어·구간이 하나라도 있는가. 없으면 곡 행 없는 차트의 Save는 차트만 올린다. */
export function hasSonglessMedia(media: SonglessMedia): boolean {
  return media.previewRange !== null || media.gameplayRange !== null || media.jacketFile !== null || media.audioFile !== null;
}

import type { GameExperience } from './hooks/useGameExperience';

/**
 * mobileSongList 경험에서는 곡 목록만 노출하지만, 에디터 테스트 플레이는 예외로 둔다.
 *
 * mobileSongList는 좁은 화면/coarse 포인터를 "플레이 불가 환경"으로 보고 곡 목록만 띄운다.
 * 하지만 에디터 테스트 플레이(editorReturnUrl이 설정된 세션)는 관리자가 의도적으로 시작한
 * 플레이이므로, 이 분기를 건너뛰고 정상 screen 전환(play/result 등)을 따르게 한다.
 *
 * @returns true면 screen을 무시하고 곡 목록(SongSelectScreen mobileListOnly)만 보여줘야 한다.
 */
export function shouldForceMobileSongList(
  experience: GameExperience,
  editorReturnUrl: string | null,
): boolean {
  return experience === 'mobileSongList' && editorReturnUrl == null;
}

/**
 * 캔버스 contextmenu가 삭제를 실행할지 정하는 순수 결정.
 *
 * 우클릭은 pointerdown에서 이미 삭제 gesture를 시작하므로, 그 누름이 만든 contextmenu
 * 한 번은 건너뛰고 대기를 푼다(브라우저마다 contextmenu가 down 뒤·up 뒤 어느 쪽이든 한 번 온다).
 * 우클릭 없이 오는 contextmenu(키보드 메뉴 키, macOS Ctrl+클릭)는 삭제한다.
 */
export function resolveContextMenuDelete(input: {
  now: number;
  /** 터치 롱프레스 뒤 브라우저가 보내는 contextmenu를 무시할 시각. */
  suppressUntil: number;
  /** 우클릭 pointerdown이 삭제한 누름의 contextmenu를 아직 받지 않았다. */
  rightPressPending: boolean;
}): { shouldDelete: boolean; rightPressPending: boolean } {
  if (input.rightPressPending) return { shouldDelete: false, rightPressPending: false };
  return { shouldDelete: input.now >= input.suppressUntil, rightPressPending: false };
}

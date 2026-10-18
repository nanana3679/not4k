/** 튜토리얼 팝업 캐러셀에서 축소 재생기 슬롯 하나가 놓인 상태. */
export type TutorialPreviewSlotState = 'active' | 'standby' | 'exiting' | 'entering';

/**
 * 슬롯의 재생기가 차트 시간을 진행해야 하는지.
 * 들어오는 슬롯은 자리 잡기 전까지 첫 프레임에서 멈춰 두어, 넘긴 차트가 보이는 순간 처음부터 시작하게 한다.
 * 밀려나는 슬롯은 슬라이드가 끝날 때까지 이어서 재생하고, 보이지 않는 대기 슬롯은 진행하지 않는다.
 */
export function isTutorialPreviewSlotPlaying(slotState: TutorialPreviewSlotState): boolean {
  return slotState === 'active' || slotState === 'exiting';
}

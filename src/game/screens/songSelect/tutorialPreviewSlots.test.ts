import { describe, expect, it } from 'vitest';
import { isTutorialPreviewSlotPlaying } from './tutorialPreviewSlots';

describe('isTutorialPreviewSlotPlaying', () => {
  it('자리 잡은 active 슬롯은 재생', () => {
    expect(isTutorialPreviewSlotPlaying('active')).toBe(true);
  });

  it('밀려나는 exiting 슬롯은 슬라이드가 끝날 때까지 계속 재생', () => {
    expect(isTutorialPreviewSlotPlaying('exiting')).toBe(true);
  });

  it('들어오는 entering 슬롯은 자리 잡기 전까지 첫 프레임에서 멈춰 넘긴 차트가 처음부터 시작', () => {
    expect(isTutorialPreviewSlotPlaying('entering')).toBe(false);
  });

  it('보이지 않는 standby 슬롯은 재생하지 않음', () => {
    expect(isTutorialPreviewSlotPlaying('standby')).toBe(false);
  });
});

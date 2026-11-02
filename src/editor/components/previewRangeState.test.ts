import { describe, expect, it } from 'vitest';
import { initialRangeState, notifiedRange } from './previewRangeState';

describe('구간 선택기의 처음 구간(initialRangeState)', () => {
  it('프리뷰 값이 없으면 120초 음원에서 30～45초·페이드 0.5초로 시작한다', () => {
    expect(initialRangeState(120, {})).toEqual({ startTime: 30, endTime: 45, enabled: true, fadeInTime: 0.5, fadeOutTime: 0.5 });
  });

  it('저장된 프리뷰 10～20초를 5초 음원에 맞추면 5～5초로 자른다', () => {
    expect(initialRangeState(5, { initialStart: 10, initialEnd: 20 })).toMatchObject({ startTime: 5, endTime: 5 });
  });

  it('인게임 구간 값이 없고 페이드 입력을 보이면 0～음원 길이 90초·페이드 0초로 시작한다', () => {
    expect(initialRangeState(90, { defaultStart: 0, defaultEnd: 90, defaultDuration: 90, showFadeControls: true }))
      .toEqual({ startTime: 0, endTime: 90, enabled: true, fadeInTime: 0, fadeOutTime: 0 });
  });

  it('저장된 인게임 2～110초·페이드 1초는 120초 음원에서 그대로 쓴다', () => {
    expect(initialRangeState(120, { initialStart: 2, initialEnd: 110, initialFadeInTime: 1, initialFadeOutTime: 1,
      defaultStart: 0, defaultEnd: 120, showFadeControls: true }))
      .toEqual({ startTime: 2, endTime: 110, enabled: true, fadeInTime: 1, fadeOutTime: 1 });
  });
});

describe('선택기가 알리는 구간(notifiedRange)', () => {
  it('2초 구간에 페이드 1.5초면 구간 절반인 1초로 자른다', () => {
    expect(notifiedRange({ startTime: 3, endTime: 5, enabled: true, fadeInTime: 1.5, fadeOutTime: 0.2 }))
      .toEqual({ startTime: 3, endTime: 5, fadeInTime: 1, fadeOutTime: 0.2 });
  });
});

import { describe, expect, it } from 'vitest';
import {
  STAGE_ZOOM_DEFAULT,
  clampStageZoom,
  formatStageZoom,
  stepStageZoom,
} from './gearStageViewport';

describe('gearStageViewport', () => {
  it('0.1배를 입력하면 메인 이미지 줌이 최소 0.5배로 clamp됨', () => {
    expect(clampStageZoom(0.1)).toBe(0.5);
  });

  it('8배를 입력하면 메인 이미지 줌이 최대 4배로 clamp됨', () => {
    expect(clampStageZoom(8)).toBe(4);
  });

  it('NaN을 입력하면 메인 이미지 줌이 기본 1배로 돌아감', () => {
    expect(clampStageZoom(Number.NaN)).toBe(STAGE_ZOOM_DEFAULT);
  });

  it('1배에서 확대 버튼을 한 번 누르면 1.25배가 됨', () => {
    expect(stepStageZoom(1, 'in')).toBe(1.25);
  });

  it('1배에서 축소 버튼을 두 번 누르면 0.5배가 됨', () => {
    expect(stepStageZoom(stepStageZoom(1, 'out'), 'out')).toBe(0.5);
  });

  it('1.25배는 컨트롤 표시값에서 125%로 보임', () => {
    expect(formatStageZoom(1.25)).toBe('125%');
  });
});

import { describe, expect, it } from 'vitest';
import { breakthroughDefaults, frameStyle, publicPreviewPage, sceneLabels, sliderIds } from './preview-ui.mjs';

const views = {
  liftoff: '/flight/liftoff/',
  infiltration: '/flight/infiltration/',
  breakthrough: '/flight/breakthrough/',
};

describe('공개 비행 미리보기 최소 UI', () => {
  it('탭은 LIFTOFF·INFILTRATION·BREAKTHROUGH 영어 이름만 표시한다', () => {
    expect(sceneLabels).toEqual({ liftoff: 'LIFTOFF', infiltration: 'INFILTRATION', breakthrough: 'BREAKTHROUGH' });
    expect(publicPreviewPage(views)).not.toMatch(/[가-힣]/);
  });

  it('LIFTOFF·INFILTRATION·BREAKTHROUGH는 모두 altitude 하나만 조절한다', () => {
    expect(sliderIds).toEqual({ liftoff: ['altitude'], infiltration: ['altitude'], breakthrough: ['altitude'] });
    expect(frameStyle('liftoff')).toContain('#altitude');
    expect(frameStyle('infiltration')).toContain('#altitude');
    expect(frameStyle('breakthrough')).toContain('#altitude');
    expect(frameStyle('breakthrough')).not.toContain(':has(#backdropRate)');
    expect(frameStyle('liftoff')).not.toContain('!important');
    expect(frameStyle('breakthrough')).not.toContain('!important');
  });

  it('BREAKTHROUGH 공개 기본값은 배경 밝기 10%로 고정한다', () => {
    expect(breakthroughDefaults.backdropBrightness).toBe(10);
  });

  it('공개 셸은 제목 문구 없이 세 장면 버튼과 한 개의 iframe만 만든다', () => {
    const html = publicPreviewPage(views);
    expect(html.match(/<button /g)).toHaveLength(3);
    expect(html.match(/<iframe /g)).toHaveLength(1);
    expect(html).not.toContain('<h1');
  });
});

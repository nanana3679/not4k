import { describe, expect, it } from 'vitest';
import {
  formatViewBox,
  GEAR_MOTION_SVG_PATH,
  GEAR_MOTION_VIEWS,
  readSvgBaseHref,
  viewBoxTransform,
} from './gearMotionView';

describe('승인 SVG 경로', () => {
  it('비교 기준 SVG는 이미지 갤러리의 54-ambient-motion-v19.svg', () => {
    expect(GEAR_MOTION_SVG_PATH).toBe('/lab/images/frame-keywords-six-20260929/54-ambient-motion-v19.svg');
  });
});

describe('비교 보기(viewBox)', () => {
  it('보기 세 개는 승인 SVG 시연과 같은 viewBox: 전체 0 0 1024 1536, 왼쪽 장갑 0 420 320 480, 하단 300 1240 424 212', () => {
    expect(Object.values(GEAR_MOTION_VIEWS).map((view) => [view.label, formatViewBox(view.viewBox)])).toEqual([
      ['전체', '0 0 1024 1536'],
      ['왼쪽 장갑', '0 420 320 480'],
      ['하단', '300 1240 424 212'],
    ]);
  });

  it('왼쪽 장갑(0 420 320 480)을 640×960 화면에 맞추면 배율 2, 위로 840 올린다', () => {
    expect(viewBoxTransform(GEAR_MOTION_VIEWS.left.viewBox, 640, 960)).toEqual({ scale: 2, x: 0, y: -840 });
  });

  it('하단(300 1240 424 212)을 비율이 다른 424×424 화면에 맞추면 배율 1로 가로를 채우고 세로 가운데(위 106)에 둔다', () => {
    expect(viewBoxTransform(GEAR_MOTION_VIEWS.bottom.viewBox, 424, 424)).toEqual({ scale: 1, x: -300, y: -1240 + 106 });
  });
});

describe('readSvgBaseHref', () => {
  it('SVG의 #fm-base href(data URL)를 꺼내고, 없으면 #fm-base를 찾지 못했다는 에러', () => {
    const withBase = { querySelector: (selector: string) => (selector === '#fm-base' ? { getAttribute: () => 'data:image/png;base64,AAAA' } : null) };
    expect(readSvgBaseHref(withBase as unknown as ParentNode)).toBe('data:image/png;base64,AAAA');
    expect(() => readSvgBaseHref({ querySelector: () => null } as unknown as ParentNode)).toThrow('#fm-base');
  });
});

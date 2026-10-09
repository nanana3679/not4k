import { describe, expect, it } from 'vitest';
import archivedSvg from '../../lab/image-galleries/frame-keywords-six-20260929/54-ambient-motion-v19.svg?raw';
import {
  formatViewBox,
  GEAR_MOTION_SVG_PATH,
  GEAR_MOTION_VIEWS,
  readSvgBaseHref,
  stripReducedMotionRules,
  stripSvgReducedMotionRules,
  viewBoxTransform,
} from './gearMotionView';

// 보관한 승인 SVG(RFD 0030 결정 5로 고치지 않는다)의 <style> 원문.
const archivedStyles = [...archivedSvg.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((match) => match[1]);
const ARCHIVED_REDUCE_RULE = '@media (prefers-reduced-motion: reduce) { .fm-orbit, .fm-liquid-flow, .fm-bubble, .fm-accent, .fm-glint { animation: none; opacity: 0; } #fm-lit, #fm-unlit { display: none; } }';

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

describe('stripReducedMotionRules — 보관 승인 SVG의 모션 감소 규칙 걷어 내기(RFD 0030)', () => {
  it('보관 SVG 파일 자체는 고치지 않아 <style> 1개에 @media (prefers-reduced-motion: reduce) 규칙 1개를 그대로 가진다(결정 5)', () => {
    expect(archivedStyles).toHaveLength(1);
    expect(archivedStyles[0]).toContain(ARCHIVED_REDUCE_RULE);
  });

  it('보관 SVG의 <style>에 적용하면 모션 감소 규칙 1개만 빠지고 @keyframes 6개를 포함한 나머지 텍스트는 한 글자도 바뀌지 않는다', () => {
    const stripped = stripReducedMotionRules(archivedStyles[0]);
    expect(stripped).toBe(archivedStyles[0].replace(ARCHIVED_REDUCE_RULE, ''));
    expect(stripped).not.toContain('prefers-reduced-motion');
    expect(stripped.match(/@keyframes /g)).toHaveLength(6);
  });

  it('안에 규칙 2개가 든 중괄호 겹친 블록도 바깥 닫는 중괄호까지 통째로 지우고 앞뒤 규칙은 남긴다', () => {
    const css = '.a { opacity: 1; }\n@media (prefers-reduced-motion: reduce) { .a { animation: none; } #b { display: none; } }\n.c { opacity: .5; }';
    expect(stripReducedMotionRules(css)).toBe('.a { opacity: 1; }\n\n.c { opacity: .5; }');
  });

  it('조건을 screen and (prefers-reduced-motion:reduce)처럼 공백 없이·다른 조건과 함께 써도 지운다', () => {
    expect(stripReducedMotionRules('@media screen and (prefers-reduced-motion:reduce){.a{animation:none}}.b{}')).toBe('.b{}');
  });

  it('모션 감소 블록이 2개면 둘 다 지운다', () => {
    const css = '@media (prefers-reduced-motion: reduce) { .a { opacity: 0; } }.b{}@media (prefers-reduced-motion: reduce) { .c { opacity: 0; } }';
    expect(stripReducedMotionRules(css)).toBe('.b{}');
  });

  it('(max-width: 600px)처럼 모션 감소와 무관한 @media 블록과 규칙이 없는 CSS는 그대로 돌려준다', () => {
    const css = '@media (max-width: 600px) { .a { width: 100%; } }\n.b { opacity: 1; }';
    expect(stripReducedMotionRules(css)).toBe(css);
    expect(stripReducedMotionRules('')).toBe('');
  });

  it('불리언 형태 @media (prefers-reduced-motion) 블록도 reduce와 같은 뜻이라 지운다', () => {
    expect(stripReducedMotionRules('@media (prefers-reduced-motion) { .a { animation: none; } }.b{}')).toBe('.b{}');
  });

  it('대문자로 쓴 @MEDIA (PREFERS-REDUCED-MOTION: REDUCE) 블록도 지운다', () => {
    expect(stripReducedMotionRules('@MEDIA (PREFERS-REDUCED-MOTION: REDUCE) { .a { animation: none; } }.b{}')).toBe('.b{}');
  });

  it('조건을 뒤집은 @media not all and (prefers-reduced-motion: reduce) 블록은 모션 감소가 아닐 때 적용되므로 남긴다', () => {
    const css = '@media not all and (prefers-reduced-motion: reduce) { .a { animation: spin 1s; } }';
    expect(stripReducedMotionRules(css)).toBe(css);
  });

  it('쉼표 목록 @media print, (prefers-reduced-motion: reduce) 블록은 인쇄에도 적용되므로 남긴다', () => {
    const css = '@media print, (prefers-reduced-motion: reduce) { .a { animation: none; } }';
    expect(stripReducedMotionRules(css)).toBe(css);
  });

  it('or로 묶은 @media (prefers-reduced-motion: reduce) or (hover: none) 블록은 hover 없는 기기에도 적용되므로 남긴다', () => {
    const css = '@media (prefers-reduced-motion: reduce) or (hover: none) { .a { animation: none; } }';
    expect(stripReducedMotionRules(css)).toBe(css);
  });

  it('(prefers-reduced-motion: no-preference) 블록은 모션 감소 조건이 아니라 남긴다', () => {
    const css = '@media (prefers-reduced-motion: no-preference) { .a { animation: spin 1s; } }';
    expect(stripReducedMotionRules(css)).toBe(css);
  });

  it('닫는 중괄호가 없는 모션 감소 블록은 브라우저처럼 텍스트 끝까지를 그 블록으로 보고 지운다', () => {
    expect(stripReducedMotionRules('.a{}@media (prefers-reduced-motion: reduce) { .b { opacity: 0; }')).toBe('.a{}');
  });
});

describe('stripSvgReducedMotionRules — 문서에 넣기 전 SVG의 <style>에 적용', () => {
  it('<style> 2개 중 모션 감소 규칙이 있는 1개만 고쳐 쓰고, 규칙이 없는 다른 1개의 textContent는 다시 쓰지 않는다', () => {
    const writes: string[] = [];
    const style = (initial: string, name: string) => {
      let text = initial;
      return {
        get textContent() { return text; },
        set textContent(next: string) { writes.push(name); text = next; },
      };
    };
    const withRule = style(archivedStyles[0], 'with-rule');
    const plain = style('.a { opacity: 1; }', 'plain');
    const svg = { querySelectorAll: (selector: string) => (selector === 'style' ? [withRule, plain] : []) };
    stripSvgReducedMotionRules(svg as unknown as ParentNode);
    expect(writes).toEqual(['with-rule']);
    expect(withRule.textContent).not.toContain('prefers-reduced-motion');
    expect(withRule.textContent).toContain('@keyframes fm-orbit');
    expect(plain.textContent).toBe('.a { opacity: 1; }');
  });
});

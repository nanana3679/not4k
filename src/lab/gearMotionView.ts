/**
 * Gear의 Pixi ↔ 승인 SVG 비교에만 쓰는 값(Pixi 없음). 승인 SVG 경로와 비교 보기(viewBox), SVG에서 바탕 그림을 꺼내는
 * 도우미, SVG 자체의 모션 감소 규칙을 걷어 내는 도우미를 둔다. `gearMotion` 에셋의 데이터 계약과 레이어 구성은 게임 모듈(src/game/renderer/gearMotion*)에 있다.
 */

/** 비교 기준인 승인된 애니메이션 SVG(이미지 갤러리). 페이지는 withLabPublicBase로 감싸 읽는다. */
export const GEAR_MOTION_SVG_PATH = '/lab/images/frame-keywords-six-20260929/54-ambient-motion-v19.svg';

export interface GearViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 승인된 SVG 시연 페이지와 같은 보기(전체·왼쪽 장갑·하단). */
export const GEAR_MOTION_VIEWS = {
  full: { label: '전체', viewBox: { x: 0, y: 0, width: 1024, height: 1536 } },
  left: { label: '왼쪽 장갑', viewBox: { x: 0, y: 420, width: 320, height: 480 } },
  bottom: { label: '하단', viewBox: { x: 300, y: 1240, width: 424, height: 212 } },
} as const satisfies Record<string, { label: string; viewBox: GearViewBox }>;
export type GearMotionView = keyof typeof GEAR_MOTION_VIEWS;

export function formatViewBox(box: GearViewBox): string {
  return `${box.x} ${box.y} ${box.width} ${box.height}`;
}

/** viewBox를 width×height 화면에 맞추는 기어 루트 변환(가로세로 같은 배율, SVG의 meet과 같음). */
export function viewBoxTransform(box: GearViewBox, width: number, height: number) {
  const scale = Math.min(width / box.width, height / box.height);
  return {
    scale,
    x: (width - box.width * scale) / 2 - box.x * scale,
    y: (height - box.height * scale) / 2 - box.y * scale,
  };
}

/** SVG 문서에서 바탕 그림(#fm-base)의 data URL을 꺼낸다. 비교 화면이 SVG와 같은 바탕 픽셀을 쓰게 한다. */
export function readSvgBaseHref(svg: ParentNode): string {
  const href = svg.querySelector('#fm-base')?.getAttribute('href');
  if (!href) throw new Error('SVG에서 바탕 그림(#fm-base)을 찾지 못했습니다.');
  return href;
}

/** 모션 감소 조건 `(prefers-reduced-motion: reduce)`와 같은 뜻의 불리언 형태 `(prefers-reduced-motion)`. 대소문자는 가리지 않는다. */
const REDUCE_CONDITION = /\(\s*prefers-reduced-motion\s*(?::\s*reduce\s*)?\)/i;
/** 조건을 뒤집거나(`not`) 다른 조건과 OR로 묶은(쉼표·`or`) 블록은 모션 감소가 아닐 때도 적용되므로 지우지 않는다. */
const NOT_ONLY_REDUCE = /\bnot\b|\bor\b|,/i;

/**
 * 보관한 승인 SVG(`54-ambient-motion-v19.svg`)의 `<style>`에서 운영체제 모션 감소 규칙을 걷어 내려고 쓰는 좁은 텍스트 변환이다.
 * 조건이 `(prefers-reduced-motion: reduce)` 또는 `(prefers-reduced-motion)`을 담은 `@media` 블록을 닫는 중괄호까지 통째로 지우고,
 * 나머지 텍스트는 한 글자도 바꾸지 않는다. 조건에 `not`·`or`·쉼표가 있는 블록과 `no-preference` 블록은 남긴다.
 * 닫는 중괄호가 없으면 브라우저처럼 텍스트 끝까지를 그 블록으로 본다. CSS 주석과 문자열은 해석하지 않으므로(보관 SVG에는 없다)
 * 그 안의 `@media`·중괄호도 규칙으로 본다. 범용 CSS 파서가 아니다.
 * 보관 파일은 고치지 않고(RFD 0030 결정 5), Lab 비교 화면이 문서에 넣기 전에 이 규칙만 걷어 내 운영체제 설정과 관계없이 게임과 같게 보여 준다.
 */
export function stripReducedMotionRules(css: string): string {
  let result = '';
  let cursor = 0;
  const media = /@media\b/gi;
  for (let match = media.exec(css); match !== null; match = media.exec(css)) {
    const open = css.indexOf('{', match.index);
    if (open === -1) break;
    const prelude = css.slice(match.index + match[0].length, open);
    if (!REDUCE_CONDITION.test(prelude) || NOT_ONLY_REDUCE.test(prelude)) continue;
    let depth = 0;
    let end = css.length;
    for (let index = open; index < css.length; index++) {
      if (css[index] === '{') depth++;
      else if (css[index] === '}' && --depth === 0) {
        end = index + 1;
        break;
      }
    }
    result += css.slice(cursor, match.index);
    cursor = end;
    media.lastIndex = end;
  }
  return result + css.slice(cursor);
}

/** SVG 문서 안 모든 `<style>`에 stripReducedMotionRules를 적용한다. 바뀌는 `<style>`만 textContent를 다시 쓴다. 문서에 넣기 전에 부른다. */
export function stripSvgReducedMotionRules(svg: ParentNode): void {
  for (const style of svg.querySelectorAll('style')) {
    const css = style.textContent ?? '';
    const stripped = stripReducedMotionRules(css);
    if (stripped !== css) style.textContent = stripped;
  }
}

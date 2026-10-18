import { describe, expect, it } from 'vitest';

// Lab 소스의 원문. 테스트 파일은 뺀다. 보관 기록(lab/image-galleries 등)은 src/lab 밖이라 대상이 아니다.
// 주석은 term-map의 첫 언급 형태로 `prefers-reduced-motion`을 적을 수 있으므로, 원문 문자열이 아니라 설정을 읽는 코드 형태만 찾는다.
const scripts = import.meta.glob<string>(['./**/*.{ts,tsx}', '!./**/*.test.ts'], { query: '?raw', import: 'default', eager: true });
const styles = import.meta.glob<string>('./**/*.css', { query: '?raw', import: 'default', eager: true });

describe('Lab은 운영체제의 모션 감소 설정을 읽지 않는다(RFD 0030)', () => {
  it('src/lab의 ts·tsx(테스트 제외) 어디에도 matchMedia(…reduced-motion…) 검사가 없다(GearPage·GearMotionCompare 포함)', () => {
    expect(Object.keys(scripts)).toEqual(expect.arrayContaining(['./GearPage.tsx', './GearMotionCompare.tsx', './NoteAssetShowcasePage.tsx']));
    const reads = Object.keys(scripts).filter((path) => /matchMedia\([^)]*reduced-motion/.test(scripts[path]));
    expect(reads).toEqual([]);
  });

  it('src/lab의 css 어디에도 @media (prefers-reduced-motion…) 규칙이 없다(NoteAssetShowcasePage.css·noteAssetKeybomb.css 포함)', () => {
    expect(Object.keys(styles)).toEqual(expect.arrayContaining(['./NoteAssetShowcasePage.css', './noteAssetKeybomb.css']));
    const rules = Object.keys(styles).filter((path) => /@media[^{]*prefers-reduced-motion/.test(styles[path]));
    expect(rules).toEqual([]);
  });
});

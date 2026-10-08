import { describe, expect, it } from 'vitest';

// Lab 소스(ts·tsx·css)의 원문. 테스트 파일은 뺀다. 보관 기록(lab/image-galleries 등)은 src/lab 밖이라 대상이 아니다.
const labSources = import.meta.glob<string>(['./**/*.{ts,tsx,css}', '!./**/*.test.ts'], { query: '?raw', import: 'default', eager: true });

describe('Lab은 운영체제의 모션 감소 설정을 읽지 않는다(RFD 0030)', () => {
  it('src/lab 소스(테스트 제외)에서 prefers-reduced-motion을 적은 파일은 보관 승인 SVG의 규칙을 걷어 내는 gearMotionView.ts 1개뿐이다(matchMedia 검사·@media 규칙 0곳)', () => {
    const mentions = Object.keys(labSources).filter((path) => labSources[path].includes('prefers-reduced-motion'));
    expect(mentions).toEqual(['./gearMotionView.ts']);
  });
});

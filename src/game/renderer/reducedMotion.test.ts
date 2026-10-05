import { afterEach, describe, expect, it, vi } from 'vitest';
import { prefersReducedMotion } from './reducedMotion';
import flightBackgroundSource from './flight/FlightBackground.ts?raw';

afterEach(() => vi.unstubAllGlobals());

describe('prefersReducedMotion', () => {
  it('matchMedia가 없으면(서버 렌더·테스트) 움직임 줄이기가 아니다(false)', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(prefersReducedMotion()).toBe(false);
  });

  it('(prefers-reduced-motion: reduce)가 맞으면 true, 맞지 않으면 false', () => {
    const queries: string[] = [];
    vi.stubGlobal('matchMedia', (query: string) => { queries.push(query); return { matches: true }; });
    expect(prefersReducedMotion()).toBe(true);
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    expect(prefersReducedMotion()).toBe(false);
    expect(queries).toEqual(['(prefers-reduced-motion: reduce)']);
  });

  it('비행 배경도 같은 판정(prefersReducedMotion)을 쓴다', () => {
    expect(flightBackgroundSource).toContain('prefersReducedMotion()');
  });
});

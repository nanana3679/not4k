import { describe, it, expect } from 'vitest';
import { getDifficultyOrder, DIFFICULTIES } from './helpers';

describe('getDifficultyOrder', () => {
  it('EASY < NORMAL < HARD < EXPERT 순서', () => {
    expect(getDifficultyOrder('EASY')).toBeLessThan(getDifficultyOrder('NORMAL'));
    expect(getDifficultyOrder('NORMAL')).toBeLessThan(getDifficultyOrder('HARD'));
    expect(getDifficultyOrder('HARD')).toBeLessThan(getDifficultyOrder('EXPERT'));
  });

  it('대소문자 무관하게 동일한 순서 반환', () => {
    expect(getDifficultyOrder('easy')).toBe(getDifficultyOrder('EASY'));
    expect(getDifficultyOrder('Hard')).toBe(getDifficultyOrder('HARD'));
  });

  it('알 수 없는 난이도는 마지막 순서', () => {
    expect(getDifficultyOrder('UNKNOWN')).toBeGreaterThan(getDifficultyOrder('EXPERT'));
  });
});

describe('DIFFICULTIES', () => {
  it('4개 난이도가 순서대로 정의됨', () => {
    expect([...DIFFICULTIES]).toEqual(['EASY', 'NORMAL', 'HARD', 'EXPERT']);
  });
});

import { describe, expect, it } from 'vitest';
import { availableChartDifficulties, findExistingChartDifficulty, formatDifficultyLabel, resolveFlightScenario } from './chartDifficulty';

describe('난이도명과 배경 연결', () => {
  it('easy 차트가 있으면 LIFTOFF 덮어쓰기는 저장 식별자 easy를 유지한다', () => {
    expect(findExistingChartDifficulty(['easy', 'normal'], 'LIFTOFF')).toBe('easy');
  });

  it('easy와 liftoff가 모두 있으면 LIFTOFF 저장은 정확히 일치하는 liftoff를 선택한다', () => {
    expect(findExistingChartDifficulty(['easy', 'liftoff'], 'LIFTOFF')).toBe('liftoff');
  });

  it('normal만 있으면 BREAKTHROUGH와 EXPERT 저장은 기존 차트를 덮어쓰지 않는다', () => {
    expect(findExistingChartDifficulty(['normal'], 'BREAKTHROUGH')).toBeUndefined();
    expect(findExistingChartDifficulty(['hard'], 'EXPERT')).toBeUndefined();
  });
  it.each([
    ['easy', 'LIFTOFF', 'liftoff'], ['Liftoff', 'LIFTOFF', 'liftoff'],
    ['NORMAL', 'INFILTRATION', 'infiltration'], ['infiltration', 'INFILTRATION', 'infiltration'],
    ['HARD', 'BREAKTHROUGH', 'breakthrough'], ['Breakthrough', 'BREAKTHROUGH', 'breakthrough'],
    ['EXPERT', 'EXPERT', 'breakthrough'],
  ])('%s 차트는 %s로 표시하고 %s 배경을 사용한다', (stored, display, scenario) => {
    expect(formatDifficultyLabel(stored)).toBe(display);
    expect(resolveFlightScenario(stored)).toBe(scenario);
  });

  it('EASY와 Infiltration 차트가 있으면 새 차트에는 BREAKTHROUGH만 선택할 수 있다', () => {
    expect(availableChartDifficulties(['easy', 'Infiltration'])).toEqual(['BREAKTHROUGH']);
  });

  it('빈 목록에는 LIFTOFF → INFILTRATION → BREAKTHROUGH 순서로 세 이름을 제공한다', () => {
    expect(availableChartDifficulties([])).toEqual(['LIFTOFF', 'INFILTRATION', 'BREAKTHROUGH']);
  });

  it('사용자 라벨 CUSTOM은 보존하고 배경은 infiltration을 사용한다', () => {
    expect(formatDifficultyLabel(' custom ')).toBe('CUSTOM');
    expect(resolveFlightScenario('custom')).toBe('infiltration');
  });
});

/** 저장된 차트 식별자는 바꾸지 않고 난이도명과 비행 시나리오를 해석한다. */
export const CHART_DIFFICULTIES = ['LIFTOFF', 'INFILTRATION', 'BREAKTHROUGH'] as const;
export type FlightScenario = 'liftoff' | 'infiltration' | 'breakthrough';

export function formatDifficultyLabel(label: string): string {
  const normalized = label.trim().toUpperCase();
  switch (normalized) {
    case 'EASY': return 'LIFTOFF';
    case 'NORMAL': return 'INFILTRATION';
    case 'HARD': return 'BREAKTHROUGH';
    default: return normalized;
  }
}

export function resolveFlightScenario(label: string): FlightScenario {
  switch (formatDifficultyLabel(label)) {
    case 'LIFTOFF': return 'liftoff';
    case 'BREAKTHROUGH':
    case 'EXPERT': return 'breakthrough';
    default: return 'infiltration';
  }
}

export function availableChartDifficulties(existing: readonly string[]): string[] {
  const labels = new Set(existing.map(formatDifficultyLabel));
  return CHART_DIFFICULTIES.filter(label => !labels.has(label));
}

/** 같은 이름의 차트를 덮어쓸 때 기존 DB·Storage 식별자를 유지한다. */
export function findExistingChartDifficulty(existing: readonly string[], target: string): string | undefined {
  return existing.find(label => label.toUpperCase() === target.toUpperCase())
    ?? existing.find(label => formatDifficultyLabel(label) === formatDifficultyLabel(target));
}

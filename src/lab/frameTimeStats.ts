/** requestAnimationFrame 간격(ms) 요약. p95는 오름차순 정렬의 nearest-rank(⌈0.95 × n⌉번째) 값이다. */
export interface FrameTimeSummary {
  count: number;
  averageMs: number;
  p95Ms: number;
}

export function summarizeFrameDeltas(deltas: readonly number[]): FrameTimeSummary | null {
  if (deltas.length === 0) return null;
  const sorted = [...deltas].sort((a, b) => a - b);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return {
    count: sorted.length,
    averageMs: total / sorted.length,
    p95Ms: sorted[Math.ceil(0.95 * sorted.length) - 1],
  };
}

/** 최근 capacity개 간격만 남기는 고정 크기 창. 음수·무한대 같은 잘못된 간격은 버린다. */
export function createFrameTimeWindow(capacity = 120) {
  const values: number[] = [];
  return {
    push(deltaMs: number): void {
      if (!Number.isFinite(deltaMs) || deltaMs < 0) return;
      values.push(deltaMs);
      if (values.length > capacity) values.splice(0, values.length - capacity);
    },
    summary(): FrameTimeSummary | null {
      return summarizeFrameDeltas(values);
    },
    clear(): void {
      values.length = 0;
    },
  };
}

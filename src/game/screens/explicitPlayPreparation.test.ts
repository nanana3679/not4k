import { describe, expect, it } from 'vitest';
import { explicitPreparationPosition, explicitResumeTarget } from './explicitPlayPreparation';

describe('음악 준비의 audible 목표', () => {
  it.each([[5000, 0, 2000], [1500, 0, 0], [5000, 3500, 3500], [9000, 3500, 6000]])(
    '곡 시각%i에서 시작 하한%i로 되감으면 목표%i이며 노트 위치는 사용하지 않는다', (paused, start, target) => {
      expect(explicitResumeTarget(paused, start)).toBe(target);
    });

  it.each([0.5, 1, 2])('배속%s에서 목표0·1500·9000과 L₀=0·20·80은 실제3000ms 뒤 J=목표다', rate => {
    for (const target of [0, 1500, 9000]) for (const latency of [0, 20, 80]) {
      const position = explicitPreparationPosition(target, rate, latency);
      expect(position + 3000 * rate - latency * rate).toBeCloseTo(target);
      expect(position + 2999 * rate - latency * rate).toBeLessThan(target);
    }
  });
});

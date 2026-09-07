import { describe, expect, it } from 'vitest';
import { getTutorialRenderCycleIndex, mapTutorialRenderBodyQuery } from './tutorialPreviewRenderMapping';

describe('tutorialPreviewRenderMapping', () => {
  it('renderStartMs가 loopMs인 3-cycle chart에서 cycle 1 note만 원본 session으로 매핑한다', () => {
    const queryTimes: number[] = [];
    const query = (noteIndex: number, timeMs: number) => {
      queryTimes.push(noteIndex, timeMs);
      return { units: [], successorIndex: 2 };
    };

    expect(getTutorialRenderCycleIndex(1000, 1000)).toBe(1);
    expect(mapTutorialRenderBodyQuery(query, 4, 1000, 1, 2, 1250)).toBeNull();
    expect(mapTutorialRenderBodyQuery(query, 4, 1000, 1, 6, 1250)).toEqual({
      units: [], successorIndex: 6,
    });
    expect(queryTimes).toEqual([2, 250]);
  });

  it('source note가 없거나 다른 cycle이면 body state와 successor를 노출하지 않는다', () => {
    const query = () => ({ units: [], successorIndex: 1 });
    expect(mapTutorialRenderBodyQuery(query, 0, 1000, 1, 1, 1100)).toBeNull();
    expect(mapTutorialRenderBodyQuery(query, 2, 1000, 1, 5, 1100)).toBeNull();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { beat } from '../../shared';
import type { ChartDocument } from '../../shared';
import { clampToTimelineRange, setChartAndReadTimelineRange, timelineRangeMsOf } from './timelineRange';

describe('timelineRangeMsOf', () => {
  it('offset 2000이면 범위 아래 끝은 0박(2000ms)이 아니라 음원 시작 0ms', () => {
    expect(timelineRangeMsOf(2000, 60000)).toEqual({ minTimeMs: 0, totalTimelineMs: 60000 });
  });

  it('offset −500이면 범위 아래 끝은 0박인 −500ms', () => {
    expect(timelineRangeMsOf(-500, 60000)).toEqual({ minTimeMs: -500, totalTimelineMs: 60000 });
  });
});

describe('clampToTimelineRange', () => {
  const range = { minTimeMs: 0, totalTimelineMs: 60000 };

  it('범위 [0, 60000]에서 −400ms는 아래 끝 0ms로 자른다', () => {
    expect(clampToTimelineRange(-400, range)).toBe(0);
  });

  it('범위 [0, 60000]에서 70000ms는 위 끝 60000ms로 자른다', () => {
    expect(clampToTimelineRange(70000, range)).toBe(60000);
  });

  it('범위 [0, 60000]에서 offset 2000의 −1박인 1510ms는 0박보다 앞이어도 그대로 둔다', () => {
    expect(clampToTimelineRange(1510, range)).toBe(1510);
  });
});

function chartWithOffset(offsetMs: number, bpm: number): ChartDocument {
  return {
    meta: {
      title: 'Test', artist: '', difficultyLabel: 'NORMAL', difficultyLevel: 1,
      imageFile: '', audioFile: '', previewAudioFile: '', offsetMs,
    },
    notes: [],
    trillZones: [],
    events: [
      { type: 'bpm', beat: beat(0), bpm, editorLane: 1 },
      { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(4), editorLane: 2 },
    ],
  };
}

/** TimelineRenderer처럼 끝 시각을 마지막으로 받은 차트에서 구하는 가짜 렌더러. 30마디(120박) 고정. */
function fakeRenderer(initial: ChartDocument) {
  let current = initial;
  return {
    setChart: vi.fn((chart: ChartDocument) => { current = chart; }),
    getTotalTimelineMs: () => {
      const bpm = current.events.find(event => event.type === 'bpm')!;
      return current.meta.offsetMs + 120 * (60000 / (bpm.type === 'bpm' ? bpm.bpm : 120));
    },
  };
}

describe('setChartAndReadTimelineRange', () => {
  it('120 BPM 차트(끝 60000ms)를 그리던 렌더러에 60 BPM 차트를 넘기면 setChart 뒤에 읽은 새 차트의 끝 120000ms를 돌려준다', () => {
    const renderer = fakeRenderer(chartWithOffset(0, 120));
    const next = chartWithOffset(0, 60);

    expect(setChartAndReadTimelineRange(renderer, next)).toEqual({ minTimeMs: 0, totalTimelineMs: 120000 });
    expect(renderer.setChart).toHaveBeenCalledExactlyOnceWith(next);
  });

  it('offset 2000인 새 차트를 넘기면 범위 아래 끝은 0ms, 끝은 offset을 더한 62000ms', () => {
    const renderer = fakeRenderer(chartWithOffset(0, 120));

    expect(setChartAndReadTimelineRange(renderer, chartWithOffset(2000, 120))).toEqual({ minTimeMs: 0, totalTimelineMs: 62000 });
  });
});

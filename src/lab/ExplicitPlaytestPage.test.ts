import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { compileExplicitJudgmentChart } from '../game/judgment/explicitCompiledChart';
import ExplicitPlaytestPage from './ExplicitPlaytestPage';
import { explicitPlaytestCharts } from './explicitPlaytestCharts';

describe('명시 실플레이 Lab', () => {
  it('처음 직접 진입하면 실제 엔진 연습·수동/자동·0ms 시작 안내와 /lab 복귀 링크를 표시한다', () => {
    const markup = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(ExplicitPlaytestPage)));
    expect(markup).toContain('data-lab-page="explicit-playtest"');
    expect(markup).toContain('실제 물리 입력');
    expect(markup).toContain('수동 연습');
    expect(markup).toContain('자동 입력');
    expect(markup).toContain('0ms');
    expect(markup).toContain('href="/lab"');
  });
  it.each(explicitPlaytestCharts)('$id 저작 리터럴은 변환 없이 전체문서 gate를 통과하며 compiler가 main 배치를 만든다', ({ chart }) => {
    const compiled = compileExplicitJudgmentChart(chart);
    expect(compiled.format).toBe('explicit');
    expect(compiled.bodyUnits.length).toBeGreaterThan(0);
  });
});

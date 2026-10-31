import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import TutorialExplicitPlayerPage from './TutorialExplicitPlayerPage';

function renderPage() {
  return renderToStaticMarkup(createElement(MemoryRouter, null, createElement(TutorialExplicitPlayerPage)));
}

describe('명시 튜토리얼 재생기 Lab 페이지', () => {
  it('처음 열면 첫 시연(싱글 탭 노트)을 선택한 채 튜토리얼 재생기 캔버스·Lab 복귀 링크를 표시', () => {
    const markup = renderPage();
    expect(markup).toContain('data-lab-page="tutorial-explicit-player"');
    expect(markup).toContain('data-tutorial-preview-canvas="true"');
    expect(markup).toContain('href="/lab"');
    expect(markup).toContain('data-selected-preview="tap"');
  });

  it('시연 4개를 고르는 버튼이 있고 선택한 싱글 탭 노트만 aria-pressed=true', () => {
    const markup = renderPage();
    for (const title of ['싱글 탭 노트', '더블 탭 노트', '바디·틱·릴리즈', '트릴 교대']) expect(markup).toContain(title);
    expect(markup.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(markup.match(/aria-pressed="false"/g)).toHaveLength(3);
  });

  it('반복이 끝나기 전에는 끝난 패턴 0회·기대 Perfect 3을 표시하고 마지막 결과 속성은 비움', () => {
    const markup = renderPage();
    expect(markup).toContain('data-finished-patterns="0"');
    expect(markup).toContain('data-expected-perfect="3"');
    expect(markup).toContain('data-last-perfect=""');
    expect(markup).toContain('data-last-miss=""');
  });
});

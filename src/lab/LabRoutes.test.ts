import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import LabRoutes from './LabRoutes';

describe('LabRoutes', () => {
  it.each(['/lab', '/lab/'])('%s에 접근하면 빈 화면 대신 Classic 시연실로 들어갈 수 있는 Lab 목록을 표시한다', (path) => {
    const markup = renderToStaticMarkup(createElement(
      MemoryRouter,
      { initialEntries: [path] },
      createElement(Routes, null, createElement(Route, {
        path: '/lab/*',
        element: createElement(LabRoutes),
      })),
    ));

    expect(markup).toContain('data-lab-page="index"');
    expect(markup).toContain('href="/lab/note-assets?design=classic"');
    expect(markup).toContain('노트 에셋 시연실');
  });
});

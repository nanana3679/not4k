import { createElement } from 'react';
import { renderToReadableStream } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import LabRoutes from './LabRoutes';

async function renderLabPath(path: string) {
  const stream = await renderToReadableStream(createElement(
    MemoryRouter,
    { initialEntries: [path] },
    createElement(Routes, null, createElement(Route, {
      path: '/lab/*',
      element: createElement(LabRoutes),
    })),
  ));
  await stream.allReady;
  return new Response(stream).text();
}

describe('LabRoutes', () => {
  it.each(['/lab', '/lab/'])('%s에 접근하면 에셋과 비행 시연을 모두 열 수 있는 공통 Lab 목록을 표시한다', async (path) => {
    const markup = await renderLabPath(path);

    expect(markup).toContain('data-lab-page="preview-catalog"');
    expect(markup).toContain('href="/lab/note-assets"');
    expect(markup).toContain('href="/lab/flight-background-preview"');
    expect(markup).toContain('노트 에셋 시연실');
  });

  it('/lab/note-assets를 직접 열면 기본 Classic 시안의 튜토리얼 재생기가 표시된다', async () => {
    const markup = await renderLabPath('/lab/note-assets');

    expect(markup).toContain('data-lab-page="note-assets"');
    expect(markup).toContain('data-tutorial-skin-id="classic"');
  });

  it('/lab/flight-background-preview를 직접 열면 비행 iframe과 Lab 복귀 링크가 표시된다', async () => {
    const markup = await renderLabPath('/lab/flight-background-preview');

    expect(markup).toContain('title="Flight Background Preview"');
    expect(markup).toContain('src="/__lab/flight-background-preview/"');
    expect(markup).toContain('href="/lab"');
  });
});

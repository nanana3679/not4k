import { Children, createElement, isValidElement, type ReactElement } from 'react';
import { renderToReadableStream } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import LabRoutes, { LegacyLabRedirect } from './LabRoutes';
import { labPreviewCatalog } from './labPreviewCatalog';

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

  it('/lab/gear를 직접 열면 새 기어가 들어간 게임 화면 미리보기(논리 폭 1067)와 Lab 복귀 링크가 표시된다', async () => {
    const markup = await renderLabPath('/lab/gear');

    expect(markup).toContain('data-lab-page="gear"');
    expect(markup).toContain('data-stage-width="1067"');
    expect(markup).toContain('href="/lab"');
  });

  it('/lab/flight-background-preview를 직접 열면 비행 iframe과 Lab 복귀 링크가 표시된다', async () => {
    const markup = await renderLabPath('/lab/flight-background-preview');

    expect(markup).toContain('title="Flight Background Preview"');
    expect(markup).toContain('src="/__lab/flight-background-preview/"');
    expect(markup).toContain('href="/lab"');
  });

  // 구조만 본다: 서버 렌더링은 Navigate의 이동(effect)을 실행하지 않는다. 실제 이동·쿼리·해시 유지·기록 교체는 e2e/lab/gear.spec.ts가 본다.
  it.each(['classic-frame-fit', 'classic-gear'])('옛 주소 /lab/%s는 /lab/gear로 넘기는 LegacyLabRedirect 라우트이고 카탈로그 항목이 아니라 정적 폴더를 만들지 않는다', (oldPath) => {
    type RouteProps = { path?: string; element?: ReactElement<{ to?: string }> };
    const routes = Children.toArray((LabRoutes() as ReactElement<{ children: unknown }>).props.children as never)
      .filter((child): child is ReactElement<RouteProps> => isValidElement(child));
    const legacy = routes.find((route) => route.props.path === oldPath);
    expect(legacy?.props.element?.type).toBe(LegacyLabRedirect);
    expect(legacy?.props.element?.props).toMatchObject({ to: '/lab/gear' });
    expect(labPreviewCatalog.map((preview) => preview.path)).not.toContain(`/lab/${oldPath}`);
  });
});

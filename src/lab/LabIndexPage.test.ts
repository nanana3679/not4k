import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import LabIndexPage from "./LabIndexPage";

describe("LabIndexPage", () => {
  it("/lab 색인은 시설 통과와 노트 에셋 시연실을 포함한 7개 미리보기와 대표 비행 실행 링크를 표시한다", () => {
    const markup = renderToStaticMarkup(createElement(MemoryRouter, {}, createElement(LabIndexPage)));

    expect(markup).toContain('data-lab-page="preview-catalog"');
    expect(markup).toContain("Preview Archive");
    expect(markup.match(/data-discover="true"/g)).toHaveLength(8);
    expect(markup).toContain("<dt>PREVIEWS</dt><dd>07</dd>");
    expect(markup).toContain('href="/lab/note-assets"');
    expect(markup).toContain("노트 에셋 시연실");
    expect(markup).toContain('href="/lab/flight-background-preview"');
    expect(markup).toContain("Liftoff, Infiltration, Breakthrough");
    expect(markup).toContain('href="/lab/facility-passage"');
  });

  it("/not4k/ 아래의 Lab 목록에서 에셋 시연실 링크는 /not4k/lab/note-assets를 가리킨다", () => {
    const markup = renderToStaticMarkup(createElement(
      MemoryRouter,
      { basename: "/not4k", initialEntries: ["/not4k/lab"] },
      createElement(LabIndexPage),
    ));

    expect(markup).toContain('href="/not4k/lab/note-assets"');
    expect(markup).not.toContain('href="/lab/note-assets"');
  });

  it("이미지 비교 보드 2개는 IMAGE GALLERIES 그룹에서 새 탭의 정적 페이지로 열린다", () => {
    const markup = renderToStaticMarkup(createElement(MemoryRouter, {}, createElement(LabIndexPage)));

    expect(markup).toContain("IMAGE GALLERIES");
    expect(markup).toContain("Module Size × Distance");
    expect(markup).toContain("Size × Distance × Altitude");
    expect(markup).toContain("<dt>GROUPS</dt><dd>05</dd>");
    expect(markup).toContain('href="/lab/images/module-size-distance-20260910/"');
    expect(markup).toContain('href="/lab/images/size-distance-altitude-eight-20260910/"');
    expect(markup.match(/target="_blank"/g)).toHaveLength(2);
  });
});

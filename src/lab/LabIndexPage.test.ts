import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import LabIndexPage from "./LabIndexPage";

describe("LabIndexPage", () => {
  it("/lab 색인은 7개 미리보기와 대표 Flight Background Preview 실행 링크를 표시한다", () => {
    const markup = renderToStaticMarkup(createElement(MemoryRouter, {}, createElement(LabIndexPage)));

    expect(markup).toContain('data-lab-page="preview-catalog"');
    expect(markup).toContain("Preview Archive");
    expect(markup.match(/data-discover="true"/g)).toHaveLength(8);
    expect(markup).toContain('href="/lab/flight-background-preview"');
    expect(markup).toContain("Liftoff, Infiltration, Breakthrough");
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

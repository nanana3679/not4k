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
    expect(markup.match(/href="\/lab\//g)).toHaveLength(8);
    expect(markup).toContain('href="/lab/flight-background-preview"');
    expect(markup).toContain("Liftoff, Infiltration, Breakthrough");
  });
});


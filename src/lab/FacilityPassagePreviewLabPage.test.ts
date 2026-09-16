import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { expect, it } from "vitest";
import FacilityPassagePreviewLabPage, { facilityPassageFramePath } from "./FacilityPassagePreviewLabPage";

it("/lab/facility-passage는 고도 0%·정지 상태의 시설 시연과 Lab 복귀 링크를 표시한다", () => {
  const markup = renderToStaticMarkup(createElement(MemoryRouter, {}, createElement(FacilityPassagePreviewLabPage)));
  const frame = new URL(facilityPassageFramePath, "http://preview.local");
  expect(frame.pathname).toBe("/__lab/flight-background-preview/flight/breakthrough/study.html");
  expect(Object.fromEntries(frame.searchParams)).toEqual({ study: "passage", altitude: "0", paused: "1", backdrop: "architecture" });
  expect(markup).toContain('title="Facility Passage Preview"');
  expect(markup).toContain('href="/lab"');
});

it("Lab URL의 고도 50%·시설 선택·진행 위치를 iframe 초기 URL로 복원한다", () => {
  const markup = renderToStaticMarkup(createElement(MemoryRouter, {
    initialEntries: ['/lab/facility-passage?study=passage&altitude=.5&progress=.7&paused=1'],
  }, createElement(FacilityPassagePreviewLabPage)));
  const src = markup.match(/<iframe[^>]+src="([^"]+)"/)?.[1].replaceAll('&amp;', '&');
  expect(src).toBeDefined();
  const params = new URL(src!, 'http://preview.local').searchParams;
  expect(params.get('altitude')).toBe('.5');
  expect(params.get('progress')).toBe('.7');
  expect(params.get('paused')).toBe('1');
  expect(params.get('backdrop')).toBe('architecture');
});

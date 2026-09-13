import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import FlightBackgroundPreviewLabPage, { flightBackgroundPreviewFramePath } from "./FlightBackgroundPreviewLabPage";

describe("FlightBackgroundPreviewLabPage", () => {
  it("/lab/flight-background-preview는 개발 전용 서버 미리보기와 Lab 복귀 링크를 렌더링한다", () => {
    const markup = renderToStaticMarkup(createElement(MemoryRouter, {}, createElement(FlightBackgroundPreviewLabPage)));

    expect(flightBackgroundPreviewFramePath).toBe("/__lab/flight-background-preview/");
    expect(markup).toContain('data-lab-page="flight-background-preview"');
    expect(markup).toContain('src="/__lab/flight-background-preview/"');
    expect(markup).toContain('href="/lab"');
  });
});

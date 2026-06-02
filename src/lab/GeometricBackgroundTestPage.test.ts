import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import GeometricBackgroundTestPage from "./GeometricBackgroundTestPage";

describe("GeometricBackgroundTestPage", () => {
  it("기하학 배경은 funnel grid 표면 1개만 렌더링하고 분할된 planar ground layer는 렌더링하지 않음", () => {
    const markup = renderToStaticMarkup(createElement(GeometricBackgroundTestPage));

    expect(markup.match(/geometric-test-funnel-grid/g)).toHaveLength(1);
    expect(markup).not.toContain("geometric-test-ground-layer");
    expect(markup).not.toContain("geometric-test-light-points");
  });

  it("funnel grid는 화면 위치를 이동시키는 background-position 없이 방사형 위상 변수만 사용", () => {
    const markup = renderToStaticMarkup(createElement(GeometricBackgroundTestPage));

    expect(markup).toContain("--funnel-ring-phase:");
    expect(markup).not.toContain("background-position");
  });

  it("지표면은 소실점 y를 직선 지평 경계로 쓰고 표면 굽힘 반지름만 렌더링함", () => {
    const markup = renderToStaticMarkup(createElement(GeometricBackgroundTestPage));

    expect(markup).toContain("--surface-horizon-y:18%");
    expect(markup).toContain("--surface-bend-radius-x:140%");
    expect(markup).toContain("--surface-bend-radius-y:82%");
    expect(markup).not.toContain("--surface-curve-width");
    expect(markup).not.toContain("--surface-curve-height");
  });

  it("지표면 타일선은 지평선 근처 간격을 압축하는 SVG depth line으로 렌더링함", () => {
    const markup = renderToStaticMarkup(createElement(GeometricBackgroundTestPage));

    expect(markup).toContain("geometric-test-surface-lines");
    expect(markup.match(/geometric-test-surface-depth-line/g)?.length).toBeGreaterThan(20);
  });
});

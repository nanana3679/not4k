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

  it("밝은 지평선 레이어는 제거하고 고정 배경에 지평선 색 tint를 적용함", () => {
    const markup = renderToStaticMarkup(createElement(GeometricBackgroundTestPage));

    expect(markup).not.toContain("geometric-test-horizon");
    expect(markup).toContain("--static-background-tint:207, 222, 232");
  });

  it("밝은 tint는 페이지 전체 배경이 아니라 수평선 위 skyline에만 적용함", () => {
    const markup = renderToStaticMarkup(createElement(GeometricBackgroundTestPage));

    expect(markup).toContain("clip-path:polygon(0 0, 100% 0, 100% var(--surface-horizon-y), 0 var(--surface-horizon-y))");
  });

  it("speed 양방향 슬라이더는 2000px/s까지 설정 가능", () => {
    const markup = renderToStaticMarkup(createElement(GeometricBackgroundTestPage));

    expect(markup).toContain('id="speed-range-max"');
    expect(markup).toContain('max="2000"');
  });

  it("저고도 전방 조명을 위한 하단 조명 레이어를 렌더링함", () => {
    const markup = renderToStaticMarkup(createElement(GeometricBackgroundTestPage));

    expect(markup).toContain("geometric-test-forward-light");
    expect(markup).toContain("--front-light-opacity:0");
  });

  it("전방 조명 강도 양방향 슬라이더는 0..1 범위를 조절함", () => {
    const markup = renderToStaticMarkup(createElement(GeometricBackgroundTestPage));

    expect(markup).toContain('id="front-light-intensity-range-min"');
    expect(markup).toContain('id="front-light-intensity-range-max"');
    expect(markup).toContain('max="1"');
  });

  it("전방 조명 높이 양방향 슬라이더는 0..100% 범위를 조절하고 CSS 변수로 전달함", () => {
    const markup = renderToStaticMarkup(createElement(GeometricBackgroundTestPage));

    expect(markup).toContain('id="front-light-height-range-min"');
    expect(markup).toContain('id="front-light-height-range-max"');
    expect(markup).toContain('max="100"');
    expect(markup).toContain("--front-light-height:26%");
  });
});

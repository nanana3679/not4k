import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PerspectiveSurfaceGridTestPage from "./PerspectiveSurfaceGridTestPage";

describe("PerspectiveSurfaceGridTestPage", () => {
  it("새 perspective surface grid 랩은 지표면 x/z 좌표계와 오브젝트 마커를 렌더링", () => {
    const markup = renderToStaticMarkup(createElement(PerspectiveSurfaceGridTestPage));

    expect(markup).toContain("perspective-surface-grid-page");
    expect(markup).toContain("perspective-surface-grid-svg");
    expect(markup).toContain('data-coordinate-model="ground-xz"');
    expect(markup).toContain("perspective-surface-grid-row");
    expect(markup).toContain("perspective-surface-grid-column");
    expect(markup).toContain("perspective-surface-grid-object");
    expect(markup).toContain('data-ground-x="4"');
    expect(markup).toContain('data-ground-z="8"');
  });

  it("새 perspective surface grid 랩은 중앙 소실점을 고정하고 수평선, grid, object 값을 조절하는 UI를 제공", () => {
    const markup = renderToStaticMarkup(createElement(PerspectiveSurfaceGridTestPage));

    expect(markup).toContain('id="perspective-horizon-y"');
    expect(markup).not.toContain('id="perspective-vanishing-x"');
    expect(markup).toContain('id="perspective-camera-height"');
    expect(markup).toContain('id="perspective-fov"');
    expect(markup).toContain('id="perspective-surface-angle"');
    expect(markup).toContain('id="perspective-grid-spacing"');
    expect(markup).toContain('id="perspective-z-far"');
    expect(markup).toContain('id="perspective-object-x"');
    expect(markup).toContain('id="perspective-object-z"');
    expect(markup).toContain('id="perspective-object-snap"');
  });
});

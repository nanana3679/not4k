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

  it("새 perspective surface grid 랩은 Surface/Object 탭과 altitude 기반 surface Alt 0/Alt 1 UI를 제공", () => {
    const markup = renderToStaticMarkup(createElement(PerspectiveSurfaceGridTestPage));

    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('id="perspective-tab-surface"');
    expect(markup).toContain('id="perspective-tab-object"');
    expect(markup).toContain('id="perspective-panel-surface"');
    expect(markup).toContain('id="perspective-panel-object"');
    expect(markup).toContain('id="perspective-altitude"');
    expect(markup).toContain('id="perspective-horizon-y-altitude-0"');
    expect(markup).toContain('id="perspective-horizon-y-altitude-1"');
    expect(markup).not.toContain('id="perspective-vanishing-x"');
    expect(markup).toContain('id="perspective-camera-height-altitude-0"');
    expect(markup).toContain('id="perspective-camera-height-altitude-1"');
    expect(markup).toContain('id="perspective-fov-altitude-0"');
    expect(markup).toContain('id="perspective-fov-altitude-1"');
    expect(markup).toContain('id="perspective-surface-angle-altitude-0"');
    expect(markup).toContain('id="perspective-surface-angle-altitude-1"');
    expect(markup).toContain('id="perspective-radial-y-altitude-0"');
    expect(markup).toContain('id="perspective-radial-y-altitude-1"');
    expect(markup).toContain('id="perspective-radial-z-altitude-0"');
    expect(markup).toContain('id="perspective-radial-z-altitude-1"');
    expect(markup).toContain('id="perspective-radial-strength-altitude-0"');
    expect(markup).toContain('id="perspective-radial-strength-altitude-1"');
    expect(markup).not.toContain('id="perspective-radial-x"');
    expect(markup).toContain('id="perspective-grid-spacing-altitude-0"');
    expect(markup).toContain('id="perspective-grid-spacing-altitude-1"');
    expect(markup).toContain('id="perspective-z-far-altitude-0"');
    expect(markup).toContain('id="perspective-z-far-altitude-1"');
  });

  it("surface Alt 0/Alt 1 끝점은 한 트랙 위의 양방향 슬라이더로 렌더링", () => {
    const markup = renderToStaticMarkup(createElement(PerspectiveSurfaceGridTestPage));

    expect(markup).toContain("perspective-surface-grid-dual-range");
    expect(markup).toContain('aria-label="Horizon Y altitude endpoints"');
    expect(markup).toContain("Alt 0");
    expect(markup).toContain("Alt 1");
    expect(markup).toContain("perspective-surface-grid-dual-range-track-shell");
    expect(markup).toContain('class="perspective-surface-grid-dual-range-fill"');
    expect(markup).toContain('class="perspective-surface-grid-dual-range-thumb perspective-surface-grid-dual-range-thumb-altitude-0"');
    expect(markup).toContain('class="perspective-surface-grid-dual-range-thumb perspective-surface-grid-dual-range-thumb-altitude-1"');
  });

  it("Alt 0과 Alt 1 핸들은 endpoint metadata와 별도 라벨 클래스로 구분됨", () => {
    const markup = renderToStaticMarkup(createElement(PerspectiveSurfaceGridTestPage));

    expect(markup).toContain('data-endpoint="altitude-0"');
    expect(markup).toContain('data-endpoint="altitude-1"');
    expect(markup).toContain('class="perspective-surface-grid-dual-range-value perspective-surface-grid-dual-range-value-altitude-0"');
    expect(markup).toContain('class="perspective-surface-grid-dual-range-value perspective-surface-grid-dual-range-value-altitude-1"');
    expect(markup).toContain(
      'class="perspective-surface-grid-dual-range-handle-face perspective-surface-grid-dual-range-handle-face-round perspective-surface-grid-dual-range-handle-face-altitude-0"',
    );
    expect(markup).toContain(
      'class="perspective-surface-grid-dual-range-handle-face perspective-surface-grid-dual-range-handle-face-round perspective-surface-grid-dual-range-handle-face-altitude-1"',
    );
    expect(markup).toContain('data-handle-face="0"');
    expect(markup).toContain('data-handle-face="1"');
  });

  it("새 perspective surface grid 랩은 object 좌표와 snap 컨트롤을 Object 탭 패널에 분리", () => {
    const markup = renderToStaticMarkup(createElement(PerspectiveSurfaceGridTestPage));

    expect(markup).toContain('id="perspective-object-x"');
    expect(markup).toContain('id="perspective-object-z"');
    expect(markup).toContain('id="perspective-object-snap"');
    expect(markup).toContain('aria-labelledby="perspective-tab-object"');
  });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PerspectiveSurfaceGridTestPage from "./PerspectiveSurfaceGridTestPage";

describe("PerspectiveSurfaceGridTestPage", () => {
  it("새 perspective surface grid 랩은 Pixi canvas 기반 지표면 preview와 오브젝트 metadata를 렌더링", () => {
    const markup = renderToStaticMarkup(createElement(PerspectiveSurfaceGridTestPage));

    expect(markup).toContain("perspective-surface-grid-page");
    expect(markup).toContain("perspective-surface-grid-pixi-preview");
    expect(markup).toContain("perspective-surface-grid-canvas");
    expect(markup).toContain('data-renderer="pixi"');
    expect(markup).toContain('data-coordinate-model="ground-xz"');
    expect(markup).toContain('data-surface-pattern="triangles"');
    expect(markup).toContain('data-object-count="1"');
    expect(markup).toContain('data-object-connection-count="0"');
    expect(markup).toContain('data-light-trail-time="0.18"');
    expect(markup).toContain('data-selected-object-index="0"');
    expect(markup).not.toContain("perspective-surface-grid-svg");
    expect(markup).not.toContain("perspective-surface-grid-triangle-tile");
    expect(markup).not.toContain("perspective-surface-grid-object-trail-stamp");
    expect(markup).toContain("perspective-surface-grid-forward-light");
    expect(markup).toContain("--perspective-forward-light-opacity:");
    expect(markup).toContain("--perspective-forward-light-height:");
  });

  it("새 perspective surface grid 랩은 Surface/Layout/Style/Export 작업 탭과 altitude 기반 surface Alt 0/Alt 1 UI를 제공", () => {
    const markup = renderToStaticMarkup(createElement(PerspectiveSurfaceGridTestPage));

    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('id="perspective-tab-surface"');
    expect(markup).toContain('id="perspective-tab-layout"');
    expect(markup).toContain('id="perspective-tab-style"');
    expect(markup).toContain('id="perspective-tab-export"');
    expect(markup).toContain("Layout");
    expect(markup).toContain("Style");
    expect(markup).toContain("Export");
    expect(markup).toContain('id="perspective-panel-surface"');
    expect(markup).toContain('data-surface-pattern-option="triangles"');
    expect(markup).toContain('data-surface-pattern-option="grid"');
    expect(markup).toContain('id="perspective-panel-layout"');
    expect(markup).toContain('id="perspective-panel-style"');
    expect(markup).toContain('id="perspective-panel-export"');
    expect(markup).toContain('id="perspective-global-altitude"');
    expect(markup).toContain('aria-label="Global altitude control"');
    expect(markup).toContain("perspective-surface-grid-altitude-control");
    expect(markup).toContain('id="perspective-altitude-preview-low"');
    expect(markup).toContain('id="perspective-altitude-preview-mid"');
    expect(markup).toContain('id="perspective-altitude-preview-high"');
    expect(markup).toContain('id="perspective-scroll-pause"');
    expect(markup).not.toContain('id="perspective-altitude"');
    expect(markup.indexOf("perspective-surface-grid-altitude-control")).toBeLessThan(
      markup.indexOf('class="perspective-surface-grid-control"'),
    );
    expect(markup).toContain('id="perspective-horizon-y-altitude-0"');
    expect(markup).toContain('id="perspective-horizon-y-altitude-1"');
    expect(markup).not.toContain('id="perspective-vanishing-x"');
    expect(markup).toContain('id="perspective-camera-height-altitude-0"');
    expect(markup).toContain('id="perspective-camera-height-altitude-1"');
    expect(markup).toContain('id="perspective-fov-altitude-0"');
    expect(markup).toContain('id="perspective-fov-altitude-1"');
    expect(markup).toContain('id="perspective-surface-angle-altitude-0"');
    expect(markup).toContain('id="perspective-surface-angle-altitude-1"');
    expect(markup).not.toContain('id="perspective-radial-y-altitude-0"');
    expect(markup).not.toContain('id="perspective-radial-y-altitude-1"');
    expect(markup).not.toContain('id="perspective-radial-z-altitude-0"');
    expect(markup).not.toContain('id="perspective-radial-z-altitude-1"');
    expect(markup).toContain('id="perspective-radial-strength-altitude-0"');
    expect(markup).toContain('id="perspective-radial-strength-altitude-1"');
    expect(markup).not.toContain('id="perspective-radial-x"');
    expect(markup).not.toContain("perspective-surface-grid-radial-vanishing-point");
    expect(markup).toContain('id="perspective-grid-spacing-altitude-0"');
    expect(markup).toContain('id="perspective-grid-spacing-altitude-1"');
    expect(markup).toContain('id="perspective-grid-count-altitude-0"');
    expect(markup).toContain('id="perspective-grid-count-altitude-1"');
    expect(markup).toContain('id="perspective-scroll-speed-altitude-0"');
    expect(markup).toContain('id="perspective-scroll-speed-altitude-1"');
    expect(markup).toContain('id="perspective-forward-light-altitude-0"');
    expect(markup).toContain('id="perspective-forward-light-altitude-1"');
    expect(markup).toContain('id="perspective-forward-light-height-altitude-0"');
    expect(markup).toContain('id="perspective-forward-light-height-altitude-1"');
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

  it("Layout 탭은 Select/Place/Connect/Erase 도구 모드와 선택 object inspector를 제공", () => {
    const markup = renderToStaticMarkup(createElement(PerspectiveSurfaceGridTestPage));

    expect(markup).toContain('aria-labelledby="perspective-tab-layout"');
    expect(markup).toContain('data-panel-scope="layout-workbench"');
    expect(markup).toContain('data-selected-object-index="0"');
    expect(markup).toContain('data-layout-tool="select"');
    expect(markup).toContain("perspective-surface-grid-tool-mode-bar");
    expect(markup).toContain('data-layout-tool-option="select"');
    expect(markup).toContain('data-layout-tool-option="place"');
    expect(markup).toContain('data-layout-tool-option="connect"');
    expect(markup).toContain('data-layout-tool-option="erase"');
    expect(markup).toContain('id="perspective-layout-tool-select"');
    expect(markup).toContain('id="perspective-layout-tool-place"');
    expect(markup).toContain('id="perspective-layout-tool-connect"');
    expect(markup).toContain('id="perspective-layout-tool-erase"');
    expect(markup).toContain("perspective-surface-grid-workbench-status");
    expect(markup).toContain('data-workbench-state="select"');
    expect(markup).not.toContain('aria-label="Object list"');
    expect(markup).not.toContain("perspective-surface-grid-object-list");
    expect(markup).not.toContain('aria-label="Selected object preview"');
    expect(markup).not.toContain("perspective-surface-grid-object-preview");
    expect(markup).not.toContain('aria-label="Object placement values"');
    expect(markup).not.toContain("Selected Cell");
    expect(markup).not.toContain("Selected Object");
    expect(markup).toContain("perspective-surface-grid-object-inspector");
    expect(markup).toContain("Object Shape");
    expect(markup).toContain('aria-label="Object shape"');
    expect(markup).toContain('data-object-shape-option="circle"');
    expect(markup).toContain('data-object-shape-option="triangle"');
    expect(markup).toContain('data-object-shape-option="square"');
    expect(markup).toContain('data-object-shape-option="point"');
    expect(markup).not.toContain('data-object-shape-option="line"');
    expect(markup).toContain('data-object-render-mode-option="filled"');
    expect(markup).toContain('data-object-render-mode-option="outline"');
    expect(markup).toContain('id="perspective-placement-object-height-y"');
    expect(markup).toContain('id="perspective-placement-object-diameter"');
    expect(markup).toContain('max="4.8"');
    expect(markup).toContain('id="perspective-placement-object-outline-width"');
    expect(markup).toContain('id="perspective-placement-object-color"');
    expect(markup).toContain('type="color"');
    expect(markup).toContain('value="#ebfffb"');
    expect(markup).toContain('id="perspective-placement-object-rotation"');
    expect(markup).not.toContain("Object Position");
    expect(markup).not.toContain("Span X");
    expect(markup).not.toContain("Span Z");
    expect(markup).not.toContain('id="perspective-placement-object-span-x"');
    expect(markup).not.toContain('id="perspective-placement-object-span-z"');
    expect(markup).toContain('data-selected-object-index="0"');
    expect(markup).toContain('data-object-count="1"');
    expect(markup).toContain("Remove Selected");
  });

  it("Style 탭은 새 object 기본값과 전체 light trail 설정만 조절", () => {
    const markup = renderToStaticMarkup(createElement(PerspectiveSurfaceGridTestPage));

    expect(markup).toContain('aria-labelledby="perspective-tab-style"');
    expect(markup).toContain('data-panel-scope="style-defaults"');
    expect(markup).toContain("New Object Defaults");
    expect(markup).toContain('aria-label="New object defaults"');
    expect(markup).toContain('data-object-default-shape="triangle"');
    expect(markup).toContain('data-object-default-color="#ebfffb"');
    expect(markup).toContain('data-object-render-mode-option="outline"');
    expect(markup).toContain('id="perspective-object-default-diameter"');
    expect(markup).toContain('id="perspective-object-default-outline-width"');
    expect(markup).toContain('id="perspective-object-default-color"');
    expect(markup).toContain('id="perspective-object-default-rotation"');
    expect(markup).toContain("Light Trail");
    expect(markup).toContain('id="perspective-object-trail-time"');
    expect(markup).toContain('id="perspective-object-trail-opacity"');
    expect(markup).not.toContain('id="perspective-object-trail-length"');
    expect(markup).not.toContain('id="perspective-object-trail-width"');
  });

  it("Pixi 지표면 preview는 canvas에서 object 선택을 처리할 metadata를 제공", () => {
    const markup = renderToStaticMarkup(createElement(PerspectiveSurfaceGridTestPage));

    expect(markup).toContain("perspective-surface-grid-canvas");
    expect(markup).toContain('aria-label="Perspective surface Pixi preview"');
    expect(markup).toContain('data-object-count="1"');
    expect(markup).toContain('data-selected-object-index="0"');
  });

  it("Layout 탭은 x/z range input 대신 가로세로 cell grid button으로 object 배치 UI를 제공", () => {
    const markup = renderToStaticMarkup(createElement(PerspectiveSurfaceGridTestPage));

    expect(markup).toContain('aria-labelledby="perspective-tab-layout"');
    expect(markup).toContain("Scroll Span");
    expect(markup).toContain("Span Width");
    expect(markup).toContain("Span Height");
    expect(markup).toContain('id="perspective-span-columns"');
    expect(markup).toContain('id="perspective-span-rows"');
    expect(markup).toContain('id="perspective-span-object-density"');
    expect(markup).toContain("Density");
    expect(markup).toContain('data-random-object-count="11"');
    expect(markup).toContain("Objects");
    expect(markup).toContain('id="perspective-span-randomize-objects"');
    expect(markup).toContain("Randomize");
    expect(markup).toContain("perspective-surface-grid-span-picker");
    expect(markup).toContain('data-span-picker-pattern="triangles"');
    expect(markup).toContain("perspective-surface-grid-span-triangle-map");
    expect(markup).toContain("perspective-surface-grid-span-triangle-tile");
    expect(markup).toContain('data-span-cell-column="0"');
    expect(markup).toContain('data-span-cell-row="0"');
    expect(markup).toContain('data-span-cell-triangle="upper"');
    expect(markup).toContain('data-span-cell-triangle="lower"');
    expect(markup).toContain('data-span-cell-has-object="true"');
    expect(markup).toContain('data-span-cell-selected="true"');
    expect(markup).toContain('aria-label="Span triangle upper column 1 row 1"');
    expect(markup).not.toContain("perspective-surface-grid-span-cell-triangle-upper");
    expect(markup).not.toContain('data-span-cell-object-index=""><span aria-hidden="true"></span></button>');
    expect(markup).not.toContain('id="perspective-span-object-x"');
    expect(markup).not.toContain('id="perspective-span-object-z"');
  });

  it("Layout 배치 grid는 셀 사이 간격과 셀 가운데 점을 렌더링하지 않음", () => {
    const markup = renderToStaticMarkup(createElement(PerspectiveSurfaceGridTestPage));

    expect(markup).toContain("--span-cell-gap:0px");
    expect(markup).not.toContain('data-span-cell-object-index=""><span aria-hidden="true"></span></button>');
  });

  it("랩은 현재 설정을 인게임 기본 preset 상수 파일로 저장하는 버튼을 제공", () => {
    const markup = renderToStaticMarkup(createElement(PerspectiveSurfaceGridTestPage));

    expect(markup).toContain('aria-labelledby="perspective-tab-export"');
    expect(markup).toContain('data-panel-scope="export-preset"');
    expect(markup).toContain("perspective-surface-grid-performance-summary");
    expect(markup).toContain('data-performance-object-count="1"');
    expect(markup).toContain('data-performance-connection-count="0"');
    expect(markup).toContain('data-performance-budget="ok"');
    expect(markup).toContain('id="perspective-save-preset"');
    expect(markup).toContain("Save Preset");
    expect(markup).toContain("src/game/renderer/perspectiveSurfaceGridPreset.ts");
  });
});

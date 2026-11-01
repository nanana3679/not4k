import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import ObserverSlowdownPage from "./ObserverSlowdownPage";

describe("옵저버 감속 청음 비교 Lab", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("처음 열면 AudioContext를 만들지 않고 재생 속도 4개(1.0x 선택)·감속 방식 3개·꺼진 재생 버튼·Lab 복귀 링크를 표시한다", () => {
    const createContext = vi.fn();
    vi.stubGlobal("AudioContext", createContext);

    const markup = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(ObserverSlowdownPage)));

    expect(createContext).not.toHaveBeenCalled();
    expect(markup).toContain('data-lab-page="observer-slowdown"');
    for (const rate of ["0.25x", "0.5x", "0.75x"]) expect(markup).toContain(`aria-pressed="false">${rate}</button>`);
    expect(markup).toContain('aria-pressed="true">1.0x</button>');
    expect(markup.match(/data-method="(media-element|signalsmith|soundtouch)"/g)).toEqual([
      'data-method="media-element"',
      'data-method="signalsmith"',
      'data-method="soundtouch"',
    ]);
    expect(markup.match(/<button type="button" disabled="">재생<\/button>/g)).toHaveLength(3);
    expect(markup).toContain("테스트 루프 만들기 (120 BPM · 16초)");
    expect(markup).toContain('href="/lab"');
  });
});

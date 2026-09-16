import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import NoteAssetShowcasePage from "./NoteAssetShowcasePage";

function renderPage(baseUrl = "/") {
  const basename = baseUrl.replace(/\/$/, "") || "/";
  return renderToStaticMarkup(createElement(
    MemoryRouter,
    { basename, initialEntries: [`${baseUrl}lab/note-assets`] },
    createElement(NoteAssetShowcasePage),
  ));
}

describe("NoteAssetShowcasePage", () => {
  it.each([
    ["/", "/lab"],
    ["/not4k/", "/not4k/lab"],
  ])("base=%s에서 Lab 목록으로 돌아가면 %s 주소를 사용한다", (baseUrl, labHref) => {
    const markup = renderPage(baseUrl);

    expect(markup).toContain(`class="asset-lab-back-link" href="${labHref}"`);
  });

  it("노트 에셋 Lab은 Classic 시안을 쓰는 실제 튜토리얼 재생기와 차트·키봄 조절기를 렌더링", () => {
    const markup = renderPage();

    expect(markup).toContain('data-lab-page="note-assets"');
    expect(markup).toContain('data-tutorial-skin-id="classic"');
    expect(markup).toContain('data-tutorial-preview-canvas="true"');
    expect(markup).toContain('data-active-preview="long-note"');
    expect(markup).toContain('aria-label="튜토리얼 에셋 시연 조절"');
    expect(markup).toContain('aria-label="키봄 효과 선택"');
    expect(markup).toContain('aria-label="시안 선택"');
    expect(markup).toContain("Simple");
  });

  it("재생 차트 선택기는 트릴·트릴 롱을 포함한 포인트4종·롱노트8종을 제공하고 기본 롱노트를 선택", () => {
    const markup = renderPage();

    expect(markup.match(/class="asset-lab-preview-group"/g)).toHaveLength(2);
    expect(markup).toContain("싱글");
    expect(markup).toContain("더블");
    expect(markup).toMatch(/aria-pressed="false"[^>]*>트릴</);
    expect(markup).toMatch(/aria-pressed="false"[^>]*>트릴 롱</);
    expect(markup).toContain("길이 0 Grace");
    expect(markup).toContain("판정 놓침");
    expect(markup).toContain("중간 해제");
    expect(markup).toMatch(/aria-pressed="true"[^>]*>기본 롱/);
  });

  it("에셋 랙은 트릴 포함 포인트3개·바디10개·터미널 상태11개·키봄6개를 제공", () => {
    const markup = renderPage();

    expect(markup.match(/data-point-rack-item=/g)).toHaveLength(3);
    expect(markup.match(/data-body-rack-item=/g)).toHaveLength(10);
    expect(markup.match(/data-terminal-rack-item=/g)).toHaveLength(11);
    expect(markup.match(/class="asset-lab-bomb-number"/g)).toHaveLength(6);
  });
});

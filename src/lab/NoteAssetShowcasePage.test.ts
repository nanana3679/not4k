import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import NoteAssetShowcasePage from "./NoteAssetShowcasePage";

function renderPage(baseUrl = "/", query = "") {
  const basename = baseUrl.replace(/\/$/, "") || "/";
  return renderToStaticMarkup(createElement(
    MemoryRouter,
    { basename, initialEntries: [`${baseUrl}lab/note-assets${query}`] },
    createElement(NoteAssetShowcasePage),
  ));
}

describe("NoteAssetShowcasePage", () => {
  it('version=v001 직접 링크는 이전 Classic과 v001 선택 표시·원본 랙을 함께 연다', () => {
    const markup = renderPage('/', '?design=classic&version=v001');
    expect(markup).toContain('data-tutorial-skin-id="classic-v001"');
    expect(markup).toContain('data-skin-version="v001"');
    expect(markup).toContain('value="v001" selected=""');
    expect(markup).toContain('/lab/skin-versions/classic/v001/svg/note-single.svg');
    expect(markup).toContain('id="classic-skin-version"');
  });

  it('version=v004 직접 링크는 옅은 포인트와 S05/D05 짙은 바디 선택지와 해당 재생기·바디 랙을 연다', () => {
    const markup = renderPage('/', '?design=classic&version=v004');
    expect(markup).toContain('data-tutorial-skin-id="classic-v004"');
    expect(markup).toContain('value="v004" selected=""');
    expect(markup).toContain('옅은 원본 포인트 · S05/D05 짙은 바디');
    expect(markup).toContain('/lab/skin-versions/classic/v004/svg/body-single-idle.svg');
    expect(markup).toContain('/lab/skin-versions/classic/v004/svg/body-double-idle.svg');
  });

  it('version=v006 직접 링크는 내부 검은 세로띠를 없앤 선택지와 v006 포인트 랙을 연다', () => {
    const markup = renderPage('/', '?design=classic&version=v006');
    expect(markup).toContain('data-tutorial-skin-id="classic-v006"');
    expect(markup).toContain('value="v006" selected=""');
    expect(markup).toContain('내부 검은 세로띠 제거');
    expect(markup).toContain('/lab/skin-versions/classic/v006/svg/note-single.svg');
    expect(markup).toContain('/lab/skin-versions/classic/v006/svg/note-double.svg');
  });

  it('version=v007 직접 링크는 포인트·바디 대비 3:1 선택지와 v007 포인트·바디 랙을 연다', () => {
    const markup = renderPage('/', '?design=classic&version=v007');
    expect(markup).toContain('data-tutorial-skin-id="classic-v007"');
    expect(markup).toContain('value="v007" selected=""');
    expect(markup).toContain('포인트·바디 대비 3:1');
    expect(markup).toContain('/lab/skin-versions/classic/v007/svg/note-single.svg');
    expect(markup).toContain('/lab/skin-versions/classic/v007/svg/body-double-idle.svg');
  });

  it('version=v008 직접 링크는 접촉 그림자 선택지와 v008 재생기·포인트 랙을 연다', () => {
    const markup = renderPage('/', '?design=classic&version=v008');
    expect(markup).toContain('data-tutorial-skin-id="classic-v008"');
    expect(markup).toContain('value="v008" selected=""');
    expect(markup).toContain('위아래 접촉 그림자');
    expect(markup).toContain('/lab/skin-versions/classic/v008/svg/note-single.svg');
  });

  it('version=v009 직접 링크는 트렌치 바디 선택지와 v009 바디 랙을 연다', () => {
    const markup = renderPage('/', '?design=classic&version=v009');
    expect(markup).toContain('data-tutorial-skin-id="classic-v009"');
    expect(markup).toContain('value="v009" selected=""');
    expect(markup).toContain('트렌치 바디');
    expect(markup).toContain('/lab/skin-versions/classic/v009/svg/body-single-idle.svg');
  });

  it('Simple 직접 링크는 Classic 버전 선택기를 표시하지 않는다', () => {
    const markup = renderPage('/', '?design=simple&version=v001');
    expect(markup).toContain('data-tutorial-skin-id="simple"');
    expect(markup).not.toContain('id="classic-skin-version"');
  });
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

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import ClassicFrameFitPage from './ClassicFrameFitPage';
import pageSource from './ClassicFrameFitPage.tsx?raw';

const render = () => renderToStaticMarkup(createElement(MemoryRouter, {}, createElement(ClassicFrameFitPage)));
const stageOf = (markup: string) => markup.match(/<section[^>]*data-frame-fit-stage="true"[^>]*>/)![0];

describe('ClassicFrameFitPage — 새 프레임이 들어간 실제 게임 화면 미리보기', () => {
  it('처음 열면 렌더 높이 1080·INFILTRATION·화면 맞춤·리프트 0%·TKL 키보드로 시작하고 무대가 논리 폭 1067과 함께 그 상태를 data 속성으로 알린다', () => {
    const markup = render();
    expect(markup).toContain('data-lab-page="classic-frame-fit"');
    const stage = stageOf(markup);
    for (const attribute of [
      'data-render-height="1080"', 'data-scenario="INFILTRATION"', 'data-view="fit"', 'data-renderer-ready="false"',
      'data-lift-percent="0"', 'data-keyboard="tkl"', 'data-keyboard-visible="true"', 'data-keyboard-scale="1.000"',
      'data-stage-width="1067"', 'data-fullscreen="off"',
    ]) expect(stage).toContain(attribute);
    const checkedValues = (markup.match(/<input[^>]*>/g) ?? [])
      .filter((input) => input.includes('type="radio"') && input.includes('checked=""'))
      .map((input) => input.match(/value="([^"]*)"/)![1]);
    // 무대 조절(키보드·렌더 높이·장면·보기)과 아래 비교 보기(전체).
    expect(checkedValues).toEqual(['tkl', '1080', 'INFILTRATION', 'fit', 'full']);
  });

  it('맞춤 방식·레인 폭 슬라이더·줌 흉내는 없고 키보드 2개·렌더 높이 3개·비행 장면 3개·보기 2개 라디오를 둔다', () => {
    const markup = render();
    expect(markup).not.toContain('name="frame-fit-mode"');
    expect(markup).not.toContain('id="frame-fit-lane-width"');
    expect(markup).not.toContain('data-zoom');
    expect(markup).not.toContain('data-fit-mode');
    expect(markup.match(/name="frame-fit-keyboard"/g)).toHaveLength(2);
    expect(markup.match(/name="frame-fit-render-height"/g)).toHaveLength(3);
    expect(markup.match(/name="frame-fit-scenario"/g)).toHaveLength(3);
    expect(markup.match(/name="frame-fit-view"/g)).toHaveLength(2);
    for (const label of ['TKL', '넘버패드', '화면 맞춤', '1:1 픽셀']) expect(markup).toContain(label);
  });

  it('리프트 슬라이더는 게임 리프트와 같은 정수 0~10%이고 0%에서 시작한다', () => {
    expect(render()).toMatch(/<input id="frame-fit-lift" type="range" min="0" max="10" step="1" value="0"\/>/);
  });

  it('설명은 게임과 같은 배치 숫자(0.453배·위 141행 잘림·판정선 y 416·덱 틈 13.7·키 윗면 446.5·선명도 0.82px)를 보여 준다', () => {
    const markup = render();
    expect(markup).toContain('0.453배');
    expect(markup).toContain('141행');
    expect(markup).toContain('0% (+0) · y 416');
    expect(markup).toContain('13.7 · 노트 두께 1.1개');
    expect(markup).toContain('y 446.5까지 30.5 · 노트 두께 2.4개');
    expect(markup).toContain('원본 1px → 화면 0.82px (축소)');
    expect(markup).toContain('원래 크기 · 오른쪽 아래');
  });

  it('무대는 실제 GameRenderer를 기본 옵션(내장 프레임·내장 움직임)으로 만들고, 움직임 조절은 렌더러의 공개 frameMotion API로만 건다', () => {
    expect(pageSource).toContain("import('../game/renderer')");
    expect(pageSource).toContain('new GameRenderer({');
    expect(pageSource).not.toContain('showGearFrame');
    expect(pageSource).not.toContain('frameMotion: false');
    // 페이지의 움직임 줄이기 토글이 동작하도록 움직임 줄이기에서도 움직임을 만들어 숨긴다.
    expect(pageSource).toContain("frameMotionReducedMotion: 'hide'");
    // Lab이 움직임 레이어를 따로 만들거나 얹지 않는다.
    expect(pageSource).not.toContain('attachFrameMotion');
    expect(pageSource).not.toContain('createClassicFrameMotion');
    expect(pageSource).not.toContain('addFrameOverlay');
    for (const call of ['.setEnabled(', '.setLayerVisible(', '.setReducedMotion(', '.restart()', '.timeMs', '.running', ".status === 'ready'"]) {
      expect(pageSource).toContain(call);
    }
    expect(pageSource).toContain('active.frameMotion');
    expect(pageSource).toContain('active.setupKeyboardDisplay(');
    // 게임 렌더러의 private 필드를 꺼내 쓰지 않는다.
    expect(pageSource).not.toMatch(/as unknown as \{[^}]*(gearFrameLayer|maskGraphic|_judgmentLineY|frameMotionController)/);
  });

  it('움직임 자료는 게임과 같은 공유 로더(acquireFrameMotionAssets)로 페이지가 한 번 빌려 비교 화면에 넘기고, Lab 경로의 움직임 자료를 읽지 않는다', () => {
    expect(pageSource).toContain('acquireFrameMotionAssets');
    expect(pageSource).not.toContain('loadFrameMotionAssets');
    expect(pageSource).not.toContain('classic-frame-fit/motion');
  });

  it('움직임 토글과 A 큰 광원·B 게이지 액체·C 발광선 호흡·D 하단 바 흐름 체크 4개가 모두 켜진 채 시작하고, 무대는 data-motion on·준비 전 data-motion-ready false를 알린다', () => {
    const markup = render();
    const stage = stageOf(markup);
    expect(stage).toContain('data-motion="on"');
    expect(stage).toContain('data-motion-ready="false"');
    for (const layer of ['armor', 'gauge', 'accent', 'bar']) expect(stage).toContain(`data-motion-${layer}="on"`);
    expect(markup).toMatch(/<label class="frame-fit-check frame-fit-check-master"><input type="checkbox" checked=""\/><span>움직임<\/span><\/label>/);
    const layerChecks = (markup.match(/<input[^>]*name="frame-motion-layer"[^>]*>/g) ?? []);
    expect(layerChecks.map((input) => input.match(/value="([^"]*)"/)![1])).toEqual(['armor', 'gauge', 'accent', 'bar']);
    expect(layerChecks.every((input) => input.includes('checked=""'))).toBe(true);
    for (const label of ['A 큰 광원', 'B 게이지 액체', 'C 발광선 호흡', 'D 하단 바 흐름', '처음부터 재생']) expect(markup).toContain(label);
  });

  it('Pixi ↔ 승인 SVG 비교는 보기 3개(전체 기본), 0~60초 0.1초 단위 비교 시각(처음 0초), 준비 전에는 누를 수 없는 재생 버튼, 같은 2:3 비율의 Pixi 캔버스와 SVG 자리를 둔다', () => {
    const markup = render();
    const section = markup.match(/<section[^>]*data-frame-motion-compare="true"[^>]*>/)![0];
    expect(section).toContain('data-compare-ready="false"');
    expect(section).toContain('data-compare-view="full"');
    expect(section).toContain('data-compare-time-ms="0"');
    expect(markup.match(/name="frame-motion-compare-view"/g)).toHaveLength(3);
    for (const label of ['전체', '왼쪽 장갑', '하단']) expect(markup).toContain(`<span>${label}</span>`);
    expect(markup).toMatch(/<input id="frame-motion-compare-time" type="range" min="0" max="60" step="0.1" value="0"\/>/);
    expect(markup).toMatch(/<button type="button" class="frame-fit-button" aria-pressed="false" disabled="">재생<\/button>/);
    expect(markup.match(/class="frame-motion-viewport" style="aspect-ratio:1024 \/ 1536"/g)).toHaveLength(2);
    expect(markup).toContain('data-frame-motion-pixi-host="true"');
    expect(markup).toContain('data-frame-motion-svg-host="true"');
  });

  it('비교의 띠 가장자리는 게임 렌더러와 같게 안티앨리어싱 꺼짐·스텐실로 시작하고, 가장자리 부드럽게(안티앨리어싱)·알파 마스크(실험) 체크를 둔다', () => {
    const markup = render();
    const section = markup.match(/<section[^>]*data-frame-motion-compare="true"[^>]*>/)![0];
    expect(section).toContain('data-compare-antialias="off"');
    expect(section).toContain('data-compare-band-edges="stencil"');
    expect(section).toContain('data-compare-generation="0"');
    expect(markup).toContain('<label class="frame-fit-check"><input type="checkbox"/><span>가장자리 부드럽게(안티앨리어싱)</span></label>');
    expect(markup).toContain('<label class="frame-fit-check"><input type="checkbox"/><span>띠를 알파 마스크로(실험)</span></label>');
    expect(markup).toContain('픽셀 단위 계단');
  });

  it('무대 안에 전체화면 버튼이 있다', () => {
    expect(render()).toMatch(/<div class="frame-fit-fullscreen-bar"><button type="button" class="frame-fit-overlay-button">전체화면<\/button><\/div>/);
  });

  it('Lab 목록으로 돌아가는 /lab 링크가 있다', () => {
    expect(render()).toMatch(/<a[^>]*href="\/lab"[^>]*>← Lab 목록<\/a>/);
  });
});

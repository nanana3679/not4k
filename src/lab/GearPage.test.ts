import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import GearPage from './GearPage';
import pageSource from './GearPage.tsx?raw';
import compareSource from './GearMotionCompare.tsx?raw';

const render = () => renderToStaticMarkup(createElement(MemoryRouter, {}, createElement(GearPage)));
const stageOf = (markup: string) => markup.match(/<section[^>]*data-gear-preview-stage="true"[^>]*>/)![0];

describe('GearPage — 새 기어가 들어간 실제 게임 화면 미리보기', () => {
  it('처음 열면 렌더 높이 1080·INFILTRATION·화면 맞춤·리프트 0%·TKL 키보드로 시작하고 무대가 논리 폭 1067과 함께 그 상태를 data 속성으로 알린다', () => {
    const markup = render();
    expect(markup).toContain('data-lab-page="gear"');
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
    expect(markup).not.toContain('name="gear-preview-mode"');
    expect(markup).not.toContain('id="gear-preview-lane-width"');
    expect(markup).not.toContain('data-zoom');
    expect(markup).not.toContain('data-fit-mode');
    expect(markup.match(/name="gear-preview-keyboard"/g)).toHaveLength(2);
    expect(markup.match(/name="gear-preview-render-height"/g)).toHaveLength(3);
    expect(markup.match(/name="gear-preview-scenario"/g)).toHaveLength(3);
    expect(markup.match(/name="gear-preview-view"/g)).toHaveLength(2);
    for (const label of ['TKL', '넘버패드', '화면 맞춤', '1:1 픽셀']) expect(markup).toContain(label);
  });

  it('리프트 슬라이더는 게임 리프트와 같은 정수 0~10%이고 0%에서 시작한다', () => {
    expect(render()).toMatch(/<input id="gear-preview-lift" type="range" min="0" max="10" step="1" value="0"\/>/);
  });

  it('고도 조절은 곡 진행 따라가기(기본 켬)와 정수 0~100% 직접 정하기 슬라이더(100%에서 시작)이고 무대가 data-altitude-mode="follow"를 알린다', () => {
    const markup = render();
    const stage = stageOf(markup);
    expect(stage).toContain('data-altitude-mode="follow"');
    expect(stage).toContain('data-altitude-percent="100"');
    // 렌더러가 준비되기 전에는 게이지 채움을 알리지 않는다.
    expect(stage).not.toContain('data-gear-gauge-level');
    expect(markup).toContain('<label class="gear-preview-check"><input type="checkbox" checked=""/><span>곡 진행 따라가기</span></label>');
    expect(markup).toMatch(/<input id="gear-preview-altitude" type="range" min="0" max="100" step="1" value="100"\/>/);
  });

  it('고도 고정과 게이지 채움 읽기는 렌더러 공개 API(setAltitudeOverride·gearGaugeLevel)로만 하고 무대 data-gear-gauge-level에 알린다', () => {
    expect(pageSource).toContain('active.setAltitudeOverride(');
    expect(pageSource).toContain('active.gearGaugeLevel');
    // 따라가기를 끄면 슬라이더 시작값(100%)으로 뛰지 않고 그때 보이던 게이지 채움에서 멈춘다.
    expect(pageSource).toContain('manualAltitudeOnUnfollow(');
    expect(pageSource).toContain('gearGaugeLevel');
    expect(pageSource).not.toMatch(/as unknown as \{[^}]*(gearGauge\b|altitudeOverride|flightAltitudeState)/);
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

  it('무대는 실제 GameRenderer를 기본 옵션(내장 기어·내장 gearMotion)으로 만들고, gearMotion 조절은 렌더러의 공개 gearMotion API로만 한다', () => {
    expect(pageSource).toContain("import('../game/renderer')");
    expect(pageSource).toContain('new GameRenderer({');
    expect(pageSource).not.toContain('showGear');
    expect(pageSource).not.toContain('gearMotion: false');
    // `gearMotion` 에셋은 렌더러 init이 기다리는 필수 에셋이라, 매 프레임 늦은 추가를 확인하지 않고 init 직후 한 번 알린다.
    expect(pageSource).not.toContain('reportedAttached');
    // Lab이 `gearMotion` 레이어를 따로 만들거나 추가하지 않는다.
    expect(pageSource).not.toContain('attachGearMotion');
    expect(pageSource).not.toContain('createGearMotion');
    expect(pageSource).not.toContain('addGearOverlay');
    for (const call of ['.setEnabled(', '.setLayerVisible(', '.restart()', '.timeMs', '.running', ".status === 'ready'"]) {
      expect(pageSource).toContain(call);
    }
    expect(pageSource).toContain('active.gearMotion');
    expect(pageSource).toContain('active.setupKeyboardDisplay(');
    // 게임 렌더러의 private 필드를 꺼내 쓰지 않는다.
    expect(pageSource).not.toMatch(/as unknown as \{[^}]*(gearLayer|maskGraphic|_judgmentLineY|gearMotionController)/);
  });

  it('gearMotion 에셋은 게임과 같은 공유 로더(acquireGearMotionAssets)로 페이지가 lease를 한 번 acquire해 비교 화면에 넘기고, Lab 경로의 gearMotion 에셋을 읽지 않는다', () => {
    expect(pageSource).toContain('acquireGearMotionAssets');
    expect(pageSource).not.toContain('loadGearMotionAssets');
    expect(pageSource).not.toContain('gear/motion');
  });

  it('gearMotion 토글(라벨 움직임)과 A 큰 광원·B 게이지 액체·C 발광선 호흡·D 하단 바 흐름 체크 4개가 모두 켜진 채 시작하고, 무대는 data-motion on·준비 전 data-motion-ready false를 알린다', () => {
    const markup = render();
    const stage = stageOf(markup);
    expect(stage).toContain('data-motion="on"');
    expect(stage).toContain('data-motion-ready="false"');
    for (const layer of ['armor', 'gauge', 'accent', 'bar']) expect(stage).toContain(`data-motion-${layer}="on"`);
    expect(markup).toMatch(/<label class="gear-preview-check gear-preview-check-master"><input type="checkbox" checked=""\/><span>움직임<\/span><\/label>/);
    const layerChecks = (markup.match(/<input[^>]*name="gear-motion-layer"[^>]*>/g) ?? []);
    expect(layerChecks.map((input) => input.match(/value="([^"]*)"/)![1])).toEqual(['armor', 'gauge', 'accent', 'bar']);
    expect(layerChecks.every((input) => input.includes('checked=""'))).toBe(true);
    for (const label of ['A 큰 광원', 'B 게이지 액체', 'C 발광선 호흡', 'D 하단 바 흐름', '처음부터 재생']) expect(markup).toContain(label);
  });

  it('운영체제 모션 감소 설정을 읽지 않아(RFD 0030) 무대 data-motion은 on·off 둘뿐이고, 무대와 비교 화면 모두 gearMotion을 숨기는 setReducedMotion을 부르지 않으며 화면 문구에 움직임 줄이기가 없다', () => {
    expect(pageSource).not.toContain("'reduced'");
    expect(stageOf(render())).toContain('data-motion="on"');
    for (const source of [pageSource, compareSource]) {
      expect(source).not.toContain('setReducedMotion');
      expect(source).not.toContain('reducedMotion');
      expect(source).not.toContain('matchMedia');
    }
    expect(render()).not.toContain('움직임 줄이기');
  });

  it('비교 화면은 승인 SVG를 문서에 넣기(importNode) 전에 stripSvgReducedMotionRules로 SVG 자체의 모션 감소 규칙을 걷어 낸다(보관 파일은 그대로, RFD 0030 결정 5)', () => {
    const strip = compareSource.indexOf('stripSvgReducedMotionRules(parsed)');
    expect(strip).toBeGreaterThan(-1);
    expect(strip).toBeLessThan(compareSource.indexOf('document.importNode(parsed.documentElement'));
  });

  it('Pixi ↔ 승인 SVG 비교는 보기 3개(전체 기본), 0~60초 0.1초 단위 비교 시각(처음 0초), 준비 전에는 누를 수 없는 재생 버튼, 같은 2:3 비율의 Pixi 캔버스와 SVG 자리를 둔다', () => {
    const markup = render();
    const section = markup.match(/<section[^>]*data-gear-motion-compare="true"[^>]*>/)![0];
    expect(section).toContain('data-compare-ready="false"');
    expect(section).toContain('data-compare-view="full"');
    expect(section).toContain('data-compare-time-ms="0"');
    expect(markup.match(/name="gear-motion-compare-view"/g)).toHaveLength(3);
    for (const label of ['전체', '왼쪽 장갑', '하단']) expect(markup).toContain(`<span>${label}</span>`);
    expect(markup).toMatch(/<input id="gear-motion-compare-time" type="range" min="0" max="60" step="0.1" value="0"\/>/);
    expect(markup).toMatch(/<button type="button" class="gear-preview-button" aria-pressed="false" disabled="">재생<\/button>/);
    expect(markup.match(/class="gear-motion-viewport" style="aspect-ratio:1024 \/ 1536"/g)).toHaveLength(2);
    expect(markup).toContain('data-gear-motion-pixi-host="true"');
    expect(markup).toContain('data-gear-motion-svg-host="true"');
  });

  it('비교의 띠 가장자리는 게임 렌더러와 같게 안티앨리어싱 꺼짐·스텐실로 시작하고, 가장자리 부드럽게(안티앨리어싱)·알파 마스크(실험) 체크를 둔다', () => {
    const markup = render();
    const section = markup.match(/<section[^>]*data-gear-motion-compare="true"[^>]*>/)![0];
    expect(section).toContain('data-compare-antialias="off"');
    expect(section).toContain('data-compare-band-edges="stencil"');
    expect(section).toContain('data-compare-generation="0"');
    expect(markup).toContain('<label class="gear-preview-check"><input type="checkbox"/><span>가장자리 부드럽게(안티앨리어싱)</span></label>');
    expect(markup).toContain('<label class="gear-preview-check"><input type="checkbox"/><span>띠를 알파 마스크로(실험)</span></label>');
    expect(markup).toContain('픽셀 단위 계단');
  });

  it('무대 안에 전체화면 버튼이 있다', () => {
    expect(render()).toMatch(/<div class="gear-preview-fullscreen-bar"><button type="button" class="gear-preview-overlay-button">전체화면<\/button><\/div>/);
  });

  it('Lab 목록으로 돌아가는 /lab 링크가 있다', () => {
    expect(render()).toMatch(/<a[^>]*href="\/lab"[^>]*>← Lab 목록<\/a>/);
  });
});

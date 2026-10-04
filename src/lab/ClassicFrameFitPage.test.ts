import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import ClassicFrameFitPage from './ClassicFrameFitPage';
import { FRAME_FIT_ASSET_PATHS } from './classicFrameFit';

const render = () => renderToStaticMarkup(createElement(MemoryRouter, {}, createElement(ClassicFrameFitPage)));

describe('ClassicFrameFitPage', () => {
  it('처음 열면 레인 폭 맞춤·렌더 높이 1080·INFILTRATION·화면 맞춤이 선택되고 무대가 레인 폭 400·줌 1·판정선 높이 0과 함께 그 상태를 data 속성으로 알리며 레인 폭 슬라이더는 없다', () => {
    const markup = render();

    expect(markup).toContain('data-lab-page="classic-frame-fit"');
    expect(markup).toMatch(/<section[^>]*data-frame-fit-stage="true"[^>]*>/);
    const stage = markup.match(/<section[^>]*data-frame-fit-stage="true"[^>]*>/)![0];
    expect(stage).toContain('data-fit-mode="crop"');
    expect(stage).toContain('data-render-height="1080"');
    expect(stage).toContain('data-scenario="INFILTRATION"');
    expect(stage).toContain('data-view="fit"');
    expect(stage).toContain('data-renderer-ready="false"');
    expect(stage).toContain('data-lane-width="400"');
    expect(stage).toContain('data-zoom="1"');
    expect(stage).toContain('data-lift-percent="0"');
    expect(markup).not.toContain('id="frame-fit-lane-width"');
    const checkedValues = (markup.match(/<input[^>]*>/g) ?? [])
      .filter((input) => input.includes('type="radio"') && input.includes('checked=""'))
      .map((input) => input.match(/value="([^"]*)"/)![1]);
    // 무대 조절 네 묶음과 아래 비교 보기(전체).
    expect(checkedValues).toEqual(['crop', '1080', 'INFILTRATION', 'fit', 'full']);
  });

  it('맞춤 방식 5개(가로세로 같이 줄이기 포함), 렌더 높이 3개(720·1080·1440), 비행 장면 3개, 보기 2개를 한국어 라벨의 라디오로 고른다', () => {
    const markup = render();

    for (const label of ['레인 폭 맞춤 (위 잘림)', '기둥 잘라 줄이기', '세로로 눌러 맞추기', '가로세로 같이 줄이기', '현재 게임 기어', '화면 맞춤', '1:1 픽셀']) {
      expect(markup).toContain(label);
    }
    expect(markup.match(/name="frame-fit-mode"/g)).toHaveLength(5);
    expect(markup.match(/name="frame-fit-render-height"/g)).toHaveLength(3);
    expect(markup.match(/name="frame-fit-scenario"/g)).toHaveLength(3);
    expect(markup.match(/name="frame-fit-view"/g)).toHaveLength(2);
  });

  it('움직임 토글과 A 큰 광원·B 게이지 액체·C 발광선 호흡·D 하단 바 흐름 체크 4개가 모두 켜진 채 시작하고, 무대는 data-motion on·준비 전 data-motion-ready false를 알린다', () => {
    const markup = render();
    const stage = markup.match(/<section[^>]*data-frame-fit-stage="true"[^>]*>/)![0];
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
    expect(markup).toContain('data-frame-motion-compare-canvas="true"');
    expect(markup).toContain('data-frame-motion-svg-host="true"');
  });

  it('Lab 목록으로 돌아가는 /lab 링크가 있다', () => {
    expect(render()).toMatch(/<a[^>]*href="\/lab"[^>]*>← Lab 목록<\/a>/);
  });

  it('프레임 그림과 측정값은 /lab/classic-frame-fit/ 아래 정적 파일에서 읽는다', () => {
    expect(FRAME_FIT_ASSET_PATHS).toEqual({
      image: '/lab/classic-frame-fit/frame-cutout.png',
      geometry: '/lab/classic-frame-fit/frame-fit.json',
    });
  });
});

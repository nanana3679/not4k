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
    expect(markup).not.toContain('type="range"');
    const checkedValues = (markup.match(/<input[^>]*>/g) ?? [])
      .filter((input) => input.includes('checked=""'))
      .map((input) => input.match(/value="([^"]*)"/)![1]);
    expect(checkedValues).toEqual(['crop', '1080', 'INFILTRATION', 'fit']);
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

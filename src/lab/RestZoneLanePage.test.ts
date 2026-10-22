import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import RestZoneLanePage from './RestZoneLanePage';

describe('RestZoneLanePage', () => {
  it('WebGL 없는 서버에서 렌더링하면 rest-zone-lane 루트·16초 탐색·주요 조절 항목·사용자 녹숫 1218ms·추정 녹숫과의 차 −282ms·최소 길이 지침 2.10초와 Lab 복귀 링크를 표시한다', () => {
    const html = renderToStaticMarkup(createElement(MemoryRouter, {}, createElement(RestZoneLanePage)));
    expect(html).toContain('data-lab-page="rest-zone-lane"');
    expect(html).toContain('href="/lab"');
    for (const label of ['재생', '처음으로', '재생 위치', '재생 속도', '넘어가는 각도', '원근 거리', '애니메이션 길이', '테두리', '붉은 둘레', '붉은 빗금 경계', '밝은 레인색 둘레', '없음', '빗금 레인색 밝기', '빗금 간격', '어둠 시작 위치', '윗변 남는 밝기', '차트 지침', '난이도별 추정 녹숫', '사용자 녹숫', '스크롤 속도', '리프트', '서든', 'restZone 배치', '레인 2만', '레인 3·4 같은 구간', '레인 3·4 시작 어긋남', '레인 2 짧은 구간(1.5초)', '인접 레인 묶기', '레인 사이 틈 메우기', '노트 표시']) {
      expect(html).toContain(label);
    }
    expect(html).toContain('max="16000"');
    expect(html).toContain('넘어간 높이 50%');
    expect(html).toContain('평상');
    expect(html).toContain('120 BPM');
    expect(html).toContain('레인 2 8 → 24박');
    // 기본 스크롤 355px/초·리프트 0%·서든 0%: (게임 판정선 426 + 노트 반 칸 6.25)px / 355px/초 ≈ 1218ms.
    expect(html).toContain('data-note-dwell-ms="1218"');
    // 기본 추정 녹숫 1500ms보다 282ms 빠른 설정이라 판넬이 다음 노트보다 먼저 올라온다.
    expect(html).toContain('data-dwell-gap-ms="-282"');
    expect(html).toContain('지침상 restZone은 2.10초(추정 녹숫 + 애니메이션 2번) 이상');
  });

  it('WebGL 없는 서버에서 렌더링하면 테두리 기본값이 게임 값 밝은 레인색 둘레(rim)이고 난이도별 추정 녹숫 슬라이더는 500ms부터 3000ms까지에 기본 1500ms다', () => {
    const html = renderToStaticMarkup(createElement(MemoryRouter, {}, createElement(RestZoneLanePage)));
    expect(html).toContain('<option value="rim" selected="">밝은 레인색 둘레</option>');
    expect(html).not.toContain('<option value="red-outline" selected="">');
    // 추정 녹숫 범위는 게임의 Lv.15 500ms ～ Lv.1 3000ms다(RFD 0034 결정 3).
    expect(html).toContain('<input type="range" min="500" max="3000" step="10" value="1500"/>');
  });
});

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  TutorialPatternDiagram,
  TUTORIAL_PATTERN_DIAGRAM_MIN_HEIGHT,
  TUTORIAL_PATTERN_DIAGRAM_NOTE_HEIGHT,
  TUTORIAL_PATTERN_DIAGRAM_NOTE_SCALE,
  TUTORIAL_PATTERN_DIAGRAM_NOTE_WIDTH,
  TUTORIAL_PATTERN_DIAGRAMS,
} from './TutorialPatternDiagram';
import tutorialPatternDiagramSource from './TutorialPatternDiagram.tsx?raw';

describe('TutorialPatternDiagram', () => {
  it('connected-switch 도식은 에디터 노트 렌더러 방식으로 o- + o- = o-o-를 그린다', () => {
    const html = renderToStaticMarkup(createElement(TutorialPatternDiagram, { diagramId: 'connected-switch' }));

    expect(html).toContain('data-tutorial-diagram-id="connected-switch"');
    expect(html).toContain('data-tutorial-diagram-layout="one-line-equation"');
    expect(html).toContain('aria-label="o- + o- = o-o-"');
    expect(html).toContain('data-tutorial-diagram-renderer="editor-note-renderer"');
    expect(html).toContain('data-tutorial-diagram-time-direction="up"');
    expect(html).toContain('data-editor-range-layer="body"');
    expect(html).toContain('data-editor-range-end-rendering="body"');
    expect(html).toContain('data-editor-range-layer="head"');
    expect(html).not.toContain('data-editor-range-layer="end"');
    expect(html).toContain('data-editor-point-note="long-head"');
    expect(html).toContain('data-editor-note-scale="0.5"');
    expect(html).not.toContain('/skins/crystal/');
    expect(html).toContain('data-tutorial-diagram-term="+"');
    expect(html).toContain('data-tutorial-diagram-term="="');
    expect(html).toContain('data-tutorial-diagram-term-size="large"');
  });

  it('connected-switch 입력 도식은 왼쪽 노트는 아래, 오른쪽 노트는 위로 정렬', () => {
    const html = renderToStaticMarkup(createElement(TutorialPatternDiagram, { diagramId: 'connected-switch' }));

    expect(html).toContain('data-tutorial-diagram-pattern="left" data-tutorial-diagram-align="bottom"');
    expect(html).toContain('data-tutorial-diagram-pattern="right" data-tutorial-diagram-align="top"');
  });

  it('connected-overlap 도식은 에디터 노트 렌더러 방식으로 o--- + .o.. = o-o-를 그린다', () => {
    const html = renderToStaticMarkup(createElement(TutorialPatternDiagram, { diagramId: 'connected-overlap' }));

    expect(html).toContain('data-tutorial-diagram-id="connected-overlap"');
    expect(html).toContain('aria-label="o--- + .o.. = o-o-"');
    expect(html).toContain('data-tutorial-diagram-renderer="editor-note-renderer"');
    expect(html).toContain('data-tutorial-diagram-time-direction="up"');
    expect(html).toContain('data-editor-point-note="single"');
    expect(html).toContain('data-editor-point-note="long-head"');
    expect(html).not.toContain('data-editor-range-layer="end"');
    expect(html).not.toContain('/skins/crystal/');
    expect((html.match(/data-tutorial-diagram-pattern=/g) ?? []).length).toBe(3);
  });

  it('정의된 연결 롱노트 도식 ID는 두 가지 처리법을 모두 포함', () => {
    expect(Object.keys(TUTORIAL_PATTERN_DIAGRAMS)).toEqual([
      'connected-switch',
      'connected-overlap',
    ]);
  });

  it('중앙 영역에서 한 줄로 읽히도록 에디터 노트의 5:1 비율을 유지', () => {
    expect(TUTORIAL_PATTERN_DIAGRAM_MIN_HEIGHT).toBeGreaterThanOrEqual(340);
    expect(TUTORIAL_PATTERN_DIAGRAM_NOTE_WIDTH).toBeGreaterThanOrEqual(45);
    expect(TUTORIAL_PATTERN_DIAGRAM_NOTE_WIDTH / TUTORIAL_PATTERN_DIAGRAM_NOTE_HEIGHT).toBeCloseTo(5);
    expect(TUTORIAL_PATTERN_DIAGRAM_NOTE_SCALE).toBe(0.5);
  });

  it('도식 확인 모달 안의 도식 카드도 별도 외곽선을 두지 않음', () => {
    expect(tutorialPatternDiagramSource).not.toContain("border: '1px solid rgba(116, 222, 230, 0.35)'");
  });
});

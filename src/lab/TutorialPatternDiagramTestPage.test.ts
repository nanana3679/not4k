import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import TutorialPatternDiagramTestPage from './TutorialPatternDiagramTestPage';

describe('TutorialPatternDiagramTestPage', () => {
  it('튜토리얼 패턴 다이어그램 랩은 두 연결 롱노트 이미지만 렌더링', () => {
    const html = renderToStaticMarkup(createElement(TutorialPatternDiagramTestPage));

    expect(html).toContain('data-lab-page="tutorial-pattern-diagram"');
    expect(html).toContain('data-tutorial-diagram-id="connected-switch"');
    expect(html).toContain('data-tutorial-diagram-id="connected-overlap"');
    expect(html).toContain('data-tutorial-diagram-renderer="editor-note-renderer"');
    expect(html).toContain('data-editor-range-layer="body"');
    expect(html).not.toContain('/skins/crystal/');
  });
});

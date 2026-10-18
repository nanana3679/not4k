import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SaveAsModal } from './SaveAsModal';

describe('Save As 난이도 선택', () => {
  it.each(['easy', 'LIFTOFF'])('%s 차트에서 LIFTOFF 복제를 막고 INFILTRATION을 기본 대상으로 선택한다', currentDifficulty => {
    const markup = renderToStaticMarkup(createElement(SaveAsModal, {
      currentDifficulty, title: 'Song', level: 3, isDirty: false, onSave() {}, onClose() {},
    }));
    expect(markup).toContain('<option value="LIFTOFF" disabled="">LIFTOFF (current)</option>');
    expect(markup).toContain('<option value="INFILTRATION" selected="">INFILTRATION</option>');
    expect(markup).toContain('<option value="BREAKTHROUGH">BREAKTHROUGH</option>');
    expect(markup).not.toContain('value="EASY"');
  });
});

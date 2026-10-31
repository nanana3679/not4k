import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ChartMeta } from '../../shared';
import { PAUSE_TO_EDIT_COPY } from '../editorCopy';
import { MetaEditModal } from './MetaEditModal';

const meta: ChartMeta = {
  title: '메타', artist: '작곡가', difficultyLabel: 'NORMAL', difficultyLevel: 5,
  imageFile: '', audioFile: '', previewAudioFile: '', offsetMs: 30,
};

const render = (offsetLocked: boolean) => renderToStaticMarkup(createElement(MetaEditModal, {
  meta, audioBuffer: null, offsetLocked, onSave() {}, onClose() {}, onLoadAudio() {},
}));

/** label 글자가 name인 입력의 태그. */
const inputOf = (markup: string, name: string) => markup.match(new RegExp(`<span>${name}</span><input[^>]*>`))?.[0] ?? '';

describe('메타 편집 창의 재생 중 오프셋 잠금', () => {
  it('재생 중에는 Offset 30ms 입력만 비활성이고 정지하라는 title을 달며 Title·Artist·Difficulty 입력은 활성이다', () => {
    const markup = render(true);

    expect(inputOf(markup, 'Offset \\(ms\\)')).toContain('disabled=""');
    expect(inputOf(markup, 'Offset \\(ms\\)')).toContain(`title="${PAUSE_TO_EDIT_COPY}"`);
    for (const name of ['Title', 'Artist', 'Difficulty Label', 'Difficulty Level']) {
      expect(inputOf(markup, name)).not.toBe('');
      expect(inputOf(markup, name)).not.toContain('disabled');
    }
  });

  it('정지 중에는 Offset 30ms 입력이 활성이다', () => {
    const markup = render(false);

    expect(inputOf(markup, 'Offset \\(ms\\)')).toContain('value="30"');
    expect(inputOf(markup, 'Offset \\(ms\\)')).not.toContain('disabled');
  });
});

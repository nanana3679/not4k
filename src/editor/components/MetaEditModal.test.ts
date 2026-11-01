import { Children, createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
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

type ControlProps = {
  children?: ReactNode;
  value?: string;
  onClick?: () => void;
  onChange?: (event: { target: { value: string } }) => void;
};
function controls(node: ReactNode): ControlProps[] {
  return Children.toArray(node).flatMap(child => isValidElement<ControlProps>(child)
    ? [child.props, ...controls(child.props.children)] : []);
}

describe('메타 편집 창의 재생 중 오프셋 잠금', () => {
  it('Offset 초안 30→90ms와 제목을 바꾼 뒤 재생 중 Save 콜백을 실행하면 Offset 30ms를 유지하고 새 제목만 저장한다', () => {
    const onSave = vi.fn();
    let phase = 0;
    let save: (() => void) | undefined;
    function ModalProbe() {
      const tree = MetaEditModal({ meta, audioBuffer: null, offsetLocked: phase >= 2, onSave, onClose() {}, onLoadAudio() {} });
      const fields = controls(tree);
      // 실제 onChange가 React의 렌더 중 갱신을 일으킨다. 두 초안을 만든 뒤 같은 state로 잠긴 렌더를 얻는다.
      if (phase++ === 0) fields.find(field => field.value === '30')!.onChange!({ target: { value: '90' } });
      else if (phase === 2) fields.find(field => field.value === '메타')!.onChange!({ target: { value: '새 제목' } });
      save = fields.find(field => field.children === 'Save')!.onClick;
      return tree;
    }
    renderToStaticMarkup(createElement(ModalProbe));
    save!();

    expect(onSave).toHaveBeenCalledExactlyOnceWith(
      { ...meta, title: '새 제목', offsetMs: 30 }, null, null, null, null,
    );
  });

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

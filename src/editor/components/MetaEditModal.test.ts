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

const render = (offsetLocked: boolean, hasSongRow = false) => renderToStaticMarkup(createElement(MetaEditModal, {
  meta, audioBuffer: null, offsetLocked, hasSongRow, onSave() {}, onClose() {}, onLoadAudio() {},
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

describe('메타 편집 창의 곡 표시 정보', () => {
  it('곡 행이 없으면 Title·Artist 입력을 편집할 수 있고 곡 저장 예정 안내를 표시하지 않는다', () => {
    const markup = render(false);
    for (const name of ['Title', 'Artist']) {
      expect(inputOf(markup, name)).not.toBe('');
      expect(inputOf(markup, name)).not.toMatch(/readOnly|disabled/);
    }
    expect(markup).not.toContain('song-metadata-read-only-hint');
  });

  it.each([false, true])('Title·Artist 초안과 Offset 90ms를 만든 뒤 hasSongRow=%s로 Save하면 곡 행이 있을 때만 원래 제목·아티스트를 유지한다', hasSongRow => {
    const onSave = vi.fn();
    let phase = 0;
    let save: (() => void) | undefined;
    const edits = [['메타', '새 제목'], ['작곡가', '새 작곡가'], ['30', '90']];
    function ModalProbe() {
      const tree = MetaEditModal({ meta, audioBuffer: null, hasSongRow: phase >= edits.length && hasSongRow,
        onSave, onClose() {}, onLoadAudio() {} });
      const fields = controls(tree);
      const edit = edits[phase++];
      if (edit) fields.find(field => field.value === edit[0])!.onChange!({ target: { value: edit[1] } });
      save = fields.find(field => field.children === 'Save')!.onClick;
      return tree;
    }
    renderToStaticMarkup(createElement(ModalProbe));
    save!();

    expect(onSave).toHaveBeenCalledExactlyOnceWith({ ...meta,
      title: hasSongRow ? '메타' : '새 제목', artist: hasSongRow ? '작곡가' : '새 작곡가', offsetMs: 90,
    }, null, null, null, null);
  });

  it.each([false, true])('곡 행이 있고 offsetLocked=%s이면 Title·Artist만 읽기 전용이고 곡 저장 예정 안내를 표시한다', offsetLocked => {
    const markup = render(offsetLocked, true);

    for (const name of ['Title', 'Artist']) {
      expect(inputOf(markup, name)).toContain('readOnly=""');
    }
    expect(inputOf(markup, 'Title')).toContain('value="메타"');
    expect(inputOf(markup, 'Artist')).toContain('value="작곡가"');
    expect(markup).toContain('Title and Artist are song-level values. Editing will be available with song save.');
    for (const name of ['Difficulty Label', 'Difficulty Level', 'Offset \\(ms\\)']) {
      expect(inputOf(markup, name)).not.toBe('');
      expect(inputOf(markup, name)).not.toContain('readOnly');
    }
  });
});

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

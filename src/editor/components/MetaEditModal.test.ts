import { Children, createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createEditorSong, isSongDirty } from '../songState';
import { useEditorStore } from '../stores/editorStore';
import type { ChartMeta } from '../../shared';
import { PAUSE_TO_EDIT_COPY } from '../editorCopy';
import { MetaEditModal } from './MetaEditModal';
import { PreviewRangeSelector, type PreviewRangeState } from './PreviewRangeSelector';

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

function ranges(node: ReactNode): { label: string; onChange: (range: PreviewRangeState | null) => void }[] {
  return Children.toArray(node).flatMap(child => {
    if (!isValidElement<{ children?: ReactNode; label: string;
      onChange: (range: PreviewRangeState | null) => void }>(child)) return [];
    return child.type === PreviewRangeSelector ? [child.props] : ranges(child.props.children);
  });
}

function fileInputs(node: ReactNode): { accept: string; onChange: (event: { target: { files: File[] } }) => void }[] {
  return Children.toArray(node).flatMap(child => {
    if (!isValidElement<{ children?: ReactNode; accept: string;
      onChange: (event: { target: { files: File[] } }) => void }>(child)) return [];
    return child.props.accept ? [child.props] : fileInputs(child.props.children);
  });
}

it('Meta의 프리뷰 10～20초·인게임 2～110초 초기 알림 뒤 현재 구간이 바뀌어도 미편집 구간은 적용하지 않는다', () => {
  const onSave = vi.fn();
  let phase = 0;
  let save: (() => void) | undefined;
  function Probe() {
    const tree = MetaEditModal({
      meta: { ...meta, previewStart: phase === 0 ? 10 : 30, previewEnd: phase === 0 ? 20 : 40 },
      audioBuffer: { duration: 120 } as AudioBuffer,
      initialGameplayRange: { startTime: phase === 0 ? 2 : 5, endTime: 110, fadeInTime: 1, fadeOutTime: 3 },
      onSave, onClose() {}, onLoadAudio() {},
    });
    if (phase++ === 0) {
      // PreviewRangeSelector는 사용자 조작 없이도 마운트 시 정규화한 초기 구간을 알린다.
      const selectors = ranges(tree);
      selectors[0].onChange({ startTime: 10, endTime: 20, fadeInTime: 0.5, fadeOutTime: 0.5, enabled: true });
      selectors[1].onChange({ startTime: 2, endTime: 110, fadeInTime: 1, fadeOutTime: 3, enabled: true });
    }
    save = controls(tree).find(field => field.children === 'Save')!.onClick;
    return tree;
  }
  renderToStaticMarkup(createElement(Probe));
  save!();
  expect(onSave).toHaveBeenCalledExactlyOnceWith({
    title: '메타', artist: '작곡가', difficultyLabel: 'NORMAL', difficultyLevel: 5, offsetMs: 30,
  }, null, null, null, null);
});

it('Meta에서 프리뷰를 30～40초·인게임 페이드를 2초로 수정하면 변경한 두 구간을 적용한다', () => {
  const onSave = vi.fn();
  const preview = { startTime: 10, endTime: 20, fadeInTime: 0.5, fadeOutTime: 0.5, enabled: true };
  const gameplay = { startTime: 2, endTime: 110, fadeInTime: 1, fadeOutTime: 3, enabled: true };
  let phase = 0;
  let save: (() => void) | undefined;
  function Probe() {
    const tree = MetaEditModal({ meta, audioBuffer: { duration: 120 } as AudioBuffer,
      onSave, onClose() {}, onLoadAudio() {} });
    const selectors = ranges(tree);
    if (phase === 0) { selectors[0].onChange(preview); selectors[1].onChange(gameplay); }
    if (phase++ === 1) {
      selectors[0].onChange({ ...preview, startTime: 30, endTime: 40 });
      selectors[1].onChange({ ...gameplay, fadeInTime: 2 });
    }
    save = controls(tree).find(field => field.children === 'Save')!.onClick;
    return tree;
  }
  renderToStaticMarkup(createElement(Probe));
  save!();
  expect(onSave).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ previewStart: 30, previewEnd: 40 }),
    { ...preview, startTime: 30, endTime: 40 }, null, { ...gameplay, fadeInTime: 2 }, null);
});

it('이번 Meta에서 next.ogg·next.png를 고르면 두 대기 파일과 새 음원의 0～5초 구간을 적용한다', () => {
  const onSave = vi.fn();
  const onLoadAudio = vi.fn();
  const audio = new File(['audio'], 'next.ogg');
  const jacket = new File(['jacket'], 'next.png');
  const range = { startTime: 0, endTime: 5, fadeInTime: 0, fadeOutTime: 0, enabled: true };
  let initialized = false;
  let save: (() => void) | undefined;
  function Probe() {
    const tree = MetaEditModal({ meta, audioBuffer: { duration: 5 } as AudioBuffer,
      onSave, onClose() {}, onLoadAudio });
    if (!initialized) {
      initialized = true;
      for (const input of fileInputs(tree)) {
        input.onChange({ target: { files: [input.accept === 'audio/*' ? audio : jacket] } });
      }
      for (const selector of ranges(tree)) selector.onChange(range);
    }
    save = controls(tree).find(field => field.children === 'Save')!.onClick;
    return tree;
  }
  renderToStaticMarkup(createElement(Probe));
  save!();
  expect(onSave).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ audioFile: 'next.ogg', previewStart: 0, previewEnd: 5 }), range, jacket, range, audio,
  );
  expect(onLoadAudio).toHaveBeenCalledExactlyOnceWith(audio);
});

describe('메타 편집 창의 곡 표시 정보', () => {
  it('곡 행이 없으면 Title·Artist 입력을 편집할 수 있고 곡 저장 예정 안내를 표시하지 않는다', () => {
    const markup = render(false);
    for (const name of ['Title', 'Artist']) {
      expect(inputOf(markup, name)).not.toBe('');
      expect(inputOf(markup, name)).not.toMatch(/readOnly|disabled/);
    }
    expect(markup).not.toContain('song-metadata-read-only-hint');
  });

  it.each([false, true])('Title·Artist 초안과 Offset 90ms를 만든 뒤 hasSongRow=%s로 Save하면 곡 행 유무와 관계없이 새 제목·아티스트를 적용한다', hasSongRow => {
    useEditorStore.setState(useEditorStore.getInitialState(), true);
    const store = useEditorStore.getState();
    store.loadChart({ ...store.chart, meta });
    store.setSong(hasSongRow ? createEditorSong({ title: meta.title, artist: meta.artist, jacketUrl: null,
      audioUrl: '', duration: null, previewUrl: null, previewStart: null, previewEnd: null,
      gameplayStart: null, gameplayEnd: null, gameplayFadeIn: null, gameplayFadeOut: null,
      timing: null, revision: 42 }, useEditorStore.getState().chart) : null);
    const onSave = vi.fn((updated: Partial<ChartMeta>) => store.setChart({ ...store.chart, meta: { ...meta, ...updated } }));
    let phase = 0;
    let save: (() => void) | undefined;
    const edits = [['메타', '새 제목'], ['작곡가', '새 작곡가'], ['30', '90']];
    function ModalProbe() {
      const tree = MetaEditModal({ meta, audioBuffer: null,
        onSave, onClose() {}, onLoadAudio() {} });
      const fields = controls(tree);
      const edit = edits[phase++];
      if (edit) fields.find(field => field.value === edit[0])!.onChange!({ target: { value: edit[1] } });
      save = fields.find(field => field.children === 'Save')!.onClick;
      return tree;
    }
    renderToStaticMarkup(createElement(ModalProbe));
    save!();

    expect(onSave).toHaveBeenCalledExactlyOnceWith({
      title: '새 제목', artist: '새 작곡가', offsetMs: 90, difficultyLabel: 'NORMAL', difficultyLevel: 5,
    }, null, null, null, null);
    expect(isSongDirty(useEditorStore.getState().chart, useEditorStore.getState().song)).toBe(hasSongRow);
  });

  it.each([false, true])('곡 행이 있고 offsetLocked=%s이면 Title·Artist를 편집할 수 있고 곡 저장 예정 안내는 없다', offsetLocked => {
    const markup = render(offsetLocked);

    for (const name of ['Title', 'Artist']) {
      expect(inputOf(markup, name)).not.toMatch(/readOnly|disabled/);
    }
    expect(inputOf(markup, 'Title')).toContain('value="메타"');
    expect(inputOf(markup, 'Artist')).toContain('value="작곡가"');
    expect(markup).not.toContain('song-metadata-read-only-hint');
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
      { title: '새 제목', artist: '작곡가', offsetMs: 30, difficultyLabel: 'NORMAL', difficultyLevel: 5 },
      null, null, null, null,
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

import { createEditorSong } from '../songState';
import { isChartDirty, toSavedChartJson } from '../savedChart';
import { isSongDirty } from '../songState';
import { Children, createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { beat } from '../../shared';
import type { ChartDocument } from '../../shared';
import { PAUSE_TO_EDIT_COPY } from '../editorCopy';
import { useEditorStore } from '../stores/editorStore';
import { emptySelection } from '../stores/selectionSlice';
import { EditorToolbar } from './EditorToolbar';

// 서버 렌더의 zustand 훅은 store 초기값을 읽는다. 훅이 테스트가 넣은 현재 store 값을 읽게 한다.
vi.mock('../stores', async importOriginal => {
  const actual = await importOriginal<typeof import('../stores')>();
  const store = actual.useEditorStore;
  const readCurrent = <T,>(selector: (state: ReturnType<typeof store.getState>) => T): T => selector(store.getState());
  return { ...actual, useEditorStore: Object.assign(readCurrent, store) };
});

const chart = (): ChartDocument => ({
  meta: { title: '툴바', artist: '', difficultyLabel: 'NORMAL', difficultyLevel: 1, imageFile: '', audioFile: '', previewAudioFile: '', offsetMs: 0 },
  notes: [{ type: 'tap', kind: 'single', lane: 1, beat: beat(1) }],
  trillZones: [],
  events: [{ type: 'bpm', beat: beat(0), bpm: 120 }, { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(4) }],
});

const toolbarProps = (props: { compact?: boolean; showOffsetToolbar?: boolean; saving?: boolean } = {}) => ({
  compact: props.compact ?? false,
  playbackRef: { current: null },
  autoScroll: true,
  setAutoScroll() {},
  showOffsetToolbar: props.showOffsetToolbar ?? false,
  setShowOffsetToolbar() {},
  showPlayTestMenu: false,
  setShowPlayTestMenu() {},
  saving: props.saving ?? false,
  deleting: false,
  pendingPreviewRange: null,
  pendingGameplayRange: null,
  onPlayTest() {},
  onSaveChart() {},
  onSaveAs() {},
  onDeleteChart() {},
  onDeleteSelected() {},
  onOpenMeta() {},
  onOpenCustomSnap() {},
});
const render = (props: Parameters<typeof toolbarProps>[0] = {}) => renderToStaticMarkup(createElement(EditorToolbar, toolbarProps(props)));
afterEach(() => vi.unstubAllGlobals());

/** 접근 이름(aria-label)이 name인 버튼의 여는 태그. */
const buttonTag = (markup: string, name: string) => markup.match(new RegExp(`<button[^>]*aria-label="${name}"[^>]*>`))?.[0] ?? '';

beforeEach(() => {
  useEditorStore.setState({
    song: null, isSavingSong: false, savedChartJson: toSavedChartJson(chart(), 2),
    chart: chart(), extraLaneCount: 2, selection: emptySelection(), mode: 'select', isPlaying: false, editTransaction: null,
    historyPast: [{ chart: chart(), extraLaneCount: 2 }], historyFuture: [{ chart: chart(), extraLaneCount: 2 }],
  });
});

describe('툴바의 재생 중 잠금', () => {
  it.each([false, true])('history·Redo 기록이 1개씩 있어도 재생 중(compact=%s) Undo·Redo 버튼은 비활성이고 정지하라는 title을 단다', compact => {
    useEditorStore.setState({ isPlaying: true });
    const markup = render({ compact });

    for (const name of ['Undo', 'Redo']) {
      expect(buttonTag(markup, name)).toContain('disabled=""');
      expect(buttonTag(markup, name)).toContain(`title="${PAUSE_TO_EDIT_COPY}"`);
    }
  });

  it('정지 중에는 history가 있는 Undo·Redo 버튼이 활성이고 단축키 title을 단다', () => {
    const markup = render();

    expect(buttonTag(markup, 'Undo')).not.toContain('disabled');
    expect(buttonTag(markup, 'Undo')).toContain('title="Undo (Ctrl+Z)"');
    expect(buttonTag(markup, 'Redo')).toContain('title="Redo (Ctrl+Shift+Z)"');
  });

  it('재생 중 오프셋 줄은 ms 입력과 -10·-1·+1·+10 버튼을 비활성으로 두고 Done은 활성으로 둔다', () => {
    useEditorStore.setState({ isPlaying: true });
    const markup = render({ showOffsetToolbar: true });

    expect(markup).toMatch(new RegExp(`<input[^>]*disabled=""[^>]*title="${PAUSE_TO_EDIT_COPY}"[^>]*aria-label="Audio offset milliseconds"`));
    for (const label of ['-10', '-1', '\\+1', '\\+10']) {
      expect(markup).toMatch(new RegExp(`<button[^>]*disabled=""[^>]*title="${PAUSE_TO_EDIT_COPY}"[^>]*>${label}</button>`));
    }
    expect(markup).toMatch(/<button(?![^>]*disabled)[^>]*>Done<\/button>/);
  });

  it('정지 중 오프셋 줄의 ms 입력과 증감 버튼은 활성이다', () => {
    const markup = render({ showOffsetToolbar: true });

    expect(markup).not.toContain('disabled=""');
  });
});

describe('저장 버튼 하나의 표시', () => {
  it('timing NULL의 4박 BPM을 보조 레인 1→2로 옮기면 곡은 깨끗하고 차트 dirty·이탈 확인이 남는다', () => {
    const document = chart();
    document.events[1] = { ...document.events[1], editorLane: 2 };
    document.events.push({ type: 'bpm', beat: beat(4), bpm: 180, editorLane: 1 });
    const song = createEditorSong({ title: '툴바', artist: '', jacketUrl: null, audioUrl: '', duration: null,
      previewUrl: null, previewStart: null, previewEnd: null, gameplayStart: null, gameplayEnd: null,
      gameplayFadeIn: null, gameplayFadeOut: null, timing: null, revision: 42 }, document);
    useEditorStore.setState({ song, chart: document, savedChartJson: toSavedChartJson(document, 2) });
    useEditorStore.getState().setChart({ ...document,
      events: document.events.map((event, index) => index === 2 ? { ...event, editorLane: 2 } : event),
    });
    const state = useEditorStore.getState();
    expect(isSongDirty(state.chart, state.song)).toBe(false);
    expect(isChartDirty(state.chart, 2, state.savedChartJson, true)).toBe(true);
    expect(buttonTag(render(), 'Save, unsaved changes')).not.toBe('');

    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent, location: { href: '/editor' } });
    let openedMenu = false;
    let leave: (() => void) | undefined;
    function inspect(node: ReactNode) {
      Children.forEach(node, child => {
        if (!isValidElement<{ children?: ReactNode; 'aria-label'?: string; onClick?: () => void }>(child)) return;
        if (child.props['aria-label'] === 'More editor actions' && !openedMenu) {
          openedMenu = true;
          child.props.onClick?.();
        }
        if (child.props.children === 'Back to Songs') leave = child.props.onClick;
        inspect(child.props.children);
      });
    }
    function Probe() {
      const tree = EditorToolbar(toolbarProps());
      inspect(tree);
      return tree;
    }
    renderToStaticMarkup(createElement(Probe));
    expect(leave).toBeDefined();
    leave!();
    expect(dispatchEvent).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ type: 'editor:requestLeave' }));
    expect(window.location.href).toBe('/editor');
  });

  it.each([false, true])('곡 제목을 새 제목으로 바꾸면 compact=%s에서 Save 1개만 미저장이고 곡 저장 중 비활성이다', compact => {
    const document = chart();
    const song = createEditorSong({ title: '툴바', artist: '', jacketUrl: null, audioUrl: '', duration: null,
      previewUrl: null, previewStart: null, previewEnd: null, gameplayStart: null, gameplayEnd: null,
      gameplayFadeIn: null, gameplayFadeOut: null, timing: null, revision: 42 }, document);
    useEditorStore.setState({ song, savedChartJson: toSavedChartJson(document, 2),
      chart: { ...document, meta: { ...document.meta, title: '새 제목' } } });
    const markup = render({ compact });
    expect(buttonTag(markup, 'Save, unsaved changes')).not.toBe('');
    expect(markup.match(/aria-label="Save[^"]*"/g)).toHaveLength(1);
    expect(markup).not.toContain('Save Song');
    useEditorStore.setState({ isSavingSong: true });
    expect(buttonTag(render({ compact }), 'Saving')).toContain('disabled=""');
  });
  it('곡 행 없이 1박 노트를 열면 Save 1개로 차트를 저장한다', () => {
    expect(render()).not.toContain('Save Song');
    expect(render().match(/aria-label="Save[^"]*"/g)).toHaveLength(1);
  });
});

const saveIndicatorCases = [false, true].flatMap(compact =>
  [false, true].flatMap(songDirty =>
    [false, true].map(chartDirty => ({ compact, songDirty, chartDirty }))),
);
it.each(saveIndicatorCases)('compact=$compact·곡 변경=$songDirty·차트 변경=$chartDirty에서 Save 표시는 OR이고 저장 버튼은 1개다', ({ compact, songDirty, chartDirty }) => {
  const document = chart();
  const song = createEditorSong({ title: '툴바', artist: '', jacketUrl: null, audioUrl: '', duration: null,
    previewUrl: null, previewStart: null, previewEnd: null, gameplayStart: null, gameplayEnd: null,
    gameplayFadeIn: null, gameplayFadeOut: null, timing: null, revision: 42 }, document);
  useEditorStore.setState({ song, chart: { ...document,
    meta: { ...document.meta, title: songDirty ? '새 제목' : document.meta.title },
    notes: chartDirty ? [...document.notes, { type: 'tap', kind: 'single', lane: 2, beat: beat(2) }] : document.notes,
  } });
  const markup = render({ compact });
  expect(buttonTag(markup, songDirty || chartDirty ? 'Save, unsaved changes' : 'Save')).not.toBe('');
  expect(markup.match(/aria-label="Save[^"]*"/g)).toHaveLength(1);
  expect(buttonTag(render({ compact, saving: true }), 'Saving')).toContain('disabled=""');
});

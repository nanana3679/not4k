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
import { confirmLeave, hasUnsavedEditorChanges, type UnsavedChangesFlow } from '../unsavedChangesFlow';
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

const toolbarProps = (props: { compact?: boolean; showOffsetToolbar?: boolean; saving?: boolean;
  songInfoOpen?: boolean; onToggleSongInfo?: () => void; } = {}) => ({
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
  onPlayTest() {},
  onSaveChart() {},
  onSaveAs() {},
  onDeleteChart() {},
  onDeleteSelected() {},
  onOpenMeta() {},
  onOpenCustomSnap() {},
  songInfoOpen: props.songInfoOpen ?? false,
  onToggleSongInfo: props.onToggleSongInfo,
});
const render = (props: Parameters<typeof toolbarProps>[0] = {}) => renderToStaticMarkup(createElement(EditorToolbar, toolbarProps(props)));
afterEach(() => vi.unstubAllGlobals());

/** 접근 이름(aria-label)이 name인 버튼의 여는 태그. */
const buttonTag = (markup: string, name: string) => markup.match(new RegExp(`<button[^>]*aria-label="${name}"[^>]*>`))?.[0] ?? '';

/** More 메뉴를 연 툴바에서 Back to Songs 버튼의 onClick을 꺼낸다. */
function backToSongs(props: Parameters<typeof toolbarProps>[0] = {}): () => void {
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
    const tree = EditorToolbar(toolbarProps(props));
    inspect(tree);
    return tree;
  }
  renderToStaticMarkup(createElement(Probe));
  expect(leave).toBeDefined();
  return leave!;
}

beforeEach(() => {
  useEditorStore.setState({
    song: null, isSavingSong: false, isLoadingSongAudio: false, savedChartJson: toSavedChartJson(chart(), 2),
    chart: chart(), extraLaneCount: 2, selection: emptySelection(), mode: 'select', isPlaying: false, editTransaction: null,
    historyPast: [{ chart: chart(), extraLaneCount: 2, songDraft: null }], historyFuture: [{ chart: chart(), extraLaneCount: 2, songDraft: null }],
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

describe('엔티티 타입 드롭다운', () => {
  it('Create 모드 드롭다운에 single·text는 있고 곡 공통 열이 정하는 BPM·박자는 없다', () => {
    useEditorStore.setState({ mode: 'create' });
    const markup = render();
    expect(markup).toContain('value="single"');
    expect(markup).toContain('value="text"');
    expect(markup).not.toContain('value="bpm"');
    expect(markup).not.toContain('value="timeSignature"');
  });
});

describe('저장 버튼 하나의 표시', () => {
  it('timing NULL의 4박 text를 보조 레인 1→2로 옮기면 곡은 깨끗하고 차트 dirty·이탈 확인이 남는다', () => {
    const document = chart();
    document.events.push({ type: 'text', beat: beat(4), endBeat: beat(8), text: 'hi', editorLane: 1 });
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
    backToSongs()();
    expect(dispatchEvent).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ type: 'editor:requestLeave' }));
    expect(window.location.href).toBe('/editor');
  });

  it.each([
    ['곡·차트가 깨끗할 때', {}, {}],
    ['차트 저장 중', { saving: true }, {}],
    ['곡 저장 중', {}, { isSavingSong: true }],
    ['드로어에서 고른 음원을 불러오는 중', {}, { isLoadingSongAudio: true }],
  ] as const)('%s Back to Songs를 누르면 바로 /game으로 가지 않고 언제나 이탈 확인 흐름(editor:requestLeave)에 넘긴다', (_, props, state) => {
    useEditorStore.setState(state);
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent, location: { href: '/editor' } });

    backToSongs(props)();

    expect(dispatchEvent).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ type: 'editor:requestLeave' }));
    expect(window.location.href).toBe('/editor');
  });

  it.each([false, true])('곡·차트가 깨끗해도 드로어에서 고른 음원을 불러오는 중이면 compact=%s에서 Save가 미저장이다', compact => {
    useEditorStore.setState({ isLoadingSongAudio: true });

    expect(buttonTag(render({ compact }), 'Save, unsaved changes')).not.toBe('');
  });

  it('드로어 음원을 불러오는 중 Back to Songs를 누르면 이탈 확인 흐름이 Save 표시와 같은 미저장 판단으로 저장 후 이동·버리고 이동·취소를 묻고, 취소하면 머문다', async () => {
    useEditorStore.setState({ isLoadingSongAudio: true });
    const askLeave = vi.fn(async () => 'cancel' as const);
    // 에디터 페이지(App)의 editor:requestLeave 처리와 같은 흐름: 미저장 판단은 Save 표시와 같은 hasUnsavedEditorChanges다.
    const flow: UnsavedChangesFlow = {
      saving: () => false, notifySaving() {}, commitDrafts() {},
      songInfoDirty: () => false, anyDirty: () => hasUnsavedEditorChanges(useEditorStore.getState()),
      askSongInfo: async () => 'cancel', askLeave, save: async () => {}, discardSongInfo: () => true,
    };
    let leaving: Promise<boolean> | undefined;
    vi.stubGlobal('window', {
      location: { href: '/editor' },
      dispatchEvent: (event: Event) => { if (event.type === 'editor:requestLeave') leaving = confirmLeave(flow); },
    });

    backToSongs()();

    await expect(leaving).resolves.toBe(false);
    expect(askLeave).toHaveBeenCalledExactlyOnceWith('leave');
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
  it.each(['preview', 'gameplay'] as const)('곡 행 없는 차트에 %s 구간 0～8초가 대기 중이면 Save가 미저장이고, Save가 대기 구간을 비우면 깨끗하다', kind => {
    const range = { startTime: 0, endTime: 8, fadeInTime: 0, fadeOutTime: 0 };
    const empty = useEditorStore.getState().songlessMedia;
    useEditorStore.setState({ songlessMedia: { ...empty, [kind === 'preview' ? 'previewRange' : 'gameplayRange']: range } });
    expect(buttonTag(render(), 'Save, unsaved changes')).not.toBe('');

    useEditorStore.setState({ songlessMedia: empty });
    expect(buttonTag(render(), 'Save')).not.toBe('');
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

/** More 메뉴를 연 뒤 툴바의 모든 버튼 이름(aria-label 또는 글자)을 모은다. */
function buttonNamesWithMoreMenu(props: Parameters<typeof toolbarProps>[0]): string[] {
  return renderWithMoreMenu(props).names;
}

/** More 메뉴를 연 툴바의 버튼 이름과 HTML. */
function renderWithMoreMenu(props: Parameters<typeof toolbarProps>[0]): { names: string[]; markup: string } {
  let opened = false;
  let names: string[] = [];
  const text = (node: ReactNode): string => Children.toArray(node).map(child => typeof child === 'string' || typeof child === 'number'
    ? String(child) : isValidElement<{ children?: ReactNode }>(child) ? text(child.props.children) : '').join('');
  function inspect(node: ReactNode) {
    Children.forEach(node, child => {
      if (!isValidElement<{ children?: ReactNode; 'aria-label'?: string; onClick?: () => void }>(child)) return;
      if (child.type === 'button') {
        const name = child.props['aria-label'] ?? text(child.props.children);
        names.push(name);
        if (name === 'More editor actions' && !opened) {
          opened = true;
          child.props.onClick?.();
        }
      }
      inspect(child.props.children);
    });
  }
  function Probe() {
    const tree = EditorToolbar(toolbarProps(props));
    names = [];
    inspect(tree);
    return tree;
  }
  const markup = renderToStaticMarkup(createElement(Probe));
  return { names, markup };
}

/** chart()와 같은 제목·타이밍으로 저장된 곡(revision 42). */
const savedSong = (document: ChartDocument) => createEditorSong({ title: document.meta.title, artist: '', jacketUrl: null, audioUrl: '',
  duration: null, previewUrl: null, previewStart: null, previewEnd: null, gameplayStart: null, gameplayEnd: null,
  gameplayFadeIn: null, gameplayFadeOut: null, timing: null, revision: 42 }, document);

/** title이 미저장 표시인 Song Info 버튼(글자 뒤 점 포함). */
const UNSAVED_SONG_INFO_BUTTON = /<button[^>]*title="Song Info \(unsaved changes\)"[^>]*>Song Info<span aria-hidden="true"[^>]*><\/span><\/button>/;

describe('Song Info 버튼의 곡 정보 미저장 표시', () => {
  it.each([false, true])('곡 Title을 "새 제목"으로 바꾸면(compact=%s) Song Info 버튼에 미저장 title과 점을 달고 버튼 이름은 Song Info로 둔다', compact => {
    const document = chart();
    useEditorStore.setState({ song: savedSong(document), chart: { ...document, meta: { ...document.meta, title: '새 제목' } } });

    const { names, markup } = renderWithMoreMenu({ compact, onToggleSongInfo: () => {} });

    expect(markup).toMatch(UNSAVED_SONG_INFO_BUTTON);
    expect(names).toContain('Song Info');
    expect(buttonTag(markup, 'Save, unsaved changes')).not.toBe('');
  });

  it.each([false, true])('노트만 2박에 추가하면(compact=%s) Save만 미저장 표시이고 Song Info 버튼에는 점·미저장 title이 없다', compact => {
    const document = chart();
    useEditorStore.setState({ song: savedSong(document),
      chart: { ...document, notes: [...document.notes, { type: 'tap', kind: 'single', lane: 2, beat: beat(2) }] } });

    const { markup } = renderWithMoreMenu({ compact, onToggleSongInfo: () => {} });

    expect(buttonTag(markup, 'Save, unsaved changes')).not.toBe('');
    expect(markup).toMatch(/<button[^>]*>Song Info<\/button>/);
    expect(markup).not.toContain('Song Info (unsaved changes)');
  });

  it('곡 정보가 저장된 그대로여도 드로어 음원을 불러오는 중(isLoadingSongAudio)이면 Song Info 버튼에 점을 단다', () => {
    const document = chart();
    useEditorStore.setState({ song: savedSong(document), isLoadingSongAudio: true });

    expect(render({ onToggleSongInfo: () => {} })).toMatch(UNSAVED_SONG_INFO_BUTTON);
  });
});

describe('곡 정보 드로어 열기와 오프셋 줄(RFD 0098)', () => {
  it('곡 행이 있으면 데스크톱 툴바에 Song Info 토글을 두고 열림이면 aria-pressed=true이며 More 메뉴에 Offset이 없다', () => {
    const onToggleSongInfo = vi.fn();
    const markup = render({ onToggleSongInfo, songInfoOpen: true });

    expect(markup).toMatch(/<button[^>]*aria-pressed="true"[^>]*>Song Info<\/button>/);
    const names = buttonNamesWithMoreMenu({ onToggleSongInfo });
    expect(names).toContain('Song Info');
    expect(names).toContain('Meta');
    expect(names).not.toContain('Offset');
  });

  it('compact 툴바에서 곡 행이 있으면 More 메뉴에 Song Info가 있고 Offset이 없다', () => {
    const names = buttonNamesWithMoreMenu({ compact: true, onToggleSongInfo: () => {} });

    expect(names).toContain('Song Info');
    expect(names).not.toContain('Offset');
  });

  it.each([false, true])('곡 행이 없으면(compact=%s) Song Info 없이 More 메뉴의 Offset을 그대로 둔다', compact => {
    const names = buttonNamesWithMoreMenu({ compact });

    expect(names).not.toContain('Song Info');
    expect(names).toContain('Offset');
  });
});

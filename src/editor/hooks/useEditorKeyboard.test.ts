import { afterEach, describe, expect, it, vi } from 'vitest';
import { beat } from '../../shared';
import type { ChartDocument, DocumentNoteEntity } from '../../shared';
import { selectCanRedo, selectCanUndo, useEditorStore } from '../stores';
import { emptySelection } from '../stores/selectionSlice';
import { SelectMode } from '../modes/SelectMode';
import { hitTestNoteAt } from '../timeline/hitTest';
import { makeFakeSpace } from '../timeline/makeFakeSpace';
import type { PlaybackController } from '../playback/PlaybackController';
import { PAUSE_TO_EDIT_COPY } from '../editorCopy';
import { handleEditorKeyDown } from './useEditorKeyboard';

vi.mock('../../shared/toast', () => ({ showToast: vi.fn() }));

const current = () => useEditorStore.getState();
const notes = () => current().chart.notes;
const chart = (source: DocumentNoteEntity[]): ChartDocument => ({
  meta: { title: '단축키', artist: '', difficultyLabel: 'NORMAL', difficultyLevel: 1, imageFile: '', audioFile: '', previewAudioFile: '', offsetMs: 0 },
  notes: source,
  trillZones: [],
  events: [{ type: 'bpm', beat: beat(0), bpm: 120 }, { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(4) }],
});

let unsubscribe = () => {};
afterEach(() => unsubscribe());

function setup(source: DocumentNoteEntity[] = [{ type: 'tap', kind: 'single', lane: 1, beat: beat(1) }]) {
  useEditorStore.setState({
    chart: chart(source), mode: 'select', selection: emptySelection(), extraLaneCount: 2, isPlaying: false,
    historyPast: [], historyFuture: [], historyLastCaptureAt: 0, editTransaction: null,
  });
  const space = makeFakeSpace({
    hitTestUnifiedNote: (lane, at) => hitTestNoteAt(notes(), lane, at, undefined, current().selection.notes),
  });
  const mode = new SelectMode(current().chart, {
    space,
    getSelection: () => current().selection,
    setSelection: value => current().setSelection(value),
    setSelectionTransient: value => current().setSelectionTransient(value),
    onChartUpdate: (value, transaction) => current().setChart(value, { transaction }),
    getExtraLaneCount: () => current().extraLaneCount,
    setExtraLaneCount: (count, transaction) => current().setExtraLaneCount(count, transaction),
    beginTransaction: onInterrupt => current().beginEditTransaction('selectModeEdit', onInterrupt),
    commitTransaction: token => current().commitEditTransaction(token),
    cancelTransaction: token => current().cancelEditTransaction(token),
    isEditLocked: () => current().isPlaying,
  });
  // App.tsx의 [chart] effect처럼 store 차트가 바뀌면 모드에 넘긴다.
  unsubscribe = useEditorStore.subscribe(state => mode.setChart(state.chart));
  // PlaybackController처럼 재생 상태가 바뀌면 store의 setIsPlaying을 부른다(App의 onPlayStateChange 배선).
  const playback = { togglePlay: () => current().setIsPlaying(!current().isPlaying) } as unknown as PlaybackController;
  const toasts: string[] = [];
  const press = (key: string, modifiers: { ctrlKey?: boolean; shiftKey?: boolean; repeat?: boolean } = {}) => handleEditorKeyDown(
    { key, ctrlKey: false, metaKey: false, shiftKey: false, preventDefault: () => {}, ...modifiers },
    {
      mode: current().mode, selectMode: mode, playback, bpmChanges: [], offsetMs: 0, shortcutsBlocked: false,
      isPlaying: current().isPlaying,
      setMode: next => current().setMode(next), addToast: message => { toasts.push(message); },
    },
  );
  const pasteCopyOfFirstNoteAt8 = () => { mode.selectNote(0); mode.copy(); mode.paste(beat(8)); };
  return { mode, press, pasteCopyOfFirstNoteAt8, toasts };
}

describe('붙여넣기·드래그 중 독립 명령', () => {
  it('8박 붙여넣기 대기 중 G를 누르면 붙여넣기를 먼저 확정해 뒤의 Esc가 8박 Grace 탭을 지우지 않고 Undo 2번에 처음 1개로 돌아간다', () => {
    const { mode, press, pasteCopyOfFirstNoteAt8 } = setup(); const initial = current().chart;
    pasteCopyOfFirstNoteAt8();
    press('g');
    expect(notes()[1]).toMatchObject({ type: 'tap', beat: beat(8), grace: true });
    expect(mode.isPendingPaste).toBe(false);

    press('Escape');
    expect(notes()).toHaveLength(2);
    expect(() => { mode.onPointerDown(1, 8, false, false); mode.onPointerUp(1, 8); }).not.toThrow();
    expect(current().selection.notes).toEqual(new Set([1]));
    current().undo(); current().undo();
    expect(current().chart).toEqual(initial);
  });

  it('8박 붙여넣기 대기 중 G 뒤 ArrowUp은 붙여넣은 탭을 9박으로 옮기고 Esc 뒤에도 9박에 남는다', () => {
    const { press, pasteCopyOfFirstNoteAt8 } = setup();
    pasteCopyOfFirstNoteAt8();
    press('g'); press('ArrowUp');
    expect(notes()[1].beat).toEqual(beat(9));

    press('Escape');
    expect(notes()).toHaveLength(2);
    expect(notes()[1].beat).toEqual(beat(9));
  });

  it('8박 붙여넣기 대기 중 C·S로 모드를 바꾸면 붙여넣기를 확정해 Esc 뒤에도 2개이고 Undo 1번에 1개가 된다', () => {
    const { mode, press, pasteCopyOfFirstNoteAt8 } = setup();
    pasteCopyOfFirstNoteAt8();
    press('c'); press('s');
    expect(mode.isPendingPaste).toBe(false);

    press('Escape');
    expect(notes()).toHaveLength(2);
    current().undo();
    expect(notes()).toHaveLength(1);
  });

  it('G 편집 뒤 1박 탭을 3박까지 끄는 중 Ctrl+Z는 드래그만 되돌리고 이후 5박 move·up을 무시하며 Redo로 3박이 된다', () => {
    const { mode, press } = setup();
    mode.selectNote(0); press('g');
    mode.onPointerDown(1, 1, false, false); mode.onPointerMove(1, 3);
    expect(notes()[0].beat).toEqual(beat(3));

    press('z', { ctrlKey: true });
    expect(notes()[0]).toMatchObject({ beat: beat(1), grace: true });
    expect(mode.isMoveDragging).toBe(false);
    mode.onPointerMove(1, 5); mode.onPointerUp(1, 5);
    expect(notes()[0].beat).toEqual(beat(1));

    press('z', { ctrlKey: true, shiftKey: true });
    expect(notes()[0].beat).toEqual(beat(3));
  });
});

describe('transaction 안의 첫 편집 Undo', () => {
  it('차트를 불러온 직후 첫 8박 붙여넣기 대기 중 Ctrl+Z 한 번이 붙여넣기를 되돌리고 Ctrl+Shift+Z로 다시 2개가 된다', () => {
    const { mode, press, pasteCopyOfFirstNoteAt8 } = setup();
    pasteCopyOfFirstNoteAt8();
    expect(current().historyPast).toHaveLength(0);

    press('z', { ctrlKey: true });
    expect(notes()).toHaveLength(1);
    expect(mode.isPendingPaste).toBe(false);

    press('z', { ctrlKey: true, shiftKey: true });
    expect(notes()).toHaveLength(2);
  });

  it('history가 빈 첫 붙여넣기 대기 중 selectCanUndo는 true이고 Redo 기록 1개가 있어도 selectCanRedo는 false다', () => {
    const { pasteCopyOfFirstNoteAt8 } = setup();
    useEditorStore.setState({ historyFuture: [{ chart: current().chart, extraLaneCount: 2 }] });
    expect(selectCanUndo(current())).toBe(false);
    expect(selectCanRedo(current())).toBe(true);

    pasteCopyOfFirstNoteAt8();
    expect(selectCanUndo(current())).toBe(true);
    expect(selectCanRedo(current())).toBe(false);
  });
});

describe('재생 중 단축키(RFD 0099)', () => {
  type Modifiers = { ctrlKey?: boolean; shiftKey?: boolean };
  it.each<[string, string, Modifiers]>([
    ['Ctrl+Z', 'z', { ctrlKey: true }],
    ['Ctrl+Shift+Z', 'Z', { ctrlKey: true, shiftKey: true }],
    ['Ctrl+Y', 'y', { ctrlKey: true }],
    ['Ctrl+X', 'x', { ctrlKey: true }],
    ['Ctrl+V', 'v', { ctrlKey: true }],
    ['G', 'g', {}],
    ['Delete', 'Delete', {}],
    ['Backspace', 'Backspace', {}],
    ['Ctrl+Delete', 'Delete', { ctrlKey: true }],
    ['ArrowUp', 'ArrowUp', {}],
    ['ArrowDown', 'ArrowDown', {}],
    ['ArrowLeft', 'ArrowLeft', {}],
    ['ArrowRight', 'ArrowRight', {}],
    ['Ctrl+ArrowUp', 'ArrowUp', { ctrlKey: true }],
    ['Shift+ArrowUp', 'ArrowUp', { shiftKey: true }],
    ['Enter', 'Enter', {}],
  ])('1박 탭을 선택·복사하고 history·Redo 기록이 1개씩 있을 때 재생 중 %s는 차트·history·재생 상태를 바꾸지 않고 안내 토스트 1개를 띄운다', (_label, key, modifiers) => {
    const { mode, press, toasts } = setup([
      { type: 'tap', kind: 'single', lane: 1, beat: beat(1) },
      { type: 'body', lane: 2, beat: beat(2), endBeat: beat(4), holdCount: 1 },
    ]);
    mode.selectNote(0); mode.copy();
    const history = { historyPast: [{ chart: chart([]), extraLaneCount: 2 }], historyFuture: [{ chart: chart([]), extraLaneCount: 2 }] };
    useEditorStore.setState({ ...history, isPlaying: true });
    const before = current().chart;

    press(key, modifiers);

    expect(current().chart).toBe(before);
    expect(current().historyPast).toEqual(history.historyPast);
    expect(current().historyFuture).toEqual(history.historyFuture);
    expect(current().isPlaying).toBe(true);
    expect(mode.isPendingPaste).toBe(false);
    expect(toasts).toEqual([PAUSE_TO_EDIT_COPY]);
  });

  it('재생 중 Delete를 누른 채 반복 입력이 와도 안내 토스트는 처음 1번만 띄운다', () => {
    const { mode, press, toasts } = setup();
    mode.selectNote(0);
    useEditorStore.setState({ isPlaying: true });

    press('Delete'); press('Delete', { repeat: true }); press('Delete', { repeat: true });

    expect(notes()).toHaveLength(1);
    expect(toasts).toEqual([PAUSE_TO_EDIT_COPY]);
  });

  it('재생 중 Ctrl+A는 1박·2박 탭을 모두 선택하고 Ctrl+C는 2개를 복사하며 차트는 그대로다', () => {
    const { mode, press, toasts } = setup([
      { type: 'tap', kind: 'single', lane: 1, beat: beat(1) },
      { type: 'tap', kind: 'single', lane: 2, beat: beat(2) },
    ]);
    useEditorStore.setState({ isPlaying: true });
    const before = current().chart;

    press('a', { ctrlKey: true });
    press('c', { ctrlKey: true });

    expect(current().selection.notes).toEqual(new Set([0, 1]));
    expect(mode.hasClipboard).toBe(true);
    expect(toasts).toEqual(['2개 항목 복사됨']);
    expect(current().chart).toBe(before);
  });

  it('재생 중 C·S·D는 모드를 바꾸고 Esc는 선택을 비우며 안내 토스트를 띄우지 않는다', () => {
    const { mode, press, toasts } = setup();
    mode.selectNote(0);
    useEditorStore.setState({ isPlaying: true });

    press('c'); expect(current().mode).toBe('create');
    press('d'); expect(current().mode).toBe('delete');
    press('s'); expect(current().mode).toBe('select');
    press('Escape');

    expect(current().selection.notes.size).toBe(0);
    expect(toasts).toEqual([]);
  });

  it('재생 중 Space는 재생을 멈추고, 멈춘 뒤 Delete는 선택한 1박 탭을 지운다', () => {
    const { mode, press } = setup();
    mode.selectNote(0);
    useEditorStore.setState({ isPlaying: true });

    press(' ');
    expect(current().isPlaying).toBe(false);
    press('Delete');

    expect(notes()).toHaveLength(0);
  });

  it('1박 탭을 3박까지 끄는 중 Space로 재생하면 3박까지 확정해 드래그를 끝내고, 5박 move·up을 무시하며 정지 뒤 Undo 1번에 1박으로 돌아간다', () => {
    const { mode, press } = setup();
    mode.selectNote(0);
    mode.onPointerDown(1, 1, false, false); mode.onPointerMove(1, 3);

    press(' ');
    expect(current().isPlaying).toBe(true);
    expect(mode.isMoveDragging).toBe(false);
    expect(notes()[0].beat).toEqual(beat(3));
    mode.onPointerMove(1, 5); mode.onPointerUp(1, 5);
    expect(notes()[0].beat).toEqual(beat(3));

    press(' ');
    press('z', { ctrlKey: true });
    expect(notes()[0].beat).toEqual(beat(1));
  });

  it('8박 붙여넣기 대기 중 Space로 재생하면 붙여넣기를 확정해 정지 뒤 Esc에도 2개가 남는다', () => {
    const { mode, press, pasteCopyOfFirstNoteAt8 } = setup();
    pasteCopyOfFirstNoteAt8();

    press(' ');
    expect(mode.isPendingPaste).toBe(false);
    press(' ');
    press('Escape');

    expect(notes()).toHaveLength(2);
  });
});

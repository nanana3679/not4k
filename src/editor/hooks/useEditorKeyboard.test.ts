import { afterEach, describe, expect, it, vi } from 'vitest';
import { beat } from '../../shared';
import type { ChartDocument, DocumentNoteEntity } from '../../shared';
import { selectCanRedo, selectCanUndo, useEditorStore } from '../stores';
import { emptySelection } from '../stores/selectionSlice';
import { SelectMode } from '../modes/SelectMode';
import { hitTestNoteAt } from '../timeline/hitTest';
import { makeFakeSpace } from '../timeline/makeFakeSpace';
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
    chart: chart(source), mode: 'select', selection: emptySelection(), extraLaneCount: 2,
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
  });
  // App.tsx의 [chart] effect처럼 store 차트가 바뀌면 모드에 넘긴다.
  unsubscribe = useEditorStore.subscribe(state => mode.setChart(state.chart));
  const press = (key: string, modifiers: { ctrlKey?: boolean; shiftKey?: boolean } = {}) => handleEditorKeyDown(
    { key, ctrlKey: false, metaKey: false, shiftKey: false, preventDefault: () => {}, ...modifiers },
    {
      mode: current().mode, selectMode: mode, playback: null, bpmMarkers: [], offsetMs: 0, shortcutsBlocked: false,
      setMode: next => current().setMode(next), addToast: () => {},
    },
  );
  const pasteCopyOfFirstNoteAt8 = () => { mode.selectNote(0); mode.copy(); mode.paste(beat(8)); };
  return { mode, press, pasteCopyOfFirstNoteAt8 };
}

describe('붙여넣기·드래그 중 독립 명령', () => {
  it('8박 붙여넣기 대기 중 G를 누르면 붙여넣기를 먼저 확정해 뒤의 Esc가 8박 Grace Point를 지우지 않고 Undo 2번에 처음 1개로 돌아간다', () => {
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

  it('8박 붙여넣기 대기 중 G 뒤 ArrowUp은 붙여넣은 Point를 9박으로 옮기고 Esc 뒤에도 9박에 남는다', () => {
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

  it('G 편집 뒤 1박 Point를 3박까지 끄는 중 Ctrl+Z는 드래그만 되돌리고 이후 5박 move·up을 무시하며 Redo로 3박이 된다', () => {
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

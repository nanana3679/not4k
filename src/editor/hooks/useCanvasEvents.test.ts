import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beat } from '../../shared';
import type { ChartDocument, DocumentNoteEntity } from '../../shared';
import { useEditorStore } from '../stores/editorStore';
import type { EditorModeName } from '../stores/editorStore';
import { emptySelection } from '../stores/selectionSlice';
import { SelectMode } from '../modes/SelectMode';
import { CreateMode, type EntityType } from '../modes/CreateMode';
import { DeleteMode } from '../modes/DeleteMode';
import { createTimelineSpace } from '../timeline/TimelineSpace';
import { useCanvasEvents, type CanvasEventHandlers } from './useCanvasEvents';

vi.mock('../../shared/toast', () => ({ showToast: vi.fn() }));
// 서버 렌더의 zustand 훅은 store 초기값을 읽는다. 훅이 테스트가 넣은 현재 store 값을 읽게 한다.
vi.mock('../stores', async importOriginal => {
  const actual = await importOriginal<typeof import('../stores')>();
  const store = actual.useEditorStore;
  const readCurrent = <T,>(selector: (state: ReturnType<typeof store.getState>) => T): T => selector(store.getState());
  return { ...actual, useEditorStore: Object.assign(readCurrent, store) };
});

// 실제 TimelineSpace: lane 1 중심 x=30, y=ms 항등이라 120 BPM에서 y=500이 1박이다.
const current = () => useEditorStore.getState();
const notes = () => current().chart.notes;
const chart = (source: DocumentNoteEntity[], extra: Partial<ChartDocument> = {}): ChartDocument => ({
  meta: { title: '캔버스 입력', artist: '', difficultyLabel: 'NORMAL', difficultyLevel: 1, imageFile: '', audioFile: '', previewAudioFile: '', offsetMs: 0 },
  notes: source,
  trillZones: [],
  events: [{ type: 'bpm', beat: beat(0), bpm: 120 }, { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(4) }],
  ...extra,
});

type PointerInit = { pointerType?: 'touch' | 'mouse'; button?: number; buttons?: number; pointerId?: number; x?: number };
const pointer = (y: number, init: PointerInit = {}) => ({
  pointerType: init.pointerType ?? 'touch', pointerId: init.pointerId ?? 1, clientX: init.x ?? 30, clientY: y,
  button: init.button ?? 0, buttons: init.buttons ?? 1, shiftKey: false, altKey: false, preventDefault: () => {},
}) as unknown as ReactPointerEvent<HTMLCanvasElement>;
const rightPointer = (y: number) => pointer(y, { pointerType: 'mouse', button: 2, buttons: 2 });

let unsubscribe = () => {};
beforeEach(() => {
  vi.stubGlobal('window', globalThis);
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
});
afterEach(() => {
  unsubscribe();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** App과 같은 콜백으로 모드를 만들고 useCanvasEvents를 한 번 렌더해 그 핸들러를 돌려준다. */
function setup(source: ChartDocument, mode: EditorModeName, entityType: EntityType = 'single') {
  useEditorStore.setState({
    chart: source, mode, entityType, selection: emptySelection(), extraLaneCount: 2, lastValidSnapshot: null,
    historyPast: [], historyFuture: [], historyLastCaptureAt: 0, editTransaction: null,
  });
  const space = createTimelineSpace({
    getChart: () => current().chart, getSnapDivision: () => 4, getSelectedNotes: () => new Set(current().selection.notes),
    getExtraLaneCount: () => current().extraLaneCount, yToTime: y => y, getTotalTimelineMs: () => 20000,
  });
  const createMode = new CreateMode(current().chart, {
    onChartUpdate: value => current().setChart(value, { separateHistory: true }), space, isTimeInBounds: () => true,
  });
  createMode.entityType = entityType;
  const selectMode = new SelectMode(current().chart, {
    onChartUpdate: (value, transaction) => current().setChart(value, { transaction }),
    beginTransaction: onInterrupt => current().beginEditTransaction('selectModeEdit', onInterrupt),
    commitTransaction: token => current().commitEditTransaction(token),
    cancelTransaction: token => current().cancelEditTransaction(token),
    getSelection: () => current().selection,
    setSelection: value => current().setSelection(value),
    setSelectionTransient: value => current().setSelectionTransient(value),
    space,
    getExtraLaneCount: () => current().extraLaneCount,
    setExtraLaneCount: (count, transaction) => current().setExtraLaneCount(count, transaction),
  });
  const deleteMode = new DeleteMode(current().chart, {
    onChartUpdate: value => current().setChart(value), space, getSelectedNotes: () => current().selection.notes,
  });
  unsubscribe = useEditorStore.subscribe(state => {
    createMode.setChart(state.chart);
    selectMode.setChart(state.chart);
    deleteMode.setChart(state.chart);
  });
  const ref = <T,>(value: T) => ({ current: value });
  const canvas = { style: {}, getBoundingClientRect: () => ({ left: 0, top: 0 }), setPointerCapture: () => {} } as unknown as HTMLCanvasElement;
  let handlers: CanvasEventHandlers | undefined;
  function CanvasEventsProbe() {
    handlers = useCanvasEvents(ref(canvas), ref(null), ref(null), ref(createMode), ref(selectMode), ref(deleteMode), ref(false), space, () => true);
    return null;
  }
  renderToStaticMarkup(createElement(CanvasEventsProbe));
  return { handlers: handlers!, createMode, selectMode, deleteMode };
}

describe('우클릭 삭제', () => {
  it('붙여넣기 대기 중 4박에 붙여넣은 Point를 우클릭하면 붙여넣기를 확정한 뒤 그 Point를 지우고 Undo 1번에 붙여넣은 Point가 돌아온다', () => {
    const { handlers, selectMode } = setup(chart([{ type: 'point', kind: 'single', lane: 1, beat: beat(1) }]), 'select');
    selectMode.selectNote(0); selectMode.copy(); selectMode.paste(beat(4));
    expect(notes()).toHaveLength(2);

    handlers.handlePointerDown(rightPointer(2000));
    handlers.handlePointerUp(rightPointer(2000));

    expect(selectMode.isPendingPaste).toBe(false);
    expect(notes()).toEqual([{ type: 'point', kind: 'single', lane: 1, beat: beat(1) }]);
    expect(current().historyPast).toHaveLength(2);
    current().undo();
    expect(notes().map(note => note.beat)).toEqual([beat(1), beat(4)]);
  });
});

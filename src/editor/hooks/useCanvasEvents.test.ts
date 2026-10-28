import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beat, beatToFloat } from '../../shared';
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

const bodyWithEndRelease = (): DocumentNoteEntity[] => [
  { type: 'body', lane: 1, beat: beat(1), endBeat: beat(5), holdCount: 1 },
  { type: 'tap', kind: 'single', lane: 1, beat: beat(1) },
  { type: 'release', lane: 1, beat: beat(5), count: 1 },
];
const bodyEnd = () => beatToFloat((notes()[0] as Extract<DocumentNoteEntity, { type: 'body' }>).endBeat);

type PointerInit = { pointerType?: 'touch' | 'mouse'; button?: number; buttons?: number; pointerId?: number; x?: number };
const pointer = (y: number, init: PointerInit = {}) => ({
  pointerType: init.pointerType ?? 'touch', pointerId: init.pointerId ?? 1, clientX: init.x ?? 30, clientY: y,
  button: init.button ?? 0, buttons: init.buttons ?? 1, shiftKey: false, altKey: false, preventDefault: () => {},
}) as unknown as ReactPointerEvent<HTMLCanvasElement>;
const rightPointer = (y: number) => pointer(y, { pointerType: 'mouse', button: 2, buttons: 2 });
const contextMenu = (y: number) => ({ clientX: 30, clientY: y, preventDefault: () => {} }) as unknown as ReactMouseEvent<HTMLCanvasElement>;

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
  function CanvasEventsProbe({ onRender }: { onRender: (handlers: CanvasEventHandlers) => void }) {
    onRender(useCanvasEvents(ref(canvas), ref(null), ref(null), ref(createMode), ref(selectMode), ref(deleteMode), ref(false), space, () => true));
    return null;
  }
  let handlers: CanvasEventHandlers | undefined;
  renderToStaticMarkup(createElement(CanvasEventsProbe, { onRender: rendered => { handlers = rendered; } }));
  return { handlers: handlers!, createMode, selectMode, deleteMode };
}

describe('우클릭 삭제', () => {
  it('붙여넣기 대기 중 4박에 붙여넣은 탭을 우클릭하면 붙여넣기를 확정한 뒤 그 탭을 지우고 Undo 1번에 붙여넣은 탭이 돌아온다', () => {
    const { handlers, selectMode } = setup(chart([{ type: 'tap', kind: 'single', lane: 1, beat: beat(1) }]), 'select');
    selectMode.selectNote(0); selectMode.copy(); selectMode.paste(beat(4));
    expect(notes()).toHaveLength(2);

    handlers.handlePointerDown(rightPointer(2000));
    handlers.handlePointerUp(rightPointer(2000));

    expect(selectMode.isPendingPaste).toBe(false);
    expect(notes()).toEqual([{ type: 'tap', kind: 'single', lane: 1, beat: beat(1) }]);
    expect(current().historyPast).toHaveLength(2);
    current().undo();
    expect(notes().map(note => note.beat)).toEqual([beat(1), beat(4)]);
  });

  it('1박 탭을 우클릭으로 지운 누름의 contextmenu는 2박 탭을 지우지 않고 그 뒤 키보드 메뉴 키 contextmenu는 2박 탭을 지운다', () => {
    const { handlers } = setup(chart([
      { type: 'tap', kind: 'single', lane: 1, beat: beat(1) },
      { type: 'tap', kind: 'single', lane: 1, beat: beat(2) },
    ]), 'select');
    handlers.handlePointerDown(rightPointer(500));
    handlers.handlePointerUp(rightPointer(500));
    expect(notes().map(note => note.beat)).toEqual([beat(2)]);

    handlers.handleContextMenu(contextMenu(1000));
    expect(notes().map(note => note.beat)).toEqual([beat(2)]);
    handlers.handleContextMenu(contextMenu(1000));
    expect(notes()).toEqual([]);
  });
});

describe('Delete 모드 짧은 터치', () => {
  it('빈 trillZone 1～3박 안 2박을 터치하면 구간을 지우고 Undo 1개를 남긴다', () => {
    const { handlers } = setup(chart([], { trillZones: [{ lane: 1, beat: beat(1), endBeat: beat(3) }] }), 'delete');
    handlers.handlePointerDown(pointer(1000));
    handlers.handlePointerUp(pointer(1000));

    expect(current().chart.trillZones).toEqual([]);
    expect(current().historyPast).toHaveLength(1);
  });
});

describe('독립 명령이 끊은 터치 조작', () => {
  it('바디 끝 핸들을 터치로 5박에서 6박까지 끄는 중 Undo하면 같은 손가락을 7박까지 움직였다 떼도 다시 리사이즈하지 않고 Redo를 남긴다', () => {
    const { handlers } = setup(chart(bodyWithEndRelease()), 'select');
    handlers.handlePointerDown(pointer(2550));
    handlers.handlePointerMove(pointer(3000));
    expect(bodyEnd()).toBe(6);

    current().undo();
    expect(bodyEnd()).toBe(5);
    handlers.handlePointerMove(pointer(3500));

    expect(bodyEnd()).toBe(5);
    expect(current().editTransaction).toBeNull();
    handlers.handlePointerUp(pointer(3500));
    expect(bodyEnd()).toBe(5);
    expect(current().historyFuture).toHaveLength(1);
  });

  it('Undo로 끊긴 터치를 뗀 뒤 새 터치로 5.1박 끝 핸들을 6박까지 끌면 다시 리사이즈한다', () => {
    const { handlers } = setup(chart(bodyWithEndRelease()), 'select');
    handlers.handlePointerDown(pointer(2550));
    handlers.handlePointerMove(pointer(3000));
    current().undo();
    handlers.handlePointerUp(pointer(3000));

    handlers.handlePointerDown(pointer(2550, { pointerId: 2 }));
    handlers.handlePointerMove(pointer(3000, { pointerId: 2 }));
    handlers.handlePointerUp(pointer(3000, { pointerId: 2 }));

    expect(bodyEnd()).toBe(6);
  });

  it('롱프레스로 시작한 바디 끝 리사이즈를 모드 전환이 끊으면 같은 손가락 이동은 Select 모드로 돌아와도 리사이즈를 다시 열지 않는다', () => {
    const { handlers } = setup(chart(bodyWithEndRelease()), 'select');
    handlers.handlePointerDown(pointer(2550));
    vi.advanceTimersByTime(450);
    handlers.handlePointerMove(pointer(3000));
    expect(bodyEnd()).toBe(6);

    current().setMode('create');
    current().setMode('select');
    handlers.handlePointerMove(pointer(3500));
    handlers.handlePointerUp(pointer(3500));

    expect(bodyEnd()).toBe(6);
    expect(current().editTransaction).toBeNull();
    expect(current().historyPast).toHaveLength(1);
  });
});

describe('연결 경계의 바디 끝 핸들 띠', () => {
  // holdCount 2 바디 1～5박과 holdCount 1 바디 5～9박이 5박 Release에서 이어진다. 5.1박(y=2550)은 뒤 바디 안이다.
  const connectedBodies = (): DocumentNoteEntity[] => [
    { type: 'body', lane: 1, beat: beat(1), endBeat: beat(5), holdCount: 2 },
    { type: 'tap', kind: 'double', lane: 1, beat: beat(1) },
    { type: 'release', lane: 1, beat: beat(5), count: 1 },
    { type: 'body', lane: 1, beat: beat(5), endBeat: beat(9), holdCount: 1 },
  ];

  it('선택한 앞 바디의 5.1박 띠를 터치로 4박까지 끌면 앞 바디 끝과 5박 Release만 4박이 되고 뒤 바디는 5～9박이다', () => {
    const { handlers, selectMode } = setup(chart(connectedBodies()), 'select');
    selectMode.selectNote(0);
    handlers.handlePointerDown(pointer(2550));
    handlers.handlePointerMove(pointer(2000));
    handlers.handlePointerUp(pointer(2000));

    expect(bodyEnd()).toBe(4);
    expect(beatToFloat(notes()[2].beat)).toBe(4);
    expect(notes()[3]).toEqual(connectedBodies()[3]);
  });
});

describe('Create 모드 터치 롱프레스', () => {
  it('Release 엔티티로 끝 Release 바로 위 5.1박 띠를 450ms 누르면 Release만 놓고 Select 모드로 바꿔 바디를 끌지 않는다', () => {
    const { handlers } = setup(chart(bodyWithEndRelease()), 'create', 'release');
    handlers.handlePointerDown(pointer(2550));
    expect(notes()).toHaveLength(4);
    vi.advanceTimersByTime(450);

    expect(current().mode).toBe('create');
    expect(bodyEnd()).toBe(5);
    expect(current().selection.notes.size).toBe(0);
  });
});

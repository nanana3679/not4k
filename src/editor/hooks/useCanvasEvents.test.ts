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
import { EXTRA_LANE_WIDTH, TIMELINE_WIDTH } from '../timeline/constants';
import type { TimelineRenderer } from '../timeline/TimelineRenderer';
import type { PlaybackController } from '../playback/PlaybackController';
import { showToast } from '../../shared/toast';
import { PAUSE_TO_EDIT_COPY } from '../editorCopy';
import { useCanvasEvents, type CanvasEventHandlers } from './useCanvasEvents';
import { handleEditorKeyDown } from './useEditorKeyboard';

// DOM 대신 훅의 실제 effect를 마운트·해제한다. store 구독·타이머·모드·recognizer는 실제 구현을 쓴다.
const lifecycle = vi.hoisted(() => ({ effects: [] as Array<() => void | (() => void)> }));
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useEffect: (effect: () => void | (() => void)) => { lifecycle.effects.push(effect); },
}));
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

type PointerInit = {
  pointerType?: 'touch' | 'mouse'; button?: number; buttons?: number; pointerId?: number; x?: number;
  shiftKey?: boolean; altKey?: boolean;
};
const pointer = (y: number, init: PointerInit = {}) => ({
  pointerType: init.pointerType ?? 'touch', pointerId: init.pointerId ?? 1, clientX: init.x ?? 30, clientY: y,
  button: init.button ?? 0, buttons: init.buttons ?? 1, shiftKey: init.shiftKey ?? false, altKey: init.altKey ?? false,
  preventDefault: () => {},
}) as unknown as ReactPointerEvent<HTMLCanvasElement>;
const rightPointer = (y: number) => pointer(y, { pointerType: 'mouse', button: 2, buttons: 2 });
const contextMenu = (y: number, nativeEvent: Partial<PointerEvent> = {}) => ({
  clientX: 30, clientY: y, nativeEvent, preventDefault: () => {},
}) as unknown as ReactMouseEvent<HTMLCanvasElement>;

let unsubscribe = () => {};
let unmountEffects = () => {};
beforeEach(() => {
  vi.stubGlobal('window', globalThis);
  const events = new EventTarget();
  vi.stubGlobal('addEventListener', events.addEventListener.bind(events));
  vi.stubGlobal('removeEventListener', events.removeEventListener.bind(events));
  vi.stubGlobal('dispatchEvent', events.dispatchEvent.bind(events));
  lifecycle.effects.length = 0;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
  vi.mocked(showToast).mockClear();
});
afterEach(() => {
  unmountEffects();
  unsubscribe();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** 렌더러·재생 컨트롤러가 필요한 테스트(커서 레일 seek)만 넘긴다. 기본은 둘 다 없다. */
type SetupOptions = {
  renderer?: TimelineRenderer;
  playback?: PlaybackController;
  onPinchZoom?: (previous: number, current: number, centerY: number) => void;
  onHorizontalPan?: (deltaX: number) => void;
  onVerticalPan?: (deltaY: number) => void;
};

/** App과 같은 콜백으로 모드를 만들고 useCanvasEvents를 한 번 렌더해 그 핸들러를 돌려준다. */
function setup(source: ChartDocument, mode: EditorModeName, entityType: EntityType = 'single', options: SetupOptions = {}) {
  useEditorStore.setState({
    chart: source, mode, entityType, selection: emptySelection(), extraLaneCount: 2, lastValidSnapshot: null,
    historyPast: [], historyFuture: [], historyLastCaptureAt: 0, editTransaction: null, isPlaying: false,
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
    beginTransaction: (onInterrupt, selectionBefore) => current().beginEditTransaction('selectModeEdit', onInterrupt, selectionBefore),
    commitTransaction: token => current().commitEditTransaction(token),
    cancelTransaction: token => current().cancelEditTransaction(token),
    getSelection: () => current().selection,
    setSelection: value => current().setSelection(value),
    setSelectionTransient: value => current().setSelectionTransient(value),
    space,
    getExtraLaneCount: () => current().extraLaneCount,
    setExtraLaneCount: (count, transaction) => current().setExtraLaneCount(count, transaction),
    onWarn: message => current().addToast(message, 'warn'),
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
  const setPointerCapture = vi.fn();
  const canvas = Object.assign(new EventTarget(), {
    style: {}, getBoundingClientRect: () => ({ left: 0, top: 0 }), setPointerCapture,
  }) as unknown as HTMLCanvasElement;
  function CanvasEventsProbe({ onRender }: { onRender: (handlers: CanvasEventHandlers) => void }) {
    onRender(useCanvasEvents(
      ref(canvas), ref(options.renderer ?? null), ref(options.playback ?? null),
      ref(createMode), ref(selectMode), ref(deleteMode), ref(false), space, () => true,
      options.onPinchZoom, options.onHorizontalPan, options.onVerticalPan,
    ));
    return null;
  }
  let handlers: CanvasEventHandlers | undefined;
  renderToStaticMarkup(createElement(CanvasEventsProbe, { onRender: rendered => { handlers = rendered; } }));
  const cleanups = lifecycle.effects.map(effect => effect());
  unmountEffects = () => cleanups.forEach(cleanup => cleanup?.());
  return { handlers: handlers!, createMode, selectMode, deleteMode, setPointerCapture, canvas };
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

describe('재생 중 캔버스 편집 제한(RFD 0099)', () => {
  const tapAt = (at: number, lane = 1): DocumentNoteEntity => ({ type: 'tap', kind: 'single', lane, beat: beat(at) });
  const mouse = (y: number, buttons = 1, init: PointerInit = {}) => pointer(y, { pointerType: 'mouse', buttons, ...init });
  const selectFirst = () => current().setSelection({ ...emptySelection(), notes: new Set([0]) });
  const pauseToasts = () => vi.mocked(showToast).mock.calls.filter(([message]) => message === PAUSE_TO_EDIT_COPY);
  const play = () => current().setIsPlaying(true);

  it.each(['mouse', 'touch'] as const)('재생 중 %s pointerId=1의 release가 누락돼도 정지 후 새 down·up은 2박 탭 1개를 놓고 안내를 추가하지 않는다', pointerType => {
    const { handlers } = setup(chart([]), 'create');
    play();
    handlers.handlePointerDown(pointer(500, { pointerType }));
    current().setIsPlaying(false);
    handlers.handlePointerDown(pointer(1000, { pointerType }));
    handlers.handlePointerUp(pointer(1000, { pointerType }));

    expect(notes().map(note => beatToFloat(note.beat))).toEqual([2]);
    expect(notes()[0]).toMatchObject({ type: 'tap', kind: 'single', lane: 1 });
    expect(pauseToasts()).toHaveLength(1);
  });

  it('재생 중 touch pointerId=1·2가 blur를 겪어도 정지 1500ms 뒤 contextmenu는 1박을 남기고 새 touch는 2박 탭을 놓는다', () => {
    const { handlers } = setup(chart([tapAt(1)]), 'create');
    play();
    handlers.handlePointerDown(pointer(500));
    handlers.handlePointerDown(pointer(500, { pointerId: 2 }));
    window.dispatchEvent(new Event('blur'));
    current().setIsPlaying(false);
    vi.advanceTimersByTime(1500);
    handlers.handleContextMenu(contextMenu(500));
    expect(notes().map(note => beatToFloat(note.beat))).toEqual([1]);

    handlers.handlePointerDown(pointer(1000, { pointerId: 3 }));
    handlers.handlePointerUp(pointer(1000, { pointerId: 3 }));
    expect(notes().map(note => beatToFloat(note.beat))).toEqual([1, 2]);
    // 새 eligible down 이후에는 종료한 접촉의 메뉴 억제가 다음 재생까지 남지 않는다.
    play();
    current().setIsPlaying(false);
    vi.advanceTimersByTime(1500);
    handlers.handleContextMenu(contextMenu(1000));
    expect(notes().map(note => beatToFloat(note.beat))).toEqual([1]);
  });

  it.each(['mouse', 'touch'] as const)('재생을 겪은 %s pointerId=1이 정지 후 lostpointercapture되어도 1500ms 뒤 contextmenu는 1박을 남기고 새 down은 2박 탭을 놓는다', pointerType => {
    const { handlers, canvas } = setup(chart([tapAt(1)]), 'create');
    play();
    const contact = pointer(500, { pointerType, button: pointerType === 'mouse' ? 2 : 0 });
    handlers.handlePointerDown(contact);
    current().setIsPlaying(false);
    canvas.dispatchEvent(Object.assign(new Event('lostpointercapture'), contact));
    vi.advanceTimersByTime(1500);
    handlers.handleContextMenu(contextMenu(500));
    expect(notes().map(note => beatToFloat(note.beat))).toEqual([1]);

    handlers.handlePointerDown(pointer(1000, { pointerType }));
    handlers.handlePointerUp(pointer(1000, { pointerType }));
    expect(notes().map(note => beatToFloat(note.beat))).toEqual([1, 2]);
    expect(pauseToasts()).toHaveLength(1);
  });

  it('재생 중 mouse pointerId=1의 우클릭 release가 누락되면 정지 후 buttons=0 이동·contextmenu도 1박 탭을 남긴다', () => {
    const { handlers } = setup(chart([tapAt(1)]), 'select');
    play();
    handlers.handlePointerDown(rightPointer(500));
    current().setIsPlaying(false);
    handlers.handlePointerMove(mouse(500, 0));
    handlers.handleContextMenu(contextMenu(500));

    expect(notes().map(note => beatToFloat(note.beat))).toEqual([1]);
    expect(pauseToasts()).toHaveLength(1);
  });

  it('재생을 겪은 touch 1·2 중 1만 capture를 잃고 mouse 3이 buttons=0으로 움직여도 touch 2를 뗄 때까지 1박 contextmenu 삭제를 막는다', () => {
    const { handlers, canvas } = setup(chart([tapAt(1)]), 'delete');
    handlers.handlePointerDown(pointer(500));
    handlers.handlePointerDown(pointer(500, { pointerId: 2 }));
    play();
    current().setIsPlaying(false);
    canvas.dispatchEvent(Object.assign(new Event('lostpointercapture'), pointer(500)));
    handlers.handlePointerMove(mouse(500, 0, { pointerId: 3 }));
    vi.advanceTimersByTime(1500);
    handlers.handleContextMenu(contextMenu(500));
    expect(notes()).toHaveLength(1);

    handlers.handlePointerMove(pointer(500, { pointerId: 2 }));
    handlers.handlePointerUp(pointer(500, { pointerId: 2 }));
    // 정상 up 뒤 발생하는 capture 해제는 터치의 지연 contextmenu 보호를 해제하지 않는다.
    canvas.dispatchEvent(Object.assign(new Event('lostpointercapture'), pointer(500, { pointerId: 2 })));
    handlers.handleContextMenu(contextMenu(500));
    expect(notes()).toHaveLength(1);
    vi.advanceTimersByTime(1200);
    handlers.handleContextMenu(contextMenu(500));
    expect(notes()).toEqual([]);
  });
  afterEach(() => useEditorStore.setState({ isPlaying: false }));

  it.each(['ContextMenu', 'Shift+F10', 'pointerId=-1'] as const)('재생·blur 뒤 touch 2를 계속 누른 채 %s로 키보드 메뉴를 열면 1박 탭을 지운다', input => {
    const { handlers } = setup(chart([tapAt(1)]), 'select');
    play();
    handlers.handlePointerDown(pointer(500, { pointerId: 2 }));
    window.dispatchEvent(new Event('blur'));
    current().setIsPlaying(false);
    if (input !== 'pointerId=-1') {
      window.dispatchEvent(Object.assign(new Event('keydown'), {
        key: input === 'ContextMenu' ? 'ContextMenu' : 'F10', shiftKey: input === 'Shift+F10',
      }));
    }
    handlers.handleContextMenu(contextMenu(500, input === 'pointerId=-1' ? { pointerId: -1 } : {}));
    expect(notes()).toEqual([]);
    expect(pauseToasts()).toHaveLength(1);
  });

  it('재생을 겪은 touch 2 뒤 mouse 1을 새로 눌러도 pointerId=2 contextmenu는 1박 탭을 지우지 않는다', () => {
    const { handlers } = setup(chart([tapAt(1)]), 'select');
    play();
    handlers.handlePointerDown(pointer(500, { pointerId: 2 }));
    current().setIsPlaying(false);
    handlers.handlePointerDown(mouse(2000));
    handlers.handlePointerUp(mouse(2000, 0));
    vi.advanceTimersByTime(1500);
    handlers.handleContextMenu(contextMenu(500, { pointerId: 2, pointerType: 'touch' }));
    expect(notes()).toHaveLength(1);
  });

  it('재생·blur를 겪은 touch 2가 정지 후 3박으로 이동·뗌해도 mouse 1의 1→2박 드래그를 움직이거나 확정하지 않는다', () => {
    const { handlers } = setup(chart([tapAt(1)]), 'select');
    play();
    handlers.handlePointerDown(pointer(500, { pointerId: 2 }));
    window.dispatchEvent(new Event('blur'));
    current().setIsPlaying(false);
    handlers.handlePointerDown(mouse(500));
    handlers.handlePointerMove(mouse(1000));
    handlers.handlePointerMove(pointer(1500, { pointerId: 2 }));
    expect(notes()[0].beat).toEqual(beat(2));
    handlers.handlePointerUp(pointer(1500, { pointerId: 2 }));
    expect(notes()[0].beat).toEqual(beat(2));
    expect(current().historyPast).toHaveLength(0);
    expect(current().editTransaction).not.toBeNull();

    handlers.handlePointerMove(mouse(2000));
    handlers.handlePointerUp(mouse(2000, 0));
    expect(notes()[0].beat).toEqual(beat(4));
    expect(current().historyPast).toHaveLength(1);
    expect(pauseToasts()).toHaveLength(1);
  });

  it.each(['up', 'cancel', 'lostpointercapture'] as const)('mouse 1이 1→2박으로 끄는 중 새 touch 2의 down·move·%s는 선택·위치·history를 바꾸지 않는다', terminal => {
    const { handlers, canvas } = setup(chart([tapAt(1), tapAt(4)]), 'select');
    handlers.handlePointerDown(mouse(500));
    handlers.handlePointerMove(mouse(1000));
    const other = pointer(2000, { pointerId: 2 });
    handlers.handlePointerDown(other);
    handlers.handlePointerMove(pointer(1500, { pointerId: 2 }));
    expect(notes().map(note => note.beat)).toEqual([beat(2), beat(4)]);
    if (terminal === 'up') handlers.handlePointerUp(other);
    else if (terminal === 'cancel') handlers.handlePointerCancel(other);
    else canvas.dispatchEvent(Object.assign(new Event(terminal), other));
    expect(notes().map(note => note.beat)).toEqual([beat(2), beat(4)]);
    expect([...current().selection.notes]).toEqual([0]);
    expect(current().historyPast).toHaveLength(0);
    expect(current().editTransaction).not.toBeNull();

    handlers.handlePointerMove(mouse(1500));
    handlers.handlePointerUp(mouse(1500, 0));
    expect(notes().map(note => note.beat)).toEqual([beat(3), beat(4)]);
    expect(current().historyPast).toHaveLength(1);
  });

  it('mouse 1의 Create 드래그 중 touch 2를 3박에서 떼도 노트 0개이고 mouse 1을 2박에서 떼면 1～2박 바디가 생긴다', () => {
    const { handlers, createMode } = setup(chart([]), 'create');
    handlers.handlePointerDown(mouse(500));
    handlers.handlePointerDown(pointer(1500, { pointerId: 2 }));
    handlers.handlePointerMove(pointer(2000, { pointerId: 2 }));
    handlers.handlePointerUp(pointer(1500, { pointerId: 2 }));
    expect(notes()).toEqual([]);
    expect(createMode.dragging).toBe(true);

    handlers.handlePointerUp(mouse(1000, 0));
    const body = notes().find(note => note.type === 'body');
    expect(body && beatToFloat(body.beat)).toBe(1);
    expect(body && beatToFloat(body.endBeat)).toBe(2);
  });

  it('mouse 1이 우클릭으로 1박을 지우는 중 mouse 2의 2박 이동·뗌은 삭제·확정하지 않고 mouse 1만 history 1개를 만든다', () => {
    const { handlers } = setup(chart([tapAt(1), tapAt(2), tapAt(3)]), 'select');
    handlers.handlePointerDown(rightPointer(500));
    handlers.handlePointerDown(mouse(1000, 2, { pointerId: 2, button: 2 }));
    handlers.handlePointerMove(mouse(1000, 2, { pointerId: 2, button: 2 }));
    handlers.handlePointerUp(mouse(1000, 0, { pointerId: 2, button: 2 }));
    expect(notes().map(note => note.beat)).toEqual([beat(2), beat(3)]);
    expect(current().historyPast).toHaveLength(0);

    handlers.handlePointerMove(rightPointer(1500));
    handlers.handlePointerUp(rightPointer(1500));
    expect(notes().map(note => note.beat)).toEqual([beat(2)]);
    expect(current().historyPast).toHaveLength(1);
  });

  it('Create에서 down 없는 mouse hover는 2박 고스트만 표시하고 모드 move·up을 호출하거나 노트를 놓지 않는다', () => {
    const renderer = {
      screenXToTimelineX: (x: number) => x,
      setHoveredNote() {}, setHoveredTrillZone() {}, setHoveredRestZone() {}, setResizeHoverNote() {},
      hideGhostNote() {}, showGhostNote: vi.fn(),
    } as unknown as TimelineRenderer;
    const { handlers, createMode } = setup(chart([]), 'create', 'single', { renderer });
    const move = vi.spyOn(createMode, 'onPointerMove');
    const up = vi.spyOn(createMode, 'handlePointerUp');
    handlers.handlePointerMove(mouse(1000, 0));
    handlers.handlePointerUp(mouse(1000, 0));
    expect(renderer.showGhostNote).toHaveBeenCalledExactlyOnceWith(1, 1000);
    expect(move).not.toHaveBeenCalled();
    expect(up).not.toHaveBeenCalled();
    expect(notes()).toEqual([]);
  });

  it('Create 롱프레스 450ms로 시작한 드래그는 재생 시작 즉시 취소되고 정지 후 같은 접촉을 3박에서 떼도 노트 0개다', () => {
    const { handlers, createMode } = setup(chart([]), 'create');
    handlers.handlePointerDown(pointer(500));
    vi.advanceTimersByTime(450);
    expect(createMode.dragging).toBe(true);

    play();
    expect(createMode.dragging).toBe(false);
    current().setIsPlaying(false);
    handlers.handlePointerMove(pointer(1500));
    handlers.handlePointerUp(pointer(1500));

    expect(notes()).toEqual([]);
    expect(current().historyPast).toHaveLength(0);
  });

  it('Delete 롱프레스로 1박을 지운 뒤 재생·정지하고 같은 손가락을 2박으로 옮겨도 노트 2개와 history 0개가 남는다', () => {
    const { handlers } = setup(chart([tapAt(1), tapAt(2)]), 'delete');
    handlers.handlePointerDown(pointer(500));
    vi.advanceTimersByTime(450);
    expect(notes()).toHaveLength(1);

    play();
    expect(notes()).toHaveLength(2);
    current().setIsPlaying(false);
    handlers.handlePointerMove(pointer(1000));
    handlers.handlePointerUp(pointer(1000));

    expect(notes()).toHaveLength(2);
    expect(current().historyPast).toHaveLength(0);
  });

  it.each(['시작 전', '중'] as const)('Create 터치가 재생 %s에 시작되면 정지 후 1박에서 같은 손가락을 떼도 노트 0개이고 새 누름만 노트 1개를 만든다', start => {
    const { handlers } = setup(chart([]), 'create');
    if (start === '중') play();
    handlers.handlePointerDown(pointer(500));
    if (start === '시작 전') play();
    expect(vi.getTimerCount()).toBe(0);
    current().setIsPlaying(false);
    handlers.handlePointerUp(pointer(500));
    expect(notes()).toEqual([]);

    handlers.handlePointerDown(pointer(500));
    handlers.handlePointerUp(pointer(500));
    expect(notes()).toHaveLength(1);
  });

  it('재생을 겪은 Delete 터치는 정지 후 1500ms가 지나 contextmenu가 누름·뗌 뒤 와도 1박 노트를 지우지 않는다', () => {
    const { handlers } = setup(chart([tapAt(1)]), 'delete');
    handlers.handlePointerDown(pointer(500));
    play();
    current().setIsPlaying(false);
    vi.advanceTimersByTime(1500);
    handlers.handleContextMenu(contextMenu(500));
    expect(notes()).toHaveLength(1);
    handlers.handlePointerUp(pointer(500));
    handlers.handleContextMenu(contextMenu(500));
    expect(notes()).toHaveLength(1);
  });

  it.each(['시작 전', '중'] as const)('마우스 누름이 재생 %s에 시작되면 정지 후 1→3박 이동·뗌은 Create에 전달하지 않고 새 클릭은 탭 1개를 만든다', start => {
    const { handlers, createMode, setPointerCapture } = setup(chart([]), 'create');
    if (start === '중') play();
    handlers.handlePointerDown(mouse(500));
    expect(setPointerCapture).toHaveBeenCalledWith(1);
    if (start === '시작 전') play();
    current().setIsPlaying(false);
    const move = vi.spyOn(createMode, 'onPointerMove');
    const up = vi.spyOn(createMode, 'handlePointerUp');
    handlers.handlePointerMove(mouse(1500));
    handlers.handlePointerUp(mouse(1500));
    expect(move).not.toHaveBeenCalled();
    expect(up).not.toHaveBeenCalled();
    expect(notes()).toHaveLength(0);

    handlers.handlePointerDown(mouse(500));
    handlers.handlePointerUp(mouse(500));
    expect(notes()).toHaveLength(1);
  });

  it.each(['mouse', 'touch'] as const)('재생 중 시작한 %s 접촉을 정지 후 cancel하면 같은 pointerId=1의 새 클릭으로 1박 탭을 만든다', pointerType => {
    const { handlers } = setup(chart([]), 'create');
    play();
    handlers.handlePointerDown(pointer(500, { pointerType }));
    current().setIsPlaying(false);
    handlers.handlePointerCancel(pointer(500, { pointerType }));
    handlers.handlePointerDown(pointer(500, { pointerType }));
    handlers.handlePointerUp(pointer(500, { pointerType }));
    expect(notes()).toHaveLength(1);
  });

  it('1박 A를 선택하고 2박 B를 3박까지 옮긴 뒤 cancel하면 B는 2박이고 선택도 A로 복구된다', () => {
    const { handlers, selectMode } = setup(chart([tapAt(1), tapAt(2)]), 'select');
    selectFirst();
    handlers.handlePointerDown(mouse(1000));
    handlers.handlePointerMove(mouse(1500));
    selectMode.cancel();
    expect(notes()[1].beat).toEqual(beat(2));
    expect(current().selection.notes).toEqual(new Set([0]));
    expect(current().historyPast).toHaveLength(0);
  });

  it('1박 A를 선택하고 2박 B를 3박까지 옮긴 뒤 Escape를 누르면 B는 2박이고 기존처럼 선택을 비운다', () => {
    const { handlers, selectMode } = setup(chart([tapAt(1), tapAt(2)]), 'select');
    selectFirst();
    handlers.handlePointerDown(mouse(1000));
    handlers.handlePointerMove(mouse(1500));
    handleEditorKeyDown({ key: 'Escape', ctrlKey: false, metaKey: false, shiftKey: false, preventDefault() {} }, {
      mode: 'select', selectMode, playback: null, bpmChanges: [], offsetMs: 0,
      shortcutsBlocked: false, isPlaying: false, setMode: current().setMode, addToast: current().addToast,
    });
    expect(notes()[1].beat).toEqual(beat(2));
    expect(current().selection).toEqual(emptySelection());
    expect(current().historyPast).toHaveLength(0);
  });

  it.each(['시작 전', '중'] as const)('두 손가락 접촉이 재생 %s에 시작해도 정지 후 가로 스크롤·핀치 콜백을 보내며 노트 0개다', start => {
    const onHorizontalPan = vi.fn();
    const onPinchZoom = vi.fn();
    const { handlers } = setup(chart([]), 'create', 'single', { onHorizontalPan, onPinchZoom });
    if (start === '중') play();
    handlers.handlePointerDown(pointer(500, { x: 100 }));
    handlers.handlePointerDown(pointer(500, { pointerId: 2, x: 300 }));
    if (start === '시작 전') play();
    current().setIsPlaying(false);
    // 매 프레임 한 손가락씩 10px 이동: 폭 변화보다 중심 이동이 커지면 가로 스크롤로 잠긴다.
    for (const delta of [10, 20, 30]) {
      handlers.handlePointerMove(pointer(500, { x: 100 - delta }));
      handlers.handlePointerMove(pointer(500, { pointerId: 2, x: 300 - delta }));
    }
    expect(onHorizontalPan).toHaveBeenCalled();
    handlers.handlePointerUp(pointer(500, { pointerId: 2, x: 270 }));
    // 첫 손가락은 계속 봉인된 채로 새 두 번째 손가락과 핀치를 시작한다.
    handlers.handlePointerDown(pointer(500, { pointerId: 2, x: 300 }));
    handlers.handlePointerMove(pointer(500, { pointerId: 2, x: 400 }));
    expect(onPinchZoom).toHaveBeenCalled();
    handlers.handlePointerUp(pointer(500, { pointerId: 2, x: 400 }));
    handlers.handlePointerUp(pointer(500, { x: 70 }));
    expect(notes()).toHaveLength(0);
  });

  it('재생 중 touch 1·2를 세로로 30px 옮기고 100px 벌리면 스크롤·핀치 콜백을 보내고 노트·history는 0개다', () => {
    const onVerticalPan = vi.fn();
    const onPinchZoom = vi.fn();
    const { handlers } = setup(chart([]), 'create', 'single', { onVerticalPan, onPinchZoom });
    play();
    handlers.handlePointerDown(pointer(500, { x: 100 }));
    handlers.handlePointerDown(pointer(500, { pointerId: 2, x: 300 }));
    for (const delta of [10, 20, 30]) {
      handlers.handlePointerMove(pointer(500 + delta, { x: 100 }));
      handlers.handlePointerMove(pointer(500 + delta, { pointerId: 2, x: 300 }));
    }
    expect(onVerticalPan).toHaveBeenCalled();
    handlers.handlePointerUp(pointer(530, { pointerId: 2, x: 300 }));
    handlers.handlePointerDown(pointer(530, { pointerId: 2, x: 300 }));
    handlers.handlePointerMove(pointer(530, { pointerId: 2, x: 400 }));
    expect(onPinchZoom).toHaveBeenCalled();
    expect(current().isPlaying).toBe(true);
    expect(notes()).toEqual([]);
    expect(current().historyPast).toHaveLength(0);
  });

  it.each([
    ['레일', '정지 후'], ['미니맵', '정지 후'], ['레일', '재생 중'], ['미니맵', '재생 중'],
  ] as const)('재생 중 %s에서 시작한 마우스 접촉은 %s y=500→1500 이동도 탐색으로 처리하고 노트 0개를 유지한다', (target, phase) => {
    const seekTo = vi.fn();
    const minimapMove = vi.fn(() => target === '미니맵');
    const renderer = {
      handleMinimapPointerDown: () => target === '미니맵',
      handleMinimapPointerMove: minimapMove, handleMinimapPointerUp: vi.fn(),
      screenXToTimelineX: (x: number) => x - 100, currentTimelineWidth: 240, contentCenterShiftX: 0,
      clampToMeasureRange: (timeMs: number) => timeMs, yToTime: (y: number) => y,
      hideGhostNote() {}, clearMoveOrigins() {}, clearBoxSelectRect() {},
      setHoveredNote() {}, setHoveredTrillZone() {}, setHoveredRestZone() {}, setResizeHoverNote() {},
    } as unknown as TimelineRenderer;
    const { handlers } = setup(chart([]), 'create', 'single', { renderer, playback: { seekTo } as unknown as PlaybackController });
    play();
    handlers.handlePointerDown(mouse(500, 1, { x: 20 }));
    if (phase === '정지 후') current().setIsPlaying(false);
    handlers.handlePointerMove(mouse(1500, 1, { x: 20 }));
    handlers.handlePointerUp(mouse(1500, 0, { x: 20 }));

    if (target === '레일') expect(seekTo.mock.calls).toEqual([[500], [1500]]);
    else expect(minimapMove).toHaveBeenCalledExactlyOnceWith(20, 1500);
    expect(notes()).toHaveLength(0);
    expect(pauseToasts()).toHaveLength(0);
  });

  it.each(['mouse', 'touch'] as const)('1박 A를 선택하고 미선택 2박 B를 %s로 3박까지 끌다가 재생하면 B는 2박으로 돌아오고 선택도 A로 복구된다', pointerType => {
    const { handlers } = setup(chart([tapAt(1), tapAt(2)]), 'select');
    selectFirst();
    handlers.handlePointerDown(pointer(1000, { pointerType }));
    if (pointerType === 'touch') vi.advanceTimersByTime(450);
    handlers.handlePointerMove(pointer(1500, { pointerType }));
    expect(notes()[1].beat).toEqual(beat(3));
    expect(current().selection.notes).toEqual(new Set([1]));

    play();

    expect(notes()[1].beat).toEqual(beat(2));
    expect(current().selection.notes).toEqual(new Set([0]));
    expect(current().editTransaction).toBeNull();
    expect(current().historyPast).toHaveLength(0);
  });

  it.each(['mouse', 'touch'] as const)('8박 탭을 선택하고 미선택 바디 끝을 %s로 5박에서 6박까지 늘리다가 재생하면 끝은 5박이고 선택은 8박 탭으로 복구된다', pointerType => {
    const { handlers } = setup(chart([...bodyWithEndRelease(), tapAt(8)]), 'select');
    current().setSelection({ ...emptySelection(), notes: new Set([3]) });
    handlers.handlePointerDown(pointer(2550, { pointerType }));
    if (pointerType === 'touch') vi.advanceTimersByTime(450);
    handlers.handlePointerMove(pointer(3000, { pointerType }));
    expect(bodyEnd()).toBe(6);

    play();

    expect(bodyEnd()).toBe(5);
    expect(current().selection.notes).toEqual(new Set([3]));
    expect(current().historyPast).toHaveLength(0);
  });

  it.each([
    { pointerType: 'mouse', y: 1500 }, { pointerType: 'touch', y: 1500 },
    { pointerType: 'mouse', y: 2000 }, { pointerType: 'touch', y: 2000 },
  ] as const)('1박 탭을 선택하고 미선택 2～4박 이벤트의 y=$y를 $pointerType로 끌다가 재생하면 이벤트와 탭 선택이 복구된다', ({ pointerType, y }) => {
    const source = chart([tapAt(1)]);
    source.events.push({ type: 'text', beat: beat(2), endBeat: beat(4), text: '안내', editorLane: 1 });
    const { handlers } = setup(source, 'select');
    selectFirst();
    const init = { pointerType, x: TIMELINE_WIDTH + EXTRA_LANE_WIDTH / 2 };
    handlers.handlePointerDown(pointer(y, init));
    if (pointerType === 'touch') vi.advanceTimersByTime(450);
    handlers.handlePointerMove(pointer(y + 500, init));
    expect(current().chart.events[2]).not.toEqual(source.events[2]);

    play();

    expect(current().chart.events[2]).toEqual(source.events[2]);
    expect(current().selection).toEqual({ ...emptySelection(), notes: new Set([0]) });
  });

  it('1박 탭을 선택하고 미선택 trillZone 2～4박을 롱프레스로 1박 옮기다가 재생하면 구간과 탭 선택이 복구된다', () => {
    const source = chart([tapAt(1)], { trillZones: [{ lane: 1, beat: beat(2), endBeat: beat(4) }] });
    const { handlers } = setup(source, 'select');
    selectFirst();
    handlers.handlePointerDown(pointer(1500));
    vi.advanceTimersByTime(450);
    handlers.handlePointerMove(pointer(2000));
    expect(current().chart.trillZones[0].beat).toEqual(beat(3));

    play();

    expect(current().chart.trillZones).toEqual(source.trillZones);
    expect(current().selection).toEqual({ ...emptySelection(), notes: new Set([0]) });
  });

  it('재생 중 Create 모드에서 1박 자리를 마우스로 눌렀다 떼면 탭을 놓지 않고 안내 토스트 1개를 띄우며, 정지 뒤 같은 클릭은 탭을 놓는다', () => {
    const { handlers } = setup(chart([]), 'create', 'single');
    play();
    handlers.handlePointerDown(mouse(500));
    handlers.handlePointerMove(mouse(500));
    handlers.handlePointerUp(mouse(500));

    expect(notes()).toEqual([]);
    expect(pauseToasts()).toHaveLength(1);

    current().setIsPlaying(false);
    handlers.handlePointerDown(mouse(500));
    handlers.handlePointerUp(mouse(500));
    expect(notes()).toHaveLength(1);
  });

  it('재생 중 Create 모드 Single 엔티티로 1박을 터치했다 떼도 탭을 놓지 않는다', () => {
    const { handlers } = setup(chart([]), 'create', 'single');
    play();
    handlers.handlePointerDown(pointer(500));
    handlers.handlePointerUp(pointer(500));

    expect(notes()).toEqual([]);
    expect(pauseToasts()).toHaveLength(1);
  });

  it('재생 중 1박 탭을 우클릭해 끌어도 지우지 않고, 그 누름의 contextmenu도 지우지 않으며 안내 토스트는 1개다', () => {
    const { handlers } = setup(chart([tapAt(1), tapAt(2)]), 'select');
    play();
    handlers.handlePointerDown(rightPointer(500));
    handlers.handlePointerMove(rightPointer(1000));
    handlers.handlePointerUp(rightPointer(1000));
    handlers.handleContextMenu(contextMenu(500));

    expect(notes()).toHaveLength(2);
    expect(current().editTransaction).toBeNull();
    expect(pauseToasts()).toHaveLength(1);
  });

  it('재생 중 키보드 메뉴 키 contextmenu는 1박 탭을 지우지 않고 안내 토스트 1개를 띄운다', () => {
    const { handlers } = setup(chart([tapAt(1)]), 'select');
    play();
    handlers.handleContextMenu(contextMenu(500));

    expect(notes()).toHaveLength(1);
    expect(pauseToasts()).toHaveLength(1);
  });

  it('재생 중 Delete 모드에서 빈 trillZone 1～3박 안 2박을 터치해도 구간을 지우지 않는다', () => {
    const { handlers } = setup(chart([], { trillZones: [{ lane: 1, beat: beat(1), endBeat: beat(3) }] }), 'delete');
    play();
    handlers.handlePointerDown(pointer(1000));
    handlers.handlePointerUp(pointer(1000));

    expect(current().chart.trillZones).toHaveLength(1);
    expect(pauseToasts()).toHaveLength(1);
  });

  it('Delete 모드 롱프레스 대기 중 재생이 시작되면 450ms 뒤 발화해 1박·2박 위로 끌어도 지우지 않는다', () => {
    const { handlers } = setup(chart([tapAt(1), tapAt(2)]), 'delete');
    handlers.handlePointerDown(pointer(500));
    play();
    vi.advanceTimersByTime(450);
    handlers.handlePointerMove(pointer(1000));
    handlers.handlePointerUp(pointer(1000));

    expect(notes()).toHaveLength(2);
  });

  it('Create 모드 롱프레스 대기 중 재생이 시작되면 450ms 뒤 발화해도 롱노트를 시작하지 않고 3박에서 떼도 노트를 놓지 않는다', () => {
    const { handlers, createMode } = setup(chart([]), 'create', 'single');
    handlers.handlePointerDown(pointer(500));
    play();
    vi.advanceTimersByTime(450);

    expect(createMode.dragging).toBe(false);
    handlers.handlePointerMove(pointer(1500));
    handlers.handlePointerUp(pointer(1500));
    expect(notes()).toEqual([]);
  });

  it('Create 모드 롱프레스로 1박에서 롱노트를 시작한 뒤 재생이 시작되면 3박에서 떼도 노트를 놓지 않는다', () => {
    const { handlers, createMode } = setup(chart([]), 'create', 'single');
    handlers.handlePointerDown(pointer(500));
    vi.advanceTimersByTime(450);
    expect(createMode.dragging).toBe(true);

    play();
    handlers.handlePointerMove(pointer(1500));
    handlers.handlePointerUp(pointer(1500));

    expect(notes()).toEqual([]);
    expect(createMode.dragging).toBe(false);
  });

  it('Select 모드에서 바디 끝 핸들 롱프레스 대기 중 재생이 시작되면 타이머를 취소해 450ms 뒤 6박까지 끌어도 리사이즈와 토스트가 없다', () => {
    const { handlers } = setup(chart(bodyWithEndRelease()), 'select');
    handlers.handlePointerDown(pointer(2550));
    play();
    vi.advanceTimersByTime(450);
    handlers.handlePointerMove(pointer(3000));
    handlers.handlePointerUp(pointer(3000));

    expect(bodyEnd()).toBe(5);
    expect(current().editTransaction).toBeNull();
    expect(pauseToasts()).toHaveLength(0);
  });

  it('재생 중 선택한 1박 탭을 마우스로 2박·3박까지 끌어도 옮기지 않고 선택은 남으며 안내 토스트는 1개다', () => {
    const { handlers } = setup(chart([tapAt(1)]), 'select');
    current().setSelection({ ...emptySelection(), notes: new Set([0]) });
    play();
    handlers.handlePointerDown(mouse(500));
    handlers.handlePointerMove(mouse(1000));
    handlers.handlePointerMove(mouse(1500));
    handlers.handlePointerUp(mouse(1500));

    expect(notes()[0].beat).toEqual(beat(1));
    expect(current().selection.notes).toEqual(new Set([0]));
    expect(current().historyPast).toHaveLength(0);
    expect(pauseToasts()).toHaveLength(1);
  });

  it('재생 중 바디 끝 핸들(5.1박)을 마우스로 6박까지 끌어도 끝이 5박에 남는다', () => {
    const { handlers } = setup(chart(bodyWithEndRelease()), 'select');
    play();
    handlers.handlePointerDown(mouse(2550));
    handlers.handlePointerMove(mouse(3000));
    handlers.handlePointerUp(mouse(3000));

    expect(bodyEnd()).toBe(5);
    expect(current().editTransaction).toBeNull();
  });

  it.each<[string, number, PointerInit]>([
    ['2박 탭 클릭', 1000, {}],
    ['2박 탭 Shift+클릭', 1000, { shiftKey: true }],
    ['1박 탭 Alt+클릭', 500, { altKey: true }],
  ])('1박 탭을 선택하고 재생 중 Select 모드에서 마우스로 %s을 해도 선택이 1박 탭에 남고 차트는 그대로이며 안내 토스트 1개를 띄운다', (_label, y, init) => {
    const { handlers } = setup(chart([tapAt(1), tapAt(2)]), 'select');
    selectFirst();
    play();
    const before = current().chart;
    handlers.handlePointerDown(mouse(y, 1, init));
    handlers.handlePointerUp(mouse(y, 1, init));

    expect(current().selection.notes).toEqual(new Set([0]));
    expect(current().chart).toBe(before);
    expect(pauseToasts()).toHaveLength(1);
  });

  it('1박 탭을 선택하고 재생 중 Select 모드에서 2박 탭을 터치로 짧게 누르면 선택이 1박 탭에 남고 안내 토스트 1개를 띄운다', () => {
    const { handlers } = setup(chart([tapAt(1), tapAt(2)]), 'select');
    selectFirst();
    play();
    handlers.handlePointerDown(pointer(1000));
    handlers.handlePointerUp(pointer(1000));

    expect(current().selection.notes).toEqual(new Set([0]));
    expect(pauseToasts()).toHaveLength(1);
  });

  it.each(['mouse', 'touch'] as const)('1박 탭을 선택하고 재생 중 빈 0.4박에서 3.4박까지 %s 박스로 끌어도 선택이 1박 탭에 남고 안내 토스트는 1개다', pointerType => {
    const { handlers } = setup(chart([tapAt(1), tapAt(3)]), 'select');
    selectFirst();
    play();
    handlers.handlePointerDown(pointer(200, { pointerType }));
    handlers.handlePointerMove(pointer(1700, { pointerType }));
    handlers.handlePointerUp(pointer(1700, { pointerType }));

    expect(current().selection.notes).toEqual(new Set([0]));
    expect(pauseToasts()).toHaveLength(1);
  });

  it.each(['mouse', 'touch'] as const)('1박 탭을 선택한 채 빈 0.4박에서 3.4박까지 %s 박스로 끄는 중 재생하면 즉시 선택이 1박 탭으로 돌아오고 정지 후 같은 누름을 떼도 그대로다', pointerType => {
    const { handlers } = setup(chart([tapAt(1), tapAt(3)]), 'select');
    selectFirst();
    handlers.handlePointerDown(pointer(200, { pointerType }));
    handlers.handlePointerMove(pointer(1700, { pointerType }));
    expect(current().selection.notes).toEqual(new Set([0, 1]));

    play();
    expect(current().selection.notes).toEqual(new Set([0]));
    current().setIsPlaying(false);
    handlers.handlePointerMove(pointer(1800, { pointerType }));
    expect(current().selection.notes).toEqual(new Set([0]));
    handlers.handlePointerUp(pointer(1800, { pointerType }));

    expect(current().selection.notes).toEqual(new Set([0]));
    expect(pauseToasts()).toHaveLength(0);
  });

  it('Select 모드에서 2박 탭 롱프레스 대기 중 재생이 시작되면 타이머를 취소해 450ms 뒤 떼도 선택과 토스트가 비어 있다', () => {
    const { handlers } = setup(chart([tapAt(1), tapAt(2)]), 'select');
    handlers.handlePointerDown(pointer(1000));
    play();
    vi.advanceTimersByTime(450);
    handlers.handlePointerUp(pointer(1000));

    expect(current().selection.notes.size).toBe(0);
    expect(pauseToasts()).toHaveLength(0);
  });

  it('선택한 1박 탭을 마우스로 2박까지 끄는 중 재생이 시작되면 1박으로 돌아오고, 3박까지 더 끌어 떼도 움직이지 않으며 history·안내 토스트가 없다', () => {
    const { handlers } = setup(chart([tapAt(1)]), 'select');
    selectFirst();
    handlers.handlePointerDown(mouse(500));
    handlers.handlePointerMove(mouse(1000));
    expect(notes()[0].beat).toEqual(beat(2));

    play();
    expect(notes()[0].beat).toEqual(beat(1));
    handlers.handlePointerMove(mouse(1500));
    handlers.handlePointerUp(mouse(1500));

    expect(notes()[0].beat).toEqual(beat(1));
    expect(current().selection.notes).toEqual(new Set([0]));
    expect(current().historyPast).toHaveLength(0);
    expect(current().editTransaction).toBeNull();
    expect(pauseToasts()).toHaveLength(0);
  });

  it('Select 모드에서 1박 탭을 롱프레스로 2박까지 옮기는 중 재생이 시작되면 1박으로 돌아오고, 정지한 뒤 같은 손가락을 3박으로 끌어 떼도 움직이지 않는다', () => {
    const { handlers } = setup(chart([tapAt(1)]), 'select');
    handlers.handlePointerDown(pointer(500));
    vi.advanceTimersByTime(450);
    handlers.handlePointerMove(pointer(1000));
    expect(notes()[0].beat).toEqual(beat(2));

    play();
    expect(notes()[0].beat).toEqual(beat(1));
    current().setIsPlaying(false);
    handlers.handlePointerMove(pointer(1500));
    handlers.handlePointerUp(pointer(1500));

    expect(notes()[0].beat).toEqual(beat(1));
    expect(current().historyPast).toHaveLength(0);
  });

  it('1박·2박 탭 중 1박을 우클릭으로 지우고 끄는 중 재생이 시작되면 1박 탭이 돌아오고, 2박 위로 끌고 떼도 지우지 않으며 history가 없다', () => {
    const { handlers } = setup(chart([tapAt(1), tapAt(2)]), 'select');
    handlers.handlePointerDown(rightPointer(500));
    expect(notes()).toHaveLength(1);

    play();
    expect(notes()).toHaveLength(2);
    handlers.handlePointerMove(rightPointer(1000));
    handlers.handlePointerUp(rightPointer(1000));
    handlers.handleContextMenu(contextMenu(1000));

    expect(notes()).toHaveLength(2);
    expect(current().historyPast).toHaveLength(0);
    expect(current().editTransaction).toBeNull();
    expect(pauseToasts()).toHaveLength(0);
  });

  it('재생 중 레인 왼쪽 커서 레일을 누르면 y=1500 위치(1500ms)로 seek한다', () => {
    const seekTo = vi.fn();
    const renderer = {
      handleMinimapPointerDown: () => false, handleMinimapPointerUp: () => {},
      screenXToTimelineX: (x: number) => x - 100, currentTimelineWidth: 240, contentCenterShiftX: 0,
      clampToMeasureRange: (timeMs: number) => timeMs, yToTime: (y: number) => y, hideGhostNote: () => {},
      clearMoveOrigins: () => {}, clearBoxSelectRect: () => {},
    } as unknown as TimelineRenderer;
    const { handlers } = setup(chart([tapAt(1)]), 'create', 'single', { renderer, playback: { seekTo } as unknown as PlaybackController });
    play();
    handlers.handlePointerDown(pointer(1500, { pointerType: 'mouse', x: 20 }));

    expect(seekTo).toHaveBeenCalledExactlyOnceWith(1500);
    expect(pauseToasts()).toHaveLength(0);
  });
});

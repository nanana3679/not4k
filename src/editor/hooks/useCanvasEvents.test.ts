import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beat, beatToFloat } from '../../shared';
import type { ChartDocument, DocumentNoteEntity } from '../../shared';
import { useEditorStore } from '../stores/editorStore';
import type { EditorModeName } from '../stores/editorStore';
import { emptySelection } from '../stores/selectionSlice';
import type { EntityType } from '../modes/CreateMode';
import { createEditorModes } from '../createEditorModes';
import { createTimelineSpace } from '../timeline/TimelineSpace';
import { EXTRA_LANE_WIDTH, TIMELINE_WIDTH } from '../timeline/constants';
import type { TimelineRenderer } from '../timeline/TimelineRenderer';
import type { PlaybackController } from '../playback/PlaybackController';
import { showToast } from '../../shared/toast';
import { INITIAL_TIMING_EXISTS_COPY, PAUSE_TO_EDIT_COPY } from '../editorCopy';
import { openEditorChart } from '../openEditorChart';
import { useCanvasEvents, type CanvasEventHandlers } from './useCanvasEvents';
import { handleEditorKeyDown } from './useEditorKeyboard';
import { isChartDirty, toSavedChartJson } from '../savedChart';

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
const contextMenu = (y: number) => ({ clientX: 30, clientY: y, preventDefault: () => {} }) as unknown as ReactMouseEvent<HTMLCanvasElement>;

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

/** App과 같은 모드 생성(`createEditorModes`)으로 모드를 만들고 useCanvasEvents를 한 번 렌더해 그 핸들러를 돌려준다. */
function setup(source: ChartDocument, mode: EditorModeName, entityType: EntityType = 'single', options: SetupOptions = {}) {
  useEditorStore.setState({
    chart: source, mode, entityType, selection: emptySelection(), extraLaneCount: 2, lastValidSnapshot: null,
    historyPast: [], historyFuture: [], historyLastCaptureAt: 0, editTransaction: null, isPlaying: false,
  });
  const space = createTimelineSpace({
    getChart: () => current().chart, getSnapDivision: () => 4, getSelectedNotes: () => new Set(current().selection.notes),
    getExtraLaneCount: () => current().extraLaneCount, yToTime: y => y, getTotalTimelineMs: () => 20000,
  });
  const { createMode, selectMode, deleteMode } = createEditorModes(current().chart, { space, isTimeInBounds: () => true });
  createMode.entityType = entityType;
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

it.each(['create', 'select'] as const)('%s 모드에서 4박 BPM을 마우스로 더블클릭하면 편집 창이 열리고 Create만 보조 노트 1개로 dirty가 된다', mode => {
  const document = chart([], { events: [
    { type: 'bpm', beat: beat(0), bpm: 120, editorLane: 1 },
    { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(4), editorLane: 2 },
    { type: 'bpm', beat: beat(4), bpm: 180, editorLane: 1 },
  ] });
  const { handlers } = setup(document, mode);
  const saved = toSavedChartJson(document, 2);
  const x = TIMELINE_WIDTH + EXTRA_LANE_WIDTH / 2;
  for (let click = 0; click < 2; click++) {
    handlers.handlePointerDown(pointer(2000, { pointerType: 'mouse', x }));
    handlers.handlePointerUp(pointer(2000, { pointerType: 'mouse', x, buttons: 0 }));
  }
  handlers.handleDoubleClick({ clientX: x, clientY: 2000 } as ReactMouseEvent<HTMLCanvasElement>);
  expect(current().editingEvent).toEqual({ type: 'event', index: 2 });
  expect(notes()).toHaveLength(mode === 'create' ? 1 : 0);
  expect(isChartDirty(current().chart, 2, saved, true)).toBe(mode === 'create');
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

describe('초기 설정이 있는 0박에 BPM·박자 생성(RFD 0082)', () => {
  const initialEvents = (): ChartDocument['events'] => [
    { type: 'bpm', beat: beat(0), bpm: 120, editorLane: 1 },
    { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(4), editorLane: 2 },
  ];

  it.each([
    ['BPM', 1, '마우스', 'bpm', 'mouse'],
    ['BPM', 1, '터치', 'bpm', 'touch'],
    ['박자', 2, '마우스', 'timeSignature', 'mouse'],
    ['박자', 2, '터치', 'timeSignature', 'touch'],
  ] as const)('%s 도구로 같은 종류 초기 설정이 놓인 보조 레인%i의 0박을 %s로 누르면 만들지 않고 INITIAL_TIMING_EXISTS_COPY 안내를 한 번 띄운다', (_tool, lane, _input, entityType, pointerType) => {
    const { handlers } = setup(chart([], { events: initialEvents() }), 'create', entityType);
    const x = TIMELINE_WIDTH + EXTRA_LANE_WIDTH * (lane - 0.5);
    handlers.handlePointerDown(pointer(0, { pointerType, x }));
    handlers.handlePointerUp(pointer(0, { pointerType, x, buttons: 0 }));

    expect(current().chart.events).toEqual(initialEvents());
    expect(current().historyPast).toEqual([]);
    expect(vi.mocked(showToast).mock.calls).toEqual([[INITIAL_TIMING_EXISTS_COPY, 'warn']]);
  });
});

describe('[text, 초기 BPM, 초기 박자] 순서 파일을 연 뒤 0박에서 초기 BPM과 겹친 text(RFD 0082)', () => {
  // 보조 레인1의 0박에 text 0～4박과 초기 BPM이 겹친 파일이다. 열면(openEditorChart) 초기 BPM·박자가 이벤트 목록 맨 앞으로
  // 와 [초기 BPM 0, 초기 박자 1, text 2]가 되고, text가 초기 BPM 위에 그려져 맨 위 이벤트로 잡힌다.
  const text: ChartDocument['events'][number] = { type: 'text', beat: beat(0), endBeat: beat(4), text: 'intro', editorLane: 1 };
  const initialBpm: ChartDocument['events'][number] = { type: 'bpm', beat: beat(0), bpm: 120, editorLane: 1 };
  const initialSignature: ChartDocument['events'][number] = { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(4), editorLane: 2 };
  const x = TIMELINE_WIDTH + EXTRA_LANE_WIDTH / 2;
  const doubleClick = (y: number) => ({ clientX: x, clientY: y }) as unknown as ReactMouseEvent<HTMLCanvasElement>;

  /** 파일을 openEditorChart로 연 차트로 setup한다. 열 때 뜨는 위반 경고 알림·콘솔 오류는 비운다. */
  function setupOpened(mode: EditorModeName) {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    openEditorChart({ chart: chart([], { events: [text, initialBpm, initialSignature] }), extraLaneCount: 2, hasExtraLaneCount: true });
    consoleError.mockRestore();
    vi.mocked(showToast).mockClear();
    expect(current().chart.events).toEqual([initialBpm, initialSignature, text]);
    return setup(current().chart, mode);
  }

  it('Select 모드로 보조 레인1의 0박을 터치로 짧게 누르면 맨 위에 그린 text 2를 선택하고 차트는 그대로다', () => {
    const { handlers } = setupOpened('select');
    handlers.handlePointerDown(pointer(0, { x }));
    handlers.handlePointerUp(pointer(0, { x, buttons: 0 }));

    expect(current().selection.events).toEqual(new Set([2]));
    expect(current().chart.events).toEqual([initialBpm, initialSignature, text]);
  });

  it('Select 모드로 보조 레인1의 0박을 450ms 눌러 1박까지 끌면 text 2가 1～5박이 되고 초기 BPM 0은 0박에 남는다', () => {
    const { handlers } = setupOpened('select');
    handlers.handlePointerDown(pointer(0, { x }));
    vi.advanceTimersByTime(450);
    handlers.handlePointerMove(pointer(500, { x }));
    handlers.handlePointerUp(pointer(500, { x, buttons: 0 }));

    expect(current().chart.events[2]).toMatchObject({ type: 'text', beat: beat(1), endBeat: beat(5) });
    expect(current().chart.events[0]).toEqual(initialBpm);
  });

  it('보조 레인1의 0박을 우클릭하면 text만 지우고 안내 토스트가 없다', () => {
    const { handlers } = setupOpened('select');
    handlers.handlePointerDown(pointer(0, { pointerType: 'mouse', button: 2, buttons: 2, x }));
    handlers.handlePointerUp(pointer(0, { pointerType: 'mouse', button: 2, buttons: 0, x }));

    expect(current().chart.events).toEqual([initialBpm, initialSignature]);
    expect(showToast).not.toHaveBeenCalled();
  });

  it('Delete 모드로 보조 레인1의 0박을 터치로 짧게 누르면 text만 지우고 안내 토스트가 없다', () => {
    const { handlers } = setupOpened('delete');
    handlers.handlePointerDown(pointer(0, { x }));
    handlers.handlePointerUp(pointer(0, { x, buttons: 0 }));

    expect(current().chart.events).toEqual([initialBpm, initialSignature]);
    expect(showToast).not.toHaveBeenCalled();
  });

  it('보조 레인1의 0박을 더블클릭하면 맨 위에 그린 text 2 편집을 연다', () => {
    const { handlers } = setupOpened('select');
    handlers.handleDoubleClick(doubleClick(0));

    expect(current().editingEvent).toEqual({ type: 'event', index: 2 });
  });

  it('text를 1～5박으로 끌어 옮긴 뒤 보조 레인1의 0박을 더블클릭하면 위에 아무것도 없는 초기 BPM 0 편집을 연다', () => {
    const { handlers } = setupOpened('select');
    handlers.handlePointerDown(pointer(0, { x }));
    vi.advanceTimersByTime(450);
    handlers.handlePointerMove(pointer(500, { x }));
    handlers.handlePointerUp(pointer(500, { x, buttons: 0 }));
    expect(current().chart.events[2]).toMatchObject({ type: 'text', beat: beat(1), endBeat: beat(5) });

    handlers.handleDoubleClick(doubleClick(0));

    expect(current().editingEvent).toEqual({ type: 'event', index: 0 });
  });

  it('Select 모드로 text 2를 선택한 뒤 보조 레인1의 0박에 마우스를 올리면 커서가 move다', () => {
    const { handlers, selectMode, canvas } = setupOpened('select');
    selectMode.selectEvent(2);
    handlers.handlePointerMove(pointer(0, { pointerType: 'mouse', buttons: 0, x }));

    expect(canvas.style.cursor).toBe('move');
  });
});

describe('재생 중 캔버스 편집 제한(RFD 0099)', () => {
  const tapAt = (at: number, lane = 1): DocumentNoteEntity => ({ type: 'tap', kind: 'single', lane, beat: beat(at) });
  const mouse = (y: number, buttons = 1, init: PointerInit = {}) => pointer(y, { pointerType: 'mouse', buttons, ...init });
  const selectFirst = () => current().setSelection({ ...emptySelection(), notes: new Set([0]) });
  const pauseToasts = () => vi.mocked(showToast).mock.calls.filter(([message]) => message === PAUSE_TO_EDIT_COPY);
  const play = () => current().setIsPlaying(true);

  it.each([['mouse', 1], ['touch', 0]] as const)('재생 중 %s pointerId=1의 release가 누락돼도 정지 후 새 down·up은 2박 탭 1개를 놓고, 누를 때 안내하는 mouse·뗄 때 안내하는 touch의 안내 토스트는 %i개다', (pointerType, toasts) => {
    const { handlers } = setup(chart([]), 'create');
    play();
    handlers.handlePointerDown(pointer(500, { pointerType }));
    current().setIsPlaying(false);
    handlers.handlePointerDown(pointer(1000, { pointerType }));
    handlers.handlePointerUp(pointer(1000, { pointerType }));

    expect(notes().map(note => beatToFloat(note.beat))).toEqual([2]);
    expect(notes()[0]).toMatchObject({ type: 'tap', kind: 'single', lane: 1 });
    expect(pauseToasts()).toHaveLength(toasts);
  });

  it('재생 중 touch pointerId=1·2의 release가 누락돼도 blur 뒤 정지하면 contextmenu로 1박을 지우고 새 touch로 2박 탭 1개를 놓는다', () => {
    const { handlers } = setup(chart([tapAt(1)]), 'create');
    play();
    handlers.handlePointerDown(pointer(500));
    handlers.handlePointerDown(pointer(500, { pointerId: 2 }));
    window.dispatchEvent(new Event('blur'));
    current().setIsPlaying(false);
    handlers.handleContextMenu(contextMenu(500));
    expect(notes()).toEqual([]);

    handlers.handlePointerDown(pointer(1000, { pointerId: 3 }));
    handlers.handlePointerUp(pointer(1000, { pointerId: 3 }));
    expect(notes().map(note => beatToFloat(note.beat))).toEqual([2]);
    // blur 전 active id가 남아 다음 재생에서 다시 봉인되지 않는다.
    play();
    current().setIsPlaying(false);
    vi.advanceTimersByTime(1500);
    handlers.handleContextMenu(contextMenu(1000));
    expect(notes()).toEqual([]);
  });

  it.each(['mouse', 'touch'] as const)('재생을 겪은 %s pointerId=1이 정지 후 lostpointercapture되면 contextmenu가 1박을 지우고 새 touch가 2박 탭 1개를 놓는다', pointerType => {
    const { handlers, canvas } = setup(chart([tapAt(1)]), 'create');
    play();
    const contact = pointer(500, { pointerType, button: pointerType === 'mouse' ? 2 : 0 });
    handlers.handlePointerDown(contact);
    current().setIsPlaying(false);
    canvas.dispatchEvent(Object.assign(new Event('lostpointercapture'), contact));
    handlers.handleContextMenu(contextMenu(500));
    expect(notes()).toEqual([]);

    handlers.handlePointerDown(pointer(1000, { pointerId: 2 }));
    handlers.handlePointerUp(pointer(1000, { pointerId: 2 }));
    expect(notes().map(note => beatToFloat(note.beat))).toEqual([2]);
  });

  it('재생 중 mouse pointerId=1의 우클릭 release가 누락돼도 정지 후 buttons=0 이동이면 contextmenu가 1박 탭을 지운다', () => {
    const { handlers } = setup(chart([tapAt(1)]), 'select');
    play();
    handlers.handlePointerDown(rightPointer(500));
    current().setIsPlaying(false);
    handlers.handlePointerMove(mouse(500, 0));
    handlers.handleContextMenu(contextMenu(500));

    expect(notes()).toEqual([]);
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

  it('1박 A를 선택하고 2박 B를 3박까지 옮긴 뒤 pointercancel하면 B는 2박이고 선택은 누른 B로 남는다', () => {
    const { handlers } = setup(chart([tapAt(1), tapAt(2)]), 'select');
    selectFirst();
    handlers.handlePointerDown(mouse(1000));
    handlers.handlePointerMove(mouse(1500));
    handlers.handlePointerCancel(mouse(1500));
    expect(notes()[1].beat).toEqual(beat(2));
    expect(current().selection.notes).toEqual(new Set([1]));
    expect(current().historyPast).toHaveLength(0);
  });

  it('1박 A를 선택하고 2박 B를 롱프레스로 3박까지 옮기다 두 번째 손가락을 대면 B는 2박이고 선택은 누른 B로 남는다', () => {
    const { handlers } = setup(chart([tapAt(1), tapAt(2)]), 'select');
    selectFirst();
    handlers.handlePointerDown(pointer(1000));
    vi.advanceTimersByTime(450);
    handlers.handlePointerMove(pointer(1500));
    expect(notes()[1].beat).toEqual(beat(3));

    handlers.handlePointerDown(pointer(1500, { pointerId: 2, x: 200 }));

    expect(notes()[1].beat).toEqual(beat(2));
    expect(current().selection.notes).toEqual(new Set([1]));
    expect(current().historyPast).toHaveLength(0);
  });

  it.each(['mouse', 'touch'] as const)('정지 중 1박 탭을 %s로 2박까지 끄는 중 창이 blur되어도 드래그가 이어져 3박에서 떼면 탭은 3박이고 history 1개다', pointerType => {
    const { handlers } = setup(chart([tapAt(1)]), 'select');
    handlers.handlePointerDown(pointer(500, { pointerType }));
    if (pointerType === 'touch') vi.advanceTimersByTime(450);
    handlers.handlePointerMove(pointer(1000, { pointerType }));
    expect(notes()[0].beat).toEqual(beat(2));

    window.dispatchEvent(new Event('blur'));
    handlers.handlePointerMove(pointer(1500, { pointerType }));
    handlers.handlePointerUp(pointer(1500, { pointerType }));

    expect(notes()[0].beat).toEqual(beat(3));
    expect(current().historyPast).toHaveLength(1);
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

  it.each(['시작 전', '중'] as const)('두 손가락 접촉이 재생 %s에 시작해도 정지 후 가로 스크롤·핀치 콜백을 보내며 노트 0개·안내 토스트 0개다', start => {
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
    expect(pauseToasts()).toHaveLength(0);
  });

  it.each([
    { release: '재생 중에', pauseBeforeRelease: false, toasts: 1 },
    { release: '정지한 뒤', pauseBeforeRelease: true, toasts: 0 },
  ] as const)('재생 중 한 손가락으로 1박을 터치하면 누를 때는 안내하지 않고 $release 떼면 안내 토스트 $toasts개이며 노트 0개다', ({ pauseBeforeRelease, toasts }) => {
    const { handlers } = setup(chart([]), 'create');
    play();
    handlers.handlePointerDown(pointer(500));
    expect(pauseToasts()).toHaveLength(0);

    if (pauseBeforeRelease) current().setIsPlaying(false);
    handlers.handlePointerUp(pointer(500));

    expect(pauseToasts()).toHaveLength(toasts);
    expect(notes()).toHaveLength(0);
  });

  it.each([
    ['레일', 'Windows처럼 뗀 뒤'], ['미니맵', 'Windows처럼 뗀 뒤'],
    ['레일', 'macOS처럼 뗌 전에'], ['미니맵', 'macOS처럼 뗌 전에'],
  ] as const)('재생 중 %s을 우클릭한 누름의 contextmenu가 %s 와도 안내 토스트 0개이고, 정지 뒤 키보드 메뉴 키 contextmenu는 1박 탭을 지운다', (target, order) => {
    const renderer = {
      handleMinimapPointerDown: () => target === '미니맵', handleMinimapPointerUp: () => {},
      screenXToTimelineX: (x: number) => x - 100, currentTimelineWidth: 240, contentCenterShiftX: 0,
      clampToMeasureRange: (timeMs: number) => timeMs, yToTime: (y: number) => y,
      hideGhostNote() {}, clearMoveOrigins() {}, clearBoxSelectRect() {},
    } as unknown as TimelineRenderer;
    const { handlers } = setup(chart([tapAt(1)]), 'select', 'single', {
      renderer, playback: { seekTo: vi.fn() } as unknown as PlaybackController,
    });
    // 레일·미니맵은 화면 x=20, 1박 탭(레인 1)은 화면 x=130(타임라인 x=30)이다.
    const navigationMenu = { clientX: 20, clientY: 500, preventDefault: () => {} } as unknown as ReactMouseEvent<HTMLCanvasElement>;
    const keyboardMenuOnTap = { clientX: 130, clientY: 500, preventDefault: () => {} } as unknown as ReactMouseEvent<HTMLCanvasElement>;
    play();
    handlers.handlePointerDown(mouse(500, 2, { x: 20, button: 2 }));
    if (order === 'macOS처럼 뗌 전에') handlers.handleContextMenu(navigationMenu);
    handlers.handlePointerUp(mouse(500, 0, { x: 20, button: 2 }));
    if (order === 'Windows처럼 뗀 뒤') handlers.handleContextMenu(navigationMenu);

    expect(pauseToasts()).toHaveLength(0);
    expect(notes()).toHaveLength(1);

    current().setIsPlaying(false);
    handlers.handleContextMenu(keyboardMenuOnTap);

    expect(notes()).toEqual([]);
  });

  it.each(['재생 중', '정지한 뒤'] as const)('재생 중 레일을 우클릭해 캔버스 밖 x=-40에서 떼 그 contextmenu가 캔버스에 오지 않아도, %s 레일을 왼쪽 클릭한 다음 정지 중 키보드 메뉴 키 contextmenu는 1박 탭을 지운다', leftClick => {
    const seekTo = vi.fn();
    const renderer = {
      handleMinimapPointerDown: () => false, handleMinimapPointerUp: () => {},
      screenXToTimelineX: (x: number) => x - 100, currentTimelineWidth: 240, contentCenterShiftX: 0,
      clampToMeasureRange: (timeMs: number) => timeMs, yToTime: (y: number) => y,
      hideGhostNote() {}, clearMoveOrigins() {}, clearBoxSelectRect() {},
    } as unknown as TimelineRenderer;
    const { handlers } = setup(chart([tapAt(1)]), 'select', 'single', {
      renderer, playback: { seekTo } as unknown as PlaybackController,
    });
    // 레일은 화면 x=20, 1박 탭(레인 1)은 화면 x=130(타임라인 x=30)이다.
    const keyboardMenuOnTap = { clientX: 130, clientY: 500, preventDefault: () => {} } as unknown as ReactMouseEvent<HTMLCanvasElement>;
    play();
    handlers.handlePointerDown(mouse(500, 2, { x: 20, button: 2 }));
    // pointer capture로 뗌은 캔버스에 오지만, Windows는 뗀 자리의 다른 요소에 contextmenu를 보내 캔버스는 그 메뉴를 받지 않는다.
    handlers.handlePointerUp(mouse(500, 0, { x: -40, button: 2 }));
    if (leftClick === '정지한 뒤') current().setIsPlaying(false);
    handlers.handlePointerDown(mouse(1000, 1, { x: 20 }));
    handlers.handlePointerUp(mouse(1000, 0, { x: 20 }));
    current().setIsPlaying(false);

    handlers.handleContextMenu(keyboardMenuOnTap);

    expect(seekTo).toHaveBeenLastCalledWith(1000);
    expect(notes()).toEqual([]);
  });

  it.each(['레일', '미니맵'] as const)('재생 중 %s에서 시작한 마우스 접촉은 정지 후 y=500→1500 이동도 탐색으로 처리하고 노트 0개를 유지한다', target => {
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
    current().setIsPlaying(false);
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

  it('재생 중 우클릭 누름의 contextmenu가 macOS처럼 뗌 전에 와도 지우지 않고, 뗀 뒤 정지하면 키보드 메뉴 키 contextmenu가 1박 탭을 지운다', () => {
    const { handlers } = setup(chart([tapAt(1)]), 'select');
    play();
    handlers.handlePointerDown(rightPointer(500));
    handlers.handleContextMenu(contextMenu(500));
    handlers.handlePointerUp(rightPointer(500));
    expect(notes()).toHaveLength(1);

    current().setIsPlaying(false);
    handlers.handleContextMenu(contextMenu(500));

    expect(notes()).toEqual([]);
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

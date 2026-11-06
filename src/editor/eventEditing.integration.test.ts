import { createTimelineLayout, getEditorTimelineLayoutConfig, type TimelineLayout } from './timeline/TimelineLayout';
import { beforeEach, describe, expect, it } from 'vitest';
import { beat, beatToMs, type ChartDocument } from '../shared';
import { EraseGesture } from './editing/EraseGesture';
import { editorChartErrors, editorChartViolationIndices } from './documentValidation';
import { DeleteMode } from './modes/DeleteMode';
import { SelectMode } from './modes/SelectMode';
import { INITIAL_TIMING_EXISTS_COPY } from './editorCopy';
import { openEditorChart } from './openEditorChart';
import { selectCanUndo, useEditorStore } from './stores/editorStore';
import { emptySelection } from './stores/selectionSlice';
import { createTimelineSpace } from './timeline/TimelineSpace';

const editorLayout = (extraLaneCount = 3) => createTimelineLayout(getEditorTimelineLayoutConfig(extraLaneCount));
const centerOf = ({ x, width }: { x: number; width: number }) => x + width / 2;
/** 에디터 배치의 bpm·timeSignature 열 가운데 x. */
const BPM_X = centerOf(editorLayout().commonColumnRange('bpm')!);
const SIGNATURE_X = centerOf(editorLayout().commonColumnRange('timeSignature')!);
const noteX = (lane: number) => centerOf(editorLayout().noteLaneRange(lane));
const auxX = (lane: number) => centerOf(editorLayout().auxiliaryLaneRange(lane));

function chartFixture(): ChartDocument {
  return {
    meta: { title: '', artist: '', difficultyLabel: 'NORMAL', difficultyLevel: 1,
      imageFile: '', audioFile: '', previewAudioFile: '', offsetMs: 0 },
    notes: [{ type: 'single', lane: 1, beat: beat(4) }],
    trillZones: [],
    events: [
      { type: 'bpm', beat: beat(0), bpm: 120 },
      { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(4) },
      { type: 'bpm', beat: beat(4), bpm: 180 },
      { type: 'text', beat: beat(8), endBeat: beat(12), text: 'hello', editorLane: 2 },
    ],
  };
}

/** 0박 박자 없이 4박 박자 4/4가 있는 차트. 이벤트 0=0박 BPM, 1=4박 BPM, 2=text, 3=4박 박자. */
function chartWithoutInitialSignature(): ChartDocument {
  const chart = chartFixture();
  return { ...chart, events: [chart.events[0], chart.events[2], chart.events[3],
    { type: 'timeSignature', beat: beat(4), beatPerMeasure: beat(4) }] };
}

function editor(extraLaneCount = 3, layout?: TimelineLayout) {
  const store = () => useEditorStore.getState();
  const warnings: string[] = [];
  const space = createTimelineSpace({
    getLayout: () => layout ?? editorLayout(extraLaneCount),
    getChart: () => store().chart,
    getSnapDivision: () => 4,
    getSelectedNotes: () => store().selection.notes,
    getExtraLaneCount: () => extraLaneCount,
    yToTime: y => y,
    getTotalTimelineMs: () => 60_000,
  });
  const mode = new SelectMode(store().chart, {
    space,
    getSelection: () => store().selection,
    setSelection: selection => store().setSelection(selection),
    setSelectionTransient: selection => store().setSelectionTransient(selection),
    onChartUpdate: (chart, transaction) => {
      store().setChart(chart, { transaction });
      mode.setChart(store().chart);
    },
    getExtraLaneCount: () => extraLaneCount,
    beginTransaction: onInterrupt => store().beginEditTransaction('selectModeEdit', onInterrupt),
    commitTransaction: token => store().commitEditTransaction(token),
    cancelTransaction: token => store().cancelEditTransaction(token),
    onWarn: message => warnings.push(message),
  });
  function selectEvents(...indices: number[]) {
    store().setSelection(Object.assign(emptySelection(), { events: new Set(indices) }));
  }
  return { mode, space, store, selectEvents, warnings };
}

beforeEach(() => {
  useEditorStore.setState(useEditorStore.getInitialState(), true);
  useEditorStore.getState().loadChart(chartFixture());
});

describe('이벤트와 노트의 공통 선택·편집', () => {
  it('store에 추가된 16박 이벤트를 모드 동기화 전에 클릭해도 예외나 잘못된 선택이 생기지 않는다', () => {
    const { mode, store, space } = editor();
    mode.selectNote(0);
    store().setChart({ ...store().chart, events: [...store().chart.events,
      { type: 'text', beat: beat(16), endBeat: beat(20), text: 'new', editorLane: 2 },
    ] });
    const x = auxX(2);
    const y = beatToMs(beat(16), space.getBpmChanges());
    expect(space.hitTestEvent(x, y)).toBe(4);
    expect(() => mode.onPointerDown(x, y, false, false)).not.toThrow();
    expect(store().selection.notes).toEqual(new Set([0]));
    expect(store().selection.events).toEqual(new Set());
  });

  it.each([
    { name: '일반', shift: false, alt: false, toggle: false },
    { name: 'Shift', shift: true, alt: false, toggle: false },
    { name: 'Alt', shift: false, alt: true, toggle: false },
    { name: '터치 토글', shift: false, alt: false, toggle: true },
  ])('$name 클릭으로 초기 BPM·박자를 누르면 노트 선택을 보존하고 초기 설정은 선택·이동하지 않는다', ({ shift, alt, toggle }) => {
    const { mode, store } = editor();
    mode.selectNote(0);
    for (const x of [BPM_X, SIGNATURE_X]) {
      mode.onPointerDown(x, 0, shift, alt, toggle);
      mode.onPointerMove(noteX(1), 500);
      mode.onPointerUp(noteX(1), 500);
      expect(store().selection.notes).toEqual(new Set([0]));
      expect(store().selection.events).toEqual(new Set());
      expect(store().chart).toEqual(chartFixture());
    }
  });

  it('초기 BPM·박자의 터치 탭·롱프레스·직접 selectEvent는 선택과 드래그를 시작하지 않는다', () => {
    const { mode, store } = editor();
    for (const [index, x] of [BPM_X, SIGNATURE_X].entries()) {
      mode.clickAt(x, 0, true);
      expect(mode.selectEvent(index)).toBe(false);
      expect(mode.beginLongPressDrag(x, 0, { noteHit: null, noteEndHit: null, eventHit: index })).toBe(false);
      expect(store().selection.events).toEqual(new Set());
      expect(mode.isMoveDragging).toBe(false);
    }
  });

  it('0～5박의 노트와 초기 설정·4박 BPM을 박스로 감싸면 노트0·비초기 이벤트2만 선택한다', () => {
    const { mode, store } = editor();
    mode.onPointerDown(BPM_X, -100, false, false);
    mode.onPointerMove(auxX(1), 2500);
    mode.onPointerUp(auxX(1), 2500);
    expect(store().selection.notes).toEqual(new Set([0]));
    expect(store().selection.events).toEqual(new Set([2]));
  });

  it('editorLane 없는 초기 BPM·박자는 전용 열이라 위반이 없고 선택·레인 이동에서 빠져 그대로 남는다', () => {
    const { mode, store, selectEvents } = editor();
    expect(editorChartViolationIndices(store().chart).events).toEqual(new Set());
    selectEvents(1);
    expect(store().selection.events).toEqual(new Set());
    mode.moveByLane('right');
    expect(store().chart).toEqual(chartFixture());
  });

  it('TextEvent를 auto가 있는 보조 레인1·4박으로 이동하면 양쪽 위반을 표시하고 Undo·Redo·레인 분리로 수리한다', () => {
    useEditorStore.getState().loadChart({ ...chartFixture(), events: [...chartFixture().events,
      { type: 'auto', beat: beat(4), endBeat: beat(8), editorLane: 1 }] });
    const { mode, store, selectEvents } = editor();
    selectEvents(3);
    mode.moveByLane('left');
    for (let i = 0; i < 4; i++) mode.moveBySnap('down');
    expect(store().chart.events[3]).toMatchObject({ editorLane: 1, beat: beat(4), endBeat: beat(8) });
    expect(editorChartViolationIndices(store().chart).events).toEqual(new Set([3, 4]));
    expect(editorChartErrors(store().chart).map(error => error.rule)).toEqual(['eventOverlap']);
    store().clearSelection();
    expect(editorChartViolationIndices(store().chart).events).toEqual(new Set([3, 4]));
    store().undo();
    expect(editorChartErrors(store().chart)).toEqual([]);
    store().redo();
    expect(editorChartViolationIndices(store().chart).events).toEqual(new Set([3, 4]));
    mode.setChart(store().chart);
    selectEvents(3);
    mode.moveByLane('right');
    expect(editorChartErrors(store().chart)).toEqual([]);
  });

  it('TextEvent를 4박 BPM과 같은 박으로 옮겨도 BPM은 전용 열이라 위반이 없다', () => {
    const { mode, store, selectEvents } = editor();
    selectEvents(3);
    for (let i = 0; i < 4; i++) mode.moveBySnap('down');
    expect(store().chart.events[3]).toMatchObject({ beat: beat(4), endBeat: beat(8) });
    expect(editorChartErrors(store().chart)).toEqual([]);
  });

  it('Ctrl+A는 노트와 비초기 이벤트 2·3을 선택해 일반 노트의 이동을 초기 설정 보호가 막지 않는다', () => {
    const { mode, store } = editor();
    mode.selectAll();
    expect(store().selection.events).toEqual(new Set([2, 3]));
    mode.moveBySnap('up');
    expect(store().chart.notes[0].beat).toEqual(beat(5));
    expect(store().chart.events[0].beat).toEqual(beat(0));
    expect(store().chart.events[2].beat).toEqual(beat(5));
  });

  it('Ctrl+A는 0박 이전에 걸친 -1～3박 트릴 구간을 구간째 고르지 않고 0박 이후 항목만 박스 선택과 같은 규칙으로 고른다', () => {
    useEditorStore.getState().loadChart({ ...chartFixture(),
      notes: [{ type: 'trill', lane: 1, beat: beat(1) }, { type: 'single', lane: 2, beat: beat(2) }],
      trillZones: [{ lane: 1, beat: beat(-1), endBeat: beat(3) }],
      events: [...chartFixture().events, { type: 'text', beat: beat(-4), endBeat: beat(-2), text: 'pre', editorLane: 3 }],
    });
    const { mode, store } = editor();
    mode.selectAll();
    expect(store().selection.zones).toEqual(new Set());
    expect(store().selection.notes).toEqual(new Set([0]));
    expect(store().selection.events).toEqual(new Set([2, 3]));
  });

  it('4박 BPM 이벤트를 클릭하면 events에 인덱스 2가 선택되고 박스 선택은 끝난다', () => {
    const { mode, store } = editor();
    mode.onPointerDown(BPM_X, 2000, false, false);
    mode.onPointerUp(BPM_X, 2000);
    expect(store().selection).toMatchObject({ events: new Set([2]) });
    expect(mode.isBoxSelecting).toBe(false);
  });

  it('8～12박 TextEvent만 선택해 위로 한 스냅 이동하면 9～13박으로 함께 이동한다', () => {
    const { mode, store, selectEvents } = editor();
    selectEvents(3);
    mode.moveBySnap('up');
    expect(store().chart.events[3]).toMatchObject({ beat: beat(9), endBeat: beat(13), text: 'hello' });
  });

  it('BPM 이벤트만 복사해 16박에 붙이면 BPM 180을 보존하고 editorLane은 생기지 않는다', () => {
    const { mode, store, selectEvents } = editor();
    selectEvents(2);
    expect(mode.copy()).toBe(1);
    expect(mode.paste(beat(16))).toBe(1);
    expect(store().chart.events.at(-1)).toEqual({ type: 'bpm', beat: beat(16), bpm: 180 });
    mode.cancelPaste();
    expect(store().chart.events).toEqual(chartFixture().events);
  });

  it('4박 일반 노트만 복사하면 같은 4박의 선택하지 않은 BPM 이벤트는 붙이지 않는다', () => {
    const { mode, store } = editor();
    mode.selectNote(0);
    expect(mode.copy()).toBe(1);
    mode.paste(beat(16));
    expect(store().chart.notes).toHaveLength(2);
    expect(store().chart.events).toEqual(chartFixture().events);
    mode.cancelPaste();
  });

  it('TextEvent를 선택해 Delete하면 해당 이벤트만 지우고 선택을 비운다', () => {
    const { mode, store, selectEvents } = editor();
    selectEvents(3);
    mode.deleteSelected();
    expect(store().chart.events).toHaveLength(3);
    expect(store().chart.notes).toEqual(chartFixture().notes);
    expect(store().selection).toMatchObject({ events: new Set() });
  });

  it('노트와 BPM 이벤트를 Shift로 함께 선택하면 위로 한 스냅 이동할 때 둘 다 4→5박이 된다', () => {
    const { mode, store } = editor();
    mode.selectNote(0);
    mode.onPointerDown(BPM_X, 2000, true, false);
    expect(store().selection).toMatchObject({ notes: new Set([0]), events: new Set([2]) });
    mode.moveBySnap('up');
    expect(store().chart.notes[0].beat).toEqual(beat(5));
    expect(store().chart.events[2].beat).toEqual(beat(5));
  });

  it('노트와 BPM이 있는 4박을 박스로 감싸면 notes 0과 events 2를 함께 선택한다', () => {
    const { mode, store } = editor();
    mode.onPointerDown(BPM_X, 1750, false, false);
    mode.onPointerMove(noteX(1), 2200);
    mode.onPointerUp(noteX(1), 2200);
    expect(store().selection).toMatchObject({ notes: new Set([0]), events: new Set([2]) });
  });

  it('editorLane 2의 TextEvent를 오른쪽으로 이동하면 lane 3이 되고 다시 오른쪽 이동은 차단한다', () => {
    const { mode, store, selectEvents } = editor();
    selectEvents(3);
    mode.moveByLane('right');
    expect(store().chart.events[3]).toMatchObject({ editorLane: 3 });
    mode.moveByLane('right');
    expect(store().chart.events[3]).toMatchObject({ editorLane: 3 });
  });

  it('BPM 이벤트를 두 번 드래그해도 down 당시 시간 해석을 써서 4→6→7박으로 이동하고 Esc로 4박을 복구한다', () => {
    const { mode, store } = editor();
    const x = BPM_X;
    mode.onPointerDown(x, 2000, false, false);
    mode.onPointerMove(x, 2500);
    expect(store().chart.events[2].beat).toEqual(beat(6));
    mode.onPointerMove(x, 3000);
    expect(store().chart.events[2].beat).toEqual(beat(7));
    mode.cancel();
    expect(store().chart.events).toEqual(chartFixture().events);
    expect(mode.isMoveDragging).toBe(false);
  });

  it('TextEvent 끝을 위로 한 스냅 리사이즈하면 시작 8박과 text를 유지하고 끝만 12→13박이 된다', () => {
    const { mode, store, selectEvents } = editor();
    selectEvents(3);
    mode.resizeEndBySnap('up');
    expect(store().chart.events[3]).toMatchObject({ beat: beat(8), endBeat: beat(13), text: 'hello' });
  });

  it('초기 BPM 선택 입력은 제외하므로 Copy·Delete·Cut·시간/레인 이동은 원본을 보존한다', () => {
    const { mode, store, selectEvents } = editor();
    selectEvents(0);
    expect(store().selection.events).toEqual(new Set());
    expect(mode.copy()).toBe(0);
    mode.deleteSelected();
    expect(store().chart).toEqual(chartFixture());
    expect(mode.cut()).toBe(0);
    mode.moveBySnap('up');
    expect(store().chart).toEqual(chartFixture());
    mode.moveByLane('right');
    expect(store().chart).toEqual(chartFixture());
  });

  it('초기 BPM과 일반 노트를 함께 선택하려 하면 노트만 선택해 4→5박 이동·Delete가 동작한다', () => {
    const { mode, store } = editor();
    store().setSelection({ ...emptySelection(), notes: new Set([0]), events: new Set([0]) });
    expect(store().selection.events).toEqual(new Set());
    mode.moveBySnap('up');
    expect(store().chart.notes[0].beat).toEqual(beat(5));
    mode.deleteSelected();
    expect(store().chart.notes).toEqual([]);
    expect(store().chart.events).toEqual(chartFixture().events);
  });

  it('초기 BPM과 노트를 함께 잘라내면 노트 1개만 지우고 붙여넣기에서도 BPM을 복제하지 않는다', () => {
    const { mode, store } = editor();
    store().setSelection({ ...emptySelection(), notes: new Set([0]), events: new Set([0]) });
    expect(mode.cut()).toBe(1);
    expect(store().chart.notes).toEqual([]);
    expect(mode.paste(beat(16))).toBe(1);
    expect(store().chart.events).toEqual(chartFixture().events);
    mode.cancelPaste();
  });

  it('BPM 이벤트를 붙여넣고 확정한 뒤 undo·redo하면 이벤트 수가 5→4→5로 바뀐다', () => {
    const { mode, store, selectEvents } = editor();
    selectEvents(2);
    mode.copy();
    mode.paste(beat(16));
    mode.confirmPlacement();
    expect(store().chart.events).toHaveLength(5);
    store().undo();
    expect(store().chart.events).toEqual(chartFixture().events);
    store().redo();
    expect(store().chart.events.at(-1)).toMatchObject({ type: 'bpm', beat: beat(16), bpm: 180 });
  });

  it('앞의 BPM 이벤트를 삭제하면 선택된 TextEvent는 새 인덱스 2로 따라간다', () => {
    const { store, selectEvents } = editor();
    selectEvents(3);
    store().setChart({ ...store().chart, events: store().chart.events.filter((_, index) => index !== 2) });
    expect(store().selection.events).toEqual(new Set([2]));
    expect(store().chart.events[2].type).toBe('text');
  });

  it('4박 BPM에서 10ms 떨어진 위치는 히트하지만 30ms 떨어진 위치는 스냅과 무관하게 히트하지 않는다', () => {
    const { space } = editor();
    expect(space.hitTestEvent(BPM_X, 2010)).toBe(2);
    expect(space.hitTestEvent(BPM_X, 2030)).toBeNull();
  });

  it('Delete 모드로 4박 BPM을 지우면 해당 이벤트만 삭제하고 0박 초기 BPM 삭제는 막는다', () => {
    const { store, space } = editor();
    const mode = new DeleteMode(store().chart, { space,
      onChartUpdate: chart => store().setChart(chart),
    });
    mode.onPointerDown(BPM_X, 2000);
    expect(store().chart.events).toHaveLength(3);
    mode.onPointerDown(BPM_X, 0);
    expect(store().chart.events).toHaveLength(3);
    expect(store().chart.events[0]).toMatchObject({ type: 'bpm', beat: beat(0), bpm: 120 });
  });

  it('이벤트 드래그 삭제를 Esc로 취소하면 4박 BPM을 복구하고 같은 제스처의 재삭제를 막는다', () => {
    const { store } = editor();
    const gesture = new EraseGesture({ getLayout: () => editorLayout(store().extraLaneCount), getChart: () => store().chart,
      getSelectedNotes: () => store().selection.notes,
      beginTransaction: onInterrupt => store().beginEditTransaction('erase', onInterrupt),
      commitTransaction: token => store().commitEditTransaction(token),
      cancelTransaction: token => store().cancelEditTransaction(token),
      onChartUpdate: (chart, transaction) => store().setChart(chart, { transaction }),
    });
    gesture.begin();
    expect(gesture.erase(BPM_X, 4)).toBe(true);
    expect(store().chart.events).toHaveLength(3);
    gesture.cancel();
    expect(gesture.erase(BPM_X, 4)).toBe(false);
    gesture.finish();
    expect(store().chart.events).toEqual(chartFixture().events);
  });

  it('TextEvent 롱프레스 이동도 공통 선택·이동을 사용하고 취소하면 8～12박으로 복구한다', () => {
    const { mode, space, store } = editor();
    const x = auxX(2);
    const y = beatToMs(beat(9), space.getBpmChanges());
    expect(mode.beginLongPressDrag(x, y, { noteHit: null, noteEndHit: null, eventHit: 3 })).toBe(true);
    expect(store().selection.events).toEqual(new Set([3]));
    mode.onPointerMove(x, beatToMs(beat(10), space.getBpmChanges()));
    expect(store().chart.events[3]).toMatchObject({ beat: beat(9), endBeat: beat(13) });
    mode.cancel();
    expect(store().chart.events).toEqual(chartFixture().events);
  });

  it('4박 BPM 180을 1박을 거쳐 0박까지 드래그하면 초기 BPM이 있어 1박에 남고 INITIAL_TIMING_EXISTS_COPY 경고는 드래그 한 번에 한 번만 띄운다', () => {
    const { mode, store, warnings } = editor();
    const x = BPM_X;
    mode.onPointerDown(x, 2000, false, false);
    mode.onPointerMove(x, 500);
    mode.onPointerMove(x, 0);
    mode.onPointerMove(x, 100);
    mode.onPointerUp(x, 100);

    expect(store().chart.events[2]).toEqual({ type: 'bpm', beat: beat(1), bpm: 180 });
    expect(store().chart.events.filter(event => event.beat.n === 0)).toEqual(chartFixture().events.slice(0, 2));
    expect(warnings).toEqual([INITIAL_TIMING_EXISTS_COPY]);
  });

  it('0박 박자가 없을 때 4박 박자를 timeSignature 열에서 0박으로 드래그하면 초기 설정이 되어 선택에서 빠진다', () => {
    useEditorStore.getState().loadChart(chartWithoutInitialSignature());
    const { mode, store, warnings } = editor();
    const x = SIGNATURE_X;
    mode.onPointerDown(x, 2000, false, false);
    expect(store().selection.events).toEqual(new Set([3]));
    mode.onPointerMove(x, 0);
    mode.onPointerUp(x, 0);

    expect(store().chart.events[3]).toEqual({ type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(4) });
    expect(editorChartErrors(store().chart)).toEqual([]);
    expect(store().selection.events).toEqual(new Set());
    expect(warnings).toEqual([]);
  });

  it('선택한 4박 BPM 180을 ↓로 네 번 옮기면 1박까지 가고 0박이 되는 네 번째는 초기 BPM이 있어 거부하고 경고를 한 번 띄운다', () => {
    const { mode, store, selectEvents, warnings } = editor();
    selectEvents(2);
    for (let i = 0; i < 4; i++) mode.moveBySnap('down');

    expect(store().chart.events[2]).toEqual({ type: 'bpm', beat: beat(1), bpm: 180 });
    expect(store().selection.events).toEqual(new Set([2]));
    expect(warnings).toEqual([INITIAL_TIMING_EXISTS_COPY]);
  });

  it('0박 박자가 없을 때 선택한 4박 박자를 ↓로 네 번 옮기면 0박에 놓이고 위반이 없다', () => {
    useEditorStore.getState().loadChart(chartWithoutInitialSignature());
    const { mode, store, selectEvents, warnings } = editor();
    selectEvents(3);
    for (let i = 0; i < 4; i++) mode.moveBySnap('down');

    expect(store().chart.events[3]).toEqual({ type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(4) });
    expect(editorChartErrors(store().chart)).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('0박 박자 없는 차트에서 레인3의 4박 노트와 4박 박자 3/4를 함께 0박·한 레인 오른쪽으로 끌면 노트는 레인4로 가고 박자는 0박에 놓인다', () => {
    useEditorStore.getState().loadChart({ ...chartFixture(), notes: [{ type: 'single', lane: 3, beat: beat(4) }],
      events: [chartFixture().events[0], { type: 'timeSignature', beat: beat(4), beatPerMeasure: beat(3) }] });
    const { mode, store, warnings } = editor(2);
    store().setSelection({ ...emptySelection(), notes: new Set([0]), events: new Set([1]) });
    mode.onPointerDown(noteX(3), 2000, false, false);
    mode.onPointerMove(noteX(4), 0);
    mode.onPointerUp(noteX(4), 0);

    expect(store().chart.notes).toEqual([{ type: 'single', lane: 4, beat: beat(0) }]);
    expect(store().chart.events[1]).toEqual({ type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(3) });
    expect(warnings).toEqual([]);
  });

  it('4박 BPM 180을 복사해 0박에 붙이면 초기 BPM이 있어 0개를 붙이고 차트·Undo가 그대로며 경고를 한 번 띄운다', () => {
    const { mode, store, selectEvents, warnings } = editor();
    selectEvents(2);
    mode.copy();

    expect(mode.paste(beat(0))).toBe(0);

    expect(store().chart).toEqual(chartFixture());
    expect(mode.isPendingPaste).toBe(false);
    expect(selectCanUndo(store())).toBe(false);
    expect(warnings).toEqual([INITIAL_TIMING_EXISTS_COPY]);
  });
});

/** [text, 초기 BPM, 초기 박자] 순서 파일을 연다. 열어도 순서·레인을 옮기지 않고 위반도 없다. */
function openChartWithTextAtBeatZero(endBeat = beat(4)) {
  const [initialBpm, initialSignature] = chartFixture().events;
  const text: ChartDocument['events'][number] = { type: 'text', beat: beat(0), endBeat, text: 'intro', editorLane: 1 };
  openEditorChart({ chart: { ...chartFixture(), events: [text, initialBpm, initialSignature] }, extraLaneCount: 3, hasExtraLaneCount: true });
  expect(useEditorStore.getState().chart.events).toEqual([text, initialBpm, initialSignature]);
  return { initialBpm, initialSignature };
}

describe('0박의 보조 레인 이벤트와 전용 열의 초기 BPM·박자', () => {
  const x = auxX(1);

  it('보조 레인1의 0박을 클릭하면 text 0을 선택하고 차트와 경고는 그대로다', () => {
    openChartWithTextAtBeatZero();
    const { mode, store, warnings } = editor();
    const opened = store().chart;
    mode.onPointerDown(x, 0, false, false);
    mode.onPointerUp(x, 0);

    expect(store().selection.events).toEqual(new Set([0]));
    expect(store().chart).toBe(opened);
    expect(warnings).toEqual([]);
  });

  it('보조 레인1의 0박을 잡아 1박으로 끌면 text 0은 1～5박이 되고 초기 BPM은 0박에 남아 위반이 없다', () => {
    const { initialBpm } = openChartWithTextAtBeatZero();
    const { mode, store } = editor();
    mode.onPointerDown(x, 0, false, false);
    mode.onPointerMove(x, 500);
    mode.onPointerUp(x, 500);

    expect(store().chart.events[0]).toMatchObject({ type: 'text', beat: beat(1), endBeat: beat(5), editorLane: 1 });
    expect(store().chart.events[1]).toBe(initialBpm);
    expect(editorChartErrors(store().chart)).toEqual([]);
  });

  it('Delete 모드로 보조 레인1의 0박을 클릭하면 text만 지우고 초기 BPM 열의 0박을 클릭하면 Cannot delete initial event 경고만 띄운다', () => {
    const { initialBpm, initialSignature } = openChartWithTextAtBeatZero();
    const { store, space } = editor();
    const warnings: string[] = [];
    const mode = new DeleteMode(store().chart, { space,
      onChartUpdate: chart => store().setChart(chart),
      onWarn: message => warnings.push(message),
    });
    mode.onPointerDown(x, 0);
    expect(store().chart.events).toEqual([initialBpm, initialSignature]);
    expect(warnings).toEqual([]);

    mode.onPointerDown(BPM_X, 0);
    expect(store().chart.events).toEqual([initialBpm, initialSignature]);
    expect(warnings).toEqual(['Cannot delete initial event']);
  });

  it('드래그 삭제가 보조 레인1의 0박을 지나면 text만 지우고 초기 박자 열의 0박을 지나면 지우지 않고 경고한다', () => {
    const { initialBpm, initialSignature } = openChartWithTextAtBeatZero();
    const { store } = editor();
    const warnings: string[] = [];
    const gesture = new EraseGesture({ getLayout: () => editorLayout(store().extraLaneCount), getChart: () => store().chart,
      getSelectedNotes: () => store().selection.notes,
      beginTransaction: onInterrupt => store().beginEditTransaction('erase', onInterrupt),
      commitTransaction: token => store().commitEditTransaction(token),
      cancelTransaction: token => store().cancelEditTransaction(token),
      onChartUpdate: (chart, transaction) => store().setChart(chart, { transaction }),
      onWarn: message => warnings.push(message),
    });
    gesture.begin();
    expect(gesture.erase(x, 0)).toBe(true);
    expect(warnings).toEqual([]);
    expect(gesture.erase(SIGNATURE_X, 0)).toBe(false);
    gesture.finish();

    expect(store().chart.events).toEqual([initialBpm, initialSignature]);
    expect(warnings).toEqual(['Cannot delete initial event']);
  });
});

describe('BPM·박자가 섞인 선택의 가로 이동', () => {
  const noteAt = (lane: number) => ({ type: 'single', lane, beat: beat(4) }) as const;
  const history = () => useEditorStore.getState().historyPast.length;

  it('레인1 노트와 4박 BPM을 함께 고르고 →를 누르면 노트만 레인2로 가고 BPM은 값·박 그대로 editorLane이 생기지 않는다', () => {
    const { mode, store, warnings } = editor();
    store().setSelection({ ...emptySelection(), notes: new Set([0]), events: new Set([2]) });
    mode.moveByLane('right');
    expect(store().chart.notes[0].lane).toBe(2);
    expect(store().chart.events[2]).toEqual({ type: 'bpm', beat: beat(4), bpm: 180 });
    expect(warnings).toEqual([]);
  });

  it('보조 레인2 text와 4박 BPM을 함께 고르고 →를 누르면 text만 보조 레인3으로 간다', () => {
    const { mode, store, selectEvents } = editor();
    selectEvents(2, 3);
    mode.moveByLane('right');
    expect(store().chart.events[3]).toMatchObject({ editorLane: 3 });
    expect(store().chart.events[2]).toEqual({ type: 'bpm', beat: beat(4), bpm: 180 });
  });

  it('보조 레인 수 2에서 보조 레인2 text와 BPM을 함께 고르고 →를 누르면 text가 범위를 벗어나 전체를 거부한다', () => {
    const { mode, store, selectEvents } = editor(2);
    selectEvents(2, 3);
    mode.moveByLane('right');
    expect(store().chart).toEqual(chartFixture());
  });

  it('레인1 노트와 BPM을 함께 고르고 ←를 누르면 노트가 범위를 벗어나 전체를 거부하고 안내한다', () => {
    const { mode, store, warnings } = editor();
    store().setSelection({ ...emptySelection(), notes: new Set([0]), events: new Set([2]) });
    mode.moveByLane('left');
    expect(store().chart).toEqual(chartFixture());
    expect(warnings).toEqual(['더 이상 이동할 수 없습니다']);
  });

  it('보조 레인이 0개인 범위 밖 검사에서도 레인 이동한 노트와 함께 고른 BPM은 세지 않는다', () => {
    useEditorStore.getState().loadChart({ ...chartFixture(), notes: [noteAt(1)] });
    const { mode, store } = editor(0);
    store().setSelection({ ...emptySelection(), notes: new Set([0]), events: new Set([2]) });
    mode.moveByLane('right');
    expect(store().chart.notes[0].lane).toBe(2);
  });

  it.each([['←', 'left'], ['→', 'right']] as const)(
    'BPM 하나만 고르고 %s를 누르면 차트·이력·경고가 그대로다', (_key, direction) => {
      const { mode, store, selectEvents, warnings } = editor();
      selectEvents(2);
      const before = store().chart;
      const historyBefore = history();
      mode.moveByLane(direction);
      expect(store().chart).toBe(before);
      expect(history()).toBe(historyBefore);
      expect(warnings).toEqual([]);
    },
  );

  it('모드 동기화 전에 store에 더해진 16박 BPM을 고른 채 →를 눌러도 예외 없이 차트가 그대로다', () => {
    const { mode, store, selectEvents } = editor();
    store().setChart({ ...store().chart, events: [...store().chart.events, { type: 'bpm', beat: beat(16), bpm: 90 }] });
    selectEvents(4);
    const before = store().chart;
    expect(() => mode.moveByLane('right')).not.toThrow();
    expect(store().chart.events).toEqual(before.events);
  });

  it('4박 BPM·4박 박자만 고르고 →를 눌러도 차트·이력이 그대로다', () => {
    useEditorStore.getState().loadChart(chartWithoutInitialSignature());
    const { mode, store, selectEvents } = editor();
    selectEvents(1, 3);
    const before = store().chart;
    mode.moveByLane('right');
    expect(store().chart).toBe(before);
  });

  it('레인1 노트와 BPM을 함께 고르고 ↑를 누르면 둘 다 한 스냅 올라간다', () => {
    const { mode, store } = editor();
    store().setSelection({ ...emptySelection(), notes: new Set([0]), events: new Set([2]) });
    mode.moveBySnap('up');
    expect(store().chart.notes[0].beat).toEqual(beat(5));
    expect(store().chart.events[2].beat).toEqual(beat(5));
  });

  it('BPM만 골라 bpm 열에서 메인 레인2까지 가로로 끌면 박이 그대로라 차트가 같고 Undo 이력이 없다', () => {
    const { mode, store } = editor();
    const historyBefore = history();
    mode.onPointerDown(BPM_X, 2000, false, false);
    mode.onPointerMove(noteX(2), 2000);
    mode.onPointerUp(noteX(2), 2000);
    expect(store().chart).toEqual(chartFixture());
    expect(history()).toBe(historyBefore);
  });

  it('BPM만 골라 메인 레인까지 끌면서 y=2500까지 올리면 BPM은 박만 6박이 된다', () => {
    const { mode, store } = editor();
    mode.onPointerDown(BPM_X, 2000, false, false);
    mode.onPointerMove(noteX(2), 2500);
    mode.onPointerUp(noteX(2), 2500);
    expect(store().chart.events[2]).toEqual({ type: 'bpm', beat: beat(6), bpm: 180 });
  });

  it('레인1 노트와 BPM을 고르고 bpm 열의 BPM을 잡아 timeSignature 열로 끌면 노트만 한 레인 오른쪽으로 간다', () => {
    const { mode, store } = editor();
    store().setSelection({ ...emptySelection(), notes: new Set([0]), events: new Set([2]) });
    mode.onPointerDown(BPM_X, 2000, false, false);
    mode.onPointerMove(SIGNATURE_X, 2000);
    mode.onPointerUp(SIGNATURE_X, 2000);
    expect(store().chart.notes[0].lane).toBe(2);
    expect(store().chart.events[2]).toEqual({ type: 'bpm', beat: beat(4), bpm: 180 });
  });

  it('레인1 노트와 BPM을 고르고 BPM을 잡아 메인 레인2로 끌면 앵커가 3칸 움직여 노트는 레인4로, BPM은 열에 남는다', () => {
    const { mode, store } = editor();
    store().setSelection({ ...emptySelection(), notes: new Set([0]), events: new Set([2]) });
    mode.onPointerDown(BPM_X, 2000, false, false);
    mode.onPointerMove(noteX(2), 2500);
    mode.onPointerUp(noteX(2), 2500);
    expect(store().chart.notes[0]).toMatchObject({ lane: 4, beat: beat(6) });
    expect(store().chart.events[2]).toEqual({ type: 'bpm', beat: beat(6), bpm: 180 });
  });

  it('레인1 노트를 잡아 곡 공통 열까지 끌면 레인 오프셋 0을 유지한 채 박만 따라온다', () => {
    const { mode, store } = editor();
    mode.onPointerDown(noteX(1), 2000, false, false);
    mode.onPointerMove(BPM_X, 2500);
    mode.onPointerUp(BPM_X, 2500);
    expect(store().chart.notes[0]).toMatchObject({ lane: 1, beat: beat(6) });
  });
});

it.each([[30, 150], [150, 30]])(
  'song-common 열과 메인 1번 사이 x=%i→%i로 0～5박 박스를 만들면 4박 BPM·노트만 선택된다',
  (startX, endX) => {
    const layout = createTimelineLayout({ auxiliaryLaneCount: 3,
      songCommonColumns: [{ id: 'bpm', width: 60 }, { id: 'timeSignature', width: 60 }] });
    const { mode, store, space } = editor(3, layout);
    mode.beginBoxSelect(startX, 0);
    const endY = beatToMs(beat(5), space.getBpmChanges());
    mode.onPointerMove(endX, endY);
    expect(mode.boxSelectPixelRect).toEqual({
      startY: 0, startRange: { x: startX === 30 ? 0 : 120, width: 60 },
      endY, endRange: { x: endX === 30 ? 0 : 120, width: 60 },
    });
    mode.onPointerUp(endX, endY);
    expect(store().selection.events).toEqual(new Set([2]));
    expect(store().selection.notes).toEqual(new Set([0]));
  },
);

it('Ctrl+A가 가로 배치를 읽지 않고 4박 노트·BPM과 8～12박 text를 선택하면 초기 이벤트 0·1은 제외된다', () => {
  const layout = new Proxy(createTimelineLayout({ auxiliaryLaneCount: 0 }), {
    get: () => { throw new Error('Ctrl+A must not read display geometry'); },
  });
  const { mode, store } = editor(0, layout);
  mode.selectAll();
  expect(store().selection.notes).toEqual(new Set([0]));
  expect(store().selection.events).toEqual(new Set([2, 3]));
});

it('song-common 열 x=30→90에서 0～5박 박스를 만들고 x=1000까지 나가면 4박 BPM만 선택하고 메인 1번은 제외된다', () => {
  const layout = createTimelineLayout({ auxiliaryLaneCount: 3,
    songCommonColumns: [{ id: 'bpm', width: 60 }, { id: 'timeSignature', width: 60 }] });
  const { mode, store, space } = editor(3, layout);
  const endY = beatToMs(beat(5), space.getBpmChanges());
  mode.beginBoxSelect(30, 0);
  mode.onPointerMove(90, endY);
  mode.onPointerMove(1000, endY);
  expect(mode.boxSelectPixelRect?.endRange).toEqual({ x: 60, width: 60 });
  mode.onPointerUp(1000, endY);
  expect(store().selection.events).toEqual(new Set([2]));
  expect(store().selection.notes).toEqual(new Set());
});

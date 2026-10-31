import { beforeEach, describe, expect, it } from 'vitest';
import { beat, beatToMs, type ChartDocument } from '../shared';
import { EraseGesture } from './editing/EraseGesture';
import { editorChartErrors, editorChartViolationIndices } from './documentValidation';
import { DeleteMode } from './modes/DeleteMode';
import { SelectMode } from './modes/SelectMode';
import { useEditorStore } from './stores/editorStore';
import { emptySelection } from './stores/selectionSlice';
import { createTimelineSpace } from './timeline/TimelineSpace';
import { EXTRA_LANE_WIDTH, TIMELINE_WIDTH } from './timeline/constants';

function chartFixture(): ChartDocument {
  return {
    meta: { title: '', artist: '', difficultyLabel: 'NORMAL', difficultyLevel: 1,
      imageFile: '', audioFile: '', previewAudioFile: '', offsetMs: 0 },
    notes: [{ type: 'single', lane: 1, beat: beat(4) }],
    trillZones: [],
    events: [
      { type: 'bpm', beat: beat(0), bpm: 120, editorLane: 1 },
      { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(4), editorLane: 2 },
      { type: 'bpm', beat: beat(4), bpm: 180, editorLane: 1 },
      { type: 'text', beat: beat(8), endBeat: beat(12), text: 'hello', editorLane: 2 },
    ],
  };
}

function editor() {
  const store = () => useEditorStore.getState();
  const space = createTimelineSpace({
    getChart: () => store().chart,
    getSnapDivision: () => 4,
    getSelectedNotes: () => store().selection.notes,
    getExtraLaneCount: () => 3,
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
    getExtraLaneCount: () => 3,
    beginTransaction: onInterrupt => store().beginEditTransaction('selectModeEdit', onInterrupt),
    commitTransaction: token => store().commitEditTransaction(token),
    cancelTransaction: token => store().cancelEditTransaction(token),
  });
  function selectEvents(...indices: number[]) {
    store().setSelection(Object.assign(emptySelection(), { events: new Set(indices) }));
  }
  return { mode, space, store, selectEvents };
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
    const x = TIMELINE_WIDTH + EXTRA_LANE_WIDTH * 1.5;
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
    for (const index of [0, 1]) {
      const x = TIMELINE_WIDTH + EXTRA_LANE_WIDTH * (index + 0.5);
      mode.onPointerDown(x, 0, shift, alt, toggle);
      mode.onPointerMove(x + EXTRA_LANE_WIDTH, 500);
      mode.onPointerUp(x + EXTRA_LANE_WIDTH, 500);
      expect(store().selection.notes).toEqual(new Set([0]));
      expect(store().selection.events).toEqual(new Set());
      expect(store().chart).toEqual(chartFixture());
    }
  });

  it('초기 BPM·박자의 터치 탭·롱프레스·직접 selectEvent는 선택과 드래그를 시작하지 않는다', () => {
    const { mode, store } = editor();
    for (const index of [0, 1]) {
      const x = TIMELINE_WIDTH + EXTRA_LANE_WIDTH * (index + 0.5);
      mode.clickAt(x, 0, true);
      expect(mode.selectEvent(index)).toBe(false);
      expect(mode.beginLongPressDrag(x, 0, { noteHit: null, noteEndHit: null, eventHit: index })).toBe(false);
      expect(store().selection.events).toEqual(new Set());
      expect(mode.isMoveDragging).toBe(false);
    }
  });

  it('0～5박의 노트와 초기 설정·4박 BPM을 박스로 감싸면 노트0·비초기 이벤트2만 선택한다', () => {
    const { mode, store } = editor();
    mode.onPointerDown(1, -100, false, false);
    mode.onPointerMove(TIMELINE_WIDTH + EXTRA_LANE_WIDTH * 2, 2500);
    mode.onPointerUp(TIMELINE_WIDTH + EXTRA_LANE_WIDTH * 2, 2500);
    expect(store().selection.notes).toEqual(new Set([0]));
    expect(store().selection.events).toEqual(new Set([2]));
  });

  it('editorLane 없는 초기 BPM·박자가 store에서 보조 레인1에 겹쳐 있으면 선택·레인 이동이 둘 다 제외해 위반 0·1이 그대로 남는다', () => {
    // 파일을 열 때 고정 레인(BPM 1·박자 2)에 두는 일은 openEditorChart가 맡는다. 이 테스트는 그 경로 없이 loadChart로 넣은 store 상태를 본다.
    const chart = chartFixture();
    chart.events = chart.events.slice(0, 2).map(({ editorLane: _editorLane, ...event }) => event);
    useEditorStore.getState().loadChart(chart);
    const { mode, store, selectEvents } = editor();
    expect(store().chart.events.every(event => event.editorLane === undefined)).toBe(true);
    expect(editorChartViolationIndices(store().chart).events).toEqual(new Set([0, 1]));
    selectEvents(1);
    expect(store().selection.events).toEqual(new Set());
    mode.moveByLane('right');
    expect(store().chart.events.every(event => event.editorLane === undefined)).toBe(true);
    expect(editorChartViolationIndices(store().chart).events).toEqual(new Set([0, 1]));
  });

  it('TextEvent를 BPM이 있는 보조 레인1·4박으로 이동하면 양쪽 위반을 표시하고 Undo·Redo·레인 분리로 수리한다', () => {
    const { mode, store, selectEvents } = editor();
    selectEvents(3);
    mode.moveByLane('left');
    for (let i = 0; i < 4; i++) mode.moveBySnap('down');
    expect(store().chart.events[3]).toMatchObject({ editorLane: 1, beat: beat(4), endBeat: beat(8) });
    expect(editorChartViolationIndices(store().chart).events).toEqual(new Set([2, 3]));
    expect(editorChartErrors(store().chart).map(error => error.rule)).toEqual(['eventOverlap']);
    store().clearSelection();
    expect(editorChartViolationIndices(store().chart).events).toEqual(new Set([2, 3]));
    store().undo();
    expect(editorChartErrors(store().chart)).toEqual([]);
    store().redo();
    expect(editorChartViolationIndices(store().chart).events).toEqual(new Set([2, 3]));
    mode.setChart(store().chart);
    selectEvents(3);
    mode.moveByLane('right');
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

  it('4박 BPM 이벤트를 클릭하면 events에 인덱스 2가 선택되고 박스 선택은 끝난다', () => {
    const { mode, store } = editor();
    const x = TIMELINE_WIDTH + EXTRA_LANE_WIDTH / 2;
    mode.onPointerDown(x, 2000, false, false);
    mode.onPointerUp(x, 2000);
    expect(store().selection).toMatchObject({ events: new Set([2]) });
    expect(mode.isBoxSelecting).toBe(false);
  });

  it('8～12박 TextEvent만 선택해 위로 한 스냅 이동하면 9～13박으로 함께 이동한다', () => {
    const { mode, store, selectEvents } = editor();
    selectEvents(3);
    mode.moveBySnap('up');
    expect(store().chart.events[3]).toMatchObject({ beat: beat(9), endBeat: beat(13), text: 'hello' });
  });

  it('BPM 이벤트만 복사해 16박에 붙이면 BPM 180과 editorLane 1을 보존한다', () => {
    const { mode, store, selectEvents } = editor();
    selectEvents(2);
    expect(mode.copy()).toBe(1);
    expect(mode.paste(beat(16))).toBe(1);
    expect(store().chart.events.at(-1)).toMatchObject({ type: 'bpm', beat: beat(16), bpm: 180, editorLane: 1 });
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
    mode.onPointerDown(TIMELINE_WIDTH + EXTRA_LANE_WIDTH / 2, 2000, true, false);
    expect(store().selection).toMatchObject({ notes: new Set([0]), events: new Set([2]) });
    mode.moveBySnap('up');
    expect(store().chart.notes[0].beat).toEqual(beat(5));
    expect(store().chart.events[2].beat).toEqual(beat(5));
  });

  it('노트와 BPM이 있는 4박을 박스로 감싸면 notes 0과 events 2를 함께 선택한다', () => {
    const { mode, store } = editor();
    mode.onPointerDown(1, 1750, false, false);
    mode.onPointerMove(TIMELINE_WIDTH + EXTRA_LANE_WIDTH, 2200);
    mode.onPointerUp(TIMELINE_WIDTH + EXTRA_LANE_WIDTH, 2200);
    expect(store().selection).toMatchObject({ notes: new Set([0]), events: new Set([2]) });
  });

  it('editorLane 2의 TextEvent를 오른쪽으로 이동하면 lane 3이 되고 다시 오른쪽 이동은 차단한다', () => {
    const { mode, store, selectEvents } = editor();
    selectEvents(3);
    mode.moveByLane('right');
    expect(store().chart.events[3].editorLane).toBe(3);
    mode.moveByLane('right');
    expect(store().chart.events[3].editorLane).toBe(3);
  });

  it('BPM 이벤트를 두 번 드래그해도 down 당시 시간 해석을 써서 4→6→7박으로 이동하고 Esc로 4박을 복구한다', () => {
    const { mode, store } = editor();
    const x = TIMELINE_WIDTH + EXTRA_LANE_WIDTH / 2;
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
    const x = TIMELINE_WIDTH + EXTRA_LANE_WIDTH / 2;
    expect(space.hitTestEvent(x, 2010)).toBe(2);
    expect(space.hitTestEvent(x, 2030)).toBeNull();
  });

  it('Delete 모드로 4박 BPM을 지우면 해당 이벤트만 삭제하고 0박 초기 BPM 삭제는 막는다', () => {
    const { store, space } = editor();
    const mode = new DeleteMode(store().chart, { space,
      onChartUpdate: chart => store().setChart(chart),
    });
    const x = TIMELINE_WIDTH + EXTRA_LANE_WIDTH / 2;
    mode.onPointerDown(x, 2000);
    expect(store().chart.events).toHaveLength(3);
    mode.onPointerDown(x, 0);
    expect(store().chart.events).toHaveLength(3);
    expect(store().chart.events[0]).toMatchObject({ type: 'bpm', beat: beat(0), bpm: 120 });
  });

  it('이벤트 드래그 삭제를 Esc로 취소하면 4박 BPM을 복구하고 같은 제스처의 재삭제를 막는다', () => {
    const { store } = editor();
    const gesture = new EraseGesture({ getChart: () => store().chart,
      getSelectedNotes: () => store().selection.notes,
      beginTransaction: onInterrupt => store().beginEditTransaction('erase', onInterrupt),
      commitTransaction: token => store().commitEditTransaction(token),
      cancelTransaction: token => store().cancelEditTransaction(token),
      onChartUpdate: (chart, transaction) => store().setChart(chart, { transaction }),
    });
    gesture.begin();
    expect(gesture.erase(5, 4)).toBe(true);
    expect(store().chart.events).toHaveLength(3);
    gesture.cancel();
    expect(gesture.erase(5, 4)).toBe(false);
    gesture.finish();
    expect(store().chart.events).toEqual(chartFixture().events);
  });

  it('TextEvent 롱프레스 이동도 공통 선택·이동을 사용하고 취소하면 8～12박으로 복구한다', () => {
    const { mode, space, store } = editor();
    const x = TIMELINE_WIDTH + EXTRA_LANE_WIDTH * 1.5;
    const y = beatToMs(beat(9), space.getBpmChanges());
    expect(mode.beginLongPressDrag(x, y, { noteHit: null, noteEndHit: null, eventHit: 3 })).toBe(true);
    expect(store().selection.events).toEqual(new Set([3]));
    mode.onPointerMove(x, beatToMs(beat(10), space.getBpmChanges()));
    expect(store().chart.events[3]).toMatchObject({ beat: beat(9), endBeat: beat(13) });
    mode.cancel();
    expect(store().chart.events).toEqual(chartFixture().events);
  });
});

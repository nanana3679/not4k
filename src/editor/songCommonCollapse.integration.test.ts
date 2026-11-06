import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { beat, beatToFloat, beatToMs, type ChartDocument, type ChartEvent } from '../shared';
import { showToast } from '../shared/toast';
import { createEditorModes } from './createEditorModes';
import { EraseGesture } from './editing/EraseGesture';
import { SONG_COMMON_COLLAPSED_STORAGE_KEY } from './songCommonCollapse';
import { useEditorStore } from './stores/editorStore';
import { emptySelection } from './stores/selectionSlice';
import { createTimelineLayout, getEditorTimelineLayoutConfig } from './timeline/TimelineLayout';
import { createTimelineSpace } from './timeline/TimelineSpace';

vi.mock('../shared/toast', () => ({ showToast: vi.fn() }));

const store = () => useEditorStore.getState();
const layout = () => createTimelineLayout(getEditorTimelineLayoutConfig(store()));
const centerOf = ({ x, width }: { x: number; width: number }) => x + width / 2;
const laneX = (lane: number) => centerOf(layout().noteLaneRange(lane));
const auxX = (lane: number) => centerOf(layout().auxiliaryLaneRange(lane));
/** 120 BPM·y=ms 항등이므로 1박이 y=500이다. 4박 BPM 180 뒤로는 쓰지 않는다. */
const yAt = (at: number) => at * 500;
/** 펼친 배치에서 bpm 열 가운데 x. 접으면 같은 숫자가 메인 레인 1 안이다. */
const BPM_COLUMN_X = 30;

const fixture = (): ChartDocument => ({
  meta: { title: '접기', artist: '', difficultyLabel: 'NORMAL', difficultyLevel: 1, imageFile: '', audioFile: '', previewAudioFile: '', offsetMs: 0 },
  notes: [{ type: 'tap', kind: 'single', lane: 1, beat: beat(2) }],
  trillZones: [],
  events: [
    { type: 'bpm', beat: beat(0), bpm: 120 },
    { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(4) },
    { type: 'bpm', beat: beat(4), bpm: 120 },
    { type: 'timeSignature', beat: beat(8), beatPerMeasure: beat(3) },
    { type: 'text', beat: beat(3), endBeat: beat(5), text: '메모', editorLane: 1 },
  ],
});
const BPM_4 = 2;
const SIGNATURE_8 = 3;
const TEXT = 4;

function editor() {
  const space = createTimelineSpace({
    getLayout: layout,
    getChart: () => store().chart,
    getSnapDivision: () => 4,
    getSelectedNotes: () => store().selection.notes,
    getExtraLaneCount: () => store().extraLaneCount,
    yToTime: y => y,
    getTotalTimelineMs: () => 60_000,
  });
  const modes = createEditorModes(store().chart, { space, isTimeInBounds: () => true });
  unsubscribe = useEditorStore.subscribe(state => {
    modes.createMode.setChart(state.chart);
    modes.selectMode.setChart(state.chart);
    modes.deleteMode.setChart(state.chart);
  });
  return { ...modes, space };
}

const textEndBeat = () => {
  const text = store().chart.events[TEXT];
  return 'endBeat' in text ? beatToFloat(text.endBeat) : null;
};
const typesOf = (events: readonly ChartEvent[]) => events.map(event => event.type);
const selectEvents = (...indices: number[]) => store().setSelection({ ...emptySelection(), events: new Set(indices) });

let unsubscribe = () => {};
let stored: Map<string, string>;
beforeEach(() => {
  stored = new Map();
  vi.stubGlobal('window', { localStorage: {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => { stored.set(key, value); },
  } });
  vi.mocked(showToast).mockClear();
  useEditorStore.setState(useEditorStore.getInitialState(), true);
  useEditorStore.setState({ mode: 'select', extraLaneCount: 2 });
  store().loadChart(fixture());
});
afterEach(() => {
  unsubscribe();
  vi.unstubAllGlobals();
});

describe('접힌 동안의 선택(RFD 0095 결정 2)', () => {
  it('펼친 채 Ctrl+A는 2박 탭·4박 BPM·8박 박자·text를 고른다', () => {
    const { selectMode } = editor();
    selectMode.selectAll();
    expect(store().selection.notes).toEqual(new Set([0]));
    expect(store().selection.events).toEqual(new Set([BPM_4, SIGNATURE_8, TEXT]));
  });

  it('접은 채 Ctrl+A는 2박 탭과 text만 고르고 4박 BPM·8박 박자는 건너뛴다', () => {
    const { selectMode } = editor();
    store().setSongCommonCollapsed(true);
    selectMode.selectAll();
    expect(store().selection.notes).toEqual(new Set([0]));
    expect(store().selection.events).toEqual(new Set([TEXT]));
  });

  it('접은 채 Ctrl+A 뒤 Delete하면 숨은 4박 BPM·8박 박자가 차트에 남고 탭·text만 지워진다', () => {
    const { selectMode } = editor();
    store().setSongCommonCollapsed(true);
    selectMode.selectAll();
    selectMode.deleteSelected();
    expect(store().chart.notes).toEqual([]);
    expect(typesOf(store().chart.events)).toEqual(['bpm', 'timeSignature', 'bpm', 'timeSignature']);
  });

  it('접은 채 Ctrl+A는 표시 배치를 읽지 않으므로 보조 레인 2개 밖 lane 8 탭도 그대로 고른다', () => {
    store().loadChart({ ...fixture(), notes: [{ type: 'tap', kind: 'single', lane: 8, beat: beat(2) }] });
    const { selectMode } = editor();
    store().setSongCommonCollapsed(true);
    selectMode.selectAll();
    expect(store().selection.notes).toEqual(new Set([0]));
  });

  it('접은 채 메인 레인 1에서 보조 레인 1까지 1～9박을 박스로 감싸면 탭·text만 고르고 BPM·박자는 고르지 않는다', () => {
    const { selectMode } = editor();
    store().setSongCommonCollapsed(true);
    selectMode.onPointerDown(laneX(1), yAt(1), false, false);
    selectMode.onPointerMove(auxX(1), yAt(9));
    selectMode.onPointerUp(auxX(1), yAt(9));
    expect(store().selection.notes).toEqual(new Set([0]));
    expect(store().selection.events).toEqual(new Set([TEXT]));
  });

  it('접으면 펼친 배치의 bpm 열 x=30·4박을 눌러도 BPM이 아니라 메인 레인 1을 눌러 이벤트 히트가 없다', () => {
    const { space } = editor();
    expect(space.hitTestEvent(BPM_COLUMN_X, yAt(4))).toBe(BPM_4);
    expect(space.xToTimingColumn(BPM_COLUMN_X)).toBe('bpm');
    store().setSongCommonCollapsed(true);
    expect(space.hitTestEvent(BPM_COLUMN_X, yAt(4))).toBeNull();
    expect(space.hitTestEventEnd(BPM_COLUMN_X, yAt(4))).toBeNull();
    expect(space.xToTimingColumn(BPM_COLUMN_X)).toBeNull();
    expect(space.xToLane(BPM_COLUMN_X)).toBe(1);
  });

  it('접힌 뒤에는 숨은 BPM을 selectEvent로 골라도 선택에 들어가지 않는다', () => {
    const { selectMode } = editor();
    store().setSongCommonCollapsed(true);
    selectMode.selectEvent(BPM_4);
    expect(store().selection.events).toEqual(new Set());
  });
});

describe('접힌 동안의 생성·삭제', () => {
  it('Create 모드로 접힌 배치의 x=30·6박을 누르면 BPM 없이 레인 1에 탭을 놓는다', () => {
    const { createMode } = editor();
    store().setMode('create');
    store().setSongCommonCollapsed(true);
    createMode.handlePointerDown({ x: BPM_COLUMN_X, y: yAt(6), shiftKey: false, altKey: false, toggleSelection: false });
    createMode.handlePointerUp({ x: BPM_COLUMN_X, y: yAt(6), shiftKey: false, altKey: false, toggleSelection: false });
    expect(store().chart.events).toHaveLength(5);
    expect(store().chart.notes.at(-1)).toMatchObject({ type: 'tap', lane: 1 });
  });

  it('Delete 모드로 접힌 배치의 x=30·4박을 눌러도 숨은 4박 BPM이 남는다', () => {
    const { deleteMode } = editor();
    store().setSongCommonCollapsed(true);
    deleteMode.onPointerDown(BPM_COLUMN_X, yAt(4));
    expect(store().chart.events).toHaveLength(5);
  });

  it('우클릭 삭제 gesture가 접힌 배치의 x=30·4박을 지나도 숨은 4박 BPM이 남고 2박 탭은 지워진다', () => {
    store().setSongCommonCollapsed(true);
    const erase = new EraseGesture({
      getLayout: layout,
      getChart: () => store().chart,
      getSelectedNotes: () => store().selection.notes,
      onChartUpdate: (chart, transaction) => store().setChart(chart, { transaction }),
      beginTransaction: onInterrupt => store().beginEditTransaction('erase', onInterrupt),
      commitTransaction: token => store().commitEditTransaction(token),
      cancelTransaction: token => store().cancelEditTransaction(token),
    });
    erase.begin();
    expect(erase.erase(BPM_COLUMN_X, 4)).toBe(false);
    expect(erase.erase(BPM_COLUMN_X, 2)).toBe(true);
    erase.finish();
    expect(store().chart.events).toHaveLength(5);
    expect(store().chart.notes).toEqual([]);
  });
});

describe('붙여넣기의 자동 펼침(RFD 0095 결정 2)', () => {
  it('4박 BPM을 복사하고 접은 뒤 16박에 붙이면 펼쳐지고 붙인 BPM이 선택되며 저장값 true는 그대로다', () => {
    const { selectMode } = editor();
    selectEvents(BPM_4);
    expect(selectMode.copy()).toBe(1);
    store().setSongCommonCollapsed(true);

    expect(selectMode.paste(beat(16))).toBe(1);

    expect(store().songCommonCollapsed).toBe(false);
    expect(store().selection.events).toEqual(new Set([5]));
    expect(stored.get(SONG_COMMON_COLLAPSED_STORAGE_KEY)).toBe('true');
  });

  it('8박 박자를 복사하고 접은 뒤 16박에 붙이면 펼쳐진다', () => {
    const { selectMode } = editor();
    selectEvents(SIGNATURE_8);
    selectMode.copy();
    store().setSongCommonCollapsed(true);
    selectMode.paste(beat(16));
    expect(store().songCommonCollapsed).toBe(false);
  });

  it('펼쳐서 붙인 BPM을 Undo해도 접히지 않고 다시 Redo해도 펼친 그대로다', () => {
    const { selectMode } = editor();
    selectEvents(BPM_4);
    selectMode.copy();
    store().setSongCommonCollapsed(true);
    selectMode.paste(beat(16));
    selectMode.confirmPlacement();
    store().undo();
    expect(store().chart.events).toHaveLength(5);
    expect(store().songCommonCollapsed).toBe(false);
    store().redo();
    expect(store().chart.events).toHaveLength(6);
    expect(store().songCommonCollapsed).toBe(false);
  });

  it('접은 채 BPM을 지운 편집을 Undo해 BPM이 돌아와도 펼쳐지지 않는다', () => {
    const { selectMode } = editor();
    selectEvents(BPM_4);
    selectMode.deleteSelected();
    store().setSongCommonCollapsed(true);
    store().undo();
    expect(store().chart.events).toHaveLength(5);
    expect(store().songCommonCollapsed).toBe(true);
  });

  it('text만 복사해 붙이면 접힌 그대로다', () => {
    const { selectMode } = editor();
    selectEvents(TEXT);
    selectMode.copy();
    store().setSongCommonCollapsed(true);
    selectMode.paste(beat(16));
    expect(store().songCommonCollapsed).toBe(true);
    expect(store().selection.events).toEqual(new Set([5]));
  });

  it('탭만 복사해 붙이면 접힌 그대로다', () => {
    const { selectMode } = editor();
    selectMode.selectNote(0);
    selectMode.copy();
    store().setSongCommonCollapsed(true);
    selectMode.paste(beat(16));
    expect(store().songCommonCollapsed).toBe(true);
  });

  it('BPM을 타임라인 범위 밖 100000박에 붙이면 붙여넣기가 실패하고 접힌 그대로다', () => {
    const { selectMode } = editor();
    selectEvents(BPM_4);
    selectMode.copy();
    store().setSongCommonCollapsed(true);
    expect(selectMode.paste(beat(100_000))).toBe(0);
    expect(store().songCommonCollapsed).toBe(true);
    expect(store().editTransaction).toBeNull();
  });

  it('4박 BPM을 초기 BPM이 있는 0박에 붙이면 거부되고 접힌 그대로다', () => {
    const { selectMode } = editor();
    selectEvents(BPM_4);
    selectMode.copy();
    store().setSongCommonCollapsed(true);
    expect(selectMode.paste(beat(0))).toBe(0);
    expect(store().songCommonCollapsed).toBe(true);
  });
});

describe('열린 조작 중의 접기', () => {
  it('붙여넣기 대기 중 접으면 그 자리로 확정하고 Undo 1번에 붙인 BPM이 사라지며 숨은 BPM은 선택에서 빠진다', () => {
    const { selectMode } = editor();
    selectEvents(BPM_4);
    selectMode.copy();
    selectMode.paste(beat(16));
    expect(selectMode.isPendingPaste).toBe(true);

    store().setSongCommonCollapsed(true);

    expect(selectMode.isPendingPaste).toBe(false);
    expect(store().editTransaction).toBeNull();
    expect(store().selection.events).toEqual(new Set());
    expect(store().historyPast).toHaveLength(1);
    store().undo();
    expect(store().chart.events).toHaveLength(5);
  });

  it('붙여넣기 대기 중 접은 뒤 화살표·Esc 처리가 숨은 BPM을 옮기거나 되돌리지 않는다', () => {
    const { selectMode } = editor();
    selectEvents(BPM_4);
    selectMode.copy();
    selectMode.paste(beat(16));
    store().setSongCommonCollapsed(true);

    selectMode.movePasteBySnap('up');
    selectMode.cancelPaste();

    expect(store().chart.events[5]).toMatchObject({ type: 'bpm', beat: beat(16) });
  });

  it('펼친 곡 공통 열에서 4박 BPM을 끌던 중 접으면 드래그가 끝나 이후 포인터 이동·뗌이 BPM을 옮기지 않는다', () => {
    const { selectMode } = editor();
    selectEvents(BPM_4);
    selectMode.beginMoveDrag(BPM_COLUMN_X, yAt(4));
    selectMode.onPointerMove(BPM_COLUMN_X, yAt(6));
    expect(beatToFloat(store().chart.events[BPM_4].beat)).toBe(6);

    store().setSongCommonCollapsed(true);
    expect(selectMode.isMoveDragging).toBe(false);

    selectMode.onPointerMove(BPM_COLUMN_X, yAt(10));
    selectMode.onPointerUp(BPM_COLUMN_X, yAt(10));
    expect(beatToFloat(store().chart.events[BPM_4].beat)).toBe(6);
    expect(store().historyPast).toHaveLength(1);
  });

  it('text 끝 리사이즈 중 접으면 리사이즈가 끝나 이후 이동이 끝 박을 바꾸지 않는다', () => {
    const { selectMode } = editor();
    selectEvents(TEXT);
    selectMode.onPointerDown(auxX(1), yAt(5), false, false);
    selectMode.onPointerMove(auxX(1), yAt(6));
    expect(textEndBeat()).toBe(6);

    store().setSongCommonCollapsed(true);
    selectMode.onPointerMove(auxX(1), yAt(7));

    expect(textEndBeat()).toBe(6);
  });

  it('박스 드래그 중 BPM 붙여넣기가 열어 둔 transaction을 박스 취소가 되돌리지 않는다', () => {
    const { selectMode } = editor();
    selectEvents(BPM_4);
    selectMode.copy();
    store().clearSelection();
    selectMode.onPointerDown(laneX(3), yAt(1), false, false);
    expect(selectMode.isBoxSelecting).toBe(true);

    selectMode.paste(beat(16));
    selectMode.cancel();

    expect(selectMode.isPendingPaste).toBe(true);
    expect(store().editTransaction).not.toBeNull();
    expect(store().chart.events).toHaveLength(6);
  });
});

describe('드래그 도중의 붙여넣기', () => {
  it('접힌 채 노트 이동 드래그 중 BPM을 붙여넣으면 열을 펼치고 붙여넣은 BPM을 고른다', () => {
    const { selectMode } = editor();
    selectEvents(BPM_4);
    selectMode.copy();
    store().setSongCommonCollapsed(true);
    selectMode.selectNote(0);
    selectMode.beginMoveDrag(laneX(1), yAt(2));
    selectMode.onPointerMove(laneX(1), yAt(3));

    expect(selectMode.paste(beat(16))).toBe(1);

    expect(store().chart.events.at(-1)).toMatchObject({ type: 'bpm', beat: beat(16) });
    expect(store().songCommonCollapsed).toBe(false);
    expect(store().selection.events).toEqual(new Set([5]));
  });

  it('트릴 구간을 고른 채 접고 박스 드래그 중 BPM을 붙여넣으면 박스 취소가 구간을 되살리지 않아 선택은 BPM뿐이다', () => {
    store().loadChart({ ...fixture(), trillZones: [{ lane: 2, beat: beat(10), endBeat: beat(12) }] });
    const { selectMode } = editor();
    selectEvents(BPM_4);
    selectMode.copy();
    store().setSongCommonCollapsed(true);
    selectMode.selectZoneUnit(0);
    selectMode.onPointerDown(laneX(3), yAt(1), false, false);
    expect(selectMode.isBoxSelecting).toBe(true);
    // App에서는 useCanvasEvents의 abandonPressedInteraction이 접힘 변화를 구독해 부른다.
    const unsubscribeAbandon = useEditorStore.subscribe((state, previous) => {
      if (state.songCommonCollapsed !== previous.songCommonCollapsed) selectMode.cancel();
    });

    selectMode.paste(beat(16));
    unsubscribeAbandon();

    expect(store().selection.zones.size).toBe(0);
    expect(store().selection.events).toEqual(new Set([5]));
  });

  it('박스 드래그 중 BPM을 붙여넣고 놓아도 붙여넣기 대기가 열려 있고 접으면 16박에 확정되어 ArrowUp이 움직이지 않는다', () => {
    const { selectMode } = editor();
    selectEvents(BPM_4);
    selectMode.copy();
    store().clearSelection();
    selectMode.onPointerDown(laneX(3), yAt(1), false, false);
    selectMode.paste(beat(16));

    selectMode.onPointerUp(laneX(3), yAt(2));
    expect(selectMode.isPendingPaste).toBe(true);
    expect(store().editTransaction).not.toBeNull();

    store().setSongCommonCollapsed(true);
    expect(selectMode.isPendingPaste).toBe(false);
    selectMode.movePasteBySnap('up');
    expect(beatToFloat(store().chart.events[5].beat)).toBe(16);
  });
});

describe('접은 뒤에도 공통 타이밍은 그대로 적용된다', () => {
  it('접어도 4박 BPM 180의 박→시각 변환이 같고 차트 이벤트 수가 5개다', () => {
    const chart = fixture();
    chart.events[BPM_4] = { type: 'bpm', beat: beat(4), bpm: 180 };
    store().loadChart(chart);
    const { space } = editor();
    const before = beatToMs(beat(8), space.getBpmChanges());
    store().setSongCommonCollapsed(true);
    expect(beatToMs(beat(8), space.getBpmChanges())).toBe(before);
    expect(store().chart.events).toHaveLength(5);
  });
});

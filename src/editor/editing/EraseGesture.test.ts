import { afterEach, describe, expect, it, vi } from 'vitest';
import { beat } from '../../shared';
import type { ChartDocument, DocumentNoteEntity } from '../../shared';
import { useEditorStore } from '../stores';
import { emptySelection } from '../stores/selectionSlice';
import { EraseGesture } from './EraseGesture';

vi.mock('../../shared/toast', () => ({ showToast: vi.fn() }));

const current = () => useEditorStore.getState();
const notes = () => current().chart.notes;
const chart = (source: DocumentNoteEntity[], extra: Partial<ChartDocument> = {}): ChartDocument => ({
  meta: { title: '삭제', artist: '', difficultyLabel: 'NORMAL', difficultyLevel: 1, imageFile: '', audioFile: '', previewAudioFile: '', offsetMs: 0 },
  notes: source,
  trillZones: [],
  events: [{ type: 'bpm', beat: beat(0), bpm: 120 }, { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(4) }],
  ...extra,
});

function setup(source: ChartDocument) {
  useEditorStore.setState({
    chart: source, mode: 'delete', selection: emptySelection(), extraLaneCount: 2,
    historyPast: [], historyFuture: [], historyLastCaptureAt: 0, editTransaction: null,
  });
  const warn = vi.fn();
  const erase = new EraseGesture({
    getChart: () => current().chart,
    getSelectedNotes: () => current().selection.notes,
    onChartUpdate: (value, transaction) => current().setChart(value, { transaction }),
    beginTransaction: onInterrupt => current().beginEditTransaction('erase', onInterrupt),
    commitTransaction: token => current().commitEditTransaction(token),
    cancelTransaction: token => current().cancelEditTransaction(token),
    onWarn: warn,
  });
  return { erase, warn };
}

afterEach(() => vi.clearAllMocks());

describe('EraseGesture 독립 명령 중단', () => {
  it('1박 삭제 뒤 token 없는 편집이 transaction을 확정하면 같은 누름의 2박 삭제는 시도하지 않는다', () => {
    const point = (at: number): DocumentNoteEntity => ({ type: 'point', kind: 'single', lane: 1, beat: beat(at) });
    const { erase } = setup(chart([point(1), point(2), point(3)]));
    erase.begin(); expect(erase.erase(1, 1)).toBe(true);
    current().setChart({ ...current().chart, notes: [...notes(), point(9)] });

    expect(erase.erase(1, 2)).toBe(false);
    erase.finish();
    expect(notes().map(note => note.beat)).toEqual([beat(2), beat(3), beat(9)]);
  });
});

describe('Delete 모드 터치 삭제의 구간 삭제', () => {
  const zoneAt1to4 = { lane: 1 as const, beat: beat(1), endBeat: beat(4) };

  it('빈 1～4박 trillZone의 2박을 탭하면 같은 transaction에서 구간을 지우고 Undo 1번에 돌아온다', () => {
    const initial = chart([], { trillZones: [zoneAt1to4] });
    const { erase } = setup(initial);
    erase.begin(); expect(erase.eraseAt(1, 2)).toBe(true); erase.finish();

    expect(current().chart.trillZones).toEqual([]);
    expect(current().historyPast).toHaveLength(1);
    current().undo(); expect(current().chart).toEqual(initial);
  });

  it('3박 트릴 Point가 든 1～4박 trillZone의 2박을 탭하면 구간을 지우지 않고 경고한다', () => {
    const initial = chart([{ type: 'point', kind: 'trill', lane: 1, beat: beat(3) }], { trillZones: [zoneAt1to4] });
    const { erase, warn } = setup(initial);
    erase.begin(); expect(erase.eraseAt(1, 2)).toBe(false); erase.finish();

    expect(current().chart).toBe(initial);
    expect(warn).toHaveBeenCalledWith('Zone contains notes — remove them first');
  });

  it('1～4박 restZone의 2박을 탭하면 restZone을 지운다', () => {
    const { erase } = setup(chart([], { restZones: [zoneAt1to4] }));
    erase.begin(); expect(erase.eraseAt(1, 2)).toBe(true); erase.finish();

    expect(current().chart.restZones).toEqual([]);
  });

  it('유지 표식을 뺀 선택 바디처럼 삭제가 막힌 노트 아래 2박 restZone은 대신 지우지 않는다', () => {
    const body: DocumentNoteEntity = { type: 'body', lane: 1, beat: beat(1), endBeat: beat(3), holdCount: 1 };
    const sustain: DocumentNoteEntity = { type: 'sustain', lane: 1, beat: beat(2.5), count: 1 };
    const initial = chart([body, sustain], { restZones: [zoneAt1to4] });
    const { erase, warn } = setup(initial);
    useEditorStore.setState({ selection: { notes: new Set([0]), zones: new Set(), restZones: new Set() } });
    erase.begin(); expect(erase.eraseAt(1, 2)).toBe(false); erase.finish();

    expect(current().chart).toBe(initial);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('Esc로 취소한 누름은 같은 누름의 2박 탭으로 빈 trillZone을 지우지 않는다', () => {
    const initial = chart([], { trillZones: [zoneAt1to4] });
    const { erase } = setup(initial);
    erase.begin(); erase.cancel(); expect(erase.eraseAt(1, 2)).toBe(false); erase.finish();

    expect(current().chart).toBe(initial);
  });
});

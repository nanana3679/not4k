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

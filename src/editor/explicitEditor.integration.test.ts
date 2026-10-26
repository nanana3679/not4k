import { beforeEach, describe, expect, it, vi } from 'vitest';
import { beat, serializeChart, serializeExtraNotes, mainNotes, auxNotesAsExtra } from '../shared';
import type { ChartDocument } from '../shared';
import { useEditorStore } from './stores';
import { CreateMode } from './modes/CreateMode';
import { ClipboardManager } from './modes/ClipboardManager';
import { makeFakeSpace } from './timeline/makeFakeSpace';
import { loadEditorChartAsset } from './chartAssetLoad';
import { editorChartErrors, editorChartViolationIndices } from './documentValidation';
import { hiddenViolationLanes } from './stores/unifiedNotes';

const seed = (): ChartDocument => ({
  meta: { title: '혼합 수리', artist: '작곡', difficultyLabel: 'NORMAL', difficultyLevel: 5, imageFile: 'j.png', audioFile: 'a.wav', previewAudioFile: '', offsetMs: -20 },
  notes: [
    { type: 'single', lane: 4, beat: beat(8), grace: false },
    { type: 'long', lane: 4, beat: beat(8), endBeat: beat(10), holdOnly: true },
    { type: 'double', lane: 7, beat: beat(12), grace: false },
  ], trillZones: [], restZones: [],
  events: [{ type: 'bpm', beat: beat(0), bpm: 120, editorLane: 1 }, { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(4), editorLane: 2 }],
});

function snapshots(chart = useEditorStore.getState().chart) {
  return {
    main: serializeChart({ ...chart, notes: mainNotes(chart.notes) }),
    aux: serializeExtraNotes(auxNotesAsExtra(chart.notes), useEditorStore.getState().extraLaneCount),
  };
}

function create(lane = 1) {
  return new CreateMode(useEditorStore.getState().chart, {
    onChartUpdate: chart => useEditorStore.getState().setChart(chart, { separateHistory: true }),
    space: makeFakeSpace({ xToUnifiedLane: () => lane, ...(lane > 4 ? { xToLane: () => null, xToExtraLane: () => lane - 4 } : {}) }),
    isTimeInBounds: () => true,
  });
}

describe('명시 노트의 실제 store·history·파일 경계', () => {
  beforeEach(() => {
    const store = useEditorStore.getState();
    store.loadChart(seed()); store.setExtraLaneCount(4); store.resetHistory();
  });

  it('Grace 더블 0→4박 생성 취소는 history를 남기지 않고 생성·Undo·Redo는 세 항목을 함께 복구한다', () => {
    const initial = snapshots(); const mode = create(); mode.entityType = 'double'; mode.graceMode = true;
    mode.onPointerDown(1, 0); mode.cancelDrag(); mode.onPointerUp(1, 4);
    expect(snapshots()).toEqual(initial);
    expect(useEditorStore.getState().historyPast).toHaveLength(0);
    mode.onPointerDown(1, 0); mode.onPointerUp(1, 4);
    const made = snapshots();
    expect(made.main).not.toBe(initial.main);
    expect(made.aux).toBe(initial.aux);
    expect(useEditorStore.getState().historyPast).toHaveLength(1);
    expect(useEditorStore.getState().chart.notes.slice(-3)).toEqual([
      { type: 'point', kind: 'double', lane: 1, beat: beat(0), grace: true },
      { type: 'body', holdCount: 2, lane: 1, beat: beat(0), endBeat: beat(4) },
      { type: 'release', count: 2, lane: 1, beat: beat(4), grace: true },
    ]);
    useEditorStore.getState().undo(); expect(snapshots()).toEqual(initial);
    useEditorStore.getState().redo(); expect(snapshots()).toEqual(made);
  });

  it('600ms 안의 Point 생성과 빈 aux 유지 생성은 각각 Undo하며 더블 재클릭 no-op은 history를 추가하지 않는다', () => {
    const point = create(); point.onPointerDown(1, 0); point.onPointerUp(1, 0);
    const afterPoint = snapshots();
    const sustain = create(7); sustain.entityType = 'sustain'; sustain.onPointerDown(7, 2);
    const afterSingle = snapshots(); sustain.onPointerDown(7, 2);
    const count = useEditorStore.getState().historyPast.length;
    sustain.onPointerDown(7, 2);
    expect(useEditorStore.getState().historyPast).toHaveLength(count);
    useEditorStore.getState().undo(); expect(snapshots()).toEqual(afterSingle);
    useEditorStore.getState().undo(); expect(snapshots()).toEqual(afterPoint);
    expect(useEditorStore.getState().extraLaneCount).toBe(4);
  });

  it('구형 main+신형 aux의 독립 v3/v4 저장을 두 번 왕복하면 Grace false·holdOnly·수량·메타·이벤트·dirty 기준이 같다', () => {
    const mode = create(7); mode.entityType = 'doubleRelease'; mode.graceMode = true; mode.onPointerDown(7, 2);
    const saved = snapshots();
    expect(JSON.parse(saved.main).version).toBe(3); expect(JSON.parse(saved.aux).version).toBe(4);
    for (let i = 0; i < 2; i++) {
      const loaded = loadEditorChartAsset(saved.main, saved.aux);
      useEditorStore.getState().loadChart(loaded.chart); useEditorStore.getState().setExtraLaneCount(loaded.extraLaneCount);
      expect(snapshots()).toEqual(saved); expect(loaded.extraLaneCount).toBe(4);
      expect(loaded.chart.meta).toEqual(seed().meta); expect(loaded.chart.events).toEqual(seed().events);
    }
    expect(useEditorStore.getState().chart.notes).toEqual([
      ...seed().notes, { type: 'release', count: 2, lane: 7, beat: beat(2), grace: true },
    ]);
  });

  it('유효한 혼합 문서의 신형 Point·바디·릴리즈를 복사해 16박에 붙이고 취소하면 Grace·수량·바디 길이와 원본을 복구한다', () => {
    const mode = create(); mode.entityType = 'double'; mode.graceMode = true; mode.onPointerDown(1, 0); mode.onPointerUp(1, 4);
    const source = useEditorStore.getState().chart;
    const clipboard = new ClipboardManager();
    expect(clipboard.copy(source, new Set([3, 4, 5]))).toBe(3);
    const result = clipboard.paste(source, beat(16), {
      space: makeFakeSpace(), onChartUpdate: vi.fn(), getExtraLaneCount: () => 4,
    }, () => {});
    expect(result).not.toBeNull();
    expect(clipboard.cancelPaste(result!.chart, { onChartUpdate: vi.fn() }, () => {})).toEqual(source);
    expect(result?.chart.notes.slice(-3)).toEqual(source.notes.slice(-3).map(note => ({ ...note, beat: beat(note.beat.n + 16), ...('endBeat' in note ? { endBeat: beat(note.endBeat.n + 16) } : {}) })));
  });

  it('숨은 lane7의 바디 밖 sustain은 로드·의미 위반 확정·Undo가 가능하고 원본 index의 overlay와 숨은 레인 진단을 만든다', () => {
    const invalid = { ...seed(), notes: [...seed().notes, { type: 'sustain' as const, count: 1 as const, lane: 7, beat: beat(2) }] };
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    useEditorStore.getState().loadChart(invalid); useEditorStore.getState().setExtraLaneCount(2);
    useEditorStore.getState().resetHistory();
    const moved = { ...invalid, notes: invalid.notes.map((note, index) => index === 3 ? { ...note, beat: beat(3) } : note) };
    useEditorStore.getState().setChart(moved);
    expect(useEditorStore.getState().chart).toBe(moved);
    const errors = editorChartErrors(moved);
    expect(errors).toContainEqual(expect.objectContaining({ rule: 'sustainPlacement', refs: [{ kind: 'note', index: 3 }] }));
    expect(editorChartViolationIndices(moved).notes).toEqual(new Set([3]));
    expect(hiddenViolationLanes(errors, moved.notes, 2)).toEqual([7]);
    useEditorStore.getState().undo(); expect(useEditorStore.getState().chart).toEqual(invalid);
    warn.mockRestore();
  });
});

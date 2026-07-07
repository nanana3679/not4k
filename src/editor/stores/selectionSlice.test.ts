import { beforeEach, describe, expect, it } from 'vitest';
import {
  emptySelection,
  normalizeSelection,
  zoneContainedNoteIndices,
  type Selection,
} from './selectionSlice';
import { useEditorStore } from './editorStore';
import { beat } from '../../shared';
import type { Chart, ExtraNoteEntity, NoteEntity, TrillZone } from '../../shared';

// ---------------------------------------------------------------------------
// 픽스처: zoneA(lane1, 0~2), zoneB(lane2, 4~6)
//   0: single lane3 (일반)
//   1: trill  lane1 beat1        — zoneA 포함
//   2: trill  lane2 beat5        — zoneB 포함
//   3: single lane4 (일반)
//   4: trillLong lane1 beat0~2   — zoneA 포함(경계 일치)
// ---------------------------------------------------------------------------

const zoneA: TrillZone = { lane: 1, beat: beat(0), endBeat: beat(2) };
const zoneB: TrillZone = { lane: 2, beat: beat(4), endBeat: beat(6) };

const notes: NoteEntity[] = [
  { type: 'single', lane: 3, beat: beat(0) },
  { type: 'trill', lane: 1, beat: beat(1) },
  { type: 'trill', lane: 2, beat: beat(5) },
  { type: 'single', lane: 4, beat: beat(1) },
  { type: 'trillLong', lane: 1, beat: beat(0), endBeat: beat(2) },
];

const chart: Pick<Chart, 'notes' | 'trillZones'> = {
  notes,
  trillZones: [zoneA, zoneB],
};

const extraNotes: ExtraNoteEntity[] = [
  { type: 'single', extraLane: 1, beat: beat(0) },
  { type: 'single', extraLane: 2, beat: beat(1) },
];

function sel(input: Partial<Selection>): Selection {
  return { ...emptySelection(), ...input };
}

// ---------------------------------------------------------------------------
// normalizeSelection — 정규화 게이트 (순수)
// ---------------------------------------------------------------------------

describe('normalizeSelection — 동질성 정규화', () => {
  it('일반 노트만 고르면 그대로 유지된다({0,3} → {0,3})', () => {
    const result = normalizeSelection(sel({ notes: new Set([0, 3]) }), chart, extraNotes);
    expect(result.notes).toEqual(new Set([0, 3]));
  });

  it('일반(0)과 트릴(1)이 섞이면 최소 인덱스 종류인 일반만 남는다({0,1} → {0})', () => {
    const result = normalizeSelection(sel({ notes: new Set([0, 1]) }), chart, extraNotes);
    expect(result.notes).toEqual(new Set([0]));
  });

  it('서로 다른 구간의 트릴(1: zoneA, 2: zoneB)이 섞이면 최소 인덱스 구간만 남는다({1,2} → {1})', () => {
    const result = normalizeSelection(sel({ notes: new Set([1, 2]) }), chart, extraNotes);
    expect(result.notes).toEqual(new Set([1]));
  });

  it('같은 구간(zoneA)의 트릴 노트 {1,4}는 함께 유지된다', () => {
    const result = normalizeSelection(sel({ notes: new Set([1, 4]) }), chart, extraNotes);
    expect(result.notes).toEqual(new Set([1, 4]));
  });
});

describe('normalizeSelection — 범위 보정', () => {
  it('notes 5개에서 범위 밖 인덱스 7과 음수 -1은 제거된다({0,7,-1} → {0})', () => {
    const result = normalizeSelection(sel({ notes: new Set([0, 7, -1]) }), chart, extraNotes);
    expect(result.notes).toEqual(new Set([0]));
  });

  it('extraNotes 2개에서 범위 밖 인덱스 5는 제거된다({0,5} → {0})', () => {
    const result = normalizeSelection(sel({ extraNotes: new Set([0, 5]) }), chart, extraNotes);
    expect(result.extraNotes).toEqual(new Set([0]));
  });

  it('범위 밖 zone 인덱스(5)는 zones에서 제거되고 notes {0,3}은 유지된다', () => {
    const result = normalizeSelection(
      sel({ notes: new Set([0, 3]), zones: new Set([5]) }),
      chart,
      extraNotes,
    );
    expect(result.zones).toEqual(new Set());
    expect(result.notes).toEqual(new Set([0, 3]));
  });
});

describe('normalizeSelection — 구간 유닛 공존 (RFD 0016)', () => {
  it('zones={0}이어도 notes에 내부 노트를 주입하지 않는다(notes 빈 집합 유지)', () => {
    const result = normalizeSelection(sel({ zones: new Set([0]) }), chart, extraNotes);
    expect(result.zones).toEqual(new Set([0]));
    expect(result.notes).toEqual(new Set());
  });

  it('일반 notes {0,3}과 zones {0}은 공존한다', () => {
    const result = normalizeSelection(
      sel({ notes: new Set([0, 3]), zones: new Set([0]) }),
      chart,
      extraNotes,
    );
    expect(result.notes).toEqual(new Set([0, 3]));
    expect(result.zones).toEqual(new Set([0]));
  });

  it('트릴 노트 {1}이 선택되면 zones {1}은 비워진다(개별 트릴 모드는 구간 유닛과 배타)', () => {
    const result = normalizeSelection(
      sel({ notes: new Set([1]), zones: new Set([1]) }),
      chart,
      extraNotes,
    );
    expect(result.notes).toEqual(new Set([1]));
    expect(result.zones).toEqual(new Set());
  });

  it('zones {0}과 extraNotes {0}은 공존한다(extra를 비우지 않음)', () => {
    const result = normalizeSelection(
      sel({ extraNotes: new Set([0]), zones: new Set([0]) }),
      chart,
      extraNotes,
    );
    expect(result.zones).toEqual(new Set([0]));
    expect(result.extraNotes).toEqual(new Set([0]));
  });
});

describe('zoneContainedNoteIndices — 실행 시점 파생 규칙 (RFD 0016 §4.2)', () => {
  it('구간과 부분만 겹치는 노트는 파생에 포함되지 않는다(포함 기준, 겹침 아님)', () => {
    // trillLong 1~3: zoneA(0~2)와 겹치지만 끝(3)이 구간 밖 → 제외
    const partialNotes: NoteEntity[] = [
      { type: 'trillLong', lane: 1, beat: beat(1), endBeat: beat(3) },
    ];
    expect(zoneContainedNoteIndices(partialNotes, zoneA)).toEqual(new Set());
  });

  it('구간 경계와 정확히 일치하는 노트(beat 0~2)는 파생에 포함된다', () => {
    expect(zoneContainedNoteIndices(notes, zoneA)).toEqual(new Set([1, 4]));
  });
});

// ---------------------------------------------------------------------------
// SelectionSlice 액션 — store 경유
// ---------------------------------------------------------------------------

function resetSelectionStore() {
  useEditorStore.setState({
    selection: emptySelection(),
    chart: { ...useEditorStore.getState().chart, notes, trillZones: [zoneA, zoneB] },
    extraNotes,
    historyPast: [],
    historyFuture: [],
    historyLastCaptureAt: 0,
  });
}

/** 변이 게이트(validateChart)를 통과하는 유효한 전체 차트를 만든다. */
function makeFullChart(chartNotes: NoteEntity[]): Chart {
  return {
    meta: {
      title: 'Test',
      artist: '',
      difficultyLabel: 'NORMAL',
      difficultyLevel: 1,
      imageFile: '',
      audioFile: '',
      previewAudioFile: '',
      offsetMs: 0,
    },
    notes: chartNotes,
    trillZones: [],
    events: [
      { type: 'bpm', beat: beat(0, 1), bpm: 120, editorLane: 1 },
      { type: 'timeSignature', beat: beat(0, 1), beatPerMeasure: beat(4, 1), editorLane: 2 },
    ],
  };
}

const singles: NoteEntity[] = [
  { type: 'single', lane: 1, beat: beat(0) },
  { type: 'single', lane: 2, beat: beat(1) },
  { type: 'single', lane: 3, beat: beat(2) },
];

beforeEach(resetSelectionStore);

describe('SelectionSlice 액션', () => {
  it('setSelection: 일반+트릴 섞인 입력이 게이트를 지나 일반 그룹 {0,3}만 store에 남는다', () => {
    useEditorStore.getState().setSelection(sel({ notes: new Set([0, 1, 3]) }));
    expect(useEditorStore.getState().selection.notes).toEqual(new Set([0, 3]));
  });

  it('setSelection: zones={1}은 유지되고 내부 트릴 노트는 notes에 주입되지 않는다', () => {
    useEditorStore.getState().setSelection(sel({ zones: new Set([1]) }));
    const { selection } = useEditorStore.getState();
    expect(selection.notes).toEqual(new Set());
    expect(selection.zones).toEqual(new Set([1]));
  });

  it('clearSelection: 세 집합이 모두 빈 선택이 된다', () => {
    useEditorStore.getState().setSelection(sel({ notes: new Set([0]), extraNotes: new Set([1]) }));
    useEditorStore.getState().clearSelection();
    expect(useEditorStore.getState().selection).toEqual(emptySelection());
  });

  it('clearExtraSelection: notes {0,3}은 유지되고 extraNotes만 비워진다', () => {
    useEditorStore.getState().setSelection(
      sel({ notes: new Set([0, 3]), extraNotes: new Set([0, 1]) }),
    );
    useEditorStore.getState().clearExtraSelection();
    const { selection } = useEditorStore.getState();
    expect(selection.notes).toEqual(new Set([0, 3]));
    expect(selection.extraNotes).toEqual(new Set());
  });
});

// ---------------------------------------------------------------------------
// 변이 액션의 선택 보정 — 차트·선택의 관계 불변은 변이와 같은 트랜잭션에서 지킨다
// ---------------------------------------------------------------------------

describe('변이 액션의 선택 보정', () => {
  it('setChart: 노트 3→2개로 줄면 범위 밖 선택 인덱스 2가 같은 트랜잭션에서 제거된다', () => {
    useEditorStore.setState({ chart: makeFullChart(singles), extraNotes: [] });
    useEditorStore.getState().setSelection(sel({ notes: new Set([0, 1, 2]) }));
    useEditorStore.getState().setChart(makeFullChart(singles.slice(0, 2)));
    expect(useEditorStore.getState().selection.notes).toEqual(new Set([0, 1]));
  });

  it('setChart: 선택이 여전히 유효하면 selection 참조가 유지된다(불필요한 통지 없음)', () => {
    useEditorStore.setState({ chart: makeFullChart(singles), extraNotes: [] });
    useEditorStore.getState().setSelection(sel({ notes: new Set([0]) }));
    const before = useEditorStore.getState().selection;
    useEditorStore.getState().setChart(makeFullChart(singles));
    expect(useEditorStore.getState().selection).toBe(before);
  });

  it('undo: 편집을 undo하면 선택이 zones 포함 전체 clear된다', () => {
    useEditorStore.setState({ chart: makeFullChart(singles.slice(0, 2)), extraNotes: [] });
    useEditorStore.getState().setChart(makeFullChart(singles)); // 히스토리 캡처
    useEditorStore.getState().setSelection(sel({ notes: new Set([0, 1]) }));
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().selection).toEqual(emptySelection());
  });

  it('setExtraNotes: 엑스트라 2→1개로 줄면 범위 밖 엑스트라 선택 인덱스 1이 제거된다', () => {
    useEditorStore.getState().setSelection(sel({ extraNotes: new Set([0, 1]) }));
    useEditorStore.getState().setExtraNotes(extraNotes.slice(0, 1));
    expect(useEditorStore.getState().selection.extraNotes).toEqual(new Set([0]));
  });

  it('loadChart: 다른 차트를 열면 선택이 전부 비워진다', () => {
    useEditorStore.getState().setSelection(sel({ notes: new Set([0, 3]) }));
    useEditorStore.getState().loadChart(makeFullChart(singles));
    expect(useEditorStore.getState().selection).toEqual(emptySelection());
  });
});

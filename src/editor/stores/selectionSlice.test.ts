import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from './editorStore';
import {
  createSelectionSlice,
  emptySelection,
  normalizeSelection,
  selectionEquals,
  zoneContainedNoteIndices,
  type Selection,
  type SelectionSlice,
} from './selectionSlice';
import { beat } from '../../shared';
import type { Chart, NoteEntity, TrillZone } from '../../shared';

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

// 보조 노트는 chart.notes(정규형 [...main, ...aux])의 lane 5+로 산다 (RFD 0018 ③).
// selection.extraNotes 인덱스는 이 aux 서브배열(여기선 인덱스 0·1)을 가리킨다.
const auxNotesFixture: NoteEntity[] = [
  { type: 'single', lane: 5, beat: beat(0) },
  { type: 'single', lane: 6, beat: beat(1) },
];
const notesWithAux: NoteEntity[] = [...notes, ...auxNotesFixture];

const chart: Pick<Chart, 'notes' | 'trillZones'> = {
  notes: notesWithAux,
  trillZones: [zoneA, zoneB],
};

function sel(input: Partial<Selection>): Selection {
  return { ...emptySelection(), ...input };
}

// ---------------------------------------------------------------------------
// normalizeSelection — 정규화 게이트 (순수)
// ---------------------------------------------------------------------------

describe('normalizeSelection — 동질성 정규화', () => {
  it('일반 노트만 고르면 그대로 유지된다({0,3} → {0,3})', () => {
    const result = normalizeSelection(sel({ notes: new Set([0, 3]) }), chart);
    expect(result.notes).toEqual(new Set([0, 3]));
  });

  it('일반(0)과 트릴(1)이 섞이면 최소 인덱스 종류인 일반만 남는다({0,1} → {0})', () => {
    const result = normalizeSelection(sel({ notes: new Set([0, 1]) }), chart);
    expect(result.notes).toEqual(new Set([0]));
  });

  it('서로 다른 구간의 트릴(1: zoneA, 2: zoneB)이 섞이면 최소 인덱스 구간만 남는다({1,2} → {1})', () => {
    const result = normalizeSelection(sel({ notes: new Set([1, 2]) }), chart);
    expect(result.notes).toEqual(new Set([1]));
  });

  it('같은 구간(zoneA)의 트릴 노트 {1,4}는 함께 유지된다', () => {
    const result = normalizeSelection(sel({ notes: new Set([1, 4]) }), chart);
    expect(result.notes).toEqual(new Set([1, 4]));
  });
});

describe('normalizeSelection — 범위 보정', () => {
  it('notes 5개에서 범위 밖 인덱스 7과 음수 -1은 제거된다({0,7,-1} → {0})', () => {
    const result = normalizeSelection(sel({ notes: new Set([0, 7, -1]) }), chart);
    expect(result.notes).toEqual(new Set([0]));
  });

  it('extraNotes 2개에서 범위 밖 인덱스 5는 제거된다({0,5} → {0})', () => {
    const result = normalizeSelection(sel({ extraNotes: new Set([0, 5]) }), chart);
    expect(result.extraNotes).toEqual(new Set([0]));
  });

  it('범위 밖 zone 인덱스(5)는 zones에서 제거되고 notes {0,3}은 유지된다', () => {
    const result = normalizeSelection(
      sel({ notes: new Set([0, 3]), zones: new Set([5]) }),
      chart,
    );
    expect(result.zones).toEqual(new Set());
    expect(result.notes).toEqual(new Set([0, 3]));
  });
});

describe('normalizeSelection — 구간 유닛 공존 (RFD 0016)', () => {
  it('zones={0}이어도 notes에 내부 노트를 주입하지 않는다(notes 빈 집합 유지)', () => {
    const result = normalizeSelection(sel({ zones: new Set([0]) }), chart);
    expect(result.zones).toEqual(new Set([0]));
    expect(result.notes).toEqual(new Set());
  });

  it('일반 notes {0,3}과 zones {0}은 공존한다', () => {
    const result = normalizeSelection(
      sel({ notes: new Set([0, 3]), zones: new Set([0]) }),
      chart,
    );
    expect(result.notes).toEqual(new Set([0, 3]));
    expect(result.zones).toEqual(new Set([0]));
  });

  it('트릴 노트 {1}이 선택되면 zones {1}은 비워진다(개별 트릴 모드는 구간 유닛과 배타)', () => {
    const result = normalizeSelection(
      sel({ notes: new Set([1]), zones: new Set([1]) }),
      chart,
    );
    expect(result.notes).toEqual(new Set([1]));
    expect(result.zones).toEqual(new Set());
  });

  it('zones {0}과 extraNotes {0}은 공존한다(extra를 비우지 않음)', () => {
    const result = normalizeSelection(
      sel({ extraNotes: new Set([0]), zones: new Set([0]) }),
      chart,
    );
    expect(result.zones).toEqual(new Set([0]));
    expect(result.extraNotes).toEqual(new Set([0]));
  });
});

describe('selectionEquals', () => {
  it('세 집합이 원소 단위로 같으면 true (참조 달라도)', () => {
    const a = sel({ notes: new Set([0, 3]), zones: new Set([1]) });
    const b = sel({ notes: new Set([3, 0]), zones: new Set([1]) });
    expect(selectionEquals(a, b)).toBe(true);
  });

  it('한 집합이라도 다르면 false (extraNotes {0} vs {1})', () => {
    const a = sel({ extraNotes: new Set([0]) });
    const b = sel({ extraNotes: new Set([1]) });
    expect(selectionEquals(a, b)).toBe(false);
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
// createSelectionSlice — fake set/get 하네스 단위 검증.
// editorStore 합성(다음 슬라이스) 전이므로 store 경유가 아니라 슬라이스 계약만 본다.
// 합성 후에는 setChart 선택 보정·undo clear 등 store 경유 테스트가 추가된다.
// ---------------------------------------------------------------------------

type HarnessState = SelectionSlice & { chart: Chart };

function makeSliceHarness() {
  let state: HarnessState;
  const set = (
    partial: Partial<SelectionSlice> | ((s: SelectionSlice) => Partial<SelectionSlice>),
  ) => {
    const patch = typeof partial === 'function' ? partial(state) : partial;
    state = { ...state, ...patch };
  };
  const get = () => state;
  const slice = createSelectionSlice(set, get);
  // §3-5 게이트가 validateChart를 읽으므로 events까지 채운다 (meta는 게이트가 안 읽어 생략)
  state = { chart: { ...chart, events: [] } as unknown as Chart, ...slice };
  return { getState: () => state };
}

describe('createSelectionSlice 액션 (fake store)', () => {
  it('setSelection: 일반+트릴 섞인 입력이 게이트를 지나 일반 그룹 {0,3}만 남는다', () => {
    const h = makeSliceHarness();
    h.getState().setSelection(sel({ notes: new Set([0, 1, 3]) }));
    expect(h.getState().selection.notes).toEqual(new Set([0, 3]));
  });

  it('setSelection: zones={1}은 유지되고 내부 트릴 노트는 notes에 주입되지 않는다', () => {
    const h = makeSliceHarness();
    h.getState().setSelection(sel({ zones: new Set([1]) }));
    expect(h.getState().selection.notes).toEqual(new Set());
    expect(h.getState().selection.zones).toEqual(new Set([1]));
  });

  it('clearSelection: 세 집합이 모두 빈 선택이 된다', () => {
    const h = makeSliceHarness();
    h.getState().setSelection(sel({ notes: new Set([0]), extraNotes: new Set([1]) }));
    h.getState().clearSelection();
    expect(h.getState().selection).toEqual(emptySelection());
  });

  it('clearExtraSelection: notes {0,3}은 유지되고 extraNotes만 비워진다', () => {
    const h = makeSliceHarness();
    h.getState().setSelection(sel({ notes: new Set([0, 3]), extraNotes: new Set([0, 1]) }));
    h.getState().clearExtraSelection();
    expect(h.getState().selection.notes).toEqual(new Set([0, 3]));
    expect(h.getState().selection.extraNotes).toEqual(new Set());
  });
});

// ---------------------------------------------------------------------------
// editorStore 합성 후 — 변이 액션의 선택 보정 (PR #90 이식)
// 차트·선택의 관계 불변은 변이와 같은 트랜잭션에서 지킨다
// ---------------------------------------------------------------------------

function resetSelectionStore() {
  useEditorStore.setState({
    selection: emptySelection(),
    chart: { ...useEditorStore.getState().chart, notes: notesWithAux, trillZones: [zoneA, zoneB] },
    historyPast: [],
    historyFuture: [],
    historyLastCaptureAt: 0,
  });
}

/** 변이 게이트를 통과하는 유효한 전체 차트를 만든다. */
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

describe('SelectionSlice 액션 (editorStore 경유)', () => {
  beforeEach(resetSelectionStore);

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

describe('변이 액션의 선택 보정', () => {
  beforeEach(resetSelectionStore);

  it('setChart: 노트 3→2개 축소 커밋이면 선택이 같은 트랜잭션에서 전부 비워진다 (인덱스 밀림 방지, §3-5 면제 경로)', () => {
    useEditorStore.setState({ chart: makeFullChart(singles) });
    useEditorStore.getState().setSelection(sel({ notes: new Set([0, 1, 2]) }));
    useEditorStore.getState().setChart(makeFullChart(singles.slice(0, 2)));
    expect(useEditorStore.getState().selection).toEqual(emptySelection());
  });

  it('setChart: 선택이 여전히 유효하면 selection 참조가 유지된다(불필요한 통지 없음)', () => {
    useEditorStore.setState({ chart: makeFullChart(singles) });
    useEditorStore.getState().setSelection(sel({ notes: new Set([0]) }));
    const before = useEditorStore.getState().selection;
    useEditorStore.getState().setChart(makeFullChart(singles));
    expect(useEditorStore.getState().selection).toBe(before);
  });

  it('undo: 편집을 undo하면 선택이 zones 포함 전체 clear된다', () => {
    useEditorStore.setState({ chart: makeFullChart(singles.slice(0, 2)) });
    useEditorStore.getState().setChart(makeFullChart(singles)); // 히스토리 캡처
    useEditorStore.getState().setSelection(sel({ notes: new Set([0, 1]) }));
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().selection).toEqual(emptySelection());
  });

  it('보조 노트 삭제(chart.notes 개수 감소)는 setChart 경유라 선택이 전체 비워진다 — RFD 0018 ③ (B)(a) 수용', () => {
    useEditorStore.getState().setSelection(sel({ extraNotes: new Set([0, 1]) }));
    // 보조 노트 1개를 지운 차트 커밋(7→6개) — 인덱스 밀림 방지로 선택 전체 clear(메인·보조·존)
    useEditorStore.getState().setChart({
      ...useEditorStore.getState().chart,
      notes: [...notes, auxNotesFixture[0]],
    });
    expect(useEditorStore.getState().selection).toEqual(emptySelection());
  });

  it('loadChart: 다른 차트를 열면 선택이 전부 비워진다', () => {
    useEditorStore.getState().setSelection(sel({ notes: new Set([0, 3]) }));
    useEditorStore.getState().loadChart(makeFullChart(singles));
    expect(useEditorStore.getState().selection).toEqual(emptySelection());
  });

  it('의미 위반(중복) 차트 커밋도 선택 보정과 같은 트랜잭션 — 낙관 커밋(RFD 0017)과 공존', () => {
    // #90(전체 거부)과 달리 현행 setChart는 구조만 거부한다 — 의미 위반 커밋에서도 선택이 유지되는지.
    useEditorStore.setState({ chart: makeFullChart(singles) });
    useEditorStore.getState().setSelection(sel({ notes: new Set([0, 1, 2]) }));
    const dupChart = makeFullChart([
      { type: 'single', lane: 1, beat: beat(0) },
      { type: 'single', lane: 1, beat: beat(0) }, // 중복(의미) — 낙관 커밋됨 (개수 불변 = 이동 커밋 모사)
      { type: 'single', lane: 2, beat: beat(2) },
    ]);
    useEditorStore.getState().setChart(dupChart);
    expect(useEditorStore.getState().chart.notes).toHaveLength(3); // 커밋됨
    expect(useEditorStore.getState().selection.notes).toEqual(new Set([0, 1, 2])); // 선택 유지
  });
});

// ---------------------------------------------------------------------------
// 선택 해제 게이트 (RFD 0017 §3-5) — removed = 현재 − 다음, 위반 관여 노트가 있으면 거부
// ---------------------------------------------------------------------------

describe('선택 해제 게이트 (RFD 0017 §3-5)', () => {
  // 노트 0·1이 같은 레인·박 중복(의미 위반), 노트 2는 무관
  const dupNotes: NoteEntity[] = [
    { type: 'single', lane: 1, beat: beat(0) },
    { type: 'single', lane: 1, beat: beat(0) },
    { type: 'single', lane: 2, beat: beat(2) },
  ];

  function resetWithDupChart() {
    useEditorStore.setState({
      chart: makeFullChart(dupNotes),
      selection: emptySelection(),
      historyPast: [],
      historyFuture: [],
      historyLastCaptureAt: 0,
    });
  }

  beforeEach(resetWithDupChart);

  it('위반(중복) 노트 {0}을 비우는 전이(clearSelection)는 거부되고 선택이 유지된다', () => {
    useEditorStore.getState().setSelection(sel({ notes: new Set([0]) }));
    useEditorStore.getState().clearSelection();
    expect(useEditorStore.getState().selection.notes).toEqual(new Set([0]));
  });

  it('위반 노트 {0}을 다른 노트 {2}로 교체하는 전이도 거부된다 (교체 = removed 발생)', () => {
    useEditorStore.getState().setSelection(sel({ notes: new Set([0]) }));
    useEditorStore.getState().setSelection(sel({ notes: new Set([2]) }));
    expect(useEditorStore.getState().selection.notes).toEqual(new Set([0]));
  });

  it('위반 노트를 유지한 채 확장하는 전이({0}→{0,2})는 removed=∅라 통과한다', () => {
    useEditorStore.getState().setSelection(sel({ notes: new Set([0]) }));
    useEditorStore.getState().setSelection(sel({ notes: new Set([0, 2]) }));
    expect(useEditorStore.getState().selection.notes).toEqual(new Set([0, 2]));
  });

  it('위반과 무관한 노트 {2}의 해제는 통과한다', () => {
    useEditorStore.getState().setSelection(sel({ notes: new Set([2]) }));
    useEditorStore.getState().clearSelection();
    expect(useEditorStore.getState().selection).toEqual(emptySelection());
  });

  it('위반을 해소(중복 노트 이동)한 뒤에는 해제가 통과한다 — place-then-fix의 상한', () => {
    useEditorStore.getState().setSelection(sel({ notes: new Set([0]) }));
    // 노트 0을 빈 박으로 이동 → 위반 해소 (커밋 게이트 통과)
    const fixedNotes: NoteEntity[] = [
      { type: 'single', lane: 1, beat: beat(4) },
      { type: 'single', lane: 1, beat: beat(0) },
      { type: 'single', lane: 2, beat: beat(2) },
    ];
    useEditorStore.getState().setChart(makeFullChart(fixedNotes));
    useEditorStore.getState().clearSelection();
    expect(useEditorStore.getState().selection).toEqual(emptySelection());
  });

  it('삭제(노트 개수 감소 커밋)는 게이트를 지나지 않고 선택이 원자적으로 비워진다 — 탈출구', () => {
    useEditorStore.getState().setSelection(sel({ notes: new Set([0, 1]) })); // 위반 당사자 둘 다 선택
    // 위반 노트 둘을 삭제한 차트 커밋 (SelectMode.deleteSelected가 밟는 경로)
    useEditorStore.getState().setChart(makeFullChart(dupNotes.slice(2)));
    expect(useEditorStore.getState().selection).toEqual(emptySelection());
  });

  it('undo(원자 set)는 removed가 있어도 게이트 없이 선택을 비운다 — 탈출구', () => {
    useEditorStore.setState({ chart: makeFullChart([dupNotes[2]]) });
    useEditorStore.getState().setChart(makeFullChart(dupNotes)); // 위반 차트 낙관 커밋(히스토리 캡처)
    useEditorStore.getState().setSelection(sel({ notes: new Set([0]) }));
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().selection).toEqual(emptySelection());
  });

  it('겹치는 트릴존 {0}을 선택에서 놓는 전이도 거부된다 (zones도 게이트 대상)', () => {
    const zones: TrillZone[] = [
      { lane: 1, beat: beat(0), endBeat: beat(4) },
      { lane: 1, beat: beat(2), endBeat: beat(6) }, // 존 겹침(의미 위반)
    ];
    useEditorStore.setState({
      chart: { ...makeFullChart([]), trillZones: zones },
      selection: emptySelection(),
    });
    useEditorStore.getState().setSelection(sel({ zones: new Set([0]) }));
    useEditorStore.getState().clearSelection();
    expect(useEditorStore.getState().selection.zones).toEqual(new Set([0]));
  });

  it('위반(중복) 보조 노트 {0} 선택 해제도 §3-6 동일 취급으로 거부된다 — 선택 유지 + false 반환 (RFD 0018)', () => {
    // 보조끼리 중복(전 레인 duplicate 규칙 위반)이 chart.notes(lane 5)에 상주.
    const dupAux: NoteEntity[] = [
      { type: 'single', lane: 5, beat: beat(0) },
      { type: 'single', lane: 5, beat: beat(0) },
    ];
    useEditorStore.setState({
      chart: makeFullChart(dupAux),
      selection: emptySelection(),
      historyPast: [],
      historyFuture: [],
      historyLastCaptureAt: 0,
    });
    expect(useEditorStore.getState().setSelection(sel({ extraNotes: new Set([0]) }))).toBe(true); // ∅→{extra 0}
    expect(useEditorStore.getState().clearSelection()).toBe(false); // 위반 보조 놓기 = 거부
    expect(useEditorStore.getState().selection.extraNotes).toEqual(new Set([0]));
  });
});

describe('zoneContainedNoteIndices — 트릴 타입만 파생 (RFD 0016 §4.2 + 낙관 편집 공존)', () => {
  it('존 범위 안에 transient 위반으로 상주하는 일반 노트(single·long)는 파생에서 제외된다', () => {
    const zone: TrillZone = { lane: 1, beat: beat(0), endBeat: beat(4) };
    const mixed: NoteEntity[] = [
      { type: 'trill', lane: 1, beat: beat(1) },                       // 0: 파생 대상
      { type: 'single', lane: 1, beat: beat(2) },                      // 1: 위반 상주 일반 노트 — 제외
      { type: 'long', lane: 1, beat: beat(0), endBeat: beat(3) },      // 2: 위반 상주 롱 — 제외
      { type: 'trillLong', lane: 1, beat: beat(0), endBeat: beat(4) }, // 3: 파생 대상
    ];
    expect(zoneContainedNoteIndices(mixed, zone)).toEqual(new Set([0, 3]));
  });
});

describe('setSelection 반환값 · setSelectionTransient (§3-5 전이 = 확정된 선택 변경)', () => {
  const gateNotes: NoteEntity[] = [
    { type: 'single', lane: 1, beat: beat(0) },
    { type: 'single', lane: 1, beat: beat(0) }, // 0·1 중복(의미 위반)
    { type: 'single', lane: 2, beat: beat(2) },
  ];

  beforeEach(() => {
    useEditorStore.setState({
      chart: makeFullChart(gateNotes),
      selection: emptySelection(),
      historyPast: [],
      historyFuture: [],
      historyLastCaptureAt: 0,
    });
  });

  it('setSelection은 게이트 통과 시 true, 거부 시 false를 반환한다', () => {
    expect(useEditorStore.getState().setSelection(sel({ notes: new Set([0]) }))).toBe(true); // ∅→{0}
    expect(useEditorStore.getState().setSelection(sel({ notes: new Set([2]) }))).toBe(false); // {0}→{2} 거부
    expect(useEditorStore.getState().clearSelection()).toBe(false); // {0}→∅ 거부
  });

  it('setSelectionTransient는 위반 노트를 떨궈도 게이트 없이 커밋된다 (박스 프리뷰 전용)', () => {
    useEditorStore.getState().setSelection(sel({ notes: new Set([0]) }));
    useEditorStore.getState().setSelectionTransient(sel({ notes: new Set([2]) }));
    expect(useEditorStore.getState().selection.notes).toEqual(new Set([2])); // 거부 없이 반영
  });

  it('setSelectionTransient도 정규화는 적용한다 (범위 밖 인덱스 7 제거)', () => {
    useEditorStore.getState().setSelectionTransient(sel({ notes: new Set([2, 7]) }));
    expect(useEditorStore.getState().selection.notes).toEqual(new Set([2]));
  });
});

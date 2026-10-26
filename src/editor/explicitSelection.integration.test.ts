import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { beat, beatToFloat, deriveExplicitNoteRelations } from '../shared';
import type { ChartDocument, DocumentNoteEntity } from '../shared';
import { useEditorStore } from './stores';
import { emptySelection } from './stores/selectionSlice';
import { SelectMode } from './modes/SelectMode';
import { DeleteMode } from './modes/DeleteMode';
import { EraseGesture } from './editing/EraseGesture';
import { hitTestNoteAt } from './timeline/hitTest';
import { makeFakeSpace } from './timeline/makeFakeSpace';
import { editorChartErrors, editorChartViolationIndices } from './documentValidation';
import { compileExplicitJudgmentChart } from '../game/judgment/explicitCompiledChart';

vi.mock('../shared/toast', () => ({ showToast: vi.fn() }));
const current = () => useEditorStore.getState();
const selection = () => current().selection.notes;
const notes = () => current().chart.notes;
const chart = (notes: DocumentNoteEntity[]): ChartDocument => ({
  meta: { title: 'E2 선택', artist: '', difficultyLabel: 'NORMAL', difficultyLevel: 1, imageFile: '', audioFile: '', previewAudioFile: '', offsetMs: 0 },
  notes, trillZones: [], events: [{ type: 'bpm', beat: beat(0), bpm: 120 }, { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(4) }],
});
const family = (lane = 1): DocumentNoteEntity[] => [
  { type: 'body', lane, beat: beat(1), endBeat: beat(5), holdCount: 1 },
  { type: 'point', lane, beat: beat(1), kind: 'single' },
  { type: 'sustain', lane, beat: beat(3), count: 1 },
  { type: 'release', lane, beat: beat(5), count: 1 },
  { type: 'point', lane, beat: beat(4), kind: 'double' },
];
function setup(source = family(), zoneEndHit: number | null = null) {
  useEditorStore.setState({ chart: chart(source), selection: emptySelection(), historyPast: [], historyFuture: [], historyLastCaptureAt: 0, editTransaction: null, extraLaneCount: 4 });
  const warn = vi.fn();
  const space = makeFakeSpace({
    xToUnifiedLane: x => x >= 1 && x <= 8 ? x : null,
    xToExtraLane: x => x >= 5 && x <= 8 ? x - 4 : null,
    yToBeat: y => beat(Math.round(y * 120), 120), yToBeatRaw: y => beat(Math.round(y * 120), 120),
    hitTestUnifiedNote: (lane, at) => hitTestNoteAt(notes(), lane, at, undefined, selection()),
    hitTestTrillZoneEnd: () => zoneEndHit,
    hitTestNoteEnd: (lane, at) => {
      const hit = hitTestNoteAt(notes(), lane, at, undefined, selection());
      const note = hit === null ? undefined : notes()[hit];
      return note && 'endBeat' in note && Math.abs(beatToFloat(note.endBeat) - at) < 1 / 16 ? hit : null;
    },
  });
  const mode = new SelectMode(current().chart, {
    space, getSelection: () => current().selection,
    setSelection: value => current().setSelection(value), setSelectionTransient: value => current().setSelectionTransient(value),
    onChartUpdate: (value, transaction) => { current().setChart(value, { transaction }); mode.setChart(current().chart); },
    getExtraLaneCount: () => current().extraLaneCount, setExtraLaneCount: (count, transaction) => current().setExtraLaneCount(count, transaction),
    beginTransaction: () => current().beginEditTransaction(), commitTransaction: token => current().commitEditTransaction(token), cancelTransaction: token => current().cancelEditTransaction(token), onWarn: warn,
  });
  const click = (lane: number, at: number, toggle = false) => { mode.onPointerDown(lane, at, false, false, toggle); mode.onPointerUp(lane, at); };
  const erase = new EraseGesture({
    getChart: () => current().chart, getSelectedNotes: selection, onChartUpdate: (value, transaction) => { current().setChart(value, { transaction }); mode.setChart(value); },
    beginTransaction: () => current().beginEditTransaction("erase"), commitTransaction: token => current().commitEditTransaction(token), cancelTransaction: token => current().cancelEditTransaction(token), onWarn: warn,
  });
  return { mode, click, space, warn, erase };
}
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.useRealTimers());

describe('명시 노트 실제 선택 집합과 관계 재도출', () => {
  it('1～5박 바디 클릭은 시작 Point·3박 Sustain·5박 Release를 고르고 중간 4박 Point는 제외한다', () => {
    const { click } = setup(); click(1, 2); expect(selection()).toEqual(new Set([0, 1, 2, 3]));
    expect(current().historyPast).toHaveLength(0);
  });
  it.each([1, 3, 4, 5])('%s박 점수 노트는 선택된 바디보다 hit가 앞서고 클릭하면 해당 노트만 선택한다', at => {
    const { click } = setup(); click(1, 2); click(1, at);

    expect(selection()).toEqual(new Set([at === 1 ? 1 : at === 3 ? 2 : at === 4 ? 4 : 3]));
  });
  it('0박 zero Body+Sustain은 중심에서 표식만 고르고 0.08박 주변에서는 바디와 표식을 고른다', () => {
    const { click } = setup([{ type: 'body', lane: 1, beat: beat(0), endBeat: beat(0), holdCount: 1 }, { type: 'sustain', lane: 1, beat: beat(0), count: 1 }]);
    click(1, 0); expect(selection()).toEqual(new Set([1]));
    current().clearSelection(); click(1, 0.08); expect(selection()).toEqual(new Set([0, 1]));
  });
  it('바디의 2～2.5박 일부만 박스에 들어가도 연결 항목을 고르고 중간 Point는 제외한다', () => {
    const { mode } = setup(); mode.beginBoxSelect(2, 2); mode.onPointerMove(1, 2.5); mode.onPointerUp(1, 2.5);
    expect(selection()).toEqual(new Set([0, 1, 2, 3]));
  });
  it('바디 밖 6박 Release만 박스에 들어가면 해당 Release만 고른다', () => {
    const { mode } = setup([...family(), { type: 'release', lane: 1, beat: beat(6), count: 2 }]);
    mode.beginBoxSelect(2, 5.8); mode.onPointerMove(1, 6.2); mode.onPointerUp(1, 6.2);
    expect(selection()).toEqual(new Set([5]));
  });
  it('Release 토글 제외 후 Body를 다시 잡아 1박 이동해도 제외 Release와 중간 Point는 원위치다', () => {
    const { mode, click } = setup(); click(1, 2); click(1, 5, true); expect(selection()).toEqual(new Set([0, 1, 2]));
    mode.onPointerDown(1, 2, false, false); mode.onPointerMove(1, 3); mode.onPointerUp(1, 3);
    expect(notes().map(note => beatToFloat(note.beat))).toEqual([2, 2, 4, 5, 4]);
    expect(selection()).toEqual(new Set([0, 1, 2]));
    expect(deriveExplicitNoteRelations(notes()).bodyByNote.get(0)?.endReleaseIndices).toEqual([]);
  });
  it('Body가 이미 선택된 채 Shift추가를 눌러도 제외 Release를 다시 선택하지 않는다', () => {
    const { mode, click } = setup(); click(1, 2); click(1, 5, true);
    mode.onPointerDown(1, 2, true, false); mode.onPointerUp(1, 2);
    expect(selection()).toEqual(new Set([0, 1, 2]));
  });
  it('1/3박 Body를 고르면 같은 시작 2/6박 Point와 4/3박 Release를 rationalBeat로 동반선택한다', () => {
    const { click } = setup([
      { type: 'body', lane: 1, beat: beat(1, 3), endBeat: beat(4, 3), holdCount: 1 },
      { type: 'point', lane: 1, beat: beat(2, 6), kind: 'single' },
      { type: 'release', lane: 1, beat: beat(8, 6), count: 1 },
    ]);
    click(1, 0.8); expect(selection()).toEqual(new Set([0, 1, 2]));
  });
  it('1→2 공유 3박 Sustain은 뒤 Body 선택에만 포함되고 앞 Body의 Release와 구별된다', () => {
    const { mode } = setup([
      { type: 'body', lane: 1, beat: beat(1), endBeat: beat(3), holdCount: 1 },
      { type: 'body', lane: 1, beat: beat(3), endBeat: beat(5), holdCount: 2 },
      { type: 'sustain', lane: 1, beat: beat(3), count: 2 },
      { type: 'release', lane: 1, beat: beat(3), count: 1 },
    ]);
    mode.selectNote(0); expect(selection()).toEqual(new Set([0, 3]));
    mode.selectNote(1); expect(selection()).toEqual(new Set([1, 2]));
  });
  it('Sustain만 double Body 7박에 paste하면 새 owner의 count2를 쓰고 바디를 추가하지 않는다', () => {
    const { mode } = setup([...family(), { type: 'body', lane: 1, beat: beat(6), endBeat: beat(9), holdCount: 2 }]);
    const beforeWeight = compileExplicitJudgmentChart(current().chart).theoreticalWeight;
    mode.selectNote(2); mode.copy(); mode.paste(beat(7)); mode.confirmPlacement();
    const compiled = compileExplicitJudgmentChart(current().chart);
    expect(compiled.scoreItems.filter(item => item.source.noteIndex === 6)).toHaveLength(2);
    expect(compiled.theoreticalWeight - beforeWeight).toBe(6);
    expect(notes()).toHaveLength(7); expect(notes()[6]).toMatchObject({ type: 'sustain', count: 2, beat: beat(7) });
    expect(editorChartErrors(current().chart)).toEqual([]);
  });
  it('Sustain 제외 Body만 1레인 이동하면 표식은 원위치 위반으로 남고 confirm·선택해제가 허용된다', () => {
    const { mode, click } = setup(); click(1, 2); click(1, 3, true);
    mode.onPointerDown(1, 2, false, false); mode.onPointerMove(2, 2);
    expect(editorChartViolationIndices(current().chart).notes).toContain(2);
    mode.onPointerUp(2, 2); current().clearSelection(); expect(notes()[2]).toMatchObject({ lane: 1, beat: beat(3) }); expect(selection().size).toBe(0);
  });
  it('Body 토글 해제는 Body만 빼고 시작 Point·Sustain·Release를 선택에 남긴다', () => {
    const { click } = setup(); click(1, 2); click(1, 2, true); expect(selection()).toEqual(new Set([1, 2, 3]));
  });
  it('Body만 남긴 실제 set의 복사는 1개이고 8박 paste에서 제외 노트를 재생성하지 않는다', () => {
    const { mode, click } = setup(); click(1, 2); [1, 3, 5].forEach(at => click(1, at, true));
    expect(selection()).toEqual(new Set([0])); expect(mode.copy()).toBe(1); expect(mode.paste(beat(8))).toBe(1);
    mode.confirmPlacement(); expect(notes()).toHaveLength(6); expect(notes()[5]).toMatchObject({ type: 'body', beat: beat(8), endBeat: beat(12) });
  });
  it('lane7·1/3박 Sustain만 lane6 double Body로 옮기면 count=2이고 다시 lane7로 옮기면 count=1이다', () => {
    const { mode } = setup([
      { type: 'body', lane: 7, beat: beat(0), endBeat: beat(2), holdCount: 1 },
      { type: 'body', lane: 6, beat: beat(0), endBeat: beat(2), holdCount: 2 },
      { type: 'sustain', lane: 7, beat: beat(2, 6), count: 1 },
    ]);
    mode.selectNote(2); mode.moveByLane('left'); expect(notes()[2]).toEqual({ type: 'sustain', lane: 6, beat: beat(2, 6), count: 2 });
    expect(current().extraLaneCount).toBe(4); expect(notes()).toHaveLength(3);
    mode.moveByLane('right'); expect(notes()[2]).toMatchObject({ lane: 7, count: 1 });
  });
  it('Sustain만 8박에 paste하면 zero Body 없이 위반 preview·확정·선택해제가 되고 Undo 1회로 복구된다', () => {
    const { mode } = setup(); const initial = current().chart;
    mode.selectNote(2); expect(mode.copy()).toBe(1); mode.paste(beat(8));
    expect(notes()).toHaveLength(6); expect(editorChartViolationIndices(current().chart).notes).toContain(5);
    mode.confirmPlacement(); expect(current().clearSelection()).toBe(true); expect(selection()).toEqual(new Set());
    expect(editorChartErrors(current().chart).some(error => error.rule === 'sustainPlacement')).toBe(true);
    expect(current().historyPast).toHaveLength(1); current().undo(); expect(current().chart).toEqual(initial);
  });
  it('lane7 Sustain paste로 확장한 extraCount는 Esc취소로 2에 돌아가고 history도 늘지 않는다', () => {
    const { mode } = setup(family(7)); current().setExtraLaneCount(2); current().resetHistory();
    mode.selectNote(2); mode.copy(); mode.paste(beat(8)); expect(current().extraLaneCount).toBe(3);
    mode.cancelPaste(); expect(current().extraLaneCount).toBe(2); expect(current().historyPast).toHaveLength(0);
  });
  it('Ctrl+A用selectAllはmain/aux全ノートを実際のsetに置き、Delete一回で全て消す', () => {
    const { mode } = setup([...family(), ...family(7)]); mode.selectAll(); expect(selection().size).toBe(10);
    mode.deleteSelected(); expect(notes()).toEqual([]); expect(current().historyPast).toHaveLength(1);
  });
});

describe('명시 바디 끝 resize와 삭제 보호', () => {
  it('미선택 5박 handle을 touch로 잡으면 동반선택하고 6박 resize는 선택 Release만 따라간다', () => {
    const { mode } = setup(); expect(mode.beginNoteEndResizeDrag(0)).toBe(true); expect(selection()).toEqual(new Set([0, 1, 2, 3]));
    mode.onPointerMove(1, 6); mode.onPointerUp(1, 6);
    expect(notes()[0]).toMatchObject({ endBeat: beat(6) }); expect(notes()[3].beat).toEqual(beat(6));
    expect(notes()[1].beat).toEqual(beat(1)); expect(notes()[2].beat).toEqual(beat(3));
  });
  it('Release 제외 후 선택된 handle을 6박으로 resize하면 set과 5박 Release를 보존한다', () => {
    const { mode, click } = setup(); click(1, 2); click(1, 5, true); mode.beginNoteEndResizeDrag(0); mode.onPointerMove(1, 6); mode.onPointerUp(1, 6);
    expect(selection()).toEqual(new Set([0, 1, 2])); expect(notes()[3].beat).toEqual(beat(5)); expect(notes()[0]).toMatchObject({ endBeat: beat(6) });
  });
  it('Sustain을 선택에서 제외해도 3박 표식을 밖으로 보내는 2박 축소는 거부하고 마지막 4박을 유지한다', () => {
    const { mode, click } = setup(); click(1, 2); click(1, 3, true); mode.beginNoteEndResizeDrag(0);
    mode.onPointerMove(1, 4); mode.onPointerMove(1, 2); mode.onPointerUp(1, 2);
    expect(notes()[0]).toMatchObject({ endBeat: beat(4) }); expect(notes()[2].beat).toEqual(beat(3)); expect(notes()[3].beat).toEqual(beat(4));
  });
  it.each(['point', 'body'] as const)('명시 trill %s를 구간밖으로 내보내는 zone축소는 마지막유효5박을 유지한다', type => {
    const source: DocumentNoteEntity[] = type === 'point'
      ? [{ type: 'point', kind: 'trill', lane: 1, beat: beat(4) }]
      : [{ type: 'point', kind: 'trill', lane: 1, beat: beat(2) }, { type: 'body', trill: true, lane: 1, beat: beat(2), endBeat: beat(5), holdCount: 1 }];
    const { mode } = setup(source, 0);
    current().loadChart({ ...current().chart, trillZones: [{ lane: 1, beat: beat(1), endBeat: beat(6) }] }); mode.setChart(current().chart); current().resetHistory();
    mode.selectZoneUnit(0); mode.onPointerDown(2, 6, false, false); mode.onPointerMove(2, 5); mode.onPointerMove(2, 3); mode.onPointerUp(2, 3);
    expect(current().chart.trillZones[0].endBeat).toEqual(beat(5)); expect(current().historyPast).toHaveLength(1);
  });
  it('표식 없는 Body는 Shift+Down으로 길이0까지 줄이되 시작점 이전으로 역전하지 않는다', () => {
    const { mode } = setup([{ type: 'body', lane: 1, beat: beat(1), endBeat: beat(2), holdCount: 1 }]); mode.selectNote(0);
    mode.resizeEndBySnap('down'); expect(notes()[0]).toMatchObject({ endBeat: beat(1) }); mode.resizeEndBySnap('down'); expect(notes()[0]).toMatchObject({ endBeat: beat(1) });
  });
  it('끝 resize중 Esc는 Body와 선택된 Release를 원위치로 복구하고 history를 추가하지 않는다', () => {
    const { mode } = setup(); const initial = current().chart; mode.selectNote(0); mode.beginNoteEndResizeDrag(0); mode.onPointerMove(1, 7); mode.cancel();
    expect(current().chart).toEqual(initial); expect(current().historyPast).toHaveLength(0);
  });
  it('미선택 Body 우클릭은 연결4개만 지우고 중간 Point를 남기며 Undo1개로 복구한다', () => {
    const { erase } = setup(); const initial = current().chart; erase.begin(); erase.erase(1, 2); erase.finish();
    expect(notes()).toEqual([initial.notes[4]]); expect(current().historyPast).toHaveLength(1); current().undo(); expect(current().chart).toEqual(initial);
  });
  it('선택된 Body 우클릭은 그쪽 현재 set만 지우고 제외 Release·다른 선택Body를 index보정해 남긴다', () => {
    const { erase, mode, click } = setup([...family(), ...family(2)]); mode.selectAll(); click(1, 5, true);
    erase.begin(); erase.erase(1, 2); erase.finish();
    expect(notes().slice(0, 2)).toEqual([family()[3], family()[4]]); expect(notes().slice(2)).toEqual(family(2));
    expect(selection()).toEqual(new Set([1, 2, 3, 4, 5, 6]));
  });
  it('Sustain 제외 Body Cut은 clipboard·chart·selection·past/future를 모두 보존하고 같은 set의copy는 허용한다', () => {
    const { mode, click, warn } = setup(); mode.selectNote(4); mode.copy(); click(1, 2); click(1, 3, true);
    const before = current(); expect(mode.cut()).toBe(0); expect(warn).toHaveBeenCalledOnce();
    expect(current().chart).toBe(before.chart); expect(current().selection).toBe(before.selection);
    expect(current().historyPast).toBe(before.historyPast); expect(current().historyFuture).toBe(before.historyFuture);
    mode.paste(beat(8)); mode.confirmPlacement(); expect(notes().at(-1)).toMatchObject({ type: 'point', kind: 'double' });
    expect(mode.copy()).toBe(1);
  });
  it('Sustain 제외 Body의 Delete와 직접우클릭 모두 chart·set·history를 바꾸지 않는다', () => {
    const { mode, click, erase, warn } = setup(); click(1, 2); click(1, 3, true); const initial = current();
    mode.deleteSelected(); expect(current().chart).toBe(initial.chart); expect(current().selection).toBe(initial.selection);
    erase.begin(); erase.erase(1, 2); erase.finish();
    expect(current().chart).toBe(initial.chart); expect(current().selection).toBe(initial.selection); expect(current().historyPast).toBe(initial.historyPast);
    expect(warn).toHaveBeenCalledTimes(2); expect(mode.copy()).toBe(3);
  });
  it('Sustain 제외 상태의 키보드 끝축소도 3박 표식 아래로 내리면 마지막3박과 history를 유지한다', () => {
    const { mode, click } = setup(); click(1, 2); click(1, 3, true); mode.resizeEndBySnap('down'); mode.resizeEndBySnap('down');
    const before = current(); mode.resizeEndBySnap('down'); expect(current().chart).toBe(before.chart); expect(current().historyPast).toBe(before.historyPast);
    expect(notes()[0]).toMatchObject({ endBeat: beat(3) });
  });
  it('zero Body 위 double Sustain 직접삭제는 표식 전체 한개만 지우고 Body는 남긴다', () => {
    const { space } = setup([{ type: 'body', lane: 1, beat: beat(0), endBeat: beat(0), holdCount: 2 }, { type: 'sustain', lane: 1, beat: beat(0), count: 2 }]);
    const next = DeleteMode.deleteNoteAtPoint(current().chart, space.hitTestUnifiedNote, 1, 0)!; current().setChart(next);
    expect(notes()).toEqual([{ type: 'body', lane: 1, beat: beat(0), endBeat: beat(0), holdCount: 2 }]);
  });
  it.each(['point', 'release'] as const)('double %s 직접삭제는 수량2 전체를 한번에 지운다', type => {
    const node: DocumentNoteEntity = type === 'point' ? { type, lane: 1, beat: beat(0), kind: 'double' } : { type, lane: 1, beat: beat(0), count: 2 };
    const { erase } = setup([node]); erase.begin(); erase.erase(1, 0); erase.finish(); expect(notes()).toEqual([]);
  });
});

describe('우클릭 gesture transaction·취소·Undo 수명', () => {
  it('3초 넘는 연속삭제 전체는 Undo1개이며 직후 새gesture와 일반편집은 각각 독립Undo다', () => {
    vi.useFakeTimers(); const { erase } = setup([1, 2, 3, 4].map(at => ({ type: 'point', kind: 'single', lane: 1, beat: beat(at) })));
    erase.begin(); erase.erase(1, 1); vi.advanceTimersByTime(3000); erase.erase(1, 2); erase.finish(); expect(current().historyPast).toHaveLength(1);
    erase.begin(); erase.erase(1, 3); erase.finish(); expect(current().historyPast).toHaveLength(2);
    current().setChart({ ...current().chart, notes: [...notes(), { type: 'release', lane: 2, beat: beat(7), count: 1 }] });
    expect(current().historyPast).toHaveLength(3); current().undo(); expect(notes()).toHaveLength(1); current().undo(); expect(notes()).toHaveLength(2); current().undo(); expect(notes()).toHaveLength(4);
    current().redo(); expect(notes()).toHaveLength(2);
  });
  it('Sustain 삭제 후 같은 3박에서 반복이동해도 드러난Body는 남고 새gesture에서는 지울수있다', () => {
    const { erase } = setup(); erase.begin(); erase.erase(1, 3); erase.erase(1, 3); erase.erase(1, 3.02); erase.finish();
    expect(notes().some(note => note.type === 'body')).toBe(true); expect(notes().some(note => note.type === 'sustain')).toBe(false);
    erase.begin(); erase.erase(1, 3); erase.finish(); expect(notes().some(note => note.type === 'body')).toBe(false);
  });
  it('노트 지운 자리보호는 다른위치의 바디 직접삭제를 막지 않는다', () => {
    const { erase } = setup(); erase.begin(); erase.erase(1, 3); erase.erase(1, 2); erase.finish(); expect(notes().some(note => note.type === 'body')).toBe(false);
  });
  it('이전편집 뒤 erase중 Esc는 해당삭제만 복구하고 버튼up전 move를 무시하며 past/future를 보존한다', () => {
    const { erase } = setup(); current().setChart({ ...current().chart, notes: [...notes(), { type: 'release', lane: 2, beat: beat(8), count: 1 }] });
    const before = current(); erase.begin(); erase.erase(1, 3); erase.cancel(); erase.erase(1, 1); erase.erase(2, 8);
    expect(current().chart).toBe(before.chart); expect(current().historyPast).toBe(before.historyPast); expect(current().historyFuture).toBe(before.historyFuture);
    erase.finish(); expect(current().historyPast).toHaveLength(1); current().undo(); expect(notes()).toEqual(family());
  });
  it.each(['편집', 'Undo', 'Redo', 'mode', 'load'] as const)('erase중 %s 독립명령 뒤 Esc·move는 해당명령과 history를 바꾸지 않는다', command => {
    const { erase } = setup();
    if (command === 'Redo') {
      current().setChart({ ...current().chart, notes: [...notes(), { type: 'release', lane: 2, beat: beat(9), count: 1 }] });
      current().undo();
    }
    erase.begin(); erase.erase(1, 3);
    if (command === '편집') current().setChart({ ...current().chart, notes: [...notes(), { type: 'point', kind: 'single', lane: 2, beat: beat(8) }] });
    if (command === 'Undo') current().undo();
    if (command === 'Redo') current().redo();
    if (command === 'mode') current().setMode('create');
    if (command === 'load') current().loadChart(chart([{ type: 'release', lane: 3, beat: beat(8), count: 1 }]));
    const afterCommand = current(); erase.cancel(); erase.erase(1, 1); erase.finish();
    expect(current().chart).toBe(afterCommand.chart); expect(current().historyPast).toBe(afterCommand.historyPast); expect(current().historyFuture).toBe(afterCommand.historyFuture);
    expect(current().editTransaction).toBeNull();
  });
  it('Redo기록이 있는 상태의 삭제gesture를 Esc취소하면 future와 이전선택을 그대로 복구한다', () => {
    const { mode, erase } = setup(); current().setChart({ ...current().chart, notes: [...notes(), { type: 'release', lane: 2, beat: beat(7), count: 1 }] }); current().undo();
    mode.setChart(current().chart); mode.selectNote(0); const before = current(); erase.begin(); erase.erase(1, 3); erase.cancel(); erase.finish();
    expect(current().chart).toBe(before.chart); expect(current().selection).toBe(before.selection); expect(current().historyFuture).toBe(before.historyFuture);
    current().redo(); expect(notes()).toHaveLength(6);
  });
  it('빈 gesture와 같은위치 클릭만 한 move는 새history를 만들지 않는다', () => {
    const { erase, click } = setup(); erase.begin(); erase.erase(2, 9); erase.finish(); click(1, 2); expect(current().historyPast).toHaveLength(0);
  });
});

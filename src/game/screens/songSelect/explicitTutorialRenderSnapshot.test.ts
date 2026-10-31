import { describe, expect, it } from 'vitest';
import { beat } from '../../../shared/types/beat';
import type { ChartDocument } from '../../../shared/types/chart';
import { compileExplicitJudgmentChart } from '../../judgment/explicitCompiledChart';
import { ExplicitJudgmentSession } from '../../judgment/ExplicitJudgmentSession';
import { ExplicitNotePresenter } from '../../renderer/ExplicitNotePresenter';
import { buildExplicitSkinView } from '../../skin/explicitSkin';
import { createExplicitTutorialPreview } from './explicitTutorialPreviewChart';
import { createExplicitTutorialRenderChart } from './explicitTutorialRenderChart';
import { createExplicitTutorialRenderSnapshotQuery } from './explicitTutorialRenderSnapshot';

const LOOP_BEATS = 4;
const LOOP_MS = 2000;

/** 120 BPM 4박(2000ms): n0 탭 500ms, n1 바디 500～1000ms, n2 릴리즈 1000ms, n3 더블 탭 1500ms. */
function sourceChart(): ChartDocument {
  return {
    meta: { title: '합성 snapshot', artist: 'test', difficultyLabel: 'TUTORIAL', difficultyLevel: 1,
      imageFile: '', audioFile: '', previewAudioFile: '', offsetMs: 0 },
    notes: [
      { type: 'tap', kind: 'single', lane: 2, beat: beat(1) },
      { type: 'body', holdCount: 1, lane: 2, beat: beat(1), endBeat: beat(2) },
      { type: 'release', count: 1, lane: 2, beat: beat(2) },
      { type: 'tap', kind: 'double', lane: 3, beat: beat(3) },
    ],
    trillZones: [],
    events: [{ type: 'bpm', beat: beat(0), bpm: 120 }],
  };
}

function setup() {
  const chart = sourceChart();
  const source = compileExplicitJudgmentChart(chart);
  const preview = createExplicitTutorialPreview('snapshot', '합성 snapshot', [], LOOP_BEATS, chart);
  const render = createExplicitTutorialRenderChart(source, preview);
  const unjudged = new ExplicitJudgmentSession(source).snapshot;
  const query = createExplicitTutorialRenderSnapshotQuery(render, chart.notes.length, LOOP_MS, unjudged);
  const live = new ExplicitJudgmentSession(source);
  // 2레인 탭 500ms를 누른 채 700ms까지 진행: 탭 성공·바디 유지 중·릴리즈 대기
  live.processBatch(500, [{ lane: 2, key: 'KeyD', type: 'down' }]);
  live.advance(700);
  return { render, query, live };
}

describe('명시 튜토리얼 3벌 표시의 합성 snapshot', () => {
  it('화면보다 1회 늦은 세션은 이전 복사본 0의 탭·바디 시각에만 적용하고 현재 복사본 1의 탭은 표시한다', () => {
    const { render, query, live } = setup();
    const composite = query(live.snapshot, 1, -1);

    expect(composite.items.find(item => item.id === 'n0:tap:0')?.state).toBe('success');
    expect(composite.items.find(item => item.id === 'n4:tap:0')?.state).toBe('pending');
    expect(composite.bodyUnits.find(unit => unit.id === 'b1:hold:0'))
      .toMatchObject({ state: 'active', actualStartMs: 500 });
    expect(composite.bodyUnits.find(unit => unit.id === 'b5:hold:0'))
      .toMatchObject({ state: 'waiting', actualStartMs: null });
    expect(composite.atMs).toBe(700);

    const presenter = new ExplicitNotePresenter(render, buildExplicitSkinView('/'));
    const notes = presenter.present(composite, { judgmentLineY: 426, scrollSpeed: 200, laneAreaX: 0, height: 600 }, 2100);
    const tapVisible = (noteIndex: number) => notes.find(note => note.sourceNoteIndex === noteIndex)!.layers[0].visible;
    expect([tapVisible(0), tapVisible(4), tapVisible(8)]).toEqual([false, true, true]);
  });

  it('현재 반복 복사본 1에는 700ms의 live 상태를, 복사본 0·2에는 판정 전 상태를 render 항목 id로 옮김', () => {
    const { query, live } = setup();
    const composite = query(live.snapshot, 1);
    const itemState = (id: string) => composite.items.find(item => item.id === id)?.state;

    expect(itemState('n4:tap:0')).toBe('success');
    expect(itemState('n6:release:0')).toBe('pending');
    expect(itemState('n0:tap:0')).toBe('pending');
    expect(itemState('n8:tap:0')).toBe('pending');
    expect(composite.items.find(item => item.id === 'n4:tap:0')).toMatchObject({ sourceNoteIndex: 4, kind: 'tap', ordinal: 0, grade: 'perfect' });
    expect(composite.items).toHaveLength(12);
  });

  it('화면 복사본 2보다 1회 늦은 세션은 복사본 1의 바디 시작을 2500ms·snapshot을 2700ms로 옮긴다', () => {
    const { query, live } = setup();
    const composite = query(live.snapshot, 2, -1);
    expect(composite.items.find(item => item.id === 'n4:tap:0')?.state).toBe('success');
    expect(composite.items.find(item => item.id === 'n8:tap:0')?.state).toBe('pending');
    expect(composite.bodyUnits.find(unit => unit.id === 'b5:hold:0'))
      .toMatchObject({ state: 'active', actualStartMs: 2500 });
    expect(composite.atMs).toBe(2700);
  });

  it('긴 프레임 공백으로 화면보다 3회 늦어 세션 복사본이 표시 범위 밖이면 모든 탭·바디를 판정 전으로 둔다', () => {
    const { query, live } = setup();
    const composite = query(live.snapshot, 1, -3);
    expect(composite.items.every(item => item.state === 'pending')).toBe(true);
    expect(composite.bodyUnits.every(unit => unit.state === 'waiting' && unit.actualStartMs === null)).toBe(true);
  });

  it('복사본 1 바디의 실제 시작 500ms는 render 시간 2500ms로 옮기고 복사본 0·2 바디는 시작 전 waiting으로 둠', () => {
    const { query, live } = setup();
    const composite = query(live.snapshot, 1);
    const unit = (bodyIndex: number) => composite.bodyUnits.find(state => state.ref.bodyIndex === bodyIndex);

    expect(unit(5)).toMatchObject({ id: 'b5:hold:0', ref: { bodyIndex: 5, ordinal: 0 }, state: 'active', actualStartMs: 2500 });
    expect(unit(1)).toMatchObject({ id: 'b1:hold:0', state: 'waiting', actualStartMs: null });
    expect(unit(9)).toMatchObject({ id: 'b9:hold:0', state: 'waiting', actualStartMs: null });
    expect(composite.atMs).toBe(2700);
  });

  it('ExplicitNotePresenter가 3벌 compile의 모든 항목 상태를 찾아 12개 노트를 그리고 복사본 1의 맞힌 탭만 숨김', () => {
    const { render, query, live } = setup();
    const presenter = new ExplicitNotePresenter(render, buildExplicitSkinView('/'));
    const notes = presenter.present(query(live.snapshot, 1), { judgmentLineY: 426, scrollSpeed: 200, laneAreaX: 0, height: 600 }, 2700);

    expect(notes).toHaveLength(12);
    const tapVisible = (noteIndex: number) => notes.find(note => note.sourceNoteIndex === noteIndex)!.layers[0].visible;
    expect([tapVisible(0), tapVisible(4), tapVisible(8)]).toEqual([true, false, true]);
    const bodyArtwork = (noteIndex: number) => notes.find(note => note.sourceNoteIndex === noteIndex)!.layers[0].assetId;
    expect([bodyArtwork(1), bodyArtwork(5), bodyArtwork(9)]).toEqual(['body.single.idle', 'body.single.held', 'body.single.idle']);
  });

  it('activeRenderCycle이 0이면 복사본 0이 live 상태를 받고 복사본 1은 판정 전 상태', () => {
    const { query, live } = setup();
    const composite = query(live.snapshot, 0);
    expect(composite.items.find(item => item.id === 'n0:tap:0')?.state).toBe('success');
    expect(composite.items.find(item => item.id === 'n4:tap:0')?.state).toBe('pending');
    expect(composite.bodyUnits.find(unit => unit.id === 'b1:hold:0')?.actualStartMs).toBe(500);
  });

  it('노트가 0개인 손배치 같은 시연은 합성 snapshot 질의를 만들 수 있고 표시 항목·바디 상태가 비어 있다', () => {
    const chart = { ...sourceChart(), notes: [] };
    const source = compileExplicitJudgmentChart(chart);
    const preview = createExplicitTutorialPreview('empty', '빈 시연', [], LOOP_BEATS, chart);
    const render = createExplicitTutorialRenderChart(source, preview);
    const session = new ExplicitJudgmentSession(source);
    const query = createExplicitTutorialRenderSnapshotQuery(render, 0, LOOP_MS, session.snapshot);

    const snapshot = query(session.snapshot, 1);
    expect(snapshot.items).toEqual([]);
    expect(snapshot.bodyUnits).toEqual([]);
  });

  it('live snapshot에 원본 항목이 없으면 render 항목 id를 담은 오류', () => {
    const { query } = setup();
    const other = new ExplicitJudgmentSession(compileExplicitJudgmentChart({ ...sourceChart(), notes: [sourceChart().notes[0]] })).snapshot;
    expect(() => query(other, 1)).toThrow('b5:hold:0');
  });

  it('activeRenderCycle 3은 3벌(0～2) 밖이라 RangeError', () => {
    const { query, live } = setup();
    expect(() => query(live.snapshot, 3)).toThrow(RangeError);
  });

  it('표시 항목이 있는데 원본 노트 수가 0이거나, 원본 노트 수가 -1이거나, loopMs가 NaN이면 표시 복사본을 나눌 수 없어 생성 전에 RangeError', () => {
    const { render } = setup();
    const unjudged = new ExplicitJudgmentSession(compileExplicitJudgmentChart(sourceChart())).snapshot;
    expect(() => createExplicitTutorialRenderSnapshotQuery(render, 0, LOOP_MS, unjudged)).toThrow(RangeError);
    expect(() => createExplicitTutorialRenderSnapshotQuery(render, -1, LOOP_MS, unjudged)).toThrow(RangeError);
    expect(() => createExplicitTutorialRenderSnapshotQuery(render, 4, Number.NaN, unjudged)).toThrow(RangeError);
  });
});

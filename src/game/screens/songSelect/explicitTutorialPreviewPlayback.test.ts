import { describe, expect, it, vi } from 'vitest';
import { getJudgmentWindows, JUDGMENT_WINDOWS_EASY } from '../../../shared/constants/judgment';
import { beat } from '../../../shared/types/beat';
import type { Beat } from '../../../shared/types/beat';
import type { ChartDocument, TutorialInputEvent } from '../../../shared/types/chart';
import type { ExplicitJudgmentEffectPort } from '../../judgment/ExplicitJudgmentEffectSink';
import { ExplicitNotePresenter } from '../../renderer/ExplicitNotePresenter';
import { buildExplicitSkinView } from '../../skin/explicitSkin';
import { createExplicitTutorialPreview } from './explicitTutorialPreviewChart';
import {
  createExplicitTutorialPreviewPlayback,
  createTutorialTimingsInputPlan,
} from './explicitTutorialPreviewPlayback';
import { resolveTutorialInputTimingsForKeyboard } from './tutorialKeyboardLayout';
import { getTutorialInputTimings } from './tutorialPreviewChart';

// gameStore 기본 TKL 바인딩 — 재생기가 settings.keyBindings로 시연 키를 옮기는 경로를 재현한다.
const TKL_BINDINGS = {
  lane1: ['KeyQ', 'KeyW', 'KeyS', 'KeyX'],
  lane2: ['KeyE', 'KeyD', 'KeyC', 'KeyO'],
  lane3: ['KeyP', 'KeyL', 'Comma', 'KeyR'],
  lane4: ['BracketLeft', 'BracketRight', 'Semicolon', 'Period'],
};

// 같은 에디터 보조 레인의 이벤트는 겹칠 수 없으므로(RFD 0078) 입력마다 다른 editorLane을 준다.
const input = (lane: 1 | 2 | 3 | 4, keyCode: string, start: Beat, end: Beat, editorLane: number): TutorialInputEvent =>
  ({ type: 'tutorialInput', beat: start, endBeat: end, lane, keyCode, keyLabel: '', editorLane });

/**
 * 120 BPM 4박(2000ms) 반복. 1레인 탭 500ms, 2레인 더블 탭 1000ms, 3레인 탭+바디 1500～2000ms와 릴리즈 2000ms(= loopMs).
 * 점수 항목 5개(탭1·더블2·탭1·릴리즈1)이며 마지막 up은 반복 경계와 같은 시각이다.
 */
function demoChart(inputs: TutorialInputEvent[] = [
  input(1, 'Binding1', beat(1), beat(3, 2), 3),
  input(2, 'Binding1', beat(2), beat(5, 2), 4),
  input(2, 'Binding2', beat(2), beat(5, 2), 5),
  input(3, 'Binding1', beat(3), beat(4), 6),
]): ChartDocument {
  return {
    meta: { title: '명시 재생', artist: 'test', difficultyLabel: 'TUTORIAL', difficultyLevel: 1,
      imageFile: '', audioFile: '', previewAudioFile: '', offsetMs: 0 },
    notes: [
      { type: 'tap', kind: 'single', lane: 1, beat: beat(1) },
      { type: 'tap', kind: 'double', lane: 2, beat: beat(2) },
      { type: 'tap', kind: 'single', lane: 3, beat: beat(3) },
      { type: 'body', holdCount: 1, lane: 3, beat: beat(3), endBeat: beat(4) },
      { type: 'release', count: 1, lane: 3, beat: beat(4) },
    ],
    trillZones: [],
    events: [{ type: 'bpm', beat: beat(0), bpm: 120 }, ...inputs],
  };
}

function boundaryChart(): ChartDocument {
  return {
    ...demoChart([input(1, 'Binding1', beat(0), beat(4), 3)]),
    notes: [
      { type: 'tap', kind: 'single', lane: 1, beat: beat(0) },
      { type: 'body', holdCount: 1, lane: 1, beat: beat(0), endBeat: beat(4) },
      { type: 'release', count: 1, lane: 1, beat: beat(4) },
    ],
  };
}

function createPort() {
  const port = {
    showJudgmentGroup: vi.fn<ExplicitJudgmentEffectPort['showJudgmentGroup']>(),
    recordFlightJudgment: vi.fn<ExplicitJudgmentEffectPort['recordFlightJudgment']>(),
    showBombEffect: vi.fn<ExplicitJudgmentEffectPort['showBombEffect']>(),
  };
  return port;
}

function createDemo(chart = demoChart(), options: Parameters<typeof createExplicitTutorialPreviewPlayback>[3] = {}) {
  const preview = createExplicitTutorialPreview('explicit-demo', '명시 재생', [], 4, chart);
  const timings = resolveTutorialInputTimingsForKeyboard(getTutorialInputTimings(preview.chart), TKL_BINDINGS);
  const port = createPort();
  const playback = createExplicitTutorialPreviewPlayback(preview, createTutorialTimingsInputPlan(timings), port, options);
  return { preview, timings, port, playback };
}

/** 재생기 rAF처럼 약 16.7ms 간격 프레임으로 한 반복을 진행한다. 마지막 프레임은 loopMs 직전(1987ms)이다. */
function playFramesUntilBoundary(advanceTo: (loopTimeMs: number) => void, loopMs: number) {
  for (let frame = 0; frame * 16.7 < loopMs; frame++) advanceTo(Math.round(frame * 16.7 * 10) / 10);
}

describe('명시 튜토리얼 재생의 입력 계획', () => {
  it('재생기가 바인딩으로 옮긴 tutorialInput 구간을 lane·keyCode·startMs·endMs 그대로 timings 계획으로 넘김', () => {
    const { timings } = createDemo();
    expect(createTutorialTimingsInputPlan(timings)).toEqual({ kind: 'timings', timings: [
      { lane: 1, key: 'KeyQ', startMs: 500, endMs: 750 },
      { lane: 2, key: 'KeyE', startMs: 1000, endMs: 1250 },
      { lane: 2, key: 'KeyD', startMs: 1000, endMs: 1250 },
      { lane: 3, key: 'KeyP', startMs: 1500, endMs: 2000 },
    ] });
  });
});

describe('명시 튜토리얼 재생의 반복', () => {
  it('탭 0박·바디 0～4박·릴리즈 4박을 2회 재생하면 2000ms 간격 표시 3벌이 모두 그려지고 매회 Perfect 2·Miss 0', () => {
    const { preview, playback } = createDemo(boundaryChart());
    const render = playback.renderChart;
    expect(render.scoreItems.map(item => [item.id, item.source.noteIndex, item.timeMs])).toEqual([
      ['n0:tap:0', 0, 0], ['n2:release:0', 2, 2000],
      ['n3:tap:0', 3, 2000], ['n5:release:0', 5, 4000],
      ['n6:tap:0', 6, 4000], ['n8:release:0', 8, 6000],
    ]);
    expect(render.bodies.map(body => [body.source.noteIndex, body.startMs, body.endMs])).toEqual([
      [1, 0, 2000], [4, 2000, 4000], [7, 4000, 6000],
    ]);
    expect(render.bodyUnits.map(unit => [unit.id, unit.ref, unit.startMs, unit.endMs])).toEqual([
      ['b1:hold:0', { bodyIndex: 1, ordinal: 0 }, 0, 2000],
      ['b4:hold:0', { bodyIndex: 4, ordinal: 0 }, 2000, 4000],
      ['b7:hold:0', { bodyIndex: 7, ordinal: 0 }, 4000, 6000],
    ]);
    // 표시 복사본끼리는 맞닿아도 판정 연결을 만들지 않는다.
    expect(render.connections).toEqual([]);
    expect(render.relations.connections).toEqual([]);
    expect(render.totalJudgments).toBe(6);
    expect(render.theoreticalWeight).toBe(18);

    const presenter = new ExplicitNotePresenter(render, buildExplicitSkinView('/'));
    const layout = { judgmentLineY: 426, scrollSpeed: 200, laneAreaX: 0, height: 600 };
    for (const iteration of [0, 1]) {
      playFramesUntilBoundary(time => playback.advanceTo(time), preview.loopMs);
      for (const cycle of [0, 1, 2]) {
        const snapshot = playback.renderSnapshot(cycle);
        expect(snapshot.items).toHaveLength(6);
        expect(snapshot.bodyUnits).toHaveLength(3);
        // present는 항목 id·source index·body ref가 하나라도 빠지거나 어긋나면 던진다.
        const notes = presenter.present(snapshot, layout);
        expect(notes.map(note => note.sourceNoteIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
        expect(notes.filter(note => note.kind === 'tap').map(note => note.layers[0].visible))
          .toEqual([cycle !== 0, cycle !== 1, cycle !== 2]);
      }
      const finished = playback.finishPattern();
      expect(finished.iteration).toBe(iteration);
      expect(finished.result.score.judgmentCounts).toMatchObject({ perfect: 2, miss: 0 });
      expect(finished.result.score.earnedScore).toBe(6);
      expect(finished.result.score.processedNotes).toBe(2);
      expect(finished.result.facts.find(fact => fact.kind === 'settlement' && fact.itemKind === 'release'))
        .toMatchObject({ outcome: 'graded', grade: 'perfect', atMs: 2000 });
    }
    playback.stop();
  });

  it('바인딩으로 옮긴 시연 입력으로 두 반복을 프레임 진행하면 반복 0·1 모두 Perfect 5·15점·Miss 0', () => {
    const { preview, playback } = createDemo();
    const finished = [0, 1].map(() => {
      playFramesUntilBoundary(time => playback.advanceTo(time), preview.loopMs);
      return playback.finishPattern();
    });

    expect(finished.map(pattern => pattern.iteration)).toEqual([0, 1]);
    for (const { result } of finished) {
      expect(result.score.judgmentCounts).toMatchObject({ perfect: 5, miss: 0 });
      expect(result.score.earnedScore).toBe(15);
      expect(result.score.processedNotes).toBe(5);
    }
    playback.stop();
  });

  it('반복 경계 2000ms와 같은 시각의 마지막 up은 finishPattern이 끝난 반복에서 릴리즈 Perfect로 정산', () => {
    const { preview, playback } = createDemo();
    playFramesUntilBoundary(time => playback.advanceTo(time), preview.loopMs);
    expect(playback.renderSnapshot(1).items.find(item => item.id === 'n9:release:0')?.state).toBe('pending');

    const { result } = playback.finishPattern();
    const release = result.facts.find(fact => fact.kind === 'settlement' && fact.itemKind === 'release');
    expect(release).toMatchObject({ outcome: 'graded', grade: 'perfect', atMs: 2000 });
    playback.stop();
  });

  it('반복마다 타격은 1레인 1번·2레인 2번·3레인 2번(탭·릴리즈), 판정 글자는 확정 시각 500·1000·1500·2000ms의 4묶음이며 새 반복 첫 프레임 10ms에는 효과가 없음', () => {
    const { preview, port, playback } = createDemo();
    playFramesUntilBoundary(time => playback.advanceTo(time), preview.loopMs);
    playback.finishPattern();
    expect(port.showBombEffect.mock.calls.map(([lane]) => lane).sort()).toEqual([1, 2, 2, 3, 3]);
    expect(port.recordFlightJudgment).toHaveBeenCalledTimes(5);
    expect(port.showJudgmentGroup.mock.calls.map(([state]) => [state.confirmedAt, state.grade])).toEqual([
      [500, 'perfect'], [1000, 'perfect'], [1500, 'perfect'], [2000, 'perfect'],
    ]);

    playback.advanceTo(10);
    expect(port.showBombEffect).toHaveBeenCalledTimes(5);
    expect(port.showJudgmentGroup).toHaveBeenCalledTimes(4);
    playback.stop();
  });

  it('1700ms 표시 snapshot은 복사본 1의 3레인 바디가 유지 중이고, 경계 뒤 10ms에는 복사본 1이 다시 판정 전 상태', () => {
    const { playback } = createDemo();
    playback.advanceTo(0);
    playback.advanceTo(1700);
    const during = playback.renderSnapshot(1);
    expect(during.bodyUnits.find(unit => unit.id === 'b8:hold:0')).toMatchObject({ state: 'active', actualStartMs: 3500 });
    expect(during.items.find(item => item.id === 'n5:tap:0')?.state).toBe('success');
    expect(during.items.find(item => item.id === 'n0:tap:0')?.state).toBe('pending');

    playback.finishPattern();
    playback.advanceTo(10);
    const next = playback.renderSnapshot(1);
    expect(next.items.find(item => item.id === 'n5:tap:0')?.state).toBe('pending');
    expect(next.bodyUnits.find(unit => unit.id === 'b8:hold:0')?.state).toBe('waiting');
    playback.stop();
  });

  it('원본 compile을 표시 3벌로 합성하면 점수 항목이 원본 5개의 3배인 15개', () => {
    const { playback } = createDemo();
    expect(playback.renderChart.scoreItems).toHaveLength(15);
    playback.stop();
  });
});

describe('명시 튜토리얼 재생의 판정 창과 수명', () => {
  // 1레인 탭 500ms를 45ms 늦은 545ms에 누른다.
  const lateChart = () => demoChart([input(1, 'Binding1', beat(109, 100), beat(3, 2), 3)]);

  it('판정 창을 주지 않으면 고정 JUDGMENT_WINDOWS(Perfect 41ms)라 45ms 늦은 탭은 Great', () => {
    const { playback } = createDemo(lateChart());
    playback.advanceTo(600);
    expect(playback.renderSnapshot(1).items.find(item => item.id === 'n5:tap:0')).toMatchObject({ state: 'success', grade: 'great' });
    playback.stop();
  });

  it('JUDGMENT_WINDOWS_EASY(Perfect 50ms)를 넘기면 같은 45ms 늦은 탭이 Perfect', () => {
    const { playback } = createDemo(lateChart(), { windows: JUDGMENT_WINDOWS_EASY });
    playback.advanceTo(600);
    expect(playback.renderSnapshot(1).items.find(item => item.id === 'n5:tap:0')).toMatchObject({ state: 'success', grade: 'perfect' });
    playback.stop();
  });

  it.each([
    ['normal', 'great'], ['easy', 'perfect'],
  ] as const)('설정 judgmentMode=%s로 45ms 늦은 탭을 2회 시연하면 매회 %s로 정산한다', (judgmentMode, grade) => {
    const { playback } = createDemo(lateChart(), { windows: getJudgmentWindows(judgmentMode) });
    for (const iteration of [0, 1]) {
      playback.advanceTo(600);
      const pattern = playback.finishPattern();
      expect(pattern.iteration).toBe(iteration);
      expect(pattern.result.facts.find(fact => fact.kind === 'settlement' && fact.itemId === 'n0:tap:0'))
        .toMatchObject({ grade, atMs: 545 });
    }
    playback.stop();
  });

  it('stop 뒤 advanceTo·finishPattern은 dispose된 세션 오류로 거부하고 stop 두 번은 무해', () => {
    const { playback } = createDemo();
    playback.stop();
    playback.stop();
    expect(() => playback.advanceTo(100)).toThrow('dispose');
    expect(() => playback.finishPattern()).toThrow('dispose');
  });
});

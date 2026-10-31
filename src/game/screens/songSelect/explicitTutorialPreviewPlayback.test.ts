import { describe, expect, it, vi } from 'vitest';
import { JUDGMENT_WINDOWS_EASY } from '../../../shared/constants/judgment';
import { beat } from '../../../shared/types/beat';
import type { Beat } from '../../../shared/types/beat';
import type { ChartDocument, TutorialInputEvent } from '../../../shared/types/chart';
import type { ExplicitJudgmentEffectPort } from '../../judgment/ExplicitJudgmentEffectSink';
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

  it('표시 compile은 3벌 문서라 점수 항목이 원본 5개의 3배인 15개', () => {
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

  it('stop 뒤 advanceTo·finishPattern은 dispose된 세션 오류로 거부하고 stop 두 번은 무해', () => {
    const { playback } = createDemo();
    playback.stop();
    playback.stop();
    expect(() => playback.advanceTo(100)).toThrow('dispose');
    expect(() => playback.finishPattern()).toThrow('dispose');
  });
});

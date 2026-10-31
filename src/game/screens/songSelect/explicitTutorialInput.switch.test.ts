import { describe, expect, it } from 'vitest';
import { getJudgmentWindows } from '../../../shared/constants/judgment';
import { BASIC_TUTORIAL_EXPLICIT_PREVIEWS } from './basicTutorialExplicitPreviews';
import { createExplicitTutorialInput } from './explicitTutorialInput';
import { createExplicitTutorialPreviewPlayback } from './explicitTutorialPreviewPlayback';
import type { ExplicitTutorialPatternResult } from './explicitTutorialPreviewPlayback';
import { createTutorialPracticeSpec, createTutorialPracticeState, reduceTutorialPractice } from './tutorialPractice';

// 절대 입력 시각과 프레임 시각을 따로 진행한다. 입력·판정·반복·reducer는 모두 실제 구현이다.
// 시작 패턴 0은 시연 중 직접 입력으로 전환했으므로 집계하지 않는다.
type SwitchTiming = readonly [downE: number, upE: number, downD: number, upD: number];
function replaySwitch(loopStride: number, timings: readonly SwitchTiming[], deliveryLagMs = 0) {
  const preview = BASIC_TUTORIAL_EXPLICIT_PREVIEWS.find(preview => preview.id === 'connected-long-note-switch')!;
  const windows = getJudgmentWindows('easy');
  const playback = createExplicitTutorialPreviewPlayback(preview, { kind: 'live' }, {
    showJudgmentGroup() {}, recordFlightJudgment() {}, showBombEffect() {},
  }, { windows });
  let practice = createTutorialPracticeState(createTutorialPracticeSpec({
    conditions: [{ kind: 'targetAchievementRate', percent: 90 }], playingMethods: [{ id: 'practice' }],
  }));
  practice = reduceTutorialPractice(practice, { type: 'patternStarted', patternId: 0 });
  practice = reduceTutorialPractice(practice, { type: 'modeSelected', mode: 'directInput' });
  const finished: (ExplicitTutorialPatternResult & { successCount: number })[] = [];
  const input = createExplicitTutorialInput(playback,
    ['KeyE', 'KeyD', 'KeyC', 'KeyO'].map(key => ({ lane: 2, key })), preview.loopMs,
    () => ({ loopStartNow: 0, blocked: false }), pattern => {
      practice = reduceTutorialPractice(practice, { type: 'patternFinished', patternId: pattern.iteration, score: pattern.result.score });
      finished.push({ ...pattern, successCount: practice.successCount });
      if (practice.successCount === 3) return false;
      practice = reduceTutorialPractice(practice, { type: 'patternStarted', patternId: pattern.iteration + 1 });
    });
  const target = new EventTarget();
  input.attach(target);
  input.setMode('directInput');
  let frameMs = 0;
  const advanceTo = (at: number) => {
    for (; frameMs <= at; frameMs += 16) input.advanceTo(frameMs);
  };
  const playedIterations = new Set<number>();
  try {
    for (const [attempt, [downE, upE, downD, upD]] of timings.entries()) {
      if (practice.successCount === 3) break;
      const iteration = 1 + attempt * loopStride;
      playedIterations.add(iteration);
      const start = iteration * preview.loopMs;
      for (const [type, code, relativeMs] of [
        ['keydown', 'KeyE', downE], ['keyup', 'KeyE', upE],
        ['keydown', 'KeyD', downD], ['keyup', 'KeyD', upD],
      ] as const) {
        const at = start + relativeMs;
        advanceTo(at + deliveryLagMs);
        const event = new Event(type, { cancelable: true });
        Object.defineProperties(event, { code: { value: code }, timeStamp: { value: at }, repeat: { value: false } });
        target.dispatchEvent(event);
      }
      advanceTo(start + preview.loopMs + windows.GOOD + 32);
      expect(input.heldKeys).toEqual([]);
    }
    // 생략한 반복도 한 번씩 정산하며 다음 반복의 성공을 훔치거나 중복 정산하지 않는다.
    expect(finished.map(pattern => pattern.iteration)).toEqual(Array.from({ length: finished.length }, (_, index) => index));
    const attempts = finished.filter(pattern => playedIterations.has(pattern.iteration));
    const skipped = finished.filter(pattern => !playedIterations.has(pattern.iteration));
    expect(attempts).toHaveLength(playedIterations.size);
    for (const { result } of skipped) expect(result.score.achievementRate).toBe(0);
    for (const { result } of attempts) {
      expect(result.facts.filter(fact => fact.kind === 'bodyFailed')).toEqual([]);
      expect(result.score.judgmentCounts.miss).toBe(0);
      expect(result.facts.filter(fact => fact.kind === 'settlement' && fact.itemKind === 'release'))
        .toMatchObject([{ grade: 'perfect' }]);
    }
    return { attempts, successCount: practice.successCount };
  } finally {
    input.stop();
  }
}

// rAF 대기·명령 전달 32ms와 직렬 keyup 왕복 30ms를 주입한 사례다. 실제 브라우저에서 측정한 지연은 아니다.
const jitterMs = [2, 4, 1, 0, 3, 5, -1, 2];

describe.each([1, 2])('Easy에서 %i반복마다 connected-long-note-switch를 연주', loopStride => {
  it.each([0, 8])('E up→D down 4ms 간격·이벤트 전달 %ims 지연이면 경계 전후 교대 3회 모두 100%·3/3', deliveryLagMs => {
    const { attempts, successCount } = replaySwitch(loopStride, [
      [2990, 3490, 3494, 4007],
      [3001, 3501, 3505, 4018],
      [2998, 3498, 3502, 4015],
    ], deliveryLagMs);
    expect(attempts.map(({ result }) => result.score.achievementRate)).toEqual([100, 100, 100]);
    expect(attempts.map(pattern => pattern.successCount)).toEqual([1, 2, 3]);
    expect(successCount).toBe(3);
  });

  it('3488ms 대기 뒤 keyup 왕복으로 D가 3550ms±수ms에 도착하면 8회 중 2회만 90% 조건을 충족', () => {
    const { attempts, successCount } = replaySwitch(loopStride, jitterMs.map(jitter => [
      3020 + jitter, 3520 + jitter, 3550 + jitter, 4037 + jitter,
    ]));
    expect(attempts.map(({ result }) => result.score.judgmentCounts.perfect)).toEqual([2, 2, 2, 3, 2, 2, 3, 2]);
    expect(attempts.map(({ result }) => result.score.judgmentCounts.great)).toEqual([1, 1, 1, 0, 1, 1, 0, 1]);
    expect(attempts.map(pattern => pattern.successCount)).toEqual([0, 0, 0, 1, 1, 1, 2, 2]);
    expect(successCount).toBe(2);
    // 최소 실패 사례: 3500ms 탭에 3552ms down → Great. 바디·끝 릴리즈는 모두 정상이다.
    expect(attempts[0].result.score.achievementRate).toBeCloseTo(88.888889);
    expect(attempts[0].result.facts.filter(fact => fact.kind === 'settlement' && fact.itemKind === 'tap'))
      .toMatchObject([{ atMs: 3022, grade: 'perfect' }, { atMs: 3552, grade: 'great', rawDeltaMs: 52 }]);
  });

  it('E up을 3400ms에서 따로 기다리고 D down을 3488ms에서 기다리면 같은 지연·jitter에도 3회 모두 100%·3/3', () => {
    const { attempts, successCount } = replaySwitch(loopStride, jitterMs.map(jitter => [
      3020 + jitter, 3432 + jitter, 3520 + jitter, 4037 + jitter,
    ]));
    expect(attempts.map(({ result }) => result.score.achievementRate)).toEqual([100, 100, 100]);
    expect(attempts.map(pattern => pattern.successCount)).toEqual([1, 2, 3]);
    expect(successCount).toBe(3);
    // RFD 0037 §3-2: 앞 바디는 Good 이른 폭 안에서 정상 종료한다. 뒤 바디는 새 탭으로 시작한다.
    expect(attempts[0].result.facts.filter(fact => fact.kind === 'bodyCompleted'))
      .toMatchObject([{ atMs: 3434, reason: 'earlyUp' }, { atMs: 4000, reason: 'end' }]);
    expect(attempts[0].result.facts.filter(fact => fact.kind === 'bodyStarted'))
      .toMatchObject([{ actualStartMs: 3022 }, { actualStartMs: 3522 }]);
  });
});

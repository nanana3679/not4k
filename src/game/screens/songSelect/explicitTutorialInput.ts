import type { KeyBinding } from '../../input/InputSystem';
import type { ExplicitHeldKey } from '../../judgment/ExplicitJudgmentState';
import { createExplicitPlayInput } from '../explicitPlaySessionInput';
import { stepExplicitTutorialLoop } from './explicitTutorialLoop';
import type { ExplicitTutorialPatternResult, ExplicitTutorialPreviewPlayback, TutorialInputMode } from './explicitTutorialPreviewPlayback';

interface ExplicitTutorialInputFrame {
  /** 도식 확인으로 멈춘 경우 도식 시작점인, 화면과 같은 반복 내 시각 */
  loopTimeMs: number;
  /** 이번 프레임이 새 도식을 걸기 전의 paused·도식 대기 상태 */
  blocked: boolean;
}

/** offset은 적용하지 않는다. pause·도식 재개의 보정은 재생기가 소유한 loopStartNow에 이미 반영돼 있다. */
export function getExplicitTutorialInputTime(timestamp: number, loopStartNow: number, loopMs: number) {
  const elapsedMs = Math.max(0, timestamp - loopStartNow);
  const iteration = Math.floor(elapsedMs / loopMs);
  return { elapsedMs, iteration, loopTimeMs: elapsedMs - iteration * loopMs };
}

/** 실제 키와 누적 시각 큐는 세션보다 오래 산다. 경계를 넘기기 전 입력만 이전 세션에 전달한다. */
export function createExplicitTutorialInput(
  playback: ExplicitTutorialPreviewPlayback,
  bindings: readonly KeyBinding[],
  loopMs: number,
  getClock: () => { loopStartNow: number; blocked: boolean },
  onPatternFinished?: (pattern: ExplicitTutorialPatternResult) => void,
) {
  let mode: TutorialInputMode = 'demonstration';
  let iteration = 0;
  let lastElapsedMs = 0;
  let judging = false;
  let target: EventTarget | null = null;
  const heldByKey = new Map<string, ExplicitHeldKey>();
  const source = createExplicitPlayInput(bindings.filter(binding => binding.key !== "Escape"), {
    toInputTimeMs: timestamp => getExplicitTutorialInputTime(timestamp, getClock().loopStartNow, loopMs).elapsedMs,
  }, {
    beforeInput: () => syncJudging(),
    onLatePreparationHoldChange: () => syncPhysicalHeld(),
  });
  source.setJudging(false);
  const syncPhysicalHeld = () => {
    heldByKey.clear();
    for (const key of source.heldKeys) heldByKey.set(key.key, key);
    playback.syncHeldKeys(source.heldKeys);
  };
  const syncJudging = (blocked = getClock().blocked) => {
    const enabled = mode === "directInput" && !blocked;
    if (enabled === judging) return;
    judging = enabled;
    source.setJudging(enabled, getClock().loopStartNow + lastElapsedMs);
    if (enabled) syncPhysicalHeld();
  };
  const flush = (through: number, judge = true) => {
    source.timeline.flushThrough(through, (at, inputs) => {
      for (const input of inputs) {
        if (input.type === 'down' && input.lane !== undefined) heldByKey.set(input.key, { lane: input.lane, key: input.key });
        else heldByKey.delete(input.key);
        if (judge) playback.enqueue({ ...input, inputAt: Math.max(0, at - iteration * loopMs) });
      }
    });
  };
  // 모달은 버블 단계 window 핸들러를 사용한다. 직접 입력 레인 키는 capture에서 먼저 받고 차단한다.
  // Escape는 바인딩에 있더라도 닫기에 예약한다. 도식·paused 중에도 hold 추적은 유지한다.
  const reserveLaneKey = (event: Event) => {
    const { code } = event as KeyboardEvent;
    if (mode !== 'directInput' || code === 'Escape' || !bindings.some(binding => binding.key === code)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const detach = () => {
    target?.removeEventListener('keydown', reserveLaneKey, { capture: true });
    target?.removeEventListener('keyup', reserveLaneKey, { capture: true });
    target = null;
  };
  return {
    get heldKeys() { return source.heldKeys; },
    syncJudging,
    rebase() { iteration = 0; lastElapsedMs = 0; source.timeline.clear(); },
    attach(nextTarget: EventTarget) {
      detach();
      target = nextTarget;
      // 입력 수집 핸들러를 같은 capture 단계에서 차단 핸들러보다 먼저 등록한다.
      source.attach(target, true);
      target.addEventListener('keydown', reserveLaneKey, { capture: true });
      target.addEventListener('keyup', reserveLaneKey, { capture: true });
    },
    setMode(next: TutorialInputMode) {
      if (mode === next) return;
      mode = next;
      source.setJudging(false);
      judging = false;
      heldByKey.clear();
      for (const key of source.heldKeys) heldByKey.set(key.key, key);
      playback.setInputMode(mode, source.heldKeys);
      syncJudging();
    },
    advanceTo(elapsedMs: number, frame?: ExplicitTutorialInputFrame) {
      // 새 도식이 걸린 프레임도 직전 반복의 큐·경계는 정산한다. 키 이벤트는 항상 현재 getClock을 쓴다.
      const blocked = frame?.blocked ?? getClock().blocked;
      syncJudging(blocked);
      if (blocked) return;
      if (frame) {
        elapsedMs = Math.floor(Math.max(0, elapsedMs) / loopMs) * loopMs + frame.loopTimeMs;
      }
      // prop effect는 performance.now(), rAF는 프레임 시작 시각이다. 같은 프레임에서 순서가 뒤집혀도 seek하지 않는다.
      elapsedMs = Math.max(lastElapsedMs, elapsedMs);
      lastElapsedMs = elapsedMs;
      const loop = stepExplicitTutorialLoop({ elapsedMs, loopMs, previousIteration: iteration, frozen: false });
      let finished: ExplicitTutorialPatternResult | undefined;
      if (loop.finished) {
        flush((iteration + 1) * loopMs);
        // 긴 프레임 공백에도 이미 재생하던 패턴만 정산한다. 생략한 반복의 입력은 hold만 옮긴다.
        flush(loop.iteration * loopMs, false);
        finished = playback.finishPattern(mode === 'directInput' ? [...heldByKey.values()] : undefined);
        iteration = loop.iteration;
        onPatternFinished?.(finished);
      }
      flush(elapsedMs);
      playback.advanceTo(Math.max(0, elapsedMs - iteration * loopMs));
      // 프레임 정산 후에는 새 도식의 실제 대기로 돌아가 이후 입력을 막고 남은 큐를 버린다.
      syncJudging();
      return finished;
    },
    stop() { detach(); source.dispose(); playback.stop(); },
  };
}

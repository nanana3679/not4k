import type { KeyBinding } from '../../input/InputSystem';
import type { ExplicitHeldKey } from '../../judgment/ExplicitJudgmentState';
import { createExplicitPlayInput } from '../explicitPlaySessionInput';
import { stepExplicitTutorialLoop } from './explicitTutorialLoop';
import type { ExplicitTutorialClosingPattern, ExplicitTutorialPatternResult, ExplicitTutorialPreviewPlayback, TutorialInputMode } from './explicitTutorialPreviewPlayback';

interface ExplicitTutorialInputFrame {
  /** 도식 확인으로 멈춘 경우 도식 시작점인, 화면과 같은 반복 내 시각 */
  loopTimeMs: number;
  /** 이번 프레임이 새 도식을 걸기 전의 paused·도식 대기 상태 */
  blocked: boolean;
}

// 글자를 입력받는 input type. checkbox·radio·button 같은 input은 아래 동작 키만 가져간다.
const ACTION_INPUT_TYPES = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'image', 'file', 'color', 'range']);

/** 입력 수집과 모달 탐색 모두 포커스된 컨트롤의 동작·편집 키를 양보한다. */
export function isTutorialControlInput(event: KeyboardEvent): boolean {
  // 이벤트 대상은 포커스를 가진 요소다. button 안의 자식과 contenteditable 자식도 포함한다.
  for (let element = event.target as HTMLElement | null; element; element = element.parentElement) {
    const inputType = element.tagName === 'INPUT' ? ((element as HTMLInputElement).type || 'text').toLowerCase() : null;
    if ((inputType !== null && !ACTION_INPUT_TYPES.has(inputType))
      || ['TEXTAREA', 'SELECT'].includes(element.tagName) || element.isContentEditable) return true;
    if (inputType !== null && ['Enter', 'NumpadEnter', 'Space'].includes(event.code)) return true;
    if (inputType === 'range' && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.code)) return true;
    const role = element.getAttribute?.('role');
    if (role === 'textbox' || role === 'combobox') return true;
    if (['Enter', 'NumpadEnter', 'Space'].includes(event.code)
      && (['BUTTON', 'SUMMARY'].includes(element.tagName)
        || ['button', 'switch', 'checkbox', 'radio', 'tab', 'menuitem', 'option'].includes(role ?? ''))) return true;
    if (['Enter', 'NumpadEnter'].includes(event.code) && element.tagName === 'A') return true;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.code)
      && ['tab', 'radio', 'slider', 'spinbutton', 'menuitem', 'option'].includes(role ?? '')) return true;
  }
  return false;
}

/** pause·도식 재개의 보정은 재생기가 소유한 loopStartNow에 이미 반영돼 있다. */
export function getExplicitTutorialInputTime(timestamp: number, loopStartNow: number, loopMs: number) {
  const elapsedMs = Math.max(0, timestamp - loopStartNow);
  const iteration = Math.floor(elapsedMs / loopMs);
  return { elapsedMs, iteration, loopTimeMs: elapsedMs - iteration * loopMs };
}

/** 실제 키와 누적 시각 큐는 세션보다 오래 산다. 경계에서 유지하던 키의 up만 이전 세션의 판정 기한까지 전달한다. */
export function createExplicitTutorialInput(
  playback: ExplicitTutorialPreviewPlayback,
  bindings: readonly KeyBinding[],
  loopMs: number,
  getClock: (timestamp?: number) => { loopStartNow: number; blocked: boolean; inputOffsetMs?: number },
  // 정산 뒤 다음 UI 패턴을 알린다. 경계의 물리 세션은 이미 열렸을 수 있으며 false면 이후 진행을 멈춘다.
  onPatternFinished?: (pattern: ExplicitTutorialPatternResult) => false | void,
  ownsKeyboardInput: (event: KeyboardEvent) => boolean = () => true,
) {
  let mode: TutorialInputMode = 'demonstration';
  let boundaryStopped = false;
  let iteration = 0;
  let lastElapsedMs = 0;
  let pendingBoundary: { iteration: number; elapsedMs: number; observedElapsedMs: number; blocked: boolean } | null = null;
  let closingPattern: {
    session: ExplicitTutorialClosingPattern;
    startMs: number;
    deadlineMs: number;
    heldByKey: Map<string, ExplicitHeldKey>;
  } | null = null;
  let judging = false;
  let target: EventTarget | null = null;
  const ownsEvent = (event: KeyboardEvent) => ownsKeyboardInput(event) && !isTutorialControlInput(event);
  const heldByKey = new Map<string, ExplicitHeldKey>();
  const unownedReleases: { at: number; key: string }[] = [];
  // GameClock과 같은 부호: 늦은 입력은 음수 offset으로 앞당긴다. 화면·시연 시간은 옮기지 않는다.
  const inputTime = (timestamp: number) => {
    const clock = getClock();
    return getExplicitTutorialInputTime(timestamp + (clock.inputOffsetMs ?? 0), clock.loopStartNow, loopMs).elapsedMs;
  };
  const source = createExplicitPlayInput(bindings.filter(binding => binding.key !== "Escape"), {
    toInputTimeMs: inputTime,
  }, {
    ownsEvent,
    onUnownedRelease: (timestamp, key) => {
      unownedReleases.push({ at: inputTime(timestamp), key });
      unownedReleases.sort((a, b) => a.at - b.at);
    },
    beforeInput: timestamp => syncJudging(getClock(timestamp).blocked),
    onLatePreparationHoldChange: () => syncPhysicalHeld(),
  });
  source.setJudging(false);
  const syncPhysicalHeld = () => {
    heldByKey.clear();
    for (const key of source.heldKeys) heldByKey.set(key.key, key);
    playback.syncHeldKeys(source.heldKeys);
    if (closingPattern) {
      for (const key of closingPattern.heldByKey.keys()) {
        if (!heldByKey.has(key)) closingPattern.heldByKey.delete(key);
      }
      closingPattern.session.syncHeldKeys([...closingPattern.heldByKey.values()]);
    }
  };
  const syncJudging = (blocked = getClock().blocked) => {
    if (pendingBoundary && blocked) pendingBoundary.blocked = true;
    if (pendingBoundary?.blocked && !blocked) finishPendingBoundary();
    // 경계를 관측한 다음 프레임까지는 늦게 전달된 이전 패턴 입력도 수집한다.
    const enabled = mode === "directInput" && !boundaryStopped && (!blocked || pendingBoundary !== null);
    if (enabled === judging) return;
    judging = enabled;
    source.setJudging(enabled, getClock().loopStartNow + lastElapsedMs);
    if (!enabled) unownedReleases.length = 0;
    if (enabled) syncPhysicalHeld();
  };
  const flushInputs = (through: number, judge: boolean) => {
    source.timeline.flushThrough(through, (at, inputs) => {
      for (const input of inputs) {
        if (input.type === 'down' && input.lane !== undefined) heldByKey.set(input.key, { lane: input.lane, key: input.key });
        else heldByKey.delete(input.key);
        if (!judge) continue;
        if (closingPattern && at <= closingPattern.deadlineMs
          && (at <= closingPattern.startMs + loopMs
            || (input.type === 'up' && closingPattern.heldByKey.has(input.key)))) {
          // 경계까지 held였던 up은 이전 점수에만 쓴다. 새 세션에는 preheld 해제만 반영한다.
          closingPattern.session.enqueue({ ...input, inputAt: at - closingPattern.startMs });
          if (input.type === 'down' && input.lane !== undefined) {
            closingPattern.heldByKey.set(input.key, { lane: input.lane, key: input.key });
          } else closingPattern.heldByKey.delete(input.key);
          playback.advanceTo(Math.max(playback.renderSnapshot(0).atMs, at - iteration * loopMs));
          playback.syncHeldKeys([...heldByKey.values()]);
          continue;
        }
        if (iteration > 0 && at <= iteration * loopMs) {
          // 한 프레임의 대기보다 더 늦으면 이미 정산한 결과를 바꾸지 않으며 다음 패턴의 0ms 입력도 만들지 않는다.
          playback.syncHeldKeys([...heldByKey.values()]);
        } else playback.enqueue({ ...input, inputAt: Math.max(0, at - iteration * loopMs) });
      }
    });
  };
  const flush = (through: number, judge = true) => {
    while (unownedReleases.length && unownedReleases[0].at <= through) {
      const release = unownedReleases.shift()!;
      flushInputs(release.at, judge);
      heldByKey.delete(release.key);
      if (judge) {
        // 아직 큐에 있는 down부터 반영한 뒤 hold만 푼다. 가짜 up으로 release 점수를 만들지 않는다.
        playback.advanceTo(Math.max(playback.renderSnapshot(0).atMs, release.at - iteration * loopMs));
        playback.syncHeldKeys([...heldByKey.values()]);
        if (closingPattern?.heldByKey.delete(release.key)) {
          closingPattern.session.advanceTo(Math.min(release.at, closingPattern.deadlineMs) - closingPattern.startMs);
          closingPattern.session.syncHeldKeys([...closingPattern.heldByKey.values()]);
        }
      }
    }
    flushInputs(through, judge);
  };
  const reportFinished = (finished: ExplicitTutorialPatternResult) => {
    const continuation = onPatternFinished?.(finished);
    if (continuation === false) {
      boundaryStopped = true;
      syncJudging();
    }
  };
  const advanceClosingPattern = (elapsedMs: number) => {
    if (!closingPattern) return;
    const closing = closingPattern;
    flush(Math.min(elapsedMs, closing.deadlineMs));
    closing.session.advanceTo(Math.min(elapsedMs, closing.deadlineMs) - closing.startMs);
    if (elapsedMs < closing.deadlineMs) return;
    const finished = closing.session.finish();
    closingPattern = null;
    reportFinished(finished);
    return finished;
  };
  const finishBoundary = (nextIteration: number, elapsedMs: number) => {
    flush((iteration + 1) * loopMs);
    // 긴 프레임 공백에도 이미 재생하던 패턴만 정산한다. 생략한 반복의 입력은 hold만 옮긴다.
    flush(nextIteration * loopMs, false);
    const finished = playback.finishPattern(mode === 'directInput' ? [...heldByKey.values()] : undefined, nextIteration);
    iteration = nextIteration;
    reportFinished(finished);
    if (boundaryStopped) return finished;
    flush(elapsedMs);
    playback.advanceTo(Math.max(0, elapsedMs - iteration * loopMs));
    return finished;
  };
  const finishPendingBoundary = () => {
    if (!pendingBoundary) return;
    const pending = pendingBoundary;
    pendingBoundary = null;
    const finished = finishBoundary(pending.iteration, pending.elapsedMs);
    if (pending.blocked) {
      // 대기 중 입력은 물리 hold에만 남긴다. 재개 뒤 첫 이벤트보다 먼저 큐와 수락 기준을 갱신한다.
      source.setJudging(false);
      judging = false;
      unownedReleases.length = 0;
    }
    return finished;
  };
  // 모달은 버블 단계 window 핸들러를 사용한다. 직접 입력 레인 키는 capture에서 먼저 받고 차단한다.
  // Escape는 바인딩에 있더라도 닫기에 예약한다. 도식·paused 중에도 hold 추적은 유지한다.
  const reserveLaneKey = (event: Event) => {
    const { code } = event as KeyboardEvent;
    if (mode !== 'directInput' || getClock((event as KeyboardEvent).timeStamp).blocked || !ownsEvent(event as KeyboardEvent)
      || code === 'Escape' || !bindings.some(binding => binding.key === code)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const detach = () => {
    target?.removeEventListener('keydown', reserveLaneKey, { capture: true });
    target?.removeEventListener('keyup', reserveLaneKey, { capture: true });
    target = null;
  };
  const setMode = (next: TutorialInputMode) => {
    if (mode === next) return;
    finishPendingBoundary();
    boundaryStopped = false;
    mode = next;
    source.setJudging(false);
    unownedReleases.length = 0;
    judging = false;
    heldByKey.clear();
    for (const key of source.heldKeys) heldByKey.set(key.key, key);
    playback.setInputMode(mode, source.heldKeys);
    syncJudging();
  };
  return {
    get heldKeys() { return source.heldKeys; },
    /** 현재 loopStartNow 기준 세션의 반복 차수. 음수 오프셋·경계 대기 중에는 화면보다 늦고 rebase 때 0으로 돌아간다. */
    get sessionIteration() { return iteration; },
    syncJudging,
    rebase(resumeTimestamp: number) {
      finishPendingBoundary();
      if (closingPattern) {
        closingPattern.startMs -= iteration * loopMs;
        closingPattern.deadlineMs -= iteration * loopMs;
      }
      playback.rebaseIteration();
      iteration = 0;
      lastElapsedMs = Math.max(0, resumeTimestamp - getClock().loopStartNow);
      judging = false;
      source.setJudging(false);
      unownedReleases.length = 0;
    },
    attach(nextTarget: EventTarget) {
      detach();
      target = nextTarget;
      // 입력 수집 핸들러를 같은 capture 단계에서 차단 핸들러보다 먼저 등록한다.
      source.attach(target, true);
      target.addEventListener('keydown', reserveLaneKey, { capture: true });
      target.addEventListener('keyup', reserveLaneKey, { capture: true });
    },
    setMode,
    advanceTo(elapsedMs: number, frame?: ExplicitTutorialInputFrame) {
      if (boundaryStopped) return;
      const observedElapsedMs = elapsedMs;
      let finished = pendingBoundary && elapsedMs > pendingBoundary.observedElapsedMs
        ? finishPendingBoundary() : undefined;
      if (boundaryStopped) return finished;
      // 새 도식이 걸린 프레임도 직전 반복의 큐·경계는 정산한다. 키 이벤트는 항상 현재 getClock을 쓴다.
      const blocked = frame?.blocked ?? getClock().blocked;
      syncJudging(blocked);
      if (blocked) return finished;
      if (frame) {
        elapsedMs = Math.floor(Math.max(0, elapsedMs) / loopMs) * loopMs + frame.loopTimeMs;
      }
      // prop effect는 performance.now(), rAF는 프레임 시작 시각이다. 같은 프레임에서 순서가 뒤집혀도 seek하지 않는다.
      elapsedMs = Math.max(lastElapsedMs, elapsedMs);
      lastElapsedMs = elapsedMs;
      // 실제 플레이처럼 음수 offset만큼 core를 뒤에 둔다. 보정 입력이 끝에 닿기 전에는 반복도 정산하지 않는다.
      if (mode === 'directInput') elapsedMs = Math.max(0, Math.min(elapsedMs, elapsedMs + (getClock().inputOffsetMs ?? 0)));
      finished = advanceClosingPattern(elapsedMs) ?? finished;
      if (boundaryStopped) return finished;
      const loop = stepExplicitTutorialLoop({ elapsedMs, loopMs, previousIteration: iteration, frozen: false });
      if (loop.finished) {
        if (mode === 'directInput') {
          flush((iteration + 1) * loopMs);
          playback.advanceTo(loopMs);
          if (playback.latestJudgmentDeadlineMs > loopMs) {
            const startMs = iteration * loopMs;
            closingPattern = {
              startMs,
              deadlineMs: startMs + playback.latestJudgmentDeadlineMs,
              heldByKey: new Map(heldByKey),
              session: playback.startNextPattern([...heldByKey.values()], loop.iteration),
            };
            iteration = loop.iteration;
            finished = advanceClosingPattern(elapsedMs) ?? finished;
            if (boundaryStopped) return finished;
          } else {
            pendingBoundary ??= { iteration: loop.iteration, elapsedMs, observedElapsedMs, blocked: getClock().blocked };
            return finished;
          }
        } else {
          finished = finishBoundary(loop.iteration, elapsedMs);
          if (boundaryStopped) return finished;
        }
      }
      flush(elapsedMs);
      // 시연에서 직접 입력으로 전환해 core 목표가 잠시 뒤로 가도 이미 처리한 판정을 되감지 않는다.
      playback.advanceTo(Math.max(0, playback.renderSnapshot(0).atMs, elapsedMs - iteration * loopMs));
      // 프레임 정산 후에는 새 도식의 실제 대기로 돌아가 이후 입력을 막고 남은 큐를 버린다.
      syncJudging();
      return finished;
    },
    stop() { detach(); source.dispose(); playback.stop(); },
  };
}

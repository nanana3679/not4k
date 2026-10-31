import { useCallback, useEffect, useRef, useState } from 'react';
import type { ScoreState } from '../../scoring/ScoreManager';
import type { TutorialLesson } from './tutorialCatalog';
import type { TutorialPreviewPlayerProps } from './TutorialPreviewPlayer';
import {
  createTutorialPracticeState, getSelectedTutorialPracticeMode, getTutorialPracticeProgress,
  isTutorialPlayingMethodComplete, isTutorialPracticeItemPassed, reduceTutorialPractice,
  type TutorialPracticeEvent, type TutorialPracticeState,
} from './tutorialPractice';

interface PracticeView {
  lesson: TutorialLesson;
  generation: number;
  state: TutorialPracticeState | null;
  liveScore: Readonly<ScoreState> | null;
  combo: number;
}
function createView(lesson: TutorialLesson, generation: number): PracticeView {
  return { lesson, generation, state: lesson.practice ? createTutorialPracticeState(lesson.practice) : null,
    liveScore: null, combo: 0 };
}

/** React commit보다 먼저 오는 반복 경계에도 reducer 결과를 즉시 반환한다. 카운터는 모달 수명 동안 유지한다. */
export function useTutorialPractice(initialLesson: TutorialLesson, onItemPassed?: (itemId: string) => void) {
  const [view, setView] = useState(() => createView(initialLesson, 0));
  const viewRef = useRef(view);
  const nextPatternId = useRef(1);
  const onItemPassedRef = useRef(onItemPassed);
  useEffect(() => { onItemPassedRef.current = onItemPassed; }, [onItemPassed]);
  const publish = useCallback((next: PracticeView) => { viewRef.current = next; setView(next); }, []);
  const reset = useCallback((lesson: TutorialLesson) => {
    publish(createView(lesson, viewRef.current.generation + 1));
  }, [publish]);
  const dispatch = useCallback((event: TutorialPracticeEvent) => {
    const previous = viewRef.current;
    if (!previous.state) return null;
    const state = reduceTutorialPractice(previous.state, event);
    const methodChanged = state.playingMethodIndex !== previous.state.playingMethodIndex;
    publish({ ...previous, state, ...(methodChanged ? {
      generation: previous.generation + 1, liveScore: null, combo: 0,
    } : {}) });
    if (!isTutorialPracticeItemPassed(previous.state) && isTutorialPracticeItemPassed(state)) {
      onItemPassedRef.current?.(previous.lesson.id);
    }
    return state;
  }, [publish]);
  // 나가는 슬롯이나 이전 차트의 늦은 콜백이 새 레슨 상태를 건드리지 못하게 세대를 확인한다.
  const isCurrent = () => viewRef.current.generation === view.generation;
  const playerProps: Pick<TutorialPreviewPlayerProps, 'playbackRevision' | 'inputMode' | 'onPatternStarted' | 'onPatternFinished' | 'onScoreChanged'> = {
    playbackRevision: view.state?.playingMethodIndex,
    inputMode: view.state?.mode ?? 'demonstration',
    onPatternStarted: () => {
      if (!isCurrent()) return;
      publish({ ...viewRef.current, liveScore: null, combo: 0 });
      return dispatch({ type: 'patternStarted', patternId: nextPatternId.current++ })?.mode;
    },
    onPatternFinished: pattern => {
      if (!isCurrent()) return false;
      const patternId = viewRef.current.state?.currentPatternId;
      if (patternId === null || patternId === undefined) return;
      // 세션 finalize가 반환한 점수로 reducer의 'final' 평가를 실행해 늦은 무점수 바디 Miss까지 반영한다.
      const finalizedScore = pattern.result.score;
      const state = dispatch({ type: 'patternFinished', patternId, score: finalizedScore });
      publish({ ...viewRef.current, liveScore: null, combo: pattern.result.combo });
      if (state && isTutorialPlayingMethodComplete(state) && state.mode === 'directInput') return false;
    },
    onScoreChanged: (score, combo) => {
      if (isCurrent()) publish({ ...viewRef.current, liveScore: score, combo });
    },
  };
  return {
    state: view.state,
    lessonId: view.lesson.id,
    score: view.liveScore && view.liveScore.processedNotes > 0
      ? view.liveScore : view.state?.lastFinishedPattern?.score ?? view.liveScore,
    combo: view.combo,
    selectedMode: view.state ? getSelectedTutorialPracticeMode(view.state) : 'demonstration',
    progress: view.state ? getTutorialPracticeProgress(view.state) : null,
    stopped: !!view.state && isTutorialPlayingMethodComplete(view.state) && view.state.mode === 'directInput',
    reset, dispatch, playerProps,
  };
}

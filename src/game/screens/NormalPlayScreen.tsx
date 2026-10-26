import { useCallback, useEffect } from 'react';
import { useGameStore } from '../stores';
import type { ExplicitSessionResult } from '../judgment/ExplicitJudgmentSession';
import { ExplicitPlayScreen } from './ExplicitPlayScreen';

/** 곡 선택의 요청과 실제 세션 정산을 연결한다. 판정·점수 계산은 세션이 소유한다. */
export function NormalPlayScreen() {
  const request = useGameStore(state => state.normalPlay);
  const completeNormalPlay = useGameStore(state => state.completeNormalPlay);
  const releaseNormalPlay = useGameStore(state => state.releaseNormalPlay);
  const setScreen = useGameStore(state => state.setScreen);
  const complete = useCallback((result: ExplicitSessionResult) => {
    if (request) completeNormalPlay(request, result);
  }, [request, completeNormalPlay]);
  useEffect(() => () => {
    if (request) releaseNormalPlay(request);
  }, [request, releaseNormalPlay]);

  if (!request) return <div role="alert">
    <p>No song loaded.</p>
    <button onClick={() => setScreen('songSelect')}>Back to Song Select</button>
  </div>;
  return <ExplicitPlayScreen request={request} presentation="play" onComplete={complete}
    onExit={() => setScreen('songSelect')} />;
}

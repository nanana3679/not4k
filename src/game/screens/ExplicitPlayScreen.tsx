import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { color, edge, font, primitives, radius, surface } from '../../shared/theme';
import type { ExplicitSessionResult } from '../judgment/ExplicitJudgmentSession';
import { useGameStore } from '../stores';
import type { ExplicitPlayRequest } from '../stores/explicitPlayRequest';
import { ExplicitPlayRuntime } from './ExplicitPlayRuntime';
import type { ExplicitPlayPhase } from './ExplicitPlayRuntime';
import './ExplicitPlayScreen.css';

export interface ExplicitPlayScreenProps {
  request?: ExplicitPlayRequest;
  onExit?: () => void;
  presentation?: 'test' | 'play';
  onComplete?: (result: ExplicitSessionResult) => void;
}

export function ExplicitPlayScreen({ request: suppliedRequest, onExit, presentation = 'test', onComplete }: ExplicitPlayScreenProps = {}) {
  const storedRequest = useGameStore(state => state.explicitPlay);
  const request = suppliedRequest ?? (presentation === 'test' ? storedRequest : null);
  const navigate = useNavigate();
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const runtime = useRef<ExplicitPlayRuntime | null>(null);
  const completion = useRef({ presentation, onComplete });
  const [iteration, setIteration] = useState(0);
  const [phase, setPhase] = useState<ExplicitPlayPhase>('loading');
  const [failure, setFailure] = useState<{ request: ExplicitPlayRequest; iteration: number; message: string } | null>(null);
  const error = failure?.request === request && failure?.iteration === iteration ? failure.message : null;
  const [result, setResult] = useState<ExplicitSessionResult | null>(null);
  const [progress, setProgress] = useState<{ settled: number; combo: number; at: number }>({ settled: 0, combo: 0, at: 0 });
  const [repeat, setRepeat] = useState(false);

  useEffect(() => { completion.current = { presentation, onComplete }; }, [presentation, onComplete]);

  useEffect(() => {
    if (!request || !canvas.current || !container.current) return;
    let completed = false;
    const player = new ExplicitPlayRuntime({ request, settings: useGameStore.getState().settings,
      canvas: canvas.current, width: container.current.clientWidth, height: container.current.clientHeight, inputTarget: window,
      onPhase: next => {
        if (runtime.current !== player) return;
        if (next === 'loading') { setResult(null); setFailure(null); setProgress({ settled: 0, combo: 0, at: 0 }); }
        setPhase(next);
      },
      onResult: next => {
        if (runtime.current !== player || completed) return;
        completed = true;
        if (completion.current.presentation === 'play') completion.current.onComplete?.(next);
        else setResult(next);
      },
      onError: reason => { if (runtime.current === player) setFailure({ request, iteration, message: reason.message }); },
      onProgress: (state, at) => { if (runtime.current === player) setProgress({ ...state, at }); },
    });
    runtime.current = player;
    void player.start();
    return () => {
      if (runtime.current === player) { runtime.current = null; player.dispose(); }
    };
  }, [request, iteration]);

  useEffect(() => {
    if (presentation !== 'test' || !repeat || phase !== 'finished') return;
    const timer = window.setTimeout(() => {
      setResult(null); setFailure(null); setProgress({ settled: 0, combo: 0, at: 0 }); setPhase('loading'); setIteration(value => value + 1);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [phase, repeat, presentation]);

  const close = () => {
    const player = runtime.current;
    runtime.current = null;
    player?.dispose();
  };
  const reset = () => {
    close();
    setResult(null); setFailure(null); setProgress({ settled: 0, combo: 0, at: 0 }); setPhase('loading'); setIteration(value => value + 1);
  };
  const back = () => {
    runtime.current?.downloadDebugLog();
    close();
    if (onExit) { onExit(); return; }
    if (presentation === 'play') { useGameStore.getState().setScreen('songSelect'); return; }
    const returnUrl = request?.returnUrl ?? '/game';
    useGameStore.getState().clearExplicitPlayTest();
    navigate(returnUrl);
  };

  return <div ref={container} className="explicit-play" data-testid="explicit-play" data-phase={phase}
    data-iteration={iteration} data-settled={progress.settled} data-combo={progress.combo} data-visual-time={progress.at}>
    {(presentation === 'test' || (request && !error)) &&
      <canvas key={iteration} ref={canvas} data-testid={presentation === 'play' ? 'gameplay-canvas' : 'explicit-play-canvas'} />}
    {presentation === 'test' && <div className="explicit-play__controls">
      <span>명시 차트 · {request && request.startTimeMs > 0 ? '커서부터 테스트' : '처음부터 테스트'}</span>
      <button onClick={() => runtime.current?.togglePause()} disabled={phase !== 'playing' && phase !== 'paused' && phase !== 'music-preparation'}>{phase === 'paused' ? '계속' : '일시정지'}</button>
      <button onClick={reset} disabled={!request}>{request && request.startTimeMs > 0 ? '커서부터 다시' : '처음부터 다시'}</button>
      <label><input type="checkbox" checked={repeat} onChange={event => setRepeat(event.target.checked)} />반복</label>
      <button onClick={back}>돌아가기</button>
    </div>}
    {request && !error && phase === 'loading' && <p className="explicit-play__notice" role="status">음원과 표시 준비 중</p>}
    {phase === 'music-preparation' && <p className="explicit-play__notice" role="status">음악 준비 중 · 키를 자유롭게 바꿀 수 있습니다</p>}
    {presentation === 'test' && phase === 'paused' && <p className="explicit-play__notice" role="status">일시정지 · Esc로 계속</p>}
    {presentation === 'play' && phase === 'paused' && <div className={`explicit-play__pause${import.meta.env.DEV ? ' explicit-play__pause--dev' : ''}`}>
      <section className="explicit-play__pause-menu" aria-label="Paused" style={normalStyles.panel}>
        <h2 style={normalStyles.title}>Paused</h2>
        <div className="explicit-play__pause-buttons">
          <button style={normalStyles.resume} onClick={() => runtime.current?.togglePause()}>Resume</button>
          <button style={normalStyles.retry} onClick={reset}>Retry</button>
          <button style={normalStyles.quit} onClick={back}>Quit</button>
        </div>
      </section>
    </div>}
    {(!request || error) && (presentation === 'play'
      ? <div className="explicit-play__error" style={primitives.screen}>
        <p role="alert" style={{ color: color.danger }}>{error ?? '재생할 차트가 없습니다.'}</p>
        <button style={normalStyles.resume} onClick={back}>Back to Song Select</button>
      </div>
      : <p className="explicit-play__notice" role="alert">{error ?? '테스트할 명시 차트가 없습니다.'}</p>)}
    {presentation === 'test' && result && <section className="explicit-play__result" aria-label="테스트 정산" data-testid="explicit-play-result">
      <h1>이번 테스트 정산</h1>
      <p>테스트 플레이 결과입니다.</p>
      <dl>
        <dt>점수 항목</dt><dd data-testid="explicit-settled">{result.score.processedNotes} / {result.score.totalNotes}</dd>
        <dt>획득 점수</dt><dd data-testid="explicit-earned">{result.score.earnedScore}</dd>
        <dt>최종 분모</dt><dd data-testid="explicit-denominator">{result.score.finalDenominatorWeight}</dd>
        <dt>테스트 비율</dt><dd>{result.score.finalDenominatorWeight > 0 ? `${result.score.achievementRate.toFixed(2)}%` : '점수 노트 없음'}</dd>
        <dt>종료 콤보</dt><dd>{result.combo}</dd>
        {Object.entries(result.score.judgmentCounts).map(([grade, count]) => <div key={grade}><dt>{grade}</dt><dd data-grade={grade}>{count}</dd></div>)}
        <dt>FAST / SLOW</dt><dd>{result.score.fastCount} / {result.score.slowCount}</dd>
        <dt>종속 0점</dt><dd data-testid="explicit-dependent-zero">{result.snapshot.items.filter(item => item.state === 'dependentZero').length}</dd>
        <dt>바디 완료 / 실패</dt><dd data-testid="explicit-bodies">{result.snapshot.bodyUnits.filter(unit => unit.state === 'complete').length} / {result.snapshot.bodyUnits.filter(unit => unit.state === 'failed').length}</dd>
      </dl>
      <button onClick={reset}>다시 재생</button> <button onClick={back}>돌아가기</button>
    </section>}
  </div>;
}

const normalStyles = {
  panel: { background: surface.panel, border: `1px solid ${color.line}`, boxShadow: edge.metal,
    borderRadius: radius.md, color: color.ink, fontFamily: font.body },
  title: { fontFamily: font.display, color: color.inkStrong },
  resume: { ...primitives.neonButton, minHeight: 'auto', fontSize: '18px', padding: '12px 24px' },
  retry: { ...primitives.metalButton, minHeight: 'auto', fontSize: '18px', padding: '12px 24px', color: color.gold,
    border: `1px solid ${color.gold}66` },
  quit: { ...primitives.metalButton, minHeight: 'auto', fontSize: '18px', padding: '12px 24px', color: '#ff8578',
    border: `1px solid ${color.danger}66` },
};

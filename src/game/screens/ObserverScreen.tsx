import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { color, primitives } from '../../shared/theme';
import { useGameStore } from '../stores';
import { OBSERVER_MINIMAP_EDGE_MARGIN, OBSERVER_MINIMAP_WIDTH } from '../observer/observerMinimapGeometry';
import { ObserverPlayRuntime } from './ObserverPlayRuntime';
import type { ObserverPlayPhase, ObserverPlayState } from './ObserverPlayRuntime';
import { ObserverMinimap } from './ObserverMinimap';
import './ObserverScreen.css';

const initialState: ObserverPlayState = { autoEnabled: true, manualStats: null, songTimeMs: 0, range: null, durationMs: 0 };

/** 문서·음원은 LoadingScreen, 반복·판정·HUD는 runtime이 소유한다. 화면은 조작과 수명만 연결한다. */
export function ObserverScreen() {
  const request = useGameStore(state => state.observerPlay);
  const laneKeys = useRef<ReadonlySet<string> | null>(null);
  const field = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const runtime = useRef<ObserverPlayRuntime | null>(null);
  const [phase, setPhase] = useState<ObserverPlayPhase>('loading');
  const [playback, setPlayback] = useState<ObserverPlayState>(initialState);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!request || !canvas.current || !field.current) return;
    // Esc는 React의 다음 render를 기다리지 않고 실제 runtime phase로 판단한다(#276).
    let currentPhase: ObserverPlayPhase = 'loading';
    const settings = useGameStore.getState().settings;
    // runtime 입력과 같은 생성 시점의 바인딩을 유지한다. 설정 변경은 다음 runtime부터 반영한다.
    laneKeys.current = new Set(Object.values(settings.keyBindings).flat());
    const player = new ObserverPlayRuntime({
      request, settings, canvas: canvas.current,
      width: field.current.clientWidth, height: field.current.clientHeight, inputTarget: window,
      // 미니맵 폭과 오른쪽 여백, 키보드 표시와의 간격만큼 비운다.
      reservedRightPx: OBSERVER_MINIMAP_WIDTH + OBSERVER_MINIMAP_EDGE_MARGIN * 2,
      onPhase: next => {
        if (runtime.current !== player) return;
        currentPhase = next;
        setPhase(next);
        if (next === 'loading') { setPlayback(initialState); setError(null); }
      },
      onState: next => { if (runtime.current === player) setPlayback(next); },
      onError: reason => { if (runtime.current === player) setError(reason.message); },
    });
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.code !== 'Escape' || event.repeat || runtime.current !== player) return;
      if (currentPhase !== 'playing' && currentPhase !== 'paused') return;
      event.preventDefault();
      player.togglePause();
    };
    runtime.current = player;
    window.addEventListener('keydown', onKeyDown);
    void player.start();
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (runtime.current === player) { runtime.current = null; laneKeys.current = null; player.dispose(); }
    };
  }, [request]);

  const exit = () => {
    const player = runtime.current;
    runtime.current = null;
    laneKeys.current = null;
    player?.dispose();
    const store = useGameStore.getState();
    if (request) store.clearObserverPlay(request);
    else store.setScreen('songSelect');
  };
  const protectLaneKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    // Enter는 keydown, Space는 keyup에서 버튼을 활성화한다. 기본 동작만 막고
    // window까지 전파해 실제 레인 down/up은 InputSystem에 그대로 전달한다.
    if (laneKeys.current?.has(event.code)) event.preventDefault();
  };
  const buttonKeys = { onKeyDown: protectLaneKey, onKeyUp: protectLaneKey };
  const ready = !!request && !error && (phase === 'playing' || phase === 'paused');

  return <div className="observer-screen" style={styles.screen} data-testid="observer-screen" data-phase={phase}>
    {/* 상단 바 대신 노트 필드 왼쪽 위에 떠 있는 버튼이다. 화면 위쪽과 오른쪽(미니맵 자리)을 비운다. */}
    <div className="observer-screen__controls" role="toolbar" aria-label="Observer controls"
      aria-orientation="vertical" style={styles.controls}>
      <button type="button" {...buttonKeys} aria-label="Auto" aria-pressed={playback.autoEnabled}
        style={playback.autoEnabled ? styles.autoOn : styles.button} disabled={!ready}
        onClick={() => runtime.current?.setAuto(!playback.autoEnabled)}>
        Auto <span aria-hidden="true">{playback.autoEnabled ? 'On' : 'Off'}</span>
      </button>
      <button type="button" {...buttonKeys} style={styles.button} disabled={!ready} aria-keyshortcuts="Escape"
        onClick={() => runtime.current?.togglePause()}>{phase === 'paused' ? 'Play' : 'Pause'}</button>
      <button type="button" {...buttonKeys} style={styles.retry} disabled={!ready}
        onClick={() => runtime.current?.retry()}>Retry</button>
      <button type="button" {...buttonKeys} style={styles.button} onClick={exit}>Exit</button>
      {(!request || error) && <p className="observer-screen__error" role="alert" style={styles.error}>
        {error ?? 'No song loaded.'} Use Exit to return to Song Select.
      </p>}
    </div>
    <div ref={field} className="observer-screen__field">
      {request && <canvas ref={canvas} data-testid="observer-canvas" aria-label="Observer note field" />}
    </div>
    {ready && playback.range && request && <ObserverMinimap document={request.document} timing={request.compiled.timing}
      durationMs={playback.durationMs} range={playback.range} positionMs={playback.songTimeMs} runtime={runtime} />}
  </div>;
}

const styles = {
  screen: { ...primitives.screen, position: 'relative', '--observer-focus': color.neon } as CSSProperties,
  controls: { ...primitives.panel, position: 'absolute', top: '16px', left: '16px', zIndex: 2,
    display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '8px', width: '128px', padding: '10px' },
  button: { ...primitives.metalButton, minHeight: '40px' },
  autoOn: { ...primitives.neonButton, minHeight: '40px' },
  retry: { ...primitives.metalButton, minHeight: '40px', color: color.gold },
  error: { color: color.danger, margin: 0, fontSize: '12px' },
} satisfies Record<string, CSSProperties>;

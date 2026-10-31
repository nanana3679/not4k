import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { color, font, primitives } from '../../shared/theme';
import { useGameStore } from '../stores';
import { ObserverPlayRuntime } from './ObserverPlayRuntime';
import type { ObserverPlayPhase, ObserverPlayState } from './ObserverPlayRuntime';
import './ObserverScreen.css';

const initialState: ObserverPlayState = { autoEnabled: true, manualStats: null, songTimeMs: 0 };

/** 문서·음원은 LoadingScreen, 반복·판정·HUD는 runtime이 소유한다. 화면은 조작과 수명만 연결한다. */
export function ObserverScreen() {
  const request = useGameStore(state => state.observerPlay);
  const keyBindings = useGameStore(state => state.settings.keyBindings);
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
    const player = new ObserverPlayRuntime({
      request, settings: useGameStore.getState().settings, canvas: canvas.current,
      width: field.current.clientWidth, height: field.current.clientHeight, inputTarget: window,
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
      if (runtime.current === player) { runtime.current = null; player.dispose(); }
    };
  }, [request]);

  const exit = () => {
    const player = runtime.current;
    runtime.current = null;
    player?.dispose();
    const store = useGameStore.getState();
    if (request) store.clearObserverPlay(request);
    else store.setScreen('songSelect');
  };
  const protectLaneKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    // Enter는 keydown, Space는 keyup에서 버튼을 활성화한다. 기본 동작만 막고
    // window까지 전파해 실제 레인 down/up은 InputSystem에 그대로 전달한다.
    if (Object.values(keyBindings).some(keys => keys.includes(event.code))) event.preventDefault();
  };
  const buttonKeys = { onKeyDown: protectLaneKey, onKeyUp: protectLaneKey };
  const ready = !!request && !error && (phase === 'playing' || phase === 'paused');
  const seconds = Math.floor(Math.max(0, playback.songTimeMs) / 1000);
  const position = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  return <div className="observer-screen" style={styles.screen} data-testid="observer-screen" data-phase={phase}>
    <header className="observer-screen__toolbar" aria-label="Observer controls" style={styles.toolbar}>
      <h1 style={styles.title}>Observer</h1>
      <div className="observer-screen__buttons" role="group" aria-label="Playback controls">
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
      </div>
      <span className="observer-screen__phase" role="status" style={styles.status}>
        {request && !error && (phase === 'loading' ? 'Preparing audio and graphics'
          : phase === 'paused' ? 'Paused · Esc to play' : phase === 'playing' ? 'Playing · Esc to pause' : '')}
      </span>
      {ready && <span className="observer-screen__position" aria-label="Song position" style={styles.position}>{position}</span>}
    </header>
    {(!request || error) && <p className="observer-screen__error" role="alert" style={styles.error}>
      {error ?? 'No song loaded.'} Use Exit to return to Song Select.
    </p>}
    <div ref={field} className="observer-screen__field">
      {request && <canvas ref={canvas} data-testid="observer-canvas" aria-label="Observer note field" />}
    </div>
  </div>;
}

const styles = {
  screen: { ...primitives.screen, '--observer-focus': color.neon } as CSSProperties,
  toolbar: { ...primitives.header, justifyContent: 'flex-start', padding: '8px 16px' },
  title: { ...primitives.title, fontSize: '16px', letterSpacing: '0.02em' },
  button: { ...primitives.metalButton, minHeight: '44px' },
  autoOn: { ...primitives.neonButton, minHeight: '44px' },
  retry: { ...primitives.metalButton, minHeight: '44px', color: color.gold },
  status: { color: color.inkDim, fontSize: '13px' },
  position: { color: color.ink, fontFamily: font.numeric, fontSize: '18px' },
  error: { color: color.danger },
} satisfies Record<string, CSSProperties>;

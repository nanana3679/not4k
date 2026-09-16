import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../stores';
import { AudioEngine } from '../audio';
import { InputSystem, InputTimeline, AutoPlayer, type KeyBinding, type AutoSectionMs } from '../input';
import { NoteJudgmentSession } from '../judgment/NoteJudgmentSession';
import { SessionRendererAdapter, type SessionRendererPort } from '../judgment';
import { compileJudgmentChart, selectCompiledJudgmentChart } from '../judgment/compiledJudgmentChart';
import { GameClock } from '../time';
import { GameRenderer } from '../renderer';
import { GAME_HEIGHT, LANE_AREA_WIDTH, JUDGMENT_LINE_OFFSET } from '../renderer/constants';
import { font, color, surface, edge, radius, primitives } from '../../shared/theme';
import { SkinManager } from '../skin';
import { createChartTiming, getJudgmentWindows, normalizePlaybackRange } from '../../shared';
import { DebugLogger } from '../debug/DebugLogger';
import { drainPlaySessionInputs, stepPlaySession } from './playSessionInput';

export function PlayScreen() {
  const { setScreen, setResult, chartData, audioBuffer, selectedPlaybackRange, startTimeMs, editorReturnUrl, setStartTimeMs, setEditorReturnUrl } = useGameStore();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  // Game objects
  const audioEngineRef = useRef<AudioEngine | null>(null);
  const inputSystemRef = useRef<InputSystem | null>(null);
  const sessionRef = useRef<NoteJudgmentSession | null>(null);
  const inputTimelineRef = useRef<InputTimeline | null>(null);
  const rendererRef = useRef<GameRenderer | null>(null);
  const debugLoggerRef = useRef<DebugLogger | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const handleSongEnd = () => {
    const session = sessionRef.current;
    if (!session || !chartData) return;
    if (inputTimelineRef.current) drainPlaySessionInputs(inputTimelineRef.current, session, session.core.time, Number.POSITIVE_INFINITY);

    const state = session.finalize();
    // Output debug log if debug mode was active
    const debugLogger = debugLoggerRef.current;
    if (debugLogger) {
      const text = debugLogger.exportAsText();
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `debug-log-${Date.now()}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }

    setResult({
      songId: chartData.meta.title || 'unknown',
      difficulty: chartData.meta.difficultyLabel || 'NORMAL',
      achievementRate: state.achievementRate,
      rank: state.rank,
      isFullCombo: state.isFullCombo,
      judgmentCounts: state.judgmentCounts,
      goodTrillCount: state.goodTrillCount,
      fastCount: state.fastCount,
      slowCount: state.slowCount,
    });

    setScreen('result');
  };

  useEffect(() => {
    const init = async () => {
      if (!canvasRef.current || !containerRef.current) return;

      // Check if chart data and audio buffer are available
      if (!chartData || !audioBuffer) {
        setError('No chart or audio data loaded');
        return;
      }

      // 초기화 시점의 설정 스냅샷 — settings 객체 변경에 의한 재초기화 방지
      const settings = useGameStore.getState().settings;
      const playbackRange = normalizePlaybackRange(selectedPlaybackRange, audioBuffer.duration);
      const playableDurationMs = playbackRange
        ? (playbackRange.endTime - playbackRange.startTime) * 1000
        : audioBuffer.duration * 1000;

      try {
        // 차트의 시간 파생은 단일 ChartTiming 뷰가 소유한다 (노트 시작/끝 ms,
        // trillZone 시작 ms, 판정 수). renderer/judgment에 넘기는 것과 같은 인스턴스.
        const timing = createChartTiming(chartData);
        const { noteTimesMs, noteEndTimesMs } = timing;
        const compiledBase = compileJudgmentChart(chartData.notes, noteTimesMs, noteEndTimesMs, chartData.trillZones);
        const compiled = startTimeMs > 0 ? selectCompiledJudgmentChart(compiledBase, startTimeMs) : compiledBase;

        // Calculate logical width from viewport aspect ratio (height fixed)
        const containerW = containerRef.current!.clientWidth;
        const containerH = containerRef.current!.clientHeight;
        const aspectRatio = containerW / containerH;
        const logicalW = Math.max(Math.round(GAME_HEIGHT * aspectRatio), LANE_AREA_WIDTH + 80);
        const resolution = settings.renderHeight / GAME_HEIGHT;

        // Set canvas CSS size to fill container
        canvasRef.current.style.width = `${containerW}px`;
        canvasRef.current.style.height = `${containerH}px`;

        // Initialize game objects
        const audioEngine = new AudioEngine();
        audioEngine.masterVolume = settings.masterVolume ?? 1;
        audioEngine.playbackRate = settings.playSpeed;
        // 이 플레이 세션의 시간 권위. 판정/시각/입력 시간을 단일 출처에서 파생한다.
        // offset은 세션 동안 불변이므로 여기서 캡처한다.
        const gameClock = new GameClock(audioEngine, {
          audioOffsetMs: settings.audioOffsetMs,
          judgmentOffsetMs: settings.judgmentOffsetMs,
        });
        const skinManager = new SkinManager();
        await skinManager.loadSkin(settings.skinId);
        const renderer = new GameRenderer({
          canvas: canvasRef.current,
          width: logicalW,
          height: GAME_HEIGHT,
          resolution,
          skinManager,
          bombScale: settings.bombScale,
        });
        await renderer.init();

        // Set up renderer with chart data
        renderer.setChart(
          chartData.notes,
          chartData.trillZones,
          chartData.restZones ?? [],
          chartData.events,
          timing,
          playableDurationMs,
        );
        renderer.scrollSpeed = settings.scrollSpeed;
        renderer.setAdjustModeCallback((active) => {
          if (active) {
            audioEngine.pause();
            isPausedRef.current = true;
          } else {
            audioEngine.resume();
            isPausedRef.current = false;
          }
        });
        renderer.setShowFastSlow(settings.showFastSlow);
        renderer.setShowTimingDiff(settings.showTimingDiff);
        renderer.setPerfectWindow(getJudgmentWindows(settings.judgmentMode).PERFECT);
        renderer.setLift(GAME_HEIGHT * settings.liftPercent / 100);
        renderer.setSudden(GAME_HEIGHT * settings.suddenPercent / 100);

        // Setup keyboard layout display
        const laneBindingsMap = new Map<string, number>();
        Object.entries(settings.keyBindings).forEach(([lane, keys]) => {
          const laneNum = parseInt(lane.replace('lane', ''));
          (keys as string[]).forEach((key) => {
            laneBindingsMap.set(key, laneNum);
          });
        });
        renderer.setupKeyboardDisplay(laneBindingsMap);

        // Create debug logger if debug mode is enabled
        const judgmentLineY = GAME_HEIGHT - JUDGMENT_LINE_OFFSET - (GAME_HEIGHT * settings.liftPercent / 100);
        const debugLogger = settings.debugMode
          ? new DebugLogger(settings.scrollSpeed, judgmentLineY)
          : null;
        debugLoggerRef.current = debugLogger;

        // Session owns core, score denominator, confirmed effects and body state.
        const windows = getJudgmentWindows(settings.judgmentMode);
        const rendererPort: SessionRendererPort = {
          showJudgment: (grade, deltaMs) => renderer.showJudgment(grade, deltaMs),
          recordPerspectiveSurfaceJudgment: grade => renderer.recordPerspectiveSurfaceJudgment(grade),
          showBombEffect: lane => renderer.showBombEffect(lane),
          updateCombo: combo => renderer.updateCombo(combo),
          updateAccuracy: rate => renderer.updateAccuracy(rate),
          applyNoteDisplayEffect: (noteIndex, effect) => renderer.applyNoteDisplayEffect(noteIndex, effect),
          setJudgmentBodyStateQuery: query => renderer.setJudgmentBodyStateQuery(query),
          recordDebug: (event, _note) => {
            if (!debugLogger) return;
            const isBody = event.kind !== 'head';
            const positionMs = isBody ? noteEndTimesMs.get(event.noteIndex) : noteTimesMs.get(event.noteIndex);
            if (positionMs === undefined) return;
            const noteCenterY = judgmentLineY - ((positionMs - gameClock.judgmentTimeMs()) * settings.scrollSpeed) / 1000;
            debugLogger.recordJudgment(event.noteIndex, noteCenterY, event.grade, event.deltaMs, event.unitIndex, isBody);
          },
        };
        const session = new NoteJudgmentSession(compiled, { windows, onBatchConfirmed: view => adapter.apply(view) });
        const adapter = new SessionRendererAdapter({ notes: compiled.rawNotes, connections: compiled.connections, bodyStates: () => session.bodyStates, scoreAccuracy: () => session.score.getState().achievementRate, port: rendererPort });
        sessionRef.current = session;
        inputTimelineRef.current = new InputTimeline();

        // Create input system
        const keyBindings: KeyBinding[] = [];
        Object.entries(settings.keyBindings).forEach(([lane, keys]) => {
          const laneNum = parseInt(lane.replace('lane', '')) as 1 | 2 | 3 | 4;
          keys.forEach((key: string) => {
            keyBindings.push({ lane: laneNum, key });
          });
        });

        const inputSystem = new InputSystem(keyBindings, {
          onLanePress: (lane, timestampMs, keyCode) => {
            inputTimelineRef.current?.enqueue({ lane, inputAt: gameClock.toInputTimeMs(timestampMs), key: keyCode, type: 'down' });
            renderer.setKeyBeam(lane, true);
            renderer.setKeyState(keyCode, true);
          },
          onLaneRelease: (lane, timestampMs, keyCode) => {
            inputTimelineRef.current?.enqueue({ lane, inputAt: gameClock.toInputTimeMs(timestampMs), key: keyCode, type: 'up' });
            renderer.setKeyBeam(lane, false);
            renderer.setKeyState(keyCode, false);
          },
        });

        inputSystem.attach(window);

        // Load audio buffer into AudioEngine
        audioEngine.loadBuffer(audioBuffer);
        audioEngine.setPlaybackRange(playbackRange);

        // Skip notes before startTimeMs (editor test play)
        if (startTimeMs > 0) {
        // selected compiled chart already fixes the denominator; old notes are display-only hidden.
          for (let i = 0; i < chartData.notes.length; i++) {
            const timeMs = noteTimesMs.get(i);
            if (timeMs !== undefined && timeMs < startTimeMs) {
              renderer.applyNoteDisplayEffect(i, { body: null, visibility: 'processed' });
            }
          }
        }

        // Store refs
        audioEngineRef.current = audioEngine;
        inputSystemRef.current = inputSystem;
        rendererRef.current = renderer;

        // Auto-play: AutoEvent ms 범위 파생 (렌더러 autoEvents와 같은 소스·같은 변환의 순수 파생값)
        const autoSectionsMs: AutoSectionMs[] = [];
        for (const evt of chartData.events) {
          if (evt.type === 'auto') {
            autoSectionsMs.push({
              startMs: timing.beatToMs(evt.beat),
              endMs: timing.beatToMs(evt.endBeat),
            });
          }
        }
        const autoPlayer = new AutoPlayer(chartData.notes, noteTimesMs, noteEndTimesMs, autoSectionsMs, compiled);

        // Start game loop
        let lastFrameTime: number | null = null;
        const gameLoop = (timestamp: number) => {
          if (!isPausedRef.current && audioEngine && session && renderer) {
            const visualTimeMs = gameClock.visualTimeMs();

            // Record frame timing for debug logger
            const frameDeltaMs = lastFrameTime !== null ? timestamp - lastFrameTime : 16;
            if (debugLogger && lastFrameTime !== null) {
              debugLogger.recordFrameTiming(frameDeltaMs);
            }
            lastFrameTime = timestamp;

            const autoEvents = stepPlaySession(inputTimelineRef.current!, session, autoPlayer, gameClock, timestamp);
            for (const event of autoEvents) {
              renderer.setKeyBeam(event.lane, event.type === 'press');
            }

            // Render frame (오디오 출력 레이턴시만큼 미래 시각으로 렌더링)
            renderer.renderFrame(visualTimeMs, frameDeltaMs);

            // Check if song ended
            if (audioEngine.currentTimeMs >= audioEngine.duration && audioEngine.duration > 0) {
              handleSongEnd();
              return;
            }
          }

          animationFrameRef.current = requestAnimationFrame(gameLoop);
        };

        // Start audio playback
        audioEngine.play(startTimeMs);

        animationFrameRef.current = requestAnimationFrame(gameLoop);

      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initialize game');
      }
    };

    init();

    // Cleanup
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioEngineRef.current) {
        audioEngineRef.current.dispose();
      }
      if (inputSystemRef.current) {
        inputSystemRef.current.detach();
      }
      if (rendererRef.current) {
        rendererRef.current.dispose();
      }
    };
  }, [retryKey]); // eslint-disable-line react-hooks/exhaustive-deps -- settings는 init 내부에서 getState() 스냅샷으로 접근

  // Sync isPaused to ref
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  // Escape key handler for pause
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        setIsPaused((prev) => {
          if (audioEngineRef.current) {
            if (prev) {
              audioEngineRef.current.resume();
            } else {
              audioEngineRef.current.pause();
            }
          }
          return !prev;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleRetry = () => {
    setIsPaused(false);
    isPausedRef.current = false;
    setError(null);
    setRetryKey((k) => k + 1);
  };

  const handleQuit = () => {
    // Output debug log if debug mode was active
    const debugLogger = debugLoggerRef.current;
    if (debugLogger) {
      const text = debugLogger.exportAsText();
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `debug-log-${Date.now()}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }

    if (editorReturnUrl) {
      const url = editorReturnUrl;
      setStartTimeMs(0);
      setEditorReturnUrl(null);
      navigate(url);
    } else {
      setScreen('songSelect');
    }
  };

  const handleResume = () => {
    setIsPaused(false);
    if (audioEngineRef.current) {
      audioEngineRef.current.resume();
    }
  };

  if (error) {
    return (
      <div style={styles.errorContainer}>
        <div style={styles.errorText}>{error}</div>
        <button style={styles.button} onClick={handleQuit}>
          Back to Song Select
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={styles.container}>
      <canvas key={retryKey} ref={canvasRef} style={styles.canvas} />

      {isPaused && (
        <div style={import.meta.env.DEV ? styles.pauseOverlayDev : styles.pauseOverlay}>
          <div style={import.meta.env.DEV ? styles.pauseModalDev : styles.pauseModal}>
            <h2 style={import.meta.env.DEV ? styles.pauseTitleDev : styles.pauseTitle}>Paused</h2>
            <div style={styles.pauseButtons}>
              <button style={styles.button} onClick={handleResume}>
                Resume
              </button>
              <button style={styles.retryButton} onClick={handleRetry}>
                Retry
              </button>
              <button style={styles.quitButton} onClick={handleQuit}>
                Quit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    position: 'relative' as const,
    width: '100vw',
    height: '100vh',
    backgroundColor: '#000000',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  canvas: {
    display: 'block' as const,
  },
  errorContainer: {
    ...primitives.screen,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
  },
  errorText: {
    fontFamily: font.display,
    fontSize: '24px',
    color: color.danger,
    marginBottom: '24px',
  },
  pauseOverlay: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(6, 8, 10, 0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseModal: {
    background: surface.panel,
    border: `1px solid ${color.line}`,
    boxShadow: `${edge.metal}, 0 24px 64px -24px rgba(0, 0, 0, 0.85)`,
    color: color.ink,
    fontFamily: font.body,
    padding: '48px',
    borderRadius: radius.md,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '32px',
  },
  // 개발 모드 전용: dim 없이 우상단에 작게 띄워 플레이 화면을 가리지 않는다.
  pauseOverlayDev: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    padding: '12px',
    pointerEvents: 'none' as const, // 오버레이는 클릭 통과, 모달만 입력 받음
  },
  pauseModalDev: {
    background: surface.panel,
    border: `1px solid ${color.line}`,
    boxShadow: edge.metal,
    padding: '12px 16px',
    borderRadius: radius.md,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '10px',
    pointerEvents: 'auto' as const,
    transform: 'scale(0.8)',
    transformOrigin: 'top right',
  },
  pauseTitleDev: {
    fontFamily: font.display,
    fontSize: '18px',
    color: color.ink,
    margin: 0,
  },
  pauseTitle: {
    fontFamily: font.display,
    fontSize: '48px',
    fontWeight: 800,
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
    color: color.inkStrong,
    margin: 0,
  },
  pauseButtons: {
    display: 'flex',
    gap: '16px',
  },
  // 계속(주액션) — 유일한 네온 버튼
  button: {
    ...primitives.neonButton,
    minHeight: 'auto',
    fontSize: '18px',
    padding: '12px 24px',
  },
  // 재시도 — 금속 + 골드
  retryButton: {
    ...primitives.metalButton,
    minHeight: 'auto',
    fontSize: '18px',
    padding: '12px 24px',
    color: color.gold,
    border: `1px solid ${color.gold}66`,
  },
  // 종료 — 금속 + danger. 텍스트는 금속 그라디언트 위 대비(≥4.5:1) 확보용 밝은 danger.
  quitButton: {
    ...primitives.metalButton,
    minHeight: 'auto',
    fontSize: '18px',
    padding: '12px 24px',
    color: '#ff8578',
    border: `1px solid ${color.danger}66`,
  },
};

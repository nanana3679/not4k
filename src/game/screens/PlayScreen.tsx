import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../stores';
import { AudioEngine } from '../audio';
import { InputSystem, type KeyBinding } from '../input';
import { GameClock } from '../time';
import { GameRenderer } from '../renderer';
import { GAME_HEIGHT, LANE_AREA_WIDTH, JUDGMENT_LINE_OFFSET } from '../renderer/constants';
import { font, color, surface, edge, radius, primitives } from '../../shared/theme';
import { SkinManager } from '../skin';
import { createChartTiming, getJudgmentWindows, normalizePlaybackRange } from '../../shared';
import { DebugLogger } from '../debug/DebugLogger';
import { createPlaySession, type PlaySession } from '../session';

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
  const sessionRef = useRef<PlaySession | null>(null);
  const rendererRef = useRef<GameRenderer | null>(null);
  const skinManagerRef = useRef<SkinManager | null>(null);
  // 직전 세션의 스킨 텍스처 unload(Promise). retry 시 다음 init이 재load 전에 이것을 await 해
  // Assets.unload↔재load 경합(파괴 예정 텍스처 재사용)을 막는다.
  const pendingSkinUnloadRef = useRef<Promise<void> | null>(null);
  const debugLoggerRef = useRef<DebugLogger | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const handleSongEnd = () => {
    const session = sessionRef.current;
    if (!session || !chartData) return;

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

    const result = session.result();

    setResult({
      songId: chartData.meta.title || 'unknown',
      difficulty: chartData.meta.difficultyLabel || 'NORMAL',
      achievementRate: result.achievementRate,
      rank: result.rank,
      maxCombo: result.maxCombo,
      isFullCombo: result.isFullCombo,
      judgmentCounts: result.judgmentCounts,
      goodTrillCount: result.goodTrillCount,
      fastCount: result.fastCount,
      slowCount: result.slowCount,
    });

    setScreen('result');
  };

  useEffect(() => {
    // init()은 async라 setup 도중 언마운트/retry가 끼어들 수 있다. 각 await 뒤에서 이 플래그를
    // 확인해, cleanup이 아직 refs를 못 본 사이 완료된 init이 orphan 리소스를 남기지 않게 한다.
    let disposed = false;
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

        // Calculate logical width from viewport aspect ratio (height fixed)
        const containerW = containerRef.current!.clientWidth;
        const containerH = containerRef.current!.clientHeight;
        const aspectRatio = containerW / containerH;
        const logicalW = Math.max(Math.round(GAME_HEIGHT * aspectRatio), LANE_AREA_WIDTH + 80);
        const resolution = settings.renderHeight / GAME_HEIGHT;

        // Set canvas CSS size to fill container
        canvasRef.current.style.width = `${containerW}px`;
        canvasRef.current.style.height = `${containerH}px`;

        // 직전 세션(retry/이탈)의 스킨 텍스처 unload가 끝나길 기다린 뒤 재load한다. Assets.unload는
        // 캐시 삭제·texture.destroy를 microtask로 미루므로, 기다리지 않고 같은 스킨을 재load하면
        // 파괴 예정 텍스처를 재사용하는 경합이 생긴다.
        if (pendingSkinUnloadRef.current) {
          await pendingSkinUnloadRef.current;
          pendingSkinUnloadRef.current = null;
          if (disposed) return;
        }

        const skinManager = new SkinManager();
        await skinManager.loadSkin(settings.skinId);
        // 로드 도중 언마운트/retry 시 — 방금 올린 스킨 텍스처를 unload(다음 init이 await)하고 중단.
        if (disposed) {
          pendingSkinUnloadRef.current = skinManager.dispose();
          return;
        }
        const renderer = new GameRenderer({
          canvas: canvasRef.current,
          width: logicalW,
          height: GAME_HEIGHT,
          resolution,
          skinManager,
        });
        await renderer.init();
        // init 도중 언마운트/retry 시 — renderer를 skinManager보다 먼저 정리해 텍스처 참조 중
        // unload를 피한다. dispose()는 idempotent라 cleanup과 이중 호출돼도 안전하다.
        if (disposed) {
          renderer.dispose();
          pendingSkinUnloadRef.current = skinManager.dispose();
          return;
        }

        // 첫 판정 hitch 완화 — 판정 텍스트 폰트(Audiowide)와 스킨 텍스처를 게임 시작 전에 준비한다.
        // 이유: 판정 텍스트/ bomb / failed 텍스처는 첫 판정 전까지 한 번도 안 그려져, 그 순간 폰트 로드와
        // GPU 텍스처 업로드가 처음 몰려 랙을 유발한다. 로딩 시점으로 앞당긴다.
        const fontT0 = performance.now();
        if (typeof document !== 'undefined' && document.fonts) {
          // 폰트 파일 fetch가 목적 — 한 사이즈만 로드해도 같은 파일이라 전 사이즈가 준비된다.
          // 프리웜은 best-effort — 느린/hang 네트워크가 게임 시작을 막지 않도록 1.5s 상한을 둔다.
          // (실패·타임아웃 모두 fallback 폰트로 진행.)
          try {
            await Promise.race([
              document.fonts.load('36px "Audiowide"'),
              new Promise((resolve) => setTimeout(resolve, 1500)),
            ]);
          } catch { /* fallback 허용 */ }
        }
        const fontLoadMs = performance.now() - fontT0;
        // 폰트 로드(await) 도중 언마운트/retry 시 중단
        if (disposed) {
          renderer.dispose();
          pendingSkinUnloadRef.current = skinManager.dispose();
          return;
        }
        const textureUploadMs = renderer.prewarm();
        if (settings.debugMode) {
          console.log(
            `[PlayScreen prewarm] fontLoad=${fontLoadMs.toFixed(1)}ms textureUpload=${textureUploadMs.toFixed(1)}ms`,
          );
        }

        // 오디오 객체는 모든 중단 지점(await 가드)을 통과한 뒤에 만든다 — AudioEngine 생성자가
        // AudioContext를 즉시 열기 때문에, 로딩 중 중단 시 refs에 담기지 못한 채 running AudioContext가
        // 누수되는 것을 막는다(Chrome 탭당 AudioContext 개수 제한).
        const audioEngine = new AudioEngine();
        audioEngine.masterVolume = settings.masterVolume ?? 1;
        audioEngine.playbackRate = settings.playSpeed;
        // 이 플레이 세션의 시간 권위. 판정/시각/입력 시간을 단일 출처에서 파생한다.
        // offset은 세션 동안 불변이므로 여기서 캡처한다.
        const gameClock = new GameClock(audioEngine, {
          audioOffsetMs: settings.audioOffsetMs,
          judgmentOffsetMs: settings.judgmentOffsetMs,
        });

        // Set up renderer with chart data — 렌더러가 차트에서 시간 뷰를 내부 파생한다 (#142).
        renderer.setChart(chartData, playableDurationMs);
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

        // 플레이 세션 — 판정/점수/오토플레이/입력 라우팅/틱 순서를 단일 deep module로 응집한다.
        // (구성자 시점 효과: setHeadlessHeldFillQuery + startTimeMs>0 노트 processed 표시 —
        //  둘 다 첫 프레임 전에 일어나므로 관측 동등. skipNotesBefore도 세션 내부로 이동.)
        const session = createPlaySession({
          notes: chartData.notes,
          events: chartData.events,
          timing,
          windows: getJudgmentWindows(settings.judgmentMode),
          startTimeMs,
          clock: gameClock,
          effects: renderer,
          audio: audioEngine,
          debug: debugLogger
            ? { logger: debugLogger, judgmentLineY, scrollSpeed: settings.scrollSpeed }
            : undefined,
        });

        // Create input system
        const keyBindings: KeyBinding[] = [];
        Object.entries(settings.keyBindings).forEach(([lane, keys]) => {
          const laneNum = parseInt(lane.replace('lane', '')) as 1 | 2 | 3 | 4;
          keys.forEach((key: string) => {
            keyBindings.push({ lane: laneNum, key });
          });
        });

        const inputSystem = new InputSystem(keyBindings, {
          onLanePress: (lane, timestampMs, keyCode) => session.onLanePress(lane, timestampMs, keyCode),
          onLaneRelease: (lane, timestampMs, keyCode) => session.onLaneRelease(lane, timestampMs, keyCode),
        });

        inputSystem.attach(window);

        // Load audio buffer into AudioEngine
        audioEngine.loadBuffer(audioBuffer);
        audioEngine.setPlaybackRange(playbackRange);

        // Store refs
        audioEngineRef.current = audioEngine;
        inputSystemRef.current = inputSystem;
        sessionRef.current = session;
        rendererRef.current = renderer;
        skinManagerRef.current = skinManager;

        // Start game loop — 세션이 틱 순서(press→update→release→renderFrame→종료 체크)를 소유한다.
        // 일시정지 중엔 tick을 부르지 않아 세션의 frame-delta 부기(lastFrameTime)가 멈춘다.
        const gameLoop = (timestamp: number) => {
          if (!isPausedRef.current) {
            if (session.tick(timestamp) === 'ended') {
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
      disposed = true;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioEngineRef.current) {
        audioEngineRef.current.dispose();
      }
      if (inputSystemRef.current) {
        inputSystemRef.current.detach();
      }
      // renderer를 skinManager보다 먼저 정리 — 텍스처 참조 중 unload를 피한다.
      if (rendererRef.current) {
        rendererRef.current.dispose();
      }
      // 스킨 텍스처의 소유자는 SkinManager다. renderer.dispose()는 texture:false라 텍스처를
      // 파괴하지 않으므로, 여기서 SkinManager.dispose()로 Assets.unload 해야 retry/이탈 시
      // 텍스처가 PIXI Assets 캐시에 남지 않는다. unload Promise는 ref에 남겨, 다음 init(retry)이
      // 재load 전에 await 하도록 한다(unload↔재load 경합 방지).
      if (skinManagerRef.current) {
        pendingSkinUnloadRef.current = skinManagerRef.current.dispose();
        skinManagerRef.current = null;
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

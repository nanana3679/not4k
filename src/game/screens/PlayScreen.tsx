import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../stores';
import { AudioEngine } from '../audio';
import { InputSystem, type KeyBinding } from '../input';
import { JudgmentEngine, type JudgmentResult } from '../judgment';
import { ScoreManager } from '../scoring';
import { GameRenderer } from '../renderer';
import { GAME_HEIGHT, LANE_AREA_WIDTH, JUDGMENT_LINE_OFFSET } from '../renderer/constants';
import { SkinManager } from '../skin';
import { beatToMs, extractBpmMarkers, getJudgmentWindows } from '../../shared';
import type { Lane } from '../../shared';
import { DebugLogger } from '../debug/DebugLogger';

export function PlayScreen() {
  const { setScreen, setResult, chartData, audioBuffer, startTimeMs, editorReturnUrl, setStartTimeMs, setEditorReturnUrl } = useGameStore();
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
  const judgmentEngineRef = useRef<JudgmentEngine | null>(null);
  const scoreManagerRef = useRef<ScoreManager | null>(null);
  const rendererRef = useRef<GameRenderer | null>(null);
  const debugLoggerRef = useRef<DebugLogger | null>(null);
  const animationFrameRef = useRef<number | null>(null);

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

      try {
        // Convert chart notes to time maps
        const bpmMarkers = extractBpmMarkers(chartData.events);
        const noteTimesMs = new Map<number, number>();
        const noteEndTimesMs = new Map<number, number>();

        chartData.notes.forEach((note, index) => {
          const timeMs = beatToMs(note.beat, bpmMarkers, chartData.meta.offsetMs);
          noteTimesMs.set(index, timeMs);

          if ('endBeat' in note) {
            const endTimeMs = beatToMs(note.endBeat, bpmMarkers, chartData.meta.offsetMs);
            noteEndTimesMs.set(index, endTimeMs);
          }
        });

        // 트릴 구간 시작 시간 목록 (레인별, 정렬됨)
        const trillZoneStartTimesMs = new Map<Lane, number[]>();
        for (const zone of chartData.trillZones) {
          const startMs = beatToMs(zone.beat, bpmMarkers, chartData.meta.offsetMs);
          if (!trillZoneStartTimesMs.has(zone.lane)) {
            trillZoneStartTimesMs.set(zone.lane, []);
          }
          trillZoneStartTimesMs.get(zone.lane)!.push(startMs);
        }
        // 시간 순 정렬
        for (const times of trillZoneStartTimesMs.values()) {
          times.sort((a, b) => a - b);
        }

        // Calculate total judgment count based on note types
        let totalJudgments = 0;
        let skippedJudgments = 0;
        for (let i = 0; i < chartData.notes.length; i++) {
          const note = chartData.notes[i];
          let count: number;
          if ('endBeat' in note) {
            count = 1; // 바디: 끝점 판정 1회
          } else if (note.type === 'double') {
            count = 2; // 더블 헤드: 서브판정 2회
          } else {
            count = 1; // 싱글/트릴 헤드: 1회
          }
          totalJudgments += count;
          if (startTimeMs > 0) {
            const noteTime = noteTimesMs.get(i);
            if (noteTime !== undefined && noteTime < startTimeMs) {
              skippedJudgments += count;
            }
          }
        }

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
        const skinManager = new SkinManager();
        await skinManager.loadSkin(settings.skinId);
        const renderer = new GameRenderer({
          canvas: canvasRef.current,
          width: logicalW,
          height: GAME_HEIGHT,
          resolution,
          skinManager,
        });
        await renderer.init();

        // Set up renderer with chart data
        renderer.setChart(
          chartData.notes,
          chartData.trillZones,
          chartData.events,
          chartData.meta.offsetMs,
          audioBuffer.duration * 1000,
        );
        renderer.scrollSpeed = settings.scrollSpeed;
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

        // Create score manager (subtract skipped notes for editor test play)
        const scoreManager = new ScoreManager((totalJudgments - skippedJudgments) || 1);

        // Create judgment engine
        const windows = getJudgmentWindows(settings.judgmentMode);
        const judgmentEngine = new JudgmentEngine(
          chartData.notes,
          noteTimesMs,
          noteEndTimesMs,
          {
            onJudgment: (result: JudgmentResult) => {
              const note = chartData.notes[result.noteIndex];
              const isBody = 'endBeat' in note;

              // Debug logging (헤드/포인트 노트만, 바디 제외)
              if (debugLogger && !isBody) {
                const noteTimeMs = noteTimesMs.get(result.noteIndex);
                if (noteTimeMs !== undefined) {
                  const songTimeMs = audioEngine.currentTimeMs + settings.audioOffsetMs;
                  const noteCenterY = judgmentLineY - ((noteTimeMs - songTimeMs) * settings.scrollSpeed) / 1000;
                  const isDouble = note.type === 'double';
                  debugLogger.recordJudgment(result.noteIndex, noteCenterY, result.grade, result.deltaMs, isDouble ? result.subIndex : undefined);
                }
              }

              // Pass deltaMs only for head judgments (not body)
              if (isBody) {
                scoreManager.recordJudgment(result.grade);
              } else {
                scoreManager.recordJudgment(result.grade, result.deltaMs);
              }
              renderer.showJudgment(result.grade, result.deltaMs);
              renderer.updateAccuracy(scoreManager.getState().achievementRate);
              if (result.grade !== 'miss') {
                renderer.showBombEffect(note.lane);
              } else if (result.isPartialBodyFail) {
                // 더블 롱노트 부분 실패 — 한쪽만 실패 에셋으로 교체
                renderer.markBodyPartialFailed(result.noteIndex, result.failedSide!);
              } else {
                renderer.markBodyFailed(result.noteIndex);
              }

              // Note visibility updates
              const isDouble = note.type === 'double';

              if (result.isPartialBodyFail) {
                // 부분 실패: 노트는 BODY_ACTIVE를 유지하므로 visibility 변경 없음
              } else if (result.grade === 'miss') {
                // miss된 노트는 사라지지 않고 실패 에셋으로 교체
                renderer.markNoteMissed(result.noteIndex);
              } else if (isBody) {
                renderer.markNoteProcessed(result.noteIndex);
              } else if (isDouble && result.subIndex === 0) {
                renderer.markDoublePartial(result.noteIndex);
              } else {
                renderer.markNoteProcessed(result.noteIndex);
              }
            },
            onComboUpdate: (combo: number) => {
              renderer.updateCombo(combo);
            },
          },
          windows,
          trillZoneStartTimesMs,
        );

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
            const now = performance.now();
            const currentAudioMs = audioEngine.currentTimeMs;
            const handlerDelay = Math.max(0, now - timestampMs);
            const correctedSongTimeMs = (currentAudioMs - handlerDelay) + settings.audioOffsetMs + settings.judgmentOffsetMs;
            judgmentEngine.onLanePress(lane, correctedSongTimeMs, keyCode);
            renderer.setKeyBeam(lane, true);
            renderer.setKeyState(keyCode, true);
          },
          onLaneRelease: (lane, timestampMs, keyCode) => {
            const now = performance.now();
            const currentAudioMs = audioEngine.currentTimeMs;
            const handlerDelay = Math.max(0, now - timestampMs);
            const correctedSongTimeMs = (currentAudioMs - handlerDelay) + settings.audioOffsetMs + settings.judgmentOffsetMs;
            judgmentEngine.onLaneRelease(lane, correctedSongTimeMs, keyCode);
            renderer.setKeyBeam(lane, false);
            renderer.setKeyState(keyCode, false);
          },
        });

        inputSystem.attach(window);

        // Load audio buffer into AudioEngine
        audioEngine.loadBuffer(audioBuffer);

        // Skip notes before startTimeMs (editor test play)
        if (startTimeMs > 0) {
          judgmentEngine.skipNotesBefore(startTimeMs);
          for (let i = 0; i < chartData.notes.length; i++) {
            const timeMs = noteTimesMs.get(i);
            if (timeMs !== undefined && timeMs < startTimeMs) {
              renderer.markNoteProcessed(i);
            }
          }
        }

        // Store refs
        audioEngineRef.current = audioEngine;
        inputSystemRef.current = inputSystem;
        judgmentEngineRef.current = judgmentEngine;
        scoreManagerRef.current = scoreManager;
        rendererRef.current = renderer;

        // Start game loop
        let lastFrameTime: number | null = null;
        const gameLoop = (timestamp: number) => {
          if (!isPausedRef.current && audioEngine && judgmentEngine && renderer) {
            const songTimeMs = audioEngine.currentTimeMs + settings.audioOffsetMs;
            const visualTimeMs = songTimeMs + audioEngine.getOutputLatencyMs();

            // Record frame timing for debug logger
            const frameDeltaMs = lastFrameTime !== null ? timestamp - lastFrameTime : 16;
            if (debugLogger && lastFrameTime !== null) {
              debugLogger.recordFrameTiming(frameDeltaMs);
            }
            lastFrameTime = timestamp;

            // Update judgment engine
            judgmentEngine.update(songTimeMs);

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

  const handleSongEnd = () => {
    const scoreManager = scoreManagerRef.current;
    if (!scoreManager || !chartData) return;

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

    const state = scoreManager.getState();

    setResult({
      songId: chartData.meta.title || 'unknown',
      difficulty: chartData.meta.difficultyLabel || 'NORMAL',
      achievementRate: state.achievementRate,
      rank: state.rank,
      maxCombo: judgmentEngineRef.current!.maxCombo,
      isFullCombo: state.isFullCombo,
      judgmentCounts: state.judgmentCounts,
      goodTrillCount: state.goodTrillCount,
      fastCount: state.fastCount,
      slowCount: state.slowCount,
    });

    setScreen('result');
  };

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
        <div style={styles.pauseOverlay}>
          <div style={styles.pauseModal}>
            <h2 style={styles.pauseTitle}>Paused</h2>
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
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    backgroundColor: '#1a1a1a',
    color: '#ffffff',
  },
  errorText: {
    fontSize: '24px',
    color: '#ff4444',
    marginBottom: '24px',
  },
  pauseOverlay: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseModal: {
    backgroundColor: '#2a2a2a',
    padding: '48px',
    borderRadius: '16px',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '32px',
  },
  pauseTitle: {
    fontSize: '48px',
    color: '#ffffff',
    margin: 0,
  },
  pauseButtons: {
    display: 'flex',
    gap: '16px',
  },
  button: {
    fontSize: '18px',
    padding: '12px 24px',
    backgroundColor: '#00ffff',
    color: '#1a1a1a',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  retryButton: {
    fontSize: '18px',
    padding: '12px 24px',
    backgroundColor: '#ffaa00',
    color: '#1a1a1a',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  quitButton: {
    fontSize: '18px',
    padding: '12px 24px',
    backgroundColor: '#ff4444',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
};

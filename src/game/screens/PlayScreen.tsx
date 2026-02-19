import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../stores';
import { AudioEngine } from '../audio';
import { InputSystem, type KeyBinding } from '../input';
import { JudgmentEngine, type JudgmentResult } from '../judgment';
import { ScoreManager } from '../scoring';
import { GameRenderer } from '../renderer';
import { GAME_HEIGHT, LANE_AREA_WIDTH } from '../renderer/constants';
import { beatToMs, extractBpmMarkers } from '../../shared';

export function PlayScreen() {
  const { settings, setScreen, setResult, chartData, audioBuffer } = useGameStore();
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
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const init = async () => {
      if (!canvasRef.current || !containerRef.current) return;

      // Check if chart data and audio buffer are available
      if (!chartData || !audioBuffer) {
        setError('No chart or audio data loaded');
        return;
      }

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

        // Calculate total judgment count based on note types
        let totalJudgments = 0;
        for (const note of chartData.notes) {
          if ('endBeat' in note) {
            totalJudgments += 1; // 바디: 끝점 판정 1회
          } else if (note.type === 'double') {
            totalJudgments += 2; // 더블 헤드: 서브판정 2회
          } else {
            totalJudgments += 1; // 싱글/트릴 헤드: 1회
          }
        }

        // Calculate logical width from viewport aspect ratio (height fixed)
        const containerW = containerRef.current!.clientWidth;
        const containerH = containerRef.current!.clientHeight;
        const aspectRatio = containerW / containerH;
        const logicalW = Math.max(Math.round(GAME_HEIGHT * aspectRatio), LANE_AREA_WIDTH + 80);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const scale = containerH / GAME_HEIGHT;

        // Set canvas CSS size to fill container
        canvasRef.current.style.width = `${containerW}px`;
        canvasRef.current.style.height = `${containerH}px`;

        // Initialize game objects
        const audioEngine = new AudioEngine();
        const renderer = new GameRenderer({
          canvas: canvasRef.current,
          width: logicalW,
          height: GAME_HEIGHT,
          resolution: scale * dpr,
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

        // Create score manager
        const scoreManager = new ScoreManager(totalJudgments || 1);

        // Create judgment engine
        const judgmentEngine = new JudgmentEngine(
          chartData.notes,
          noteTimesMs,
          noteEndTimesMs,
          {
            onJudgment: (result: JudgmentResult) => {
              scoreManager.recordJudgment(result.grade);
              renderer.showJudgment(result.grade);
              renderer.updateAccuracy(scoreManager.getState().achievementRate);
              if (result.grade === 'miss') {
                renderer.markBodyFailed(result.noteIndex);
              }

              // Note visibility updates
              const note = chartData.notes[result.noteIndex];
              const isBody = 'endBeat' in note;
              const isDouble = note.type === 'double';

              if (isBody) {
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
          }
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
          onLanePress: (lane, _timestampMs, keyCode) => {
            const songTimeMs = audioEngine.currentTimeMs + settings.offsetMs;
            judgmentEngine.onLanePress(lane, songTimeMs, keyCode);
            renderer.setKeyBeam(lane, true);
            renderer.setKeyState(keyCode, true);
          },
          onLaneRelease: (lane, _timestampMs, keyCode) => {
            const songTimeMs = audioEngine.currentTimeMs + settings.offsetMs;
            judgmentEngine.onLaneRelease(lane, songTimeMs, keyCode);
            renderer.setKeyBeam(lane, false);
            renderer.setKeyState(keyCode, false);
          },
        });

        inputSystem.attach(window);

        // Load audio buffer into AudioEngine
        audioEngine.loadBuffer(audioBuffer);

        // Store refs
        audioEngineRef.current = audioEngine;
        inputSystemRef.current = inputSystem;
        judgmentEngineRef.current = judgmentEngine;
        scoreManagerRef.current = scoreManager;
        rendererRef.current = renderer;

        // Start game loop
        const gameLoop = () => {
          if (!isPausedRef.current && audioEngine && judgmentEngine && renderer) {
            const songTimeMs = audioEngine.currentTimeMs + settings.offsetMs;

            // Update judgment engine
            judgmentEngine.update(songTimeMs);

            // Render frame
            renderer.renderFrame(songTimeMs);

            // Check if song ended
            if (audioEngine.currentTimeMs >= audioEngine.duration && audioEngine.duration > 0) {
              handleSongEnd();
              return;
            }
          }

          animationFrameRef.current = requestAnimationFrame(gameLoop);
        };

        // Start audio playback
        audioEngine.play(0);

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
  }, [settings, retryKey]);

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

    const state = scoreManager.getState();

    setResult({
      songId: chartData.meta.title || 'unknown',
      difficulty: chartData.meta.difficultyLabel || 'NORMAL',
      achievementRate: state.achievementRate,
      rank: state.rank,
      maxCombo: state.maxCombo,
      isFullCombo: state.isFullCombo,
      judgmentCounts: state.judgmentCounts,
      goodTrillCount: state.goodTrillCount,
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
    setScreen('songSelect');
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

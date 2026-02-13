import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../stores';
import { AudioEngine } from '../audio';
import { InputSystem, type KeyBinding } from '../input';
import { JudgmentEngine, type JudgmentResult } from '../judgment';
import { ScoreManager } from '../scoring';
import { GameRenderer } from '../renderer';
import { beat } from '@not4k/shared';

export function PlayScreen() {
  const { settings, setScreen, setResult } = useGameStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Game objects
  const audioEngineRef = useRef<AudioEngine | null>(null);
  const inputSystemRef = useRef<InputSystem | null>(null);
  const judgmentEngineRef = useRef<JudgmentEngine | null>(null);
  const scoreManagerRef = useRef<ScoreManager | null>(null);
  const rendererRef = useRef<GameRenderer | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const init = async () => {
      if (!canvasRef.current) return;

      try {
        // TODO: Replace with actual chart data from loading screen
        // For now, create placeholder data
        const placeholderChart = {
          meta: {
            offsetMs: 0,
          },
          notes: [],
          trillZones: [],
          bpmMarkers: [{ beat: beat(0, 1), bpm: 120 }],
        };

        // Create note times maps (empty for placeholder)
        const noteTimesMs = new Map<number, number>();
        const noteEndTimesMs = new Map<number, number>();

        // Calculate total judgment count
        const totalJudgments = placeholderChart.notes.length * 2; // Approximate

        // Initialize game objects
        const audioEngine = new AudioEngine();
        const renderer = new GameRenderer({
          canvas: canvasRef.current,
          width: 800,
          height: 600,
        });
        await renderer.init();

        // Set up renderer with chart data
        renderer.setChart(
          placeholderChart.notes,
          placeholderChart.trillZones,
          placeholderChart.bpmMarkers,
          placeholderChart.meta.offsetMs
        );
        renderer.scrollSpeed = settings.scrollSpeed;
        renderer.setLift(settings.liftPx);
        renderer.setSudden(settings.suddenPx);

        // Create score manager
        const scoreManager = new ScoreManager(totalJudgments || 1);

        // Create judgment engine
        const judgmentEngine = new JudgmentEngine(
          placeholderChart.notes,
          noteTimesMs,
          noteEndTimesMs,
          {
            onJudgment: (result: JudgmentResult) => {
              scoreManager.recordJudgment(result.grade);
              renderer.showJudgment(result.grade);
              if (result.grade === 'miss') {
                renderer.markBodyFailed(result.noteIndex);
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
          onLanePress: (lane, timestampMs) => {
            // Find which key was pressed (this is simplified - InputSystem needs extension)
            judgmentEngine.onLanePress(lane, timestampMs, 'unknown');
          },
          onLaneRelease: (lane, timestampMs) => {
            judgmentEngine.onLaneRelease(lane, timestampMs);
          },
        });

        inputSystem.attach(window);

        // Store refs
        audioEngineRef.current = audioEngine;
        inputSystemRef.current = inputSystem;
        judgmentEngineRef.current = judgmentEngine;
        scoreManagerRef.current = scoreManager;
        rendererRef.current = renderer;

        // Start game loop
        const gameLoop = () => {
          if (!isPaused && audioEngine && judgmentEngine && renderer) {
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

        // TODO: Load and play audio
        // await audioEngine.loadAudio(audioUrl);
        // audioEngine.play(0);

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
  }, [settings, isPaused]);

  // Escape key handler for pause
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        setIsPaused((prev) => !prev);
        if (audioEngineRef.current) {
          if (isPaused) {
            audioEngineRef.current.resume();
          } else {
            audioEngineRef.current.pause();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPaused]);

  const handleSongEnd = () => {
    const scoreManager = scoreManagerRef.current;
    if (!scoreManager) return;

    const state = scoreManager.getState();

    setResult({
      songId: 'placeholder',
      difficulty: 'NORMAL',
      achievementRate: state.achievementRate,
      rank: state.rank,
      maxCombo: state.maxCombo,
      isFullCombo: state.isFullCombo,
      judgmentCounts: state.judgmentCounts,
      goodTrillCount: state.goodTrillCount,
    });

    setScreen('result');
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
    <div style={styles.container}>
      <canvas ref={canvasRef} />

      {isPaused && (
        <div style={styles.pauseOverlay}>
          <div style={styles.pauseModal}>
            <h2 style={styles.pauseTitle}>Paused</h2>
            <div style={styles.pauseButtons}>
              <button style={styles.button} onClick={handleResume}>
                Resume
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

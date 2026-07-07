import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../stores';
import { AudioEngine } from '../audio';
import { InputSystem, AutoPlayer, type KeyBinding, type AutoSectionMs } from '../input';
import { JudgmentEngine, type JudgmentResult } from '../judgment';
import { computeConnectionSources } from '../judgment/longNoteConnection';
import { ScoreManager } from '../scoring';
import { GameClock } from '../time';
import { GameRenderer } from '../renderer';
import { decideJudgmentEffects } from '../judgment/judgmentEffects';
import { GAME_HEIGHT, LANE_AREA_WIDTH, JUDGMENT_LINE_OFFSET } from '../renderer/constants';
import { SkinManager } from '../skin';
import { beatToMs, extractBpmMarkers, getJudgmentWindows, normalizePlaybackRange } from '../../shared';
import type { Lane } from '../../shared';
import { DebugLogger } from '../debug/DebugLogger';

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
  const judgmentEngineRef = useRef<JudgmentEngine | null>(null);
  const scoreManagerRef = useRef<ScoreManager | null>(null);
  const rendererRef = useRef<GameRenderer | null>(null);
  const debugLoggerRef = useRef<DebugLogger | null>(null);
  const animationFrameRef = useRef<number | null>(null);

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

        // trillZone 시작 시간 목록 (레인별, 정렬됨)
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
            count = note.type === 'doubleLong' ? 2 : 1; // 더블롱 바디: 키별 2회, 그 외 바디: 1회
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
        });
        await renderer.init();

        // Set up renderer with chart data
        renderer.setChart(
          chartData.notes,
          chartData.trillZones,
          chartData.events,
          chartData.meta.offsetMs,
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

        // Create score manager (subtract skipped notes for editor test play)
        const scoreManager = new ScoreManager((totalJudgments - skippedJudgments) || 1);

        // Create judgment engine
        const windows = getJudgmentWindows(settings.judgmentMode);
        // 롱노트 connection 관계는 맵 로드 시 1회 계산해 주입한다 (렌더러 held 전파와 같은 소유자).
        const connectionSources = computeConnectionSources(chartData.notes, noteTimesMs, noteEndTimesMs);
        const judgmentEngine = new JudgmentEngine(
          chartData.notes,
          noteTimesMs,
          noteEndTimesMs,
          {
            onJudgment: (result: JudgmentResult) => {
              // 결정은 전부 순수 함수(판정 효과)가 소유 — 이 적용자는 effects만 해석한다.
              const effects = decideJudgmentEffects(result, chartData.notes[result.noteIndex]);

              // 디버그 기록 — 화면 좌표 계산은 표시 시점의 관심사라 적용자 몫.
              // 바디(끝점) 판정은 끝점(endBeat) 위치로, 헤드/포인트는 시작점 위치로 Y를 잰다.
              if (debugLogger && effects.debug) {
                const posTimeMs = effects.debug.isBody
                  ? noteEndTimesMs.get(effects.noteIndex)
                  : noteTimesMs.get(effects.noteIndex);
                if (posTimeMs !== undefined) {
                  const songTimeMs = gameClock.judgmentTimeMs();
                  const noteCenterY = judgmentLineY - ((posTimeMs - songTimeMs) * settings.scrollSpeed) / 1000;
                  debugLogger.recordJudgment(effects.noteIndex, noteCenterY, effects.debug.grade, effects.debug.deltaMs, effects.debug.doubleSubIndex, effects.debug.isBody);
                }
              }

              scoreManager.recordJudgment(effects.scoreRecord.grade, effects.scoreRecord.deltaMs);
              renderer.recordPerspectiveSurfaceJudgment(effects.judgmentText.grade);
              renderer.showJudgment(effects.judgmentText.grade, effects.judgmentText.deltaMs);
              // accuracy는 기록 "후" 상태 재조회 — 적용 순서만 여기서 보장한다
              renderer.updateAccuracy(scoreManager.getState().achievementRate);
              if (effects.bomb !== null) {
                renderer.showBombEffect(effects.bomb);
              }
              renderer.applyNoteDisplayEffect(effects.noteIndex, effects.noteDisplay);
            },
            onComboUpdate: (combo: number) => {
              renderer.updateCombo(combo);
            },
          },
          windows,
          trillZoneStartTimesMs,
          connectionSources,
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
            judgmentEngine.onLanePress(lane, gameClock.toInputTimeMs(timestampMs), keyCode);
            renderer.setKeyBeam(lane, true);
            renderer.setKeyState(keyCode, true);
          },
          onLaneRelease: (lane, timestampMs, keyCode) => {
            judgmentEngine.onLaneRelease(lane, gameClock.toInputTimeMs(timestampMs), keyCode);
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
          judgmentEngine.skipNotesBefore(startTimeMs);
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
        judgmentEngineRef.current = judgmentEngine;
        scoreManagerRef.current = scoreManager;
        rendererRef.current = renderer;

        // Auto-play: AutoEvent ms 범위 파생 (렌더러 autoEvents와 같은 소스·같은 변환의 순수 파생값)
        const autoSectionsMs: AutoSectionMs[] = [];
        for (const evt of chartData.events) {
          if (evt.type === 'auto') {
            autoSectionsMs.push({
              startMs: beatToMs(evt.beat, bpmMarkers, chartData.meta.offsetMs),
              endMs: beatToMs(evt.endBeat, bpmMarkers, chartData.meta.offsetMs),
            });
          }
        }
        const autoPlayer = new AutoPlayer(chartData.notes, noteTimesMs, noteEndTimesMs, autoSectionsMs);

        // Start game loop
        let lastFrameTime: number | null = null;
        const gameLoop = (timestamp: number) => {
          if (!isPausedRef.current && audioEngine && judgmentEngine && renderer) {
            const songTimeMs = gameClock.judgmentTimeMs();
            const visualTimeMs = gameClock.visualTimeMs();

            // Record frame timing for debug logger
            const frameDeltaMs = lastFrameTime !== null ? timestamp - lastFrameTime : 16;
            if (debugLogger && lastFrameTime !== null) {
              debugLogger.recordFrameTiming(frameDeltaMs);
            }
            lastFrameTime = timestamp;

            // Auto-play: AutoEvent의 합성 press 주입 (구간 게이팅은 AutoPlayer 내부)
            for (const p of autoPlayer.pressesAt(songTimeMs)) {
              judgmentEngine.onLanePress(p.lane, p.timeMs, p.key);
              renderer.setKeyBeam(p.lane, true);
            }

            // 판정 엔진 업데이트를 release보다 먼저 호출해서 바디 노트를 auto-활성화한다.
            // (그러지 않으면 길이 0인 롱노트의 경우 press → release가 한 프레임에 일어나는데
            //  release 시점에 바디 상태가 아직 UNPROCESSED라 tryEndpointJudgmentOnRelease가 놓침)
            judgmentEngine.update(songTimeMs);

            // Auto-play: 합성 release 주입 (포인트 노트 예약 release + 롱노트 endBeat release,
            // AutoEvent이 끝나도 잡고 있던 홀드는 endBeat에서 놓는다 — 게이팅 비대칭은 AutoPlayer 내부)
            for (const r of autoPlayer.releasesAt(songTimeMs)) {
              judgmentEngine.onLaneRelease(r.lane, r.timeMs, r.key);
              renderer.setKeyBeam(r.lane, false);
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
    backgroundColor: 'rgba(42, 42, 42, 0.9)',
    padding: '12px 16px',
    borderRadius: '10px',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '10px',
    pointerEvents: 'auto' as const,
    transform: 'scale(0.8)',
    transformOrigin: 'top right',
  },
  pauseTitleDev: {
    fontSize: '18px',
    color: '#ffffff',
    margin: 0,
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

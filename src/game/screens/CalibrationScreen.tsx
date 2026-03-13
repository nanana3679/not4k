import { useState, useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '../stores';
import {
  calculateCalibrationResult,
  CALIBRATION_INTERVAL_MS,
  CALIBRATION_TOTAL_TAPS,
  CALIBRATION_WARMUP_TAPS,
  type CalibrationResult,
} from '../calibration/calibrationLogic';

type CalibrationType = 'visual' | 'audio';
type Phase = 'select' | 'running' | 'result';

/** 비프음을 생성하여 재생한다 (OscillatorNode 사용). */
function playBeep(audioCtx: AudioContext, durationMs = 30, frequency = 1000) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.frequency.value = frequency;
  osc.type = 'sine';
  gain.gain.value = 0.3;
  osc.connect(gain);
  gain.connect(audioCtx.destination);

  const now = audioCtx.currentTime;
  osc.start(now);
  gain.gain.setValueAtTime(0.3, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + durationMs / 1000);
  osc.stop(now + durationMs / 1000 + 0.01);
}

export function CalibrationScreen() {
  const { updateSettings, setScreen } = useGameStore();
  const [phase, setPhase] = useState<Phase>('select');
  const [calibType, setCalibType] = useState<CalibrationType>('visual');
  const [tapCount, setTapCount] = useState(0);
  const [result, setResult] = useState<CalibrationResult | null>(null);

  const diffsRef = useRef<number[]>([]);
  const nextBeatTimeRef = useRef<number>(0);
  const beatIndexRef = useRef<number>(0);
  const runningRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const startTimeRef = useRef<number>(0);

  const totalTaps = CALIBRATION_TOTAL_TAPS;
  const effectiveTaps = totalTaps - CALIBRATION_WARMUP_TAPS;

  // Cleanup
  useEffect(() => {
    return () => {
      runningRef.current = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioCtxRef.current) audioCtxRef.current.close();
    };
  }, []);

  const startCalibration = useCallback((type: CalibrationType) => {
    setCalibType(type);
    setPhase('running');
    setTapCount(0);
    setResult(null);
    diffsRef.current = [];
    beatIndexRef.current = 0;
    runningRef.current = true;

    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;

    // Start after a short delay to let user prepare
    const startDelay = 1500;
    startTimeRef.current = performance.now() + startDelay;
    nextBeatTimeRef.current = startTimeRef.current;

    if (type === 'visual') {
      startVisualLoop();
    } else {
      startAudioLoop(audioCtx);
    }
  }, []);

  // --- Visual calibration: render falling bar on canvas ---
  const startVisualLoop = useCallback(() => {
    const render = () => {
      if (!runningRef.current) return;
      const canvas = canvasRef.current;
      if (!canvas) {
        animFrameRef.current = requestAnimationFrame(render);
        return;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // Draw judgment line
      const judgmentY = h * 0.85;
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, judgmentY);
      ctx.lineTo(w, judgmentY);
      ctx.stroke();

      // Draw "TAP" text on judgment line
      ctx.fillStyle = '#00ffff';
      ctx.font = '14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('TAP HERE', w / 2, judgmentY + 20);

      // Draw falling note
      const now = performance.now();
      const interval = CALIBRATION_INTERVAL_MS;
      const travelTime = interval; // note takes one interval to travel from top to judgment line

      // Calculate beat times and note positions
      const startTime = startTimeRef.current;
      if (now < startTime) {
        animFrameRef.current = requestAnimationFrame(render);
        return;
      }

      // Find the current and next beats around now
      const elapsed = now - startTime;
      const currentBeatIdx = Math.floor(elapsed / interval);

      // Draw notes for a few beats around current time
      for (let i = currentBeatIdx - 1; i <= currentBeatIdx + 2; i++) {
        if (i < 0) continue;
        const beatTime = startTime + i * interval;
        const progress = (now - beatTime + travelTime) / travelTime;

        if (progress < 0 || progress > 1.5) continue;

        const noteY = progress * judgmentY;
        const noteWidth = 120;
        const noteHeight = 12;

        // Fade out after passing judgment line
        const alpha = progress > 1.0 ? Math.max(0, 1 - (progress - 1.0) * 4) : 1;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#ff6b6b';
        ctx.fillRect(w / 2 - noteWidth / 2, noteY - noteHeight / 2, noteWidth, noteHeight);
        ctx.globalAlpha = 1;
      }

      // Update next beat time reference for tap detection
      const nextBeatIdx = currentBeatIdx;
      nextBeatTimeRef.current = startTime + nextBeatIdx * interval;

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);
  }, []);

  // --- Audio calibration: play beeps at intervals ---
  const startAudioLoop = useCallback((audioCtx: AudioContext) => {
    const tick = () => {
      if (!runningRef.current) return;
      const now = performance.now();
      const startTime = startTimeRef.current;
      if (now < startTime) {
        animFrameRef.current = requestAnimationFrame(tick);
        return;
      }

      const elapsed = now - startTime;
      const currentBeatIdx = Math.floor(elapsed / CALIBRATION_INTERVAL_MS);

      // Schedule beeps that haven't been played yet
      if (currentBeatIdx >= beatIndexRef.current) {
        playBeep(audioCtx);
        const beatTime = startTime + currentBeatIdx * CALIBRATION_INTERVAL_MS;
        nextBeatTimeRef.current = beatTime;
        beatIndexRef.current = currentBeatIdx + 1;
      }

      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);
  }, []);

  // --- Handle tap input ---
  useEffect(() => {
    if (phase !== 'running') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      e.preventDefault();

      const now = e.timeStamp; // high-resolution timestamp
      const startTime = startTimeRef.current;

      if (now < startTime) return;

      // Find the closest beat time
      const elapsed = now - startTime;
      const interval = CALIBRATION_INTERVAL_MS;
      const closestBeatIdx = Math.round(elapsed / interval);
      const closestBeatTime = startTime + closestBeatIdx * interval;

      const diff = now - closestBeatTime;

      // Ignore taps that are way too far from any beat (> half interval)
      if (Math.abs(diff) > interval / 2) return;

      const currentTap = tapCount + 1;
      setTapCount(currentTap);

      // Skip warmup taps
      if (currentTap > CALIBRATION_WARMUP_TAPS) {
        diffsRef.current.push(diff);
      }

      if (currentTap >= totalTaps) {
        // Done
        runningRef.current = false;
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

        try {
          const calcResult = calculateCalibrationResult(diffsRef.current);
          setResult(calcResult);
        } catch {
          setResult({ offset: 0, stdDev: 0, sampleCount: 0 });
        }
        setPhase('result');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [phase, tapCount, totalTaps]);

  const applyResult = () => {
    if (!result) return;
    if (calibType === 'visual') {
      updateSettings({ judgmentOffsetMs: result.offset });
    } else {
      updateSettings({ audioOffsetMs: result.offset });
    }
    setPhase('select');
  };

  const handleBack = () => {
    runningRef.current = false;
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    if (phase === 'select') {
      setScreen('settings');
    } else {
      setPhase('select');
    }
  };

  // --- Render ---
  if (phase === 'select') {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <h1 style={styles.title}>Calibration</h1>
          <button style={styles.backBtn} onClick={handleBack}>Back</button>
        </div>
        <div style={styles.content}>
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Visual Calibration</h2>
            <p style={styles.cardDesc}>
              노트가 판정선에 도달하는 것을 보고 아무 키나 누르세요.
              <br />
              소리 없이 시각 정보만 사용합니다.
              <br />
              결과는 Judgment Offset에 반영됩니다.
            </p>
            <button style={styles.startBtn} onClick={() => startCalibration('visual')}>
              Start Visual Calibration
            </button>
          </div>
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Audio Calibration</h2>
            <p style={styles.cardDesc}>
              비트 소리에 맞춰 아무 키나 누르세요.
              <br />
              화면에 노트가 표시되지 않습니다.
              <br />
              결과는 Audio Offset에 반영됩니다.
            </p>
            <button style={styles.startBtn} onClick={() => startCalibration('audio')}>
              Start Audio Calibration
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'running') {
    const isWarmup = tapCount < CALIBRATION_WARMUP_TAPS;
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <h1 style={styles.title}>
            {calibType === 'visual' ? 'Visual' : 'Audio'} Calibration
          </h1>
          <button style={styles.backBtn} onClick={handleBack}>Cancel</button>
        </div>
        <div style={styles.runningContent}>
          {calibType === 'visual' && (
            <canvas
              ref={canvasRef}
              width={400}
              height={500}
              style={styles.canvas}
            />
          )}
          {calibType === 'audio' && (
            <div style={styles.audioVisual}>
              <div style={styles.listenIcon}>&#9835;</div>
              <p style={styles.listenText}>소리에 맞춰 아무 키나 누르세요</p>
            </div>
          )}
          <div style={styles.progress}>
            <span style={styles.progressText}>
              {isWarmup
                ? `준비 중... (${tapCount}/${CALIBRATION_WARMUP_TAPS})`
                : `${tapCount - CALIBRATION_WARMUP_TAPS} / ${effectiveTaps}`}
            </span>
            <div style={styles.progressBar}>
              <div
                style={{
                  ...styles.progressFill,
                  width: `${(Math.max(0, tapCount - CALIBRATION_WARMUP_TAPS) / effectiveTaps) * 100}%`,
                }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // phase === 'result'
  const offsetLabel = calibType === 'visual' ? 'Judgment Offset' : 'Audio Offset';
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Calibration Result</h1>
      </div>
      <div style={styles.content}>
        <div style={styles.resultCard}>
          <h2 style={styles.cardTitle}>{calibType === 'visual' ? 'Visual' : 'Audio'} Calibration</h2>
          {result && result.sampleCount > 0 ? (
            <>
              <div style={styles.resultValue}>
                <span style={styles.resultLabel}>{offsetLabel}:</span>
                <span style={styles.resultNumber}>{result.offset} ms</span>
              </div>
              <div style={styles.resultMeta}>
                <span>Standard Deviation: {result.stdDev} ms</span>
                <span>Samples: {result.sampleCount}</span>
              </div>
              <div style={styles.resultActions}>
                <button style={styles.applyBtn} onClick={applyResult}>
                  Apply
                </button>
                <button style={styles.retryBtn} onClick={() => startCalibration(calibType)}>
                  Retry
                </button>
                <button style={styles.backBtn} onClick={() => setPhase('select')}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <p style={styles.cardDesc}>측정 데이터가 부족합니다. 다시 시도해주세요.</p>
              <div style={styles.resultActions}>
                <button style={styles.retryBtn} onClick={() => startCalibration(calibType)}>
                  Retry
                </button>
                <button style={styles.backBtn} onClick={() => setPhase('select')}>
                  Back
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
    color: '#e0e0e0',
    fontFamily: 'system-ui, sans-serif',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 24px',
    backgroundColor: '#2a2a2a',
    borderBottom: '1px solid #333',
  },
  title: {
    margin: 0,
    fontSize: '20px',
    fontWeight: 600,
  },
  backBtn: {
    padding: '6px 16px',
    backgroundColor: 'transparent',
    color: '#888',
    border: '1px solid #444',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
  },
  content: {
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    gap: '24px',
  },
  card: {
    backgroundColor: '#2a2a2a',
    padding: '32px',
    borderRadius: '8px',
    border: '1px solid #333',
    width: '100%',
    maxWidth: '480px',
    textAlign: 'center',
  },
  cardTitle: {
    fontSize: '18px',
    fontWeight: 600,
    margin: '0 0 12px',
    color: '#00ffff',
  },
  cardDesc: {
    fontSize: '14px',
    color: '#aaa',
    lineHeight: 1.6,
    margin: '0 0 20px',
  },
  startBtn: {
    padding: '10px 24px',
    backgroundColor: '#00ffff',
    color: '#1a1a1a',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 600,
  },
  runningContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    gap: '24px',
  },
  canvas: {
    border: '1px solid #333',
    borderRadius: '8px',
    backgroundColor: '#111',
  },
  audioVisual: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
    padding: '48px',
  },
  listenIcon: {
    fontSize: '72px',
    color: '#00ffff',
  },
  listenText: {
    fontSize: '16px',
    color: '#aaa',
  },
  progress: {
    width: '100%',
    maxWidth: '400px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    alignItems: 'center',
  },
  progressText: {
    fontSize: '14px',
    color: '#e0e0e0',
  },
  progressBar: {
    width: '100%',
    height: '8px',
    backgroundColor: '#333',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#00ffff',
    borderRadius: '4px',
    transition: 'width 0.2s',
  },
  resultCard: {
    backgroundColor: '#2a2a2a',
    padding: '32px',
    borderRadius: '8px',
    border: '1px solid #333',
    width: '100%',
    maxWidth: '480px',
    textAlign: 'center',
  },
  resultValue: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'baseline',
    gap: '12px',
    margin: '24px 0',
  },
  resultLabel: {
    fontSize: '16px',
    color: '#aaa',
  },
  resultNumber: {
    fontSize: '36px',
    fontWeight: 700,
    color: '#00ffff',
  },
  resultMeta: {
    display: 'flex',
    justifyContent: 'center',
    gap: '24px',
    fontSize: '13px',
    color: '#888',
    marginBottom: '24px',
  },
  resultActions: {
    display: 'flex',
    justifyContent: 'center',
    gap: '12px',
  },
  applyBtn: {
    padding: '10px 24px',
    backgroundColor: '#00ffff',
    color: '#1a1a1a',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 600,
  },
  retryBtn: {
    padding: '10px 24px',
    backgroundColor: '#3a3a3a',
    color: '#e0e0e0',
    border: '1px solid #555',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 500,
  },
};

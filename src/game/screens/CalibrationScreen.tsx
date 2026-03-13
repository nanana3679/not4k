import { useState, useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '../stores';
import {
  calculateCalibrationResult,
  calculateMedian,
  CALIBRATION_INTERVAL_MS,
  CALIBRATION_TOTAL_TAPS,
  CALIBRATION_WARMUP_TAPS,
  type CalibrationResult,
} from '../calibration/calibrationLogic';

type CalibrationType = 'visual' | 'audio' | 'verify';
type Phase = 'select' | 'running' | 'result' | 'verify';

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

/** 판정 등급을 diff(ms)로부터 결정한다. */
function getJudgmentLabel(absMs: number): { text: string; color: string } {
  if (absMs <= 41) return { text: 'Perfect', color: '#ffff00' };
  if (absMs <= 82) return { text: 'Great', color: '#00ff88' };
  if (absMs <= 120) return { text: 'Good', color: '#00aaff' };
  if (absMs <= 160) return { text: 'Bad', color: '#ff6b6b' };
  return { text: 'Miss', color: '#888' };
}

export function CalibrationScreen() {
  const { settings, updateSettings, setScreen } = useGameStore();
  const [phase, setPhase] = useState<Phase>('select');
  const [calibType, setCalibType] = useState<CalibrationType>('visual');
  const [tapCount, setTapCount] = useState(0);
  const [result, setResult] = useState<CalibrationResult | null>(null);

  // Verify mode state
  const [verifyDiffs, setVerifyDiffs] = useState<number[]>([]);
  const [lastDiff, setLastDiff] = useState<number | null>(null);

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
    } else if (type === 'audio') {
      startAudioLoop(audioCtx);
    } else {
      // verify: both visual + audio
      startVerifyLoop(audioCtx);
    }
  }, []);

  const startVerify = useCallback(() => {
    setPhase('verify');
    setVerifyDiffs([]);
    setLastDiff(null);
    diffsRef.current = [];
    beatIndexRef.current = 0;
    runningRef.current = true;

    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;

    const startDelay = 1500;
    startTimeRef.current = performance.now() + startDelay;
    nextBeatTimeRef.current = startTimeRef.current;

    startVerifyLoop(audioCtx);
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

  // --- Verify mode: visual + audio combined with offsets ---
  const startVerifyLoop = useCallback((audioCtx: AudioContext) => {
    const audioOffsetMs = settings.audioOffsetMs;
    const judgmentOffsetMs = settings.judgmentOffsetMs;

    const render = () => {
      if (!runningRef.current) return;
      const canvas = canvasRef.current;
      const now = performance.now();
      const startTime = startTimeRef.current;
      const interval = CALIBRATION_INTERVAL_MS;

      if (now < startTime) {
        animFrameRef.current = requestAnimationFrame(render);
        return;
      }

      const elapsed = now - startTime;
      const currentBeatIdx = Math.floor(elapsed / interval);

      // Play beep (with audio offset applied to scheduling)
      if (currentBeatIdx >= beatIndexRef.current) {
        // audioOffsetMs > 0 means audio plays late, so we schedule accordingly
        const beatTime = startTime + currentBeatIdx * interval;
        const scheduledAudioTime = beatTime + audioOffsetMs;
        if (now >= scheduledAudioTime) {
          playBeep(audioCtx);
          beatIndexRef.current = currentBeatIdx + 1;
        }
      }

      // Render falling notes (with judgment offset applied to visual timing)
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const w = canvas.width;
          const h = canvas.height;
          ctx.clearRect(0, 0, w, h);

          const judgmentY = h * 0.85;

          // Judgment line
          ctx.strokeStyle = '#00ffff';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(0, judgmentY);
          ctx.lineTo(w, judgmentY);
          ctx.stroke();

          ctx.fillStyle = '#00ffff';
          ctx.font = '14px system-ui';
          ctx.textAlign = 'center';
          ctx.fillText('TAP', w / 2, judgmentY + 20);

          const travelTime = interval;

          for (let i = currentBeatIdx - 1; i <= currentBeatIdx + 2; i++) {
            if (i < 0) continue;
            // Apply judgment offset: shift visual timing
            const beatTime = startTime + i * interval + judgmentOffsetMs;
            const progress = (now - beatTime + travelTime) / travelTime;

            if (progress < 0 || progress > 1.5) continue;

            const noteY = progress * judgmentY;
            const noteWidth = 120;
            const noteHeight = 12;

            const alpha = progress > 1.0 ? Math.max(0, 1 - (progress - 1.0) * 4) : 1;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = '#ff6b6b';
            ctx.fillRect(w / 2 - noteWidth / 2, noteY - noteHeight / 2, noteWidth, noteHeight);
            ctx.globalAlpha = 1;
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);
  }, [settings.audioOffsetMs, settings.judgmentOffsetMs]);

  // --- Handle tap input ---
  useEffect(() => {
    if (phase !== 'running' && phase !== 'verify') return;

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
      // verify 모드에서는 오프셋이 적용된 시점 기준으로 diff 계산
      const offsetAdjust = phase === 'verify' ? settings.judgmentOffsetMs : 0;
      const closestBeatTime = startTime + closestBeatIdx * interval + offsetAdjust;

      const diff = now - closestBeatTime;

      // Ignore taps that are way too far from any beat (> half interval)
      if (Math.abs(diff) > interval / 2) return;

      if (phase === 'verify') {
        // Verify mode: unlimited taps, real-time feedback
        setLastDiff(Math.round(diff));
        setVerifyDiffs((prev) => [...prev.slice(-19), Math.round(diff)]);
        return;
      }

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
  }, [phase, tapCount, totalTaps, settings.judgmentOffsetMs]);

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
          <div style={{ ...styles.card, borderColor: '#555' }}>
            <h2 style={{ ...styles.cardTitle, color: '#aaffaa' }}>Verify Calibration</h2>
            <p style={styles.cardDesc}>
              현재 오프셋이 적용된 상태에서 시각+오디오를 동시에 확인합니다.
              <br />
              노트와 소리가 동시에 나오며, 탭 타이밍 차이를 실시간으로 표시합니다.
              <br />
              <span style={{ color: '#e0e0e0' }}>
                Audio: {settings.audioOffsetMs}ms / Judgment: {settings.judgmentOffsetMs}ms
              </span>
            </p>
            <button style={{ ...styles.startBtn, backgroundColor: '#aaffaa' }} onClick={startVerify}>
              Start Verification
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

  // phase === 'verify'
  if (phase === 'verify') {
    const avg = verifyDiffs.length > 0
      ? Math.round(verifyDiffs.reduce((s, v) => s + v, 0) / verifyDiffs.length)
      : null;
    const judgment = lastDiff !== null ? getJudgmentLabel(Math.abs(lastDiff)) : null;

    // 5탭 이상이면 중앙값 기반 보정량 산출
    const canAdjust = verifyDiffs.length >= 5;
    const median = canAdjust ? calculateMedian(verifyDiffs) : 0;
    const adjustment = canAdjust ? Math.round(median) : 0;

    const applyAdjustment = () => {
      if (adjustment === 0) return;
      const newOffset = settings.judgmentOffsetMs + adjustment;
      updateSettings({ judgmentOffsetMs: newOffset });
      // 보정 적용 후 측정 초기화
      setVerifyDiffs([]);
      setLastDiff(null);
    };

    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <h1 style={styles.title}>Verify Calibration</h1>
          <button style={styles.backBtn} onClick={handleBack}>Stop</button>
        </div>
        <div style={styles.runningContent}>
          <canvas
            ref={canvasRef}
            width={400}
            height={400}
            style={styles.canvas}
          />
          <div style={styles.verifyFeedback}>
            {lastDiff !== null && judgment && (
              <div style={styles.verifyJudgment}>
                <span style={{ ...styles.verifyJudgmentText, color: judgment.color }}>
                  {judgment.text}
                </span>
                <span style={styles.verifyDiffText}>
                  {lastDiff > 0 ? '+' : ''}{lastDiff} ms
                  <span style={{ color: '#888', marginLeft: 8 }}>
                    ({lastDiff > 0 ? 'SLOW' : lastDiff < 0 ? 'FAST' : 'EXACT'})
                  </span>
                </span>
              </div>
            )}
            {avg !== null && (
              <div style={styles.verifyStats}>
                <span>Avg: {avg > 0 ? '+' : ''}{avg} ms</span>
                <span>Taps: {verifyDiffs.length}</span>
              </div>
            )}
            <div style={styles.verifyDiffBar}>
              {verifyDiffs.map((d, i) => {
                const j = getJudgmentLabel(Math.abs(d));
                const barPos = Math.max(-150, Math.min(150, d));
                return (
                  <div
                    key={i}
                    style={{
                      position: 'absolute',
                      left: `calc(50% + ${barPos}px)`,
                      width: 4,
                      height: 16,
                      backgroundColor: j.color,
                      borderRadius: 2,
                      opacity: 0.4 + (i / verifyDiffs.length) * 0.6,
                      transition: 'left 0.1s',
                    }}
                  />
                );
              })}
              {/* Center line */}
              <div style={styles.verifyDiffCenter} />
              {/* Scale labels */}
              <span style={{ ...styles.verifyScaleLabel, left: 'calc(50% - 152px)' }}>-150</span>
              <span style={{ ...styles.verifyScaleLabel, left: 'calc(50% - 2px)' }}>0</span>
              <span style={{ ...styles.verifyScaleLabel, left: 'calc(50% + 140px)' }}>+150</span>
            </div>
            {canAdjust && adjustment !== 0 && (
              <button style={styles.adjustBtn} onClick={applyAdjustment}>
                Judgment Offset {adjustment > 0 ? '+' : ''}{adjustment}ms 보정 적용
                ({settings.judgmentOffsetMs} → {settings.judgmentOffsetMs + adjustment}ms)
              </button>
            )}
            {canAdjust && adjustment === 0 && (
              <p style={{ fontSize: 13, color: '#aaffaa', margin: 0 }}>
                오프셋이 정확합니다!
              </p>
            )}
            <p style={{ fontSize: 12, color: '#666', margin: 0, textAlign: 'center' }}>
              Audio: {settings.audioOffsetMs}ms / Judgment: {settings.judgmentOffsetMs}ms
            </p>
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
  verifyFeedback: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
    width: '100%',
    maxWidth: '400px',
  },
  verifyJudgment: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
  },
  verifyJudgmentText: {
    fontSize: '28px',
    fontWeight: 700,
  },
  verifyDiffText: {
    fontSize: '16px',
    color: '#e0e0e0',
  },
  verifyStats: {
    display: 'flex',
    gap: '24px',
    fontSize: '13px',
    color: '#888',
  },
  verifyDiffBar: {
    position: 'relative' as const,
    width: '100%',
    height: '24px',
    backgroundColor: '#222',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  verifyDiffCenter: {
    position: 'absolute' as const,
    left: 'calc(50% - 1px)',
    top: 0,
    width: '2px',
    height: '100%',
    backgroundColor: '#555',
  },
  verifyScaleLabel: {
    position: 'absolute' as const,
    bottom: '-16px',
    fontSize: '10px',
    color: '#555',
  },
  adjustBtn: {
    padding: '10px 20px',
    backgroundColor: '#2a4a2a',
    color: '#aaffaa',
    border: '1px solid #aaffaa',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
    transition: 'background-color 0.2s',
  },
};

import { useState, useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '../../stores';
import { font, color, surface, edge, radius } from '../../../shared/theme';
import {
  calculateCalibrationResult,
  CALIBRATION_INTERVAL_MS,
  CALIBRATION_TOTAL_TAPS,
  CALIBRATION_WARMUP_TAPS,
  type CalibrationResult,
} from '../../calibration/calibrationLogic';

type CalibrationType = 'visual' | 'audio';
type Phase = 'select' | 'running' | 'result';

interface CalibrationViewProps {
  /** 보정을 마치고 설정 뷰로 돌아가는 동작(모달을 닫지는 않는다). */
  onExit: () => void;
}

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

export function CalibrationView({ onExit }: CalibrationViewProps) {
  const { updateSettings } = useGameStore();
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
      ctx.strokeStyle = color.neon;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, judgmentY);
      ctx.lineTo(w, judgmentY);
      ctx.stroke();

      // Draw "TAP" text on judgment line
      ctx.fillStyle = color.neon;
      ctx.font = `14px ${font.display}`;
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
        ctx.fillStyle = color.gold;
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

  const stopRun = useCallback(() => {
    runningRef.current = false;
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
  }, []);

  const startCalibration = useCallback((type: CalibrationType) => {
    // 이전 실행(Retry 등)의 rAF·AudioContext를 먼저 정리해 누적을 막는다.
    stopRun();
    setCalibType(type);
    setPhase('running');
    setTapCount(0);
    setResult(null);
    diffsRef.current = [];
    beatIndexRef.current = 0;
    runningRef.current = true;

    // Start after a short delay to let user prepare
    const startDelay = 1500;
    startTimeRef.current = performance.now() + startDelay;
    nextBeatTimeRef.current = startTimeRef.current;

    if (type === 'visual') {
      startVisualLoop();
    } else {
      // AudioContext는 오디오 보정에서만 생성한다(시각 보정은 소리를 쓰지 않음).
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      startAudioLoop(audioCtx);
    }
  }, [stopRun, startVisualLoop, startAudioLoop]);

  const handleBack = useCallback(() => {
    stopRun();
    if (phase === 'select') {
      onExit();
    } else {
      setPhase('select');
    }
  }, [phase, stopRun, onExit]);

  // --- Handle tap input ---
  useEffect(() => {
    if (phase !== 'running') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      // ESC cancels the running calibration instead of counting as a tap.
      if (e.key === 'Escape') {
        e.preventDefault();
        handleBack();
        return;
      }
      // Tab은 탭 입력으로 세지 않고 모달 포커스 이동에 양보한다(측정 노이즈 방지).
      if (e.key === 'Tab') return;
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
        // Done — rAF 취소 + AudioContext close(누적 방지)까지 한 번에 정리한다.
        // (마지막 비프의 ~30ms 꼬리가 잘릴 수 있으나, 컨텍스트 누수보다 낫다.)
        stopRun();

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
  }, [phase, tapCount, totalTaps, handleBack, stopRun]);

  // ESC returns to the select step from select/result (running is handled by the tap listener).
  useEffect(() => {
    if (phase === 'running') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      handleBack();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [phase, handleBack]);

  const applyResult = () => {
    if (!result) return;
    if (calibType === 'visual') {
      updateSettings({ judgmentOffsetMs: result.offset });
    } else {
      updateSettings({ audioOffsetMs: result.offset });
    }
    setPhase('select');
  };

  // --- Render ---
  if (phase === 'select') {
    return (
      <div className="cal-view">
        <style>{calibrationCss}</style>
        <header className="cal-header">
          <h1 className="cal-title"><span className="cal-title-tick" aria-hidden="true" />Calibration</h1>
          <button className="cal-back" onClick={handleBack}>Back</button>
        </header>
        <div className="cal-content">
          <div className="cal-cards">
            <section className="cal-card">
              <h2 className="cal-card-title">Visual</h2>
              <p className="cal-card-desc">
                Tap any key the moment the note reaches the judgment line — visual cue only, no sound.
                Result applies to <strong>Judgment Offset</strong>.
              </p>
              <button className="cal-btn cal-btn--accent" onClick={() => startCalibration('visual')}>
                Start Visual
              </button>
            </section>
            <section className="cal-card">
              <h2 className="cal-card-title">Audio</h2>
              <p className="cal-card-desc">
                Tap any key on the beat. No notes are shown.
                Result applies to <strong>Audio Offset</strong>.
              </p>
              <button className="cal-btn cal-btn--accent" onClick={() => startCalibration('audio')}>
                Start Audio
              </button>
            </section>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'running') {
    const isWarmup = tapCount < CALIBRATION_WARMUP_TAPS;
    const progress = Math.max(0, tapCount - CALIBRATION_WARMUP_TAPS) / effectiveTaps;
    return (
      <div className="cal-view">
        <style>{calibrationCss}</style>
        <header className="cal-header">
          <h1 className="cal-title"><span className="cal-title-tick" aria-hidden="true" />{calibType === 'visual' ? 'Visual' : 'Audio'} Calibration</h1>
          <button className="cal-back" onClick={handleBack}>Cancel</button>
        </header>
        <div className="cal-content cal-content--center">
          {calibType === 'visual' && (
            <canvas ref={canvasRef} width={400} height={500} className="cal-canvas" />
          )}
          {calibType === 'audio' && (
            <div className="cal-audio">
              <div className="cal-audio-icon" aria-hidden="true">&#9835;</div>
              <p className="cal-audio-text">Tap any key to the sound</p>
            </div>
          )}
          <div className="cal-progress">
            <span className="cal-progress-text">
              {isWarmup
                ? `Warming up… (${tapCount}/${CALIBRATION_WARMUP_TAPS})`
                : `${tapCount - CALIBRATION_WARMUP_TAPS} / ${effectiveTaps}`}
            </span>
            <div className="cal-progress-bar">
              <div className="cal-progress-fill" style={{ width: `${progress * 100}%` }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // phase === 'result'
  const offsetLabel = calibType === 'visual' ? 'Judgment Offset' : 'Audio Offset';
  return (
    <div className="cal-view">
      <style>{calibrationCss}</style>
      <header className="cal-header">
        <h1 className="cal-title"><span className="cal-title-tick" aria-hidden="true" />Calibration Result</h1>
      </header>
      <div className="cal-content">
        <section className="cal-card cal-card--result">
          <h2 className="cal-card-title">{calibType === 'visual' ? 'Visual' : 'Audio'} Calibration</h2>
          {result && result.sampleCount > 0 ? (
            <>
              <div className="cal-result-value">
                <span className="cal-result-num">{result.offset}</span>
                <span className="cal-result-unit">ms</span>
              </div>
              <p className="cal-result-label">{offsetLabel}</p>
              <div className="cal-result-meta">
                <span>σ {result.stdDev} ms</span>
                <span>{result.sampleCount} samples</span>
              </div>
              <div className="cal-actions">
                <button className="cal-btn cal-btn--accent" onClick={applyResult}>Apply</button>
                <button className="cal-btn" onClick={() => startCalibration(calibType)}>Retry</button>
                <button className="cal-btn cal-btn--ghost" onClick={() => setPhase('select')}>Cancel</button>
              </div>
            </>
          ) : (
            <>
              <p className="cal-card-desc">Not enough measurements. Please try again.</p>
              <div className="cal-actions">
                <button className="cal-btn cal-btn--accent" onClick={() => startCalibration(calibType)}>Retry</button>
                <button className="cal-btn cal-btn--ghost" onClick={() => setPhase('select')}>Back</button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

const calibrationCss = `
.cal-view {
  display: flex; flex-direction: column; height: 100%; min-height: 0; overflow: hidden;
  background: ${surface.panel}; color: ${color.ink};
  font-family: ${font.body}; font-size: 14px;
}
.cal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 20px; border-bottom: 1px solid ${color.line}; flex-shrink: 0;
}
.cal-title {
  margin: 0; display: flex; align-items: center; gap: 10px;
  font-family: ${font.display}; font-size: 16px; font-weight: 800;
  letter-spacing: 0.04em; text-transform: uppercase; color: ${color.inkStrong};
}
.cal-title-tick {
  width: 4px; height: 18px; border-radius: 2px; flex-shrink: 0;
  background: linear-gradient(180deg, ${color.neon}, #2b8f93);
  box-shadow: 0 0 10px -1px ${color.neonGlow};
}
.cal-back {
  padding: 6px 14px; font-family: ${font.display}; font-size: 13px; color: ${color.inkDim};
  background: transparent; border: 1px solid ${color.line}; border-radius: ${radius.sm}; cursor: pointer;
  transition: color 160ms ease, border-color 160ms ease, background 160ms ease;
}
.cal-back:hover { color: ${color.ink}; border-color: ${color.inkFaint}; background: ${surface.button}; }
.cal-back:focus-visible { outline: 2px solid ${color.neon}; outline-offset: 1px; }

.cal-content {
  flex: 1; min-height: 0; overflow-y: auto;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 16px; padding: 24px;
}
.cal-content--center { justify-content: center; }

.cal-cards { display: flex; flex-direction: column; gap: 12px; width: 100%; max-width: 460px; }
.cal-card {
  display: flex; flex-direction: column; gap: 12px; padding: 22px;
  background: ${surface.card}; border: 1px solid ${color.line}; border-radius: ${radius.md};
  box-shadow: ${edge.metal};
}
.cal-card--result { align-items: center; text-align: center; max-width: 380px; width: 100%; }
.cal-card-title {
  margin: 0; font-family: ${font.display}; font-size: 14px; font-weight: 700;
  letter-spacing: 0.04em; text-transform: uppercase; color: ${color.neon};
}
.cal-card-desc { margin: 0; font-size: 13px; line-height: 1.55; color: ${color.inkDim}; }
.cal-card-desc strong { color: ${color.ink}; font-weight: 600; }

.cal-btn {
  padding: 9px 18px; font-family: ${font.display}; font-size: 13px; font-weight: 600; color: #d7dde4;
  background: ${surface.button}; border: 1px solid ${color.line}; border-radius: ${radius.sm};
  box-shadow: ${edge.metal}; cursor: pointer; transition: border-color 160ms ease, color 160ms ease;
}
.cal-btn:hover { border-color: ${color.inkFaint}; color: ${color.inkStrong}; }
.cal-btn:focus-visible { outline: 2px solid ${color.neon}; outline-offset: 1px; }
.cal-btn--accent {
  color: ${color.neonInk}; background: ${surface.neonButton}; border-color: ${color.neon}; font-weight: 700;
  box-shadow: ${edge.metal}, 0 0 14px -7px ${color.neonGlow}; align-self: flex-start;
}
.cal-btn--accent:hover { border-color: ${color.neon}; box-shadow: ${edge.neonFocus}; }
.cal-card--result .cal-btn--accent { align-self: auto; }
.cal-btn--ghost { background: transparent; color: ${color.inkDim}; box-shadow: none; border-color: ${color.line}; }
.cal-btn--ghost:hover { color: ${color.ink}; }

.cal-canvas {
  border: 1px solid ${color.line}; border-radius: ${radius.md}; background: ${color.bg};
  max-width: 100%; height: auto;
}
.cal-audio { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 40px; }
.cal-audio-icon { font-size: 68px; line-height: 1; color: ${color.neon}; }
.cal-audio-text { margin: 0; font-size: 15px; color: ${color.inkDim}; }

.cal-progress {
  width: 100%; max-width: 400px;
  display: flex; flex-direction: column; align-items: center; gap: 8px;
}
.cal-progress-text { font-family: ${font.numeric}; font-size: 14px; font-variant-numeric: tabular-nums; color: ${color.ink}; }
.cal-progress-bar { width: 100%; height: 8px; background: rgba(255, 255, 255, 0.06); border-radius: ${radius.pill}; overflow: hidden; }
.cal-progress-fill { height: 100%; background: ${color.neon}; border-radius: ${radius.pill}; box-shadow: 0 0 10px -2px ${color.neonGlow}; transition: width 180ms ease; }

.cal-result-value { display: flex; align-items: baseline; gap: 6px; margin-top: 4px; }
.cal-result-num { font-family: ${font.numeric}; font-size: 44px; font-weight: 700; font-variant-numeric: tabular-nums; color: ${color.neon}; }
.cal-result-unit { font-size: 16px; color: ${color.inkDim}; }
.cal-result-label { margin: 2px 0 0; font-size: 13px; color: ${color.inkDim}; }
.cal-result-meta {
  display: flex; gap: 18px; margin: 14px 0 4px;
  font-family: ${font.numeric}; font-size: 13px; font-variant-numeric: tabular-nums; color: ${color.inkDim};
}
.cal-actions { display: flex; justify-content: center; gap: 10px; margin-top: 18px; }

@media (prefers-reduced-motion: reduce) {
  .cal-view *, .cal-progress-fill { transition-duration: 1ms !important; }
}
`;

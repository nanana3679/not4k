import { useRef, useState, useEffect, useCallback } from 'react';
import { getWaveformPeaks } from '../timeline/waveform';
import { dragRangeAt, initialRangeState, type PreviewRangeState, type RangeDrag } from './previewRangeState';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type { PreviewRangeState } from './previewRangeState';

export interface PreviewRangeSelectorProps {
  audioBuffer: AudioBuffer;
  /** 구간이 바뀔 때마다(렌더 뒤) 알린다. 처음 마운트할 때도 처음 구간을 한 번 알린다. */
  onChange: (state: PreviewRangeState | null) => void;
  /**
   * 파형에서 손을 뗄 때 놓은 위치로 계산한 마지막 구간을 바로 알린다. onChange는 렌더 뒤에 오므로 손을 떼는 순간에는
   * 마지막 끌기가 아직 반영되지 않았을 수 있다. 끌기를 마치고 적용하는 쪽은 이 값을 쓴다. 사용을 꺼 두었으면 null이다.
   */
  onDragEnd?: (state: PreviewRangeState | null) => void;
  initialStart?: number;
  initialEnd?: number;
  initialFadeInTime?: number;
  initialFadeOutTime?: number;
  label?: string;
  enabledLabel?: string;
  canDisable?: boolean;
  defaultStart?: number;
  defaultEnd?: number;
  defaultDuration?: number;
  minDuration?: number;
  maxDuration?: number;
  showFadeControls?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CANVAS_HEIGHT = 80;
const DEFAULT_DURATION = 15;
const HANDLE_HIT_PX = 6;
const COLOR_WAVE = '#4488ff';
const COLOR_WAVE_SELECTED = '#66aaff';
const COLOR_OVERLAY = 'rgba(68,136,255,0.2)';
const COLOR_HANDLE = '#ffffff';
const COLOR_CURSOR = '#ffffff';
const COLOR_DISABLED_OVERLAY = 'rgba(0,0,0,0.5)';

type DragMode = 'start' | 'end' | 'move' | null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PreviewRangeSelector({
  audioBuffer,
  onChange,
  onDragEnd,
  initialStart,
  initialEnd,
  initialFadeInTime,
  initialFadeOutTime,
  label,
  enabledLabel = '프리뷰 사용',
  canDisable = true,
  defaultStart,
  defaultEnd,
  defaultDuration = DEFAULT_DURATION,
  minDuration = 0.1,
  maxDuration,
  showFadeControls = false,
}: PreviewRangeSelectorProps) {
  const duration = audioBuffer.duration;
  const maxRangeDuration = Math.min(maxDuration ?? duration, duration);
  const minRangeDuration = Math.min(minDuration, duration);

  // 처음 구간은 곡 정보 드로어의 음원 교체도 같은 계산(initialRangeState)을 쓴다. 마운트할 때만 읽는다.
  const [initial] = useState(() => initialRangeState(duration, {
    initialStart, initialEnd, initialFadeInTime, initialFadeOutTime,
    defaultStart, defaultEnd, defaultDuration, showFadeControls,
  }));

  const [startTime, setStartTime] = useState(initial.startTime);
  const [endTime, setEndTime] = useState(initial.endTime);
  const [enabled, setEnabled] = useState(true);
  const [fadeInTime, setFadeInTime] = useState(initial.fadeInTime);
  const [fadeOutTime, setFadeOutTime] = useState(initial.fadeOutTime);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [dragMode, setDragMode] = useState<DragMode>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const peaksRef = useRef<Float32Array | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const playStartRef = useRef<number>(0);
  const playOffsetRef = useRef<number>(0);
  // 지금 끄는 중인 잡은 곳과 누른 순간의 x·구간. 끌기를 시작할 때 정하고 손을 떼면 비운다.
  const dragRef = useRef<RangeDrag | null>(null);

  // Notify parent
  useEffect(() => {
    const maxFade = Math.max(0, (endTime - startTime) / 2);
    const nextFadeIn = clamp(fadeInTime, 0, maxFade);
    const nextFadeOut = clamp(fadeOutTime, 0, maxFade);
    onChange(enabled ? {
      startTime,
      endTime,
      enabled,
      fadeInTime: nextFadeIn,
      fadeOutTime: nextFadeOut,
    } : null);
  }, [startTime, endTime, enabled, fadeInTime, fadeOutTime, onChange]);

  // Cache peaks
  const getPeaks = useCallback(() => {
    if (!peaksRef.current) {
      peaksRef.current = getWaveformPeaks(audioBuffer, 256);
    }
    return peaksRef.current;
  }, [audioBuffer]);

  // ---------------------------------------------------------------------------
  // Canvas drawing
  // ---------------------------------------------------------------------------

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const peaks = getPeaks();
    const peakCount = peaks.length;

    ctx.clearRect(0, 0, w, h);

    // Draw waveform bars
    const midY = h / 2;
    for (let px = 0; px < w; px++) {
      const t = (px / w) * duration;
      const peakIdx = Math.min(Math.floor((t / duration) * peakCount), peakCount - 1);
      const amp = peaks[peakIdx];
      const barH = amp * midY;

      const inSelection = t >= startTime && t <= endTime;
      ctx.fillStyle = inSelection ? COLOR_WAVE_SELECTED : COLOR_WAVE;
      ctx.fillRect(px, midY - barH, 1, barH * 2);
    }

    // Selection overlay
    const selStartPx = (startTime / duration) * w;
    const selEndPx = (endTime / duration) * w;
    ctx.fillStyle = COLOR_OVERLAY;
    ctx.fillRect(selStartPx, 0, selEndPx - selStartPx, h);

    // Handles
    ctx.fillStyle = COLOR_HANDLE;
    ctx.fillRect(Math.round(selStartPx) - 1, 0, 2, h);
    ctx.fillRect(Math.round(selEndPx) - 1, 0, 2, h);

    // Playback cursor
    if (isPlaying && playbackTime >= startTime && playbackTime <= endTime) {
      const cursorPx = (playbackTime / duration) * w;
      ctx.fillStyle = COLOR_CURSOR;
      ctx.globalAlpha = 0.8;
      ctx.fillRect(Math.round(cursorPx), 0, 1, h);
      ctx.globalAlpha = 1;
    }

    // Disabled overlay
    if (!enabled) {
      ctx.fillStyle = COLOR_DISABLED_OVERLAY;
      ctx.fillRect(0, 0, w, h);
    }
  }, [getPeaks, duration, startTime, endTime, isPlaying, playbackTime, enabled]);

  // Redraw on state change
  useEffect(() => { draw(); }, [draw]);

  // Resize observer to match container width
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = Math.floor(entry.contentRect.width);
      if (canvas.width !== w) {
        canvas.width = w;
        canvas.height = CANVAS_HEIGHT;
        draw();
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [draw]);

  // ---------------------------------------------------------------------------
  // Playback
  // ---------------------------------------------------------------------------

  const stopPlayback = useCallback(() => {
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch { /* already stopped */ }
      sourceRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    cancelAnimationFrame(rafRef.current);
    setIsPlaying(false);
    setPlaybackTime(0);
  }, []);

  const startPlayback = useCallback(() => {
    stopPlayback();

    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);

    const segDuration = endTime - startTime;
    source.start(0, startTime, segDuration);
    playStartRef.current = ctx.currentTime;
    playOffsetRef.current = startTime;
    sourceRef.current = source;
    setIsPlaying(true);

    source.onended = () => {
      setIsPlaying(false);
      setPlaybackTime(0);
      cancelAnimationFrame(rafRef.current);
      audioCtxRef.current?.close();
      audioCtxRef.current = null;
      sourceRef.current = null;
    };

    const step = () => {
      if (!audioCtxRef.current) return;
      const elapsed = audioCtxRef.current.currentTime - playStartRef.current;
      const currentTime = playOffsetRef.current + elapsed;
      if (currentTime >= endTime) {
        stopPlayback();
        return;
      }
      setPlaybackTime(currentTime);
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }, [audioBuffer, startTime, endTime, stopPlayback]);

  const togglePlayback = useCallback(() => {
    if (isPlaying) {
      stopPlayback();
    } else {
      startPlayback();
    }
  }, [isPlaying, stopPlayback, startPlayback]);

  // Cleanup on unmount or audioBuffer change
  useEffect(() => {
    return () => { stopPlayback(); };
  }, [stopPlayback]);

  // Stop playback when range changes during playback
  useEffect(() => {
    if (isPlaying) stopPlayback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioBuffer]);

  // ---------------------------------------------------------------------------
  // Drag interaction
  // ---------------------------------------------------------------------------

  const getTimeFromX = useCallback((clientX: number): number => {
    const canvas = canvasRef.current;
    if (!canvas) return 0;
    const rect = canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    return clamp((px / rect.width) * duration, 0, duration);
  }, [duration]);

  /** 끄는 중이면 포인터 위치의 구간(dragRangeAt), 아니면 null. */
  const rangeAt = useCallback((clientX: number): { startTime: number; endTime: number } | null => {
    const drag = dragRef.current;
    const canvas = canvasRef.current;
    if (!drag || !canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return dragRangeAt(drag, clientX, rect, { duration, minRangeDuration, maxRangeDuration });
  }, [duration, minRangeDuration, maxRangeDuration]);

  const hitTest = useCallback((clientX: number): DragMode => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const w = rect.width;

    const startPx = (startTime / duration) * w;
    const endPx = (endTime / duration) * w;

    if (Math.abs(px - startPx) <= HANDLE_HIT_PX) return 'start';
    if (Math.abs(px - endPx) <= HANDLE_HIT_PX) return 'end';
    if (px > startPx && px < endPx) return 'move';
    return null;
  }, [startTime, endTime, duration]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!enabled) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    const mode = hitTest(e.clientX);
    const clickTime = getTimeFromX(e.clientX);

    if (mode) {
      setDragMode(mode);
      dragRef.current = { mode, startX: e.clientX, startTime, endTime };
    } else {
      // Click outside → move selection centered on click
      const selDuration = endTime - startTime;
      const newStart = clamp(clickTime - selDuration / 2, 0, duration - selDuration);
      const newEnd = newStart + selDuration;
      setStartTime(newStart);
      setEndTime(newEnd);
    }
  }, [enabled, hitTest, getTimeFromX, startTime, endTime, duration]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!enabled) return;

    // Update cursor based on hover
    if (!dragMode) {
      const mode = hitTest(e.clientX);
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.style.cursor = mode === 'start' || mode === 'end'
          ? 'ew-resize'
          : mode === 'move' ? 'grab' : 'pointer';
      }
      return;
    }

    const range = rangeAt(e.clientX);
    if (!range) return;
    setStartTime(range.startTime);
    setEndTime(range.endTime);
  }, [enabled, dragMode, hitTest, rangeAt]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    // 놓은 위치로 마지막 구간을 다시 계산한다. 끌지 않았으면(구간 밖 클릭은 누를 때 옮겼다) 지금 구간이다.
    const range = rangeAt(e.clientX) ?? { startTime, endTime };
    dragRef.current = null;
    setStartTime(range.startTime);
    setEndTime(range.endTime);
    setDragMode(null);
    if (!onDragEnd) return;
    const maxFade = Math.max(0, (range.endTime - range.startTime) / 2);
    onDragEnd(enabled ? {
      ...range,
      enabled,
      fadeInTime: clamp(fadeInTime, 0, maxFade),
      fadeOutTime: clamp(fadeOutTime, 0, maxFade),
    } : null);
  }, [rangeAt, startTime, endTime, enabled, fadeInTime, fadeOutTime, onDragEnd]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const selDuration = endTime - startTime;
  const maxFade = Math.max(0, selDuration / 2);
  const clampedFadeIn = clamp(fadeInTime, 0, maxFade);
  const clampedFadeOut = clamp(fadeOutTime, 0, maxFade);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {(label || canDisable) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          {label && <span style={{ color: '#e0e0e0', fontSize: '13px', fontWeight: 700 }}>{label}</span>}
          {canDisable && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              {enabledLabel}
            </label>
          )}
        </div>
      )}

      <div
        ref={containerRef}
        style={{
          width: '100%',
          position: 'relative',
          opacity: enabled ? 1 : 0.5,
          borderRadius: '4px',
          overflow: 'hidden',
          backgroundColor: '#111',
        }}
      >
        <canvas
          ref={canvasRef}
          height={CANVAS_HEIGHT}
          style={{ display: 'block', width: '100%', height: `${CANVAS_HEIGHT}px` }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
        <button
          onClick={togglePlayback}
          disabled={!enabled}
          style={{
            padding: '4px 10px',
            backgroundColor: '#3a3a3a',
            color: '#e0e0e0',
            border: '1px solid #555',
            borderRadius: '4px',
            cursor: enabled ? 'pointer' : 'not-allowed',
            fontSize: '13px',
            opacity: enabled ? 1 : 0.5,
          }}
        >
          {isPlaying ? '\u23F8' : '\u25B6'}
        </button>
        <span style={{ color: '#aaa', fontFamily: 'monospace', fontSize: '12px' }}>
          {formatTime(startTime)} – {formatTime(endTime)} ({selDuration.toFixed(1)}s)
        </span>
      </div>

      {showFadeControls && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#aaa' }}>
            Fade In
            <input
              type="number"
              min={0}
              max={maxFade}
              step={0.1}
              value={clampedFadeIn}
              onChange={(e) => setFadeInTime(clamp(parseFloat(e.target.value) || 0, 0, maxFade))}
              style={{ padding: '6px 8px', backgroundColor: '#1a1a1a', color: '#e0e0e0', border: '1px solid #555', borderRadius: '4px' }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#aaa' }}>
            Fade Out
            <input
              type="number"
              min={0}
              max={maxFade}
              step={0.1}
              value={clampedFadeOut}
              onChange={(e) => setFadeOutTime(clamp(parseFloat(e.target.value) || 0, 0, maxFade))}
              style={{ padding: '6px 8px', backgroundColor: '#1a1a1a', color: '#e0e0e0', border: '1px solid #555', borderRadius: '4px' }}
            />
          </label>
        </div>
      )}
    </div>
  );
}

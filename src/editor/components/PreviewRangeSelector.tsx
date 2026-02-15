import { useRef, useState, useEffect, useCallback } from 'react';
import { getWaveformPeaks } from '../timeline/waveform';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PreviewRangeState {
  startTime: number;
  endTime: number;
  enabled: boolean;
}

interface PreviewRangeSelectorProps {
  audioBuffer: AudioBuffer;
  onChange: (state: PreviewRangeState | null) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CANVAS_HEIGHT = 80;
const MIN_DURATION = 5;
const MAX_DURATION = 30;
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

export function PreviewRangeSelector({ audioBuffer, onChange }: PreviewRangeSelectorProps) {
  const duration = audioBuffer.duration;

  // Compute initial range
  const initStart = Math.min(duration * 0.25, Math.max(0, duration - DEFAULT_DURATION));
  const initEnd = Math.min(initStart + DEFAULT_DURATION, duration);

  const [startTime, setStartTime] = useState(initStart);
  const [endTime, setEndTime] = useState(initEnd);
  const [enabled, setEnabled] = useState(true);
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
  const dragStartXRef = useRef<number>(0);
  const dragStartTimeRef = useRef<number>(0);
  const dragEndTimeRef = useRef<number>(0);

  // Notify parent
  useEffect(() => {
    onChange(enabled ? { startTime, endTime, enabled } : null);
  }, [startTime, endTime, enabled, onChange]);

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

    const tick = () => {
      if (!audioCtxRef.current) return;
      const elapsed = audioCtxRef.current.currentTime - playStartRef.current;
      const currentTime = playOffsetRef.current + elapsed;
      if (currentTime >= endTime) {
        stopPlayback();
        return;
      }
      setPlaybackTime(currentTime);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
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
      dragStartXRef.current = e.clientX;
      dragStartTimeRef.current = startTime;
      dragEndTimeRef.current = endTime;
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

    const t = getTimeFromX(e.clientX);
    const selDuration = dragEndTimeRef.current - dragStartTimeRef.current;

    if (dragMode === 'start') {
      // Resize from start handle
      const maxStart = dragEndTimeRef.current - MIN_DURATION;
      const minStart = Math.max(0, dragEndTimeRef.current - MAX_DURATION);
      const newStart = clamp(t, minStart, maxStart);
      setStartTime(newStart);
      setEndTime(dragEndTimeRef.current);
    } else if (dragMode === 'end') {
      // Resize from end handle
      const minEnd = dragStartTimeRef.current + MIN_DURATION;
      const maxEnd = Math.min(duration, dragStartTimeRef.current + MAX_DURATION);
      const newEnd = clamp(t, minEnd, maxEnd);
      setStartTime(dragStartTimeRef.current);
      setEndTime(newEnd);
    } else if (dragMode === 'move') {
      // Move entire selection
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dx = e.clientX - dragStartXRef.current;
      const dt = (dx / rect.width) * duration;
      let newStart = dragStartTimeRef.current + dt;
      newStart = clamp(newStart, 0, duration - selDuration);
      setStartTime(newStart);
      setEndTime(newStart + selDuration);
    }
  }, [enabled, dragMode, hitTest, getTimeFromX, duration]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    setDragMode(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const selDuration = endTime - startTime;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        프리뷰 사용
      </label>

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
    </div>
  );
}

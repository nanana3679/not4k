import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { type GearLightBox, type GearLightSide, getGlowPresentation } from './gearLight';
import {
  getPulseMaskGradient,
  getPulseTravelRange,
  getVisibleMeasurePulses,
  measureIntervalMs,
  progressToImageY,
} from './gearMeasurePulse';
import { getGearLightSample } from './gearLightAssets';
import './GearMeasurePulseTestPage.css';

interface GearLightMetadata {
  width: number;
  height: number;
  columnBoxes: Record<GearLightSide, GearLightBox>;
}

interface PulseControls {
  bpm: number;
  beatsPerMeasure: number;
  scrollSpeed: number;
  laneHeight: number;
  intensity: number;
  bandHeight: number;
  feather: number;
  showLaneLine: boolean;
  laneLineAlpha: number;
}

const DEFAULT_CONTROLS: PulseControls = {
  bpm: 150,
  beatsPerMeasure: 4,
  scrollSpeed: 800,
  laneHeight: 900,
  intensity: 1,
  bandHeight: 220,
  feather: 160,
  showLaneLine: true,
  laneLineAlpha: 0.25,
};

const SLIDERS: Array<{
  key: keyof Pick<
    PulseControls,
    'bpm' | 'beatsPerMeasure' | 'scrollSpeed' | 'laneHeight' | 'intensity' | 'bandHeight' | 'feather' | 'laneLineAlpha'
  >;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
}> = [
  { key: 'bpm', label: 'BPM', min: 60, max: 300, step: 1, format: (v) => `${v}` },
  { key: 'beatsPerMeasure', label: '박자 수', min: 1, max: 8, step: 0.5, format: (v) => `${v}박` },
  { key: 'scrollSpeed', label: '스크롤 속도', min: 200, max: 2000, step: 10, format: (v) => `${v}px/s` },
  { key: 'laneHeight', label: '레인 높이', min: 400, max: 1400, step: 10, format: (v) => `${v}px` },
  { key: 'intensity', label: '빛 세기', min: 0, max: 2, step: 0.01, format: (v) => v.toFixed(2) },
  { key: 'bandHeight', label: '밴드 높이', min: 40, max: 800, step: 10, format: (v) => `${v}px` },
  { key: 'feather', label: '페더', min: 0, max: 600, step: 10, format: (v) => `${v}px` },
  { key: 'laneLineAlpha', label: '마디선 알파', min: 0, max: 1, step: 0.01, format: (v) => v.toFixed(2) },
];

export default function GearMeasurePulseTestPage() {
  const sample = useMemo(() => getGearLightSample('original'), []);
  const [metadata, setMetadata] = useState<GearLightMetadata | null>(null);
  const [controls, setControls] = useState(DEFAULT_CONTROLS);
  const [playing, setPlaying] = useState(true);
  const [timeMs, setTimeMs] = useState(0);
  const lastTickRef = useRef<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch(sample.metadataSrc, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load ${sample.metadataSrc}`);
        }
        return response.json() as Promise<GearLightMetadata>;
      })
      .then(setMetadata)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        console.error(error);
      });

    return () => controller.abort();
  }, [sample.metadataSrc]);

  useEffect(() => {
    if (!playing) {
      lastTickRef.current = null;
      return;
    }

    let frameId = 0;
    const tick = (now: number) => {
      const last = lastTickRef.current;
      lastTickRef.current = now;
      if (last !== null) {
        setTimeMs((current) => current + (now - last));
      }
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frameId);
      lastTickRef.current = null;
    };
  }, [playing]);

  const setControl = (key: keyof PulseControls, value: number | boolean) => {
    setControls((current) => ({ ...current, [key]: value }));
  };

  const resetControls = () => {
    setControls(DEFAULT_CONTROLS);
    setTimeMs(0);
  };

  const intervalMs = measureIntervalMs(controls.bpm, controls.beatsPerMeasure);
  const travelMs = (controls.laneHeight / controls.scrollSpeed) * 1000;
  const pulses = getVisibleMeasurePulses({
    timeMs,
    measureIntervalMs: intervalMs,
    laneHeightPx: controls.laneHeight,
    scrollSpeedPxPerSec: controls.scrollSpeed,
  });

  const travelRange = metadata ? getPulseTravelRange(metadata.columnBoxes) : null;
  const glow = getGlowPresentation(controls.intensity);

  // 레인 마디선 비교용: 기둥 사이 안쪽 영역
  const laneInner = metadata
    ? {
        left: metadata.columnBoxes.left.x + metadata.columnBoxes.left.width,
        right: metadata.columnBoxes.right.x,
      }
    : null;

  return (
    <main className="gear-pulse-page">
      <section className="gear-pulse-stage-shell" aria-label="Measure pulse preview">
        <div
          className="gear-pulse-stage"
          style={{ aspectRatio: metadata ? `${metadata.width} / ${metadata.height}` : '3404 / 4704' }}
        >
          <img className="gear-pulse-layer" src={sample.baseSrc} alt="gear frame without glow" />

          {metadata && travelRange && pulses.map((pulse) => {
            const centerY = progressToImageY(pulse.progress, travelRange);
            const mask = getPulseMaskGradient(metadata.height, centerY, controls.bandHeight, controls.feather);
            const style: CSSProperties = {
              maskImage: mask,
              WebkitMaskImage: mask,
              opacity: glow.opacity,
              filter: `brightness(${glow.brightness}) saturate(${glow.saturation}) drop-shadow(0 0 ${glow.shadowPx}px rgba(175, 244, 255, 0.42))`,
            };

            return (
              <img
                key={pulse.measureIndex}
                className="gear-pulse-layer gear-pulse-glow"
                src={sample.glowSrc}
                alt=""
                style={style}
                aria-hidden="true"
              />
            );
          })}

          {metadata && travelRange && laneInner && controls.showLaneLine && pulses.map((pulse) => {
            const centerY = progressToImageY(pulse.progress, travelRange);
            const style: CSSProperties = {
              left: `${(laneInner.left / metadata.width) * 100}%`,
              width: `${((laneInner.right - laneInner.left) / metadata.width) * 100}%`,
              top: `${(centerY / metadata.height) * 100}%`,
              opacity: controls.laneLineAlpha,
            };

            return (
              <div
                key={pulse.measureIndex}
                className="gear-pulse-lane-line"
                style={style}
                aria-hidden="true"
              />
            );
          })}
        </div>
      </section>

      <aside className="gear-pulse-controls" aria-label="Measure pulse controls">
        <div className="gear-pulse-controls-header">
          <div>
            <p className="gear-pulse-eyebrow">measure pulse</p>
            <h1>마디 펄스</h1>
          </div>
          <button className="gear-pulse-reset" type="button" onClick={resetControls}>
            Reset
          </button>
        </div>

        <div className="gear-pulse-playback">
          <button type="button" onClick={() => setPlaying((current) => !current)}>
            {playing ? '일시정지' : '재생'}
          </button>
          <button type="button" onClick={() => setTimeMs(0)}>
            처음부터
          </button>
        </div>

        <div className="gear-pulse-stats">
          <span>마디 간격 {Math.round(intervalMs)}ms</span>
          <span>레인 통과 {Math.round(travelMs)}ms</span>
          <span>화면 펄스 {pulses.length}개</span>
        </div>

        <div className="gear-pulse-slider-list">
          {SLIDERS.map(({ key, label, min, max, step, format }) => (
            <label key={key} className="gear-pulse-slider">
              <span>{label}</span>
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={controls[key]}
                onChange={(event) => setControl(key, Number(event.currentTarget.value))}
                disabled={key === 'laneLineAlpha' && !controls.showLaneLine}
              />
              <strong>{format(controls[key])}</strong>
            </label>
          ))}
        </div>

        <label className="gear-pulse-checkbox">
          <input
            type="checkbox"
            checked={controls.showLaneLine}
            onChange={(event) => setControl('showLaneLine', event.currentTarget.checked)}
          />
          <span>레인 마디선 함께 표시 (하이브리드 비교)</span>
        </label>
      </aside>
    </main>
  );
}

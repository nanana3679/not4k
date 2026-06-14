import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import {
  type GearLightBox,
  type GearLightSide,
  formatClipInset,
  getClipInsetPercent,
  getGlowPresentation,
  getVisibleLightBox,
} from './gearLight';
import { GEAR_LIGHT_SAMPLES, getGearLightSample } from './gearLightAssets';
import {
  hasGearLightSideBoxes,
  resolveGearLightViewMode,
  type GearLightPreviewMode,
} from './gearLightPreviewMode';
import {
  type RuntimeGaugeConfig,
  type RuntimeGaugeDefinition,
  formatRuntimeGaugeGradient,
  getRuntimeGaugeFillBox,
} from './runtimeGauge';
import './GearLightTestPage.css';

type ViewMode = GearLightPreviewMode;

interface SideControl {
  height: number;
  intensity: number;
}

interface GearLightMetadata {
  width: number;
  height: number;
  columnBoxes: Record<GearLightSide, GearLightBox>;
  gaugeBoxes?: Record<GearLightSide, GearLightBox>;
}

const SIDES: Array<{ id: GearLightSide; label: string }> = [
  { id: 'left', label: '왼쪽 기둥' },
  { id: 'right', label: '오른쪽 기둥' },
];

const VIEW_MODES: Array<{ id: ViewMode; label: string }> = [
  { id: 'runtime', label: '런타임' },
  { id: 'adjusted', label: '조정' },
  { id: 'source', label: '원본' },
  { id: 'glow', label: '발광' },
  { id: 'gauge', label: '게이지' },
];

const DEFAULT_CONTROLS: Record<GearLightSide, SideControl> = {
  left: { height: 0.82, intensity: 1 },
  right: { height: 0.82, intensity: 1 },
};

const percent = (value: number) => `${Math.round(value * 100)}%`;

function boxToStyle(metadata: GearLightMetadata, box: { x: number; y: number; width: number; height: number }): CSSProperties {
  return {
    left: `${(box.x / metadata.width) * 100}%`,
    top: `${(box.y / metadata.height) * 100}%`,
    width: `${(box.width / metadata.width) * 100}%`,
    height: `${(box.height / metadata.height) * 100}%`,
  };
}

function runtimeBoxToStyle(config: RuntimeGaugeConfig, box: { x: number; y: number; width: number; height: number }): CSSProperties {
  return {
    left: `${(box.x / config.canvas.width) * 100}%`,
    top: `${(box.y / config.canvas.height) * 100}%`,
    width: `${(box.width / config.canvas.width) * 100}%`,
    height: `${(box.height / config.canvas.height) * 100}%`,
  };
}

function runtimeGaugeWindowStyle(config: RuntimeGaugeConfig, gauge: RuntimeGaugeDefinition): CSSProperties {
  return {
    ...runtimeBoxToStyle(config, gauge.window),
    borderRadius: `${(gauge.window.radius ?? 0) / Math.max(gauge.window.width, 1) * 100}% / ${(gauge.window.radius ?? 0) / Math.max(gauge.window.height, 1) * 100}%`,
  };
}

function runtimeGaugeFillStyle(config: RuntimeGaugeConfig, gauge: RuntimeGaugeDefinition, value: number): CSSProperties {
  const fillBox = getRuntimeGaugeFillBox(gauge, value);

  return {
    ...runtimeBoxToStyle(config, fillBox),
    background: formatRuntimeGaugeGradient(gauge),
    boxShadow: `0 0 ${gauge.innerGlow.blur}px ${gauge.innerGlow.color}`,
    opacity: gauge.innerGlow.alpha + 0.54,
  };
}

export default function GearLightTestPage() {
  const [selectedSampleId, setSelectedSampleId] = useState('compact-runtime-03');
  const [controls, setControls] = useState(DEFAULT_CONTROLS);
  const [viewMode, setViewMode] = useState<ViewMode>('runtime');
  const [showBoxes, setShowBoxes] = useState(true);
  const [showGaugeLayer, setShowGaugeLayer] = useState(true);
  const [gaugeHeight, setGaugeHeight] = useState(0.78);
  const [loadedMetadata, setLoadedMetadata] = useState<{ src: string; metadata: GearLightMetadata } | null>(null);
  const [runtimeGaugeValue, setRuntimeGaugeValue] = useState(0.62);
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeGaugeConfig | null>(null);

  const selectedSample = useMemo(() => getGearLightSample(selectedSampleId), [selectedSampleId]);

  // 샘플 변경 시 리셋은 렌더 중 파생으로 처리 — 현재 샘플의 metadata만 유효하다.
  const metadata = loadedMetadata?.src === selectedSample.metadataSrc ? loadedMetadata.metadata : null;

  useEffect(() => {
    const controller = new AbortController();

    if (selectedSample.runtimeConfigSrc) {
      return () => controller.abort();
    }

    fetch(selectedSample.metadataSrc, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load ${selectedSample.metadataSrc}`);
        }
        return response.json() as Promise<GearLightMetadata>;
      })
      .then((nextMetadata) => setLoadedMetadata({ src: selectedSample.metadataSrc, metadata: nextMetadata }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        console.error(error);
      });

    return () => controller.abort();
  }, [selectedSample.metadataSrc]);

  useEffect(() => {
    const controller = new AbortController();
    setRuntimeConfig(null);

    if (!selectedSample.runtimeConfigSrc) {
      return () => controller.abort();
    }

    fetch(selectedSample.runtimeConfigSrc, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load ${selectedSample.runtimeConfigSrc}`);
        }
        return response.json() as Promise<RuntimeGaugeConfig>;
      })
      .then((nextConfig) => setRuntimeConfig(nextConfig))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        console.error(error);
      });

    return () => controller.abort();
  }, [selectedSample.runtimeConfigSrc]);

  useEffect(() => {
    if (viewMode === 'gauge' && !selectedSample.gaugeSrc) {
      setViewMode('adjusted');
    }
    if (viewMode === 'runtime' && !selectedSample.runtimeConfigSrc) {
      setViewMode('adjusted');
    }
    if (viewMode === 'adjusted' && selectedSample.runtimeConfigSrc) {
      setViewMode('runtime');
    }
  }, [selectedSample.gaugeSrc, selectedSample.runtimeConfigSrc, viewMode]);

  const setSideControl = (side: GearLightSide, key: keyof SideControl, value: number) => {
    setControls((current) => ({
      ...current,
      [side]: {
        ...current[side],
        [key]: value,
      },
    }));
  };

  const resetControls = () => {
    setControls(DEFAULT_CONTROLS);
    setViewMode(selectedSample.runtimeConfigSrc ? 'runtime' : 'adjusted');
    setShowBoxes(true);
    setShowGaugeLayer(true);
    setGaugeHeight(0.78);
    setRuntimeGaugeValue(0.62);
  };

  const stageAspectRatio = runtimeConfig
    ? `${runtimeConfig.canvas.width} / ${runtimeConfig.canvas.height}`
    : metadata
      ? `${metadata.width} / ${metadata.height}`
      : '1672 / 941';
  const gaugeSrc = selectedSample.gaugeSrc;
  const columnBoxes = hasGearLightSideBoxes(metadata?.columnBoxes) ? metadata.columnBoxes : null;
  const gaugeBoxes = hasGearLightSideBoxes(metadata?.gaugeBoxes) ? metadata.gaugeBoxes : null;
  const canShowGauge = Boolean(gaugeSrc && gaugeBoxes);
  const canShowAdjusted = Boolean(metadata && columnBoxes);
  const canShowRuntimeGauge = Boolean(selectedSample.runtimeBackSrc && selectedSample.runtimeFrontSrc && runtimeConfig);
  const canRenderSelectedSample = Boolean(metadata || runtimeConfig);
  const resolvedViewMode = resolveGearLightViewMode({
    viewMode,
    canShowAdjusted,
    canShowGauge,
    canShowRuntimeGauge,
  });

  useEffect(() => {
    if (!metadata) return;

    if (viewMode === 'adjusted' && !canShowAdjusted) {
      setViewMode(canShowGauge ? 'gauge' : 'source');
    }

    if (viewMode === 'gauge' && !canShowGauge) {
      setViewMode(canShowAdjusted ? 'adjusted' : 'source');
    }
  }, [canShowAdjusted, canShowGauge, metadata, viewMode]);

  return (
    <main className="gear-light-page">
      <section className="gear-light-stage-shell" aria-label="Gear light preview">
        <div
          className="gear-light-stage"
          style={{ aspectRatio: stageAspectRatio }}
        >
          {!canRenderSelectedSample && (
            <img className="gear-light-layer" src={selectedSample.sourceSrc} alt="selected gear sample" />
          )}

          {canRenderSelectedSample && (
            <>
              {resolvedViewMode === 'source' && (
                <img className="gear-light-layer" src={selectedSample.sourceSrc} alt="selected gear sample" />
              )}

              {resolvedViewMode === 'glow' && (
                <img className="gear-light-layer gear-light-glow-only" src={selectedSample.glowSrc} alt="separated glow layer" />
              )}

              {resolvedViewMode === 'gauge' && gaugeSrc && (
                <img className="gear-light-layer gear-light-gauge-layer" src={gaugeSrc} alt="separated gauge layer" />
              )}

              {resolvedViewMode === 'runtime' && selectedSample.runtimeBackSrc && selectedSample.runtimeFrontSrc && runtimeConfig && (
                <>
                  <img className="gear-light-layer" src={selectedSample.runtimeBackSrc} alt="gear runtime back layer" />
                  {runtimeConfig.gauges.map((gauge) => (
                    <div
                      key={gauge.id}
                      className="gear-light-runtime-gauge-window"
                      style={runtimeGaugeWindowStyle(runtimeConfig, gauge)}
                      aria-hidden="true"
                    >
                      <div
                        className="gear-light-runtime-gauge-fill"
                        style={runtimeGaugeFillStyle(runtimeConfig, gauge, runtimeGaugeValue)}
                      />
                    </div>
                  ))}
                  <img className="gear-light-layer" src={selectedSample.runtimeFrontSrc} alt="gear runtime front layer" />
                </>
              )}

              {resolvedViewMode === 'adjusted' && metadata && columnBoxes && (
                <>
                  <img className="gear-light-layer" src={selectedSample.baseSrc} alt="gear without separated pillar glow" />
                  {SIDES.map(({ id }) => {
                    const clip = getClipInsetPercent(metadata, columnBoxes[id], controls[id].height);
                    const glow = getGlowPresentation(controls[id].intensity);
                    const style: CSSProperties = {
                      clipPath: formatClipInset(clip),
                      opacity: glow.opacity,
                      filter: `brightness(${glow.brightness}) saturate(${glow.saturation}) drop-shadow(0 0 ${glow.shadowPx}px rgba(175, 244, 255, 0.42))`,
                    };

                    return (
                      <img
                        key={id}
                        className="gear-light-layer gear-light-controlled-glow"
                        src={selectedSample.glowSrc}
                        alt=""
                        style={style}
                        aria-hidden="true"
                      />
                    );
                  })}
                  {canShowGauge && showGaugeLayer && gaugeBoxes && gaugeSrc && SIDES.map(({ id }) => {
                    const clip = getClipInsetPercent(metadata, gaugeBoxes[id], gaugeHeight);

                    return (
                      <img
                        key={id}
                        className="gear-light-layer gear-light-gauge-layer"
                        src={gaugeSrc}
                        alt=""
                        style={{ clipPath: formatClipInset(clip) }}
                        aria-hidden="true"
                      />
                    );
                  })}
                  {showBoxes && SIDES.map(({ id }) => {
                    const visibleBox = getVisibleLightBox(columnBoxes[id], controls[id].height);

                    return (
                      <div
                        key={id}
                        className={`gear-light-box gear-light-box-${id}`}
                        style={boxToStyle(metadata, visibleBox)}
                        aria-hidden="true"
                      />
                    );
                  })}
                </>
              )}
            </>
          )}
        </div>
      </section>

      <aside className="gear-light-controls" aria-label="Gear pillar light controls">
        <div className="gear-light-controls-header">
          <div>
            <p className="gear-light-eyebrow">{selectedSample.id}</p>
            <h1>기둥 라이트</h1>
          </div>
          <button className="gear-light-reset" type="button" onClick={resetControls}>
            Reset
          </button>
        </div>

        <div className="gear-light-sample-grid" role="listbox" aria-label="Gear sample selector">
          {GEAR_LIGHT_SAMPLES.map((sample) => (
            <button
              key={sample.id}
              type="button"
              className={selectedSampleId === sample.id ? 'is-active' : ''}
              onClick={() => {
                setSelectedSampleId(sample.id);
                setViewMode(sample.runtimeConfigSrc ? 'runtime' : 'adjusted');
              }}
              role="option"
              aria-selected={selectedSampleId === sample.id}
            >
              <img src={sample.sourceSrc} alt="" loading="lazy" />
              <span>{sample.label}</span>
            </button>
          ))}
        </div>

        <div className="gear-light-view-modes" role="tablist" aria-label="Preview mode">
          {VIEW_MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              className={resolvedViewMode === mode.id ? 'is-active' : ''}
              onClick={() => setViewMode(mode.id)}
              disabled={
                (mode.id === 'gauge' && !selectedSample.gaugeSrc)
                || (mode.id === 'adjusted' && (Boolean(selectedSample.runtimeConfigSrc) || (metadata !== null && !canShowAdjusted)))
                || (mode.id === 'runtime' && !selectedSample.runtimeConfigSrc)
              }
              role="tab"
              aria-selected={resolvedViewMode === mode.id}
            >
              {mode.label}
            </button>
          ))}
        </div>

        <label className="gear-light-checkbox">
          <input
            type="checkbox"
            checked={showBoxes}
            onChange={(event) => setShowBoxes(event.currentTarget.checked)}
            disabled={resolvedViewMode !== 'adjusted'}
          />
          <span>조정 영역 표시</span>
        </label>

        <label className="gear-light-checkbox">
          <input
            type="checkbox"
            checked={showGaugeLayer}
            onChange={(event) => setShowGaugeLayer(event.currentTarget.checked)}
            disabled={resolvedViewMode !== 'adjusted' || !canShowGauge}
          />
          <span>게이지 레이어 표시</span>
        </label>

        {canShowGauge && (
          <label className="gear-light-slider">
            <span>게이지 높이</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={gaugeHeight}
              onChange={(event) => setGaugeHeight(Number(event.currentTarget.value))}
              disabled={resolvedViewMode !== 'adjusted' || !showGaugeLayer}
            />
          </label>
        )}

        {canShowRuntimeGauge && (
          <label className="gear-light-slider">
            <span>런타임 게이지</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={runtimeGaugeValue}
              onChange={(event) => setRuntimeGaugeValue(Number(event.currentTarget.value))}
              disabled={resolvedViewMode !== 'runtime'}
            />
          </label>
        )}

        <div className="gear-light-side-list">
          {SIDES.map(({ id, label }) => (
            <section key={id} className="gear-light-side-control">
              <div className="gear-light-side-title">
                <h2>{label}</h2>
                <span>{percent(controls[id].height)}</span>
              </div>

              <label className="gear-light-slider">
                <span>빛 높이</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={controls[id].height}
                  onChange={(event) => setSideControl(id, 'height', Number(event.currentTarget.value))}
                />
              </label>

              <label className="gear-light-slider">
                <span>빛 세기</span>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.01"
                  value={controls[id].intensity}
                  onChange={(event) => setSideControl(id, 'intensity', Number(event.currentTarget.value))}
                />
              </label>

              <div className="gear-light-side-stats">
                <span>height {percent(controls[id].height)}</span>
                <span>intensity {controls[id].intensity.toFixed(2)}</span>
              </div>
            </section>
          ))}
        </div>
      </aside>
    </main>
  );
}

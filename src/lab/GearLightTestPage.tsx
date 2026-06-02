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
import './GearLightTestPage.css';

type ViewMode = 'adjusted' | 'source' | 'glow';

interface SideControl {
  height: number;
  intensity: number;
}

interface GearLightMetadata {
  width: number;
  height: number;
  columnBoxes: Record<GearLightSide, GearLightBox>;
}

const SIDES: Array<{ id: GearLightSide; label: string }> = [
  { id: 'left', label: '왼쪽 기둥' },
  { id: 'right', label: '오른쪽 기둥' },
];

const VIEW_MODES: Array<{ id: ViewMode; label: string }> = [
  { id: 'adjusted', label: '조정' },
  { id: 'source', label: '원본' },
  { id: 'glow', label: '발광' },
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

export default function GearLightTestPage() {
  const [selectedSampleId, setSelectedSampleId] = useState('original');
  const [controls, setControls] = useState(DEFAULT_CONTROLS);
  const [viewMode, setViewMode] = useState<ViewMode>('adjusted');
  const [showBoxes, setShowBoxes] = useState(true);
  const [metadata, setMetadata] = useState<GearLightMetadata | null>(null);

  const selectedSample = useMemo(() => getGearLightSample(selectedSampleId), [selectedSampleId]);

  useEffect(() => {
    const controller = new AbortController();
    setMetadata(null);

    fetch(selectedSample.metadataSrc, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load ${selectedSample.metadataSrc}`);
        }
        return response.json() as Promise<GearLightMetadata>;
      })
      .then((nextMetadata) => setMetadata(nextMetadata))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        console.error(error);
      });

    return () => controller.abort();
  }, [selectedSample.metadataSrc]);

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
    setViewMode('adjusted');
    setShowBoxes(true);
  };

  const stageAspectRatio = metadata ? `${metadata.width} / ${metadata.height}` : '3404 / 4704';

  return (
    <main className="gear-light-page">
      <section className="gear-light-stage-shell" aria-label="Gear light preview">
        <div
          className="gear-light-stage"
          style={{ aspectRatio: stageAspectRatio }}
        >
          {!metadata && (
            <img className="gear-light-layer" src={selectedSample.sourceSrc} alt="selected gear sample" />
          )}

          {metadata && (
            <>
              {viewMode === 'source' && (
                <img className="gear-light-layer" src={selectedSample.sourceSrc} alt="selected gear sample" />
              )}

              {viewMode === 'glow' && (
                <img className="gear-light-layer gear-light-glow-only" src={selectedSample.glowSrc} alt="separated glow layer" />
              )}

              {viewMode === 'adjusted' && (
                <>
                  <img className="gear-light-layer" src={selectedSample.baseSrc} alt="gear without separated pillar glow" />
                  {SIDES.map(({ id }) => {
                    const clip = getClipInsetPercent(metadata, metadata.columnBoxes[id], controls[id].height);
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
                  {showBoxes && SIDES.map(({ id }) => {
                    const visibleBox = getVisibleLightBox(metadata.columnBoxes[id], controls[id].height);

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
              onClick={() => setSelectedSampleId(sample.id)}
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
              className={viewMode === mode.id ? 'is-active' : ''}
              onClick={() => setViewMode(mode.id)}
              role="tab"
              aria-selected={viewMode === mode.id}
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
            disabled={viewMode !== 'adjusted'}
          />
          <span>조정 영역 표시</span>
        </label>

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

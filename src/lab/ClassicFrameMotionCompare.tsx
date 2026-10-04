import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { RadioGroup } from './ClassicFrameFitControls';
import type { FrameMotionPreview } from './classicFrameMotionCompare';
import {
  FRAME_MOTION_LAYERS,
  FRAME_MOTION_SVG_PATH,
  FRAME_MOTION_VIEWS,
  formatViewBox,
  readSvgBaseHref,
  type FrameMotionAssets,
  type FrameMotionLayerVisibility,
  type FrameMotionView,
} from './classicFrameMotionData';
import { withLabPublicBase } from './labPublicPath';

/** 비교 시계 범위(광원 한 번 지나가는 60초). 재생하면 60초에서 0초로 돌아간다. */
export const COMPARE_DURATION_MS = 60_000;
const VIEW_OPTIONS = (Object.keys(FRAME_MOTION_VIEWS) as FrameMotionView[]).map((value) => ({ value, label: FRAME_MOTION_VIEWS[value].label }));

type Status = { state: 'loading' } | { state: 'ready' } | { state: 'error'; message: string };

/**
 * 프레임만 그린 작은 Pixi 앱(GameRenderer 아님)과 승인된 애니메이션 SVG를 같은 CSS 크기·viewBox·시각으로 나란히 보여 준다.
 * SVG의 CSS 애니메이션은 모두 멈추고 currentTime을 비교 시각으로 맞춘다. 움직임 요소 체크와 움직임 줄이기는 양쪽에 함께 건다.
 */
export function ClassicFrameMotionCompare({ assets, layers, reducedMotion }: {
  assets: FrameMotionAssets | null;
  layers: FrameMotionLayerVisibility;
  reducedMotion: boolean;
}) {
  const [view, setView] = useState<FrameMotionView>('full');
  const [timeMs, setTimeMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState<Status>({ state: 'loading' });
  // 승인 SVG(약 3.8MB)와 두 번째 WebGL 앱은 구역이 화면 가까이(600px) 오면 그때 만든다.
  const [nearViewport, setNearViewport] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pixiViewportRef = useRef<HTMLDivElement>(null);
  const svgHostRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<FrameMotionPreview | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const stateRef = useRef({ view, timeMs, layers, reducedMotion });
  stateRef.current = { view, timeMs, layers, reducedMotion };

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || nearViewport) return;
    if (typeof IntersectionObserver === 'undefined') {
      setNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setNearViewport(true);
    }, { rootMargin: '600px 0px' });
    observer.observe(section);
    return () => observer.disconnect();
  }, [nearViewport]);

  // 승인 SVG를 문서에 넣고, 같은 바탕 그림으로 Pixi 비교 앱을 만든다.
  useEffect(() => {
    const canvas = canvasRef.current;
    const host = svgHostRef.current;
    const viewport = pixiViewportRef.current;
    if (!assets || !nearViewport || !canvas || !host || !viewport) return;
    let cancelled = false;
    let preview: FrameMotionPreview | null = null;
    (async () => {
      const response = await fetch(withLabPublicBase(FRAME_MOTION_SVG_PATH));
      if (!response.ok) throw new Error(`승인 SVG를 불러오지 못했습니다 (${response.status}).`);
      const parsed = new DOMParser().parseFromString(await response.text(), 'image/svg+xml');
      if (parsed.documentElement.nodeName !== 'svg' || parsed.querySelector('parsererror')) throw new Error('승인 SVG를 읽지 못했습니다.');
      const base = new Image();
      base.src = readSvgBaseHref(parsed);
      const [{ createFrameMotionPreview }] = await Promise.all([import('./classicFrameMotionCompare'), base.decode()]);
      if (cancelled) return;
      const svg = document.importNode(parsed.documentElement, true) as unknown as SVGSVGElement;
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', '승인된 Classic 프레임 움직임 SVG');
      svg.classList.add('frame-motion-svg');
      host.replaceChildren(svg);
      svgRef.current = svg;
      const size = viewport.getBoundingClientRect();
      preview = await createFrameMotionPreview({
        canvas,
        width: Math.max(1, Math.round(size.width)),
        height: Math.max(1, Math.round(size.height)),
        resolution: window.devicePixelRatio || 1,
        base,
        assets,
      });
      if (cancelled) {
        preview.destroy();
        return;
      }
      previewRef.current = preview;
      setStatus({ state: 'ready' });
    })().catch((error: unknown) => {
      if (!cancelled) setStatus({ state: 'error', message: error instanceof Error ? error.message : '비교 화면을 만들지 못했습니다.' });
    });
    return () => {
      cancelled = true;
      preview?.destroy();
      previewRef.current = null;
      svgRef.current = null;
      host.replaceChildren();
    };
  }, [assets, nearViewport]);

  const ready = status.state === 'ready';

  // 같은 시각을 양쪽에 건다: Pixi는 update 뒤 한 장 그리고, SVG는 모든 애니메이션을 멈춘 채 currentTime을 맞춘다.
  useEffect(() => {
    const preview = previewRef.current;
    const svg = svgRef.current;
    if (!ready || !preview || !svg) return;
    const { viewBox } = FRAME_MOTION_VIEWS[view];
    svg.setAttribute('viewBox', formatViewBox(viewBox));
    for (const layer of FRAME_MOTION_LAYERS) preview.motion.setLayerVisible(layer, layers[layer]);
    preview.motion.setReducedMotion(reducedMotion);
    preview.setViewBox(viewBox);
    for (const animation of svg.getAnimations({ subtree: true })) {
      animation.pause();
      animation.currentTime = timeMs;
    }
    preview.render(timeMs);
  }, [ready, view, timeMs, layers, reducedMotion]);

  // 패널 크기가 바뀌면(보기·창 폭) 캔버스 백버퍼를 CSS 크기 × devicePixelRatio로 맞춘다.
  useEffect(() => {
    const viewport = pixiViewportRef.current;
    if (!ready || !viewport || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      const preview = previewRef.current;
      if (!preview) return;
      const size = viewport.getBoundingClientRect();
      preview.resize(Math.max(1, Math.round(size.width)), Math.max(1, Math.round(size.height)), window.devicePixelRatio || 1);
      preview.render(stateRef.current.timeMs);
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [ready]);

  // 재생: 벽시계로 비교 시각을 넘기고 60초에서 0초로 돌아간다.
  useEffect(() => {
    if (!playing || !ready) return;
    let frame = 0;
    let previous = performance.now();
    const step = (now: number) => {
      const delta = now - previous;
      previous = now;
      setTimeMs((time) => (time + delta) % COMPARE_DURATION_MS);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [playing, ready]);

  const aspect: CSSProperties = { aspectRatio: `${FRAME_MOTION_VIEWS[view].viewBox.width} / ${FRAME_MOTION_VIEWS[view].viewBox.height}` };
  const offLayers = Object.fromEntries(FRAME_MOTION_LAYERS.filter((layer) => !layers[layer]).map((layer) => [`data-off-${layer}`, '']));

  return (
    <section
      ref={sectionRef}
      className="frame-motion-compare"
      aria-labelledby="frame-motion-compare-title"
      data-frame-motion-compare="true"
      data-compare-ready={ready ? 'true' : 'false'}
      data-compare-view={view}
      data-compare-time-ms={Math.round(timeMs)}
      data-compare-playing={playing ? 'true' : 'false'}
    >
      <header className="frame-motion-compare-head">
        <h2 id="frame-motion-compare-title">Pixi ↔ 승인 SVG 비교</h2>
        <p>
          프레임만 그린 작은 Pixi 화면(게임 렌더러 아님)과 승인된 애니메이션 SVG를 같은 크기·같은 시각으로 나란히 봅니다.
          두 화면 모두 SVG 안의 같은 바탕 그림을 쓰고, 위의 움직임 요소 체크가 양쪽에 함께 적용됩니다.
        </p>
      </header>
      <div className="frame-motion-compare-controls">
        <RadioGroup legend="비교 보기" name="frame-motion-compare-view" value={view} options={VIEW_OPTIONS} onChange={setView} />
        <div className="frame-fit-slider">
          <div className="frame-fit-slider-head">
            <label htmlFor="frame-motion-compare-time">비교 시각</label>
            <output htmlFor="frame-motion-compare-time">{(timeMs / 1000).toFixed(1)}초</output>
          </div>
          <input
            id="frame-motion-compare-time"
            type="range"
            min={0}
            max={COMPARE_DURATION_MS / 1000}
            step={0.1}
            value={Number((timeMs / 1000).toFixed(1))}
            onChange={(event) => setTimeMs(Math.round(Number(event.currentTarget.value) * 1000))}
          />
          <div className="frame-fit-actions">
            <button type="button" className="frame-fit-button" aria-pressed={playing} disabled={!ready} onClick={() => setPlaying((value) => !value)}>
              {playing ? '일시정지' : '재생'}
            </button>
          </div>
          <p className="frame-fit-note">0~60초(광원 한 번)를 고르면 양쪽이 같은 순간을 그립니다. 재생하면 같은 시계로 함께 움직입니다.</p>
        </div>
      </div>
      {status.state === 'error' && <p className="frame-fit-error-inline" role="alert">{status.message}</p>}
      {!assets && <p className="frame-fit-note">움직임 자료를 불러오는 중이거나 불러오지 못했습니다.</p>}
      <div className="frame-motion-panels" data-view={view}>
        <figure className="frame-motion-panel">
          <div className="frame-motion-viewport" ref={pixiViewportRef} style={aspect}>
            <canvas ref={canvasRef} className="frame-motion-canvas" data-frame-motion-compare-canvas="true" />
          </div>
          <figcaption>Pixi 레이어(텍스처·마스크로 다시 구성)</figcaption>
        </figure>
        <figure className="frame-motion-panel">
          <div className="frame-motion-viewport" ref={svgHostRef} style={aspect} data-frame-motion-svg-host="true" {...offLayers} />
          <figcaption>승인 SVG(54-ambient-motion-v19.svg)</figcaption>
        </figure>
      </div>
    </section>
  );
}

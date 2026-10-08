import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { RadioGroup } from './GearControls';
import type { GearMotionPreview } from './gearMotionCompare';
import type { GearMotionResources } from '../game/renderer/gearMotionAssets';
import { GEAR_MOTION_LAYERS, type GearMotionLayerVisibility } from '../game/renderer/gearMotionData';
import { GEAR_MOTION_SVG_PATH, GEAR_MOTION_VIEWS, formatViewBox, readSvgBaseHref, type GearMotionView } from './gearMotionView';
import { withLabPublicBase } from './labPublicPath';

/** `비교 시각`(애니메이션 경과 시간)의 범위(광원이 한 번 지나가는 60초). 재생하면 60초에서 0초로 돌아간다. */
export const COMPARE_DURATION_MS = 60_000;
const VIEW_OPTIONS = (Object.keys(GEAR_MOTION_VIEWS) as GearMotionView[]).map((value) => ({ value, label: GEAR_MOTION_VIEWS[value].label }));

type SvgState = { state: 'loading' } | { state: 'ready'; base: HTMLImageElement } | { state: 'error'; message: string };
/** key는 이 상태를 만든 설정(MSAA·띠 가장자리). 설정이 바뀌면 이전 상태는 무시하고 준비 중으로 본다. */
type PixiState =
  | { state: 'loading'; key: string }
  /** generation: 이 비교 화면이 Pixi 앱을 몇 번째로 새로 만들었는지(가장자리 설정을 바꾸면 늘어난다). samples: 실제 MSAA 샘플 수. */
  | { state: 'ready'; key: string; generation: number; samples: number }
  | { state: 'error'; key: string; message: string };

const errorMessage = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

/**
 * 기어만 그린 작은 Pixi 앱(GameRenderer 아님)과 승인된 애니메이션 SVG를 같은 CSS 크기·viewBox·시각으로 나란히 보여 준다.
 * SVG의 CSS 애니메이션은 모두 멈추고 currentTime을 비교 시각으로 맞춘다. `gearMotion` 요소 체크와 `reducedMotion`은 양쪽에 함께 적용한다.
 * Pixi 앱은 만들 때마다 새 캔버스를 쓴다. WebGL 컨텍스트 속성(MSAA)은 캔버스마다 한 번만 정해지고, 앞선 초기화가 끝나기 전에
 * 다시 만들더라도 두 앱이 한 컨텍스트를 함께 쓰지 않게 하기 위해서다.
 */
export function GearMotionCompare({ resources, layers, reducedMotion }: {
  /** 페이지가 공유 로더에서 acquire한 `gearMotion` 에셋(무대의 게임 렌더러와 같은 공유 에셋). 준비 전이면 null. */
  resources: GearMotionResources | null;
  layers: GearMotionLayerVisibility;
  reducedMotion: boolean;
}) {
  const [view, setView] = useState<GearMotionView>('full');
  const [timeMs, setTimeMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  // 게임 렌더러는 MSAA 없이 스텐실 띠를 쓴다. 두 설정은 그와 비교해 가장자리가 얼마나 부드러워지는지 보는 용도다.
  const [antialias, setAntialias] = useState(false);
  const [softBand, setSoftBand] = useState(false);
  const [svgState, setSvgState] = useState<SvgState>({ state: 'loading' });
  const [reportedPixi, setPixiState] = useState<PixiState>({ state: 'loading', key: '' });
  // 승인 SVG(약 3.8MB)와 두 번째 WebGL 앱은 구역이 화면 가까이(600px) 오면 그때 만든다.
  const [nearViewport, setNearViewport] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const pixiViewportRef = useRef<HTMLDivElement>(null);
  const svgHostRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<GearMotionPreview | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const generationRef = useRef(0);
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

  // 승인 SVG를 문서에 넣고 그 바탕 그림을 꺼낸다. 가장자리 설정을 바꿔도 다시 읽지 않는다.
  useEffect(() => {
    const host = svgHostRef.current;
    if (!resources || !nearViewport || !host) return;
    let cancelled = false;
    (async () => {
      const response = await fetch(withLabPublicBase(GEAR_MOTION_SVG_PATH));
      if (!response.ok) throw new Error(`승인 SVG를 불러오지 못했습니다 (${response.status}).`);
      const parsed = new DOMParser().parseFromString(await response.text(), 'image/svg+xml');
      if (parsed.documentElement.nodeName !== 'svg' || parsed.querySelector('parsererror')) throw new Error('승인 SVG를 읽지 못했습니다.');
      const base = new Image();
      base.src = readSvgBaseHref(parsed);
      await base.decode();
      if (cancelled) return;
      const svg = document.importNode(parsed.documentElement, true) as unknown as SVGSVGElement;
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', '승인된 기어 움직임 SVG');
      svg.classList.add('gear-motion-svg');
      host.replaceChildren(svg);
      svgRef.current = svg;
      setSvgState({ state: 'ready', base });
    })().catch((error: unknown) => {
      if (!cancelled) setSvgState({ state: 'error', message: errorMessage(error, '승인 SVG를 읽지 못했습니다.') });
    });
    return () => {
      cancelled = true;
      svgRef.current = null;
      host.replaceChildren();
    };
  }, [resources, nearViewport]);

  const base = svgState.state === 'ready' ? svgState.base : null;
  const pixiKey = `${antialias ? 'msaa' : 'plain'}:${softBand ? 'soft' : 'stencil'}`;
  const pixiState: PixiState = reportedPixi.key === pixiKey ? reportedPixi : { state: 'loading', key: pixiKey };

  // 같은 바탕 그림으로 Pixi 비교 앱을 만든다. 시도마다 새 캔버스를 붙이고, 정리할 때 앱과 캔버스를 함께 치운다.
  useEffect(() => {
    const viewport = pixiViewportRef.current;
    if (!resources || !base || !viewport) return;
    let cancelled = false;
    let preview: GearMotionPreview | null = null;
    const canvas = document.createElement('canvas');
    canvas.className = 'gear-motion-canvas';
    canvas.dataset.gearMotionCompareCanvas = 'true';
    viewport.replaceChildren(canvas);
    const key = `${antialias ? 'msaa' : 'plain'}:${softBand ? 'soft' : 'stencil'}`;
    (async () => {
      const { createGearMotionPreview } = await import('./gearMotionCompare');
      if (cancelled) return;
      const size = viewport.getBoundingClientRect();
      const created = await createGearMotionPreview({
        canvas,
        width: Math.max(1, Math.round(size.width)),
        height: Math.max(1, Math.round(size.height)),
        resolution: window.devicePixelRatio || 1,
        base,
        motion: resources,
        antialias,
        bandEdges: softBand ? 'soft' : 'stencil',
      });
      if (cancelled) {
        created.destroy();
        return;
      }
      preview = created;
      previewRef.current = created;
      generationRef.current += 1;
      setPixiState({ state: 'ready', key, generation: generationRef.current, samples: created.samples });
    })().catch((error: unknown) => {
      if (!cancelled) setPixiState({ state: 'error', key, message: errorMessage(error, '비교 화면을 만들지 못했습니다.') });
    });
    return () => {
      cancelled = true;
      preview?.destroy();
      if (previewRef.current === preview) previewRef.current = null;
      canvas.remove();
    };
  }, [resources, base, antialias, softBand]);

  const ready = svgState.state === 'ready' && pixiState.state === 'ready';
  const generation = pixiState.state === 'ready' ? pixiState.generation : 0;

  // 같은 시각을 양쪽에 건다: Pixi는 update 뒤 한 장 그리고, SVG는 모든 애니메이션을 멈춘 채 currentTime을 맞춘다.
  useEffect(() => {
    const preview = previewRef.current;
    const svg = svgRef.current;
    if (!ready || !preview || !svg) return;
    const { viewBox } = GEAR_MOTION_VIEWS[view];
    svg.setAttribute('viewBox', formatViewBox(viewBox));
    for (const layer of GEAR_MOTION_LAYERS) preview.motion.setLayerVisible(layer, layers[layer]);
    preview.motion.setReducedMotion(reducedMotion);
    preview.setViewBox(viewBox);
    for (const animation of svg.getAnimations({ subtree: true })) {
      animation.pause();
      animation.currentTime = timeMs;
    }
    preview.render(timeMs);
  }, [ready, generation, view, timeMs, layers, reducedMotion]);

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
  }, [ready, generation]);

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

  const aspect: CSSProperties = { aspectRatio: `${GEAR_MOTION_VIEWS[view].viewBox.width} / ${GEAR_MOTION_VIEWS[view].viewBox.height}` };
  const offLayers = Object.fromEntries(GEAR_MOTION_LAYERS.filter((layer) => !layers[layer]).map((layer) => [`data-off-${layer}`, '']));
  const errors = [svgState, pixiState].flatMap((entry) => (entry.state === 'error' ? [entry.message] : []));

  return (
    <section
      ref={sectionRef}
      className="gear-motion-compare"
      aria-labelledby="gear-motion-compare-title"
      data-gear-motion-compare="true"
      data-compare-ready={ready ? 'true' : 'false'}
      data-compare-view={view}
      data-compare-time-ms={Math.round(timeMs)}
      data-compare-playing={playing ? 'true' : 'false'}
      data-compare-antialias={antialias ? 'on' : 'off'}
      data-compare-band-edges={softBand ? 'soft' : 'stencil'}
      data-compare-generation={generation}
      data-compare-samples={pixiState.state === 'ready' ? pixiState.samples : undefined}
    >
      <header className="gear-motion-compare-head">
        <h2 id="gear-motion-compare-title">Pixi ↔ 승인 SVG 비교</h2>
        <p>
          게임과 같은 움직임 모듈로 기어만 그린 작은 Pixi 화면(게임 렌더러 아님)과 승인된 애니메이션 SVG를 같은 크기·같은 시각으로 나란히 봅니다.
          두 화면 모두 SVG 안의 같은 바탕 그림을 쓰고, 위의 움직임 요소 체크가 양쪽에 함께 적용됩니다.
        </p>
      </header>
      <div className="gear-motion-compare-controls">
        <RadioGroup legend="비교 보기" name="gear-motion-compare-view" value={view} options={VIEW_OPTIONS} onChange={setView} />
        <div className="gear-preview-slider">
          <div className="gear-preview-slider-head">
            <label htmlFor="gear-motion-compare-time">비교 시각</label>
            <output htmlFor="gear-motion-compare-time">{(timeMs / 1000).toFixed(1)}초</output>
          </div>
          <input
            id="gear-motion-compare-time"
            type="range"
            min={0}
            max={COMPARE_DURATION_MS / 1000}
            step={0.1}
            value={Number((timeMs / 1000).toFixed(1))}
            onChange={(event) => setTimeMs(Math.round(Number(event.currentTarget.value) * 1000))}
          />
          <div className="gear-preview-actions">
            <button type="button" className="gear-preview-button" aria-pressed={playing} disabled={!ready} onClick={() => setPlaying((value) => !value)}>
              {playing ? '일시정지' : '재생'}
            </button>
          </div>
          <p className="gear-preview-note">
            0~60초(광원 한 번)를 고르면 양쪽이 같은 순간을 그립니다. 재생하면 같은 시계로 함께 움직이고 60초에서 0초로 돌아가는데,
            이때 주기가 60초를 나누지 않는 발광선(4.4초)·하단 바(3.2초)·일부 기포는 한 번 건너뜁니다(양쪽이 똑같이 건너뜁니다).
          </p>
        </div>
        <fieldset className="gear-preview-group gear-motion-edges">
          <legend>띠 가장자리(Pixi 쪽)</legend>
          <label className="gear-preview-check">
            <input type="checkbox" checked={antialias} onChange={(event) => setAntialias(event.currentTarget.checked)} />
            <span>가장자리 부드럽게(안티앨리어싱)</span>
          </label>
          <label className="gear-preview-check">
            <input type="checkbox" checked={softBand} onChange={(event) => setSoftBand(event.currentTarget.checked)} />
            <span>띠를 알파 마스크로(실험)</span>
          </label>
          <p className="gear-preview-note">
            게임 렌더러는 안티앨리어싱 없이 광원 띠를 스텐실 마스크로 자르므로 띠 경계가 픽셀 단위 계단으로 보입니다. 안티앨리어싱(MSAA)은
            비교 Pixi 앱을 새로 만들어 켜고({pixiState.state === 'ready' && antialias ? (pixiState.samples > 0 ? `MSAA ${pixiState.samples}×` : '이 환경은 MSAA를 지원하지 않음') : '기본 꺼짐'}),
            알파 마스크는 1px 부드러운 띠로 자르는 대신 띠마다 마스크 필터 패스가 하나씩 듭니다.
          </p>
        </fieldset>
      </div>
      {errors.map((message) => <p key={message} className="gear-preview-error-inline" role="alert">{message}</p>)}
      {!resources && <p className="gear-preview-note">움직임 자료를 불러오는 중이거나 불러오지 못했습니다.</p>}
      <div className="gear-motion-panels" data-view={view}>
        <figure className="gear-motion-panel">
          <div className="gear-motion-viewport" ref={pixiViewportRef} style={aspect} data-gear-motion-pixi-host="true" />
          <figcaption>Pixi 레이어(텍스처·마스크로 다시 구성)</figcaption>
        </figure>
        <figure className="gear-motion-panel">
          <div className="gear-motion-viewport" ref={svgHostRef} style={aspect} data-gear-motion-svg-host="true" {...offLayers} />
          <figcaption>승인 SVG(54-ambient-motion-v19.svg)</figcaption>
        </figure>
      </div>
    </section>
  );
}

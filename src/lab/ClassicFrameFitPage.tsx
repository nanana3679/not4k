/*
THESIS: 새 Classic 프레임은 따로 그린 모형이 아니라 실제 게임 렌더러·비행 배경·흐르는 노트 위에서 맞춤 방식을 고르고, 승인된 움직임을 Pixi 레이어로 얹어 SVG와 같은지 확인한다.
OWN-WORLD: 기존 Lab의 건메탈 다크 패널과 청록 상태광, 게임 그대로의 Pixi 플레이필드를 잇는다.
STORY: 사용자는 맞춤 방식을 바꿔 무엇이 잘리고 눌리는지 숫자로 읽고, 레인 폭 슬라이더로 프레임을 통째로 줄여 보며, 렌더 높이와 1:1 픽셀 보기로 선명도를 확인한다.
FIRST VIEWPORT: 16:9 실제 게임 화면이 중심을 차지하고 바로 아래 설명, 오른쪽(좁은 화면은 아래)에 맞춤 선택·레인 폭·움직임 조절을 둔다. 그 아래에 Pixi ↔ 승인 SVG 비교가 이어진다.
FORM: 게임 렌더러를 그대로 띄우는 Operate형 비교 도구이며 정적 합성 이미지를 만들지 않는다.
*/
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import type { GameRenderer } from '../game/renderer';
import type { SkinManager } from '../game/skin';
import { GAME_HEIGHT } from '../game/renderer/constants';
import { createChartTiming, JudgmentGrade } from '../shared';
import {
  clampUniformLaneWidth,
  clampUniformLiftPercent,
  computeFrameFitLayout,
  computeFrameFitZoom,
  createFrameFitStage,
  describeCurrentGear,
  describeFrameFit,
  describeFrameParts,
  describePixelRatio,
  FRAME_FIT_ASSET_PATHS,
  FRAME_FIT_MODE_LABELS,
  FRAME_FIT_MODES,
  FRAME_FIT_STAGE_WIDTH,
  formatLaneWidth,
  formatLiftPercent,
  laneSliderValue,
  laneWidthPercent,
  LIFT_PERCENT_MAX,
  listFrameParts,
  minUniformLiftPercent,
  fullscreenLogicalWidth,
  oneToOneCssSize,
  parseFrameFitGeometry,
  supportsFrameMotion,
  uniformLaneWidthRange,
  UNIFORM_DEFAULT_LANE_WIDTH,
  UNIFORM_DEFAULT_LIFT_PERCENT,
  UNIFORM_MASK_NOTE,
  UNIFORM_ZOOM_NOTE,
  uniformJudgment,
  type FrameFitGeometry,
  type FrameFitLayout,
  type FrameFitMode,
  type FrameFitZoom,
} from './classicFrameFit';
import { buildFrameFitDemo, buildFrameFitSchedule, initialFrameFitLoopState, stepFrameFitLoop } from './classicFrameFitChart';
import type { FrameFitOverlay } from './classicFrameFitOverlay';
import { createSharedSkin, type SharedSkin } from './classicFrameFitSkin';
import type { ClassicFrameMotion } from './classicFrameMotion';
import {
  ALL_FRAME_MOTION_LAYERS_ON,
  FRAME_MOTION_LAYERS,
  loadFrameMotionAssets,
  type FrameMotionAssets,
  type FrameMotionLayerVisibility,
} from './classicFrameMotionData';
import { FrameMotionLayerChecks, RadioGroup } from './ClassicFrameFitControls';
import { ClassicFrameMotionCompare } from './ClassicFrameMotionCompare';
import { createFrameTimeWindow, type FrameTimeSummary } from './frameTimeStats';
import { withLabPublicBase } from './labPublicPath';
import './ClassicFrameFitPage.css';

const RENDER_HEIGHTS = [720, 1080, 1440] as const;
type RenderHeight = (typeof RENDER_HEIGHTS)[number];
const SCENARIOS = ['LIFTOFF', 'INFILTRATION', 'BREAKTHROUGH'] as const;
type Scenario = (typeof SCENARIOS)[number];
const VIEWS = [
  { value: 'fit', label: '화면 맞춤' },
  { value: 'pixel', label: '1:1 픽셀' },
] as const;
type View = (typeof VIEWS)[number]['value'];
// 게임 기본 스크롤 속도와 같다.
const SCROLL_SPEED = 800;
// 레인 폭 슬라이더를 놓은 뒤 렌더러를 다시 만들기까지 기다리는 시간(키보드로 여러 칸 움직일 때 한 번만 만든다).
const LANE_WIDTH_COMMIT_DELAY_MS = 250;

type Assets =
  | { status: 'loading' }
  | { status: 'ready'; geometry: FrameFitGeometry; image: HTMLImageElement }
  | { status: 'error'; message: string };

type RendererState =
  | { status: 'loading'; key: string }
  | { status: 'ready'; key: string; backingWidth: number; backingHeight: number; gearTop: number | null; gearScale: number | null }
  | { status: 'error'; key: string; message: string };

type MotionAssetsState =
  | { status: 'loading' }
  | { status: 'ready'; assets: FrameMotionAssets }
  | { status: 'error'; message: string };

/** 렌더러가 매 프레임 읽는 움직임 설정. 바뀌어도 렌더러를 다시 만들지 않는다. */
interface MotionSettings {
  enabled: boolean;
  layers: FrameMotionLayerVisibility;
  reduced: boolean;
}

/** 움직임 켬·끔 상태별 최근 120프레임의 requestAnimationFrame 간격. */
type FrameWindows = Record<'on' | 'off', ReturnType<typeof createFrameTimeWindow>>;
const FRAME_STATS_INTERVAL_MS = 500;
/** 숨은 탭에서 돌아온 간격처럼 1초가 넘는 간격은 프레임 간격 통계에서 뺀다. */
const FRAME_DELTA_LIMIT_MS = 1000;

/** 살아 있는 렌더러에서 읽어 무대 data 속성으로 알리는 값(화면 논리 단위). */
interface RendererView {
  key: string;
  judgmentLineY: number;
  gameMaskVisible: boolean;
  missed: number;
  /** 이 값을 알린 프레임의 곡 시간(놓친 노트·판정선 변경 때만 갱신). */
  songMs: number;
}

// 기본(16:9) 무대. 레인 폭 범위처럼 논리 폭과 무관한 계산에 쓴다. 전체화면에서는 화면 비율로 논리 폭을 다시 정한다.
const BASE_STAGE = createFrameFitStage(FRAME_FIT_STAGE_WIDTH);
/** 전체화면 크기 변화(창 크기·회전)를 모아 렌더러를 한 번만 다시 만들기까지 기다리는 시간. */
const FULLSCREEN_RESIZE_DELAY_MS = 200;

/** off: 일반 페이지. api: Fullscreen API. css: API가 없거나 거절될 때(iPhone Safari 등) 화면을 덮는 CSS 전체화면. */
type FullscreenMode = 'off' | 'api' | 'css';

export default function ClassicFrameFitPage() {
  const [mode, setMode] = useState<FrameFitMode>('crop');
  const [renderHeight, setRenderHeight] = useState<RenderHeight>(1080);
  const [scenario, setScenario] = useState<Scenario>('INFILTRATION');
  const [view, setView] = useState<View>('fit');
  const [assets, setAssets] = useState<Assets>({ status: 'loading' });
  const [reportedState, setRendererState] = useState<RendererState>({ status: 'loading', key: '' });
  // 가로세로 같이 줄이기의 화면 레인 폭. null이면 기본 250.
  const [laneWidth, setLaneWidth] = useState<number | null>(null);
  // 판정선 높이(게임 Lift %). 레인 폭마다 덱에 가려지지 않는 최소값보다 낮으면 그 최소값으로 올려 쓴다.
  const [liftPercentChoice, setLiftPercentChoice] = useState(UNIFORM_DEFAULT_LIFT_PERCENT);
  const [rendererView, setRendererView] = useState<RendererView | null>(null);
  // 슬라이더를 끄는 동안의 값. 설명 숫자만 따라가고 렌더러는 놓은 뒤(change) 다시 만든다.
  const [laneWidthDraft, setLaneWidthDraft] = useState<number | null>(null);
  const sliderRef = useRef<HTMLInputElement>(null);
  const devicePixelRatio = useDevicePixelRatio();
  const viewportRef = useRef<HTMLDivElement>(null);
  // 렌더러를 다시 만들 때마다 Classic 스킨을 다시 읽지 않도록 페이지가 하나를 빌려 준다. 페이지를 떠나면 놓는다.
  const [sharedSkin] = useState(() => createSharedSkin(loadClassicSkin));
  useEffect(() => () => sharedSkin.close(), [sharedSkin]);
  const [motionAssets, setMotionAssets] = useState<MotionAssetsState>({ status: 'loading' });
  const [motionEnabled, setMotionEnabled] = useState(true);
  const [motionLayers, setMotionLayers] = useState<FrameMotionLayerVisibility>(ALL_FRAME_MOTION_LAYERS_ON);
  const reducedMotion = usePrefersReducedMotion();
  // 움직임 시계는 곡 시간·차트 되감기·렌더러 재생성과 무관한 벽시계다. 처음부터 재생은 시작 시각만 바꾼다.
  const motionClock = useRef({ startMs: 0 });
  useEffect(() => { motionClock.current.startMs = performance.now(); }, []);
  const [frameWindows] = useState<FrameWindows>(() => ({ on: createFrameTimeWindow(120), off: createFrameTimeWindow(120) }));
  // 움직임 레이어를 프레임에 얹은 렌더러의 key. 렌더러는 움직임 자료를 기다리지 않고 먼저 뜨고, 자료가 오면 그때 얹는다.
  const [motionAttachedKey, setMotionAttachedKey] = useState<string | null>(null);
  const stageRef = useRef<HTMLElement>(null);
  const motionTimeRef = useRef<HTMLOutputElement>(null);
  const motionSettings = useMemo<MotionSettings>(
    () => ({ enabled: motionEnabled, layers: motionLayers, reduced: reducedMotion }),
    [motionEnabled, motionLayers, reducedMotion],
  );

  useEffect(() => {
    let cancelled = false;
    loadFrameMotionAssets((path) => withLabPublicBase(path)).then(
      (loaded) => { if (!cancelled) setMotionAssets({ status: 'ready', assets: loaded }); },
      (error: unknown) => {
        if (!cancelled) setMotionAssets({ status: 'error', message: error instanceof Error ? error.message : '움직임 자료를 불러오지 못했습니다.' });
      },
    );
    return () => { cancelled = true; };
  }, []);

  // 매 프레임 렌더러가 부른다. React 상태를 거치지 않고 무대 data 속성과 시계 표시만 바꾼다.
  const handleMotionTime = useCallback((timeMs: number | null) => {
    const stageElement = stageRef.current;
    if (stageElement) {
      if (timeMs === null) delete stageElement.dataset.motionTimeMs;
      else stageElement.dataset.motionTimeMs = String(Math.round(timeMs));
    }
    if (motionTimeRef.current) motionTimeRef.current.textContent = timeMs === null ? '멈춤' : `${(timeMs / 1000).toFixed(1)}초`;
  }, []);
  const restartMotion = () => { motionClock.current.startMs = performance.now(); };

  useEffect(() => {
    let cancelled = false;
    const image = new Image();
    image.src = withLabPublicBase(FRAME_FIT_ASSET_PATHS.image);
    Promise.all([
      fetch(withLabPublicBase(FRAME_FIT_ASSET_PATHS.geometry)).then((response) => {
        if (!response.ok) throw new Error(`frame-fit.json을 불러오지 못했습니다 (${response.status}).`);
        return response.json();
      }).then(parseFrameFitGeometry),
      image.decode().then(() => image),
    ]).then(
      ([geometry, loaded]) => { if (!cancelled) setAssets({ status: 'ready', geometry, image: loaded }); },
      (error: unknown) => {
        if (!cancelled) setAssets({ status: 'error', message: error instanceof Error ? error.message : '프레임 자료를 불러오지 못했습니다.' });
      },
    );
    return () => { cancelled = true; };
  }, []);

  // 전체화면: 무대 영역 크기에서 게임 PlayScreen과 같은 규칙으로 논리 폭을 정해 렌더러를 다시 만든다.
  const [fullscreen, setFullscreen] = useState<FullscreenMode>('off');
  const [fullscreenSize, setFullscreenSize] = useState<{ width: number; height: number } | null>(null);
  const fullscreenActive = fullscreen !== 'off' && fullscreenSize !== null;
  const stageWidth = fullscreenActive ? fullscreenLogicalWidth(fullscreenSize.width, fullscreenSize.height) : FRAME_FIT_STAGE_WIDTH;
  // 화면이 최소 논리 폭(480)보다 세로로 길면(폰 세로) 위아래를 비우고 가로로 돌리라고 알린다.
  const fullscreenNarrow = fullscreenActive && Math.round(GAME_HEIGHT * (fullscreenSize.width / fullscreenSize.height)) < stageWidth;
  const stage = useMemo(() => createFrameFitStage(stageWidth), [stageWidth]);

  const geometry = assets.status === 'ready' ? assets.geometry : null;
  const uniform = mode === 'uniform';
  const laneRange = geometry ? uniformLaneWidthRange(geometry, stage) : null;
  const committedLaneWidth = geometry ? clampUniformLaneWidth(laneWidth ?? UNIFORM_DEFAULT_LANE_WIDTH, geometry, stage) : null;
  const draftLaneWidth = laneWidthDraft ?? committedLaneWidth;
  // 렌더러에 얹는 배치(놓은 레인 폭)와 설명에 쓰는 배치(끄는 중인 레인 폭)를 나눈다. 프레임은 판정선 높이와 무관하다.
  const layout = useMemo(
    () => (geometry ? computeFrameFitLayout(mode, geometry, stage, committedLaneWidth ?? undefined) : null),
    [geometry, mode, stage, committedLaneWidth],
  );
  const readoutLayout = useMemo(
    () => (geometry ? computeFrameFitLayout(mode, geometry, stage, draftLaneWidth ?? undefined) : null),
    [geometry, mode, stage, draftLaneWidth],
  );
  const judgmentFor = (target: FrameFitLayout | null) => {
    if (!uniform || !target) return null;
    const minimum = minUniformLiftPercent(target, stage);
    return { minimum, ...uniformJudgment(target, stage, clampUniformLiftPercent(liftPercentChoice, minimum)) };
  };
  const judgment = judgmentFor(layout);
  const readoutJudgment = judgmentFor(readoutLayout);
  const zoom = useMemo(
    () => computeFrameFitZoom(uniform && committedLaneWidth !== null ? committedLaneWidth : stage.laneAreaWidth, stage, renderHeight, SCROLL_SPEED),
    [uniform, committedLaneWidth, renderHeight, stage],
  );
  const screenResolution = renderHeight / GAME_HEIGHT;
  const showCurrentGear = mode === 'current';
  // 렌더 높이·비행 장면·현재 기어 표시·uniform(게임 마스크 숨김)·줌·논리 폭(전체화면 비율)은 렌더러 생성 옵션이라
  // 바뀌면 렌더러를 새로 만든다. 맞춤 방식·레인 폭·판정선 높이 선택은 그대로 다시 건다.
  const rendererKind = showCurrentGear ? 'gear' : uniform ? 'uniform' : 'overlay';
  const rendererKey = `${renderHeight}:${scenario}:${rendererKind}:${zoom.zoom.toFixed(6)}:${stageWidth}`;
  // 렌더러를 새로 만드는 동안 이전 렌더러의 준비 상태를 보이지 않는다.
  const rendererState: RendererState = reportedState.key === rendererKey ? reportedState : { status: 'loading', key: rendererKey };
  const ready = rendererState.status === 'ready';
  const frameTop = layout ? layout.screenFrameTop : ready ? rendererState.gearTop : null;
  const handleRendererState = useCallback((state: RendererState) => setRendererState(state), []);
  const handleRendererView = useCallback((next: RendererView) => setRendererView(next), []);
  const liveView = rendererView?.key === rendererKey ? rendererView : null;
  const motionSupported = supportsFrameMotion(mode);
  const motionState = reducedMotion ? 'reduced' : motionEnabled && motionSupported && motionAssets.status !== 'error' ? 'on' : 'off';
  const motionReady = ready && motionAttachedKey === rendererKey;
  const loadedMotion = motionAssets.status === 'ready' ? motionAssets.assets : null;

  // 렌더러나 방식이 바뀌면 다른 장면이므로 프레임 간격 통계를 새로 모은다(표시는 다음 통계 갱신 때 바뀐다).
  useEffect(() => {
    frameWindows.on.clear();
    frameWindows.off.clear();
  }, [frameWindows, rendererKey, mode]);

  const backing = ready
    ? { width: rendererState.backingWidth, height: rendererState.backingHeight }
    : { width: Math.round(zoom.width * zoom.resolution), height: Math.round(zoom.height * zoom.resolution) };
  const pixelSize = oneToOneCssSize(backing.width, backing.height, devicePixelRatio);
  // 전체화면은 논리 폭이 화면 비율을 따르므로 캔버스가 화면을 꽉 채운다(최소 폭으로 묶인 세로 화면만 위아래가 빈다).
  const hostStyle: CSSProperties = fullscreen !== 'off'
    ? (fullscreenNarrow || !fullscreenActive ? { width: '100%', aspectRatio: `${stageWidth} / ${GAME_HEIGHT}` } : { width: '100%', height: '100%' })
    : view === 'pixel'
      ? { width: `${pixelSize.width}px`, height: `${pixelSize.height}px` }
      : { width: '100%', aspectRatio: `${FRAME_FIT_STAGE_WIDTH} / ${GAME_HEIGHT}` };

  const enterFullscreen = async () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    if (typeof viewport.requestFullscreen === 'function') {
      try {
        await viewport.requestFullscreen();
        if (document.fullscreenElement === viewport) {
          setFullscreen('api');
          return;
        }
      } catch {
        // iPhone Safari처럼 요소 전체화면이 없거나 거절되면 CSS로 화면을 덮는다.
      }
    }
    setFullscreen('css');
  };
  const exitFullscreen = () => {
    if (fullscreen === 'api' && document.fullscreenElement) void document.exitFullscreen().catch(() => setFullscreen('off'));
    else setFullscreen('off');
  };

  // Esc(Fullscreen API)로 나가면 fullscreenchange로 일반 화면에 돌아오고, CSS 전체화면은 Esc 키로 닫는다.
  useEffect(() => {
    if (fullscreen === 'off') return;
    const onChange = () => {
      if (fullscreen === 'api' && document.fullscreenElement !== viewportRef.current) setFullscreen('off');
    };
    const onKey = (event: KeyboardEvent) => {
      if (fullscreen === 'css' && event.key === 'Escape') setFullscreen('off');
    };
    document.addEventListener('fullscreenchange', onChange);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      window.removeEventListener('keydown', onKey);
    };
  }, [fullscreen]);

  // 전체화면 영역 크기를 재고, 창 크기·회전이 바뀌면 잠시 모았다가 다시 잰다(렌더러는 논리 폭이 바뀔 때만 다시 만든다).
  useEffect(() => {
    const viewport = viewportRef.current;
    if (fullscreen === 'off' || !viewport) return;
    let timer = 0;
    const measure = () => {
      const rect = viewport.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) setFullscreenSize({ width: rect.width, height: rect.height });
    };
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(measure, FULLSCREEN_RESIZE_DELAY_MS);
    };
    const frame = requestAnimationFrame(measure);
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
      setFullscreenSize(null);
    };
  }, [fullscreen]);

  // 1:1 보기로 바꾸면 레인 영역이 보이도록 가로 스크롤을 가운데로 맞춘다.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || view !== 'pixel') return;
    viewport.scrollLeft = (viewport.scrollWidth - viewport.clientWidth) / 2;
    viewport.scrollTop = 0;
  }, [view, pixelSize.width, pixelSize.height]);

  // 슬라이더를 놓으면(change) 잠시 기다렸다가 레인 폭을 확정해 렌더러를 다시 만든다.
  useEffect(() => {
    const slider = sliderRef.current;
    if (!slider || !uniform || !geometry) return;
    let timer = 0;
    let pending = false;
    const commitNow = () => {
      pending = false;
      setLaneWidth(clampUniformLaneWidth(Number(slider.value), geometry, BASE_STAGE));
      setLaneWidthDraft(null);
    };
    const commit = () => {
      window.clearTimeout(timer);
      pending = true;
      timer = window.setTimeout(commitNow, LANE_WIDTH_COMMIT_DELAY_MS);
    };
    slider.addEventListener('change', commit);
    return () => {
      slider.removeEventListener('change', commit);
      window.clearTimeout(timer);
      // 놓은 직후(대기 중) 방식을 바꾸면 놓은 값을 바로 확정하고, 놓지 않고 끌기만 한 값은 버린다.
      if (pending) commitNow();
      else setLaneWidthDraft(null);
    };
  }, [uniform, geometry]);

  const explanation = readoutLayout && geometry
    ? describeFrameFit(readoutLayout, geometry)
    : showCurrentGear && ready && rendererState.gearTop !== null
      ? describeCurrentGear(rendererState.gearTop)
      : null;

  return (
    <main className="frame-fit-lab" data-lab-page="classic-frame-fit">
      <header className="frame-fit-header">
        <p className="frame-fit-kicker">
          <Link className="frame-fit-back" to="/lab">← Lab 목록</Link>
          <span aria-hidden="true">Interface / Classic frame</span>
        </p>
        <h1>Classic Frame Fit</h1>
        <p className="frame-fit-lede">
          승인된 새 Classic 프레임 그림(1024×1536)을 실제 게임 화면(높이 600, 레인 400, 판정선 y 440)에 얹어 봅니다.
          비행 배경과 노트는 실제 게임 렌더러가 그리고, 프레임은 기어 자리에 놓입니다. 레인 폭 맞춤·가로세로 같이 줄이기에서는
          승인된 움직임(큰 광원·게이지 액체·발광선 호흡·하단 바 흐름)을 Pixi 레이어로 얹고, 아래에서 승인 SVG와 나란히 비교합니다.
        </p>
      </header>

      <div className="frame-fit-workbench">
        <section
          ref={stageRef}
          className="frame-fit-stage"
          aria-label="실제 게임 화면 미리보기"
          data-frame-fit-stage="true"
          data-fit-mode={mode}
          data-render-height={renderHeight}
          data-scenario={scenario}
          data-view={view}
          data-renderer-key={rendererKey}
          data-renderer-ready={ready ? 'true' : 'false'}
          data-lane-width={layout ? Number(layout.laneWidth.toFixed(2)) : stage.laneAreaWidth}
          data-zoom={Number(zoom.zoom.toFixed(4))}
          data-lift-percent={judgment ? judgment.liftPercent : 0}
          data-judgment-line-y={liveView ? liveView.judgmentLineY.toFixed(1) : undefined}
          data-game-mask={liveView ? (liveView.gameMaskVisible ? 'visible' : 'hidden') : undefined}
          data-missed-count={liveView ? liveView.missed : undefined}
          data-song-ms={liveView ? Math.round(liveView.songMs) : undefined}
          data-deck-top-y={layout ? layout.screenDeckTop.toFixed(1) : undefined}
          data-frame-top={frameTop === null ? undefined : frameTop.toFixed(1)}
          data-frame-x={layout ? (layout.slices[0].x / layout.zoom).toFixed(3) : undefined}
          data-frame-scale={layout ? layout.screenScale.toFixed(6) : undefined}
          data-lane-window={layout && geometry ? laneWindow(layout, geometry) : undefined}
          data-motion={motionState}
          data-motion-ready={motionReady ? 'true' : 'false'}
          data-motion-armor={motionLayers.armor ? 'on' : 'off'}
          data-motion-gauge={motionLayers.gauge ? 'on' : 'off'}
          data-motion-accent={motionLayers.accent ? 'on' : 'off'}
          data-motion-bar={motionLayers.bar ? 'on' : 'off'}
          data-fullscreen={fullscreen}
          data-stage-width={stageWidth}
        >
          <div className="frame-fit-viewport" ref={viewportRef} data-view={fullscreen === 'off' ? view : 'fit'} data-fullscreen={fullscreen}>
            {assets.status === 'ready' ? (
              <FrameFitRenderer
                key={rendererKey}
                rendererKey={rendererKey}
                scenario={scenario}
                showCurrentGear={showCurrentGear}
                zoom={zoom}
                hideGameMask={uniform}
                lift={judgment ? judgment.rendererLift : 0}
                layout={layout}
                image={assets.image}
                sharedSkin={sharedSkin}
                hostStyle={hostStyle}
                motionAssets={loadedMotion}
                motionSettings={motionSettings}
                motionClock={motionClock}
                frameWindows={frameWindows}
                onState={handleRendererState}
                onView={handleRendererView}
                onMotionTime={handleMotionTime}
                onMotionAttached={setMotionAttachedKey}
              />
            ) : (
              <div className="frame-fit-placeholder" style={hostStyle}>
                {assets.status === 'error' ? assets.message : '프레임 자료를 불러오는 중'}
              </div>
            )}
            {rendererState.status === 'error' && <p className="frame-fit-error" role="alert">{rendererState.message}</p>}
            <div className="frame-fit-fullscreen-bar">
              {fullscreen === 'off' ? (
                <button type="button" className="frame-fit-overlay-button" onClick={() => void enterFullscreen()}>전체화면</button>
              ) : (
                <>
                  <label className="frame-fit-overlay-toggle">
                    <input
                      type="checkbox"
                      aria-label="움직임(전체화면)"
                      checked={motionEnabled}
                      onChange={(event) => setMotionEnabled(event.currentTarget.checked)}
                    />
                    <span>움직임</span>
                  </label>
                  <button type="button" className="frame-fit-overlay-button" aria-label="닫기" onClick={exitFullscreen}>✕</button>
                </>
              )}
            </div>
            {fullscreenNarrow && <p className="frame-fit-fullscreen-hint">가로로 돌리면 게임처럼 넓게 보입니다.</p>}
          </div>

          <div className="frame-fit-readout" aria-live="polite">
            <p className="frame-fit-explain">{explanation ?? '렌더러를 준비하는 중입니다.'}</p>
            {uniform && (
              <>
                <p className="frame-fit-caveat">{UNIFORM_ZOOM_NOTE}</p>
                <p className="frame-fit-caveat">{UNIFORM_MASK_NOTE}</p>
              </>
            )}
            {readoutJudgment?.covered && (
              <p className="frame-fit-error-inline" role="status">
                이 레인 폭에서는 판정선을 {LIFT_PERCENT_MAX}%까지 올려도 프레임 덱(y {readoutJudgment.deckTopY.toFixed(1)})에 가려집니다.
              </p>
            )}
            <dl>
              {uniform && readoutLayout && readoutJudgment && (
                <>
                  <div>
                    <dt>화면 레인 폭</dt>
                    <dd>{formatLaneWidth(readoutLayout.laneWidth)} · 현재의 {laneWidthPercent(readoutLayout.laneWidth, stage)}</dd>
                  </div>
                  <div>
                    <dt>판정선</dt>
                    <dd>{formatLiftPercent(readoutJudgment.liftPercent)} · y {readoutJudgment.lineY}</dd>
                  </div>
                  <div>
                    <dt>판정선 · 덱 틈</dt>
                    <dd>{readoutJudgment.gap.toFixed(1)} · 노트 두께 {readoutJudgment.gapNotes.toFixed(1)}개</dd>
                  </div>
                  <div>
                    <dt>프레임(아래끝 고정)</dt>
                    <dd>덱 위끝 y {readoutLayout.screenDeckTop.toFixed(1)} · 위 {readoutLayout.hiddenRowsAbove}행 잘림 · 아래끝까지 보임</dd>
                  </div>
                  <div>
                    <dt>최소 판정선 높이</dt>
                    <dd>{readoutJudgment.minimum}%</dd>
                  </div>
                </>
              )}
              {readoutLayout && !uniform && (
                <div>
                  <dt>잘리는 행 위 · 아래</dt>
                  <dd>{readoutLayout.hiddenRowsAbove}행 · {readoutLayout.bottomCutRows}행</dd>
                </div>
              )}
              <div>
                <dt>{showCurrentGear ? '기어 텍스처 선명도' : '가로 선명도'}</dt>
                <dd>{pixelRatioText(readoutLayout, rendererState, screenResolution)}</dd>
              </div>
              {readoutLayout?.mode === 'squash' && (
                <div>
                  <dt>기둥 세로</dt>
                  <dd>{describePixelRatio(readoutLayout.screenVerticalScale * screenResolution)}</dd>
                </div>
              )}
              <div>
                <dt>렌더 해상도</dt>
                <dd>
                  {zoom.resolution.toFixed(2)}배
                  {zoom.zoom !== 1 && ` · 렌더러 ${formatLaneWidth(Number(zoom.width.toFixed(1)))}×${formatLaneWidth(Number(zoom.height.toFixed(1)))}`}
                  {' '}· 캔버스 {backing.width}×{backing.height}px
                </dd>
              </div>
              <div>
                <dt>프레임 위끝</dt>
                <dd>{readoutTop(readoutLayout, frameTop)}</dd>
              </div>
              {readoutLayout && geometry && (
                <div>
                  <dt>보이는 부분</dt>
                  <dd>{describeFrameParts(listFrameParts(readoutLayout, geometry))}</dd>
                </div>
              )}
              <div>
                <dt>프레임 텍스처</dt>
                <dd>{showCurrentGear ? '게임 기어 그대로' : '밉맵 · 삼선형 필터'}</dd>
              </div>
              <FrameTimeReadout windows={frameWindows} stageRef={stageRef} />
            </dl>
          </div>
        </section>

        <aside className="frame-fit-controls" aria-label="맞춤 조절">
          <RadioGroup
            legend="맞춤 방식"
            name="frame-fit-mode"
            value={mode}
            options={FRAME_FIT_MODES.map((value) => ({ value, label: FRAME_FIT_MODE_LABELS[value] }))}
            onChange={setMode}
          />
          {uniform && laneRange && draftLaneWidth !== null && (
            <div className="frame-fit-slider">
              <div className="frame-fit-slider-head">
                <label htmlFor="frame-fit-lane-width">레인 폭</label>
                <output htmlFor="frame-fit-lane-width" data-lane-width-draft={Number(draftLaneWidth.toFixed(2))}>
                  {formatLaneWidth(draftLaneWidth)} · 현재의 {laneWidthPercent(draftLaneWidth, stage)}
                </output>
              </div>
              <input
                ref={sliderRef}
                id="frame-fit-lane-width"
                type="range"
                min={Math.floor(laneRange.min)}
                max={laneRange.max}
                step={1}
                value={laneSliderValue(draftLaneWidth, laneRange.min)}
                onChange={(event) => geometry && setLaneWidthDraft(clampUniformLaneWidth(Number(event.currentTarget.value), geometry, stage))}
              />
              <p className="frame-fit-note">
                맨 왼쪽 {formatLaneWidth(laneRange.min)}은 프레임 위끝이 화면 위에 닿는 폭, 400은 지금 레인 폭입니다. 놓으면 렌더러를 다시 만듭니다.
              </p>
            </div>
          )}
          {uniform && readoutJudgment && (
            <div className="frame-fit-slider">
              <div className="frame-fit-slider-head">
                <label htmlFor="frame-fit-lift">판정선 높이</label>
                <output htmlFor="frame-fit-lift">{formatLiftPercent(readoutJudgment.liftPercent)}</output>
              </div>
              <input
                id="frame-fit-lift"
                type="range"
                min={readoutJudgment.minimum}
                max={LIFT_PERCENT_MAX}
                step={1}
                value={readoutJudgment.liftPercent}
                onChange={(event) => setLiftPercentChoice(clampUniformLiftPercent(Number(event.currentTarget.value), readoutJudgment.minimum))}
              />
              <p className="frame-fit-note">
                최소 {readoutJudgment.minimum}%: 판정선(두께 포함)이 프레임 덱에 가려지지 않는 최소값. 게임 Lift 설정과 같은 1% = 6 단위이며, 프레임은 움직이지 않고 판정선만 올라갑니다.
              </p>
            </div>
          )}
          <fieldset className="frame-fit-group frame-fit-motion">
            <legend>움직임</legend>
            <label className="frame-fit-check frame-fit-check-master">
              <input type="checkbox" checked={motionEnabled} onChange={(event) => setMotionEnabled(event.currentTarget.checked)} />
              <span>움직임</span>
            </label>
            <FrameMotionLayerChecks
              value={motionLayers}
              onChange={(layer, visible) => setMotionLayers((current) => ({ ...current, [layer]: visible }))}
            />
            <div className="frame-fit-actions">
              <button type="button" className="frame-fit-button" onClick={restartMotion}>처음부터 재생</button>
              <p className="frame-fit-note">움직임 시계 <output ref={motionTimeRef} data-motion-clock="true">멈춤</output></p>
            </div>
            <p className="frame-fit-note">{motionNote(motionAssets, motionSupported, reducedMotion)}</p>
          </fieldset>
          <RadioGroup
            legend="렌더 높이"
            name="frame-fit-render-height"
            value={renderHeight}
            options={RENDER_HEIGHTS.map((value) => ({ value, label: `${value}` }))}
            onChange={setRenderHeight}
          />
          <RadioGroup
            legend="비행 장면"
            name="frame-fit-scenario"
            value={scenario}
            options={SCENARIOS.map((value) => ({ value, label: value }))}
            onChange={setScenario}
          />
          <RadioGroup legend="보기" name="frame-fit-view" value={view} options={[...VIEWS]} onChange={setView} />
          <p className="frame-fit-note">
            1:1 픽셀은 캔버스 1px을 기기 화면 1px로 보여 줍니다. 무대보다 크면 안에서 스크롤합니다.
          </p>
        </aside>
      </div>

      <ClassicFrameMotionCompare assets={loadedMotion} layers={motionLayers} reducedMotion={reducedMotion} />
    </main>
  );
}

function motionNote(state: MotionAssetsState, supported: boolean, reduced: boolean): string {
  if (state.status === 'error') return `움직임 자료를 불러오지 못했습니다: ${state.message}`;
  if (reduced) return '움직임 줄이기 설정이 켜져 있어 승인 SVG처럼 움직임 레이어를 모두 숨기고 멈췄습니다.';
  if (!supported) return '움직임은 프레임을 한 장으로 그리는 레인 폭 맞춤·가로세로 같이 줄이기에서만 얹습니다.';
  return '승인된 애니메이션 SVG를 텍스처·마스크로 구운 Pixi 레이어입니다. 곡 시간과 무관한 벽시계로 계속 움직입니다. 광원 띠 경계는 게임 렌더러처럼 안티앨리어싱 없이 잘려 픽셀 계단으로 보입니다(아래 비교에서 부드럽게 한 모습과 견줄 수 있습니다).';
}

function describeFrameStats(summary: FrameTimeSummary | null): string {
  if (!summary) return '측정 전';
  return `평균 ${summary.averageMs.toFixed(1)}ms · p95 ${summary.p95Ms.toFixed(1)}ms (${summary.count}프레임)`;
}

function formatFrameStatsAttribute(summary: FrameTimeSummary | null): string | undefined {
  return summary ? `${summary.averageMs.toFixed(2)}/${summary.p95Ms.toFixed(2)}` : undefined;
}

/**
 * 프레임 간격 표시. 0.5초마다 이 작은 부분만 다시 그리고, 무대의 data-frame-time-on/off는 ref로 직접 쓴다
 * (페이지 전체를 0.5초마다 다시 렌더링하지 않는다).
 */
function FrameTimeReadout({ windows, stageRef }: { windows: FrameWindows; stageRef: RefObject<HTMLElement | null> }) {
  const [stats, setStats] = useState<Record<'on' | 'off', FrameTimeSummary | null>>({ on: null, off: null });
  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = { on: windows.on.summary(), off: windows.off.summary() };
      setStats(next);
      const stage = stageRef.current;
      if (!stage) return;
      for (const [name, summary] of [['frameTimeOn', next.on], ['frameTimeOff', next.off]] as const) {
        const value = formatFrameStatsAttribute(summary);
        if (value === undefined) delete stage.dataset[name];
        else stage.dataset[name] = value;
      }
    }, FRAME_STATS_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [windows, stageRef]);
  return (
    <>
      <div>
        <dt>프레임 간격 · 움직임 켬</dt>
        <dd>{describeFrameStats(stats.on)}</dd>
      </div>
      <div>
        <dt>프레임 간격 · 움직임 끔</dt>
        <dd>{describeFrameStats(stats.off)}</dd>
      </div>
    </>
  );
}

function usePrefersReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const list = window.matchMedia(query);
    const update = () => setReduced(list.matches);
    update();
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, []);
  return reduced;
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** 레인 창의 화면 논리 x 범위. */
function laneWindow(layout: FrameFitLayout, geometry: FrameFitGeometry): string {
  const [slice] = layout.slices;
  const left = (slice.x + geometry.laneLeft * slice.scaleX) / layout.zoom;
  const right = (slice.x + (geometry.laneRight + 1) * slice.scaleX) / layout.zoom;
  return `${left.toFixed(2)}-${right.toFixed(2)}`;
}

function readoutTop(layout: FrameFitLayout | null, rendererTop: number | null): string {
  const top = layout ? layout.screenFrameTop : rendererTop;
  return top === null ? '—' : `y ${top.toFixed(1)}`;
}

/** 원본(또는 기어 텍스처) 1px이 실제 화면 몇 px인지: 화면 논리 배율 × 렌더 높이 ÷ 600. */
function pixelRatioText(layout: FrameFitLayout | null, state: RendererState, screenResolution: number): string {
  if (layout) return describePixelRatio(layout.screenScale * screenResolution);
  if (state.status === 'ready' && state.gearScale !== null) return describePixelRatio(state.gearScale * screenResolution);
  return '—';
}

async function loadClassicSkin(): Promise<SkinManager> {
  const { SkinManager } = await import('../game/skin');
  const skin = new SkinManager();
  try {
    await skin.loadSkin('classic');
  } catch (error) {
    skin.dispose();
    throw error;
  }
  return skin;
}

function loadGameFonts(): Promise<unknown> {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve();
  const fonts = Promise.allSettled([
    document.fonts.load("120px 'Alumni Sans Collegiate One'"),
    document.fonts.load("20px 'Zen Dots'"),
  ]);
  return Promise.race([fonts, new Promise((resolve) => setTimeout(resolve, 1500))]);
}

function useDevicePixelRatio(): number {
  const [ratio, setRatio] = useState(() => (typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1));
  useEffect(() => {
    const update = () => setRatio(window.devicePixelRatio || 1);
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return ratio;
}

/**
 * 실제 GameRenderer 하나의 수명. key가 바뀌면(렌더 높이·장면·현재 기어·uniform·줌) 캔버스째 새로 만든다.
 * 비행 배경 DOM은 캔버스 앞 형제로 들어가므로, 캔버스 크기와 같은 위치 지정 래퍼에 캔버스만 둔다.
 * 줌(가로세로 같이 줄이기)은 렌더러 논리 크기·판정선 오프셋·스크롤 속도를 키우고 해상도를 같은 비율로 낮춰
 * 같은 캔버스에 게임 화면 전체를 작게 그린다. uniform은 게임 마스크·버튼을 끄고(hideGameMask) 오버레이가 덱부터 덮는다.
 * 노트는 정해 둔 데모 판정(buildFrameFitSchedule)대로 맞히거나 놓친 것처럼 표시한다.
 * 움직임 자료가 있으면 새 프레임 오버레이에 움직임 레이어를 붙이고, 한 장 배치(crop·uniform)에서 벽시계로 갱신한다.
 */
function FrameFitRenderer({
  rendererKey, scenario, showCurrentGear, zoom, hideGameMask, lift, layout, image, sharedSkin, hostStyle,
  motionAssets, motionSettings, motionClock, frameWindows, onState, onView, onMotionTime, onMotionAttached,
}: {
  rendererKey: string;
  scenario: Scenario;
  showCurrentGear: boolean;
  zoom: FrameFitZoom;
  hideGameMask: boolean;
  /** 판정선 높이(렌더러 논리 단위). 바뀌면 렌더러를 유지한 채 setLift로 옮긴다. */
  lift: number;
  layout: FrameFitLayout | null;
  image: HTMLImageElement;
  /** 페이지가 빌려 주는 Classic 스킨. 렌더러를 다시 만들어도 다시 읽지 않는다. */
  sharedSkin: SharedSkin<SkinManager>;
  hostStyle: CSSProperties;
  /** 움직임 자료. 렌더러는 이것을 기다리지 않고 먼저 뜨며, 자료가 오면(나중이라도) 새 프레임에 움직임을 얹는다. */
  motionAssets: FrameMotionAssets | null;
  motionSettings: MotionSettings;
  /** 움직임 시계의 시작 시각(performance.now 기준). 처음부터 재생이 바꾸므로 프레임마다 읽는다. */
  motionClock: RefObject<{ startMs: number }>;
  frameWindows: FrameWindows;
  onState: (state: RendererState) => void;
  onView: (view: RendererView) => void;
  /** 움직임을 그린 프레임마다 움직임 시계(ms), 그리지 않게 되면 null. */
  onMotionTime: (timeMs: number | null) => void;
  /** 이 렌더러(key)에 움직임 레이어를 얹었을 때. */
  onMotionAttached: (key: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<FrameFitOverlay | null>(null);
  // 판정선 높이·움직임 설정 effect가 쓰는 살아 있는 렌더러와, 판정선 y·게임 마스크를 다시 걸고 읽어 알리는 함수.
  const liveRef = useRef<{
    renderer: GameRenderer;
    applyLift: (lift: number) => void;
    applyMotion: (settings: MotionSettings) => void;
    attachMotion: (source: FrameMotionAssets) => void;
  } | null>(null);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const liftRef = useRef(lift);
  liftRef.current = lift;
  const motionSettingsRef = useRef(motionSettings);
  motionSettingsRef.current = motionSettings;
  const motionAssetsRef = useRef(motionAssets);
  motionAssetsRef.current = motionAssets;
  const options = useRef({
    rendererKey, scenario, showCurrentGear, zoom, hideGameMask, image, sharedSkin, motionClock, frameWindows, onState, onView, onMotionTime, onMotionAttached,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const {
      rendererKey: key, scenario: label, showCurrentGear: withGear, zoom: view, hideGameMask: hideMask, image: frameImage, sharedSkin: skins,
      motionClock: clock, frameWindows: windows, onState, onView: reportView, onMotionTime: reportMotionTime, onMotionAttached: reportMotionAttached,
    } = options.current;
    const report = (state: DistributiveOmit<RendererState, 'key'>) => onState({ ...state, key } as RendererState);
    let disposed = false;
    let starting = true;
    let frame = 0;
    let renderer: GameRenderer | null = null;
    let skinAcquired = false;
    let overlay: FrameFitOverlay | null = null;
    let motion: ClassicFrameMotion | null = null;
    let motionTextures: { destroy: () => void } | null = null;
    // 이 렌더러가 움직임 시계를 알리고 있는지. 정리할 때 무대에 남은 값을 지운다.
    let reportedMotion = false;

    // removeView: 정상 정리(키 변경·언마운트)는 캔버스까지 치우고, 오류일 때는 React가 소유한 캔버스를 남긴다.
    const release = (removeView = true) => {
      cancelAnimationFrame(frame);
      if (reportedMotion) reportMotionTime(null);
      reportedMotion = false;
      // 움직임 컨테이너와 텍스처는 오버레이가 아니라 여기서 만든 쪽이 정리한다.
      motion?.destroy();
      motion = null;
      motionTextures?.destroy();
      motionTextures = null;
      overlay?.destroy();
      overlay = null;
      overlayRef.current = null;
      liveRef.current = null;
      try { renderer?.dispose(removeView); } catch (error) { console.warn('ClassicFrameFit: renderer dispose failed', error); }
      renderer = null;
      if (skinAcquired) skins.release();
      skinAcquired = false;
    };

    const start = async () => {
      report({ status: 'loading' });
      try {
        const [
          { GameRenderer },
          {
            createFrameFitSource, FRAME_FIT_TEXTURE_OPTIONS, FrameFitOverlay, getGearFrameLayer, getGearFrameSprite, isGameLaneMaskVisible,
            readJudgmentLineY, setGameLaneMaskVisible,
          },
          { createClassicFrameMotion, createFrameMotionTextures },
        ] = await Promise.all([
          import('../game/renderer'),
          import('./classicFrameFitOverlay'),
          import('./classicFrameMotion'),
        ]);
        // 콤보·정확도 Pixi 텍스트는 만들 때 글꼴을 재므로 게임 글꼴을 먼저 받아 둔다(실패해도 진행).
        await loadGameFonts();
        if (disposed) return;
        skinAcquired = true;
        const skin = await skins.acquire();
        if (disposed) return;

        renderer = new GameRenderer({
          canvas,
          width: view.width,
          height: view.height,
          resolution: view.resolution,
          judgmentLineOffset: view.judgmentLineOffset,
          skinManager: skin,
          difficultyLabel: label,
          showGearFrame: withGear,
          showFlightBackground: true,
        });
        await renderer.init();
        if (disposed) return;

        const demo = buildFrameFitDemo();
        const schedule = buildFrameFitSchedule(demo.hits);
        const timing = createChartTiming(demo.chart);
        // setChart는 노트 표시 상태(처리·놓침)를 비우므로 되감을 때마다 다시 건다.
        const loadChart = (target: GameRenderer) => target.setChart(
          demo.chart.notes, demo.chart.trillZones, demo.chart.restZones ?? [], demo.chart.events, timing, demo.durationMs,
        );
        loadChart(renderer);
        renderer.scrollSpeed = view.scrollSpeed;
        renderer.updateAccuracy(100);

        const active = renderer;
        let loopState = initialFrameFitLoopState();
        const publishView = () => reportView({
          key,
          judgmentLineY: readJudgmentLineY(active) / view.zoom,
          gameMaskVisible: isGameLaneMaskVisible(active),
          missed: loopState.missed,
          songMs: Math.max(0, loopState.previousMs),
        });
        // 렌더러를 새로 만들 때와 판정선 높이를 바꿀 때마다 setLift 뒤 게임 마스크·버튼 숨김을 다시 건다.
        const applyLift = (nextLift: number) => {
          active.setLift(nextLift);
          setGameLaneMaskVisible(active, !hideMask);
          publishView();
        };
        applyLift(liftRef.current);

        if (!withGear) {
          overlay = new FrameFitOverlay(getGearFrameLayer(renderer), createFrameFitSource(frameImage));
          overlay.apply(layoutRef.current);
          overlayRef.current = overlay;
        }
        const applyMotion = (settings: MotionSettings) => {
          if (!motion || !overlay) return;
          for (const layer of FRAME_MOTION_LAYERS) motion.setLayerVisible(layer, settings.layers[layer]);
          motion.setReducedMotion(settings.reduced);
          overlay.setMotionEnabled(settings.enabled);
        };
        // 움직임 자료는 렌더러와 따로 읽으므로, 이미 와 있으면 지금, 아니면 도착했을 때 effect가 부른다. 한 번만 얹는다.
        // 움직임을 얹지 못해도 게임 화면 미리보기는 그대로 돌게 오류는 기록만 한다.
        const attachMotion = (source: FrameMotionAssets) => {
          if (motion || !overlay || disposed) return;
          // 움직임 텍스처도 새 프레임과 같은 밉맵·삼선형 설정으로 만들어 줄여 그려도 바탕과 같은 선명도로 보이게 한다.
          const created = createFrameMotionTextures(source.images, FRAME_FIT_TEXTURE_OPTIONS);
          try {
            motion = createClassicFrameMotion(source.data, created.textures);
          } catch (error) {
            created.destroy();
            console.error('ClassicFrameFit: motion attach failed', error);
            return;
          }
          motionTextures = created;
          overlay.attachMotion(motion.container);
          applyMotion(motionSettingsRef.current);
          reportMotionAttached(key);
        };
        liveRef.current = { renderer: active, applyLift, applyMotion, attachMotion };
        if (motionAssetsRef.current) attachMotion(motionAssetsRef.current);
        const gear = withGear ? getGearFrameSprite(renderer) : null;

        let startNow = performance.now();
        let previousNow = startNow;
        const beams = [false, false, false, false];
        const tick = (now: number) => {
          const frameDelta = now - previousNow;
          const deltaMs = Math.min(48, Math.max(0, frameDelta));
          previousNow = now;
          // 움직임은 곡 시간과 무관한 벽시계(처음부터 재생 이후 경과)로 그려 차트를 되감아도 광원이 계속 흐른다.
          const settings = motionSettingsRef.current;
          const motionActive = motion !== null && overlay !== null && overlay.motionPlaced && settings.enabled && !settings.reduced;
          if (frameDelta <= FRAME_DELTA_LIMIT_MS) windows[motionActive ? 'on' : 'off'].push(frameDelta);
          if (motionActive && motion) {
            const motionMs = now - clock.current.startMs;
            motion.update(motionMs);
            reportMotionTime(motionMs);
            reportedMotion = true;
          } else if (reportedMotion) {
            reportMotionTime(null);
            reportedMotion = false;
          }
          let songMs = Math.max(0, now - startNow);
          if (songMs >= demo.durationMs) {
            startNow = now;
            songMs = 0;
          }
          const step = stepFrameFitLoop(schedule, loopState, songMs);
          if (step.wrapped) {
            // 차트 끝에서 처음으로 되감는다. setChart가 노트 처리·놓침 표시와 비행 배경 고도를 처음으로 돌리고,
            // resetTransientState가 키빔을 끄므로 키빔 캐시도 함께 비운다.
            active.resetTransientState();
            loadChart(active);
            beams.fill(false);
          }
          const missedBefore = loopState.missed;
          const comboBefore = loopState.combo;
          for (const event of step.events) {
            // 숨은 탭에서 돌아와 시간이 건너뛰었으면 오래된 이벤트의 키봄·판정 글자는 생략하고 노트 표시만 맞춘다.
            if (event.type === 'hit') {
              if (event.stale) continue;
              active.showBombEffect(event.lane);
              active.showJudgment(JudgmentGrade.PERFECT, 0);
            } else if (event.type === 'processed') {
              active.applyNoteDisplayEffect(event.index, { body: null, visibility: 'processed' });
            } else {
              active.applyNoteDisplayEffect(event.index, { body: 'failed', visibility: 'missed' });
              if (!event.stale) active.showJudgment(JudgmentGrade.MISS);
            }
          }
          loopState = step.state;
          if (loopState.combo !== comboBefore || step.wrapped) active.updateCombo(loopState.combo);
          if (loopState.missed !== missedBefore) publishView();
          step.beamLanes.forEach((on, index) => {
            if (beams[index] === on) return;
            beams[index] = on;
            active.setKeyBeam(index + 1, on);
          });
          active.renderFrame(songMs, deltaMs);
        };
        const loop = (now: number) => {
          if (disposed) return;
          try {
            tick(now);
          } catch (error) {
            // 무대가 준비됨으로 남은 채 조용히 멈추지 않도록 오류 상태로 바꾸고 루프를 멈춘다.
            console.error('ClassicFrameFit: render loop failed', error);
            release(false);
            report({ status: 'error', message: error instanceof Error ? error.message : '재생 중 오류가 났습니다.' });
            return;
          }
          frame = requestAnimationFrame(loop);
        };
        active.renderFrame(0, 0);
        report({
          status: 'ready',
          backingWidth: canvas.width,
          backingHeight: canvas.height,
          gearTop: gear ? gear.y : null,
          gearScale: gear ? gear.scale.x : null,
        });
        frame = requestAnimationFrame(loop);
      } catch (error) {
        release(false);
        if (!disposed) report({ status: 'error', message: error instanceof Error ? error.message : '렌더러를 시작하지 못했습니다.' });
      } finally {
        starting = false;
        if (disposed) release();
      }
    };

    void start();
    return () => {
      disposed = true;
      // init 도중에는 스킨 텍스처를 읽고 있으므로 끝난 뒤 finally에서 정리한다.
      if (!starting) release();
    };
  }, []);

  useEffect(() => {
    overlayRef.current?.apply(layout);
  }, [layout]);

  // 판정선 높이: 판정선·버튼·콤보/정확도·판정 글자·노트 판정 위치는 setLift가 옮긴다. 프레임은 움직이지 않는다.
  useEffect(() => {
    liveRef.current?.applyLift(lift);
  }, [lift]);

  // 움직임 켜기·요소·움직임 줄이기는 렌더러를 다시 만들지 않고 살아 있는 움직임 레이어에 건다.
  useEffect(() => {
    liveRef.current?.applyMotion(motionSettings);
  }, [motionSettings]);

  // 렌더러가 먼저 뜬 뒤 움직임 자료가 도착하면 그때 얹는다(이미 얹었으면 아무것도 하지 않는다).
  useEffect(() => {
    if (motionAssets) liveRef.current?.attachMotion(motionAssets);
  }, [motionAssets]);

  return (
    <div className="frame-fit-canvas-host" style={hostStyle}>
      <canvas ref={canvasRef} className="frame-fit-canvas" data-frame-fit-canvas="true" />
    </div>
  );
}

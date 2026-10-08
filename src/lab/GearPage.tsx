/*
THESIS: 새 기어와 `gearMotion`(기어 위 장식 애니메이션)은 이제 게임에 들어가 있다. 실제 게임 렌더러를 그대로 띄워 승인한 배치(레인 250·판정선 y 416·키 윗면부터 가림막)와 내장 `gearMotion`이 게임에서 그대로인지 보고, 같은 `gearMotion` 모듈을 승인 SVG와 나란히 비교한다.
OWN-WORLD: 기존 Lab의 건메탈 다크 패널과 청록 상태광, 게임 그대로의 Pixi 플레이필드를 잇는다.
STORY: 사용자는 리프트를 올려 판정선만 움직이고 기어·가림막은 그대로인지 보고, 고도를 직접 정해 양옆 유리관 게이지가 채움 경계까지 비는지 보며, 렌더 높이와 1:1 픽셀 보기로 선명도를, 전체화면으로 화면 비율별 배치와 키보드 표시를 확인한다.
FIRST VIEWPORT: 16:9 실제 게임 화면이 중심을 차지하고 바로 아래 설명, 오른쪽(좁은 화면은 아래)에 리프트·고도·키보드·`gearMotion` 조절을 둔다. 그 아래에 Pixi ↔ 승인 SVG 비교가 이어진다.
FORM: 게임 렌더러를 그대로 띄우는 Operate형 미리보기이며 정적 합성 이미지를 만들지 않는다.
*/
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import type { GameRenderer } from '../game/renderer';
import type { SkinManager } from '../game/skin';
import { GEAR_GEOMETRY, GEAR_CLEARANCE, layoutGear } from '../game/renderer/gearLayout';
import { GAME_HEIGHT, LANE_AREA_WIDTH, liftPx } from '../game/renderer/constants';
import { KEYBOARD_DISPLAY_MIN_SCALE, keyboardDisplaySize, placeKeyboardDisplay } from '../game/renderer/KeyboardDisplay';
import { createChartTiming, JudgmentGrade } from '../shared';
import {
  altitudeOverrideFor,
  altitudePercentOf,
  clampAltitudePercent,
  clampLiftPercent,
  describeGaugeLevel,
  describeGear,
  describeGearJudgment,
  describePixelRatio,
  GEAR_PREVIEW_KEYBOARDS,
  GEAR_PREVIEW_STAGE_WIDTH,
  formatGaugeLevel,
  formatLiftPercent,
  manualAltitudeOnUnfollow,
  fullscreenLogicalWidth,
  LIFT_PERCENT_MAX,
  oneToOneCssSize,
  type GearPreviewKeyboard,
} from './gearPreview';
import { buildGearPreviewDemo, buildGearPreviewSchedule, initialGearPreviewLoopState, stepGearPreviewLoop } from './gearPreviewChart';
import { createSharedSkin, type SharedSkin } from './gearPreviewSkin';
import type { GearMotionResources } from '../game/renderer/gearMotionAssets';
import {
  ALL_GEAR_MOTION_LAYERS_ON,
  GEAR_MOTION_LAYERS,
  type GearMotionLayerVisibility,
} from '../game/renderer/gearMotionData';
import { GearMotionLayerChecks, RadioGroup } from './GearControls';
import { GearMotionCompare } from './GearMotionCompare';
import { createFrameTimeWindow, type FrameTimeSummary } from './frameTimeStats';
import './GearPage.css';

const RENDER_HEIGHTS = [720, 1080, 1440] as const;
type RenderHeight = (typeof RENDER_HEIGHTS)[number];
const SCENARIOS = ['LIFTOFF', 'INFILTRATION', 'BREAKTHROUGH'] as const;
type Scenario = (typeof SCENARIOS)[number];
const VIEWS = [
  { value: 'fit', label: '화면 맞춤' },
  { value: 'pixel', label: '1:1 픽셀' },
] as const;
type View = (typeof VIEWS)[number]['value'];
const KEYBOARD_OPTIONS = (Object.keys(GEAR_PREVIEW_KEYBOARDS) as GearPreviewKeyboard[]).map((value) => ({ value, label: GEAR_PREVIEW_KEYBOARDS[value].label }));
// 게임 기본 스크롤 속도와 같다.
const SCROLL_SPEED = 800;

type RendererState =
  | { status: 'loading'; key: string }
  | { status: 'ready'; key: string; backingWidth: number; backingHeight: number }
  | { status: 'error'; key: string; message: string };

type MotionAssetsState =
  | { status: 'loading' }
  | { status: 'ready'; resources: GearMotionResources }
  | { status: 'error'; message: string };

/** 살아 있는 렌더러의 내장 `gearMotion`(GameRenderer.gearMotion)에 적용하는 설정. 바뀌어도 렌더러를 다시 만들지 않는다. */
interface MotionSettings {
  enabled: boolean;
  layers: GearMotionLayerVisibility;
}

/** `gearMotion` 켬·끔 상태별 최근 120프레임의 requestAnimationFrame 간격. */
type FrameWindows = Record<'on' | 'off', ReturnType<typeof createFrameTimeWindow>>;
const FRAME_STATS_INTERVAL_MS = 500;
/** 숨은 탭에서 돌아온 간격처럼 1초가 넘는 간격은 프레임 간격 통계에서 뺀다. */
const FRAME_DELTA_LIMIT_MS = 1000;

/** 살아 있는 렌더러에서 읽어 무대 data 속성으로 알리는 값(논리 단위). */
interface RendererView {
  key: string;
  judgmentLineY: number;
  /** 렌더러에 들어간 기어 배치. 기어를 못 그렸으면 null. */
  gear: { x: number; y: number; scale: number; deckTopY: number; keyRimY: number; laneLeft: number; laneRight: number } | null;
  missed: number;
  /** 이 값을 알린 프레임의 곡 시간(놓친 노트·판정선 변경 때만 갱신). */
  songMs: number;
}

/** 전체화면 크기 변화(창 크기·회전)를 모아 렌더러를 한 번만 다시 만들기까지 기다리는 시간. */
const FULLSCREEN_RESIZE_DELAY_MS = 200;

/** off: 일반 페이지. api: Fullscreen API. css: API가 없거나 거절될 때(iPhone Safari 등) 화면을 덮는 CSS 전체화면. */
type FullscreenMode = 'off' | 'api' | 'css';

export default function GearPage() {
  const [renderHeight, setRenderHeight] = useState<RenderHeight>(1080);
  const [scenario, setScenario] = useState<Scenario>('INFILTRATION');
  const [view, setView] = useState<View>('fit');
  const [liftPercent, setLiftPercent] = useState(0);
  // 고도: 곡 진행 따라가기(렌더러 고도 모델)가 기본이고, 슬라이더를 움직이면 그 고도로 고정한다(비행 배경과 기어 게이지가 함께 따른다).
  // 고정 고도는 0~1 값으로 두고 슬라이더는 그 정수 %를 가리킨다. 따라가기를 끄는 순간에는 그때 보이던 게이지 채움으로 고정한다.
  const [altitudeFollow, setAltitudeFollow] = useState(true);
  const [manualAltitude, setManualAltitude] = useState(1);
  const altitudePercent = altitudePercentOf(manualAltitude);
  const altitudeOverride = altitudeOverrideFor(altitudeFollow, manualAltitude);
  const [keyboard, setKeyboard] = useState<GearPreviewKeyboard>('tkl');
  const [reportedState, setRendererState] = useState<RendererState>({ status: 'loading', key: '' });
  const [rendererView, setRendererView] = useState<RendererView | null>(null);
  const devicePixelRatio = useDevicePixelRatio();
  const viewportRef = useRef<HTMLDivElement>(null);
  // 렌더러를 다시 만들 때마다 Classic 스킨을 다시 읽지 않도록 페이지가 하나를 빌려 준다. 페이지를 떠나면 놓는다.
  const [sharedSkin] = useState(() => createSharedSkin(loadClassicSkin));
  useEffect(() => () => sharedSkin.close(), [sharedSkin]);
  const [motionAssets, setMotionAssets] = useState<MotionAssetsState>({ status: 'loading' });
  const [motionEnabled, setMotionEnabled] = useState(true);
  const [motionLayers, setMotionLayers] = useState<GearMotionLayerVisibility>(ALL_GEAR_MOTION_LAYERS_ON);
  const [frameWindows] = useState<FrameWindows>(() => ({ on: createFrameTimeWindow(120), off: createFrameTimeWindow(120) }));
  // 내장 `gearMotion`을 기어에 추가한 렌더러의 key. `gearMotion` 에셋은 렌더러 init이 기다리는 필수 에셋이라 렌더러가 준비되면 이미 추가돼 있다.
  const [motionAttachedKey, setMotionAttachedKey] = useState<string | null>(null);
  // 처음부터 재생: 살아 있는 렌더러의 gearMotion.restart()를 부른다.
  const restartRef = useRef<(() => void) | null>(null);
  const stageRef = useRef<HTMLElement>(null);
  const motionTimeRef = useRef<HTMLOutputElement>(null);
  const gaugeReadoutRef = useRef<HTMLElement>(null);
  // 마지막으로 알린 게이지 채움(천분율 정수, 게이지 없음은 null). 바뀔 때만 무대 속성과 설명을 고친다.
  const reportedGaugeRef = useRef<number | null | undefined>(undefined);
  // 지금 보이는 게이지 채움 그대로(따라가기를 끄는 순간의 고정값). 매 프레임 숫자만 적는다.
  const gaugeLevelRef = useRef<number | null>(null);
  const motionSettings = useMemo<MotionSettings>(
    () => ({ enabled: motionEnabled, layers: motionLayers }),
    [motionEnabled, motionLayers],
  );

  // `gearMotion` 에셋은 게임과 같은 공유 로더에서 페이지가 lease 하나를 acquire해 둔다. 렌더러를 다시 만들어도(렌더 높이·장면·전체화면) 다시 읽지 않고,
  // 아래 비교 화면도 같은 텍스처를 쓴다. 게임 렌더러는 자기 임대를 따로 잡으므로 이 임대와 무관하게 정리된다.
  useEffect(() => {
    let cancelled = false;
    let release: (() => void) | null = null;
    const fail = (error: unknown) => {
      if (!cancelled) setMotionAssets({ status: 'error', message: error instanceof Error ? error.message : '움직임 자료를 불러오지 못했습니다.' });
    };
    import('../game/renderer/gearMotionAssets').then(({ acquireGearMotionAssets }) => {
      if (cancelled) return;
      const lease = acquireGearMotionAssets();
      release = () => lease.release();
      lease.ready.then((resources) => { if (!cancelled) setMotionAssets({ status: 'ready', resources }); }, fail);
    }, fail);
    return () => {
      cancelled = true;
      release?.();
    };
  }, []);

  // 매 프레임 렌더러가 부른다. React 상태를 거치지 않고 무대 data 속성과 `움직임 시계` 표시만 바꾼다.
  const handleMotionTime = useCallback((timeMs: number | null) => {
    const stageElement = stageRef.current;
    if (stageElement) {
      if (timeMs === null) delete stageElement.dataset.motionTimeMs;
      else stageElement.dataset.motionTimeMs = String(Math.round(timeMs));
    }
    if (motionTimeRef.current) motionTimeRef.current.textContent = timeMs === null ? '멈춤' : `${(timeMs / 1000).toFixed(1)}초`;
  }, []);
  const restartMotion = () => restartRef.current?.();

  // 매 프레임 렌더러가 지금 보이는 게이지 채움을 알린다. 천분율이 바뀔 때만 무대 data-gear-gauge-level과 설명을 고친다(React 상태를 거치지 않는다).
  const handleGaugeLevel = useCallback((level: number | null) => {
    gaugeLevelRef.current = level;
    const key = level === null ? null : Math.round(level * 1000);
    if (key === reportedGaugeRef.current) return;
    reportedGaugeRef.current = key;
    const stageElement = stageRef.current;
    const value = formatGaugeLevel(level);
    if (stageElement) {
      if (value === undefined) delete stageElement.dataset.gearGaugeLevel;
      else stageElement.dataset.gearGaugeLevel = value;
    }
    if (gaugeReadoutRef.current) gaugeReadoutRef.current.textContent = describeGaugeLevel(level);
  }, []);

  // 전체화면: 무대 영역 크기에서 게임 PlayScreen과 같은 규칙으로 논리 폭을 정해 렌더러를 다시 만든다.
  const [fullscreen, setFullscreen] = useState<FullscreenMode>('off');
  const [fullscreenSize, setFullscreenSize] = useState<{ width: number; height: number } | null>(null);
  const fullscreenActive = fullscreen !== 'off' && fullscreenSize !== null;
  const stageWidth = fullscreenActive ? fullscreenLogicalWidth(fullscreenSize.width, fullscreenSize.height) : GEAR_PREVIEW_STAGE_WIDTH;
  // 화면이 최소 논리 폭(466)보다 세로로 길면(폰 세로) 위아래를 비우고 가로로 돌리라고 알린다.
  const fullscreenNarrow = fullscreenActive && Math.round(GAME_HEIGHT * (fullscreenSize.width / fullscreenSize.height)) < stageWidth;

  // 게임 렌더러와 같은 함수로 계산한 배치. 설명 숫자에 쓰고, 무대 data 속성은 살아 있는 렌더러가 알린 값을 쓴다.
  const layout = useMemo(() => layoutGear(GEAR_GEOMETRY, {
    laneAreaX: (stageWidth - LANE_AREA_WIDTH) / 2, laneAreaWidth: LANE_AREA_WIDTH, height: GAME_HEIGHT,
  }), [stageWidth]);
  const judgment = describeGearJudgment(layout, liftPercent);
  const keyboardBindings = GEAR_PREVIEW_KEYBOARDS[keyboard].bindings;
  const keyboardPlacement = placeKeyboardDisplay(
    keyboardDisplaySize(keyboard === 'numpad'),
    { width: stageWidth, height: GAME_HEIGHT, freeLeft: layout.silhouetteRightX + GEAR_CLEARANCE },
  );
  const screenResolution = renderHeight / GAME_HEIGHT;
  // 렌더 높이·비행 장면·논리 폭(전체화면 비율)은 렌더러 생성 옵션이라 바뀌면 렌더러를 새로 만든다.
  // 리프트·키보드·`gearMotion` 설정은 살아 있는 렌더러에 그대로 다시 적용한다.
  const rendererKey = `${renderHeight}:${scenario}:${stageWidth}`;
  // 렌더러를 새로 만드는 동안 이전 렌더러의 준비 상태를 보이지 않는다.
  const rendererState: RendererState = reportedState.key === rendererKey ? reportedState : { status: 'loading', key: rendererKey };
  const ready = rendererState.status === 'ready';
  const handleRendererState = useCallback((state: RendererState) => setRendererState(state), []);
  const handleRendererView = useCallback((next: RendererView) => setRendererView(next), []);
  const liveView = rendererView?.key === rendererKey ? rendererView : null;
  const liveGear = liveView?.gear ?? null;
  const motionState = motionEnabled && motionAssets.status !== 'error' ? 'on' : 'off';
  const motionReady = ready && motionAttachedKey === rendererKey;
  const loadedMotion = motionAssets.status === 'ready' ? motionAssets.resources : null;

  // 렌더러가 바뀌면 다른 장면이므로 프레임 간격 통계를 새로 모은다(표시는 다음 통계 갱신 때 바뀐다).
  useEffect(() => {
    frameWindows.on.clear();
    frameWindows.off.clear();
  }, [frameWindows, rendererKey]);

  const backing = ready
    ? { width: rendererState.backingWidth, height: rendererState.backingHeight }
    : { width: Math.round(stageWidth * screenResolution), height: renderHeight };
  const pixelSize = oneToOneCssSize(backing.width, backing.height, devicePixelRatio);
  // 전체화면은 논리 폭이 화면 비율을 따르므로 캔버스가 화면을 꽉 채운다(최소 폭으로 묶인 세로 화면만 위아래가 빈다).
  const hostStyle: CSSProperties = fullscreen !== 'off'
    ? (fullscreenNarrow || !fullscreenActive ? { width: '100%', aspectRatio: `${stageWidth} / ${GAME_HEIGHT}` } : { width: '100%', height: '100%' })
    : view === 'pixel'
      ? { width: `${pixelSize.width}px`, height: `${pixelSize.height}px` }
      : { width: '100%', aspectRatio: `${GEAR_PREVIEW_STAGE_WIDTH} / ${GAME_HEIGHT}` };

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

  return (
    <main className="gear-preview-lab" data-lab-page="gear">
      <header className="gear-preview-header">
        <p className="gear-preview-kicker">
          <Link className="gear-preview-back" to="/lab">← Lab 목록</Link>
          <span aria-hidden="true">Interface / Gear</span>
        </p>
        <h1>Gear</h1>
        <p className="gear-preview-lede">
          새 기어가 들어간 실제 게임 화면입니다. 레인 영역 250, 판정선 y 416(리프트 0%), 키 윗면부터 덮는 레인 가림막,
          오른쪽 아래 키보드 표시, 양옆 유리관 고도 게이지, 기어 움직임(큰 광원·게이지 액체·발광선 호흡·하단 바 흐름)까지 게임 렌더러가 그대로 그립니다(RFD 0029).
          조절 패널은 렌더러의 내장 움직임을 켜고 끄며, 아래에서 같은 움직임 모듈을 승인 SVG와 나란히 비교합니다.
        </p>
      </header>

      <div className="gear-preview-workbench">
        <section
          ref={stageRef}
          className="gear-preview-stage"
          aria-label="실제 게임 화면 미리보기"
          data-gear-preview-stage="true"
          data-render-height={renderHeight}
          data-scenario={scenario}
          data-view={view}
          data-renderer-key={rendererKey}
          data-renderer-ready={ready ? 'true' : 'false'}
          data-lift-percent={liftPercent}
          data-altitude-mode={altitudeFollow ? 'follow' : 'manual'}
          data-altitude-percent={altitudePercent}
          data-keyboard={keyboard}
          data-keyboard-visible={keyboardPlacement.visible ? 'true' : 'false'}
          data-keyboard-scale={keyboardPlacement.scale.toFixed(3)}
          data-judgment-line-y={liveView ? liveView.judgmentLineY.toFixed(1) : undefined}
          data-missed-count={liveView ? liveView.missed : undefined}
          data-song-ms={liveView ? Math.round(liveView.songMs) : undefined}
          data-deck-top-y={liveGear ? liveGear.deckTopY.toFixed(1) : undefined}
          data-key-rim-y={liveGear ? liveGear.keyRimY.toFixed(1) : undefined}
          data-gear-top={liveGear ? liveGear.y.toFixed(1) : undefined}
          data-gear-x={liveGear ? liveGear.x.toFixed(3) : undefined}
          data-gear-scale={liveGear ? liveGear.scale.toFixed(6) : undefined}
          data-lane-window={liveGear ? `${liveGear.laneLeft.toFixed(2)}-${liveGear.laneRight.toFixed(2)}` : undefined}
          data-motion={motionState}
          data-motion-ready={motionReady ? 'true' : 'false'}
          data-motion-armor={motionLayers.armor ? 'on' : 'off'}
          data-motion-gauge={motionLayers.gauge ? 'on' : 'off'}
          data-motion-accent={motionLayers.accent ? 'on' : 'off'}
          data-motion-bar={motionLayers.bar ? 'on' : 'off'}
          data-fullscreen={fullscreen}
          data-stage-width={stageWidth}
        >
          <div className="gear-preview-viewport" ref={viewportRef} data-view={fullscreen === 'off' ? view : 'fit'} data-fullscreen={fullscreen}>
            <GearPreviewRenderer
              key={rendererKey}
              rendererKey={rendererKey}
              scenario={scenario}
              width={stageWidth}
              resolution={screenResolution}
              lift={liftPx(liftPercent)}
              altitudeOverride={altitudeOverride}
              keyboardBindings={keyboardBindings}
              sharedSkin={sharedSkin}
              hostStyle={hostStyle}
              motionSettings={motionSettings}
              restartRef={restartRef}
              frameWindows={frameWindows}
              onState={handleRendererState}
              onView={handleRendererView}
              onMotionTime={handleMotionTime}
              onMotionAttached={setMotionAttachedKey}
              onGaugeLevel={handleGaugeLevel}
            />
            {rendererState.status === 'error' && <p className="gear-preview-error" role="alert">{rendererState.message}</p>}
            <div className="gear-preview-fullscreen-bar">
              {fullscreen === 'off' ? (
                <button type="button" className="gear-preview-overlay-button" onClick={() => void enterFullscreen()}>전체화면</button>
              ) : (
                <>
                  <label className="gear-preview-overlay-toggle">
                    <input
                      type="checkbox"
                      aria-label="움직임(전체화면)"
                      checked={motionEnabled}
                      onChange={(event) => setMotionEnabled(event.currentTarget.checked)}
                    />
                    <span>움직임</span>
                  </label>
                  <button type="button" className="gear-preview-overlay-button" aria-label="닫기" onClick={exitFullscreen}>✕</button>
                </>
              )}
            </div>
            {fullscreenNarrow && <p className="gear-preview-fullscreen-hint">가로로 돌리면 게임처럼 넓게 보입니다.</p>}
          </div>

          <div className="gear-preview-readout" aria-live="polite">
            <p className="gear-preview-explain">{describeGear(layout)}</p>
            <dl>
              <div>
                <dt>판정선</dt>
                <dd>{formatLiftPercent(judgment.liftPercent)} · y {judgment.lineY}</dd>
              </div>
              <div>
                <dt>판정선 · 덱 틈</dt>
                <dd>{judgment.gap.toFixed(1)} · 노트 두께 {judgment.gapNotes.toFixed(1)}개</dd>
              </div>
              <div>
                <dt>판정선 · 키 윗면(가림막)</dt>
                <dd>y {judgment.keyRimY.toFixed(1)}까지 {judgment.openGap.toFixed(1)} · 노트 두께 {judgment.openGapNotes.toFixed(1)}개</dd>
              </div>
              <div>
                <dt>유리관 게이지</dt>
                <dd ref={gaugeReadoutRef}>{describeGaugeLevel(null)}</dd>
              </div>
              <div>
                <dt>키보드 표시</dt>
                <dd>{describeKeyboard(keyboardPlacement)}</dd>
              </div>
              <div>
                <dt>기어 선명도</dt>
                <dd>{describePixelRatio(layout.scale * screenResolution)}</dd>
              </div>
              <div>
                <dt>렌더 해상도</dt>
                <dd>{screenResolution.toFixed(2)}배 · 논리 {stageWidth}×{GAME_HEIGHT} · 캔버스 {backing.width}×{backing.height}px</dd>
              </div>
              <div>
                <dt>기어 텍스처</dt>
                <dd>밉맵 · 삼선형</dd>
              </div>
              <FrameTimeReadout windows={frameWindows} stageRef={stageRef} />
            </dl>
          </div>
        </section>

        <aside className="gear-preview-controls" aria-label="미리보기 조절">
          <div className="gear-preview-slider">
            <div className="gear-preview-slider-head">
              <label htmlFor="gear-preview-lift">리프트(판정선 높이)</label>
              <output htmlFor="gear-preview-lift">{formatLiftPercent(liftPercent)}</output>
            </div>
            <input
              id="gear-preview-lift"
              type="range"
              min={0}
              max={LIFT_PERCENT_MAX}
              step={1}
              value={liftPercent}
              onChange={(event) => setLiftPercent(clampLiftPercent(Number(event.currentTarget.value)))}
            />
            <p className="gear-preview-note">
              게임 설정의 리프트와 같은 값(1% = 6 단위)입니다. 판정선과 딸린 표시만 올라가고 기어와 레인 가림막은 움직이지 않습니다.
              게임 설정은 0~100%를 허용하지만 여기서는 0~{LIFT_PERCENT_MAX}%만 봅니다.
            </p>
          </div>
          <fieldset className="gear-preview-group gear-preview-altitude">
            <legend>고도(유리관 게이지·비행 배경)</legend>
            <label className="gear-preview-check">
              <input
                type="checkbox"
                checked={altitudeFollow}
                onChange={(event) => {
                  const follow = event.currentTarget.checked;
                  // 끄는 순간 보이던 채움으로 고정해 게이지가 슬라이더 시작값으로 뛰지 않고 그 자리에 멈춰 있게 한다.
                  const shown = gaugeLevelRef.current;
                  if (!follow) setManualAltitude((current) => manualAltitudeOnUnfollow(shown, current));
                  setAltitudeFollow(follow);
                }}
              />
              <span>곡 진행 따라가기</span>
            </label>
            <div className="gear-preview-slider">
              <div className="gear-preview-slider-head">
                <label htmlFor="gear-preview-altitude">고도 직접 정하기</label>
                <output htmlFor="gear-preview-altitude">{altitudeFollow ? '따라가는 중' : `${altitudePercent}%`}</output>
              </div>
              <input
                id="gear-preview-altitude"
                type="range"
                min={0}
                max={100}
                step={1}
                value={altitudePercent}
                onChange={(event) => {
                  setManualAltitude(clampAltitudePercent(Number(event.currentTarget.value)) / 100);
                  setAltitudeFollow(false);
                }}
              />
            </div>
            <p className="gear-preview-note">
              곡 진행 따라가기는 게임 렌더러의 임시 고도 모델(시연 차트 약 3분 동안 1 → 0)을 그대로 씁니다. 이 시연은 판정을 고도에 넣지 않습니다.
              슬라이더를 움직이면 그 고도로 고정해 비행 배경과 두 유리관 게이지가 함께 바뀌고, 게이지는 약 300ms에 걸쳐 따라갑니다.
            </p>
          </fieldset>
          <RadioGroup legend="키보드 표시" name="gear-preview-keyboard" value={keyboard} options={KEYBOARD_OPTIONS} onChange={setKeyboard} />
          <fieldset className="gear-preview-group gear-preview-motion">
            <legend>움직임</legend>
            <label className="gear-preview-check gear-preview-check-master">
              <input type="checkbox" checked={motionEnabled} onChange={(event) => setMotionEnabled(event.currentTarget.checked)} />
              <span>움직임</span>
            </label>
            <GearMotionLayerChecks
              value={motionLayers}
              onChange={(layer, visible) => setMotionLayers((current) => ({ ...current, [layer]: visible }))}
            />
            <div className="gear-preview-actions">
              <button type="button" className="gear-preview-button" onClick={restartMotion}>처음부터 재생</button>
              <p className="gear-preview-note">움직임 시계 <output ref={motionTimeRef} data-motion-clock="true">멈춤</output></p>
            </div>
            <p className="gear-preview-note">{motionNote(motionAssets)}</p>
          </fieldset>
          <RadioGroup
            legend="렌더 높이"
            name="gear-preview-render-height"
            value={renderHeight}
            options={RENDER_HEIGHTS.map((value) => ({ value, label: `${value}` }))}
            onChange={setRenderHeight}
          />
          <RadioGroup
            legend="비행 장면"
            name="gear-preview-scenario"
            value={scenario}
            options={SCENARIOS.map((value) => ({ value, label: value }))}
            onChange={setScenario}
          />
          <RadioGroup legend="보기" name="gear-preview-view" value={view} options={[...VIEWS]} onChange={setView} />
          <p className="gear-preview-note">
            1:1 픽셀은 캔버스 1px을 기기 화면 1px로 보여 줍니다. 무대보다 크면 안에서 스크롤합니다.
          </p>
        </aside>
      </div>

      <GearMotionCompare resources={loadedMotion} layers={motionLayers} />
    </main>
  );
}

function describeKeyboard(placement: { visible: boolean; scale: number }): string {
  if (!placement.visible) {
    return `숨김 · 필요 배율 ${Math.max(0, placement.scale).toFixed(2)}이 최소 ${KEYBOARD_DISPLAY_MIN_SCALE}보다 작음`;
  }
  return placement.scale >= 1 ? '원래 크기 · 오른쪽 아래' : `${placement.scale.toFixed(2)}배로 줄여 기어 오른쪽에 맞춤`;
}

function motionNote(state: MotionAssetsState): string {
  if (state.status === 'error') return `움직임 자료를 불러오지 못했습니다: ${state.message}`;
  return '게임 렌더러가 내장한 기어 움직임입니다(승인 SVG를 텍스처·마스크로 구운 Pixi 레이어). 움직임 시계는 곡 시간이 아니라 게임 프레임 간격으로만 나아가고(차트를 되감아도 이어 감), 렌더러를 새로 만들면 0초부터 다시 시작합니다. 광원 띠 경계는 안티앨리어싱 없이 잘려 픽셀 계단으로 보입니다(아래 비교에서 부드럽게 한 모습과 견줄 수 있습니다).';
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

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

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
 * 실제 GameRenderer 하나의 수명. key가 바뀌면(렌더 높이·장면·논리 폭) 캔버스째 새로 만든다.
 * 비행 배경 DOM은 캔버스 앞 형제로 들어가므로, 캔버스 크기와 같은 위치 지정 래퍼에 캔버스만 둔다.
 * 기어·레인·판정선·가림막·키보드 표시는 게임 렌더러가 그대로 그리고, 노트는 정해 둔 데모 판정(buildGearPreviewSchedule)대로
 * 맞히거나 놓친 것처럼 표시한다. `gearMotion`은 렌더러가 내장하며(게임과 같음), 이 컴포넌트는 공개 gearMotion API로 조절만 한다.
 */
function GearPreviewRenderer({
  rendererKey, scenario, width, resolution, lift, altitudeOverride, keyboardBindings, sharedSkin, hostStyle,
  motionSettings, restartRef, frameWindows, onState, onView, onMotionTime, onMotionAttached, onGaugeLevel,
}: {
  rendererKey: string;
  scenario: Scenario;
  /** 렌더러 논리 폭(높이 600). */
  width: number;
  resolution: number;
  /** 리프트(논리 단위). 바뀌면 렌더러를 유지한 채 setLift로 옮긴다. */
  lift: number;
  /** 고도 고정값(0~1). null이면 렌더러 고도 모델을 따른다. 바뀌면 렌더러를 유지한 채 setAltitudeOverride로 건다. */
  altitudeOverride: number | null;
  keyboardBindings: ReadonlyMap<string, number>;
  /** 페이지가 빌려 주는 Classic 스킨. 렌더러를 다시 만들어도 다시 읽지 않는다. */
  sharedSkin: SharedSkin<SkinManager>;
  hostStyle: CSSProperties;
  motionSettings: MotionSettings;
  /** 페이지의 처음부터 재생 버튼이 부를 함수를 이 렌더러가 채운다(살아 있는 렌더러의 gearMotion.restart()). */
  restartRef: RefObject<(() => void) | null>;
  frameWindows: FrameWindows;
  onState: (state: RendererState) => void;
  onView: (view: RendererView) => void;
  /** `gearMotion`이 재생되는 프레임마다 애니메이션 경과 시간(ms), 재생되지 않게 되면 null. */
  onMotionTime: (timeMs: number | null) => void;
  /** 이 렌더러(key)의 내장 `gearMotion`이 준비되어 기어에 추가됐을 때. */
  onMotionAttached: (key: string) => void;
  /** 프레임마다 지금 보이는 게이지 채움(gearGaugeLevel), 렌더러를 정리하면 null. */
  onGaugeLevel: (level: number | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 리프트·키보드·`gearMotion` 설정 effect가 쓰는 살아 있는 렌더러와 그 값을 다시 적용하는 함수.
  const liveRef = useRef<{
    applyLift: (lift: number) => void;
    applyAltitude: (altitude: number | null) => void;
    applyKeyboard: (bindings: ReadonlyMap<string, number>) => void;
    applyMotion: (settings: MotionSettings) => void;
  } | null>(null);
  const liftRef = useRef(lift);
  liftRef.current = lift;
  const altitudeRef = useRef(altitudeOverride);
  altitudeRef.current = altitudeOverride;
  const keyboardRef = useRef(keyboardBindings);
  keyboardRef.current = keyboardBindings;
  const motionSettingsRef = useRef(motionSettings);
  motionSettingsRef.current = motionSettings;
  const options = useRef({
    rendererKey, scenario, width, resolution, sharedSkin, restartRef, frameWindows, onState, onView, onMotionTime, onMotionAttached, onGaugeLevel,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const {
      rendererKey: key, scenario: label, width: logicalWidth, resolution: rendererResolution, sharedSkin: skins,
      restartRef: restart, frameWindows: windows, onState, onView: reportView, onMotionTime: reportMotionTime, onMotionAttached: reportMotionAttached,
      onGaugeLevel: reportGaugeLevel,
    } = options.current;
    const report = (state: DistributiveOmit<RendererState, 'key'>) => onState({ ...state, key } as RendererState);
    let disposed = false;
    let starting = true;
    let frame = 0;
    let renderer: GameRenderer | null = null;
    let skinAcquired = false;
    // 이 렌더러가 애니메이션 경과 시간을 알리고 있는지. 정리할 때 무대에 남은 값을 지운다.
    let reportedMotion = false;
    const restartMotion = () => renderer?.gearMotion?.restart();

    // removeView: 정상 정리(키 변경·언마운트)는 캔버스까지 치우고, 오류일 때는 React가 소유한 캔버스를 남긴다.
    const release = (removeView = true) => {
      cancelAnimationFrame(frame);
      if (reportedMotion) reportMotionTime(null);
      reportedMotion = false;
      reportGaugeLevel(null);
      if (restart.current === restartMotion) restart.current = null;
      liveRef.current = null;
      try { renderer?.dispose(removeView); } catch (error) { console.warn('GearPage: renderer dispose failed', error); }
      renderer = null;
      if (skinAcquired) skins.release();
      skinAcquired = false;
    };

    const start = async () => {
      report({ status: 'loading' });
      try {
        const { GameRenderer } = await import('../game/renderer');
        // 콤보·정확도 Pixi 텍스트는 만들 때 글꼴을 재므로 게임 글꼴을 먼저 받아 둔다(실패해도 진행).
        await loadGameFonts();
        if (disposed) return;
        skinAcquired = true;
        const skin = await skins.acquire();
        if (disposed) return;

        renderer = new GameRenderer({
          canvas,
          width: logicalWidth,
          height: GAME_HEIGHT,
          resolution: rendererResolution,
          skinManager: skin,
          difficultyLabel: label,
          showFlightBackground: true,
        });
        await renderer.init();
        if (disposed) return;

        const demo = buildGearPreviewDemo();
        const schedule = buildGearPreviewSchedule(demo.hits);
        const timing = createChartTiming(demo.chart);
        // setChart는 노트 표시 상태(처리·놓침)를 비우므로 되감을 때마다 다시 건다.
        const loadChart = (target: GameRenderer) => target.setChart(
          demo.chart.notes, demo.chart.trillZones, demo.chart.restZones ?? [], demo.chart.events, timing, demo.durationMs,
        );
        loadChart(renderer);
        renderer.scrollSpeed = SCROLL_SPEED;
        renderer.updateAccuracy(100);

        const active = renderer;
        const gearLayout = active.gearLayout;
        let loopState = initialGearPreviewLoopState();
        const publishView = () => reportView({
          key,
          judgmentLineY: active.judgmentLineY,
          gear: gearLayout && {
            x: gearLayout.x,
            y: gearLayout.y,
            scale: gearLayout.scale,
            deckTopY: gearLayout.deckTopY,
            keyRimY: gearLayout.keyRimY,
            laneLeft: gearLayout.x + GEAR_GEOMETRY.laneLeft * gearLayout.scale,
            laneRight: gearLayout.x + (GEAR_GEOMETRY.laneRight + 1) * gearLayout.scale,
          },
          missed: loopState.missed,
          songMs: Math.max(0, loopState.previousMs),
        });
        // 리프트는 판정선과 딸린 표시만 옮긴다. 기어와 레인 가림막은 그대로다.
        const applyLift = (nextLift: number) => {
          active.setLift(nextLift);
          publishView();
        };
        applyLift(liftRef.current);
        // 고도 고정(Lab 전용 공개 API). null이면 곡 진행에 따른 렌더러 고도 모델을 따른다.
        const applyAltitude = (altitude: number | null) => active.setAltitudeOverride(altitude);
        applyAltitude(altitudeRef.current);
        const applyKeyboard = (bindings: ReadonlyMap<string, number>) => active.setupKeyboardDisplay(new Map(bindings));
        applyKeyboard(keyboardRef.current);

        // 내장 `gearMotion`(게임과 같음)은 init이 에셋을 기다려 이미 추가했다.
        const motion = active.gearMotion;
        if (motion?.status === 'ready') reportMotionAttached(key);
        const applyMotion = (settings: MotionSettings) => {
          if (!motion) return;
          motion.setEnabled(settings.enabled);
          for (const layer of GEAR_MOTION_LAYERS) motion.setLayerVisible(layer, settings.layers[layer]);
        };
        applyMotion(motionSettingsRef.current);
        liveRef.current = { applyLift, applyAltitude, applyKeyboard, applyMotion };
        restart.current = restartMotion;

        let startNow = performance.now();
        let previousNow = startNow;
        const beams = [false, false, false, false];
        const tick = (now: number) => {
          const frameDelta = now - previousNow;
          const deltaMs = Math.min(48, Math.max(0, frameDelta));
          previousNow = now;
          // `gearMotion` 켬·끔 프레임 간격은 이번 프레임이 `gearMotion`을 그렸는지(running)로 나눠 모은다.
          if (frameDelta <= FRAME_DELTA_LIMIT_MS) windows[motion?.running ? 'on' : 'off'].push(frameDelta);
          let songMs = Math.max(0, now - startNow);
          if (songMs >= demo.durationMs) {
            startNow = now;
            songMs = 0;
          }
          const step = stepGearPreviewLoop(schedule, loopState, songMs);
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
          // 애니메이션 경과 시간은 renderFrame의 deltaMs(렌더 프레임)로만 나아간다. 차트를 되감아도(setChart) 이어 간다.
          active.renderFrame(songMs, deltaMs);
          reportGaugeLevel(active.gearGaugeLevel);
          if (motion) {
            if (motion.running) {
              reportMotionTime(motion.timeMs);
              reportedMotion = true;
            } else if (reportedMotion) {
              reportMotionTime(null);
              reportedMotion = false;
            }
          }
        };
        const loop = (now: number) => {
          if (disposed) return;
          try {
            tick(now);
          } catch (error) {
            // 무대가 준비됨으로 남은 채 조용히 멈추지 않도록 오류 상태로 바꾸고 루프를 멈춘다.
            console.error('GearPage: render loop failed', error);
            release(false);
            report({ status: 'error', message: error instanceof Error ? error.message : '재생 중 오류가 났습니다.' });
            return;
          }
          frame = requestAnimationFrame(loop);
        };
        active.renderFrame(0, 0);
        reportGaugeLevel(active.gearGaugeLevel);
        report({ status: 'ready', backingWidth: canvas.width, backingHeight: canvas.height });
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

  // 리프트: 판정선·콤보/정확도·판정 글자·노트 판정 위치는 setLift가 옮긴다. 기어와 가림막은 움직이지 않는다.
  useEffect(() => {
    liveRef.current?.applyLift(lift);
  }, [lift]);

  // 고도 고정: 렌더러를 다시 만들지 않고 살아 있는 렌더러에 건다(게이지는 약 300ms에 걸쳐 따라간다).
  useEffect(() => {
    liveRef.current?.applyAltitude(altitudeOverride);
  }, [altitudeOverride]);

  useEffect(() => {
    liveRef.current?.applyKeyboard(keyboardBindings);
  }, [keyboardBindings]);

  // `gearMotion` 켜기·요소는 렌더러를 다시 만들지 않고 살아 있는 렌더러의 gearMotion에 적용한다.
  useEffect(() => {
    liveRef.current?.applyMotion(motionSettings);
  }, [motionSettings]);

  return (
    <div className="gear-preview-canvas-host" style={hostStyle}>
      <canvas ref={canvasRef} className="gear-preview-canvas" data-gear-preview-canvas="true" />
    </div>
  );
}

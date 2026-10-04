/*
THESIS: 새 Classic 프레임은 따로 그린 모형이 아니라 실제 게임 렌더러·비행 배경·흐르는 노트 위에서 맞춤 방식을 고른다.
OWN-WORLD: 기존 Lab의 건메탈 다크 패널과 청록 상태광, 게임 그대로의 Pixi 플레이필드를 잇는다.
STORY: 사용자는 맞춤 방식을 바꿔 무엇이 잘리고 눌리는지 숫자로 읽고, 레인 폭 슬라이더로 프레임을 통째로 줄여 보며, 렌더 높이와 1:1 픽셀 보기로 선명도를 확인한다.
FIRST VIEWPORT: 16:9 실제 게임 화면이 중심을 차지하고 바로 아래 설명, 오른쪽(좁은 화면은 아래)에 네 가지 선택과 레인 폭만 둔다.
FORM: 게임 렌더러를 그대로 띄우는 Operate형 비교 도구이며 정적 합성 이미지를 만들지 않는다.
*/
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
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
  oneToOneCssSize,
  parseFrameFitGeometry,
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

/** 살아 있는 렌더러에서 읽어 무대 data 속성으로 알리는 값(화면 논리 단위). */
interface RendererView {
  key: string;
  judgmentLineY: number;
  gameMaskVisible: boolean;
  missed: number;
  /** 이 값을 알린 프레임의 곡 시간(놓친 노트·판정선 변경 때만 갱신). */
  songMs: number;
}

const stage = createFrameFitStage(FRAME_FIT_STAGE_WIDTH);

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

  const geometry = assets.status === 'ready' ? assets.geometry : null;
  const uniform = mode === 'uniform';
  const laneRange = geometry ? uniformLaneWidthRange(geometry, stage) : null;
  const committedLaneWidth = geometry ? clampUniformLaneWidth(laneWidth ?? UNIFORM_DEFAULT_LANE_WIDTH, geometry, stage) : null;
  const draftLaneWidth = laneWidthDraft ?? committedLaneWidth;
  // 렌더러에 얹는 배치(놓은 레인 폭)와 설명에 쓰는 배치(끄는 중인 레인 폭)를 나눈다. 프레임은 판정선 높이와 무관하다.
  const layout = useMemo(
    () => (geometry ? computeFrameFitLayout(mode, geometry, stage, committedLaneWidth ?? undefined) : null),
    [geometry, mode, committedLaneWidth],
  );
  const readoutLayout = useMemo(
    () => (geometry ? computeFrameFitLayout(mode, geometry, stage, draftLaneWidth ?? undefined) : null),
    [geometry, mode, draftLaneWidth],
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
    [uniform, committedLaneWidth, renderHeight],
  );
  const screenResolution = renderHeight / GAME_HEIGHT;
  const showCurrentGear = mode === 'current';
  // 렌더 높이·비행 장면·현재 기어 표시·uniform(게임 마스크 숨김)·줌은 렌더러 생성 옵션이라 바뀌면 렌더러를 새로 만든다.
  const rendererKind = showCurrentGear ? 'gear' : uniform ? 'uniform' : 'overlay';
  const rendererKey = `${renderHeight}:${scenario}:${rendererKind}:${zoom.zoom.toFixed(6)}`;
  // 렌더러를 새로 만드는 동안 이전 렌더러의 준비 상태를 보이지 않는다.
  const rendererState: RendererState = reportedState.key === rendererKey ? reportedState : { status: 'loading', key: rendererKey };
  const ready = rendererState.status === 'ready';
  const frameTop = layout ? layout.screenFrameTop : ready ? rendererState.gearTop : null;
  const handleRendererState = useCallback((state: RendererState) => setRendererState(state), []);
  const handleRendererView = useCallback((next: RendererView) => setRendererView(next), []);
  const liveView = rendererView?.key === rendererKey ? rendererView : null;

  const backing = ready
    ? { width: rendererState.backingWidth, height: rendererState.backingHeight }
    : { width: Math.round(zoom.width * zoom.resolution), height: Math.round(zoom.height * zoom.resolution) };
  const pixelSize = oneToOneCssSize(backing.width, backing.height, devicePixelRatio);
  const hostStyle: CSSProperties = view === 'pixel'
    ? { width: `${pixelSize.width}px`, height: `${pixelSize.height}px` }
    : { width: '100%', aspectRatio: `${FRAME_FIT_STAGE_WIDTH} / ${GAME_HEIGHT}` };

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
      setLaneWidth(clampUniformLaneWidth(Number(slider.value), geometry, stage));
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
          비행 배경과 노트는 실제 게임 렌더러가 그리고, 프레임은 기어 자리에 정지 그림으로만 놓입니다.
        </p>
      </header>

      <div className="frame-fit-workbench">
        <section
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
        >
          <div className="frame-fit-viewport" ref={viewportRef} data-view={view}>
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
                onState={handleRendererState}
                onView={handleRendererView}
              />
            ) : (
              <div className="frame-fit-placeholder" style={hostStyle}>
                {assets.status === 'error' ? assets.message : '프레임 자료를 불러오는 중'}
              </div>
            )}
            {rendererState.status === 'error' && <p className="frame-fit-error" role="alert">{rendererState.message}</p>}
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
    </main>
  );
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

function RadioGroup<T extends string | number>({ legend, name, value, options, onChange }: {
  legend: string;
  name: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="frame-fit-group">
      <legend>{legend}</legend>
      <div className="frame-fit-options">
        {options.map((option) => (
          <label className="frame-fit-option" key={option.value}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * 실제 GameRenderer 하나의 수명. key가 바뀌면(렌더 높이·장면·현재 기어·uniform·줌) 캔버스째 새로 만든다.
 * 비행 배경 DOM은 캔버스 앞 형제로 들어가므로, 캔버스 크기와 같은 위치 지정 래퍼에 캔버스만 둔다.
 * 줌(가로세로 같이 줄이기)은 렌더러 논리 크기·판정선 오프셋·스크롤 속도를 키우고 해상도를 같은 비율로 낮춰
 * 같은 캔버스에 게임 화면 전체를 작게 그린다. uniform은 게임 마스크·버튼을 끄고(hideGameMask) 오버레이가 덱부터 덮는다.
 * 노트는 정해 둔 데모 판정(buildFrameFitSchedule)대로 맞히거나 놓친 것처럼 표시한다.
 */
function FrameFitRenderer({ rendererKey, scenario, showCurrentGear, zoom, hideGameMask, lift, layout, image, sharedSkin, hostStyle, onState, onView }: {
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
  onState: (state: RendererState) => void;
  onView: (view: RendererView) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<FrameFitOverlay | null>(null);
  // 판정선 높이 effect가 쓰는 살아 있는 렌더러와, 판정선 y·게임 마스크를 다시 걸고 읽어 알리는 함수.
  const liveRef = useRef<{ renderer: GameRenderer; applyLift: (lift: number) => void } | null>(null);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const liftRef = useRef(lift);
  liftRef.current = lift;
  const options = useRef({ rendererKey, scenario, showCurrentGear, zoom, hideGameMask, image, sharedSkin, onState, onView });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { rendererKey: key, scenario: label, showCurrentGear: withGear, zoom: view, hideGameMask: hideMask, image: frameImage, sharedSkin: skins, onState, onView: reportView } = options.current;
    const report = (state: DistributiveOmit<RendererState, 'key'>) => onState({ ...state, key } as RendererState);
    let disposed = false;
    let starting = true;
    let frame = 0;
    let renderer: GameRenderer | null = null;
    let skinAcquired = false;
    let overlay: FrameFitOverlay | null = null;

    // removeView: 정상 정리(키 변경·언마운트)는 캔버스까지 치우고, 오류일 때는 React가 소유한 캔버스를 남긴다.
    const release = (removeView = true) => {
      cancelAnimationFrame(frame);
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
          { createFrameFitSource, FrameFitOverlay, getGearFrameLayer, getGearFrameSprite, isGameLaneMaskVisible, readJudgmentLineY, setGameLaneMaskVisible },
        ] = await Promise.all([
          import('../game/renderer'),
          import('./classicFrameFitOverlay'),
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
        liveRef.current = { renderer: active, applyLift };

        if (!withGear) {
          overlay = new FrameFitOverlay(getGearFrameLayer(renderer), createFrameFitSource(frameImage));
          overlay.apply(layoutRef.current);
          overlayRef.current = overlay;
        }
        const gear = withGear ? getGearFrameSprite(renderer) : null;

        let startNow = performance.now();
        let previousNow = startNow;
        const beams = [false, false, false, false];
        const tick = (now: number) => {
          const deltaMs = Math.min(48, Math.max(0, now - previousNow));
          previousNow = now;
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

  return (
    <div className="frame-fit-canvas-host" style={hostStyle}>
      <canvas ref={canvasRef} className="frame-fit-canvas" data-frame-fit-canvas="true" />
    </div>
  );
}

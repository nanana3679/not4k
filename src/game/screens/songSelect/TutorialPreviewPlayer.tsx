import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { color, surface, radius, primitives } from '../../../shared/theme';
import type { GameRenderer } from '../../renderer';
import type { SkinManager } from '../../skin';
import type { SkinManifest } from '../../skin/types';
import { LANE_AREA_WIDTH } from '../../renderer/constants';
import { SessionRendererAdapter, type SessionRendererPort } from '../../judgment/SessionRendererAdapter';
import { createTutorialPreviewSessionController } from './tutorialPreviewSession';
import { stepTutorialLoopClock } from './tutorialLoopClock';
import { getTutorialRenderCycleIndex, mapTutorialRenderBodyQuery } from './tutorialPreviewRenderMapping';
import { TUTORIAL_KB_SIDE_PAD, TUTORIAL_KB_VPAD } from '../../renderer/constants';
import { createChartTiming } from '../../../shared';
import { useGameStore } from '../../stores';
import {
  TUTORIAL_PREVIEWS,
  getActiveTutorialDiagramTiming,
  getActiveTutorialInputTimings,
  getTutorialDiagramTimings,
  getTutorialInputStateKey,
  getTutorialInputTimings,
  type TutorialDiagramTiming,
  type TutorialPreviewDefinition,
  type TutorialInputTiming,
} from './tutorialPreviewChart';
import {
  getTutorialKeyboardLayout,
  getTutorialKeyboardLabel,
  resolveTutorialKeyboardBindings,
  resolveTutorialInputTimingsForKeyboard,
  sortLaneKeysForLabel,
  type TutorialKeyboardLayout,
} from './tutorialKeyboardLayout';
import { TutorialPatternDiagram } from './TutorialPatternDiagram';

export interface TutorialKeyView {
  id: string;
  lane: number;
  keyCode: string;
  label: string;
  firstStartMs: number;
}

interface LaneKeyLabelView {
  lane: number;
  keyCode?: string;
  label: string;
}

type LaneKeyIdsByLane = Record<number, string[]>;
type TutorialDiagramPhase = 'enter' | 'visible' | 'exit';

interface TutorialDiagramDisplay {
  diagramId: TutorialDiagramTiming['event']['diagramId'];
  phase: TutorialDiagramPhase;
}

interface TutorialDiagramPause {
  timing: TutorialDiagramTiming;
}

/** 재생기가 소유한 렌더러의 수명 상태. 렌더러 effect가 알리고 차트 effect가 구독한다. */
type TutorialPreviewRendererState =
  | { status: 'loading' }
  | { status: 'ready'; renderer: GameRenderer }
  | { status: 'failed' };

const PREVIEW_LANES = [1, 2, 3, 4] as const;
const PREVIEW_RENDER_WIDTH = LANE_AREA_WIDTH;
const PREVIEW_RENDER_HEIGHT = 360;
const PREVIEW_JUDGMENT_LINE_OFFSET = 80;
const TUTORIAL_DIAGRAM_ENTER_MS = 260;
const TUTORIAL_DIAGRAM_EXIT_MS = 180;

export interface TutorialBombPosition { x: number; y: number }

/** Canvas 내 정규화 좌표. 키보드 높이가 바뀌어도 같은 레인의 판정선에 표시한다. */
export function getTutorialBombPosition(lane: number, keyboardAreaHeight: number): TutorialBombPosition {
  return {
    x: (lane - .5) / PREVIEW_LANES.length,
    y: (PREVIEW_RENDER_HEIGHT - PREVIEW_JUDGMENT_LINE_OFFSET) / (PREVIEW_RENDER_HEIGHT + keyboardAreaHeight),
  };
}

interface TutorialPreviewPlayerProps {
  preview?: TutorialPreviewDefinition;
  /**
   * 같은 레슨을 다시 방문했는지 구분하는 재생 인스턴스 id. 바뀌면 렌더러는 그대로 두고 차트를 처음부터 다시 건다.
   * 렌더러를 새로 만들려면 부모가 key를 바꿔 재생기를 다시 마운트한다(Lab의 처음부터 재생).
   */
  previewInstanceId?: number;
  onReady?: () => void;
  diagramModalEnabled?: boolean;
  diagramModalVisible?: boolean;
  skinId?: string;
  /**
   * 직접 넘기는 스킨 manifest. 렌더러는 `theme.id`로 스킨을 구분하므로, 에셋이 다른 manifest는 다른 `theme.id`를 가져야
   * 렌더러를 새로 만든다(같은 id면 기존 렌더러의 텍스처를 계속 쓴다).
   */
  skinManifest?: SkinManifest;
  showRendererBomb?: boolean;
  onBombEffect?: (lane: number, position: TutorialBombPosition) => void;
  /** true면 판정 진행과 렌더를 멈추고 마지막 장면을 유지한다. false로 돌아오면 멈춘 지점부터 이어서 재생한다. */
  paused?: boolean;
}

export function uniqueTutorialKeys(timings: readonly TutorialInputTiming[]): TutorialKeyView[] {
  const seen = new Set<string>();
  const keys: TutorialKeyView[] = [];

  for (const { event, startMs } of timings) {
    const id = getTutorialInputStateKey(event);
    if (seen.has(id)) continue;
    seen.add(id);
    keys.push({
      id,
      lane: event.lane,
      keyCode: event.keyCode,
      label: event.keyLabel || event.keyCode,
      firstStartMs: startMs,
    });
  }

  return keys;
}

function getFallbackLaneKeys(laneKeys: readonly TutorialKeyView[]): TutorialKeyView[] {
  if (laneKeys.length === 0) return [];

  const firstStartMs = Math.min(...laneKeys.map((key) => key.firstStartMs));
  return laneKeys.filter((key) => key.firstStartMs === firstStartMs);
}

function orderLaneKeysForLabel(displayKeys: readonly TutorialKeyView[]): TutorialKeyView[] {
  if (
    displayKeys.length > 1 &&
    displayKeys.every((key) => key.firstStartMs === displayKeys[0].firstStartMs)
  ) {
    return [...displayKeys];
  }

  return sortLaneKeysForLabel(displayKeys);
}

export function getLaneKeyLabels(
  keys: readonly TutorialKeyView[],
  activeKeyIds: readonly string[],
  stickyLaneKeyIdsByLane: LaneKeyIdsByLane,
): LaneKeyLabelView[] {
  return PREVIEW_LANES.map((lane) => {
    const laneKeys = keys.filter((key) => key.lane === lane);
    const activeKeys = activeKeyIds.map((id) => keys.find((key) => key.id === id))
      .filter((key): key is TutorialKeyView => key !== undefined && key.lane === lane);
    const stickyKeys = (stickyLaneKeyIdsByLane[lane] ?? []).map((id) => keys.find((key) => key.id === id))
      .filter((key): key is TutorialKeyView => key !== undefined && key.lane === lane);
    const fallbackKeys = getFallbackLaneKeys(laneKeys);
    const displayKeys = activeKeys.length > 0 ? activeKeys : stickyKeys.length > 0 ? stickyKeys : fallbackKeys;
    const orderedDisplayKeys = orderLaneKeysForLabel(displayKeys);

    return {
      lane,
      keyCode: orderedDisplayKeys.map((key) => key.keyCode).join(' '),
      label: orderedDisplayKeys.map((key) => key.label).join(' '),
    };
  });
}

export interface TutorialKeyboardKeyView {
  code: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  mapped: boolean;
}

/** 키보드 strip 스펙 계산(순수함수) — 렌더러는 이 스펙을 생성 시 받아 그리기만 한다. */
export function buildTutorialKeyboardKeys(
  layout: TutorialKeyboardLayout,
  keyByCode: Map<string, TutorialKeyView>,
): TutorialKeyboardKeyView[] {
  return layout.keys.map((kd) => {
    const tk = keyByCode.get(kd.code);
    return {
      code: kd.code,
      x: kd.x,
      y: kd.y,
      w: kd.w ?? 1,
      h: kd.h ?? 1,
      label: tk?.label ?? kd.label,
      mapped: !!tk,
    };
  });
}

export function TutorialPreviewPlayer({
  preview = TUTORIAL_PREVIEWS[0],
  previewInstanceId,
  onReady,
  diagramModalEnabled = true,
  diagramModalVisible = true,
  skinId = 'classic',
  skinManifest,
  showRendererBomb = true,
  onBombEffect,
  paused = false,
}: TutorialPreviewPlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 지금 차트를 그리고 있는(차트를 건) 렌더러. 레인 키 라벨 effect가 쓴다.
  const rendererRef = useRef<GameRenderer | null>(null);
  // 렌더러 effect가 알리는 렌더러 수명 상태와, 그 상태를 구독하는 현재 차트 effect의 처리기.
  const rendererStateRef = useRef<TutorialPreviewRendererState>({ status: 'loading' });
  const rendererStateListenerRef = useRef<((state: TutorialPreviewRendererState) => void) | null>(null);
  const readyNotifiedRef = useRef(false);
  const onReadyRef = useRef(onReady);
  const resumeDiagramRef = useRef<(() => void) | null>(null);
  const dismissDiagramRef = useRef<(() => void) | null>(null);
  const diagramModalEnabledRef = useRef(diagramModalEnabled);
  const showRendererBombRef = useRef(showRendererBomb);
  const onBombEffectRef = useRef(onBombEffect);
  const pausedRef = useRef(paused);
  const settings = useGameStore((state) => state.settings);
  const [activeKeyIds, setActiveKeyIds] = useState<string[]>([]);
  const [stickyLaneKeyIdsByLane, setStickyLaneKeyIdsByLane] = useState<LaneKeyIdsByLane>({});
  const [activeDiagramTiming, setActiveDiagramTiming] = useState<TutorialDiagramTiming | null>(null);
  const [diagramDisplay, setDiagramDisplay] = useState<TutorialDiagramDisplay | null>(null);
  // 렌더러를 만들지 못한 오류는 렌더러 수명 동안, 차트를 걸지 못한 오류는 그 차트 동안 유지한다.
  const [rendererError, setRendererError] = useState<string | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);
  const error = rendererError ?? contentError;
  // 구동기(렌더러)가 첫 프레임까지 준비됐는지. 준비 전에는 도식 모달에서 OK 대신 스피너를 보여
  // 로딩 중 상호작용(OK로 재개)을 막는다.
  const [rendererReady, setRendererReady] = useState(false);
  const baseTimings = useMemo(() => getTutorialInputTimings(preview.chart), [preview]);
  const diagramTimings = useMemo(() => getTutorialDiagramTimings(preview.chart), [preview]);
  const bindingResolution = useMemo(
    () => resolveTutorialKeyboardBindings(baseTimings, settings.keyBindings, settings.preset),
    [baseTimings, settings.keyBindings, settings.preset],
  );
  const timings = useMemo(
    () => resolveTutorialInputTimingsForKeyboard(baseTimings, bindingResolution.bindings),
    [baseTimings, bindingResolution.bindings],
  );
  const bindingNotice = useMemo(() => {
    if (bindingResolution.supplementedLanes.length === 0) return null;
    const lanes = bindingResolution.supplementedLanes.map(lane => {
      const property = `lane${lane}` as keyof typeof bindingResolution.bindings;
      const labels = bindingResolution.bindings[property].map(getTutorialKeyboardLabel).join(' ');
      return `${lane}번 레인에 ${labels}`;
    }).join(', ');
    return `이 시연은 ${lanes}를 배정한 예입니다. 옵션에서 레인별 키를 추가할 수 있습니다.`;
  }, [bindingResolution]);
  const keys = useMemo(() => uniqueTutorialKeys(timings), [timings]);
  const laneKeyLabels = useMemo(
    () => getLaneKeyLabels(keys, activeKeyIds, stickyLaneKeyIdsByLane),
    [keys, activeKeyIds, stickyLaneKeyIdsByLane],
  );
  const keyByCode = useMemo(() => new Map(keys.map((key) => [key.keyCode, key])), [keys]);
  const keyboardLayout = useMemo(
    () => getTutorialKeyboardLayout(settings.preset),
    [settings.preset],
  );
  // 캔버스 아래 키보드 strip 높이 — 보드 폭(레인 폭 - 좌우 패딩)에 레이아웃 비율을 적용.
  const keyboardAreaHeight = useMemo(() => {
    const boardW = LANE_AREA_WIDTH - TUTORIAL_KB_SIDE_PAD * 2;
    const boardH = (boardW * keyboardLayout.heightUnits) / keyboardLayout.widthUnits;
    return Math.round(boardH + TUTORIAL_KB_VPAD * 2);
  }, [keyboardLayout]);
  const tutorialKeyboardKeys = useMemo(
    () => buildTutorialKeyboardKeys(keyboardLayout, keyByCode),
    [keyboardLayout, keyByCode],
  );
  // 렌더러는 스킨과 키보드 프리셋(키캡 배치)에만 묶인다. 이 키가 바뀔 때만 렌더러와 캔버스를 새로 만든다 —
  // Pixi는 dispose할 때 캔버스의 WebGL 컨텍스트를 잃게 하므로 새 렌더러는 새 캔버스에 붙여야 한다.
  const rendererKey = `${skinManifest?.theme.id ?? skinId}:${settings.preset}`;
  const rendererOptionsRef = useRef({ skinId, skinManifest, keyboardLayout, keyboardAreaHeight, tutorialKeyboardKeys });
  const handleDiagramOk = () => {
    resumeDiagramRef.current?.();
  };

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    showRendererBombRef.current = showRendererBomb;
    onBombEffectRef.current = onBombEffect;
  }, [onBombEffect, showRendererBomb]);

  useEffect(() => {
    diagramModalEnabledRef.current = diagramModalEnabled;
    if (!diagramModalEnabled) {
      dismissDiagramRef.current?.();
    }
  }, [diagramModalEnabled]);

  useEffect(() => {
    const activeDiagramId = activeDiagramTiming?.event.diagramId;
    let timeoutId: number | undefined;

    if (activeDiagramId && diagramModalVisible) {
      setDiagramDisplay({ diagramId: activeDiagramId, phase: 'enter' });
      timeoutId = window.setTimeout(() => {
        setDiagramDisplay((current) =>
          current?.diagramId === activeDiagramId ? { ...current, phase: 'visible' } : current,
        );
      }, TUTORIAL_DIAGRAM_ENTER_MS);
    } else {
      setDiagramDisplay((current) => current ? { ...current, phase: 'exit' } : null);
      timeoutId = window.setTimeout(() => {
        setDiagramDisplay((current) => current?.phase === 'exit' ? null : current);
      }, TUTORIAL_DIAGRAM_EXIT_MS);
    }

    return () => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [activeDiagramTiming, diagramModalVisible]);

  useEffect(() => {
    rendererOptionsRef.current = { skinId, skinManifest, keyboardLayout, keyboardAreaHeight, tutorialKeyboardKeys };
  }, [keyboardAreaHeight, keyboardLayout, skinId, skinManifest, tutorialKeyboardKeys]);

  // 렌더러 수명 — rendererKey(스킨·키보드 프리셋)가 바뀌거나 언마운트될 때만 정리한다.
  // 레슨을 넘길 때는 아래 차트 effect가 같은 렌더러에 새 차트를 건다(WebGL 컨텍스트·스킨 로드·init 생략).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rendererOptions = rendererOptionsRef.current;
    setRendererError(null);

    let disposed = false;
    let renderer: GameRenderer | null = null;
    let skinManager: SkinManager | null = null;
    let isStarting = true;
    const publishRendererState = (state: TutorialPreviewRendererState) => {
      rendererStateRef.current = state;
      rendererStateListenerRef.current?.(state);
    };
    const disposeResources = () => {
      disposeTutorialPreviewRenderer(renderer);
      skinManager?.dispose();
      skinManager = null;
    };

    const start = async () => {
      try {
        const [{ GameRenderer }, { SkinManager }] = await Promise.all([
          import('../../renderer'),
          import('../../skin'),
        ]);
        if (disposed) return;

        const nextSkinManager = new SkinManager();
        skinManager = nextSkinManager;
        await nextSkinManager.loadSkin(rendererOptions.skinManifest ?? rendererOptions.skinId);
        if (disposed) {
          nextSkinManager.dispose();
          if (skinManager === nextSkinManager) skinManager = null;
          return;
        }

        renderer = new GameRenderer({
          canvas,
          width: PREVIEW_RENDER_WIDTH,
          height: PREVIEW_RENDER_HEIGHT,
          resolution: Math.min(window.devicePixelRatio || 1, 2),
          skinManager: nextSkinManager,
          showGearFrame: false,
          showFlightBackground: false,
          showComboAndAccuracy: false,
          showLaneKeyLabels: true,
          judgmentLineOffset: PREVIEW_JUDGMENT_LINE_OFFSET,
          keyboardAreaHeight: rendererOptions.keyboardAreaHeight,
          // 키캡 배치는 프리셋 레이아웃으로 한 번만 만든다. 차트별 라벨·매핑은 차트 effect가 교체한다.
          tutorialKeyboard: {
            widthUnits: rendererOptions.keyboardLayout.widthUnits,
            heightUnits: rendererOptions.keyboardLayout.heightUnits,
            keys: rendererOptions.tutorialKeyboardKeys,
          },
        });
        await renderer.init();
        if (disposed || !renderer) {
          // 초기화 도중 닫힌 슬롯은 WebGL 준비가 끝난 뒤 리소스를 정리한다.
          disposeTutorialPreviewRenderer(renderer);
          nextSkinManager.dispose();
          if (skinManager === nextSkinManager) skinManager = null;
          return;
        }

        renderer.scrollSpeed = 520;
        renderer.updateAccuracy(100);
        publishRendererState({ status: 'ready', renderer });
      } catch (err) {
        disposeResources();
        if (!disposed) {
          setRendererError(err instanceof Error ? err.message : 'Failed to load tutorial preview');
          publishRendererState({ status: 'failed' });
        }
      } finally {
        isStarting = false;
        if (disposed) disposeResources();
      }
    };

    void start();

    return () => {
      disposed = true;
      // 차트 effect가 먼저 렌더 루프를 멈추고 렌더러에서 떨어지게 한 뒤 정리한다.
      publishRendererState({ status: 'loading' });
      // init() still reads the skin while building its scene. Let it settle
      // before releasing textures or destroying the application.
      if (!isStarting) disposeResources();
    };
    // rendererKey가 스킨·프리셋을 대표한다. 나머지 생성 옵션은 rendererOptionsRef로 최신 값을 읽는다.
  }, [rendererKey]);

  // 차트 수명 — 레슨을 넘기거나(preview) 같은 레슨을 다시 방문하면(previewInstanceId) 같은 렌더러에 새 차트를 걸고
  // 판정 세션·시계·도식 상태를 처음부터 다시 시작한다. 정리할 때는 렌더 루프만 멈추고 렌더러는 그대로 둔다.
  useEffect(() => {
    readyNotifiedRef.current = false;
    setActiveKeyIds([]);
    setStickyLaneKeyIdsByLane({});
    setActiveDiagramTiming(null);
    setDiagramDisplay(null);
    setContentError(null);
    setRendererReady(false);

    let disposed = false;
    let animationFrameId: number | null = null;
    let attachedRenderer: GameRenderer | null = null;
    let previousKeyHash = '';
    let previousDiagramHash = '';
    let previousNow = performance.now();
    let previousLoopTime = 0;
    let loopStartNow = previousNow;
    let pausedAtNow: number | null = null;
    let activeDiagramPause: TutorialDiagramPause | null = null;
    let activeRenderCycle = getTutorialRenderCycleIndex(preview.renderStartMs, preview.loopMs);

    const notifyReady = () => {
      if (!readyNotifiedRef.current) {
        readyNotifiedRef.current = true;
        callTutorialPreviewReady(onReadyRef.current);
      }
    };

    const setRendererInputState = (
      currentRenderer: GameRenderer,
      activeTimings: readonly TutorialInputTiming[],
    ) => {
      const activeIds = activeTimings.map(({ event }) => getTutorialInputStateKey(event));
      const activeIdSet = new Set(activeIds);
      const activeLaneSet = new Set(activeTimings.map(({ event }) => event.lane));

      for (const lane of PREVIEW_LANES) {
        currentRenderer.setKeyBeam(lane, activeLaneSet.has(lane));
      }

      const nextHash = activeIds.slice().sort().join('|');
      if (nextHash !== previousKeyHash) {
        previousKeyHash = nextHash;
        setActiveKeyIds(activeIds);
        if (activeIds.length > 0) {
          setStickyLaneKeyIdsByLane((previous) => {
            const next = { ...previous };
            let changed = false;
            const activeIdsByLane = new Map<number, string[]>();

            for (const { event } of activeTimings) {
              const laneActiveIds = activeIdsByLane.get(event.lane) ?? [];
              laneActiveIds.push(getTutorialInputStateKey(event));
              activeIdsByLane.set(event.lane, laneActiveIds);
            }

            for (const [lane, laneActiveIds] of activeIdsByLane) {
              if ((previous[lane] ?? []).join('|') !== laneActiveIds.join('|')) {
                next[lane] = laneActiveIds;
                changed = true;
              }
            }

            return changed ? next : previous;
          });
        }
      }

      for (const key of keys) {
        currentRenderer.setKeyState(key.keyCode, activeIdSet.has(key.id));
      }
    };

    const setActiveDiagramTimingIfChanged = (active: TutorialDiagramTiming | null) => {
      const nextHash = getTutorialDiagramTimingKey(active);
      if (nextHash !== previousDiagramHash) {
        previousDiagramHash = nextHash;
        setActiveDiagramTiming(active);
      }
    };

    dismissDiagramRef.current = () => {
      activeDiagramPause = null;
      setActiveDiagramTimingIfChanged(null);
      setDiagramDisplay(null);
    };

    const resolveDiagramPauseTime = (loopTimeMs: number): number => {
      if (!diagramModalEnabledRef.current) {
        activeDiagramPause = null;
        setActiveDiagramTimingIfChanged(null);
        return loopTimeMs;
      }

      if (activeDiagramPause) {
        return activeDiagramPause.timing.startMs;
      }

      const active = getActiveTutorialDiagramTiming(loopTimeMs, diagramTimings);
      if (active) {
        activeDiagramPause = { timing: active };
        setActiveDiagramTimingIfChanged(active);
        return active.startMs;
      }

      setActiveDiagramTimingIfChanged(null);
      return loopTimeMs;
    };

    resumeDiagramRef.current = () => {
      if (!activeDiagramPause) return;

      const resumeNow = performance.now();
      loopStartNow = resumeNow - activeDiagramPause.timing.endMs;
      previousNow = resumeNow;
      // 멈춘(paused) 상태에서 재개하면 멈춘 시각을 지금으로 옮겨, 나중에 일시정지가 풀릴 때 도식 끝 시점에서 그대로 잇는다.
      if (pausedAtNow !== null) pausedAtNow = resumeNow;
      activeDiagramPause = null;
      setActiveDiagramTimingIfChanged(null);
    };

    resolveDiagramPauseTime(0);
    if (activeDiagramPause) {
      notifyReady();
    }

    const detachRenderer = () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      if (attachedRenderer && rendererRef.current === attachedRenderer) rendererRef.current = null;
      attachedRenderer = null;
    };

    const attachRenderer = (renderer: GameRenderer) => {
      detachRenderer();
      try {
        // 이전 차트가 남긴 봄·판정 텍스트·키 눌림을 지운 뒤 이 차트를 건다.
        renderer.resetTransientState();
        // 렌더러는 renderChart의 시간 뷰를 쓴다. 판정 컨트롤러는 preview.chart로
        // 별개 인스턴스를 만든다 — 두 차트는 서로 다르므로 합치지 않는다.
        const renderTiming = createChartTiming(preview.renderChart);
        renderer.setChart(
          preview.renderChart.notes,
          preview.renderChart.trillZones,
          preview.renderChart.restZones ?? [],
          preview.renderChart.events,
          renderTiming,
          preview.renderDurationMs,
        );
        renderer.updateTutorialKeyboardKeys(tutorialKeyboardKeys);
        // 첫 프레임부터 이 차트의 시작 키 라벨을 그린다. 이후 갱신은 레인 키 라벨 effect가 맡는다.
        renderer.setLaneKeyLabels(getLaneKeyLabels(keys, [], {}).map(({ lane, label }) => ({ lane, label })), true);
        const sourceNoteCount = preview.chart.notes.length;
        const previewPort: SessionRendererPort = {
          showJudgment: (grade, deltaMs) => renderer.showJudgment(grade, deltaMs),
          recordFlightJudgment: grade => renderer.recordFlightJudgment(grade),
          showBombEffect: lane => {
            onBombEffectRef.current?.(lane, getTutorialBombPosition(lane, keyboardAreaHeight));
            if (showRendererBombRef.current) renderer.showBombEffect(lane);
          },
          updateCombo: () => {},
          updateAccuracy: () => {},
          setJudgmentBodyStateQuery: query => {
            renderer.setJudgmentBodyStateQuery(query
              ? (renderNoteIndex, at) => mapTutorialRenderBodyQuery(
                query,
                sourceNoteCount,
                preview.loopMs,
                activeRenderCycle,
                renderNoteIndex,
                at,
              )
              : null);
          },
          applyNoteDisplayEffect: (noteIndex, effect) => {
            renderer.applyNoteDisplayEffect(activeRenderCycle * sourceNoteCount + noteIndex, effect);
          },
        };
        const adapterRef: { current?: SessionRendererAdapter } = {};
        const controller = createTutorialPreviewSessionController(preview.chart, timings, {
          onBatchConfirmed: view => adapterRef.current?.apply(view),
        });
        const sessionAdapter = new SessionRendererAdapter({
          notes: preview.chart.notes,
          connections: controller.session.connections,
          bodyStates: () => controller.session.bodyStates,
          scoreAccuracy: () => controller.session.score.getState().achievementRate,
          port: previewPort,
        });
        adapterRef.current = sessionAdapter;
        setRendererInputState(renderer, getActiveTutorialInputTimings(0, timings));
        controller.advanceTo(0);
        renderer.renderFrame(preview.renderStartMs, 0);
        // 시계는 첫 프레임을 그린 지금을 루프 시간 0으로 삼는다. 멈춘 슬롯은 렌더 루프가 이 시각을 멈춘 시각으로 기록해,
        // 재생이 풀리는 순간 루프 시간 0부터 시작한다.
        previousNow = performance.now();
        loopStartNow = previousNow;
        pausedAtNow = null;
        previousLoopTime = 0;
        activeRenderCycle = getTutorialRenderCycleIndex(preview.renderStartMs, preview.loopMs);
        attachedRenderer = renderer;
        rendererRef.current = renderer;
        notifyReady();
        setRendererReady(true);

        const renderLoop = (now: number) => {
          if (disposed || attachedRenderer !== renderer) return;
          const clock = stepTutorialLoopClock({ loopStartNow, pausedAtNow, previousNow }, now, pausedRef.current);
          ({ loopStartNow, pausedAtNow, previousNow } = clock.next);
          if (clock.frozen) {
            // 일시정지 중에는 판정·렌더를 진행하지 않고 마지막 장면을 유지한다.
            animationFrameId = requestAnimationFrame(renderLoop);
            return;
          }

          const deltaMs = Math.min(48, now - previousNow);
          previousNow = now;
          // rAF 타임스탬프는 프레임 시작 시각이라 첫 프레임 직후 잰 loopStartNow보다 앞설 수 있다. 음수면 루프 경계로 오인하므로 0으로 막는다.
          let loopTimeMs = Math.max(0, now - loopStartNow) % preview.loopMs;
          loopTimeMs = resolveDiagramPauseTime(loopTimeMs);
          activeRenderCycle = getTutorialRenderCycleIndex(preview.renderStartMs + loopTimeMs, preview.loopMs);
          const renderTimeMs = preview.renderStartMs + loopTimeMs;
          const activeTimings = getActiveTutorialInputTimings(loopTimeMs, timings);

          if (loopTimeMs < previousLoopTime) {
            // Flush the tail action at the exact loop boundary before creating
            // the next session; otherwise an up at loopMs is lost to reset.
            controller.advanceTo(preview.loopMs);
            sessionAdapter.reset();
            // setChart clears GameNoteRenderer's per-note display caches as well
            // as rebuilding the repeated render-cycle index mapping.
            renderer.setChart(
              preview.renderChart.notes,
              preview.renderChart.trillZones,
              preview.renderChart.restZones ?? [],
              preview.renderChart.events,
              createChartTiming(preview.renderChart),
              preview.renderDurationMs,
            );
          }
          controller.advanceTo(loopTimeMs);
          previousLoopTime = loopTimeMs;
          setRendererInputState(renderer, activeTimings);
          renderer.renderFrame(renderTimeMs, deltaMs);
          animationFrameId = requestAnimationFrame(renderLoop);
        };

        animationFrameId = requestAnimationFrame(renderLoop);
      } catch (err) {
        detachRenderer();
        setContentError(err instanceof Error ? err.message : 'Failed to load tutorial preview');
        notifyReady();
        setRendererReady(true);
      }
    };

    const handleRendererState = (state: TutorialPreviewRendererState) => {
      if (state.status === 'ready') {
        attachRenderer(state.renderer);
        return;
      }

      detachRenderer();
      if (state.status === 'failed') {
        // 렌더러가 실패해도 스피너가 무한 대기하지 않도록 준비 완료로 처리해 OK를 노출한다.
        notifyReady();
        setRendererReady(true);
      } else {
        // 렌더러를 다시 만드는 동안에는 OK 대신 스피너를 보인다.
        setRendererReady(false);
      }
    };

    rendererStateListenerRef.current = handleRendererState;
    handleRendererState(rendererStateRef.current);

    return () => {
      disposed = true;
      if (rendererStateListenerRef.current === handleRendererState) {
        rendererStateListenerRef.current = null;
      }
      resumeDiagramRef.current = null;
      dismissDiagramRef.current = null;
      detachRenderer();
    };
    // previewInstanceId는 본문에서 읽지 않지만, 같은 레슨을 다시 방문했을 때 차트를 처음부터 다시 걸기 위한 의존성이다.
  }, [diagramTimings, keyboardAreaHeight, keys, preview, previewInstanceId, timings, tutorialKeyboardKeys]);

  // 레인 키 라벨은 렌더러(캔버스)가 그린다 — 텍스트·표시 여부만 push.
  // 눌림 상태는 렌더 루프의 setKeyBeam이 이미 처리한다.
  useEffect(() => {
    rendererRef.current?.setLaneKeyLabels(
      laneKeyLabels.map(({ lane, label }) => ({ lane, label })),
      !diagramDisplay,
    );
  }, [laneKeyLabels, diagramDisplay, rendererReady]);

  return (
    <div style={styles.previewShell} data-tutorial-skin-id={skinManifest?.theme.id ?? skinId}>
      <div style={{ ...styles.canvasFrame, aspectRatio: `${PREVIEW_RENDER_WIDTH} / ${PREVIEW_RENDER_HEIGHT + keyboardAreaHeight}` }}>
        <canvas
          key={rendererKey}
          ref={canvasRef}
          className="not4k-tutorial-preview-canvas"
          data-tutorial-preview-canvas="true"
          aria-label="Tutorial chart preview"
          // 에러일 때 canvas를 숨겨 에러 메시지가 WebGL canvas 합성 레이어에 가려지지 않게 한다.
          style={{ ...styles.canvas, visibility: error ? 'hidden' : 'visible' }}
        />
        {error && (
          <div role="alert" data-tutorial-preview-error="true" style={styles.errorText}>
            {error}
          </div>
        )}
      </div>
      {bindingNotice && (
        <p data-tutorial-binding-notice="true" style={styles.bindingNotice}>{bindingNotice}</p>
      )}
      <style>{tutorialPreviewPlayerCss}</style>
      {diagramDisplay && typeof document !== 'undefined' && createPortal(
        <div
          className="not4k-tutorial-diagram-overlay"
          data-tutorial-diagram-modal="true"
          data-tutorial-diagram-phase={diagramDisplay.phase}
          style={styles.diagramOverlay}
        >
          <div
            className="not4k-tutorial-diagram-panel"
            style={styles.diagramPanel}
          >
            <TutorialPatternDiagram diagramId={diagramDisplay.diagramId} />
            {rendererReady ? (
              <button
                type="button"
                data-tutorial-diagram-ok="true"
                style={styles.diagramOkButton}
                onClick={handleDiagramOk}
              >
                OK
              </button>
            ) : (
              <div
                data-tutorial-diagram-loading="true"
                style={styles.diagramLoading}
                role="status"
                aria-label="Loading preview"
              >
                <span className="not4k-tutorial-diagram-spinner" />
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

function callTutorialPreviewReady(onReady?: () => void): void {
  onReady?.();
}

function disposeTutorialPreviewRenderer(renderer: GameRenderer | null): void {
  if (!renderer) return;

  try {
    renderer.dispose();
  } catch (err) {
    console.warn('TutorialPreviewPlayer: renderer dispose failed', err);
  }
}

function getTutorialDiagramTimingKey(timing: TutorialDiagramTiming | null): string {
  return timing ? `${timing.event.diagramId}:${timing.startMs}:${timing.endMs}` : '';
}

const tutorialPreviewPlayerCss = `
/* Pixi가 캔버스에 inline touch-action:none을 걸어 렌더러 위 드래그가 스크롤을 먹는다.
   렌더러는 인터랙션이 없으니 세로 드래그가 바깥 컨테이너 스크롤로 통과되게 pan-y로 덮는다.
   (스타일시트 !important가 Pixi의 non-important inline보다 우선한다) */
.not4k-tutorial-preview-canvas {
  touch-action: pan-y !important;
}

.not4k-tutorial-diagram-overlay {
  contain: layout paint;
  will-change: opacity;
}

.not4k-tutorial-diagram-panel {
  will-change: transform, opacity, filter;
}

.not4k-tutorial-diagram-spinner {
  display: block;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 5px solid rgba(157, 238, 244, 0.28);
  border-top-color: #9deef4;
  box-shadow: 0 0 12px rgba(77, 220, 236, 0.55);
  animation: not4k-tutorial-diagram-spin 0.8s linear infinite;
}

@keyframes not4k-tutorial-diagram-spin {
  to {
    transform: rotate(360deg);
  }
}

.not4k-tutorial-diagram-overlay[data-tutorial-diagram-phase="enter"] {
  animation: not4k-tutorial-diagram-scrim-enter ${TUTORIAL_DIAGRAM_ENTER_MS}ms ease both;
}

.not4k-tutorial-diagram-overlay[data-tutorial-diagram-phase="enter"] .not4k-tutorial-diagram-panel {
  animation: not4k-tutorial-diagram-enter ${TUTORIAL_DIAGRAM_ENTER_MS}ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.not4k-tutorial-diagram-overlay[data-tutorial-diagram-phase="visible"] {
  opacity: 1;
}

.not4k-tutorial-diagram-overlay[data-tutorial-diagram-phase="visible"] .not4k-tutorial-diagram-panel {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.not4k-tutorial-diagram-overlay[data-tutorial-diagram-phase="exit"] {
  animation: not4k-tutorial-diagram-scrim-exit ${TUTORIAL_DIAGRAM_EXIT_MS}ms ease both;
}

.not4k-tutorial-diagram-overlay[data-tutorial-diagram-phase="exit"] .not4k-tutorial-diagram-panel {
  animation: not4k-tutorial-diagram-exit ${TUTORIAL_DIAGRAM_EXIT_MS}ms cubic-bezier(0.25, 1, 0.5, 1) both;
}

@keyframes not4k-tutorial-diagram-scrim-enter {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes not4k-tutorial-diagram-enter {
  from {
    opacity: 0;
    filter: blur(8px);
    transform: translateY(12px) scale(0.96);
  }
  to {
    opacity: 1;
    filter: blur(0);
    transform: translateY(0) scale(1);
  }
}

@keyframes not4k-tutorial-diagram-scrim-exit {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}

@keyframes not4k-tutorial-diagram-exit {
  from {
    opacity: 1;
    filter: blur(0);
    transform: translateY(0) scale(1);
  }
  to {
    opacity: 0;
    filter: blur(6px);
    transform: translateY(-8px) scale(0.985);
  }
}

@media (prefers-reduced-motion: reduce) {
  .not4k-tutorial-diagram-overlay,
  .not4k-tutorial-diagram-panel {
    animation-duration: 1ms !important;
    transition-duration: 1ms !important;
  }
  .not4k-tutorial-diagram-spinner {
    animation: none !important;
  }
}
`;

const styles: Record<string, CSSProperties> = {
  previewShell: {
    position: 'relative',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
  },
  canvasFrame: {
    position: 'relative',
    width: 'min(100%, 420px)',
    // 렌더러(플레이+키보드)가 항상 보이도록 최소 폭 확보 — aspect-lock이라 최소 폭이 최소 높이가 된다.
    // min(100%, ...)로 캡해 화면이 300px보다 좁아도 가로로 넘치지 않는다.
    minWidth: 'min(100%, 300px)',
    overflow: 'hidden',
    borderRadius: radius.sm,
    border: `1px solid ${color.line}`,
    backgroundColor: '#05060a',
  },
  canvas: {
    display: 'block',
    width: '100%',
    height: '100%',
  },
  diagramOverlay: {
    // 뷰포트 전체를 덮는 확인 모달 — 프리뷰 카드가 짧은 모바일에서 화면 밖으로 밀려도
    // 도식·OK가 항상 화면 중앙에 보이도록 position:fixed로 카드 경계를 벗어난다.
    position: 'fixed',
    inset: 0,
    padding: 'clamp(8px, 4%, 16px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    backdropFilter: 'blur(2px)',
    boxSizing: 'border-box',
    pointerEvents: 'auto',
    // 튜토리얼 팝업 오버레이(zIndex 2200)보다 위에 떠야 도식·OK가 가려지지 않는다.
    zIndex: 2400,
    overflow: 'hidden',
  },
  diagramPanel: {
    width: 'min(100%, 440px)',
    // 카드 높이를 넘지 않게 가두고, 안에서 도식(flex:1)만 줄어들며 OK 버튼(flex:0)은 항상 보인다.
    maxHeight: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 'clamp(8px, 2.5%, 12px)',
    padding: 'clamp(10px, 3%, 14px)',
    boxSizing: 'border-box',
    borderRadius: radius.md,
    background: surface.panel,
    border: `1px solid ${color.line}`,
    boxShadow: '0 18px 48px rgba(0, 0, 0, 0.45)',
    overflow: 'hidden',
  },
  diagramOkButton: {
    // 도식이 아무리 줄어도 버튼은 줄지 않고 항상 노출된다.
    ...primitives.neonButton,
    flex: '0 0 auto',
    minWidth: '88px',
    minHeight: '34px',
    padding: '0 18px',
    fontSize: 'clamp(12px, 3.5vw, 14px)',
    fontWeight: 800,
    lineHeight: 1,
  },
  diagramLoading: {
    // OK 버튼과 같은 높이를 차지해 로딩→OK 전환 시 레이아웃이 튀지 않게 한다.
    flex: '0 0 auto',
    minHeight: '34px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
    color: color.danger,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    fontSize: '12px',
    textAlign: 'center',
  },
};

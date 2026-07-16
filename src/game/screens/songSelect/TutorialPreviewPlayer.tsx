import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { GameRenderer } from '../../renderer';
import { LANE_AREA_WIDTH, TUTORIAL_KB_SIDE_PAD, TUTORIAL_KB_VPAD } from '../../renderer/constants';
import { decideJudgmentEffects } from '../../judgment/judgmentEffects';
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
  resolveTutorialInputTimingsForKeyboard,
  sortLaneKeysForLabel,
  type TutorialKeyboardLayout,
} from './tutorialKeyboardLayout';
import { createTutorialPreviewJudgmentController } from './tutorialPreviewJudgment';
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

const PREVIEW_LANES = [1, 2, 3, 4] as const;
const PREVIEW_RENDER_WIDTH = LANE_AREA_WIDTH;
const PREVIEW_RENDER_HEIGHT = 360;
const PREVIEW_JUDGMENT_LINE_OFFSET = 80;
const TUTORIAL_DIAGRAM_ENTER_MS = 260;
const TUTORIAL_DIAGRAM_EXIT_MS = 180;

interface TutorialPreviewPlayerProps {
  preview?: TutorialPreviewDefinition;
  onReady?: () => void;
  diagramModalEnabled?: boolean;
  diagramModalVisible?: boolean;
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
  onReady,
  diagramModalEnabled = true,
  diagramModalVisible = true,
}: TutorialPreviewPlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<GameRenderer | null>(null);
  const readyNotifiedRef = useRef(false);
  const onReadyRef = useRef(onReady);
  const resumeDiagramRef = useRef<(() => void) | null>(null);
  const dismissDiagramRef = useRef<(() => void) | null>(null);
  const diagramModalEnabledRef = useRef(diagramModalEnabled);
  const settings = useGameStore((state) => state.settings);
  const [activeKeyIds, setActiveKeyIds] = useState<string[]>([]);
  const [stickyLaneKeyIdsByLane, setStickyLaneKeyIdsByLane] = useState<LaneKeyIdsByLane>({});
  const [activeDiagramTiming, setActiveDiagramTiming] = useState<TutorialDiagramTiming | null>(null);
  const [diagramDisplay, setDiagramDisplay] = useState<TutorialDiagramDisplay | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 구동기(렌더러)가 첫 프레임까지 준비됐는지. 준비 전에는 도식 모달에서 OK 대신 스피너를 보여
  // 로딩 중 상호작용(OK로 재개)을 막는다.
  const [rendererReady, setRendererReady] = useState(false);
  const baseTimings = useMemo(() => getTutorialInputTimings(preview.chart), [preview]);
  const diagramTimings = useMemo(() => getTutorialDiagramTimings(preview.chart), [preview]);
  const timings = useMemo(
    () => resolveTutorialInputTimingsForKeyboard(baseTimings, settings.keyBindings),
    [baseTimings, settings.keyBindings],
  );
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
  const handleDiagramOk = () => {
    resumeDiagramRef.current?.();
  };

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

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
    const canvas = canvasRef.current;
    if (!canvas) return;

    readyNotifiedRef.current = false;
    setActiveKeyIds([]);
    setStickyLaneKeyIdsByLane({});
    setActiveDiagramTiming(null);
    setDiagramDisplay(null);
    setError(null);
    setRendererReady(false);

    let disposed = false;
    let animationFrameId: number | null = null;
    let renderer: GameRenderer | null = null;
    let previousKeyHash = '';
    let previousDiagramHash = '';
    let previousNow = performance.now();
    let loopStartNow = previousNow;
    let activeDiagramPause: TutorialDiagramPause | null = null;

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
      activeDiagramPause = null;
      setActiveDiagramTimingIfChanged(null);
    };

    resolveDiagramPauseTime(0);
    if (activeDiagramPause) {
      notifyReady();
    }

    const start = async () => {
      try {
        const [{ GameRenderer }, { SkinManager }] = await Promise.all([
          import('../../renderer'),
          import('../../skin'),
        ]);
        if (disposed) return;

        const skinManager = new SkinManager();
        await skinManager.loadSkin('crystal');
        if (disposed) {
          skinManager.dispose();
          return;
        }

        renderer = new GameRenderer({
          canvas,
          width: PREVIEW_RENDER_WIDTH,
          height: PREVIEW_RENDER_HEIGHT,
          resolution: Math.min(window.devicePixelRatio || 1, 2),
          skinManager,
          showGearFrame: false,
          showPerspectiveSurface: false,
          showComboAndAccuracy: false,
          showLaneKeyLabels: true,
          judgmentLineOffset: PREVIEW_JUDGMENT_LINE_OFFSET,
          keyboardAreaHeight,
          tutorialKeyboard: {
            widthUnits: keyboardLayout.widthUnits,
            heightUnits: keyboardLayout.heightUnits,
            keys: tutorialKeyboardKeys,
          },
        });
        await renderer.init();
        if (disposed || !renderer) {
          // init()이 끝나기 전에 언마운트되면 cleanup의 dispose()가 아직 initialized=false라
          // no-op으로 지나간다. 여기서 이미 초기화된 renderer(WebGL 컨텍스트)를 직접 정리하지 않으면
          // PIXI Application이 orphan으로 남아 누수된다. dispose()는 idempotent라 이중 호출도 안전하다.
          disposeTutorialPreviewRenderer(renderer);
          skinManager.dispose();
          return;
        }

        renderer.setChart(
          preview.renderChart.notes,
          preview.renderChart.trillZones,
          preview.renderChart.restZones ?? [],
          preview.renderChart.events,
          preview.renderChart.meta.offsetMs,
          preview.renderDurationMs,
        );
        renderer.scrollSpeed = 520;
        renderer.updateAccuracy(100);
        const judgmentController = createTutorialPreviewJudgmentController(
          preview.chart,
          timings,
          {
            onJudgment: (result) => {
              if (!renderer) return;
              const note = preview.chart.notes[result.noteIndex];
              if (!note) return;

              // 판정 효과의 부분 적용 — 루프 재생 프리뷰라 점수·노트 표시 상태·디버그는 쓰지 않는다.
              const effects = decideJudgmentEffects(result, note);
              renderer.showJudgment(effects.judgmentText.grade, effects.judgmentText.deltaMs);
              if (effects.bomb !== null) {
                renderer.showBombEffect(effects.bomb);
              }
            },
            onComboUpdate: () => {},
          },
        );
        setRendererInputState(renderer, getActiveTutorialInputTimings(0, timings));
        judgmentController.advanceTo(0);
        renderer.renderFrame(preview.renderStartMs, 0);
        previousNow = performance.now();
        loopStartNow = previousNow;
        rendererRef.current = renderer;
        notifyReady();
        setRendererReady(true);

        const renderLoop = (now: number) => {
          if (disposed || !renderer) return;

          const deltaMs = Math.min(48, now - previousNow);
          previousNow = now;
          let loopTimeMs = (now - loopStartNow) % preview.loopMs;
          loopTimeMs = resolveDiagramPauseTime(loopTimeMs);
          const renderTimeMs = preview.renderStartMs + loopTimeMs;
          const activeTimings = getActiveTutorialInputTimings(loopTimeMs, timings);

          judgmentController.advanceTo(loopTimeMs);
          setRendererInputState(renderer, activeTimings);
          renderer.renderFrame(renderTimeMs, deltaMs);
          animationFrameId = requestAnimationFrame(renderLoop);
        };

        animationFrameId = requestAnimationFrame(renderLoop);
      } catch (err) {
        if (!disposed) {
          setError(err instanceof Error ? err.message : 'Failed to load tutorial preview');
          notifyReady();
          // 렌더러가 실패해도 스피너가 무한 대기하지 않도록 준비 완료로 처리해 OK를 노출한다.
          setRendererReady(true);
        }
      }
    };

    void start();

    return () => {
      disposed = true;
      resumeDiagramRef.current = null;
      dismissDiagramRef.current = null;
      rendererRef.current = null;
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
      disposeTutorialPreviewRenderer(renderer);
    };
  }, [diagramTimings, keyboardAreaHeight, keyboardLayout, keys, preview, timings, tutorialKeyboardKeys]);

  // 레인 키 라벨은 렌더러(캔버스)가 그린다 — 텍스트·표시 여부만 push.
  // 눌림 상태는 렌더 루프의 setKeyBeam이 이미 처리한다.
  useEffect(() => {
    rendererRef.current?.setLaneKeyLabels(
      laneKeyLabels.map(({ lane, label }) => ({ lane, label })),
      !diagramDisplay,
    );
  }, [laneKeyLabels, diagramDisplay, rendererReady]);

  return (
    <div style={styles.previewShell}>
      <div style={{ ...styles.canvasFrame, aspectRatio: `${PREVIEW_RENDER_WIDTH} / ${PREVIEW_RENDER_HEIGHT + keyboardAreaHeight}` }}>
        <canvas
          ref={canvasRef}
          className="not4k-tutorial-preview-canvas"
          data-tutorial-preview-canvas="true"
          aria-label="Tutorial chart preview"
          // 에러일 때 canvas를 숨겨 에러 메시지가 WebGL canvas 합성 레이어에 가려지지 않게 한다.
          style={{ ...styles.canvas, visibility: error ? 'hidden' : 'visible' }}
        />
        {error && <div style={styles.errorText}>{error}</div>}
      </div>
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
    borderRadius: '6px',
    border: '1px solid rgba(255, 255, 255, 0.14)',
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
    borderRadius: '8px',
    backgroundColor: 'rgba(9, 12, 14, 0.94)',
    boxShadow: '0 18px 48px rgba(0, 0, 0, 0.45)',
    overflow: 'hidden',
  },
  diagramOkButton: {
    // 도식이 아무리 줄어도 버튼은 줄지 않고 항상 노출된다.
    flex: '0 0 auto',
    minWidth: '88px',
    minHeight: '34px',
    padding: '0 18px',
    color: '#081114',
    backgroundColor: '#9deef4',
    border: '1px solid #c2fbff',
    borderRadius: '5px',
    cursor: 'pointer',
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
    color: '#ffb8b8',
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    fontSize: '12px',
    textAlign: 'center',
  },
};

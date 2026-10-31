import { getTutorialBombPosition } from "./TutorialPreviewPlayer";
import { describe, expect, it } from 'vitest';
import tutorialInputSource from './explicitTutorialInput.ts?raw';
import tutorialPreviewPlayerSource from './TutorialPreviewPlayer.tsx?raw';
import {
  buildTutorialKeyboardKeys,
  getDirectTutorialKeys,
  getLaneKeyLabels,
  uniqueTutorialKeys,
  type TutorialKeyView,
} from './TutorialPreviewPlayer';
import { TUTORIAL_PREVIEWS, getTutorialInputTimings } from './tutorialPreviewChart';
import {
  getTutorialKeyboardLayout,
  resolveTutorialInputTimingsForKeyboard,
} from './tutorialKeyboardLayout';

// gameStore 기본 TKL_BINDINGS와 같은 값 — 컴포넌트가 settings.keyBindings로 resolve하는 경로 재현
const TKL_TEST_BINDINGS = {
  lane1: ['KeyQ', 'KeyW', 'KeyS', 'KeyX'],
  lane2: ['KeyE', 'KeyD', 'KeyC', 'KeyO'],
  lane3: ['KeyP', 'KeyL', 'Comma', 'KeyR'],
  lane4: ['BracketLeft', 'BracketRight', 'Semicolon', 'Period'],
};

function buildHandPlacementKeyboardFixture() {
  const layout = getTutorialKeyboardLayout('tkl');
  const timings = resolveTutorialInputTimingsForKeyboard(
    getTutorialInputTimings(TUTORIAL_PREVIEWS[0].chart),
    TKL_TEST_BINDINGS,
  );
  const keys = uniqueTutorialKeys(timings);
  const keyByCode = new Map<string, TutorialKeyView>(keys.map((key) => [key.keyCode, key]));
  return { layout, keyByCode, views: buildTutorialKeyboardKeys(layout, keyByCode) };
}

describe('TutorialPreviewPlayer', () => {
  it('곡 선택 튜토리얼 미니 재생기는 GameRenderer 기어와 원근 배경을 끈다', () => {
    expect(tutorialPreviewPlayerSource).toContain('showGear: false');
    expect(tutorialPreviewPlayerSource).toContain('showFlightBackground: false');
  });

  it('캔버스 HUD는 숨겨 팝업 실습의 DOM 콤보·조건과 중복하지 않고 판정선을 아래로 내린다', () => {
    expect(tutorialPreviewPlayerSource).toContain('showComboAndAccuracy: false');
    expect(tutorialPreviewPlayerSource).toContain('const PREVIEW_JUDGMENT_LINE_OFFSET = playfieldPx(80)');
    expect(tutorialPreviewPlayerSource).toContain('judgmentLineOffset: PREVIEW_JUDGMENT_LINE_OFFSET');
  });

  it('프리뷰 캔버스는 렌더 크기와 같은 aspectRatio를 사용해 찌그러지지 않음', () => {
    expect(tutorialPreviewPlayerSource).toContain('const PREVIEW_RENDER_WIDTH = LANE_AREA_WIDTH');
    expect(tutorialPreviewPlayerSource).toContain('const PREVIEW_RENDER_HEIGHT = playfieldPx(360)');
    expect(tutorialPreviewPlayerSource).toContain('width: PREVIEW_RENDER_WIDTH');
    expect(tutorialPreviewPlayerSource).toContain('height: PREVIEW_RENDER_HEIGHT');
    expect(tutorialPreviewPlayerSource).toContain('aspectRatio: `${PREVIEW_RENDER_WIDTH} / ${PREVIEW_RENDER_HEIGHT + keyboardAreaHeight}`');
  });

  it('키 입력 표시는 사용자가 선택한 프리셋 기반 키보드 스펙을 GameRenderer 생성 시 넘겨 캔버스 안에 그림', () => {
    expect(tutorialPreviewPlayerSource).toContain('useGameStore((state) => state.settings)');
    expect(tutorialPreviewPlayerSource).toContain('getTutorialKeyboardLayout(settings.preset)');
    expect(tutorialPreviewPlayerSource).toContain('resolveTutorialKeyboardBindings(baseTimings, settings.keyBindings, settings.preset)');
    expect(tutorialPreviewPlayerSource).toContain('resolveTutorialInputTimingsForKeyboard(baseTimings, bindingResolution.bindings)');
    expect(tutorialPreviewPlayerSource).toContain('keyboardAreaHeight: rendererOptions.keyboardAreaHeight,');
    expect(tutorialPreviewPlayerSource).toContain('tutorialKeyboard: {');
    expect(tutorialPreviewPlayerSource).toContain('buildTutorialKeyboardKeys(keyboardLayout, keyByCode)');
    expect(tutorialPreviewPlayerSource).not.toContain('data-keyboard-key');
    expect(tutorialPreviewPlayerSource).not.toContain('styles.keyboardKey');
  });

  it('buildTutorialKeyboardKeys는 hand-placement 프리뷰에서 매핑된 키 개수가 고유 튜토리얼 키 수와 일치', () => {
    const { layout, keyByCode, views } = buildHandPlacementKeyboardFixture();

    expect(views.length).toBe(layout.keys.length);
    expect(keyByCode.size).toBeGreaterThan(0);
    expect(views.filter((view) => view.mapped).length).toBe(keyByCode.size);
  });

  it('buildTutorialKeyboardKeys는 매핑된 키 label을 튜토리얼 키 label로 표시', () => {
    const { keyByCode, views } = buildHandPlacementKeyboardFixture();

    for (const view of views.filter((item) => item.mapped)) {
      expect(view.label).toBe(keyByCode.get(view.code)?.label);
    }
  });

  it('buildTutorialKeyboardKeys는 매핑 안 된 키를 mapped=false와 기본 keyDef.label로 유지', () => {
    const { layout, views } = buildHandPlacementKeyboardFixture();
    const labelByCode = new Map(layout.keys.map((keyDef) => [keyDef.code, keyDef.label]));
    const unmapped = views.filter((view) => !view.mapped);

    expect(unmapped.length).toBeGreaterThan(0);
    for (const view of unmapped) {
      expect(view.label).toBe(labelByCode.get(view.code));
    }
  });

  it('판정선 아래 레인 키 라벨은 HTML 오버레이 대신 GameRenderer가 캔버스 안에 그림', () => {
    expect(tutorialPreviewPlayerSource).not.toContain('keyLane');
    expect(tutorialPreviewPlayerSource).toContain('getLaneKeyLabels(keys, activeKeyIds, stickyLaneKeyIdsByLane)');
    expect(tutorialPreviewPlayerSource).toContain('sortLaneKeysForLabel');
    expect(tutorialPreviewPlayerSource).toContain('const fallbackKeys = getFallbackLaneKeys(laneKeys)');
    expect(tutorialPreviewPlayerSource).toContain('showLaneKeyLabels: true');
    expect(tutorialPreviewPlayerSource).toContain('rendererRef.current?.setLaneKeyLabels(');
    expect(tutorialPreviewPlayerSource).toContain('rendererRef.current = renderer');
    expect(tutorialPreviewPlayerSource).not.toContain('data-tutorial-lane-key');
  });

  it('판정선 아래 큰 키 라벨은 같은 레인의 여러 키 중 현재 눌린 키를 우선 표시하고 릴리즈 후에도 마지막 키를 유지', () => {
    expect(tutorialPreviewPlayerSource).toContain('activeKeyIds.map((id) => keys.find((key) => key.id === id))');
    expect(tutorialPreviewPlayerSource).toContain('stickyLaneKeyIdsByLane');
    expect(tutorialPreviewPlayerSource).toContain('setStickyLaneKeyIdsByLane');
    expect(tutorialPreviewPlayerSource).toContain('stickyLaneKeyIdsByLane[lane] ?? []');
    expect(tutorialPreviewPlayerSource).toContain('key.lane === lane');
    expect(tutorialPreviewPlayerSource).toContain('const displayKeys = activeKeys.length > 0 ? activeKeys : stickyKeys.length > 0 ? stickyKeys : fallbackKeys');
    expect(tutorialPreviewPlayerSource).toContain('[keys, activeKeyIds, stickyLaneKeyIdsByLane]');
  });

  it('더블 노트가 눌리면 판정선 아래 큰 키 하나에 두 키 라벨을 함께 표시', () => {
    expect(tutorialPreviewPlayerSource).toContain('const orderedDisplayKeys = orderLaneKeysForLabel(displayKeys)');
    expect(tutorialPreviewPlayerSource).toContain("label: orderedDisplayKeys.map((key) => key.label).join(' ')");
    expect(tutorialPreviewPlayerSource).toContain("keyCode: orderedDisplayKeys.map((key) => key.keyCode).join(' ')");
    expect(tutorialPreviewPlayerSource).not.toContain("].join(', ')");
  });

  it('더블 노트 튜토리얼은 노트를 치기 전 판정선 아래 시작 라벨에 QW·EC·71·89 조합을 차트 순서로 표시', () => {
    const preview = TUTORIAL_PREVIEWS.find((item) => item.id === 'double-note');
    if (!preview) {
      throw new Error('double-note 프리뷰가 없음');
    }

    const keys = uniqueTutorialKeys(getTutorialInputTimings(preview.chart));
    const laneLabels = getLaneKeyLabels(keys, [], {});
    const keyCodesByLane = Object.fromEntries(laneLabels.map((label) => [label.lane, label.keyCode]));
    const labelsByLane = Object.fromEntries(laneLabels.map((label) => [label.lane, label.label]));

    expect(keyCodesByLane).toMatchObject({
      1: 'KeyQ KeyW',
      2: 'KeyE KeyC',
      3: 'Numpad7 Numpad1',
      4: 'Numpad8 Numpad9',
    });
    expect(labelsByLane).toMatchObject({
      1: 'Q W',
      2: 'E C',
      3: '7 1',
      4: '8 9',
    });
  });

  it('판정선 아래 큰 키 눌림은 렌더 루프의 setKeyBeam이 렌더러 안에서 처리해 별도 HTML 활성 스타일이 없음', () => {
    expect(tutorialPreviewPlayerSource).toContain('currentRenderer.setKeyBeam(lane, activeLaneSet.has(lane))');
    expect(tutorialPreviewPlayerSource).not.toContain('const activeLaneSet = useMemo');
    expect(tutorialPreviewPlayerSource).not.toContain('laneKeyLabelActive');
  });

  it('레인 키 라벨 텍스트와 표시 여부는 effect가 렌더러 setLaneKeyLabels로 push', () => {
    expect(tutorialPreviewPlayerSource).toContain('laneKeyLabels.map(({ lane, label }) => ({ lane, label }))');
    expect(tutorialPreviewPlayerSource).toContain('!diagramDisplay && !directInput,');
    expect(tutorialPreviewPlayerSource).toContain('[laneKeyLabels, diagramDisplay, rendererReady, directInput]');
  });

  it('캔버스 프레임은 키보드까지 보이도록 최소 폭(→aspect로 최소 높이) 바닥을 가지되 화면이 좁으면 100%로 캡', () => {
    expect(tutorialPreviewPlayerSource).toContain("minWidth: 'min(100%, 300px)'");
  });

  it('렌더러 캔버스는 touch-action pan-y로 덮어 Pixi inline touch-action:none이 세로 드래그 스크롤을 먹지 않게 함', () => {
    expect(tutorialPreviewPlayerSource).toContain('.not4k-tutorial-preview-canvas {');
    expect(tutorialPreviewPlayerSource).toContain('touch-action: pan-y !important');
  });

  it('키보드 눌림 상태는 매 프레임 renderer.setKeyState로 전달되고 별도 HTML 활성 스타일이 없음', () => {
    expect(tutorialPreviewPlayerSource).toContain('currentRenderer.setKeyState(key.keyCode, activeIdSet.has(key.id))');
    expect(tutorialPreviewPlayerSource).not.toContain('keyboardKeyActive');
    expect(tutorialPreviewPlayerSource).not.toContain('activeKeySet');
  });

  it('4-slot 보충 매핑이 적용된 시연에는 실제 임시 키 배정을 안내한다', () => {
    expect(tutorialPreviewPlayerSource).toContain('data-tutorial-binding-notice="true"');
    expect(tutorialPreviewPlayerSource).toContain('옵션에서 레인별 키를 추가할 수 있습니다.');
  });

  it('튜토리얼 키 이벤트는 SessionRendererAdapter를 통해 판정 텍스트·bomb·노트 표시를 전달', () => {
    expect(tutorialPreviewPlayerSource).toContain('createTutorialPreviewSessionController');
    expect(tutorialPreviewPlayerSource).toContain('new SessionRendererAdapter');
    expect(tutorialPreviewPlayerSource).toContain('showJudgment:');
    expect(tutorialPreviewPlayerSource).toContain('showBombEffect:');
    expect(tutorialPreviewPlayerSource).toContain('applyNoteDisplayEffect:');
    expect(tutorialPreviewPlayerSource).not.toContain('createTutorialPreviewJudgmentController');
    expect(tutorialPreviewPlayerSource).not.toContain('decideJudgmentEffects');
    expect(tutorialPreviewPlayerSource).not.toContain('currentRenderer.showJudgment(JudgmentGrade.PERFECT, 0)');
  });

  it('루프 재생은 입력 시간과 렌더 시간을 분리해 시작과 끝의 노트 위치가 자연스럽게 이어짐', () => {
    expect(tutorialPreviewPlayerSource).toContain('preview.renderChart');
    expect(tutorialPreviewPlayerSource).toContain('preview.renderDurationMs');
    expect(tutorialPreviewPlayerSource).toContain('preview.renderStartMs');
    expect(tutorialPreviewPlayerSource).toContain('getExplicitTutorialInputTime(now, loopStartNow, preview.loopMs)');
    expect(tutorialPreviewPlayerSource).toContain('let loopTimeMs = screenTime.loopTimeMs');
    expect(tutorialPreviewPlayerSource).toContain('const renderTimeMs = preview.renderStartMs + loopTimeMs');
    expect(tutorialPreviewPlayerSource).toContain('getActiveTutorialInputTimings(loopTimeMs, timings)');
    expect(tutorialPreviewPlayerSource).toContain('renderer.renderFrame(renderTimeMs, deltaMs)');
  });

  it('선택된 튜토리얼 preview prop으로 차트와 키 입력 이벤트를 렌더링', () => {
    expect(tutorialPreviewPlayerSource).toContain('preview = TUTORIAL_PREVIEWS[0]');
    expect(tutorialPreviewPlayerSource).toContain('getTutorialInputTimings(preview.chart)');
  });

  it('튜토리얼 도식 이벤트는 프리뷰 캔버스 위에 렌더러 스타일 노트 에셋으로 표시', () => {
    expect(tutorialPreviewPlayerSource).toContain('getTutorialDiagramTimings(preview.chart)');
    expect(tutorialPreviewPlayerSource).toContain('getActiveTutorialDiagramTiming(loopTimeMs, diagramTimings)');
    expect(tutorialPreviewPlayerSource).toContain('<TutorialPatternDiagram');
    expect(tutorialPreviewPlayerSource).toContain('diagramDisplay.diagramId');
    expect(tutorialPreviewPlayerSource).toContain('styles.diagramOverlay');
  });

  it('튜토리얼 도식이 표시되는 동안에는 중앙 프리뷰 전체를 dim 하고 판정선 아래 키 라벨을 숨김', () => {
    expect(tutorialPreviewPlayerSource).toContain('data-tutorial-diagram-modal="true"');
    expect(tutorialPreviewPlayerSource).toContain('not4k-tutorial-diagram-panel');
    expect(tutorialPreviewPlayerSource).toContain('styles.diagramPanel');
    expect(tutorialPreviewPlayerSource).toContain('styles.diagramOkButton');
    expect(tutorialPreviewPlayerSource).toContain('inset: 0');
    expect(tutorialPreviewPlayerSource).toContain("backgroundColor: 'rgba(0, 0, 0, 0.72)'");
    expect(tutorialPreviewPlayerSource).toContain("pointerEvents: 'auto'");
    // 키 라벨 숨김은 setLaneKeyLabels의 visible 인자(!diagramDisplay)로 렌더러 레이어를 끈다.
    expect(tutorialPreviewPlayerSource).toContain('!diagramDisplay && !directInput,');
    expect(tutorialPreviewPlayerSource).not.toContain('canvasHiddenForDiagram');
  });

  it('튜토리얼 도식 확인 모달 패널은 어색한 별도 외곽선을 두지 않음', () => {
    expect(tutorialPreviewPlayerSource).toContain('diagramPanel:');
    expect(tutorialPreviewPlayerSource).not.toContain("border: '1px solid rgba(127, 219, 225, 0.34)'");
  });

  it('튜토리얼 도식은 OK를 누르기 전까지 loopTimeMs를 startMs에 고정하고 OK 후 endMs에서 재개', () => {
    expect(tutorialPreviewPlayerSource).toContain('resumeDiagramRef');
    expect(tutorialPreviewPlayerSource).toContain('activeDiagramPause');
    expect(tutorialPreviewPlayerSource).toContain('return activeDiagramPause.timing.startMs');
    expect(tutorialPreviewPlayerSource).toContain('loopStartNow = resumeNow - activeDiagramPause.timing.endMs');
    expect(tutorialPreviewPlayerSource).toContain('onClick={handleDiagramOk}');
    expect(tutorialPreviewPlayerSource).toContain('data-tutorial-diagram-ok="true"');
  });

  it('튜토리얼 도식 모달이 비활성 슬롯으로 넘어가면 pause와 display를 초기화', () => {
    expect(tutorialPreviewPlayerSource).toContain('diagramModalEnabled = true');
    expect(tutorialPreviewPlayerSource).toContain('diagramModalVisible = true');
    expect(tutorialPreviewPlayerSource).toContain('diagramModalEnabledRef');
    expect(tutorialPreviewPlayerSource).toContain('dismissDiagramRef');
    expect(tutorialPreviewPlayerSource).toContain('dismissDiagramRef.current?.();');
    expect(tutorialPreviewPlayerSource).toContain('if (!diagramModalEnabledRef.current) {');
    expect(tutorialPreviewPlayerSource).toContain('activeDiagramPause = null;');
  });

  it('튜토리얼 도식은 entering 슬롯에서 pause를 유지하되 active 슬롯이 될 때만 모달을 표시', () => {
    expect(tutorialPreviewPlayerSource).toContain('diagramModalVisible?: boolean');
    expect(tutorialPreviewPlayerSource).toContain('activeDiagramId && diagramModalVisible');
    expect(tutorialPreviewPlayerSource).toContain('[activeDiagramTiming, diagramModalVisible]');
    // 확인 모달은 diagramDisplay가 참일 때만, 뷰포트 기준으로 문서 최상위에 portal 렌더된다.
    expect(tutorialPreviewPlayerSource).toContain("{diagramDisplay && typeof document !== 'undefined' && createPortal(");
    expect(tutorialPreviewPlayerSource).toContain('document.body,');
  });

  it('튜토리얼 도식이 0ms에서 시작하면 렌더러 준비를 기다리기 전에 먼저 감지해 WebGL 실패 중에도 설명 모달을 표시', () => {
    const earlyDiagramNotify = [
      'resolveDiagramPauseTime(0);',
      '    if (activeDiagramPause) {',
      '      notifyReady();',
      '    }',
    ].join('\n');
    expect(tutorialPreviewPlayerSource).toContain(earlyDiagramNotify);
    expect(tutorialPreviewPlayerSource.indexOf(earlyDiagramNotify)).toBeLessThan(
      tutorialPreviewPlayerSource.indexOf('handleRendererState(rendererStateRef.current);'),
    );
  });

  it('튜토리얼 도식은 등장과 퇴장 phase를 유지해 부드럽게 전환', () => {
    expect(tutorialPreviewPlayerSource).toContain("type TutorialDiagramPhase = 'enter' | 'visible' | 'exit'");
    expect(tutorialPreviewPlayerSource).toContain('TUTORIAL_DIAGRAM_ENTER_MS');
    expect(tutorialPreviewPlayerSource).toContain('TUTORIAL_DIAGRAM_EXIT_MS');
    expect(tutorialPreviewPlayerSource).toContain('data-tutorial-diagram-phase={diagramDisplay.phase}');
    expect(tutorialPreviewPlayerSource).toContain('not4k-tutorial-diagram-overlay');
  });

  it('운영체제 prefers-reduced-motion이 reduce여도 도식 등장 260ms·퇴장 180ms 전환과 로딩 스피너를 그대로 쓴다(@media 규칙 없음, RFD 0030)', () => {
    expect(tutorialPreviewPlayerSource).toContain('const TUTORIAL_DIAGRAM_ENTER_MS = 260');
    expect(tutorialPreviewPlayerSource).toContain('const TUTORIAL_DIAGRAM_EXIT_MS = 180');
    expect(tutorialPreviewPlayerSource).not.toContain('prefers-reduced-motion');
    expect(tutorialPreviewPlayerSource).not.toMatch(/matchMedia\([^)]*reduced-motion/);
  });

  it('구동기 로딩 중에는 도식 모달에서 OK 대신 스피너를 보여 상호작용을 막고, 준비되면 OK로 전환', () => {
    // 준비 상태 플래그: 이펙트 시작 시 false, 첫 프레임 성공 또는 에러 시 true.
    expect(tutorialPreviewPlayerSource).toContain('const [rendererReady, setRendererReady] = useState(false)');
    expect(tutorialPreviewPlayerSource).toContain('setRendererReady(false)');
    expect(tutorialPreviewPlayerSource).toContain('setRendererReady(true)');
    // 준비 전에는 OK를 렌더하지 않고 스피너만 보여 클릭(재개)을 막는다.
    expect(tutorialPreviewPlayerSource).toContain('rendererReady ? (');
    expect(tutorialPreviewPlayerSource).toContain('data-tutorial-diagram-loading="true"');
    expect(tutorialPreviewPlayerSource).toContain('not4k-tutorial-diagram-spinner');
  });

  it('레슨을 넘기면 같은 렌더러에 새 차트의 첫 프레임을 그린 뒤 준비 콜백을 호출', () => {
    expect(tutorialPreviewPlayerSource).toContain('onReady?: () => void');
    expect(tutorialPreviewPlayerSource).toContain('onReady?.()');
    expect(tutorialPreviewPlayerSource).toContain('renderer.renderFrame(preview.renderStartMs, 0)');
    expect(tutorialPreviewPlayerSource).toContain('if (!readyNotifiedRef.current)');
  });

  it('프리뷰 언마운트 중 Pixi dispose 오류가 나도 앱까지 전파하지 않도록 안전하게 정리', () => {
    expect(tutorialPreviewPlayerSource).toContain('disposeTutorialPreviewRenderer(renderer)');
    expect(tutorialPreviewPlayerSource).toContain('function disposeTutorialPreviewRenderer(renderer: GameRenderer | null): void');
    expect(tutorialPreviewPlayerSource).toContain("console.warn('TutorialPreviewPlayer: renderer dispose failed', err)");
  });

  it('init 완료 후 이미 언마운트된 경우 renderer를 skinManager보다 먼저 dispose 해 WebGL 컨텍스트 누수를 막음', () => {
    expect(tutorialPreviewPlayerSource).toContain(
      [
        '        await renderer.init();',
        '        if (disposed || !renderer) {',
      ].join('\n'),
    );
    // disposed 분기에서 renderer를 정리하지 않으면 init 중 언마운트 시 PIXI Application이 orphan으로 남는다.
    // renderer.dispose()가 skinManager.dispose()보다 먼저 와야 스킨 텍스처 참조 중 파괴를 피한다.
    expect(tutorialPreviewPlayerSource).toContain(
      [
        '        if (disposed || !renderer) {',
        '          // 초기화 도중 닫힌 슬롯은 WebGL 준비가 끝난 뒤 리소스를 정리한다.',
        '          disposeTutorialPreviewRenderer(renderer);',
        '          nextSkinManager.dispose();',
        '          if (skinManager === nextSkinManager) skinManager = null;',
        '          return;',
        '        }',
      ].join('\n'),
    );
  });


  it('렌더러는 스킨·키보드 프리셋 키(rendererKey)가 바뀔 때만 새로 만들고, 그때만 캔버스도 새로 붙여 잃은 WebGL 컨텍스트를 재사용하지 않음', () => {
    expect(tutorialPreviewPlayerSource).toContain('const rendererKey = `${skinManifest?.theme.id ?? skinId}:${settings.preset}`');
    expect(tutorialPreviewPlayerSource).toContain('key={rendererKey}');
    expect(tutorialPreviewPlayerSource).toContain('  }, [rendererKey]);');
    expect(tutorialPreviewPlayerSource.split('new GameRenderer(').length - 1).toBe(1);
  });

  it('레슨을 넘기면(preview·previewInstanceId 변경) 차트 effect만 다시 돌아 같은 렌더러를 resetTransientState → setChart → 키보드·레인 라벨 교체 → 첫 프레임 → 렌더 사이클 0 초기화 → 준비 알림 순서로 재사용', () => {
    const contentDeps = '  }, [diagramTimings, directBindings, directKeyboardKeys, explicitJudgmentMode, keyboardAreaHeight, keys, preview, previewInstanceId, playbackRevision, timings, tutorialKeyboardKeys]);';
    expect(tutorialPreviewPlayerSource).toContain(contentDeps);
    const attachStart = tutorialPreviewPlayerSource.indexOf('const attachRenderer = (renderer: GameRenderer, explicitSkin: ExplicitSkinLoader | null = null) => {');
    expect(attachStart).toBeGreaterThan(-1);
    const order = [
      'renderer.resetTransientState();',
      'renderer.setChart(',
      'renderer.updateTutorialKeyboardKeys(tutorialKeyboardKeys);',
      'renderer.setLaneKeyLabels(getLaneKeyLabels(keys, [], {})',
      'renderer.renderFrame(preview.renderStartMs, 0);',
      'activeRenderCycle = getTutorialRenderCycleIndex(preview.renderStartMs, preview.loopMs);',
      'notifyReady();',
      'setRendererReady(true);',
    ].map((snippet) => tutorialPreviewPlayerSource.indexOf(snippet, attachStart));
    expect(order.every((index) => index > attachStart)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('차트 effect 정리는 rAF만 멈추고 렌더러를 dispose하지 않음 — dispose는 렌더러 effect 정리에서만', () => {
    const contentStart = tutorialPreviewPlayerSource.indexOf('  }, [rendererKey]);');
    const contentEnd = tutorialPreviewPlayerSource.indexOf('  }, [diagramTimings, directBindings, directKeyboardKeys, explicitJudgmentMode, keyboardAreaHeight, keys, preview, previewInstanceId, playbackRevision, timings, tutorialKeyboardKeys]);');
    expect(contentStart).toBeGreaterThan(-1);
    expect(contentEnd).toBeGreaterThan(contentStart);
    const contentEffect = tutorialPreviewPlayerSource.slice(contentStart, contentEnd);
    expect(contentEffect).toContain('cancelAnimationFrame(animationFrameId)');
    expect(contentEffect).not.toContain('disposeTutorialPreviewRenderer');
    expect(contentEffect).not.toContain('.dispose()');
  });

  it('렌더러 준비·실패·재생성은 차트 effect가 구독해 처리하고, 실패하면 이후 레슨도 준비 완료로 알려 캐러셀이 멈추지 않음', () => {
    expect(tutorialPreviewPlayerSource).toContain("publishRendererState({ status: 'ready', renderer, loadExplicitSkin });");
    expect(tutorialPreviewPlayerSource).toContain("publishRendererState({ status: 'failed' });");
    expect(tutorialPreviewPlayerSource).toContain("publishRendererState({ status: 'loading' });");
    expect(tutorialPreviewPlayerSource).toContain('rendererStateListenerRef.current = handleRendererState;');
    // 실제 동작은 e2e/game/tutorial-preview-pingpong.spec.ts의 렌더러 실패 시나리오가 확인한다.
    const failedBranch = tutorialPreviewPlayerSource.indexOf("if (state.status === 'failed') {");
    expect(failedBranch).toBeGreaterThan(-1);
    const notifyIndex = tutorialPreviewPlayerSource.indexOf('notifyReady();', failedBranch);
    const readyIndex = tutorialPreviewPlayerSource.indexOf('setRendererReady(true);', failedBranch);
    const branchEnd = tutorialPreviewPlayerSource.indexOf('} else {', failedBranch);
    expect(notifyIndex).toBeGreaterThan(failedBranch);
    expect(readyIndex).toBeGreaterThan(notifyIndex);
    expect(branchEnd).toBeGreaterThan(readyIndex);
    expect(tutorialPreviewPlayerSource).toContain('const error = rendererError ?? contentError;');
  });

  it('재생기는 같은 튜토리얼 재방문을 구분하는 previewInstanceId prop을 받음', () => {
    expect(tutorialPreviewPlayerSource).toContain('previewInstanceId?: number;');
  });


});

describe('TutorialPreviewPlayer 명시 판정 엔진 seam', () => {
  const attachStart = tutorialPreviewPlayerSource.indexOf('const attachRenderer = (renderer: GameRenderer, explicitSkin: ExplicitSkinLoader | null = null) => {');
  const renderLoopStart = tutorialPreviewPlayerSource.indexOf('const renderLoop = ');
  const renderLoopEnd = tutorialPreviewPlayerSource.indexOf('        };\n\n        animationFrameId = requestAnimationFrame(renderLoop);', renderLoopStart);
  const renderLoopBody = tutorialPreviewPlayerSource.slice(renderLoopStart, renderLoopEnd);

  it('preview prop은 구형 정의와 명시 정의를 모두 받고 정의 내용(isExplicitTutorialPreview)으로 판정 엔진을 고름', () => {
    expect(tutorialPreviewPlayerSource).toContain('preview?: TutorialPreviewDefinition | ExplicitTutorialPreviewDefinition;');
    expect(tutorialPreviewPlayerSource).toContain('if (isExplicitTutorialPreview(preview)) {');
    expect(tutorialPreviewPlayerSource).not.toMatch(/engine\??: ['"]legacy/);
  });

  it('명시 정의는 같은 attachRenderer에서 resetTransientState → setExplicitChart → 키보드·레인 라벨 → 첫 프레임 순서로 걸고, 차트는 걸 때 한 번만 건다', () => {
    expect(attachStart).toBeGreaterThan(-1);
    const order = [
      'renderer.resetTransientState();',
      'renderer.setExplicitChart(',
      'renderer.updateTutorialKeyboardKeys(tutorialKeyboardKeys);',
      'renderer.setLaneKeyLabels(getLaneKeyLabels(keys, [], {})',
      'renderer.renderFrame(preview.renderStartMs, 0);',
    ].map((snippet) => tutorialPreviewPlayerSource.indexOf(snippet, attachStart));
    expect(order.every((index) => index > attachStart)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(tutorialPreviewPlayerSource.split('renderer.setExplicitChart(').length - 1).toBe(1);
    expect(tutorialPreviewPlayerSource).toContain('() => explicitPlayback.renderSnapshot(');
    expect(tutorialPreviewPlayerSource).toContain('(explicitInput?.sessionIteration ?? screenIteration) - screenIteration');
    expect(tutorialPreviewPlayerSource).toContain('screenIteration = screenTime.iteration;');
    expect(tutorialPreviewPlayerSource).toContain('preview.renderDurationMs,');
  });

  it('명시 판정은 바인딩 시연에 설정 judgmentMode의 창을 적용하고 모드 변경 시 차트만 다시 건다', () => {
    expect(tutorialPreviewPlayerSource).toContain('createExplicitTutorialPreviewPlayback(preview, createTutorialTimingsInputPlan(timings), {');
    expect(tutorialPreviewPlayerSource).toContain('windows: getJudgmentWindows(explicitJudgmentMode)');
    expect(tutorialPreviewPlayerSource).toContain('renderer.setPerfectWindow(getJudgmentWindows(explicitJudgmentMode).PERFECT)');
    // 구형 정의는 고정 Normal이라 판정 모드 변경으로 다시 걸지 않는다.
    expect(tutorialPreviewPlayerSource).toContain("const explicitJudgmentMode = preview && isExplicitTutorialPreview(preview) ? settings.judgmentMode : 'normal';");
    expect(tutorialPreviewPlayerSource).toContain('renderer.setPerfectWindow(JUDGMENT_WINDOWS.PERFECT)');
    expect(tutorialPreviewPlayerSource).toContain('explicitJudgmentMode, keyboardAreaHeight, keys, preview, previewInstanceId, playbackRevision, timings');
  });

  it('명시 확정 효과는 판정 글자 묶음·고도·타격을 렌더러로 보내고 타격은 구형과 같은 onBombEffect·showRendererBomb 경로를 공유', () => {
    expect(tutorialPreviewPlayerSource).toContain('showJudgmentGroup: (state) => renderer.showJudgmentGroup(state),');
    expect(tutorialPreviewPlayerSource).toContain('recordFlightJudgment: (grade) => renderer.recordFlightJudgment(grade),');
    expect(tutorialPreviewPlayerSource.split('showBombEffect: showPreviewBomb').length - 1).toBe(2);
    expect(tutorialPreviewPlayerSource).toContain('onBombEffectRef.current?.(lane, getTutorialBombPosition(lane, keyboardAreaHeight));');
  });

  it('구형 경계는 finishLoop·명시 경계는 explicitInput이 맡고 렌더러 재생성 없이 onPatternFinished로 알림', () => {
    expect(renderLoopBody).toContain('if (!isExplicitTutorialPreview(preview) && loopTimeMs < previousLoopTime) {');
    expect(renderLoopBody).toContain('previewJudgment.finishLoop();');
    expect(renderLoopBody).toContain('previewJudgment.advanceTo(loopTimeMs, diagramHeldBeforeFrame);');
    expect(renderLoopBody).not.toContain('resetTransientState');
    expect(renderLoopBody).not.toContain('setExplicitChart');
    // `callback?.(finishPattern())`처럼 쓰면 콜백이 없을 때 인자도 평가하지 않아 반복을 정산하지 않는다. 정산을 먼저 한다.
    const finishPattern = tutorialInputSource.indexOf('finished = playback.finishPattern(');
    expect(finishPattern).toBeGreaterThan(-1);
    expect(tutorialInputSource.indexOf('onPatternFinished?.(finished);', finishPattern)).toBeGreaterThan(finishPattern);
    expect(tutorialPreviewPlayerSource).toContain('onPatternFinishedRef.current?.(pattern) === false');
    expect(tutorialPreviewPlayerSource).not.toMatch(/\?\.\([^)]*finishPattern\(\)/);
    expect(tutorialPreviewPlayerSource).toContain('onPatternFinished?: (pattern: ExplicitTutorialPatternResult) => false | void;');
  });

  it('명시 반복 결과는 DOM에 경계 정산·차수·점수를 공개하고 같은 차트를 렌더러에 다시 걸면 이전 결과를 지운다', () => {
    const attachBody = tutorialPreviewPlayerSource.slice(attachStart, renderLoopStart);
    expect(attachBody).toContain('setFinishedPattern(null);');
    expect(attachBody).toContain('setFinishedPattern(pattern);');
    expect(tutorialPreviewPlayerSource).toContain('data-tutorial-last-iteration={finishedPattern?.iteration}');
    expect(tutorialPreviewPlayerSource).toContain('data-tutorial-last-perfect={finishedPattern?.result.score.judgmentCounts.perfect}');
    expect(tutorialPreviewPlayerSource).toContain("fact.kind === 'settlement' && fact.atMs === preview.loopMs");
  });

  it('구형 경계 정산은 그대로 loopMs까지 진행 → adapter reset → setChart로 노트 표시 캐시를 다시 만듦', () => {
    expect(tutorialPreviewPlayerSource.indexOf('advanceTo: (loopTimeMs) => controller.advanceTo(loopTimeMs),')).toBeGreaterThan(-1);
    const legacyBoundary = [
      'controller.advanceTo(preview.loopMs);',
      'sessionAdapter.reset();',
      'renderer.setChart(',
    ].map((snippet) => tutorialPreviewPlayerSource.indexOf(snippet, tutorialPreviewPlayerSource.indexOf('advanceTo: (loopTimeMs) => controller.advanceTo(loopTimeMs),')));
    expect(legacyBoundary.every((index) => index > -1)).toBe(true);
    expect([...legacyBoundary].sort((a, b) => a - b)).toEqual(legacyBoundary);
  });

  it('명시 경계는 도식 진입 전 대기 상태와 해결된 loopTimeMs로 한 번 정산하고 구형은 loopTimeMs 감소만 검사', () => {
    const order = [
      'if (clock.frozen) {',
      'const diagramHeldBeforeFrame = activeDiagramPause !== null;',
      'loopTimeMs = resolveDiagramPauseTime(loopTimeMs);',
      'previewJudgment.advanceTo(loopTimeMs, diagramHeldBeforeFrame);',
    ].map(snippet => renderLoopBody.indexOf(snippet));
    expect(order.every(index => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(tutorialPreviewPlayerSource).toContain('advanceTo: (loopTimeMs, diagramHeldBeforeFrame) => { advanceExplicit(loopTimeMs, diagramHeldBeforeFrame); }');
    expect(tutorialPreviewPlayerSource).toContain([
      'explicitInput?.advanceTo(Math.max(0, previousNow - loopStartNow), {',
      '              loopTimeMs,',
      '              blocked: pausedRef.current || diagramHeldBeforeFrame,',
    ].join('\n'));
    // 프레임에만 이전 도식 상태를 전달한다. 프레임 사이 키 이벤트는 현재 도식 상태를 읽어야 한다.
    expect(tutorialPreviewPlayerSource).toContain('blocked: pausedRef.current || activeDiagramPause !== null');
    expect(tutorialInputSource).toContain('beforeInput: () => syncJudging()');
    expect(tutorialInputSource).toContain('const syncJudging = (blocked = getClock().blocked) => {');
    expect(tutorialInputSource).toContain('const blocked = frame?.blocked ?? getClock().blocked;');
    expect(tutorialInputSource).toContain('elapsedMs = Math.floor(Math.max(0, elapsedMs) / loopMs) * loopMs + frame.loopTimeMs;');
    expect(tutorialInputSource).toContain('stepExplicitTutorialLoop({ elapsedMs, loopMs, previousIteration: iteration');
    expect(tutorialInputSource.match(/playback\.finishPattern\(/g)).toHaveLength(1);
    const inputAdvance = tutorialInputSource.slice(tutorialInputSource.indexOf('advanceTo(elapsedMs: number'));
    expect(inputAdvance).not.toMatch(/\b(for|while)\s*\(/);
    expect(renderLoopBody).not.toContain('stepExplicitTutorialLoop');
    expect(renderLoopBody).toContain([
      'if (!isExplicitTutorialPreview(preview) && loopTimeMs < previousLoopTime) {',
      '            previewJudgment.finishLoop();',
      '          }',
      '          previewJudgment.advanceTo(loopTimeMs, diagramHeldBeforeFrame);',
    ].join('\n'));
  });

  it('prop 제어로 진행할 때도 도식 진입 전 대기를 읽고 도식 시작점으로 제한한 뒤 명시 입력을 진행', () => {
    const controlStart = tutorialPreviewPlayerSource.indexOf('syncExplicitControlRef.current = () => {');
    const controlEnd = tutorialPreviewPlayerSource.indexOf('          previewJudgment = {', controlStart);
    expect(controlStart).toBeGreaterThan(-1);
    expect(controlEnd).toBeGreaterThan(controlStart);
    const control = tutorialPreviewPlayerSource.slice(controlStart, controlEnd);
    const order = [
      'if (!clock.frozen) {',
      'const diagramHeldBeforeFrame = activeDiagramPause !== null;',
      'const loopTimeMs = resolveDiagramPauseTime(Math.max(0, now - loopStartNow) % preview.loopMs);',
      'advanceExplicit(loopTimeMs, diagramHeldBeforeFrame);',
    ].map(snippet => control.indexOf(snippet));
    expect(order.every(index => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('도식 OK와 차트 재연결은 loopStartNow를 다시 잡을 때 명시 차수도 0으로 초기화', () => {
    const resumeStart = tutorialPreviewPlayerSource.indexOf('resumeDiagramRef.current = () => {');
    const resumeEnd = tutorialPreviewPlayerSource.indexOf('    resolveDiagramPauseTime(0);', resumeStart);
    const resumeBody = tutorialPreviewPlayerSource.slice(resumeStart, resumeEnd);
    expect(resumeBody).toContain('loopStartNow = resumeNow - activeDiagramPause.timing.endMs;');
    expect(resumeBody).toContain('explicitInput?.rebase(resumeNow);');
    const attachBody = tutorialPreviewPlayerSource.slice(attachStart, renderLoopStart);
    expect(attachBody).toContain('loopStartNow = previousNow;');
    expect(attachBody).toContain('explicitInput?.rebase(previousNow);');
  });

  it('명시 노트 도안은 렌더러마다 명시 정의를 처음 걸 때만 ExplicitSkinLoader로 불러오고, 정리는 렌더러 dispose 뒤에 함', () => {
    expect(tutorialPreviewPlayerSource).toContain("import('../../skin/ExplicitSkinLoader')");
    expect(tutorialPreviewPlayerSource).toContain('state.loadExplicitSkin().then(');
    const disposeStart = tutorialPreviewPlayerSource.indexOf('const disposeResources = () => {');
    const rendererDispose = tutorialPreviewPlayerSource.indexOf('disposeTutorialPreviewRenderer(renderer);', disposeStart);
    const explicitSkinDispose = tutorialPreviewPlayerSource.indexOf('explicitSkin?.dispose();', disposeStart);
    expect(disposeStart).toBeGreaterThan(-1);
    expect(rendererDispose).toBeGreaterThan(disposeStart);
    expect(explicitSkinDispose).toBeGreaterThan(rendererDispose);
  });

  it('차트 effect는 명시 판정 세션을 stop으로만 놓고 렌더러·도안은 렌더러 effect가 정리', () => {
    expect(tutorialPreviewPlayerSource).toContain('attachedJudgment?.stop();');
    expect(tutorialPreviewPlayerSource).toContain('stop: () => explicitInput?.stop(),');
  });
});

describe('프리뷰 렌더 오류 표면화', () => {
  it('프리뷰 렌더 진입점 2곳(첫 프레임·루프)은 renderer.renderFrame을 직접 불러 렌더 오류를 삼키지 않음', () => {
    // 교차 teardown 레이스용 프레임 스킵 안전망(createSafeRenderFrame)은 pixi.js 8.21과
    // releaseGlobalResources: false로 원인이 사라져 제거했다. 렌더 오류가 다시 묻히지 않게 고정한다.
    expect(tutorialPreviewPlayerSource.split('renderer.renderFrame(').length - 1).toBe(2);
    expect(tutorialPreviewPlayerSource).not.toContain('createSafeRenderFrame');
    expect(tutorialPreviewPlayerSource).not.toContain('isTransientTeardownRenderError');
  });

  it('rAF 렌더 루프 본문에는 try/catch가 없어 루프 중 렌더 오류가 uncaught로 드러남', () => {
    const loopStart = tutorialPreviewPlayerSource.indexOf('const renderLoop = ');
    const loopEnd = tutorialPreviewPlayerSource.indexOf(
      '        };\n\n        animationFrameId = requestAnimationFrame(renderLoop);',
      loopStart,
    );
    expect(loopStart).toBeGreaterThan(-1);
    expect(loopEnd).toBeGreaterThan(loopStart);
    const renderLoopBody = tutorialPreviewPlayerSource.slice(loopStart, loopEnd);
    expect(renderLoopBody).toContain('renderer.renderFrame(renderTimeMs, deltaMs);');
    expect(renderLoopBody).not.toMatch(/\btry\s*\{/);
    expect(renderLoopBody).not.toMatch(/\bcatch\b/);
  });
});


describe('튜토리얼 봄 위치', () => {
  it('높이 225·판정선 오프셋 50(설계값 360·80 × 0.625)에서 키보드높이95면 2번레인 봄은 전체320 중 판정선175와 가로37.5%에 표시', () => {
    expect(getTutorialBombPosition(2,95)).toEqual({x:.375,y:175/320});
  });
  it('키보드높이가50으로 줄어도4번레인 봄의 판정선은175로 유지', () => {
    const position = getTutorialBombPosition(4,50);
    expect(position.x).toBe(.875);
    expect(position.y*275).toBe(175);
  });
});

describe('튜토리얼 재생기 플레이필드 배율 (RFD 0029)', () => {
  it('높이·판정선 오프셋·스크롤 속도를 레인과 같은 배율로 줄여 이전 비율(400×360, 판정선 80, 520px/s)을 유지한다', () => {
    expect(tutorialPreviewPlayerSource).toContain('const PREVIEW_SCROLL_SPEED = playfieldPx(520)');
    expect(tutorialPreviewPlayerSource).toContain('renderer.scrollSpeed = PREVIEW_SCROLL_SPEED');
  });

  it('논리 폭이 250으로 줄어든 만큼 해상도를 1/0.625배 올려 같은 CSS 폭에서 이전과 같은 백버퍼 폭으로 그린다', () => {
    expect(tutorialPreviewPlayerSource).toContain('const PREVIEW_RESOLUTION_BOOST = 1 / PLAYFIELD_SCALE');
    expect(tutorialPreviewPlayerSource).toContain('resolution: Math.min(window.devicePixelRatio || 1, 2) * PREVIEW_RESOLUTION_BOOST');
  });
});


describe('명시 재생기 직접 입력 표시', () => {
  it('실제 바인딩이 1레인 KeyQ·2레인 KeyE뿐이면 strip도 Q·E만 매핑하고 보충 키 W는 어둡게 표시', () => {
    const keys = getDirectTutorialKeys({ lane1: ['KeyQ'], lane2: ['KeyE'], lane3: [], lane4: [] });
    expect(keys.map(key => [key.lane, key.keyCode])).toEqual([[1, 'KeyQ'], [2, 'KeyE']]);
    const strip = buildTutorialKeyboardKeys(getTutorialKeyboardLayout('tkl'), new Map(keys.map(key => [key.keyCode, key])));
    expect(strip.find(key => key.code === 'KeyQ')).toMatchObject({ label: 'Q', mapped: true });
    expect(strip.find(key => key.code === 'KeyW')?.mapped).toBe(false);
  });
  it('directInput prop은 명시 정의에서만 적용하고 표시 보충 안내·사전 레인 라벨을 숨김', () => {
    expect(tutorialPreviewPlayerSource).toContain("isExplicitTutorialPreview(preview) && inputMode === 'directInput'");
    expect(tutorialPreviewPlayerSource).toContain('!directInput && bindingNotice');
    expect(tutorialPreviewPlayerSource).toContain('!diagramDisplay && !directInput');
    expect(tutorialPreviewPlayerSource).toContain('inputMode?: TutorialInputMode;');
    expect(tutorialPreviewPlayerSource).toContain('onPatternStarted?: (iteration: number) => TutorialInputMode | void;');
  });
});


it('inputMode 변경은 차트 effect 의존성이 아니므로 세션·시계를 처음부터 다시 만들지 않음', () => {
  const deps = tutorialPreviewPlayerSource.match(/\}, \[diagramTimings[^\n]+/u)?.[0];
  expect(deps).toBeDefined();
  expect(deps).not.toContain('inputMode');
  expect(deps).not.toContain('directInput');
  expect(tutorialPreviewPlayerSource).toContain('inputModeRef.current = inputMode;');
  expect(tutorialPreviewPlayerSource).toContain('syncExplicitControlRef.current?.();');
});

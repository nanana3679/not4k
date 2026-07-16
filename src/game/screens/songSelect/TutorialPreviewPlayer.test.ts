import { describe, expect, it } from 'vitest';
import tutorialPreviewPlayerSource from './TutorialPreviewPlayer.tsx?raw';
import {
  buildTutorialKeyboardKeys,
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
    expect(tutorialPreviewPlayerSource).toContain('showGearFrame: false');
    expect(tutorialPreviewPlayerSource).toContain('showPerspectiveSurface: false');
  });

  it('곡 선택 튜토리얼 미니 재생기는 정확도·콤보 HUD를 숨기고 판정선을 아래로 내림', () => {
    expect(tutorialPreviewPlayerSource).toContain('showComboAndAccuracy: false');
    expect(tutorialPreviewPlayerSource).toContain('const PREVIEW_JUDGMENT_LINE_OFFSET = 80');
    expect(tutorialPreviewPlayerSource).toContain('judgmentLineOffset: PREVIEW_JUDGMENT_LINE_OFFSET');
  });

  it('프리뷰 캔버스는 렌더 크기와 같은 aspectRatio를 사용해 찌그러지지 않음', () => {
    expect(tutorialPreviewPlayerSource).toContain('const PREVIEW_RENDER_WIDTH = LANE_AREA_WIDTH');
    expect(tutorialPreviewPlayerSource).toContain('const PREVIEW_RENDER_HEIGHT = 360');
    expect(tutorialPreviewPlayerSource).toContain('width: PREVIEW_RENDER_WIDTH');
    expect(tutorialPreviewPlayerSource).toContain('height: PREVIEW_RENDER_HEIGHT');
    expect(tutorialPreviewPlayerSource).toContain('aspectRatio: `${PREVIEW_RENDER_WIDTH} / ${PREVIEW_RENDER_HEIGHT + keyboardAreaHeight}`');
  });

  it('키 입력 표시는 사용자가 선택한 프리셋 기반 키보드 스펙을 GameRenderer 생성 시 넘겨 캔버스 안에 그림', () => {
    expect(tutorialPreviewPlayerSource).toContain('useGameStore((state) => state.settings)');
    expect(tutorialPreviewPlayerSource).toContain('getTutorialKeyboardLayout(settings.preset)');
    expect(tutorialPreviewPlayerSource).toContain('resolveTutorialInputTimingsForKeyboard(baseTimings, settings.keyBindings)');
    expect(tutorialPreviewPlayerSource).toContain('keyboardAreaHeight,');
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
    expect(tutorialPreviewPlayerSource).toContain('!diagramDisplay,');
    expect(tutorialPreviewPlayerSource).toContain('[laneKeyLabels, diagramDisplay, rendererReady]');
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

  it('튜토리얼 키 이벤트는 기존 JudgmentEngine 컨트롤러가 만든 판정 효과(판정 텍스트·bomb)를 표시', () => {
    expect(tutorialPreviewPlayerSource).toContain('createTutorialPreviewJudgmentController');
    expect(tutorialPreviewPlayerSource).toContain('decideJudgmentEffects(result, note)');
    expect(tutorialPreviewPlayerSource).toContain('renderer.showJudgment(effects.judgmentText.grade, effects.judgmentText.deltaMs)');
    expect(tutorialPreviewPlayerSource).toContain('if (effects.bomb !== null)');
    expect(tutorialPreviewPlayerSource).not.toContain('currentRenderer.showJudgment(JudgmentGrade.PERFECT, 0)');
  });

  it('루프 재생은 입력 시간과 렌더 시간을 분리해 시작과 끝의 노트 위치가 자연스럽게 이어짐', () => {
    expect(tutorialPreviewPlayerSource).toContain('preview.renderChart');
    expect(tutorialPreviewPlayerSource).toContain('preview.renderDurationMs');
    expect(tutorialPreviewPlayerSource).toContain('preview.renderStartMs');
    expect(tutorialPreviewPlayerSource).toContain('let loopTimeMs = (now - loopStartNow) % preview.loopMs');
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
    expect(tutorialPreviewPlayerSource).toContain('!diagramDisplay,');
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

  it('튜토리얼 도식이 0ms에서 시작하면 렌더러 init 전에 먼저 감지해 WebGL 실패 중에도 설명 모달을 표시', () => {
    expect(tutorialPreviewPlayerSource).toContain(
      [
        'resolveDiagramPauseTime(0);',
        '    if (activeDiagramPause) {',
        '      notifyReady();',
        '    }',
        '',
        '    const start = async () => {',
      ].join('\n'),
    );
  });

  it('튜토리얼 도식은 등장과 퇴장 phase를 유지해 부드럽게 전환', () => {
    expect(tutorialPreviewPlayerSource).toContain("type TutorialDiagramPhase = 'enter' | 'visible' | 'exit'");
    expect(tutorialPreviewPlayerSource).toContain('TUTORIAL_DIAGRAM_ENTER_MS');
    expect(tutorialPreviewPlayerSource).toContain('TUTORIAL_DIAGRAM_EXIT_MS');
    expect(tutorialPreviewPlayerSource).toContain('data-tutorial-diagram-phase={diagramDisplay.phase}');
    expect(tutorialPreviewPlayerSource).toContain('not4k-tutorial-diagram-overlay');
    expect(tutorialPreviewPlayerSource).toContain('@media (prefers-reduced-motion: reduce)');
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

  it('페이지 전환용 새 렌더러는 첫 프레임을 그린 뒤 준비 콜백을 호출', () => {
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
        '          // init()이 끝나기 전에 언마운트되면 cleanup의 dispose()가 아직 initialized=false라',
        '          // no-op으로 지나간다. 여기서 이미 초기화된 renderer(WebGL 컨텍스트)를 직접 정리하지 않으면',
        '          // PIXI Application이 orphan으로 남아 누수된다. dispose()는 idempotent라 이중 호출도 안전하다.',
        '          disposeTutorialPreviewRenderer(renderer);',
        '          skinManager.dispose();',
        '          return;',
        '        }',
      ].join('\n'),
    );
  });
});

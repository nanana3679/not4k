import { editorChartErrors } from '../documentValidation';
import { isExplicitNote, mainNotes, mainTrillZones, requireLegacyChart } from "../../shared";
import type { Chart, ChartDocument } from "../../shared";
import { compileExplicitJudgmentChart } from '../../game/judgment/explicitCompiledChart';
import type { ExplicitPlayTestOptions } from '../../game/stores/explicitPlayRequest';

export interface PlayTestGameActions {
  setChartData: (chart: Chart | null) => void;
  setAudioBuffer: (buffer: AudioBuffer | null) => void;
  setStartTimeMs: (ms: number) => void;
  setEditorReturnUrl: (url: string | null) => void;
  setScreen: (screen: "play") => void;
  /** 구형 전용 시연 콜러는 이 포트 없이 기존 재생만 사용할 수 있다. */
  startExplicitPlayTest?: (options: ExplicitPlayTestOptions) => void;
}

export interface PerformPlayTestParams {
  fromCursor: boolean;
  audioBuffer: AudioBuffer | null;
  isPlaying: boolean;
  pause: () => void;
  chart: ChartDocument;
  currentTimeMs: number;
  returnUrl: string;
  game: PlayTestGameActions;
  addToast: (message: string, type: "error") => void;
  closeMenu: () => void;
  navigate: () => void;
}

/**
 * 테스트 플레이 전환 로직. 저장소나 온라인 서비스 없이 검증과 게임 상태 주입만 담당한다.
 */
export function performPlayTest(params: PerformPlayTestParams): boolean {
  const {
    fromCursor, audioBuffer, isPlaying, pause, chart, currentTimeMs,
    returnUrl, game, addToast, closeMenu, navigate,
  } = params;

  if (!audioBuffer) {
    addToast("오디오가 로딩되지 않았습니다", "error");
    return false;
  }

  // 플레이/프리뷰 진입 게이트 (RFD 0017 §3-2). 낙관적 편집으로 남은 위반이 있으면
  // 게임의 valid chart 전제를 지키기 위해 다른 진입 경로까지 여기서 막는다.
  const violations = editorChartErrors({
    notes: chart.notes,
    trillZones: chart.trillZones,
    restZones: chart.restZones,
    events: chart.events,
  });
  if (violations.length > 0) {
    addToast(`배치 제약 위반 ${violations.length}건이 남아 있어 플레이할 수 없습니다`, "error");
    return false;
  }

  const hasExplicitMain = mainNotes(chart.notes).some(isExplicitNote);
  if (hasExplicitMain) {
    if (!game.startExplicitPlayTest) {
      addToast('명시적 노트의 테스트 플레이는 새 게임 연결 후 사용할 수 있습니다', 'error');
      return false;
    }
    try {
      // 원본문서 전체를 검사한다. legacy main을 걸러내거나 aux의 의미 위반을 숨기지 않는다.
      compileExplicitJudgmentChart(chart);
      // 처음부터 시작은 시작 시각을 넘기지 않아 0 앞 항목도 일반 재생처럼 포함한다.
      game.startExplicitPlayTest({ document: chart, audioBuffer, returnUrl, ...(fromCursor ? { startTimeMs: currentTimeMs } : {}) });
    } catch (reason) {
      addToast(reason instanceof Error ? reason.message : '명시 차트를 재생할 수 없습니다', 'error');
      return false;
    }
    if (isPlaying) pause();
    closeMenu(); navigate();
    return true;
  }

  // 구형 main은 기존 경로를 보존한다. 보조 노트는 실행하지 않는다.
  let playableChart: Chart;
  try {
    playableChart = requireLegacyChart({ ...chart, notes: mainNotes(chart.notes), trillZones: mainTrillZones(chart.trillZones) }, "현재 테스트 플레이");
  } catch {
    addToast("명시적 노트의 테스트 플레이는 새 게임 연결 후 사용할 수 있습니다", "error");
    return false;
  }

  if (isPlaying) pause();

  // 게임 진입 필터 (RFD 0018 §3-3). 파일 직렬화를 거치지 않는 테스트 플레이에서도
  // 보조 레인을 제거한다. 에디터와 Lab이 공유하는 온라인 서비스 비의존 초크포인트다.
  game.setChartData(playableChart);
  game.setAudioBuffer(audioBuffer);
  game.setStartTimeMs(fromCursor ? currentTimeMs : 0);
  game.setEditorReturnUrl(returnUrl);
  game.setScreen("play");

  closeMenu();
  navigate();
  return true;
}

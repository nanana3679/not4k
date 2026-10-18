import { mainNotes, validateChart } from "../../shared";
import type { Chart } from "../../shared";

export interface PlayTestGameActions {
  setChartData: (chart: Chart | null) => void;
  setAudioBuffer: (buffer: AudioBuffer | null) => void;
  setStartTimeMs: (ms: number) => void;
  setEditorReturnUrl: (url: string | null) => void;
  setScreen: (screen: "play") => void;
}

export interface PerformPlayTestParams {
  fromCursor: boolean;
  audioBuffer: AudioBuffer | null;
  isPlaying: boolean;
  pause: () => void;
  chart: Chart;
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
  const violations = validateChart({
    notes: chart.notes,
    trillZones: chart.trillZones,
    restZones: chart.restZones,
    events: chart.events,
  });
  if (violations.length > 0) {
    addToast(`배치 제약 위반 ${violations.length}건이 남아 있어 플레이할 수 없습니다`, "error");
    return false;
  }

  if (isPlaying) pause();

  // 게임 진입 필터 (RFD 0018 §3-3). 파일 직렬화를 거치지 않는 테스트 플레이에서도
  // 보조 레인을 제거한다. 에디터와 Lab이 공유하는 온라인 서비스 비의존 초크포인트다.
  game.setChartData({ ...chart, notes: mainNotes(chart.notes) });
  game.setAudioBuffer(audioBuffer);
  game.setStartTimeMs(fromCursor ? currentTimeMs : 0);
  game.setEditorReturnUrl(returnUrl);
  game.setScreen("play");

  closeMenu();
  navigate();
  return true;
}

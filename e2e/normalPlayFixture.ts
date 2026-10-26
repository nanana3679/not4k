import type { ChartDocument } from '../src/shared/types/chart';
import { useGameStore } from '../src/game/stores/gameStore';

/** 로컬 renderer 회귀용 문서/음원 경계. 실제 검증·세션·오디오는 앱과 같은 진입으로 실행한다. */
export function startNormalFixture(document: ChartDocument, audioBuffer: AudioBuffer): void {
  useGameStore.getState().startNormalPlay({ document, audioBuffer });
}

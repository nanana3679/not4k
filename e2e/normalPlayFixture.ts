import type { ChartDocument } from '../src/shared/types/chart';
import { openNormalPlayForTest } from '../src/game/stores/normalPlayTestHarness';

/**
 * 로컬 renderer 회귀용 문서/음원 경계. 네트워크 읽기만 건너뛰고, 검증·로딩 완료(beginPlayLoad →
 * completePlayLoad)·세션·오디오는 앱과 같은 진입으로 실행한다. 두 store 호출은 같은 동기 블록이라
 * React는 중간의 loading 화면을 그리지 않고 play 화면만 그린다.
 */
export function startNormalFixture(document: ChartDocument, audioBuffer: AudioBuffer): void {
  openNormalPlayForTest(document, audioBuffer);
}

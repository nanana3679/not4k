import type { ChartDocument, PlaybackRange } from '../../shared';
import { prepareNormalPlay } from './explicitPlayRequest';
import type { ExplicitPlayRequest } from './explicitPlayRequest';
import { useGameStore } from './gameStore';

/**
 * 테스트 전용. 곡 선택 → `LoadingScreen` 완료와 같은 store 경로
 * (`beginPlayLoad` → `completePlayLoad`)로 일반 재생 요청을 열고 play 화면으로 보낸다.
 * 문서 검증은 store를 바꾸기 전에 하므로 실패하면 이전 상태가 그대로 남는다.
 * `playbackRange`를 생략하면 선택한 곡의 음원 구간을 쓴다.
 */
export function openNormalPlayForTest(
  document: ChartDocument,
  audioBuffer: AudioBuffer,
  playbackRange: PlaybackRange | null = useGameStore.getState().selectedPlaybackRange,
): ExplicitPlayRequest {
  const request = prepareNormalPlay({ document, audioBuffer, playbackRange });
  const state = useGameStore.getState();
  const loadId = state.beginPlayLoad();
  if (!state.completePlayLoad(loadId, request)) throw new Error('일반 재생 요청을 열지 못했습니다.');
  return request;
}

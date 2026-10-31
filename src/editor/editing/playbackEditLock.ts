/**
 * 에디터 재생 중 편집 제한(RFD 0099)의 공용 판단.
 *
 * 재생 중에는 노트·이벤트의 생성·이동·삭제, 롱노트·구간 길이 조절, Undo·Redo,
 * 오프셋·BPM·박자표 값 수정을 실행하지 않는다. 저장·seek·스크롤·줌·미니맵·재생/정지는 그대로 쓴다.
 * 입력 경로(캔버스·키보드·툴바·모달)가 먼저 막고, store의 setChart가 이 판단으로 마지막에 한 번 더 막는다.
 */
import type { ChartDocument } from '../../shared';

/**
 * 재생 중 막는 차트 쓰기인가. 노트·trillZone·restZone·이벤트 배열을 새로 만들었거나 오프셋이 바뀌면 막는다.
 * BPM·박자표 값은 이벤트에 있으므로 이벤트 배열 비교에 들어간다. 편집은 항상 새 배열을 만들므로 참조만 비교한다.
 * 저장이 제목·난이도·재킷·음원 경로 같은 다른 meta만 바꾼 쓰기는 통과한다.
 */
export function isPlaybackLockedChange(prev: ChartDocument, next: ChartDocument): boolean {
  return prev.notes !== next.notes
    || prev.trillZones !== next.trillZones
    || prev.restZones !== next.restZones
    || prev.events !== next.events
    || prev.meta.offsetMs !== next.meta.offsetMs;
}

/**
 * 미정 기본값 D1(PRD §12): 재생 중에도 선택은 허용한다. Select 모드의 클릭·Shift/Alt·박스 선택과
 * Ctrl+A·Ctrl+C는 차트를 바꾸지 않으므로 그대로 동작하고, 이동·리사이즈 시작만 막는다.
 * false로 바꾸면 캔버스의 Select 모드 누름과 Ctrl+A·Ctrl+C도 재생 중에 막고 안내한다.
 */
export const SELECTION_ALLOWED_WHILE_PLAYING = true;

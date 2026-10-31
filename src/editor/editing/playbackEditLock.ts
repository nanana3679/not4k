/**
 * 에디터 재생 중 편집 제한(RFD 0099)의 공용 판단.
 *
 * 재생 중에는 노트·이벤트의 생성·이동·삭제, 롱노트·구간 길이 조절, Undo·Redo,
 * 오프셋·BPM·박자표 값 수정, 선택 변경(클릭·박스·Ctrl+A·Esc)과 복사를 실행하지 않는다.
 * 저장·seek·스크롤·줌·미니맵·재생/정지·모드 전환은 그대로 쓴다. 재생을 시작하면 진행 중이던
 * 이동·리사이즈 드래그·붙여넣기 대기·우클릭 삭제는 Esc처럼 취소한다.
 * 입력 경로(캔버스·키보드·툴바·모달)가 먼저 막고, store의 setChart가 이 판단으로, setSelection이 재생 여부로
 * 마지막에 한 번 더 막는다.
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

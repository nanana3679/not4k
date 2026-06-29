/**
 * 트릴존 핸들(이동/리사이즈) 드로잉.
 *
 * 테두리·글리프 없는 단색 도형 2개를 **모양(실루엣)으로 구분**한다 — 작은 크기에서
 * 박스+테두리+세밀 아이콘이 뭉개지던 문제를 단색 1층 면으로 해결한다.
 * - 리사이즈(끝=위): 레인 폭을 가로지르는 **풀폭 가로 캡**(직각 바). 끝점을 세로로 늘이고 줄임.
 * - 이동(시작=아래): 레인 중앙의 짧은 **라운드 캡슐(필)**. 구간 전체를 양축 이동.
 * 강조색은 기본 초록(트릴존 색), 구간 단위 선택 시 빨강 + 도형 높이 +1px(색+형태 이중 채널).
 * hover 오버레이(hoverLayer)에서만 호출되어, select 모드에서 구간에 커서를 올렸거나 그 구간을
 * 드래그하는 동안에만 표시된다.
 */
import { Graphics, type Container } from "pixi.js";
import {
  COLORS,
  TRILL_RESIZE_CAP_HEIGHT,
  TRILL_RESIZE_CAP_INSET,
  TRILL_MOVE_PILL_WIDTH,
  TRILL_MOVE_PILL_HEIGHT,
  TRILL_HANDLE_SELECTED_BUMP,
} from "./constants";

/**
 * 한 트릴 구간의 이동/리사이즈 핸들을 layer에 그린다.
 * @param x        구간 레인의 좌측 x (= (lane-1) * laneWidth)
 * @param laneWidth 레인 폭
 * @param startY   구간 시작(아래) 화면 y
 * @param endY     구간 끝(위) 화면 y
 * @param selected 구간 단위 선택 여부 (선택 시 빨강 + 높이 +1px)
 */
export function drawTrillZoneHandles(
  layer: Container,
  x: number,
  laneWidth: number,
  startY: number,
  endY: number,
  selected: boolean,
): void {
  const accent = selected ? COLORS.SELECTED_OUTLINE : COLORS.TRILL_ZONE;
  const bump = selected ? TRILL_HANDLE_SELECTED_BUMP : 0;
  const cx = x + laneWidth / 2;

  // 리사이즈 캡 (끝=위): 풀폭 단색 가로 바(직각)
  const capH = TRILL_RESIZE_CAP_HEIGHT + bump;
  const capW = laneWidth - TRILL_RESIZE_CAP_INSET * 2;
  const cap = new Graphics();
  cap.rect(x + TRILL_RESIZE_CAP_INSET, endY - capH / 2, capW, capH);
  cap.fill({ color: accent });
  layer.addChild(cap);

  // 이동 필 (시작=아래): 짧은 라운드 캡슐.
  // 길이 0 구간(시작==끝)에서는 두 도형이 같은 지점에 겹치고 이동도 무의미하므로 캡만 그린다.
  if (endY !== startY) {
    const pillH = TRILL_MOVE_PILL_HEIGHT + bump;
    const pill = new Graphics();
    pill.roundRect(cx - TRILL_MOVE_PILL_WIDTH / 2, startY - pillH / 2, TRILL_MOVE_PILL_WIDTH, pillH, pillH / 2);
    pill.fill({ color: accent });
    layer.addChild(pill);
  }
}

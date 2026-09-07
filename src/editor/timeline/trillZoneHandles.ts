/**
 * 트릴존 핸들(리사이즈) 드로잉.
 *
 * 테두리·글리프 없는 단색 도형을 사용한다 — 작은 크기에서 박스+테두리+세밀 아이콘이
 * 뭉개지던 문제를 단색 1층 면으로 해결한다.
 * - 리사이즈(끝=위): 레인 폭을 가로지르는 **풀폭 가로 캡**(직각 바). 끝점을 세로로 늘이고 줄임.
 * - 이동 핸들(이동 필)은 없다 — 구간 이동은 "선택 후 몸통 드래그"로 한다 (RFD 0016 §6-6).
 * 강조색은 기본 초록(트릴존 색), 구간 단위 선택 시 빨강 + 도형 높이 +1px(색+형태 이중 채널).
 * hover 오버레이(hoverLayer)에서만 호출되어, select 모드에서 구간에 커서를 올렸거나 그 구간을
 * 드래그하는 동안에만 표시된다.
 */
import { Graphics, type Container } from "pixi.js";
import {
  COLORS,
  TRILL_RESIZE_CAP_HEIGHT,
  TRILL_RESIZE_CAP_INSET,
  TRILL_HANDLE_SELECTED_BUMP,
} from "./constants";

/**
 * 리사이즈 캡(끝=위): 레인 폭을 가로지르는 풀폭 단색 가로 바(직각)를 endY에 그린다.
 * trillZone과 롱노트가 공유하는 리사이즈 핸들 도형이다.
 * @param x        레인의 좌측 x (= (lane-1) * laneWidth)
 * @param laneWidth 레인 폭
 * @param endY     끝(위) 화면 y — 캡의 세로 중심
 * @param color    채움색
 * @param bump     높이 가산(px) — 강조용
 */
export function drawResizeCap(
  layer: Container,
  x: number,
  laneWidth: number,
  endY: number,
  color: number,
  bump = 0,
): void {
  const capH = TRILL_RESIZE_CAP_HEIGHT + bump;
  const capW = laneWidth - TRILL_RESIZE_CAP_INSET * 2;
  const cap = new Graphics();
  cap.rect(x + TRILL_RESIZE_CAP_INSET, endY - capH / 2, capW, capH);
  cap.fill({ color });
  layer.addChild(cap);
}

/**
 * 한 trillZone의 리사이즈 핸들(끝=위의 풀폭 가로 캡)을 layer에 그린다.
 * 이동 핸들은 없다 — 구간 이동은 "선택 후 몸통 드래그" (RFD 0016 §6-6).
 * @param x        구간 레인의 좌측 x (= (lane-1) * laneWidth)
 * @param laneWidth 레인 폭
 * @param endY     구간 끝(위) 화면 y
 * @param selected 구간 단위 선택 여부 (선택 시 빨강 + 높이 +1px)
 */
export function drawTrillZoneHandles(
  layer: Container,
  x: number,
  laneWidth: number,
  endY: number,
  selected: boolean,
): void {
  const accent = selected ? COLORS.SELECTED_OUTLINE : COLORS.TRILL_ZONE;
  const bump = selected ? TRILL_HANDLE_SELECTED_BUMP : 0;

  // 리사이즈 캡 (끝=위): 풀폭 단색 가로 바(직각)
  drawResizeCap(layer, x, laneWidth, endY, accent, bump);
}

/**
 * 롱노트의 리사이즈 핸들(끝=위의 풀폭 가로 캡)을 layer에 그린다.
 * trillZone과 같은 캡 도형을 쓰되, 색은 노트 hover/선택 언어를 따른다
 * (hover=흰색 외곽선색, 선택=빨강).
 * @param x        노트 레인의 좌측 x (= (lane-1) * laneWidth)
 * @param laneWidth 레인 폭
 * @param endY     롱노트 끝(위) 화면 y
 * @param selected 노트 선택 여부
 */
export function drawNoteResizeHandle(
  layer: Container,
  x: number,
  laneWidth: number,
  endY: number,
  selected: boolean,
): void {
  const color = selected ? COLORS.SELECTED_OUTLINE : COLORS.HOVERED_OUTLINE;
  drawResizeCap(layer, x, laneWidth, endY, color);
}

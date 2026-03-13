/** 노트 컨테이너 기본 치수 */
export const CW = 100;
export const CH = 20;

/** 기어 레이아웃 상수 */
export const LANE_GAP = 4;
export const LANE_W = CW + LANE_GAP;
export const GEAR_PAD = 18;
export const FIELD_W = LANE_W * 4;
export const LANE_H = 340;
export const LANE_TOP = GEAR_PAD;
export const LANE_BOT = LANE_TOP + LANE_H;
export const JUDGE_Y = LANE_BOT - CH * 2;

export const noteX = (i) => GEAR_PAD + i * LANE_W + (LANE_W - CW) / 2;

/** 기어 프레임 전체 크기 */
export const GF_W = 447;
export const GF_H = 1080;

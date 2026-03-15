/**
 * 스킨 런타임 테마 — 이미지에 구워지지 않는 동적 색상값
 */
export interface SkinTheme {
  id: string;
  name: string;
  /** 강조색 (판정 이펙트 등) */
  accent: number;
  /** 키빔 색상 */
  beamColor: number;
  /** 홀드 라인 색상 */
  heldLine: number;
  /** 홀드 글로우 색상 */
  heldGlow: number;
  /** 배경색 */
  bg: number;
  /** 텍스트 색상 */
  text: number;
}

/**
 * 스킨 에셋 경로 매니페스트
 */
export interface SkinManifest {
  theme: SkinTheme;
  assets: {
    noteSingle: string;
    noteDouble: string;
    terminalSingle: string;
    terminalDouble: string;
    bodySingle: string;
    bodyDouble: string;
    bodySingleHeld: string;
    bodyDoubleHeld: string;
    /** miss 에셋 (optional — 없으면 tint fallback) */
    noteSingleFailed?: string;
    noteDoubleFailed?: string;
    bodySingleFailed?: string;
    bodyDoubleFailed?: string;
    bodyDoublePartialFailedLeft?: string;
    bodyDoublePartialFailedRight?: string;
    terminalDoublePartialFailedLeft?: string;
    terminalDoublePartialFailedRight?: string;
    noteDoublePartialFailedLeft?: string;
    noteDoublePartialFailedRight?: string;
    terminalSingleFailed?: string;
    terminalDoubleFailed?: string;
    /** 봄 16프레임 */
    bomb: string[];
    gearFrame: string;
    /** 4개 버튼 idle */
    buttonIdle: string[];
    /** 4개 버튼 pressed */
    buttonPressed: string[];
  };
}

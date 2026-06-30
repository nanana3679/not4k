/**
 * 스킨 런타임 테마 — 이미지에 구워지지 않는 동적 색상값
 */
export interface SkinTheme {
  id: string;
  name: string;
  /** 에셋(PNG)이 모두 준비되어 실제 선택 가능한지 여부. false면 선택지에서 숨긴다 */
  available: boolean;
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
    /** 실패 에셋 */
    noteDoubleFailed: string;
    bodySingleFailed: string;
    bodyDoubleFailed: string;
    terminalSingleFailed: string;
    terminalDoubleFailed: string;
    /**
     * 롱노트 양 끝 캡 (10px, start/end 공용). 전용 캡 에셋이 있는 스킨만 채운다.
     * 없으면 SkinManager가 terminal 텍스처 윗부분을 런타임 crop해 fallback한다.
     * partial-failed 캡은 윗부분 색이 double과 같아 endCapDouble을 재사용한다.
     */
    endCapSingle?: string;
    endCapDouble?: string;
    endCapSingleFailed?: string;
    endCapDoubleFailed?: string;
    /** 부분 실패 에셋 (더블 롱노트) */
    bodyDoublePartialFailedLeft: string;
    bodyDoublePartialFailedRight: string;
    terminalDoublePartialFailedLeft: string;
    terminalDoublePartialFailedRight: string;
    noteDoublePartialFailedLeft: string;
    noteDoublePartialFailedRight: string;
    /** 트릴 에셋 */
    noteTrill: string;
    terminalTrill: string;
    bodyTrill: string;
    bodyTrillHeld: string;
    noteTrillFailed: string;
    bodyTrillFailed: string;
    terminalTrillFailed: string;
    /** 봄 16프레임 */
    bomb: string[];
    /** 기어 프레임 (스킨 공통, 기둥 게이지는 분리됨) */
    gearFrame: string;
    /** 기둥 게이지 발광 레이어 (좌/우) */
    gearGaugeLeft: string;
    gearGaugeRight: string;
    /** 4개 버튼 idle */
    buttonIdle: string[];
    /** 4개 버튼 pressed */
    buttonPressed: string[];
  };
}

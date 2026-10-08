/**
 * 스킨 런타임 테마 — 이미지에 구워지지 않는 동적 색상값
 *
 * `...Px`·그림자 높이처럼 길이를 나타내는 값은 레인 100·노트 100×20 기준 설계 px다. 게임 렌더러는 플레이필드 배율
 * (`PLAYFIELD_SCALE`, RFD 0029)을 곱해 노트와 같은 비율로 줄여 쓴다.
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
  /** 롱노트 양 끝에 terminal 전체 높이를 쓸지 여부. 생략하면 기존 반쪽 cap 방식 */
  longNoteTerminalMode?: "split-cap" | "full-height";
  /** full-height terminal의 외곽 프레임이 바디 좌우로 더 나오는 논리 픽셀 수 */
  longNoteTerminalFrameOverhangPx?: number;
  /** 반복 바디는 텍스처 비율을 유지해 세로로 타일링한다. */
  longNoteBodyMode?: "stretch" | "repeat";
  /** Grace overlay 텍스처의 본체 바깥 투명 여백 */
  graceOverlayPaddingPx?: number;
  /** 포인트 아래 바디에 겹치는 접촉 그림자 */
  pointShadow?: { offsetY: number; height: number };
  /** 포인트 위아래 바디에 깔리는 접촉 그림자의 퍼짐 높이. 싱글·더블은 에셋 `pointContactShadow`, 트릴은 `pointContactShadowTrill`이 함께 있을 때만 `pointShadow` 대신 쓴다. */
  pointContactShadow?: { above: number; below: number };
  /** 봄의 전체 재생 시간. 생략하면 60fps로 프레임 수만큼 재생 */
  bombDurationMs?: number;
  /**
   * 롱노트 켜짐(홀드) 효과를 표시할지(RFD 0028). 생략하면 true.
   * false면 켜짐 에셋 없이 유지 중에도 대기 바디·터미널을 그린다. 부분 실패·실패는 그대로 표시한다.
   */
  heldEffect?: boolean;
}

/**
 * 스킨 에셋 경로 매니페스트
 */
export interface SkinManifest {
  theme: SkinTheme;
  assets: {
    noteSingle: string;
    noteDouble: string;
    pointGraceOverlay?: string;
    terminalGraceOverlay?: string;
    pointShadow?: string;
    /** 윗행이 가장 짙고 아래로 사라지는 세로 그라디언트. 포인트 아래에 그대로, 위에 뒤집어 그린다. */
    pointContactShadow?: string;
    /** 트릴 포인트 모양을 따라 번지는 그림자. 포인트 폭 × (위 + 포인트 높이 + 아래)에 맞춰 포인트 아래에 그린다. */
    pointContactShadowTrill?: string;
    terminalSingle: string;
    terminalDouble: string;
    /** 누르기 전 중앙광이 꺼진 terminal. 없는 스킨은 일반 terminal로 fallback */
    terminalSingleIdle?: string;
    terminalDoubleIdle?: string;
    bodySingle: string;
    bodyDouble: string;
    /** 켜짐 에셋. `theme.heldEffect`가 false가 아니면 필수이며 SkinManager가 로딩 전에 확인한다. */
    bodySingleHeld?: string;
    bodyDoubleHeld?: string;
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
    /** 부분 충족 held 에셋 (더블 롱노트 1/2, waitingSide = 아직 안 잡힌 쪽). `heldEffect: false`면 없어도 된다. */
    bodyDoublePartialHeldLeft?: string;
    bodyDoublePartialHeldRight?: string;
    /** 트릴 에셋 */
    noteTrill: string;
    terminalTrill: string;
    /** 누르기 전 중앙광이 꺼진 trillLong terminal. 없는 스킨은 terminalTrill로 fallback */
    terminalTrillIdle?: string;
    bodyTrill: string;
    /** 켜짐 에셋. `heldEffect: false`면 없어도 된다. */
    bodyTrillHeld?: string;
    noteTrillFailed: string;
    bodyTrillFailed: string;
    terminalTrillFailed: string;
    /** 봄 16프레임 */
    bomb: string[];
    /**
     * 기어 (스킨 공통, RFD 0029의 새 기어). 레인 창과 꺾인 덱 사이 레인 바닥이 투명하다.
     * 배치 측정값은 src/game/renderer/gearGeometry.json이며 밉맵·삼선형 필터로 읽는다.
     */
    gearImage: string;
    /**
     * 고도 게이지의 빈 유리(스킨 공통). 두 유리관 안쪽만 유리 윤곽 알파로 잘라 담은 아틀라스이며, 렌더러가 기어 그림의 유리관 위에
     * 위에서부터 채움 경계까지 덮는다. 자리는 gearGeometry.json의 `gauge`이며 기어와 같은 밉맵·삼선형 필터로 읽는다.
     */
    gearGaugeEmpty: string;
    /**
     * 4개 버튼 idle/pressed. 새 기어가 키를 그림으로 갖고 있어 게임은 더 이상 그리지 않는다.
     * Classic 버전 판별(게임 PNG 60개)이 이 PNG를 포함하므로 필드와 에셋은 후속 정리 때 새 버전 보관과 함께 뺀다.
     */
    buttonIdle: string[];
    buttonPressed: string[];
  };
}

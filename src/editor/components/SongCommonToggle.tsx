import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react';
import { SONG_COMMON_AREA_COPY } from '../editorCopy';
import { MEASURE_LABEL_WIDTH, SONG_COMMON_HEADER_ROW_HEIGHT } from '../timeline/constants';

/** 곡 행이 있는 헤더 두 줄과 같은 높이다. 곡 행이 없어 헤더가 한 줄이어도 누르기 쉽게 같은 높이를 쓴다. */
const TOGGLE_HEIGHT = SONG_COMMON_HEADER_ROW_HEIGHT * 2;
/** 터치 목표 높이. 폭은 마디 레일에 묶인다. */
const COMPACT_TOGGLE_HEIGHT = 44;

export interface SongCommonToggleProps {
  collapsed: boolean;
  /** 좁은 화면·터치 기기면 터치 목표에 맞춰 높게 그린다. */
  compact: boolean;
  /** 마디 레일이 시작하는 캔버스 안 x(px). */
  left: number;
  onToggle: () => void;
}

/**
 * 곡 공통 영역을 접고 펼치는 버튼(RFD 0095). 마디 레일 맨 위에 두어 레인을 덮지 않고, 레일은 가로 팬·세로 스크롤에 움직이지 않으므로
 * 어느 위치에서도 닿는다. 곡 행 유무와 무관하게 같은 버튼이고, 열이 곡 공통인지는 Pixi 헤더가 알린다.
 */
export function SongCommonToggle({ collapsed, compact, left, onToggle }: SongCommonToggleProps) {
  const label = collapsed ? SONG_COMMON_AREA_COPY.expand : SONG_COMMON_AREA_COPY.collapse;
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={!collapsed}
      title={label}
      // 마우스로 눌러도 포커스를 가져가지 않아 Space·Enter가 타임라인 단축키로 남는다. Tab으로 온 포커스는 그대로다.
      onMouseDown={(event: MouseEvent) => event.preventDefault()}
      onClick={() => onToggle()}
      // window의 단축키 처리가 재생·배치 확정으로 가로채면 포커스된 버튼이 눌리지 않는다. 다른 키는 그대로 단축키로 보낸다.
      onKeyDown={(event: KeyboardEvent) => {
        if (event.key === ' ' || event.key === 'Enter') event.stopPropagation();
      }}
      style={{ ...toggleStyle, left, height: compact ? COMPACT_TOGGLE_HEIGHT : TOGGLE_HEIGHT }}
    >
      {collapsed ? 'BPM›' : '‹BPM'}
    </button>
  );
}

// 곡 공통 영역 헤더(GridRenderer.renderSongCommonHeader)와 같은 바탕·글꼴을 쓴다.
const toggleStyle: CSSProperties = {
  position: 'absolute',
  top: 0,
  zIndex: 1,
  width: MEASURE_LABEL_WIDTH,
  padding: 0,
  boxSizing: 'border-box',
  border: '1px solid #333',
  backgroundColor: 'rgba(0, 0, 0, 0.8)',
  color: '#999',
  fontFamily: 'monospace',
  fontSize: 11,
  cursor: 'pointer',
  touchAction: 'manipulation',
};

import type { CSSProperties } from 'react';

// ---------------------------------------------------------------------------
// not4k 게임 화면 공유 테마 — 메탈릭 다크 + 아니메풍 + 절제된 네온 (PRODUCT.md)
//
// 모든 게임 화면(SongSelect / Result / Settings / Tutorial / Title ...)이 이
// 토큰과 프리미티브를 참조한다. 화면마다 색을 다시 하드코딩하지 않는다.
// ---------------------------------------------------------------------------

export const font = {
  display: "'Oxanium', system-ui, sans-serif", // 헤드라인·제목·버튼
  numeric: "'Rajdhani', system-ui, sans-serif", // 숫자·레벨·달성률
  body: "'Noto Sans KR', system-ui, sans-serif", // 한글·본문
};

export const color = {
  bg: '#0d0f12',
  inkStrong: '#f4f7fa', // 제목·강조 (near-white)
  ink: '#e8ecf0', // 본문 (대비 ≥ 4.5:1)
  inkDim: '#9aa2ac', // 보조 텍스트
  inkFaint: '#6b727c', // 최약 텍스트 — 장식/비정보 전용 (본문 대비 미달)
  line: '#2b303a', // 경계선
  neon: '#5ce1e6', // 청록 네온 — 상태(포커스/선택/주액션)에만
  neonInk: '#d8fbfd', // 네온 표면 위 텍스트
  neonGlow: 'rgba(92, 225, 230, 0.45)',
  danger: '#e8564a', // 오류·파괴적 액션
  gold: '#ffd24a', // 랭크·재시도
  fast: '#4a95e6', // 타이밍 빠름 (방향 정보, 오류 아님)
  slow: '#f0854a', // 타이밍 느림 (방향 정보, 오류 아님)
};

// 금속 서피스 그라디언트 (사선 브러시드 메탈)
export const surface = {
  screen: 'radial-gradient(120% 80% at 50% -10%, #171b21 0%, #0d0f12 55%)',
  panel: 'linear-gradient(180deg, #1b1f26 0%, #12151a 100%)',
  card: 'linear-gradient(145deg, #21252c 0%, #14171b 100%)',
  cardFocused: 'linear-gradient(145deg, #26333a 0%, #182226 100%)',
  button: 'linear-gradient(180deg, #2a2f37 0%, #1e2229 100%)',
  neonButton: 'linear-gradient(180deg, #16333a 0%, #102429 100%)',
};

// 금속 엣지: 상단 하이라이트 + 하단 그림자 (inset — 고스트카드 금지패턴 회피)
export const edge = {
  metal: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), inset 0 -1px 0 rgba(0, 0, 0, 0.5)',
  neonFocus: `0 0 0 1px ${color.neon}, 0 0 20px -6px ${color.neonGlow}`,
};

export const radius = { sm: '9px', md: '12px', pill: '999px' };

// ---------------------------------------------------------------------------
// 재사용 프리미티브 — 화면 껍데기와 공통 컨트롤
// ---------------------------------------------------------------------------
export const primitives = {
  // 화면 루트 (100dvh 다크 메탈 배경)
  screen: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
    height: '100dvh',
    background: surface.screen,
    color: color.ink,
    fontFamily: font.body,
    overflow: 'hidden',
  },
  // 상단 헤더 바 (금속 패널 + 하단 경계)
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '14px 20px',
    background: surface.panel,
    borderBottom: `1px solid ${color.line}`,
    boxShadow: '0 1px 0 rgba(255, 255, 255, 0.04), 0 6px 16px -10px rgba(0, 0, 0, 0.8)',
    flexShrink: 0,
  },
  // 화면 제목 (앞에 titleAccent 틱과 함께 쓴다)
  title: {
    margin: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontFamily: font.display,
    fontSize: '20px',
    lineHeight: 1,
    fontWeight: 800,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: color.inkStrong,
  },
  // 제목 앞 네온 틱 (아니메풍 액센트)
  titleAccent: {
    width: '4px',
    height: '20px',
    borderRadius: '2px',
    background: `linear-gradient(180deg, ${color.neon}, #2b8f93)`,
    boxShadow: `0 0 10px -1px ${color.neonGlow}`,
    flexShrink: 0,
  },
  // 기본 금속 버튼
  metalButton: {
    minHeight: '40px',
    padding: '0 15px',
    background: surface.button,
    color: '#d7dde4',
    border: `1px solid ${color.line}`,
    borderRadius: radius.sm,
    boxShadow: edge.metal,
    cursor: 'pointer',
    fontFamily: font.display,
    fontSize: '14px',
    fontWeight: 600,
    letterSpacing: '0.01em',
    whiteSpace: 'nowrap',
    touchAction: 'manipulation',
  },
  // 주액션 — 유일하게 네온 엣지를 두른 버튼
  neonButton: {
    minHeight: '40px',
    padding: '0 15px',
    background: surface.neonButton,
    color: color.neonInk,
    border: `1px solid ${color.neon}`,
    borderRadius: radius.sm,
    boxShadow: `${edge.metal}, 0 0 14px -7px ${color.neonGlow}`,
    cursor: 'pointer',
    fontFamily: font.display,
    fontSize: '14px',
    fontWeight: 700,
    letterSpacing: '0.02em',
    touchAction: 'manipulation',
  },
  // 조용한 고스트 버튼 (Back 등)
  ghostButton: {
    minHeight: '40px',
    padding: '0 15px',
    background: 'transparent',
    color: color.inkDim,
    border: `1px solid ${color.line}`,
    borderRadius: radius.sm,
    cursor: 'pointer',
    fontFamily: font.display,
    fontSize: '14px',
    fontWeight: 600,
    touchAction: 'manipulation',
  },
  // 금속 패널/카드
  panel: {
    background: surface.card,
    border: `1px solid ${color.line}`,
    borderRadius: radius.md,
    boxShadow: edge.metal,
  },
} satisfies Record<string, CSSProperties>;

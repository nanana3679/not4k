// trill-quartz.mjs 중 TypeScript 코드(scripts/build-trill-quartz.ts, E2E, 석영 테스트)가 import하는 export만 선언한다.

export const TRILL_QUARTZ_STATES: Record<'idle' | 'on' | 'failed', { label: string; body: string; terminal: string }>;

/** 석영 원본 이름(point-trill, body-trill 등) → SVG 문자열. */
export function buildTrillQuartzAssets(): Record<string, string>;

// state는 TRILL_QUARTZ_STATES의 키여야 하며, 그 밖의 값이면 RangeError를 던진다.
export function trillBodySvg(state?: string): string;
export function trillTerminalSvg(state?: string): string;

/** 미리보기 조립 치수. 너비가 양수가 아니거나 길이가 음수면 RangeError를 던진다. */
export function trillAssemblyLayout(width: number, length: number): {
  width: number;
  capHeight: number;
  bodyTop: number;
  bodyHeight: number;
  pointTop: number;
  height: number;
};

export function trillAssemblySvg(width?: number, length?: number, state?: string): string;

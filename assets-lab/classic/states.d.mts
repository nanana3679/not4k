// states.mjs 중 TypeScript 코드(scripts/build-classic-skin.ts, Classic 테스트)가 import하는 export만 선언한다.

/** buildClassicAssets에 넘길 원본 SVG 이름(assets-lab/classic/sources/<이름>.svg). */
export const CLASSIC_SOURCE_NAMES: string[];

/** 원본 이름 → SVG 문자열을 받아 에셋 이름 → 상태별 SVG 문자열을 만든다. */
export function buildClassicAssets(sources: Record<string, string>): Record<string, string>;

/** 런타임 스킨 에셋 키(noteSingle 등) → buildClassicAssets 결과의 에셋 이름. */
export const RUNTIME_ASSET_MAP: Record<string, string>;

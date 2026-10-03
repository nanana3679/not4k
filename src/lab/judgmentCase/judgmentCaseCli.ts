/**
 * scripts/judgment-case-image.ts 인자 해석.
 */

import { DEFAULT_JUDGMENT_CASE_SKIN, JUDGMENT_CASE_SKIN_IDS, type JudgmentCaseSkinId } from "./judgmentCaseSkin";

export interface JudgmentCaseCliOptions {
  /** 사례 파일 경로(텍스트 문법 또는 에디터 차트 JSON). "-"는 표준 입력 */
  cases: string[];
  out: string;
  /** 엔진을 불러올 저장소 경로. 비면 현재 워크트리 엔진 */
  engines: string[];
  /** 선형 구간 px/ms. 주면 빈 구간을 줄이지 않는다. 생략하면 자동 */
  scale?: number;
  /** 노트를 그릴 게임 스킨 */
  skin: JudgmentCaseSkinId;
  help: boolean;
}

export const JUDGMENT_CASE_CLI_USAGE = [
  "사용법: node scripts/judgment-case-image.ts <case.txt|chart.json|-> [더 많은 사례…] --out <file.png> [--engine <repoPath>]… [--scale <px/ms>] [--skin classic|crystal|simple]",
  "",
  "  --out <file.png>     저장할 PNG 경로 (필수)",
  "  --engine <repoPath>  판정 엔진을 불러올 저장소(워크트리) 경로. 여러 번 쓰면 엔진별로 나란히 비교",
  "  --scale <px/ms>      선형 시간 축 배율(빈 구간을 줄이지 않음). 생략하면 긴 빈 구간을 줄이고 높이에 맞춰 자동",
  `  --skin <id>          노트를 그릴 게임 스킨 ${JUDGMENT_CASE_SKIN_IDS.join("|")} (기본 ${DEFAULT_JUDGMENT_CASE_SKIN})`,
  "  -                    사례를 표준 입력에서 읽음",
].join("\n");

const VALUE_FLAGS = new Set(["--out", "--engine", "--scale", "--skin"]);

function isSkinId(value: string): value is JudgmentCaseSkinId {
  return (JUDGMENT_CASE_SKIN_IDS as readonly string[]).includes(value);
}

export function parseJudgmentCaseCliArgs(argv: readonly string[]): JudgmentCaseCliOptions {
  const cases: string[] = [];
  const engines: string[] = [];
  let out: string | undefined;
  let scale: number | undefined;
  let skin: JudgmentCaseSkinId = DEFAULT_JUDGMENT_CASE_SKIN;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") return { cases: [], out: "", engines: [], skin, help: true };
    // `pnpm case:image -- …`처럼 패키지 매니저가 넘기는 구분자는 건너뛴다.
    if (arg === "--") continue;
    if (arg === "-" || !arg.startsWith("-")) {
      cases.push(arg);
      continue;
    }
    const [flag, inline] = arg.includes("=") ? [arg.slice(0, arg.indexOf("=")), arg.slice(arg.indexOf("=") + 1)] : [arg, undefined];
    if (!VALUE_FLAGS.has(flag)) throw new Error(`알 수 없는 옵션 ${flag}\n${JUDGMENT_CASE_CLI_USAGE}`);
    const value = inline ?? argv[++i];
    if (value === undefined || value === "") throw new Error(`${flag} 뒤에 값이 필요합니다`);
    if (flag === "--out") out = value;
    else if (flag === "--engine") engines.push(value);
    else if (flag === "--skin") {
      if (!isSkinId(value)) throw new Error(`--skin은 ${JUDGMENT_CASE_SKIN_IDS.join("·")} 중 하나여야 합니다: ${value}`);
      skin = value;
    } else {
      scale = Number(value);
      if (!Number.isFinite(scale) || scale <= 0) throw new Error(`--scale은 0보다 큰 숫자여야 합니다: ${value}`);
    }
  }
  if (cases.length === 0) throw new Error(`사례 파일이 없습니다\n${JUDGMENT_CASE_CLI_USAGE}`);
  if (!out) throw new Error(`--out <file.png>이 필요합니다\n${JUDGMENT_CASE_CLI_USAGE}`);
  return { cases, out, engines, ...(scale === undefined ? {} : { scale }), skin, help: false };
}

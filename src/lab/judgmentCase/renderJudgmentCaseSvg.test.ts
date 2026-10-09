import { describe, expect, it } from "vitest";
import { compileJudgmentChart } from "../../game/judgment/compiledJudgmentChart";
import { NoteJudgmentSession } from "../../game/judgment/NoteJudgmentSession";
import { validateChart } from "../../shared/validation";
import { judgmentCaseFromSource } from "./chartCase";
import { makeTestSkin } from "./makeTestSkin";
import {
  createAutoCaseTimeAxis,
  createCaseTimeAxis,
  describeFailureReason,
  describeJudgmentEvent,
  describeNote,
  estimateTextWidth,
  labelText,
  MIN_GAP_PX,
  renderJudgmentCaseSvg,
  resolveLabelPositions,
  wrapText,
  type JudgmentCasePanel,
  type RenderJudgmentCaseOptions,
} from "./renderJudgmentCaseSvg";
import { runJudgmentCase, type JudgmentCaseRun, type JudgmentCaseRunEvent, type JudgmentCaseUnitState, type JudgmentEngine } from "./runJudgmentCase";

const engine: JudgmentEngine = { compileJudgmentChart, NoteJudgmentSession, validateChart };

const D4 = [
  "제목: 결정 ④ — A를 1430에 뗌",
  "노트: holdOnly 1000-1500 | long 1500-1560 | head 1560 | long 1560-1760",
  "입력: A 1000-1430 | D 1490-1760",
  "메모: 가설 메모",
].join("\n");
const R16 = "제목: R16\n노트: head 0 | long 0-1000 | head 1000 | long 1000-2000\n입력: A 0-1015 | B 1020-2000";
const H08_LATE = "제목: H08 대조\n노트: head 1000 | holdOnly 1000-1500 | holdOnly 1500-2000 | holdOnly 2000-2500 | long 2500-3000\n입력: A 1121-3000";
/** 리뷰 재현: A↓500은 시작 창(880~1120) 밖이라 N1은 시작하지 못하고, 그 기한 1120에 A를 뗀다 */
const UNSTARTED_UP_AT_DEADLINE = "노트: long 1000-2000\n입력: A 500-1120";
/** 리뷰 재현: A↓830은 N1 head(1000) Good 창 밖이라 N2·N3이 시작하지 못하고, N3 기한 1220에 A를 뗀다 */
const UNSTARTED_HOLDONLY = "노트: head 1000 | long 1000-1100 | holdOnly 1100-1600 | head 1600 | long 1600-1620\n입력: A 830-1220 | D 1710-1810";
/** 리뷰 재현: holdOnly를 끝낸 A↑1430과 같은 시각에 D↓1430 */
const HOLD_ONLY_UP_WITH_DOWN = "노트: holdOnly 1000-1500 | long 1500-1560 | head 1560 | long 1560-1760\n입력: A 1000-1430 | D 1430-1760";
/** 리뷰 재현: holdOnly를 끝낸 A↑1430과 같은 시각에 다른 레인 B↓1430 */
const HOLD_ONLY_UP_WITH_OTHER_LANE = "노트: holdOnly 1000-1500 | L2: head 1430\n입력: A 1000-1430 | L2:B 1430-1440";
/** 리뷰 재현: A↓990이 N3 head를 일찍 쳐 N4를 A로 시작하고, N2를 쥔 D를 1060에 뗀다 */
const EARLY_SUCCESSOR = "노트: head 1000 | long 1000-1100 | head 1100 | long 1100-1200 | head 1200\n입력: A 990-1210 | D 980-1060 | D 1170-1290";
/**
 * #180 회귀: D↓890이 친 head로 시작한 holdOnly를 S 전 D↑930에 떼어 E+Good 1320까지 미확정으로 남는 사례.
 * #180 수정 전 엔진은 여기서 없는 release 항목을 정산하려다 1328ms 프레임에 예외로 finalize 전에 멈췄다.
 */
const HOLD_ONLY_EARLY_TAP_180 = "노트: head 1000 | holdOnly 1000-1200\n입력: A 940-1020 | A 1180-1440 | D 890-930 | D 1150-1330";

const CLASSIC = makeTestSkin("classic");

function render(panels: JudgmentCasePanel[], options: Partial<RenderJudgmentCaseOptions> = {}) {
  return renderJudgmentCaseSvg(panels, { skin: CLASSIC, ...options });
}

/** 노트 부품(data-note-part)이 쓰는 스킨 에셋 키 목록 */
function skinAssetsOf(svg: string, noteIndex: number, part: string): string[] {
  return [...svg.matchAll(new RegExp(`data-note-index="${noteIndex}" data-note-type="[^"]+" data-note-part="${part}" data-skin-asset="([^"]+)"`, "g"))].map((match) => match[1]);
}

/** ms 축 눈금(data-tick-ms)의 y */
function tickY(svg: string, ms: number): number {
  return Number(svg.match(new RegExp(`data-tick-ms="${ms}" x="[\\d.]+" y="([\\d.]+)"`))![1]);
}

/** trillZone 띠(data-trill-zone)의 y·높이 */
function trillZoneBox(svg: string, lane: number): { top: number; height: number } {
  const match = svg.match(new RegExp(`data-trill-zone="${lane}" x="[\\d.]+" y="([-\\d.]+)" width="80" height="([\\d.]+)"`));
  return { top: Number(match![1]), height: Number(match![2]) };
}

/** SVG 안에서 노트 부품이 처음 나오는 위치(그리기 순서 비교용, 없으면 -1) */
function partOrder(svg: string, noteIndex: number, part: string): number {
  return svg.search(new RegExp(`data-note-index="${noteIndex}" data-note-type="[^"]+" data-note-part="${part}"`));
}

function panelFor(text: string, overrides: Partial<JudgmentCaseRun> = {}, engineLabel = "main @abc1234"): JudgmentCasePanel {
  const judgmentCase = judgmentCaseFromSource(text);
  return { judgmentCase, run: { ...runJudgmentCase(judgmentCase, engine), ...overrides }, engineLabel, enginePath: "/repo/main" };
}

/** 판정 라벨 본문과 실패 이유를 `본문 — 이유`로 이은 문자열(이유가 없으면 본문만) */
function fullLabel(event: JudgmentCaseRunEvent, panel: JudgmentCasePanel): string {
  const main = labelText(describeJudgmentEvent(event, panel.judgmentCase, panel.run));
  const reason = labelText(describeFailureReason(event, panel.judgmentCase, panel.run));
  return reason === "" ? main : `${main} — ${reason}`;
}

function labelsOf(text: string, overrides: Partial<JudgmentCaseRun> = {}): string[] {
  const panel = panelFor(text, overrides);
  return panel.run.events.map((event) => fullLabel(event, panel));
}

function unitState(overrides: Partial<JudgmentCaseUnitState>): JudgmentCaseUnitState {
  return { noteIndex: 0, unitIndex: 0, active: true, failed: false, complete: false, registeredKeys: [], ...overrides };
}

/** run.unitStates에서 noteIndex 유닛만 바꾼 run */
function withUnit(run: JudgmentCaseRun, noteIndex: number, overrides: Partial<JudgmentCaseUnitState>): JudgmentCaseRun {
  return { ...run, unitStates: run.unitStates!.map((state) => (state.noteIndex === noteIndex ? { ...state, ...overrides } : state)) };
}

function noteLabelsOf(text: string, options: { showLane?: boolean } = {}): string[] {
  return judgmentCaseFromSource(text).notes.map((entry) => labelText(describeNote(entry, options)));
}

function event(overrides: Partial<JudgmentCaseRunEvent>): JudgmentCaseRunEvent {
  return { kind: "head", noteIndex: 0, grade: "perfect", deltaMs: 0, inputAt: null, confirmedAt: 0, ...overrides };
}

describe("createCaseTimeAxis", () => {
  it("pxPerMs 0.5에서 1000ms 떨어진 두 시각은 500px 차이", () => {
    const axis = createCaseTimeAxis([0, 1000], 0.5);
    expect(axis.offsetOf(1000) - axis.offsetOf(0)).toBe(500);
  });

  it("10ms 떨어진 1490·1500은 최소 간격 22px로 벌림", () => {
    const axis = createCaseTimeAxis([1490, 1500], 0.5);
    expect(axis.offsetOf(1500) - axis.offsetOf(1490)).toBe(MIN_GAP_PX);
  });

  it("주요 시각 0·1000 사이 250ms는 그 구간 높이의 25% 위치", () => {
    const axis = createCaseTimeAxis([0, 1000], 0.4);
    expect(axis.offsetOf(250)).toBe(100);
  });

  it("첫 주요 시각보다 이른 시각은 pxPerMs로 연장해 음수 위치", () => {
    expect(createCaseTimeAxis([1000, 2000], 0.5).offsetOf(900)).toBe(-50);
  });

  it("maxGapPx 220이면 1000ms 빈 구간(1.2px/ms → 1200px)을 220px로 줄이고 compressed에 기록", () => {
    const axis = createCaseTimeAxis([0, 1000, 1015], 1.2, { maxGapPx: 220 });
    expect(axis.offsetOf(1000)).toBe(220);
    expect(axis.compressed).toEqual([{ startMs: 0, endMs: 1000 }]);
  });

  it("자동 축은 짧은 사례(1000~1760)를 1.2px/ms로 그려 60ms 바디가 72px", () => {
    const axis = createAutoCaseTimeAxis([1000, 1430, 1500, 1560, 1760]);
    expect(axis.offsetOf(1560) - axis.offsetOf(1500)).toBeCloseTo(72);
  });

  it("자동 축은 250ms 간격 주요 시각 20개(4750ms)를 높이 720px 안으로 맞춤", () => {
    const height = createAutoCaseTimeAxis(Array.from({ length: 20 }, (_, i) => i * 250)).height;
    expect(height).toBeLessThanOrEqual(720);
    expect(height).toBeGreaterThan(700);
  });

  it("주요 시각 40개면 최소 간격만으로 720px를 넘어 39 × 22 = 858px", () => {
    expect(createAutoCaseTimeAxis(Array.from({ length: 40 }, (_, i) => i * 250)).height).toBeCloseTo(858);
  });
});

describe("resolveLabelPositions", () => {
  it("간격 18보다 멀리 떨어진 [0, 100]은 그대로", () => {
    expect(resolveLabelPositions([0, 100], 18)).toEqual([0, 100]);
  });

  it("같은 위치 [50, 50, 50]은 평균 50을 중심으로 18 간격 [32, 50, 68]로 쌓음", () => {
    expect(resolveLabelPositions([50, 50, 50], 18)).toEqual([32, 50, 68]);
  });

  it("결과는 입력 순서를 따르고 위치 순서는 보존: [100, 0, 5] → 0과 5가 벌어지고 100은 그대로", () => {
    const [a, b, c] = resolveLabelPositions([100, 0, 5], 18);
    expect(a).toBe(100);
    expect(c - b).toBe(18);
    expect(b).toBeLessThan(c);
  });

  it("같은 위치 [0, 0]에서 위 라벨이 두 줄(크기 [1, 2])이면 둘째 줄이 아래로 처지므로 간격 2 × 10 = 20", () => {
    const [lower, upper] = resolveLabelPositions([0, 0], 10, [1, 2]);
    expect(upper - lower).toBe(20);
    expect((upper + lower) / 2).toBe(0);
  });

  it("아래 라벨만 두 줄(크기 [2, 1])이면 그 둘째 줄은 더 아래로 처지므로 간격은 1칸 10", () => {
    const [lower, upper] = resolveLabelPositions([0, 0], 10, [2, 1]);
    expect(upper - lower).toBe(10);
  });

  it("두 줄 라벨 위로 15 떨어진 라벨(간격 10, 크기 [1, 2])은 2칸 20이 필요해 벌어짐", () => {
    const [lower, upper] = resolveLabelPositions([0, 15], 10, [1, 2]);
    expect(upper - lower).toBe(20);
  });
});

describe("텍스트 측정·줄바꿈", () => {
  it("숫자 4자 1490은 14px에서 실측 31px보다 약간 넓은 33px 안팎", () => {
    expect(estimateTextWidth("1490", 14)).toBeGreaterThan(31);
    expect(estimateTextWidth("1490", 14)).toBeLessThan(35);
  });

  it("한글은 영문 소문자보다 넓게 어림", () => {
    expect(estimateTextWidth("가", 14)).toBeGreaterThan(estimateTextWidth("a", 14));
  });

  it("폭 100px을 넘는 문장은 공백에서 여러 줄로 나누고 각 줄은 100px 이하", () => {
    const lines = wrapText("가나다 라마바 사아자 차카타 파하", 100, 14);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(estimateTextWidth(line, 14)).toBeLessThanOrEqual(100);
  });

  it("줄바꿈 문자는 그대로 줄을 나눔", () => {
    expect(wrapText("첫 줄\n둘째 줄", 500, 14)).toEqual(["첫 줄", "둘째 줄"]);
  });
});

describe("describeNote — 레인 옆 노트 이름표", () => {
  it("결정 ④의 노트 넷은 N1 holdOnly 1000–1500, N2 바디 1500–1560, N3 head 1560, N4 바디 1560–1760", () => {
    expect(noteLabelsOf(D4)).toEqual([
      "N1 holdOnly 1000–1500",
      "N2 바디 1500–1560",
      "N3 head 1560",
      "N4 바디 1560–1760",
    ]);
  });

  it("double·trill·grace 종류어: double head, double 바디, trill, trill 바디, grace head, double holdOnly(holdOnly 바디는 바디를 생략)", () => {
    expect(noteLabelsOf("노트: dhead 0 | dlong 0-100 | trill 200 | tlong 200-300 | grace head 400 | dholdOnly 400-500")).toEqual([
      "N1 double head 0",
      "N2 double 바디 0–100",
      "N3 trill 200",
      "N4 trill 바디 200–300",
      "N5 grace head 400",
      "N6 double holdOnly 400–500",
    ]);
  });

  it("[가운데]를 붙인 노트는 자동 이름 뒤에 붙여 N2 가운데 바디 1500–1560", () => {
    expect(noteLabelsOf("노트: holdOnly 1000-1500 | long 1500-1560 [가운데]")[1]).toBe("N2 가운데 바디 1500–1560");
  });

  it("레인이 여럿이면 레인을 넣어 N1 L2 head 1000", () => {
    expect(noteLabelsOf("노트: L2: head 1000", { showLane: true })).toEqual(["N1 L2 head 1000"]);
  });
});

describe("describeJudgmentEvent — 실제 엔진 이벤트", () => {
  it("NJ-R16은 N1 head Perfect ±0 ← A↓0, N3 head Perfect +20 ← B↓1020, N4 release Perfect ±0 ← B↑2000", () => {
    expect(labelsOf(R16)).toEqual([
      "N1 head Perfect ±0 ← A↓0",
      "N3 head Perfect +20 ← B↓1020",
      "N4 release Perfect ±0 ← B↑2000",
    ]);
  });

  it("결정 ④는 N1 holdOnly Perfect ← A↑1430, N3 head Great −70 ← D↓1490, N4 release Perfect ±0 ← D↑1760", () => {
    const labels = labelsOf(D4);
    expect(labels).toContain("N1 holdOnly Perfect ← A↑1430");
    expect(labels).toContain("N3 head Great −70 ← D↓1490");
    expect(labels).toContain("N4 release Perfect ±0 ← D↑1760");
  });

  it("결정 ④의 N2 시작 실패 이유: A↑1430이 N2 끝−Good 1440보다 이르고, 시작 창의 D↓1490은 N3 head가 씀", () => {
    expect(labelsOf(D4)).toContain("N2 시작 실패 1620 — A↑1430 < 끝−Good 1440 · D↓1490 → N3 head");
  });

  it("N2에 [가운데]를 붙이면 판정 라벨도 가운데 시작 실패 1620으로 시작", () => {
    const labels = labelsOf(D4.replace("long 1500-1560", "long 1500-1560 [가운데]"));
    expect(labels).toContain("가운데 시작 실패 1620 — A↑1430 < 끝−Good 1440 · D↓1490 → N3 head");
  });

  it("R16에서 B를 누르지 않으면 N3 head Miss 1120 (입력 없음)과 N4 release 0점 처리 1120", () => {
    const labels = labelsOf("노트: head 0 | long 0-1000 | head 1000 | long 1000-2000\n입력: A 0-1015");
    expect(labels).toContain("N3 head Miss 1120 (입력 없음)");
    expect(labels).toContain("N4 release 0점 처리 1120");
  });

  it("바디 중간에 뗀 A 1000-1500은 N2 유지 실패 1500 — A↑1500 (끝−Good 1880 전)", () => {
    expect(labelsOf("노트: head 1000 | long 1000-2000\n입력: A 1000-1500")).toContain("N2 유지 실패 1500 — A↑1500 (끝−Good 1880 전)");
  });

  it("head 없는 바디 long 1000-2000에 입력이 없으면 N1 시작 실패 1120 — 새 입력 없음", () => {
    expect(labelsOf("노트: long 1000-2000")).toContain("N1 시작 실패 1120 — 새 입력 없음");
  });
});

describe("describeJudgmentEvent — 시작·유지 실패는 엔진 유닛 상태로 가림", () => {
  it("A↓500(시작 창 밖)으로 시작하지 못한 long 1000-2000은 기한 1120에 A↑1120이 있어도 N1 시작 실패 1120 — 새 입력 없음", () => {
    const labels = labelsOf(UNSTARTED_UP_AT_DEADLINE);
    expect(labels).toContain("N1 시작 실패 1120 — 새 입력 없음");
    expect(labels.join("\n")).not.toContain("유지 실패");
    expect(labels.join("\n")).not.toContain("A↑1120");
  });

  it("N1 head Miss로 시작하지 못한 holdOnly N3은 기한 1220에 A↑1220이 있어도 N3 시작 실패 1220 — 새 입력 없음(앞 바디 N2가 시작하지 않아 A↑1220 조각 없음)", () => {
    const labels = labelsOf(UNSTARTED_HOLDONLY);
    expect(labels).toContain("N3 시작 실패 1220 — 새 입력 없음");
    expect(labels.join("\n")).not.toContain("유지 실패");
    expect(labels.join("\n")).not.toContain("A↑1220");
  });

  it("S+Good 1120 경계에 A↑1120과 D↓1120이 같이 오면 A로 시작한 N2는 유지 실패 1120 — A↑1120 (끝−Good 1880 전)", () => {
    expect(labelsOf("노트: head 1000 | long 1000-2000\n입력: A 1000-1120 | D 1120-1300")).toContain("N2 유지 실패 1120 — A↑1120 (끝−Good 1880 전)");
  });

  it("엔진이 유닛 상태(bodyStates)를 주지 않으면 시작·유지를 가리지 않고 N1 실패 1120, 이유 없음", () => {
    expect(labelsOf(UNSTARTED_UP_AT_DEADLINE, { unitStates: null, unitStatesBeforeBatch: null })).toContain("N1 실패 1120");
  });
});

describe("describeJudgmentEvent — holdOnly 라벨의 입력", () => {
  it("A↑1430으로 끝난 holdOnly N1은 같은 시각 D↓1430을 빼고 N1 holdOnly Perfect ← A↑1430", () => {
    expect(labelsOf(HOLD_ONLY_UP_WITH_DOWN)).toContain("N1 holdOnly Perfect ← A↑1430");
  });

  it("같은 시각 다른 레인 B↓1430은 빼고 N1 holdOnly Perfect ← A↑1430", () => {
    expect(labelsOf(HOLD_ONLY_UP_WITH_OTHER_LANE)).toContain("N1 holdOnly Perfect ← A↑1430");
  });
});

describe("describeFailureReason — 바디 중간 유지 실패는 그 노트에 등록된 키의 뗌만", () => {
  it("doubleLong을 A·B로 쥐고 A만 1500에 떼면 엔진은 뒤 유닛 u2를 실패시키고, 같은 노트에 등록된 A를 인용해 N1u2 유지 실패 1500 — A↑1500 (끝−Good 1880 전)", () => {
    expect(labelsOf("노트: dlong 1000-2000\n입력: A 1000-1500 | B 1000-2000")).toContain("N1u2 유지 실패 1500 — A↑1500 (끝−Good 1880 전)");
  });

  it("A로 시작한 N4가 N2의 D↑1060에 실패해도(바디 시작 1100 전, D는 N4 등록 키 아님) 이유 없이 N4 유지 실패 1060", () => {
    const labels = labelsOf(EARLY_SUCCESSOR);
    expect(labels).toContain("N4 유지 실패 1060");
    expect(labels.join("\n")).not.toContain("D↑1060");
  });
});

describe("describeFailureReason — 확실하지 않으면 생략", () => {
  const panel = panelFor(D4);
  const startFailure = event({ kind: "maintenanceMiss", noteIndex: 1, unitIndex: 0, grade: "miss", deltaMs: 120, confirmedAt: 1620 });

  it("앞 바디를 쥔 키 A가 끝−Good 1440 뒤(1450)에 떼졌으면 키 조각을 빼고 시작 창 입력만 남김(N2를 시작 실패로 바꾼 엔진 상태)", () => {
    const later = panelFor(D4.replace("A 1000-1430", "A 1000-1450"));
    const run = withUnit(later.run, 1, { active: false, failed: true, complete: false, registeredKeys: [] });
    expect(labelText(describeFailureReason(startFailure, later.judgmentCase, run))).toBe("D↓1490 → N3 head");
  });

  it("앞 바디 N1이 시작하지 않았으면(등록 키 없음) A↑1430 조각을 빼고 D↓1490 → N3 head만", () => {
    const run = withUnit(panel.run, 0, { active: false, failed: true, complete: false, registeredKeys: [] });
    expect(labelText(describeFailureReason(startFailure, panel.judgmentCase, run))).toBe("D↓1490 → N3 head");
  });

  it("시작 창의 D↓1490을 쓴 판정 이벤트가 없으면 입력 조각을 빼고 A↑1430 < 끝−Good 1440만", () => {
    const withoutHead = panel.run.events.filter((candidate) => candidate.kind !== "head");
    expect(labelText(describeFailureReason(startFailure, panel.judgmentCase, { ...panel.run, events: withoutHead }))).toBe("A↑1430 < 끝−Good 1440");
  });

  it("maintenanceMiss가 아닌 판정(head Great)에는 이유가 없음", () => {
    const head = panel.run.events.find((candidate) => candidate.kind === "head")!;
    expect(describeFailureReason(head, panel.judgmentCase, panel.run)).toEqual([]);
  });

  it("시작했던 N2가 끝 + Good(1680)에 유지 실패로 확정되면 바디 밖이라 이유를 붙이지 않음", () => {
    const endFailure = event({ kind: "maintenanceMiss", noteIndex: 1, unitIndex: 0, grade: "miss", deltaMs: 120, confirmedAt: 1680 });
    const run = withUnit(panel.run, 1, { active: true, failed: true, registeredKeys: ["A"] });
    expect(describeFailureReason(endFailure, panel.judgmentCase, run)).toEqual([]);
  });
});

describe("describeJudgmentEvent — 표기 규칙", () => {
  const judgmentCase = judgmentCaseFromSource("노트: head 1000 | dlong 1000-2000 | dhead 1000\n입력: A 1000-1500 | B 1000-2000");

  it("입력 시각과 확정 시각이 다르면 · 확정 시각을 덧붙이고, doubleLong 유닛 1은 이름 뒤 u1: N2u1", () => {
    const label = describeJudgmentEvent(event({ kind: "release", noteIndex: 1, unitIndex: 0, deltaMs: -500, inputAt: 1500, confirmedAt: 1620, key: "A" }), judgmentCase);
    expect(labelText(label)).toBe("N2u1 release Perfect −500 ← A↑1500 · 확정 1620");
  });

  it("double head 유닛 2의 판정은 N3u2 head", () => {
    const label = describeJudgmentEvent(event({ noteIndex: 2, unitIndex: 1, inputAt: 1000, confirmedAt: 1000, key: "B" }), judgmentCase);
    expect(labelText(label)).toBe("N3u2 head Perfect ±0 ← B↓1000");
  });

  it("입력 없이 확정된 holdOnly Perfect는 (유지 완료)", () => {
    const label = describeJudgmentEvent(event({ kind: "holdOnly", noteIndex: 1, confirmedAt: 2000 }), judgmentCase);
    expect(labelText(label)).toBe("N2 holdOnly Perfect 2000 (유지 완료)");
  });

  it("key가 없는 holdOnly 이벤트는 같은 시각·같은 레인의 뗌만 보여줌: 1430의 D↓·L2 B↓를 빼고 A↑1430", () => {
    const lanes = judgmentCaseFromSource("노트: holdOnly 1000-1500 | L2: head 1430\n입력: A 1000-1430 | D 1430-1600 | L2:B 1430-1440");
    const label = describeJudgmentEvent(event({ kind: "holdOnly", noteIndex: 0, inputAt: 1430, confirmedAt: 1430 }), lanes);
    expect(labelText(label)).toBe("N1 holdOnly Perfect ← A↑1430");
  });

  it("key가 없는 holdOnly 이벤트의 시각에 같은 레인 뗌이 없으면 그 시각의 누름 A↓1000을 보여줌", () => {
    const label = describeJudgmentEvent(event({ kind: "holdOnly", noteIndex: 1, inputAt: 1000, confirmedAt: 1000 }), judgmentCase);
    expect(labelText(label)).toBe("N2 holdOnly Perfect ← A↓1000·B↓1000");
  });

  it("입력 시각에 맞는 입력이 없으면 @시각으로 표시", () => {
    const label = describeJudgmentEvent(event({ inputAt: 1234, confirmedAt: 1234, deltaMs: 234 }), judgmentCase);
    expect(labelText(label)).toBe("N1 head Perfect +234 ← @1234");
  });

  describe("doubleLong 유닛 1이 1500 입력 batch에서 유지 실패", () => {
    const failure = event({ kind: "maintenanceMiss", noteIndex: 1, unitIndex: 0, grade: "miss", confirmedAt: 1500 });
    const runWith = (registeredKeys: string[]) => ({
      events: [],
      unitStates: [unitState({ noteIndex: 1, failed: true, registeredKeys })],
      unitStatesBeforeBatch: [{ atMs: 1500, unitStates: [unitState({ noteIndex: 1, registeredKeys })] }],
    });

    it("1500 batch 직전 등록 키가 [A]면 N2u1 유지 실패 1500, 이유는 A↑1500 (끝−Good 1880 전)", () => {
      expect(labelText(describeJudgmentEvent(failure, judgmentCase, runWith(["A"])))).toBe("N2u1 유지 실패 1500");
      expect(labelText(describeFailureReason(failure, judgmentCase, runWith(["A"])))).toBe("A↑1500 (끝−Good 1880 전)");
    });

    it("1500 batch 직전 이 노트의 등록 키가 [B]뿐이면 A↑1500은 이 바디를 쥔 키의 뗌이 아니라 이유 없음", () => {
      expect(describeFailureReason(failure, judgmentCase, runWith(["B"]))).toEqual([]);
    });

    it("1500 batch 직전 상태가 없으면(프레임에서 확정 등) 키를 정할 수 없어 이유 없음", () => {
      expect(describeFailureReason(failure, judgmentCase, { ...runWith(["A"]), unitStatesBeforeBatch: [] })).toEqual([]);
    });

    it("유닛 상태가 없으면 N2u1 실패 1500, 이유 없음", () => {
      expect(labelText(describeJudgmentEvent(failure, judgmentCase))).toBe("N2u1 실패 1500");
      expect(describeFailureReason(failure, judgmentCase, { events: [] })).toEqual([]);
    });
  });

  it("바디 시작 1100 전(1060)에 확정된 유지 실패는 등록 키 A의 A↑1060이어도 이유 없음", () => {
    const early = judgmentCaseFromSource("노트: head 1000 | long 1000-1100 | head 1100 | long 1100-1200\n입력: A 990-1060");
    const failure = event({ kind: "maintenanceMiss", noteIndex: 3, unitIndex: 0, grade: "miss", confirmedAt: 1060 });
    const run = {
      events: [],
      unitStates: [unitState({ noteIndex: 3, failed: true, registeredKeys: ["A"] })],
      unitStatesBeforeBatch: [{ atMs: 1060, unitStates: [unitState({ noteIndex: 3, registeredKeys: ["A"] })] }],
    };
    expect(labelText(describeJudgmentEvent(failure, early, run))).toBe("N4 유지 실패 1060");
    expect(describeFailureReason(failure, early, run)).toEqual([]);
  });

  it("goodTrill 등급은 Good◇로 표시", () => {
    const label = describeJudgmentEvent(event({ grade: "goodTrill", inputAt: 1000, confirmedAt: 1000, key: "A" }), judgmentCase);
    expect(labelText(label)).toBe("N1 head Good◇ ±0 ← A↓1000");
  });
});

describe("renderJudgmentCaseSvg", () => {
  it("제목·메모·판정 라벨과 키 열 라벨 A↓1000·A↑1430·D↓1490을 담음", () => {
    const { svg } = render([panelFor(D4)]);
    expect(svg).toContain("결정 ④ — A를 1430에 뗌");
    expect(svg).toContain("가설 메모");
    for (const text of ["A↓1000", "A↑1430", "D↓1490", "D↑1760", "시작 실패"]) expect(svg).toContain(text);
  });

  it("입력 시각마다 점선 가이드를 긋고 노트·입력 시각마다 축 눈금을 둠", () => {
    const { svg } = render([panelFor(D4)]);
    for (const ms of ["1000", "1430", "1490", "1760"]) expect(svg).toMatch(new RegExp(`data-input-guide-ms="${ms}"[^>]*stroke-dasharray`));
    for (const ms of ["1000", "1430", "1490", "1500", "1560", "1760"]) expect(svg).toContain(`data-tick-ms="${ms}"`);
  });

  it("Classic 스킨으로 그림: head N3은 noteSingle, 바디 N2·N4는 bodySingle, 싱글 터미널은 중앙광이 꺼진 terminalSingleIdle", () => {
    const { svg } = render([panelFor(D4)]);
    expect(skinAssetsOf(svg, 2, "point")).toEqual(["noteSingle"]);
    for (const index of [1, 3]) expect(skinAssetsOf(svg, index, "body")).toEqual(["bodySingle"]);
    for (const index of [0, 1, 3]) {
      expect(skinAssetsOf(svg, index, "end")).toEqual(["terminalSingleIdle"]);
      expect(skinAssetsOf(svg, index, "start")).toEqual(["terminalSingleIdle"]);
    }
  });

  it("에셋 이미지는 defs에 한 번만 넣고 노트는 #jc-skin-키로 참조: 패널 둘이어도 noteSingle 정의는 하나", () => {
    const { svg } = render([panelFor(D4), panelFor(D4, {}, "pr")]);
    expect(svg.match(/<image id="jc-skin-noteSingle"/g)).toHaveLength(1);
    expect(svg).toContain('href="data:image/png;base64,noteSingle"');
    expect(svg).toContain('<use href="#jc-skin-noteSingle"/>');
  });

  it("head가 있는 long N4도 시작 터미널을 그리고 head N3 포인트가 그 위에 옴(게임 레이어: 바디 < 끝 < 시작 < 포인트)", () => {
    const { svg } = render([panelFor(D4)]);
    expect(partOrder(svg, 3, "body")).toBeLessThan(partOrder(svg, 0, "end"));
    expect(partOrder(svg, 0, "end")).toBeLessThan(partOrder(svg, 1, "start"));
    expect(partOrder(svg, 3, "start")).toBeLessThan(partOrder(svg, 2, "point"));
  });

  it("holdOnly N1 끝 터미널에 terminalGraceOverlay를 끝 터미널보다 먼저(아래에) 그리고, holdOnly 아닌 N2·N4에는 그리지 않음", () => {
    const { svg } = render([panelFor(D4)]);
    expect(skinAssetsOf(svg, 0, "overlay")).toEqual(["terminalGraceOverlay"]);
    expect(partOrder(svg, 0, "overlay")).toBeLessThan(partOrder(svg, 0, "end"));
    for (const index of [1, 3]) expect(skinAssetsOf(svg, index, "overlay")).toEqual([]);
  });

  it("터미널·포인트는 시각 선에 가운데를 맞춤: head 1560 포인트(높이 16px)의 y + 8 = 1560 축 눈금 y", () => {
    const { svg } = render([panelFor(D4)]);
    const tickY = Number(svg.match(/data-tick-ms="1560" x="[\d.]+" y="([\d.]+)"/)![1]);
    const pointY = Number(svg.match(/data-note-index="2" data-note-type="single" data-note-part="point" data-skin-asset="noteSingle" x="[\d.]+" y="([\d.]+)" width="80" height="16"/)![1]);
    expect(pointY + 8).toBeCloseTo(tickY, 1);
  });

  it("롱노트도 게임과 같은 노트 가운데 기준(#224): long N4 1560–1760 바디는 1760 시각 선 8px 위부터 1560 시각 선 8px 아래까지, Classic 끝·시작 터미널(16px) 가운데는 각 시각 선", () => {
    const { svg } = render([panelFor(D4)]);
    const body = svg.match(/data-note-index="3" data-note-type="long" data-note-part="body"[^>]*>(?:<pattern[^>]*>.*?<\/pattern>)?<rect x="[\d.]+" y="([-\d.]+)" width="[\d.]+" height="([\d.]+)"/)!;
    const terminal = (part: string) => {
      const match = svg.match(new RegExp(`data-note-index="3" data-note-type="long" data-note-part="${part}" data-skin-asset="[^"]+" x="[\\d.]+" y="([-\\d.]+)" width="[\\d.]+" height="([\\d.]+)"`))!;
      return { top: Number(match[1]), height: Number(match[2]) };
    };
    const [bodyTop, bodyHeight] = [Number(body[1]), Number(body[2])];
    expect(bodyTop).toBeCloseTo(tickY(svg, 1760) - 8, 1);
    expect(bodyTop + bodyHeight).toBeCloseTo(tickY(svg, 1560) + 8, 1);
    const end = terminal("end");
    const start = terminal("start");
    expect(end.height).toBeCloseTo(16, 1);
    expect(end.top + 8).toBeCloseTo(tickY(svg, 1760), 1);
    expect(start.top + 8).toBeCloseTo(tickY(svg, 1560), 1);
  });

  it("Classic 바디는 늘이지 않고 반복: 레인 80px에서 바디 폭 80 × 200/212 ≈ 75.47px, 세로 주기 40 × 75.47/200 ≈ 15.09px 패턴", () => {
    const { svg } = render([panelFor(D4)]);
    const pattern = svg.match(/<pattern id="jc-tile-0-1" patternUnits="userSpaceOnUse" x="[\d.]+" y="[\d.]+" width="([\d.]+)" height="([\d.]+)">/);
    expect(Number(pattern![1])).toBeCloseTo(75.47, 2);
    expect(Number(pattern![2])).toBeCloseTo(15.09, 2);
    expect(svg).toMatch(/data-note-index="1" data-note-type="long" data-note-part="body" data-skin-asset="bodySingle"[^>]*>(<pattern[^>]*>)?.*?fill="url\(#jc-tile-0-1\)"/);
  });

  it("판정과 상관없이 대기 모양만: 결정 ④·H08 대조의 실패한 바디도 대기 에셋이고, 스킨 참조에 켜짐(Held)·실패(Failed)·부분 상태 에셋이 없음", () => {
    for (const text of [D4, H08_LATE]) {
      const { svg } = render([panelFor(text)]);
      const refs = [...svg.matchAll(/data-skin-asset="([^"]+)"|href="#jc-skin-([^"]+)"|<image id="jc-skin-([^"]+)"/g)].map((match) => match[1] ?? match[2] ?? match[3]);
      expect(refs.length).toBeGreaterThan(0);
      expect(refs.join(" ")).not.toMatch(/Held|Failed|Partial/);
    }
    const d4 = render([panelFor(D4)]).svg;
    expect(d4).toMatch(/data-judgment-kind="maintenanceMiss"[^>]*>.*N2.*시작 실패.*1620/);
    expect(skinAssetsOf(d4, 1, "body")).toEqual(["bodySingle"]);
    expect(d4).not.toContain("빗금");
    const { svg } = render([panelFor(H08_LATE)]);
    for (const index of [1, 2, 3, 4]) expect(skinAssetsOf(svg, index, "body")).toEqual(["bodySingle"]);
    expect(svg).not.toMatch(/data-failed-|jc-failed/);
  });

  it("레인 옆에 노트마다 이름표 N1~N4를 달고 바디는 구간 괄호, head는 눈금으로 잇는다", () => {
    const { svg } = render([panelFor(D4)]);
    for (const text of ["N1", "N2", "N3", "N4"]) expect(svg).toContain(`data-note-label="${text}"`);
    expect(svg).toContain("1500–1560</tspan>");
    for (const name of ["N1", "N2", "N4"]) expect(svg).toMatch(new RegExp(`data-note-span="${name}"[^>]*d="M[^"]*V`));
    expect(svg).toContain('data-note-tick="N3"');
  });

  it("레인이 둘이면 시간이 겹치는 L1 바디 1000–1500과 L2 바디 1200–1800의 구간 괄호를 다른 x에 그림", () => {
    const { svg } = render([panelFor("노트: head 1000 | long 1000-1500 | L2: head 1200 | L2: long 1200-1800\n입력: A 1000-1500 | L2:J 1200-1800")]);
    const spanX = (name: string) => Number(svg.match(new RegExp(`data-note-span="${name}" d="M[\\d.]+ [\\d.]+ H([\\d.]+) V`))![1]);
    expect(spanX("N2")).not.toBe(spanX("N4"));
  });

  it("노트 이름표끼리 겹치지 않음: 이름표 y 간격이 모두 16px 이상", () => {
    const { svg } = render([panelFor("노트: head 1000 | long 1000-1010 | head 1010 | long 1010-1020 | head 1020 | long 1020-1500\n입력: A 1000-1500")]);
    const ys = [...svg.matchAll(/<text x="[\d.]+" y="([-\d.]+)"[^>]*data-note-label=/g)].map((match) => Number(match[1])).sort((a, b) => a - b);
    expect(ys).toHaveLength(6);
    for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(16);
  });

  it("노트 시작·끝 시각마다 레인을 가로지르는 경계선: 결정 ④는 1000·1500·1560·1760", () => {
    const { svg } = render([panelFor(D4)]);
    const boundaries = [...svg.matchAll(/data-note-boundary-ms="([\d.]+)"/g)].map((match) => match[1]);
    expect(boundaries).toEqual(["1000", "1500", "1560", "1760"]);
  });

  it("시작 실패 판정 아래 줄에 이유를 그림: data-judgment-reason에 A↑1430 < 끝−Good 1440", () => {
    const { svg } = render([panelFor(D4)]);
    expect(svg).toMatch(/data-judgment-reason="true"[^>]*>.*A↑1430.*끝−Good 1440.*N3/);
  });

  it("바닥글에 등급별 개수·달성률·Full Combo·엔진 표시", () => {
    const { svg } = render([panelFor(R16)]);
    expect(svg).toContain("Perfect 3");
    expect(svg).toContain("달성률 100.00%");
    expect(svg).toContain(">Full Combo<");
    expect(svg).toContain("엔진: main @abc1234 — /repo/main");
  });

  it("미정산 score item은 강조 상자와 항목 id로 표시", () => {
    const panel = panelFor(R16, { unsettledItems: [{ id: "n3:release:0", kind: "release", noteIndex: 3, unitIndex: 0, timeMs: 2000 }] });
    const { svg } = render([panel]);
    expect(svg).toContain("미정산 score item 1개");
    expect(svg).toContain('data-unsettled-item="n3:release:0"');
    expect(svg).toContain("N4 release @2000 (n3:release:0)");
  });

  it("#180 회귀: head 1000 + holdOnly 1000-1200에 D 890-930 tap이면 예외 없이 finalize하고 head Good(−110)·1320 유지 Miss·holdOnly 항목 종속 0점으로 항목 2개를 한 번씩 정산해 바닥글이 Good 1·Miss 1·달성률 16.67%·Full Combo 아님", () => {
    const panel = panelFor(HOLD_ONLY_EARLY_TAP_180);
    const { run } = panel;
    expect({ finalized: run.finalized, error: run.error, unsettled: run.unsettledItems, processed: run.processedNotes, total: run.totalNotes })
      .toEqual({ finalized: true, error: null, unsettled: [], processed: 2, total: 2 });
    expect(run.events.map((e) => [e.kind, e.noteIndex, e.itemId, e.grade, e.deltaMs, e.confirmedAt, e.key])).toEqual([
      ["head", 0, "n0:head", "good", -110, 890, "D"],
      ["maintenanceMiss", 1, undefined, "miss", 120, 1320, undefined],
      ["dependentZero", 1, "n1:holdOnly:0", "miss", 0, 1320, undefined],
    ]);
    const settledIds = run.events.flatMap((e) => (e.itemId === undefined ? [] : [e.itemId]));
    expect([...settledIds].sort()).toEqual(run.scoreItems.map((item) => item.id).sort());
    expect(run.events.some((e) => e.kind === "release")).toBe(false);
    expect({ counts: run.counts, isFullCombo: run.isFullCombo }).toEqual({ counts: { perfect: 0, great: 0, good: 1, goodTrill: 0, miss: 1 }, isFullCombo: false });
    const { svg } = render([panel]);
    expect(svg).toContain("Good 1");
    expect(svg).toContain("Miss 1");
    expect(svg).toContain("달성률 16.67%");
    expect(svg).toContain("Full Combo 아님");
    expect(svg).not.toContain("판정 불가(finalize 전)");
    expect(svg).not.toContain("엔진 예외");
  });

  it("엔진 예외로 finalize 전에 멈춘 run(가짜 결과: 1328ms 예외, 중간 isFullCombo true)이면 바닥글에 Full Combo 대신 판정 불가(finalize 전)와 예외를 표시", () => {
    const panel = panelFor(R16, { finalized: false, isFullCombo: true, error: { message: "미등록 또는 중복 점수 정산: n1:release:0", atMs: 1328 } });
    const { svg } = render([panel]);
    expect(svg).toContain("판정 불가(finalize 전)");
    expect(svg).not.toContain(">Full Combo<");
    expect(svg).toContain("엔진 예외 @1328ms: 미등록 또는 중복 점수 정산: n1:release:0");
  });

  it("finalize 전 run(가짜 엔진 결과)이면 Full Combo 아님도 쓰지 않고 판정 불가(finalize 전)", () => {
    const { svg } = render([panelFor(R16, { finalized: false, isFullCombo: false })]);
    expect(svg).toContain("판정 불가(finalize 전)");
    expect(svg).not.toContain("Full Combo 아님");
  });

  it("범례에 프레임에서 확정되는 시각은 0ms 시작 16ms 격자 기준임을 적음", () => {
    expect(render([panelFor(R16)]).svg).toContain("0ms 시작 16ms 격자");
  });

  it("엔진 예외는 시각과 메시지를 바닥글에 표시", () => {
    const panel = panelFor(R16, { error: { message: "중복 또는 미등록 score item: n1:release:0", atMs: 1392 } });
    expect(render([panel]).svg).toContain("엔진 예외 @1392ms: 중복 또는 미등록 score item: n1:release:0");
  });

  it("검증 오류는 한국어 라벨과 rule을 바닥글에 표시하고 렌더는 계속", () => {
    const { svg } = render([panelFor("노트: long 1000-2000 | head 1500\n입력: A 1000-2000")]);
    expect(svg).toContain("검증 오류");
    expect(svg).toContain("롱노트 겹침 (longOverlap)");
    expect(svg).toContain('data-validation-rule="longOverlap"');
  });

  it("떼지 않은 입력 B 1700-는 B↓1700 (계속)으로 표시", () => {
    const { svg } = render([panelFor("노트: head 1700 | long 1700-2000\n입력: B 1700-")]);
    expect(svg).toContain("B↓1700 (계속)");
    expect(svg).toContain('data-input-up="held"');
  });

  it("double head는 noteDouble과 위(뒤집음)·아래 pointContactShadow 두 장, trill 포인트는 noteTrill과 마름모를 따르는 pointContactShadowTrill 한 장", () => {
    const { svg } = render([panelFor("노트: dhead 1000 | trill 1200\n입력: A 1000-1050 | B 1000-1050 | A 1200-1250")]);
    expect(skinAssetsOf(svg, 0, "point")).toEqual(["noteDouble"]);
    expect(skinAssetsOf(svg, 0, "shadow")).toEqual(["pointContactShadow", "pointContactShadow"]);
    expect(svg).toMatch(/<g transform="matrix\(1 0 0 -1 0 [\d.]+\)"><svg data-note-index="0" data-note-type="double" data-note-part="shadow"/);
    expect(partOrder(svg, 0, "shadow")).toBeLessThan(partOrder(svg, 0, "point"));
    expect(skinAssetsOf(svg, 1, "point")).toEqual(["noteTrill"]);
    expect(skinAssetsOf(svg, 1, "shadow")).toEqual(["pointContactShadowTrill"]);
  });

  it("trillLong은 bodyTrill 바디와 terminalTrillIdle 끝 터미널만 그리고 시작 터미널은 없음(시작은 trill 포인트), trillZone은 #00ff88 띠", () => {
    const { svg } = render([panelFor("노트: trill 1000 | tlong 1000-1300 | trill 1300\n입력: A 1000-1300 | B 1300-1350")]);
    expect(skinAssetsOf(svg, 1, "body")).toEqual(["bodyTrill"]);
    expect(skinAssetsOf(svg, 1, "end")).toEqual(["terminalTrillIdle"]);
    expect(skinAssetsOf(svg, 1, "start")).toEqual([]);
    expect(svg).toMatch(/data-trill-zone="1"[^>]*fill="#00ff88"/);
  });

  it("trillZone 1000–1300은 게임처럼 롱노트 바디 범위: 1300 시각 선보다 노트 반 칸(8px) 위부터 1000 시각 선보다 8px 아래까지", () => {
    const { svg } = render([panelFor("노트: trill 1000 | tlong 1000-1300 | trill 1300\n입력: A 1000-1300 | B 1300-1350")]);
    const zone = trillZoneBox(svg, 1);
    expect(zone.top).toBeCloseTo(tickY(svg, 1300) - 8, 1);
    expect(zone.top + zone.height).toBeCloseTo(tickY(svg, 1000) + 8, 1);
  });

  it("길이 0 trillZone(zone 1500-1500)도 노트 한 칸(16px) 높이로 1500 시각 선에 가운데를 맞춤", () => {
    const { svg } = render([panelFor("노트: zone 1500-1500 | trill 1500\n입력: A 1500-1550")]);
    const zone = trillZoneBox(svg, 1);
    expect(zone.height).toBeCloseTo(16, 1);
    expect(zone.top).toBeCloseTo(tickY(svg, 1500) - 8, 1);
  });

  it("grace head는 포인트보다 먼저 pointGraceOverlay를 그리고, 길이 0 holdOnly 1500-1500은 시작 터미널 하나와 그 overlay(끝 터미널 없음)", () => {
    const { svg } = render([panelFor("노트: grace head 1000 | head 1500 | holdOnly 1500-1500\n입력: A 1000-1050 | A 1500-1600")]);
    expect(skinAssetsOf(svg, 0, "overlay")).toEqual(["pointGraceOverlay"]);
    expect(partOrder(svg, 0, "overlay")).toBeLessThan(partOrder(svg, 0, "point"));
    expect(skinAssetsOf(svg, 2, "start")).toEqual(["terminalSingleIdle"]);
    expect(skinAssetsOf(svg, 2, "end")).toEqual([]);
    expect(skinAssetsOf(svg, 2, "overlay")).toEqual(["terminalGraceOverlay"]);
  });

  it("Simple(반쪽 캡)은 바디를 늘이고 끝·시작에 terminalSingle 윗부분 절반(viewBox 0 0 100 10) 캡, Grace는 overlay 에셋 없이 흰 글로우", () => {
    const { svg } = render([panelFor("노트: grace head 1000 | long 1000-1400\n입력: A 1000-1400")], { skin: makeTestSkin("simple") });
    expect(skinAssetsOf(svg, 1, "body")).toEqual(["bodySingle"]);
    expect(svg).not.toContain("<pattern");
    expect(svg).toMatch(/data-note-index="1" data-note-type="long" data-note-part="end" data-skin-asset="terminalSingle"[^>]*viewBox="0 0 100 10"/);
    expect(svg).toMatch(/data-note-index="1" data-note-type="long" data-note-part="start" data-skin-asset="terminalSingle"[^>]*viewBox="0 0 100 10"/);
    expect(svg).toContain('data-note-index="0" data-note-type="single" data-note-part="overlay" data-grace-glow="true"');
  });

  it("Crystal(반쪽 캡)은 전용 캡 endCapSingle 전체를 끝·시작 캡으로 씀", () => {
    const { svg } = render([panelFor("노트: head 1000 | long 1000-1400\n입력: A 1000-1400")], { skin: makeTestSkin("crystal") });
    expect(skinAssetsOf(svg, 1, "end")).toEqual(["endCapSingle"]);
    expect(skinAssetsOf(svg, 1, "start")).toEqual(["endCapSingle"]);
  });

  it("Crystal·Simple의 trillLong 끝은 반쪽 캡이 아닌 terminalTrill 이미지 전체(viewBox 0 0 100 20)를 노트 한 칸 80×16에 그림", () => {
    for (const id of ["crystal", "simple"]) {
      const { svg } = render([panelFor("노트: trill 1000 | tlong 1000-1300 | trill 1300\n입력: A 1000-1300")], { skin: makeTestSkin(id) });
      expect(skinAssetsOf(svg, 1, "end")).toEqual(["terminalTrill"]);
      expect(svg).toMatch(/data-note-index="1" data-note-type="trillLong" data-note-part="end" data-skin-asset="terminalTrill"[^>]* width="80" height="16" viewBox="0 0 100 20"/);
    }
  });

  it("doubleLong 반쪽 캡: Crystal은 전용 endCapDouble 전체, Simple은 terminalDouble 윗부분 절반(둘 다 viewBox 0 0 100 10)을 끝·시작에 씀", () => {
    for (const [id, cap] of [["crystal", "endCapDouble"], ["simple", "terminalDouble"]]) {
      const { svg } = render([panelFor("노트: dhead 1000 | dlong 1000-1400\n입력: A 1000-1400 | B 1000-1400")], { skin: makeTestSkin(id) });
      for (const part of ["end", "start"]) {
        expect(skinAssetsOf(svg, 1, part)).toEqual([cap]);
        expect(svg).toMatch(new RegExp(`data-note-index="1" data-note-type="doubleLong" data-note-part="${part}" data-skin-asset="${cap}"[^>]*viewBox="0 0 100 10"`));
      }
    }
  });

  it("길이 0 long 1500-1500: Crystal·Simple은 끝·시작 반쪽 캡 두 개(높이 (20 − 5) / 2 × 0.8 = 6px), Classic은 시작 터미널 하나", () => {
    const text = "노트: long 1500-1500\n입력: A 1500-1550";
    for (const [id, cap] of [["crystal", "endCapSingle"], ["simple", "terminalSingle"]]) {
      const { svg } = render([panelFor(text)], { skin: makeTestSkin(id) });
      for (const part of ["end", "start"]) {
        expect(skinAssetsOf(svg, 0, part)).toEqual([cap]);
        expect(svg).toMatch(new RegExp(`data-note-index="0" data-note-type="long" data-note-part="${part}" data-skin-asset="${cap}"[^>]* height="6" viewBox`));
      }
    }
    const { svg } = render([panelFor(text)]);
    expect(skinAssetsOf(svg, 0, "end")).toEqual([]);
    expect(skinAssetsOf(svg, 0, "start")).toEqual(["terminalSingleIdle"]);
  });

  it("holdOnly 끝 overlay: Classic trillLong은 끝 터미널 아래 terminalGraceOverlay, overlay 에셋이 없는 Crystal·Simple은 trillLong·long 모두 게임 대체 글로우", () => {
    const text = "노트: trill 1000 | holdOnly tlong 1000-1300 | trill 1300 | L2: holdOnly 1000-1300\n입력: A 1000-1300 | L2:J 1000-1300";
    const classic = render([panelFor(text)]).svg;
    expect(skinAssetsOf(classic, 1, "overlay")).toEqual(["terminalGraceOverlay"]);
    expect(partOrder(classic, 1, "overlay")).toBeLessThan(partOrder(classic, 1, "end"));
    for (const id of ["crystal", "simple"]) {
      const { svg } = render([panelFor(text)], { skin: makeTestSkin(id) });
      expect(svg).toContain('data-note-index="1" data-note-type="trillLong" data-note-part="overlay" data-grace-glow="true"');
      expect(svg).toContain('data-note-index="3" data-note-type="long" data-note-part="overlay" data-grace-glow="true"');
      expect(partOrder(svg, 3, "overlay")).toBeLessThan(partOrder(svg, 3, "end"));
    }
  });

  it("비교 모드: 패널 2개를 나란히 그리고 각 머리글에 엔진 이름을 붙임", () => {
    const single = render([panelFor(D4)]);
    const compare = render([panelFor(D4, {}, "main @abc1234"), panelFor(D4, {}, "pr-188 @def5678")]);
    expect(compare.svg).toContain('data-panel="0"');
    expect(compare.svg).toContain('data-panel="1"');
    expect(compare.svg).toContain("엔진: main @abc1234</tspan>");
    expect(compare.svg).toContain("엔진: pr-188 @def5678</tspan>");
    expect(compare.width).toBeGreaterThan(single.width * 2);
    expect(single.svg).not.toContain('data-engine-header="true"');
  });

  it("같은 사례를 두 엔진으로 비교하면 같은 시각의 축 눈금이 두 패널에서 같은 y", () => {
    const judgmentCase = judgmentCaseFromSource(D4);
    const run = runJudgmentCase(judgmentCase, engine);
    const { svg } = render([
      { judgmentCase, run, engineLabel: "a" },
      { judgmentCase, run: { ...run, events: run.events.slice(0, 1) }, engineLabel: "b" },
    ]);
    const ys = [...svg.matchAll(/data-tick-ms="1490" x="[\d.]+" y="([\d.]+)"/g)].map((match) => match[1]);
    expect(ys).toHaveLength(2);
    expect(ys[0]).toBe(ys[1]);
  });

  it("서로 다른 사례(1000~1350과 3000~4000)는 각자 축을 써서 빈 구간 물결이 생기지 않음", () => {
    const { svg } = render([
      panelFor("노트: head 1000 | long 1000-1350\n입력: A 1000-1350"),
      panelFor("노트: head 3000 | long 3000-4000\n입력: A 3000-4000"),
    ]);
    expect(svg).not.toContain('data-axis-break="1350-3000"');
  });

  it("제목의 <·&는 XML 이스케이프", () => {
    expect(render([panelFor("제목: a<b & c\n노트: head 1000")]).svg).toContain("a&lt;b &amp; c");
  });

  it("긴 빈 구간을 줄인 자동 축에는 물결 표시, --scale(pxPerMs)을 주면 줄이지 않음", () => {
    expect(render([panelFor(R16)]).svg).toContain('data-axis-break="0-1000"');
    expect(render([panelFor(R16)], { pxPerMs: 0.5 }).svg).not.toContain("data-axis-break");
  });

  it("패널이 없으면 에러", () => {
    expect(() => render([])).toThrow();
  });
});

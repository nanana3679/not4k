/**
 * 위반 시각화 언어 — rule → 사람이 읽는 라벨 카탈로그 (RFD 0017 §7)
 *
 * i18n-ready: severity는 언어 무관 맵으로, 라벨은 locale별 사전으로 분리한다.
 * 지금은 ko 하나뿐이며 나중에 en 사전 추가만으로 확장한다.
 * message 자체의 i18n(검증기 개조)은 스코프 밖 — 백로그.
 */

import type { ValidationError, ValidationErrorRule } from "./index";

/**
 * structural = validateChartStructural이 내는 rule (setChart 하드 거부 버킷, §3-2).
 * semantic = validateChartSemantic이 내는 rule (낙관적 편집 transient 허용 버킷).
 */
export type ViolationSeverity = "structural" | "semantic";

export const RULE_SEVERITY: Record<ValidationErrorRule, ViolationSeverity> = {
  // 구조 — validateChartStructural (malformed 데이터·크래시 유발, 하드 거부)
  beatMalformed: "structural",
  laneMalformed: "structural",
  rangeInverted: "structural",
  timeSigNotNatural: "structural",
  // 의미 — validateChartSemantic (게임 판정 전제 위반, 저장·플레이 게이트 강제)
  duplicate: "semantic",
  longOverlap: "semantic",
  trillExclusive: "semantic",
  trillLongInvalid: "semantic",
  trillZoneOverlap: "semantic",
  restZoneOverlap: "semantic",
  restZoneExclusive: "semantic",
  eventOverlap: "semantic",
  eventDuplicate: "semantic",
  tutorialInputOverlap: "semantic",
  stopZone: "semantic",
  timeSigNotAtMeasureStart: "semantic",
};

// locale별 라벨 사전 — rule은 프로젝트 발명 코드 식별자라 라벨만 자연어(RFD 0010).
const catalogs: Record<string, Record<ValidationErrorRule, string>> = {
  ko: {
    beatMalformed: "박자 값 오류",
    laneMalformed: "레인 값 오류",
    rangeInverted: "구간 역전",
    timeSigNotNatural: "박자표 값 오류",
    timeSigNotAtMeasureStart: "박자표 위치 오류",
    duplicate: "중복 노트",
    longOverlap: "롱노트 겹침",
    trillExclusive: "트릴 배타 위반",
    trillLongInvalid: "트릴·롱 조합 불가",
    trillZoneOverlap: "트릴존 겹침",
    restZoneOverlap: "휴지 구간 겹침",
    restZoneExclusive: "휴지 구간 배타 위반",
    eventOverlap: "이벤트 겹침",
    eventDuplicate: "이벤트 중복",
    tutorialInputOverlap: "튜토리얼 입력 겹침",
    stopZone: "정지 구간 위반",
  },
};

/** rule의 사람이 읽는 라벨. 미지원 locale은 ko로 fallback한다. */
export function violationLabel(rule: ValidationErrorRule, locale = "ko"): string {
  const catalog = catalogs[locale] ?? catalogs.ko;
  return catalog[rule];
}

export interface ViolationListItem {
  rule: ValidationErrorRule;
  label: string;
  severity: ViolationSeverity;
  message: string;
}

/**
 * ValidationError[]를 표시용 리스트로 변환한다.
 * structural 항목을 semantic보다 먼저 배치하고, 같은 severity 안에서는
 * 입력 순서를 유지한다(안정 정렬). 각 항목에 label·severity를 부착한다.
 */
export function buildViolationList(
  errors: readonly ValidationError[],
  locale = "ko",
): ViolationListItem[] {
  const toItem = (e: ValidationError): ViolationListItem => ({
    rule: e.rule,
    label: violationLabel(e.rule, locale),
    severity: RULE_SEVERITY[e.rule],
    message: e.message,
  });
  const items = errors.map(toItem);
  return [
    ...items.filter((i) => i.severity === "structural"),
    ...items.filter((i) => i.severity === "semantic"),
  ];
}

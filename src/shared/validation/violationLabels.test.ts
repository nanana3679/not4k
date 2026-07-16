import { describe, it, expect } from "vitest";
import {
  RULE_SEVERITY,
  violationLabel,
  buildViolationList,
} from "./violationLabels";
import { validateChartStructural, validateChartSemantic } from "./index";
import type { ValidationError, ValidationErrorRule } from "./index";
import { beat } from "../types/beat";
import type { NoteEntity, TrillZone, RestZone, ChartEvent } from "../types/chart";

// ValidationError["rule"] 유니온 16종 전수 — 새 rule이 추가되면 이 배열과
// RULE_SEVERITY·카탈로그가 함께 갱신돼야 한다 (Record 타입이 컴파일 타임에도 강제).
const ALL_RULES: ValidationErrorRule[] = [
  "duplicate",
  "longOverlap",
  "trillExclusive",
  "trillLongInvalid",
  "trillZoneOverlap",
  "restZoneOverlap",
  "restZoneExclusive",
  "eventOverlap",
  "eventDuplicate",
  "tutorialInputOverlap",
  "stopZone",
  "timeSigNotNatural",
  "timeSigNotAtMeasureStart",
  "rangeInverted",
  "beatMalformed",
  "laneMalformed",
];

const err = (rule: ValidationErrorRule, message: string): ValidationError => ({
  rule,
  message,
});

// =========================================================================
// RULE_SEVERITY — rule 전수 분류
// =========================================================================

describe("RULE_SEVERITY", () => {
  it("16개 rule 전부 structural 또는 semantic으로 분류되어 있다 (누락 0)", () => {
    for (const rule of ALL_RULES) {
      expect(["structural", "semantic"]).toContain(RULE_SEVERITY[rule]);
    }
    expect(Object.keys(RULE_SEVERITY).sort()).toEqual([...ALL_RULES].sort());
  });

  it("validateChartStructural이 내는 4종(beatMalformed·laneMalformed·rangeInverted·timeSigNotNatural)은 전부 structural", () => {
    // 4종을 동시에 위반하는 fixture — 구조 검증이 실제로 내는 rule과 분류가 정합해야 한다.
    const errors = validateChartStructural({
      notes: [
        { type: "single", lane: 1, beat: { n: 5, d: 0 } }, // beatMalformed (d=0)
        { type: "single", lane: 0.5, beat: beat(0) }, // laneMalformed (비정수)
        { type: "long", lane: 1, beat: beat(4), endBeat: beat(2) }, // rangeInverted
      ] as NoteEntity[],
      trillZones: [] as TrillZone[],
      events: [
        { type: "timeSignature", beat: beat(0), beatPerMeasure: beat(-4) }, // timeSigNotNatural
      ] as ChartEvent[],
    });
    const rules = new Set(errors.map((e) => e.rule));
    expect(rules).toEqual(
      new Set(["beatMalformed", "laneMalformed", "rangeInverted", "timeSigNotNatural"]),
    );
    for (const rule of rules) {
      expect(RULE_SEVERITY[rule]).toBe("structural");
    }
  });

  it("validateChartSemantic이 내는 rule(duplicate·trillZoneOverlap 등)은 전부 semantic", () => {
    const errors = validateChartSemantic({
      notes: [
        { type: "single", lane: 1, beat: beat(0) },
        { type: "single", lane: 1, beat: beat(0) }, // duplicate
      ] as NoteEntity[],
      trillZones: [
        { lane: 2, beat: beat(0), endBeat: beat(4) },
        { lane: 2, beat: beat(2), endBeat: beat(6) }, // trillZoneOverlap
      ] as TrillZone[],
      events: [] as ChartEvent[],
      restZones: [
        { lane: 3, beat: beat(0), endBeat: beat(4) },
        { lane: 3, beat: beat(2), endBeat: beat(6) }, // restZoneOverlap
        { lane: 2, beat: beat(0), endBeat: beat(4) }, // restZoneExclusive (trillZone과 겹침)
      ] as RestZone[],
    });
    const rules = new Set(errors.map((e) => e.rule));
    expect(rules.has("duplicate")).toBe(true);
    expect(rules.has("trillZoneOverlap")).toBe(true);
    expect(rules.has("restZoneOverlap")).toBe(true);
    expect(rules.has("restZoneExclusive")).toBe(true);
    for (const rule of rules) {
      expect(RULE_SEVERITY[rule]).toBe("semantic");
    }
  });

  it("structural은 정확히 4종, semantic은 정확히 12종", () => {
    const structural = ALL_RULES.filter((r) => RULE_SEVERITY[r] === "structural");
    const semantic = ALL_RULES.filter((r) => RULE_SEVERITY[r] === "semantic");
    expect(structural.sort()).toEqual(
      ["beatMalformed", "laneMalformed", "rangeInverted", "timeSigNotNatural"].sort(),
    );
    expect(semantic).toHaveLength(12);
  });
});

// =========================================================================
// violationLabel — ko 카탈로그 + locale fallback
// =========================================================================

describe("violationLabel", () => {
  it("16개 rule 전부 ko 라벨이 존재한다 (빈 문자열 없음)", () => {
    for (const rule of ALL_RULES) {
      const label = violationLabel(rule, "ko");
      expect(label, `rule=${rule}`).toBeTruthy();
      expect(label.trim().length, `rule=${rule}`).toBeGreaterThan(0);
    }
  });

  it("duplicate → '중복 노트', beatMalformed → '박자 값 오류' (ko 라벨 구체값)", () => {
    expect(violationLabel("duplicate")).toBe("중복 노트");
    expect(violationLabel("beatMalformed")).toBe("박자 값 오류");
  });

  it("restZoneOverlap → '휴지 구간 겹침', restZoneExclusive → '휴지 구간 배타 위반' (RFD 0019)", () => {
    expect(violationLabel("restZoneOverlap")).toBe("휴지 구간 겹침");
    expect(violationLabel("restZoneExclusive")).toBe("휴지 구간 배타 위반");
  });

  it("미지원 locale 'en'을 넘기면 ko 라벨로 fallback한다", () => {
    for (const rule of ALL_RULES) {
      expect(violationLabel(rule, "en")).toBe(violationLabel(rule, "ko"));
    }
  });

  it("locale 생략 시 기본값은 ko", () => {
    expect(violationLabel("longOverlap")).toBe(violationLabel("longOverlap", "ko"));
  });
});

// =========================================================================
// buildViolationList — 정렬 + label·severity 부착
// =========================================================================

describe("buildViolationList", () => {
  it("위반 0건이면 빈 배열을 반환한다", () => {
    expect(buildViolationList([])).toEqual([]);
  });

  it("각 항목에 rule·label·severity·message가 올바로 부착된다", () => {
    const list = buildViolationList([err("duplicate", "겹치는 노트 A")]);
    expect(list).toEqual([
      {
        rule: "duplicate",
        label: violationLabel("duplicate"),
        severity: "semantic",
        message: "겹치는 노트 A",
      },
    ]);
  });

  it("structural 위반(beatMalformed)을 semantic 위반(duplicate)보다 먼저 배치한다", () => {
    const list = buildViolationList([
      err("duplicate", "m1"),
      err("beatMalformed", "m2"),
      err("longOverlap", "m3"),
      err("rangeInverted", "m4"),
    ]);
    expect(list.map((v) => v.rule)).toEqual([
      "beatMalformed",
      "rangeInverted",
      "duplicate",
      "longOverlap",
    ]);
  });

  it("같은 severity 안에서는 입력 순서를 유지한다 (안정 정렬)", () => {
    const list = buildViolationList([
      err("stopZone", "s1"),
      err("duplicate", "s2"),
      err("stopZone", "s3"),
      err("laneMalformed", "h1"),
      err("beatMalformed", "h2"),
    ]);
    expect(list.map((v) => v.message)).toEqual(["h1", "h2", "s1", "s2", "s3"]);
  });

  it("locale 'en' 요청도 ko fallback 라벨로 리스트를 만든다", () => {
    const list = buildViolationList([err("eventOverlap", "m")], "en");
    expect(list[0].label).toBe(violationLabel("eventOverlap", "ko"));
  });
});

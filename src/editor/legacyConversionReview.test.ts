import { describe, expect, it } from "vitest";
import { beat } from "../shared/types/beat";
import type { ChartEvent, DocumentNoteEntity } from "../shared/types/chart";
import type { LegacyConversionItem, LegacyConversionReport } from "../shared/chart";
import {
  buildLegacyConversionReviewRows,
  describeLegacyConversionItem,
  formatLegacyConversionCounts,
  formatLegacyConversionReviewText,
  formatMeasureBeat,
  formatReviewLane,
  noteIndicesAtPosition,
} from "./legacyConversionReview";

const fourFour: ChartEvent[] = [
  { type: "bpm", beat: beat(0), bpm: 120 },
  { type: "timeSignature", beat: beat(0), beatPerMeasure: beat(4) },
];

const report = (counts: Partial<LegacyConversionReport["counts"]>, items: LegacyConversionItem[] = []): LegacyConversionReport => ({
  counts: { taps: 0, bodies: 0, releases: 0, ticks: 0, mergedConnections: 0, terminalHoldOnlyItemsDropped: 0, ...counts },
  items,
});

const decrease: LegacyConversionItem = {
  kind: "holdCountChangeConnection", lane: 2, beat: beat(6), legacyItemCount: 1, legacyNoteIndices: [3, 4],
  predecessorHoldCount: 2, successorHoldCount: 1, hasHead: false, predecessorHoldOnly: false,
};
const auxTrillEnd: LegacyConversionItem = {
  kind: "releaseOmittedTrillBodyEnd", lane: 6, beat: beat(1), legacyItemCount: 1, legacyNoteIndices: [7],
};

describe("formatLegacyConversionCounts", () => {
  it("탭 4·바디 3·릴리즈 2·틱 0·보고 항목 1개면 '탭 4 · 바디 3 · 릴리즈 2 · 틱 0 · 검토할 항목 1'", () => {
    expect(formatLegacyConversionCounts(report({ taps: 4, bodies: 3, releases: 2 }, [decrease])))
      .toBe("탭 4 · 바디 3 · 릴리즈 2 · 틱 0 · 검토할 항목 1");
  });

  it("합친 연결 수와 사슬 끝 holdOnly 손실 수는 개수 줄에 넣지 않는다", () => {
    expect(formatLegacyConversionCounts(report({ ticks: 1, mergedConnections: 2, terminalHoldOnlyItemsDropped: 3 })))
      .toBe("탭 0 · 바디 0 · 릴리즈 0 · 틱 1 · 검토할 항목 0");
  });
});

describe("formatReviewLane", () => {
  it("메인 레인 1～4는 '레인 n'", () => {
    expect([1, 2, 3, 4].map(formatReviewLane)).toEqual(["레인 1", "레인 2", "레인 3", "레인 4"]);
  });

  it("통합 레인 5·7은 에디터의 보조 레인 번호로 '보조 레인 1'·'보조 레인 3'", () => {
    expect([5, 7].map(formatReviewLane)).toEqual(["보조 레인 1", "보조 레인 3"]);
  });
});

describe("formatMeasureBeat", () => {
  it("4/4에서 박 0은 에디터 마디 표시처럼 1부터 세어 '1마디 1박'", () => {
    expect(formatMeasureBeat(beat(0), fourFour)).toBe("1마디 1박");
  });

  it("4/4에서 박 6은 '2마디 3박'", () => {
    expect(formatMeasureBeat(beat(6), fourFour)).toBe("2마디 3박");
  });

  it("4/4에서 박 9/2는 마디 안 분수 박을 '2마디 1+1/2박'으로 적는다", () => {
    expect(formatMeasureBeat(beat(9, 2), fourFour)).toBe("2마디 1+1/2박");
  });

  it("4/4에서 박 13/3은 셋잇단 위치를 '2마디 1+1/3박'으로 적는다", () => {
    expect(formatMeasureBeat(beat(13, 3), fourFour)).toBe("2마디 1+1/3박");
  });

  it("마디 2부터 3/4이면 박 11은 4박 마디 2개 뒤 3박 마디 하나를 지나 '4마디 1박'", () => {
    const events: ChartEvent[] = [...fourFour, { type: "timeSignature", beat: beat(8), beatPerMeasure: beat(3) }];
    expect(formatMeasureBeat(beat(11), events)).toBe("4마디 1박");
  });

  it("마디 경계 박 4는 다음 마디의 첫 박 '2마디 1박'", () => {
    expect(formatMeasureBeat(beat(4), fourFour)).toBe("2마디 1박");
  });

  it("박자표가 없으면 마디 대신 곡 시작부터의 박 '박 9/2'로 적는다", () => {
    expect(formatMeasureBeat(beat(9, 2), [{ type: "bpm", beat: beat(0), bpm: 120 }])).toBe("박 9/2");
  });

  it("분자 0 박자표(구조 위반)로 마디가 전진하지 않으면 무한 반복 없이 첫 마디 안 위치로 적는다", () => {
    const events: ChartEvent[] = [{ type: "bpm", beat: beat(0), bpm: 120 }, { type: "timeSignature", beat: beat(0), beatPerMeasure: beat(0) }];
    expect(formatMeasureBeat(beat(6), events)).toBe("1마디 7박");
  });
});

describe("describeLegacyConversionItem", () => {
  it("2→1 감소 연결은 '감소 연결 2→1 · 경계 비움'과 옮기지 못한 구형 점수 항목 1개를 적는다", () => {
    expect(describeLegacyConversionItem(decrease)).toBe("감소 연결 2→1 · 경계 비움 · 옮기지 못한 구형 점수 항목 1개");
  });

  it("앞 끝이 holdOnly인 1→2 증가 연결은 'holdOnly 끝'을 덧붙이고 손실 0개면 손실 문구를 붙이지 않는다", () => {
    expect(describeLegacyConversionItem({ ...decrease, predecessorHoldCount: 1, successorHoldCount: 2, predecessorHoldOnly: true,
      legacyItemCount: 0 })).toBe("증가 연결 1→2 · 경계 비움 · 앞 끝 holdOnly");
  });

  it("변환 전 위반은 라벨과 rule id를 함께 적는다", () => {
    expect(describeLegacyConversionItem({ kind: "violationBeforeConversion", rule: "longOverlap", lane: 1, beat: beat(2),
      legacyItemCount: 0, legacyNoteIndices: [0, 1] })).toBe("변환 전 위반: 롱노트 겹침 (longOverlap)");
  });

  it.each([
    ["releaseOmittedTrillBodyEnd", "트릴 바디 끝 · 릴리즈 없음"],
    ["releaseOmittedInTrillZone", "trillZone 안 바디 끝 · 릴리즈 없음"],
    ["releaseOmittedTapAtEnd", "끝에 탭 노트(o-o) · 릴리즈 없음"],
    ["holdOnlyConnectionNotTickable", "트릴 바디가 낀 holdOnly 연결 · 틱 노트 없음"],
    ["auxZeroLengthTrillBody", "길이 0 트릴 바디 · 릴리즈·틱 노트 없음"],
    ["sameHoldCountConnectionWithoutHeadOrHoldOnly", "head·holdOnly 없는 같은 hold 수 연결"],
    ["explicitNoteAtLegacyPosition", "명시 노트가 이미 있는 위치 · 노트를 더하지 않음"],
  ] as const)("%s 손실 0개는 '%s'", (kind, text) => {
    expect(describeLegacyConversionItem({ kind, lane: 1, beat: beat(0), legacyItemCount: 0, legacyNoteIndices: [0] })).toBe(text);
  });
});

describe("buildLegacyConversionReviewRows·formatLegacyConversionReviewText", () => {
  it("보고 항목 순서대로 레인·마디 박·설명 행을 만든다", () => {
    expect(buildLegacyConversionReviewRows([decrease, auxTrillEnd], fourFour).map(({ lane, position, description }) =>
      ({ lane, position, description }))).toEqual([
      { lane: "레인 2", position: "2마디 3박", description: "감소 연결 2→1 · 경계 비움 · 옮기지 못한 구형 점수 항목 1개" },
      { lane: "보조 레인 2", position: "1마디 2박", description: "트릴 바디 끝 · 릴리즈 없음 · 옮기지 못한 구형 점수 항목 1개" },
    ]);
  });

  it("같은 레인·박·종류가 둘이어도 행 key가 겹치지 않는다", () => {
    const rows = buildLegacyConversionReviewRows([decrease, { ...decrease, legacyNoteIndices: [5, 6] }], fourFour);
    expect(new Set(rows.map(row => row.key)).size).toBe(2);
  });

  it("텍스트 복사는 제목 줄 아래에 번호·레인·마디 박·곡 시작부터의 박·설명을 한 줄씩 적는다", () => {
    const rows = buildLegacyConversionReviewRows([decrease, auxTrillEnd], fourFour);
    expect(formatLegacyConversionReviewText(rows, "E2E 곡 NORMAL")).toBe([
      "변환 검토 2건 — E2E 곡 NORMAL",
      "1. 레인 2 · 2마디 3박 (박 6) · 감소 연결 2→1 · 경계 비움 · 옮기지 못한 구형 점수 항목 1개",
      "2. 보조 레인 2 · 1마디 2박 (박 1) · 트릴 바디 끝 · 릴리즈 없음 · 옮기지 못한 구형 점수 항목 1개",
    ].join("\n"));
  });
});

describe("noteIndicesAtPosition", () => {
  const notes: DocumentNoteEntity[] = [
    { type: "tap", kind: "double", lane: 2, beat: beat(4) },
    { type: "body", lane: 2, beat: beat(4), endBeat: beat(6), holdCount: 2 },
    { type: "body", lane: 2, beat: beat(6), endBeat: beat(8), holdCount: 1 },
    { type: "release", lane: 2, beat: beat(8), count: 1 },
    { type: "tap", kind: "single", lane: 3, beat: beat(6) },
    { type: "body", lane: 6, beat: beat(0), endBeat: beat(1), holdCount: 1, trill: true },
  ];

  it("레인 2 박 6은 그 박에서 끝나는 바디와 시작하는 바디를 고르고 다른 레인의 같은 박 노트는 고르지 않는다", () => {
    expect(noteIndicesAtPosition(notes, 2, beat(6))).toEqual([1, 2]);
  });

  it("약분하지 않은 박 12/2도 박 6과 같은 위치로 찾는다", () => {
    expect(noteIndicesAtPosition(notes, 2, { n: 12, d: 2 })).toEqual([1, 2]);
  });

  it("통합 레인 6(보조 레인 2)의 박 1은 거기서 끝나는 트릴 바디를 고른다", () => {
    expect(noteIndicesAtPosition(notes, 6, beat(1))).toEqual([5]);
  });

  it("편집으로 그 위치의 노트가 사라졌으면 빈 배열", () => {
    expect(noteIndicesAtPosition(notes, 1, beat(6))).toEqual([]);
  });
});

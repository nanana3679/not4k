import { describe, expect, it } from "vitest";
import type { Beat } from "../../shared/types/beat";
import type { DocumentNoteEntity } from "../../shared/types/chart";
import { convertLegacyChart, type LegacyConversionItem } from "../../shared/chart";
import { validateChartDocument } from "../../shared/validation/documentValidation";
import { explicitHcFixtures } from "./explicitHcFixtures";
import { legacyHcCharts } from "./legacyHcCharts";
import legacyHcSource from "./noteJudgmentBodyHeldCountCases.test.ts?raw";
import migrationJson from "../../../docs/spec/fixtures/legacy-judgment-case-migration.json?raw";

// 사례 시각은 ms(120 BPM, 1박 = 500ms)로 읽는다.
const ms = (at: Beat) => (at.n * 500) / at.d;

/** 탭·바디·릴리즈·틱 배치를 순서와 무관하게 비교하는 정렬된 한 줄 표기. */
function placement(notes: readonly DocumentNoteEntity[]): string[] {
  return notes.map(note => {
    switch (note.type) {
      case "tap": return `tap ${ms(note.beat)} ${note.kind}${note.grace ? " Grace" : ""}`;
      case "body": return `body ${ms(note.beat)}-${ms(note.endBeat)} ×${note.holdCount}${note.trill ? " trill" : ""}`;
      case "release": return `release ${ms(note.beat)} ×${note.count}${note.grace ? " Grace" : ""}`;
      case "tick": return `tick ${ms(note.beat)} ×${note.count}`;
      default: return `구형 ${note.type} ${ms(note.beat)}`;
    }
  }).sort();
}

function itemLine(item: LegacyConversionItem): string {
  if (item.kind !== "holdCountChangeConnection") return `${item.kind} ${ms(item.beat)} 잃음${item.legacyItemCount}`;
  const mark = item.hasHead ? "head" : item.predecessorHoldOnly ? "holdOnly" : "없음";
  return `${item.predecessorHoldCount}→${item.successorHoldCount} ${ms(item.beat)} ${mark} 잃음${item.legacyItemCount}`;
}

const fixtureById = new Map(explicitHcFixtures.map(fixture => [fixture.id, fixture]));
const cases = legacyHcCharts.map(legacy => {
  const fixture = fixtureById.get(legacy.id);
  if (!fixture) throw new Error(`${legacy.id}의 손 이관 fixture가 없습니다`);
  const result = convertLegacyChart({ ...fixture.chart, notes: [...legacy.notes] });
  return { id: legacy.id, fixture, result };
});

/** 손 이관과 배치가 다른 10건. 나머지 71건은 배치가 같다. */
const MERGED_HOLD_ONLY_CONNECTIONS = ["HC001", "HC064", "HC077"];
const BARE_DECREASES = ["HC048", "HC049", "HC050", "HC060", "HC061", "HC062", "HC063"];
const differing = new Set([...MERGED_HOLD_ONLY_CONNECTIONS, ...BARE_DECREASES]);

describe("HC001～HC081 구형 차트의 1차 기계 변환과 손 이관 fixture 대조", () => {
  it("고정 사본 81건은 explicitHcFixtures와 같은 순서의 ID·출처 줄을 갖고 그 줄은 원본 파일의 it·it.fails 81줄과 같다", () => {
    expect(legacyHcCharts.map(legacy => [legacy.id, legacy.source]))
      .toEqual(explicitHcFixtures.map(fixture => [fixture.id, fixture.source]));
    const itLines = legacyHcSource.split("\n").flatMap((line, index) => /^\s*it(\.fails)?\(/.test(line) ? [index + 1] : []);
    expect(legacyHcCharts.map(legacy => Number(legacy.source.split(":")[1]))).toEqual(itLines);
  });

  it("원본 파일의 SHA-256은 대응 자료 legacy-judgment-case-migration.json에 고정한 sourceSha256과 같다 - 원본이 바뀌면 고정 사본 81건을 다시 대조해야 한다", async () => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(legacyHcSource));
    const sha256 = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
    expect(sha256).toBe((JSON.parse(migrationJson) as { sourceSha256: string }).sourceSha256);
  });

  it.each(cases)("$id 변환 결과는 구조·의미 위반이 없고 구형 노트가 남지 않아 명시 재생할 수 있다", ({ result }) => {
    const validation = validateChartDocument(result.chart);
    expect([...validation.structural, ...validation.semantic].map(error => error.rule)).toEqual([]);
    expect(validation.canPlayExplicit).toBe(true);
  });

  it.each(cases.filter(entry => !differing.has(entry.id)))("$id 변환 결과의 탭·바디·릴리즈·틱 배치가 손 이관 fixture와 같다", ({ fixture, result }) => {
    expect(placement(result.chart.notes)).toEqual(placement(fixture.chart.notes));
  });

  it("HC001·HC064·HC077은 holdOnly 경계의 Grace 릴리즈 대신 두 바디를 한 바디로 합치고 옛 경계에 틱 노트를 둔다", () => {
    const byId = new Map<string, (typeof cases)[number]>(cases.map(entry => [entry.id, entry]));
    const expected: Record<string, { converted: string[]; handMigrated: string[] }> = {
      HC001: {
        converted: ["body 1000-1560 ×1", "tick 1500 ×1", "tap 1560 single", "body 1560-1760 ×1", "release 1760 ×1"],
        handMigrated: ["body 1000-1500 ×1", "release 1500 ×1 Grace", "body 1500-1560 ×1", "tap 1560 single", "body 1560-1760 ×1", "release 1760 ×1"],
      },
      HC064: {
        converted: ["body 1000-2160 ×1", "tick 2000 ×1", "release 2160 ×1"],
        handMigrated: ["body 1000-2000 ×1", "release 2000 ×1 Grace", "body 2000-2160 ×1", "release 2160 ×1"],
      },
      HC077: {
        converted: ["body 1000-3000 ×1", "tick 2000 ×1", "release 3000 ×1"],
        handMigrated: ["body 1000-2000 ×1", "release 2000 ×1 Grace", "body 2000-3000 ×1", "release 3000 ×1"],
      },
    };
    for (const id of MERGED_HOLD_ONLY_CONNECTIONS) {
      const { fixture, result } = byId.get(id)!;
      expect(placement(result.chart.notes), id).toEqual([...expected[id].converted].sort());
      expect(placement(fixture.chart.notes), id).toEqual([...expected[id].handMigrated].sort());
      expect(result.report.counts.mergedConnections, id).toBe(1);
      expect(result.report.items, id).toEqual([]);
    }
  });

  it.each(cases.filter(entry => BARE_DECREASES.includes(entry.id)))(
    "$id는 head 없는 2→1 경계 2000에 손 이관의 감소 릴리즈 ×1을 두지 않고 감소 릴리즈 1개를 잃은 증가·감소 연결로 보고한다",
    ({ fixture, result }) => {
      const handMigrated = placement(fixture.chart.notes);
      expect(handMigrated).toContain("release 2000 ×1");
      expect(placement(result.chart.notes)).toEqual(handMigrated.filter(line => line !== "release 2000 ×1"));
      expect(result.report.items).toEqual([{ kind: "holdCountChangeConnection", lane: 1, beat: { n: 4, d: 1 },
        predecessorHoldCount: 2, successorHoldCount: 1, hasHead: false, predecessorHoldOnly: false,
        legacyItemCount: 1, legacyNoteIndices: expect.any(Array) }]);
    });

  it("81건의 보고 항목은 30건에 걸친 증가·감소 연결 32곳뿐이고 사례별 경계 시각·구형 표시·잃은 구형 점수 항목 수가 다음과 같다", () => {
    const decreaseWithHead = ["2→1 2000 head 잃음1"];
    const expected: Record<string, string[]> = {
      HC005: ["2→1 1500 holdOnly 잃음2"],
      HC029: decreaseWithHead,
      HC043: ["1→2 2000 없음 잃음0"], HC044: ["1→2 2000 없음 잃음0"], HC045: ["1→2 2000 없음 잃음0"], HC046: ["1→2 2000 없음 잃음0"],
      HC047: ["1→2 2000 head 잃음0"],
      HC048: ["2→1 2000 없음 잃음1"], HC049: ["2→1 2000 없음 잃음1"], HC050: ["2→1 2000 없음 잃음1"],
      HC051: decreaseWithHead, HC052: decreaseWithHead, HC053: decreaseWithHead, HC054: decreaseWithHead, HC055: decreaseWithHead,
      HC056: decreaseWithHead, HC057: decreaseWithHead, HC058: decreaseWithHead, HC059: decreaseWithHead,
      HC060: ["2→1 2000 없음 잃음1"], HC061: ["2→1 2000 없음 잃음1"], HC062: ["2→1 2000 없음 잃음1"], HC063: ["2→1 2000 없음 잃음1"],
      HC065: decreaseWithHead,
      HC066: ["2→1 2000 holdOnly 잃음2"], HC067: ["2→1 2000 holdOnly 잃음2"], HC068: ["2→1 2000 holdOnly 잃음2"],
      HC069: ["2→1 1125 holdOnly 잃음2", "1→2 1250 없음 잃음0", "2→1 1375 holdOnly 잃음2"],
      HC074: ["1→2 2000 없음 잃음0"], HC078: ["1→2 2000 없음 잃음0"],
    };
    const actual = Object.fromEntries(cases.filter(entry => entry.result.report.items.length)
      .map(entry => [entry.id, entry.result.report.items.map(itemLine)]));
    expect(actual).toEqual(expected);
    expect(Object.values(actual).flat()).toHaveLength(32);
  });
});

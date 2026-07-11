import { describe, it, expect, vi } from "vitest";
import { convertExtraToMain } from "./LaneConversion";
import { beat } from "../../shared";
import type { Chart, ExtraNoteEntity, Lane } from "../../shared";

function makeChart(notes: Chart["notes"] = []): Chart {
  return {
    meta: { title: "", artist: "", difficultyLabel: "", difficultyLevel: 0, imageFile: "", audioFile: "", previewAudioFile: "", offsetMs: 0 },
    notes,
    trillZones: [],
    events: [],
  };
}

function makeCallbacks(extraNotes: ExtraNoteEntity[]) {
  return {
    getExtraNotes: () => extraNotes,
    onExtraNotesUpdate: vi.fn(),
    onExtraSelectionChange: vi.fn(),
    onChartUpdate: vi.fn(),
    onSelectionChange: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// 낙관적 편집 국소 판정 (RFD 0017) — 무관한 상주 위반이 변환을 전역 차단하지 않는다
// ---------------------------------------------------------------------------

describe("convertExtraToMain — 변환 국소 판정 (violationsInvolving, RFD 0017)", () => {
  it("무관한 기존 중복(레인1)이 상주해도 빈 레인2로의 엑스트라→메인 변환은 통과한다", () => {
    const chart = makeChart([
      { type: "single", lane: 1 as Lane, beat: beat(0) },
      { type: "single", lane: 1 as Lane, beat: beat(0) }, // 상주 위반 — 변환 노트와 무관
    ]);
    const extras: ExtraNoteEntity[] = [{ type: "single", extraLane: 1, beat: beat(4) }];
    const cb = makeCallbacks(extras);

    const result = convertExtraToMain(chart, new Set([0]), 2 as Lane, cb);

    expect(result).not.toBeNull();
    expect(result!.chart.notes).toHaveLength(3);
    expect(cb.onChartUpdate).toHaveBeenCalled();
  });

  it("변환된 노트가 기존 노트와 같은 위치(연루 중복)면 null 반환으로 차단된다", () => {
    const chart = makeChart([{ type: "single", lane: 2 as Lane, beat: beat(4) }]);
    const extras: ExtraNoteEntity[] = [{ type: "single", extraLane: 1, beat: beat(4) }];
    const cb = makeCallbacks(extras);

    const result = convertExtraToMain(chart, new Set([0]), 2 as Lane, cb);

    expect(result).toBeNull();
    expect(cb.onChartUpdate).not.toHaveBeenCalled();
  });
});

import { describe, expect, it } from "vitest";
import { deserializeChart } from "../shared";
import { extraLaneCountCoveringTrillZones, getEditorAudioLoadingSurface } from "./editorLoading";

/** 서버에서 받은 차트 본문을 흉내 낸다 — 보조 노트 없이 trillZones만 지정 */
function chartWithTrillZones(trillZones: { lane: number; beat: string; endBeat: string }[]) {
  return deserializeChart(JSON.stringify({ meta: {}, notes: [], trillZones, events: [] }));
}

describe("extraLaneCountCoveringTrillZones — 로드한 보조 레인 trillZone이 숨지 않게 (#102)", () => {
  it("보조 파일 없이 연 lane 15 trillZone 차트는 보조 레인 수 2 → 11로 넓힌다 (툴바 상한 10 초과 허용)", () => {
    const chart = chartWithTrillZones([{ lane: 15, beat: "0", endBeat: "4" }]);
    expect(extraLaneCountCoveringTrillZones(2, chart.trillZones)).toBe(11);
  });

  it("lane 5 trillZone은 보조 레인 수 2 안에 보이므로 2 유지 — 줄이지 않는다", () => {
    const chart = chartWithTrillZones([{ lane: 5, beat: "0", endBeat: "4" }]);
    expect(extraLaneCountCoveringTrillZones(2, chart.trillZones)).toBe(2);
  });

  it("메인 레인 trillZone만 있으면 보조 레인 수 0 그대로", () => {
    const chart = chartWithTrillZones([{ lane: 4, beat: "0", endBeat: "4" }]);
    expect(extraLaneCountCoveringTrillZones(0, chart.trillZones)).toBe(0);
  });
});

describe("getEditorAudioLoadingSurface", () => {
  it("keeps the first audio load on a transparent page loading surface", () => {
    expect(getEditorAudioLoadingSurface({
      audioLoading: false,
      initialAudioPending: true,
    })).toBe("transparentPage");

    expect(getEditorAudioLoadingSurface({
      audioLoading: true,
      initialAudioPending: true,
    })).toBe("transparentPage");
  });

  it("uses canvas overlay for later audio loads after editor boot", () => {
    expect(getEditorAudioLoadingSurface({
      audioLoading: true,
      initialAudioPending: false,
    })).toBe("overlay");
  });

  it("does not show an audio loading surface when audio is ready", () => {
    expect(getEditorAudioLoadingSurface({
      audioLoading: false,
      initialAudioPending: false,
    })).toBeNull();
  });
});

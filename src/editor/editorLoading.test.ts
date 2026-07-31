import { describe, expect, it } from "vitest";
import {
  fetchOptionalExtraChartText,
  getEditorAudioLoadingSurface,
  parseEditorChartAssets,
} from "./editorLoading";

function chartText(extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    meta: {},
    notes: [{ type: "single", lane: 1, beat: "0" }],
    trillZones: [],
    events: [],
    ...extra,
  });
}

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

describe("fetchOptionalExtraChartText", () => {
  it("보조 파일 응답이 200이면 별도 파일 본문 반환", async () => {
    const result = await fetchOptionalExtraChartText(
      "https://example.com/chart.extra.json",
      async () => new Response('{"extraNotes":[]}', { status: 200 }),
    );

    expect(result).toBe('{"extraNotes":[]}');
  });

  it("보조 파일 응답이 404이면 기존 차트의 하위호환 데이터를 쓰도록 null 반환", async () => {
    const result = await fetchOptionalExtraChartText(
      "https://example.com/chart.extra.json",
      async () => new Response("", { status: 404 }),
    );

    expect(result).toBeNull();
  });

  it("보조 파일 응답이 500이면 메인 차트만 연 상태로 진입하지 않고 에러", async () => {
    await expect(fetchOptionalExtraChartText(
      "https://example.com/chart.extra.json",
      async () => new Response("", { status: 500 }),
    )).rejects.toThrow("보조 차트 가져오기 실패: HTTP 500");
  });

  it("보조 파일 요청이 네트워크 오류로 실패하면 메인 차트만 연 상태로 진입하지 않고 에러", async () => {
    await expect(fetchOptionalExtraChartText(
      "https://example.com/chart.extra.json",
      async () => {
        throw new TypeError("Failed to fetch");
      },
    )).rejects.toThrow("보조 차트 가져오기 실패: 네트워크 오류");
  });
});

describe("parseEditorChartAssets", () => {
  it("별도 보조 파일이 있으면 legacy 내장 데이터 대신 별도 파일 노트를 lane 5+로 병합", () => {
    const mainText = chartText({
      extraNotes: [{ type: "single", extraLane: 1, beat: "1" }],
      extraLaneCount: 1,
    });
    const extraText = JSON.stringify({
      extraNotes: [{ type: "single", extraLane: 3, beat: "2" }],
      extraLaneCount: 3,
    });

    const result = parseEditorChartAssets(mainText, extraText);

    expect(result.chart.notes.map((note) => note.lane)).toEqual([1, 7]);
    expect(result.extraLaneCount).toBe(3);
  });

  it("보조 파일이 404로 없으면 메인 차트에 내장된 legacy 보조 노트를 병합", () => {
    const mainText = chartText({
      extraNotes: [{ type: "single", extraLane: 2, beat: "1" }],
      extraLaneCount: 2,
    });

    const result = parseEditorChartAssets(mainText, null);

    expect(result.chart.notes.map((note) => note.lane)).toEqual([1, 6]);
    expect(result.extraLaneCount).toBe(2);
  });

  it("200 응답의 보조 파일이 유효하지 않은 JSON이면 메인 차트만 연 상태로 진입하지 않고 에러", () => {
    expect(() => parseEditorChartAssets(chartText(), "not json"))
      .toThrow("보조 차트 파싱 실패: 유효한 JSON이 아닙니다");
  });

  it("200 응답의 보조 파일이 빈 문자열이면 legacy 데이터로 대체하지 않고 에러", () => {
    expect(() => parseEditorChartAssets(chartText(), ""))
      .toThrow("보조 차트 파싱 실패: 유효한 JSON이 아닙니다");
  });
});

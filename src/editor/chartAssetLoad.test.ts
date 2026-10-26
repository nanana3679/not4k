import { describe, expect, it, vi } from "vitest";
import { beat } from "../shared/types/beat";
import { ChartFormatError, UnsupportedChartContentError } from "../shared/chart";
import { fetchEditorExtraText, loadLegacyEditorChartAsset } from "./chartAssetLoad";

const main = {
  version: 3, meta: { title: "기존 메타데이터", offsetMs: -20 }, notes: [], trillZones: [], events: [],
};

describe("loadLegacyEditorChartAsset", () => {
  it("별도 보조 파일이 없으면 메인 내장 extraLane 3을 lane 7로 병합하고 레인 수를 확장한다", () => {
    const loaded = loadLegacyEditorChartAsset(JSON.stringify({
      ...main,
      extraNotes: [{ type: "doubleLong", extraLane: 3, beat: "1", endBeat: "1", holdOnly: true }],
      extraLaneCount: 1,
    }), null);
    expect(loaded.chart.notes).toEqual([{ type: "doubleLong", lane: 7, beat: beat(1), endBeat: beat(1), holdOnly: true }]);
    expect(loaded.chart.meta).toEqual(main.meta);
    expect(loaded.extraLaneCount).toBe(3);
  });

  it("별도 보조 파일이 있으면 내장 보조 대신 별도 파일의 Grace=true를 보존한다", () => {
    const loaded = loadLegacyEditorChartAsset(JSON.stringify({
      ...main, extraNotes: [{ type: "single", extraLane: 1, beat: "0" }],
    }), JSON.stringify({ extraNotes: [{ type: "double", extraLane: 2, beat: "2", grace: true }], extraLaneCount: 4 }));
    expect(loaded.chart.notes).toEqual([{ type: "double", lane: 6, beat: beat(2), grace: true }]);
    expect(loaded.extraLaneCount).toBe(4);
  });

  it("보조 파일도 내장 자료도 없으면 기존 메인 차트와 extraLaneCount=0을 반환한다", () => {
    const loaded = loadLegacyEditorChartAsset(JSON.stringify(main), null);
    expect(loaded.chart.notes).toEqual([]);
    expect(loaded.extraLaneCount).toBe(0);
  });

  it("별도 보조 200 응답 본문이 빈 문자열이면 메인 내장 Grace 보조 노트로 돌아가지 않고 ChartFormatError를 전달한다", () => {
    const chartText = JSON.stringify({ ...main, extraNotes: [{ type: "single", extraLane: 1, beat: "0", grace: true }] });
    expect(() => loadLegacyEditorChartAsset(chartText, "")).toThrow(ChartFormatError);
  });

  it.each([
    ["JSON이 아닌 본문 \"not json\"", "not json"],
    ["업로드가 끊겨 잘린 본문", '{"extraNotes":[{"type":"single","extraLane":1,'],
  ])("별도 보조 파일이 %s이면 보조 없음(extraLaneCount 0)으로 열지 않고 ChartFormatError를 전달한다", (_label, extraText) => {
    expect(() => loadLegacyEditorChartAsset(JSON.stringify(main), extraText)).toThrow(ChartFormatError);
    expect(() => loadLegacyEditorChartAsset(JSON.stringify(main), extraText)).toThrow("보조 파일이 유효한 JSON이 아닙니다");
  });

  it("v4 명시 메인 Point는 에디터 store에 적재하지 않고 지원 오류를 전달한다", () => {
    expect(() => loadLegacyEditorChartAsset(JSON.stringify({ ...main, version: 4, notes: [{ type: "point", kind: "single", lane: 1, beat: "0" }] }), null)).toThrow(UnsupportedChartContentError);
  });

  it("메인 notes에 명시 lane 5 노트가 있으면 별도 구형 보조 병합으로 숨기지 않고 거부한다", () => {
    expect(() => loadLegacyEditorChartAsset(JSON.stringify({ ...main, version: 4, notes: [{ type: "point", kind: "single", lane: 5, beat: "0" }] }), JSON.stringify({ extraNotes: [{ type: "single", extraLane: 1, beat: "0" }] }))).toThrow(UnsupportedChartContentError);
  });

  it("구형 메인+v4 명시 보조 sustain은 빈 보조 데이터로 열지 않고 지원 오류를 전달한다", () => {
    expect(() => loadLegacyEditorChartAsset(JSON.stringify(main), JSON.stringify({
      version: 4, extraNotes: [{ type: "sustain", extraLane: 1, beat: "0", count: 1 }], extraLaneCount: 1,
    }))).toThrow(UnsupportedChartContentError);
  });

  it("v4 메인 내장 명시 보조 release도 지원 오류를 전달한다", () => {
    expect(() => loadLegacyEditorChartAsset(JSON.stringify({
      ...main, version: 4, extraNotes: [{ type: "release", extraLane: 1, beat: "0", count: 2 }],
    }), null)).toThrow(UnsupportedChartContentError);
  });

  it.each([
    { version: 5, extraNotes: [] },
    { version: 3, extraNotes: [{ type: "sustain", extraLane: 1, beat: "0", count: 1 }] },
    { version: 4, extraNotes: [{ type: "release", extraLane: 1, beat: "0", count: 0 }] },
    { extraNotes: "bad" },
  ])("보조 형식 오류 %j는 무시하지 않고 ChartFormatError를 전달한다", (extra) => {
    expect(() => loadLegacyEditorChartAsset(JSON.stringify(main), JSON.stringify(extra))).toThrow(ChartFormatError);
  });
});

describe("fetchEditorExtraText", () => {
  const respond = (response: Response) => vi.fn<typeof fetch>().mockResolvedValue(response);
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

  it("200 응답이면 보조 파일 본문을 그대로 돌려준다", async () => {
    await expect(fetchEditorExtraText("aux", respond(new Response('{"extraNotes":[]}')))).resolves.toBe('{"extraNotes":[]}');
  });

  it.each([
    ["404", json(404, { error: "not_found" })],
    ["Storage의 400 NoSuchKey", json(400, { statusCode: "404", error: "not_found", code: "NoSuchKey" })],
    ["code 없는 400 statusCode 404·not_found", json(400, { statusCode: "404", error: "not_found" })],
  ])("%s 응답은 없는 보조 파일이므로 null이다", async (_label, response) => {
    await expect(fetchEditorExtraText("aux", respond(response))).resolves.toBeNull();
  });

  it.each([
    ["403", json(403, { error: "forbidden" })],
    ["500", json(500, { error: "server" })],
    ["권한 오류 본문의 400", json(400, { statusCode: "403", error: "Unauthorized" })],
    ["JSON이 아닌 본문의 400", new Response("bad request", { status: 400 })],
  ])("%s 응답은 보조 없음으로 열지 않고 로드 오류로 전달한다", async (_label, response) => {
    await expect(fetchEditorExtraText("aux", respond(response))).rejects.toThrow("Chart extra fetch failed");
  });

  it("네트워크 오류는 null로 삼키지 않고 그대로 전달한다", async () => {
    const failing = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(fetchEditorExtraText("aux", failing)).rejects.toThrow("Failed to fetch");
  });
});

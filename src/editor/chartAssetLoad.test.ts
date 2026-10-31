import { describe, expect, it, vi } from "vitest";
import { beat } from "../shared/types/beat";
import { ChartFormatError } from "../shared/chart";
import { fetchEditorExtraText, loadEditorChartAsset } from "./chartAssetLoad";
import { editorChartErrors } from "./documentValidation";

const main = {
  version: 3, meta: { title: "기존 메타데이터", offsetMs: -20 }, notes: [], trillZones: [], events: [],
};

describe('loadEditorChartAsset 문서 로드', () => {
  it('v4 혼합 main과 의미 위반 aux tick도 원본 배열 순서·false·수량과 함께 수리용으로 읽는다', () => {
    const loaded = loadEditorChartAsset(JSON.stringify({ ...main, version: 4, notes: [
      { type: 'single', lane: 1, beat: '8', grace: false },
      { type: 'release', count: 2, lane: 2, beat: '4', grace: false },
    ] }), JSON.stringify({ version: 4, extraLaneCount: 4, extraNotes: [
      { type: 'tick', count: 2, extraLane: 3, beat: '2' },
    ] }));
    expect(loaded.chart.notes).toEqual([
      { type: 'single', lane: 1, beat: beat(8), grace: false },
      { type: 'release', count: 2, lane: 2, beat: beat(4), grace: false },
      { type: 'tick', count: 2, lane: 7, beat: beat(2) },
    ]);
    expect(loaded.extraLaneCount).toBe(4);
  });

  it('별도 aux가 명시적으로 비어 있으면 내장 aux를 다시 끌어오지 않는다', () => {
    expect(loadEditorChartAsset(JSON.stringify({ ...main, extraNotes: [{ type: 'single', extraLane: 1, beat: '0' }] }),
      JSON.stringify({ extraNotes: [], extraLaneCount: 2 })).chart.notes).toEqual([]);
  });

  it.each([JSON.stringify({ version: 999, extraNotes: [] }), JSON.stringify({ version: 4, extraNotes: [{ type: 'future', extraLane: 1, beat: '0' }] })])('인식한 aux 형식 오류 %s는 빈 자료로 열지 않고 실패를 전달한다', text => {
    expect(() => loadEditorChartAsset(JSON.stringify(main), text)).toThrow();
  });

  it.each([
    { version: 5, extraNotes: [] },
    { version: 3, extraNotes: [{ type: "tick", extraLane: 1, beat: "0", count: 1 }] },
    { version: 4, extraNotes: [{ type: "release", extraLane: 1, beat: "0", count: 0 }] },
    { extraNotes: "bad" },
  ])("보조 형식 오류 %j는 무시하지 않고 ChartFormatError를 전달한다", (extra) => {
    expect(() => loadEditorChartAsset(JSON.stringify(main), JSON.stringify(extra))).toThrow(ChartFormatError);
  });

  it('별도 보조 파일이 없으면(null) 메인 내장 Grace 보조 노트와 extraLaneCount 3을 불러온다', () => {
    const chart = JSON.stringify({ ...main, extraNotes: [{ type: 'double', extraLane: 2, beat: '2', grace: false }], extraLaneCount: 3 });
    expect(loadEditorChartAsset(chart, null).chart.notes).toEqual([{ type: 'double', lane: 6, beat: beat(2), grace: false }]);
    expect(loadEditorChartAsset(chart, null).extraLaneCount).toBe(3);
  });

  it('별도 보조 200 응답 본문이 빈 문자열이면 메인 내장 Grace 보조 노트로 돌아가지 않고 ChartFormatError를 전달한다', () => {
    const chart = JSON.stringify({ ...main, extraNotes: [{ type: 'double', extraLane: 2, beat: '2', grace: false }], extraLaneCount: 3 });
    expect(() => loadEditorChartAsset(chart, '')).toThrow(ChartFormatError);
  });

  it.each([
    ['JSON이 아닌 본문 "not json"', 'not json'],
    ['업로드가 끊겨 잘린 본문', '{"extraNotes":[{"type":"single","extraLane":1,'],
  ])('별도 보조 파일이 %s이면 보조 없음(extraLaneCount 0)으로 열지 않고 ChartFormatError를 전달한다', (_label, extraText) => {
    expect(() => loadEditorChartAsset(JSON.stringify(main), extraText)).toThrow(ChartFormatError);
    expect(() => loadEditorChartAsset(JSON.stringify(main), extraText)).toThrow('보조 파일이 유효한 JSON이 아닙니다');
  });

  it.each([
    ['별도 aux 파일이 있으면', JSON.stringify({ version: 4, extraLaneCount: 1, extraNotes: [{ type: 'single', extraLane: 1, beat: '0' }] })],
    ['aux 파일 없이 메인에 예전 extraNotes가 있으면', null],
  ])('%s 메인의 lane 0·lane 1.5 탭을 병합에서 버리지 않아 laneMalformed 위반으로 보인다', (_label, extraText) => {
    const chart = JSON.stringify({ ...main, version: 4, extraLaneCount: 1, extraNotes: [{ type: 'single', extraLane: 1, beat: '0' }], notes: [
      { type: 'tap', kind: 'single', lane: 0, beat: '1' },
      { type: 'tap', kind: 'single', lane: 1.5, beat: '2' },
    ] });
    const loaded = loadEditorChartAsset(chart, extraText);
    expect(loaded.chart.notes).toEqual([
      { type: 'tap', kind: 'single', lane: 0, beat: beat(1) },
      { type: 'tap', kind: 'single', lane: 1.5, beat: beat(2) },
      { type: 'single', lane: 5, beat: beat(0) },
    ]);
    expect(editorChartErrors(loaded.chart).filter(error => error.rule === 'laneMalformed')).toHaveLength(2);
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

describe('보조 trillZone 파일 로드', () => {
  it('노트 없이 extraLane 4 구간만 있어도 lane 8로 읽고 보조 레인 수를 4로 확장한다', () => {
    const loaded = loadEditorChartAsset(JSON.stringify(main), JSON.stringify({
      version: 3, extraLaneCount: 1, extraNotes: [],
      extraTrillZones: [{ extraLane: 4, beat: '1/2', endBeat: '4' }],
    }));
    expect(loaded.chart.trillZones).toEqual([{ lane: 8, beat: beat(1, 2), endBeat: beat(4) }]);
    expect(loaded.extraLaneCount).toBe(4);
  });
  it('별도 파일이 없으면 메인 내장 extraTrillZones를 읽고 별도 빈 파일이 있으면 내장 구간을 제외한다', () => {
    const text = JSON.stringify({ ...main, extraTrillZones: [{ extraLane: 1, beat: '0', endBeat: '4' }] });
    expect(loadEditorChartAsset(text, null).chart.trillZones).toEqual([{ lane: 5, beat: beat(0), endBeat: beat(4) }]);
    expect(loadEditorChartAsset(text, '{"extraNotes":[]}').chart.trillZones).toEqual([]);
  });
  it.each([null, {}, [{ extraLane: 0, beat: '0', endBeat: '4' }],
    [{ extraLane: 1.5, beat: '0', endBeat: '4' }], [{ extraLane: 1, lane: 5, beat: '0', endBeat: '4' }],
    [{ extraLane: 1, beat: 'bad', endBeat: '4' }], [{ extraLane: 1, beat: '0' }], [null]])(
    '손상된 extraTrillZones=%j는 빈 구간으로 바꾸지 않고 형식 오류를 전달한다', extraTrillZones => {
      expect(() => loadEditorChartAsset(JSON.stringify(main), JSON.stringify({ extraTrillZones }))).toThrow(ChartFormatError);
    });
  it('기존 zone 밖 lane 5 trill은 자동 구간 생성 없이 읽고 수리할 배치 위반으로 표시한다', () => {
    const loaded = loadEditorChartAsset(JSON.stringify(main), JSON.stringify({
      extraNotes: [{ type: 'trill', extraLane: 1, beat: '2' }],
    }));
    expect(loaded.chart.trillZones).toEqual([]);
    expect(loaded.chart.notes).toEqual([{ type: 'trill', lane: 5, beat: beat(2) }]);
    expect(editorChartErrors(loaded.chart).map(e => e.rule)).toContain('trillExclusive');
  });
});

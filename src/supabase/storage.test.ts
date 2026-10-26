import { afterEach, describe, expect, it, vi } from 'vitest';
import { beat, serializeChart, serializeExtraNotes, auxNotesAsExtra, ChartFormatError } from '../shared';
import type { ChartDocument } from '../shared';
import { explicitPlaytestCharts } from '../lab/explicitPlaytestCharts';

vi.mock('./client', () => ({ supabase: { storage: { from: () => ({ getPublicUrl: (path: string) => ({
  data: { publicUrl: `https://storage.test/${path}` },
}) }) } } }));
const { fetchChart, fetchChartDocument, loadSongData, loadSongDocumentData } = await import('./storage');

afterEach(() => vi.unstubAllGlobals());
/** 실제 Supabase Storage가 없는 객체에 돌려주는 응답: HTTP 400에 본문 statusCode "404"·code "NoSuchKey". */
const missingObjectBody = { statusCode: '404', error: 'not_found', code: 'NoSuchKey' };
const missingAux = () => new Response(JSON.stringify(missingObjectBody), { status: 400 });
/** extra를 생략하면 aux가 없는 곡(실제 400 NoSuchKey 응답)이다. 문자열은 200 본문, 함수는 그 응답을 쓴다. */
function serve(chart: ChartDocument, extra: string | (() => Response) = missingAux, chartText = serializeChart(chart)) {
  const fetch = vi.fn(async (url: string) => {
    if (url.endsWith('.extra.json')) return typeof extra === 'string' ? new Response(extra) : extra();
    if (url.endsWith('.json')) return new Response(chartText);
    return new Response(new Uint8Array([1, 2, 3]));
  });
  vi.stubGlobal('fetch', fetch);
  return { fetch, chartText };
}
const missingAuxResponses = [
  ['HTTP400 NoSuchKey 본문', missingAux],
  ['HTTP404', () => new Response(null, { status: 404 })],
] as const;

describe('일반 곡 문서 Storage 읽기', () => {
  it('main Point·Body·Sustain·Release와 별도 aux의 명시·legacy 항목 및 메타데이터를 모두 보존한다', async () => {
    const chart = structuredClone(explicitPlaytestCharts[0].chart);
    chart.meta = { ...chart.meta, title: '원본 제목', artist: '제작자', offsetMs: 17, difficultyLevel: 7 };
    const aux: ChartDocument['notes'] = [
      { type: 'body', lane: 5, beat: beat(0), endBeat: beat(2), holdCount: 2 },
      { type: 'sustain', lane: 5, beat: beat(1), count: 2 },
      { type: 'release', lane: 5, beat: beat(2), count: 2, grace: true },
      { type: 'long', lane: 6, beat: beat(0), endBeat: beat(1), holdOnly: true },
    ];
    const original = structuredClone(chart);
    const { fetch } = serve(chart, serializeExtraNotes(auxNotesAsExtra(aux), 2));
    const loaded = await fetchChartDocument('song-1', 'NORMAL');
    expect(loaded).toEqual({ ...chart, notes: [...chart.notes, ...aux], restZones: [] });
    expect(chart).toEqual(original);
    expect(fetch).toHaveBeenCalledWith('https://storage.test/songs/song-1/normal.extra.json', { cache: 'no-cache' });
  });

  it.each(missingAuxResponses)('별도 aux가 %s이면 없는 파일로 보고 메인 notes에 이미 있는 lane5 명시 항목을 보존한다', async (_, response) => {
    const chart = structuredClone(explicitPlaytestCharts[0].chart);
    chart.notes.push({ type: 'point', lane: 5, beat: beat(0), kind: 'single' });
    serve(chart, response);
    expect((await fetchChartDocument('song-1', 'NORMAL')).notes).toEqual(chart.notes);
  });

  it.each(missingAuxResponses)('별도 aux가 %s이면 예전 메인 extraNotes의 extraLane1을 lane5로 복원한다', async (_, response) => {
    const chart = explicitPlaytestCharts[0].chart;
    const main = { ...JSON.parse(serializeChart(chart)), extraLaneCount: 1,
      extraNotes: [{ type: 'single', extraLane: 1, beat: '0' }] };
    serve(chart, response, JSON.stringify(main));
    expect((await fetchChartDocument('song-1', 'NORMAL')).notes.at(-1)).toEqual({ type: 'single', lane: 5, beat: beat(0) });
  });

  it.each([
    ['HTTP403', () => new Response(null, { status: 403 }), 403],
    ['HTTP500', () => new Response(null, { status: 500 }), 500],
    ['HTTP400 AccessDenied 본문', () => new Response(JSON.stringify({ statusCode: '403', error: 'Unauthorized', code: 'AccessDenied' }), { status: 400 }), 400],
    ['HTTP400 NoSuchBucket 본문', () => new Response(JSON.stringify({ statusCode: '404', error: 'Bucket not found', code: 'NoSuchBucket' }), { status: 400 }), 400],
    ['HTTP400 JSON이 아닌 본문', () => new Response('Bad Request', { status: 400 }), 400],
  ] as const)('별도 aux가 %s이면 없는 파일로 무시하지 않고 로딩을 거부한다', async (_, response, status) => {
    serve(explicitPlaytestCharts[0].chart, response);
    await expect(fetchChartDocument('song-1', 'NORMAL')).rejects.toThrow(`chart extras: ${status}`);
  });

  it.each(['{', '{"extraNotes":{}}', '{"version":99}', '{"extraNotes":[{"type":"unknown","extraLane":1,"beat":"0"}]}'])(
    '별도 aux가 %s이면 네트워크 오류가 아닌 ChartFormatError로 실패를 전달한다', async extra => {
      serve(explicitPlaytestCharts[0].chart, extra);
      await expect(fetchChartDocument('song-1', 'NORMAL')).rejects.toBeInstanceOf(ChartFormatError);
    });

  it('aux 네트워크 실패는 빈 aux로 대체하지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('.extra.json')) throw new Error('connection lost');
      return new Response(serializeChart(explicitPlaytestCharts[0].chart));
    }));
    await expect(fetchChartDocument('song-1', 'NORMAL')).rejects.toThrow('connection lost');
  });

  it('일반 load는 선택 custom.mp3를 디코딩하고 명시 문서와 같은 AudioBuffer를 반환한다', async () => {
    const { fetch } = serve(explicitPlaytestCharts[0].chart);
    const audioBuffer = { duration: 4 } as AudioBuffer;
    const decodeAudioData = vi.fn(async () => audioBuffer);
    const result = await loadSongDocumentData('song-1', 'NORMAL', { decodeAudioData } as unknown as AudioContext, 'songs/song-1/custom.mp3');
    expect(result.audioBuffer).toBe(audioBuffer);
    expect(result.chart.notes).toEqual(explicitPlaytestCharts[0].chart.notes);
    expect(decodeAudioData).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith('https://storage.test/songs/song-1/custom.mp3', { cache: 'no-cache' });
  });

  it('구형 fetchChart는 명시 차트를 거부하지만 같은 원본은 문서 reader로 다시 읽힌다', async () => {
    const original = structuredClone(explicitPlaytestCharts[0].chart);
    serve(original);
    await expect(fetchChart('song-1', 'NORMAL')).rejects.toThrow('명시적 노트 형식');
    expect((await fetchChartDocument('song-1', 'NORMAL')).notes).toEqual(original.notes);
  });

  it('구형 loadSongData는 single·holdOnly의 의미를 보존하고 aux 요청을 새로 추가하지 않는다', async () => {
    const chart: ChartDocument = { ...explicitPlaytestCharts[0].chart, notes: [
      { type: 'single', lane: 1, beat: beat(0) },
      { type: 'long', lane: 2, beat: beat(0), endBeat: beat(2), holdOnly: true },
    ] };
    const { fetch } = serve(chart);
    const audioBuffer = { duration: 4 } as AudioBuffer;
    const result = await loadSongData('song-1', 'NORMAL', { decodeAudioData: async () => audioBuffer } as unknown as AudioContext);
    expect(result.chart.notes).toEqual(chart.notes);
    expect(fetch.mock.calls.some(([url]) => url.endsWith('.extra.json'))).toBe(false);
  });
});

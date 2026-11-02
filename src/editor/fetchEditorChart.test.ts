import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const source = vi.hoisted(() => ({ fetchSongChartSource: vi.fn() }));
vi.mock('../supabase/songSharedData', () => ({ fetchSongChartSource: source.fetchSongChartSource }));
vi.mock('../supabase/client', () => ({ supabase: { storage: { from: () => ({
  getPublicUrl: (path: string) => ({ data: { publicUrl: `https://storage.test/${path}` } }),
}) } } }));
const { fetchEditorChart } = await import('./fetchEditorChart');

const row = { id: 'chart-1', difficultyLabel: 'normal', revision: 6,
  chartPath: 'songs/song-1/normal-t1.json', chartExtraPath: 'songs/song-1/normal-t1.extra.json' };
const song = { title: '곡', artist: '', jacketUrl: null, timing: null, revision: 1 };

function serve(responses: Record<string, Response>) {
  const fetch = vi.fn(async (url: string) => responses[url]?.clone() ?? new Response(null, { status: 404 }));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

beforeEach(() => source.fetchSongChartSource.mockReset());
afterEach(() => vi.unstubAllGlobals());

describe('fetchEditorChart', () => {
  it('normal 행에 chart_path·chart_extra_path가 있으면 그 두 경로를 no-store로 읽고 행 ID·리비전 6을 함께 돌려준다', async () => {
    source.fetchSongChartSource.mockResolvedValue({ song, chartRow: row });
    const fetch = serve({
      'https://storage.test/songs/song-1/normal-t1.json': new Response('{"main":1}'),
      'https://storage.test/songs/song-1/normal-t1.extra.json': new Response('{"extraNotes":[]}'),
    });

    const loaded = await fetchEditorChart('song-1', 'normal');

    expect(loaded).toEqual({ chartText: '{"main":1}', extraText: '{"extraNotes":[]}', song, chartRow: row });
    expect(fetch.mock.calls).toEqual([
      ['https://storage.test/songs/song-1/normal-t1.json', { cache: 'no-store' }],
      ['https://storage.test/songs/song-1/normal-t1.extra.json', { cache: 'no-store' }],
    ]);
    expect(source.fetchSongChartSource).toHaveBeenCalledWith('song-1', 'normal');
  });

  it('행의 경로가 NULL이면 기존 결정적 경로 normal.json을 읽고 보조 파일 404는 보조 없음(null)이다', async () => {
    const legacyRow = { ...row, chartPath: null, chartExtraPath: null };
    source.fetchSongChartSource.mockResolvedValue({ song, chartRow: legacyRow });
    serve({ 'https://storage.test/songs/song-1/normal.json': new Response('{"main":1}') });

    expect(await fetchEditorChart('song-1', 'NORMAL')).toEqual({ chartText: '{"main":1}', extraText: null, song, chartRow: legacyRow });
  });

  it('곡·차트 행이 없으면 결정적 경로를 읽고 chartRow null을 돌려준다', async () => {
    source.fetchSongChartSource.mockResolvedValue({ song: null, chartRow: null });
    const fetch = serve({ 'https://storage.test/songs/song-1/normal.json': new Response('{"main":1}') });

    expect((await fetchEditorChart('song-1', 'normal')).chartRow).toBeNull();
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      'https://storage.test/songs/song-1/normal.json', 'https://storage.test/songs/song-1/normal.extra.json',
    ]);
  });

  it('메인 JSON이 500이면 Chart fetch failed: 500으로 로드를 거부한다', async () => {
    source.fetchSongChartSource.mockResolvedValue({ song, chartRow: row });
    serve({ 'https://storage.test/songs/song-1/normal-t1.json': new Response(null, { status: 500 }) });

    await expect(fetchEditorChart('song-1', 'normal')).rejects.toThrow('Chart fetch failed: 500');
  });
});


it.each([404, 400])('chart_extra_path가 지정된 normal-t1.extra.json이 HTTP %i로 없으면 에디터 열기를 거부한다', async status => {
  source.fetchSongChartSource.mockResolvedValue({ song, chartRow: row });
  serve({
    'https://storage.test/songs/song-1/normal-t1.json': new Response('{"main":1}'),
    'https://storage.test/songs/song-1/normal-t1.extra.json': new Response(JSON.stringify({ code: 'NoSuchKey' }), { status }),
  });
  await expect(fetchEditorChart('song-1', 'normal')).rejects.toThrow(`Chart extra fetch failed: ${status}`);
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { beat } from '../shared';
import type { ChartDocument } from '../shared';

const storage = vi.hoisted(() => ({ upload: vi.fn(), rpc: vi.fn(), remove: vi.fn(), list: vi.fn(), eq: vi.fn(), delete: vi.fn(), select: vi.fn() }));
vi.mock('./client', () => ({ supabase: { storage: { from: () => ({ upload: storage.upload, remove: storage.remove, list: storage.list }) }, rpc: storage.rpc,
  from: () => ({ delete: storage.delete, select: storage.select }) } }));
const { createChartAsset, saveChartAsset, saveSonglessChartAsset, deleteChartAsset, deleteSongAsset } = await import('./songAssets');

const chart: ChartDocument = {
  meta: { title: '곡', artist: '', difficultyLabel: 'NORMAL', difficultyLevel: 7, imageFile: '', audioFile: '', previewAudioFile: '', offsetMs: 0 },
  notes: [{ type: 'single', lane: 1, beat: beat(0) }],
  trillZones: [],
  events: [{ type: 'bpm', beat: beat(0), bpm: 120, editorLane: 1 }, { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(4), editorLane: 2 }],
};
const UUID = '0f8fad5b-d9cb-469f-a165-70867728950e';

beforeEach(() => {
  vi.restoreAllMocks();
  storage.upload.mockReset().mockResolvedValue({ error: null });
  storage.rpc.mockReset();
  storage.remove.mockReset().mockResolvedValue({ error: null });
  storage.list.mockReset().mockResolvedValue({ data: [], error: null });
  storage.eq.mockReset().mockImplementation(() => ({ eq: storage.eq, then: (resolve: (value: unknown) => void) => resolve({ data: [], error: null }) }));
  storage.delete.mockReset().mockReturnValue({ eq: storage.eq });
  storage.select.mockReset().mockReturnValue({ eq: storage.eq });
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(UUID);
});

describe('Supabase 차트 저장 adapter', () => {
  it('Save는 메인·보조 JSON을 UUID 새 경로에 upsert false로 올린 뒤 rpc save_chart에 행 ID·예상 리비전 3·레벨 7·두 경로를 넘기고 반환 리비전 4를 쓴다', async () => {
    storage.rpc.mockResolvedValue({ data: 4, error: null });

    const result = await saveChartAsset({ songId: 'song-1', difficulty: 'NORMAL', chart, extraLaneCount: 2,
      row: { chartId: 'chart-uuid', revision: 3 } });

    expect(storage.upload.mock.calls.map(([path, , options]) => [path, options])).toEqual([
      [`songs/song-1/normal-${UUID}.json`, { upsert: false }],
      [`songs/song-1/normal-${UUID}.extra.json`, { upsert: false }],
    ]);
    expect(storage.rpc).toHaveBeenCalledExactlyOnceWith('save_chart', {
      p_chart_id: 'chart-uuid', p_expected_revision: 3, p_difficulty_level: 7,
      p_chart_path: `songs/song-1/normal-${UUID}.json`, p_chart_extra_path: `songs/song-1/normal-${UUID}.extra.json`,
    });
    expect(result.row).toEqual({ chartId: 'chart-uuid', revision: 4 });
  });

  it.each(['PT409', 'PT404', '42501'])('save_chart 오류 code %s는 그대로 던져 호출자가 안내를 고르게 한다', async code => {
    storage.rpc.mockResolvedValue({ data: null, error: { code, message: 'rejected' } });
    await expect(saveChartAsset({ songId: 'song-1', difficulty: 'normal', chart, extraLaneCount: 2,
      row: { chartId: 'chart-uuid', revision: 3 } })).rejects.toMatchObject({ code });
  });

  it('save_chart가 리비전 대신 null을 돌려주면 저장 성공으로 보지 않는다', async () => {
    storage.rpc.mockResolvedValue({ data: null, error: null });
    await expect(saveChartAsset({ songId: 'song-1', difficulty: 'normal', chart, extraLaneCount: 2,
      row: { chartId: 'chart-uuid', revision: 3 } })).rejects.toThrow('Invalid chart revision');
  });

  it('업로드가 실패하면 rpc를 부르지 않는다', async () => {
    storage.upload.mockResolvedValue({ error: { message: 'The resource already exists' } });
    await expect(saveChartAsset({ songId: 'song-1', difficulty: 'normal', chart, extraLaneCount: 2,
      row: { chartId: 'chart-uuid', revision: 3 } })).rejects.toThrow('Storage upload failed: The resource already exists');
    expect(storage.rpc).not.toHaveBeenCalled();
  });

  it('Save As 새 난이도 LIFTOFF는 rpc create_chart에 곡·소문자 liftoff·레벨 7·두 경로를 넘기고 반환 행 [{chart_id, revision 0}]의 ID를 쓴다', async () => {
    storage.rpc.mockResolvedValue({ data: [{ chart_id: 'new-uuid', revision: 0 }], error: null });

    const result = await createChartAsset({ songId: 'song-1', difficulty: 'LIFTOFF', chart, extraLaneCount: 2 });

    expect(storage.rpc).toHaveBeenCalledExactlyOnceWith('create_chart', {
      p_song_id: 'song-1', p_difficulty_label: 'liftoff', p_difficulty_level: 7,
      p_chart_path: `songs/song-1/liftoff-${UUID}.json`, p_chart_extra_path: `songs/song-1/liftoff-${UUID}.extra.json`,
    });
    expect(result.row).toEqual({ chartId: 'new-uuid', revision: 0 });
  });

  it('create_chart 오류 code 23505(같은 곡·난이도 행 있음)는 그대로 던진다', async () => {
    storage.rpc.mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate key' } });
    await expect(createChartAsset({ songId: 'song-1', difficulty: 'liftoff', chart })).rejects.toMatchObject({ code: '23505' });
  });

  it('곡 행 없는 차트의 저장은 결정적 경로 normal.json·normal.extra.json에 upsert true로 올리고 rpc를 부르지 않는다', async () => {
    const result = await saveSonglessChartAsset({ songId: 'song-1', difficulty: 'NORMAL', chart, extraLaneCount: 2 });

    expect(storage.upload.mock.calls.map(([path, , options]) => [path, options])).toEqual([
      ['songs/song-1/normal.json', { upsert: true }],
      ['songs/song-1/normal.extra.json', { upsert: true }],
    ]);
    expect(storage.rpc).not.toHaveBeenCalled();
    expect(result.chartPath).toBe('songs/song-1/normal.json');
  });
});


it('HARD 행 UUID로 Delete Chart하면 difficulty_label 대신 id를 조건으로 삭제하고 고정 경로 hard.json만 정리한다', async () => {
  await deleteChartAsset({ songId: 'song-1', difficulty: 'HARD', chartId: UUID });
  expect(storage.eq.mock.calls).toEqual([['id', UUID]]);
  expect(storage.remove).toHaveBeenCalledWith(['songs/song-1/hard.json', 'songs/song-1/hard.extra.json']);
});

it('행 없이 HARD를 Delete Chart하면 기존 song_id·소문자 hard 조건으로 삭제한다', async () => {
  await deleteChartAsset({ songId: 'song-1', difficulty: 'HARD' });
  expect(storage.eq.mock.calls).toEqual([['song_id', 'song-1'], ['difficulty_label', 'hard']]);
});


it.each(['save_chart', 'create_chart'])('%s가 42501·admin_required를 반환하면 code·message를 보존한 Error를 던진다', async rpc => {
  storage.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'admin_required' } });
  const input = { songId: 'song-1', difficulty: 'normal', chart, extraLaneCount: 2, row: { chartId: UUID, revision: 3 } };
  const error = await (rpc === 'save_chart' ? saveChartAsset(input) : createChartAsset(input)).catch((error: unknown) => error);
  expect(error).toBeInstanceOf(Error);
  expect(error).toMatchObject({ code: '42501', message: 'admin_required' });
});


it.each([100, 101])('곡 폴더에 파일 %i개가 있으면 100개씩 조회해 모든 경로를 삭제한다', async count => {
  const files = Array.from({ length: count }, (_, i) => ({ name: `normal-${i}.json` }));
  storage.list.mockImplementation(async (_prefix: string, options?: { limit: number; offset: number }) => ({
    data: files.slice(options?.offset ?? 0, (options?.offset ?? 0) + (options?.limit ?? 100)), error: null,
  }));
  const result = await deleteSongAsset({ songId: 'song-1', chartCount: 0 });
  expect(result.removedPaths).toHaveLength(count);
  expect(storage.list.mock.calls).toEqual([
    ['songs/song-1', { limit: 100, offset: 0, sortBy: { column: 'name', order: 'asc' } }],
    ['songs/song-1', { limit: 100, offset: 100, sortBy: { column: 'name', order: 'asc' } }],
  ]);
  expect(storage.remove).toHaveBeenCalledWith(files.map(file => `songs/song-1/${file.name}`));
});


it('파일 100개 조회 뒤 두 번째 페이지가 실패하면 일부 목록으로 Storage 삭제를 시작하지 않는다', async () => {
  storage.list.mockResolvedValueOnce({ data: Array.from({ length: 100 }, (_, i) => ({ name: `${i}.json` })), error: null })
    .mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
  await expect(deleteSongAsset({ songId: 'song-1', chartCount: 0 })).rejects.toThrow('Storage list failed: offline');
  expect(storage.remove).not.toHaveBeenCalled();
});

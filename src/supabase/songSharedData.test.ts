import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() }));
vi.mock('./client', () => ({ supabase: { from: query.from } }));
const { fetchSongSharedData } = await import('./songSharedData');

beforeEach(() => {
  vi.clearAllMocks();
  query.from.mockReturnValue(query);
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
});

describe('fetchSongSharedData', () => {
  it('song-1 행을 읽으면 timing·revision 42와 표시 정보·음원 경로를 같은 응답에서 반환한다', async () => {
    const timing = { bpmChanges: [{ beat: '0', bpm: 151 }],
      timeSignatureChanges: [{ beat: '0', beatPerMeasure: '4' }], offsetMs: 10 };
    query.maybeSingle.mockResolvedValue({ data: { title: '곡', artist: '작곡가', jacket_url: null,
      audio_url: 'songs/song-1/audio.ogg', duration: 120, preview_url: 'preview.wav', preview_start: 10, preview_end: 20,
      gameplay_start: 2, gameplay_end: 110, gameplay_fade_in: 1, gameplay_fade_out: 3, timing, revision: 42 }, error: null });
    expect(await fetchSongSharedData('song-1')).toEqual({ title: '곡', artist: '작곡가', jacketUrl: null,
      audioUrl: 'songs/song-1/audio.ogg', duration: 120, previewUrl: 'preview.wav', previewStart: 10, previewEnd: 20,
      gameplayStart: 2, gameplayEnd: 110, gameplayFadeIn: 1, gameplayFadeOut: 3, timing, revision: 42 });
    expect(query.from).toHaveBeenCalledWith('songs');
    expect(query.select).toHaveBeenCalledWith('title,artist,jacket_url,audio_url,duration,preview_url,preview_start,preview_end,gameplay_start,gameplay_end,gameplay_fade_in,gameplay_fade_out,timing,revision');
    expect(query.eq).toHaveBeenCalledWith('id', 'song-1');
  });

  it('song-1 행이 없으면 null을 반환해 차트 파일 자체 값을 쓰게 한다', async () => {
    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await fetchSongSharedData('song-1')).toBeNull();
  });

  it('PR1 적용 전 timing 열 조회가 42703으로 실패하면 곡 없음으로 숨기지 않고 거부한다', async () => {
    query.maybeSingle.mockResolvedValue({ data: null, error: { code: '42703', message: 'column songs.timing does not exist' } });
    await expect(fetchSongSharedData('song-1')).rejects.toThrow('column songs.timing does not exist');
  });
});

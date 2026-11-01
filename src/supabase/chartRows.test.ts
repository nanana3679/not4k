import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), eq: vi.fn() }));
vi.mock('./client', () => ({ supabase: { from: query.from } }));
const { fetchChartRows, findChartRow } = await import('./chartRows');

const row = (difficultyLabel: string, id = `chart-${difficultyLabel}`) => ({
  id, difficultyLabel, revision: 0, chartPath: null, chartExtraPath: null,
});

describe('findChartRow', () => {
  it('EASY와 easy 행이 모두 있으면 easy를 열 때 이름이 같은 easy 행을 고른다', () => {
    expect(findChartRow([row('EASY'), row('easy')], 'easy')?.id).toBe('chart-easy');
  });

  it('EASY 행만 있으면 easy를 열 때 대소문자만 다른 EASY 행을 고른다', () => {
    expect(findChartRow([row('normal'), row('EASY')], 'easy')?.id).toBe('chart-EASY');
  });

  it('hard를 열 때 같은 이름의 행이 없으면 null이다', () => {
    expect(findChartRow([row('normal')], 'hard')).toBeNull();
  });
});

describe('fetchChartRows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    query.from.mockReturnValue(query);
    query.select.mockReturnValue(query);
  });

  it('song-1의 charts 행을 ID·리비전 3·저장 경로와 함께 읽고 경로 NULL은 NULL로 둔다', async () => {
    query.eq.mockResolvedValue({ data: [
      { id: 'a', difficulty_label: 'easy', revision: 3, chart_path: 'songs/song-1/easy-t.json', chart_extra_path: 'songs/song-1/easy-t.extra.json' },
      { id: 'b', difficulty_label: 'hard', revision: 0, chart_path: null, chart_extra_path: null },
    ], error: null });

    expect(await fetchChartRows('song-1')).toEqual([
      { id: 'a', difficultyLabel: 'easy', revision: 3, chartPath: 'songs/song-1/easy-t.json', chartExtraPath: 'songs/song-1/easy-t.extra.json' },
      { id: 'b', difficultyLabel: 'hard', revision: 0, chartPath: null, chartExtraPath: null },
    ]);
    expect(query.from).toHaveBeenCalledWith('charts');
    expect(query.select).toHaveBeenCalledWith('id,difficulty_label,revision,chart_path,chart_extra_path');
    expect(query.eq).toHaveBeenCalledWith('song_id', 'song-1');
  });

  it('조회 오류는 빈 목록으로 숨기지 않고 던진다', async () => {
    query.eq.mockResolvedValue({ data: null, error: { code: '42501', message: 'denied' } });
    await expect(fetchChartRows('song-1')).rejects.toMatchObject({ code: '42501' });
  });
});

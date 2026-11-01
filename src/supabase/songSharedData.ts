import type { SongSharedData } from '../shared/songAssets/resolveSongChart';
import { CHART_ROW_COLUMNS, findChartRow, toStoredChartRow, type ChartRowRecord, type StoredChartRow } from './chartRows';
import { supabase } from './client';

export interface LoadedSongSharedData extends SongSharedData {
  readonly audioUrl: string;
  readonly revision: number;
  readonly duration: number | null;
  readonly previewUrl: string | null;
  readonly previewStart: number | null;
  readonly previewEnd: number | null;
  readonly gameplayStart: number | null;
  readonly gameplayEnd: number | null;
  readonly gameplayFadeIn: number | null;
  readonly gameplayFadeOut: number | null;
}

/** `songs` 행의 DB 표현(snake_case). 타이밍 JSON은 resolver가 검증한다. */
interface SongRecord {
  title: string; artist: string; jacket_url: string | null; audio_url: string; duration: number | null;
  preview_url: string | null; preview_start: number | null; preview_end: number | null;
  gameplay_start: number | null; gameplay_end: number | null; gameplay_fade_in: number | null; gameplay_fade_out: number | null;
  timing: unknown; revision: number;
  charts?: ChartRowRecord[];
}

const SONG_COLUMNS = 'title,artist,jacket_url,audio_url,duration,preview_url,preview_start,preview_end,gameplay_start,gameplay_end,gameplay_fade_in,gameplay_fade_out,timing,revision';

/** 신규 열이 없는 DB의 조회 오류는 폴백하지 않는다. PR1 마이그레이션을 앱보다 먼저 적용해야 한다. */
export async function fetchSongSharedData(songId: string): Promise<LoadedSongSharedData | null> {
  const { data, error } = await supabase.from('songs')
    .select(SONG_COLUMNS)
    .eq('id', songId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load song: ${error.message}`);
  if (!data) return null;
  return toLoadedSong(data as unknown as SongRecord);
}

/** 온라인 차트를 열 때 필요한 곡 행과 열린 난이도의 `charts` 행. 둘 다 없으면 null이다. */
export interface SongChartSource {
  readonly song: LoadedSongSharedData | null;
  readonly chartRow: StoredChartRow | null;
}

/**
 * 곡 행과 그 곡의 `charts` 행을 한 번에 읽는다(RFD 0107). 게임·에디터 로더는 고른 행의 `chart_path`·`chart_extra_path`로
 * 차트 파일을 찾고, 경로가 NULL이거나 행이 없으면 기존 결정적 경로를 읽는다. 차트 행은 곡 행 없이 있을 수 없다(FK).
 */
export async function fetchSongChartSource(songId: string, difficulty: string): Promise<SongChartSource> {
  const { data, error } = await supabase.from('songs')
    .select(`${SONG_COLUMNS},charts(${CHART_ROW_COLUMNS})`)
    .eq('id', songId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load song: ${error.message}`);
  if (!data) return { song: null, chartRow: null };
  const record = data as unknown as SongRecord;
  return { song: toLoadedSong(record), chartRow: findChartRow((record.charts ?? []).map(toStoredChartRow), difficulty) };
}

function toLoadedSong(data: SongRecord): LoadedSongSharedData {
  return { title: data.title, artist: data.artist, jacketUrl: data.jacket_url,
    audioUrl: data.audio_url, duration: data.duration, previewUrl: data.preview_url,
    previewStart: data.preview_start, previewEnd: data.preview_end,
    gameplayStart: data.gameplay_start, gameplayEnd: data.gameplay_end,
    gameplayFadeIn: data.gameplay_fade_in, gameplayFadeOut: data.gameplay_fade_out, timing: data.timing, revision: data.revision };
}

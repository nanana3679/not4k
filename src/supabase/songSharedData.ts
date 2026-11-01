import type { SongSharedData } from '../shared/songAssets/resolveSongChart';
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

/** 신규 열이 없는 DB의 조회 오류는 폴백하지 않는다. PR1 마이그레이션을 앱보다 먼저 적용해야 한다. */
export async function fetchSongSharedData(songId: string): Promise<LoadedSongSharedData | null> {
  const { data, error } = await supabase.from('songs')
    .select('title,artist,jacket_url,audio_url,duration,preview_url,preview_start,preview_end,gameplay_start,gameplay_end,gameplay_fade_in,gameplay_fade_out,timing,revision')
    .eq('id', songId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load song: ${error.message}`);
  if (!data) return null;
  return { title: data.title, artist: data.artist, jacketUrl: data.jacket_url,
    audioUrl: data.audio_url, duration: data.duration, previewUrl: data.preview_url,
    previewStart: data.preview_start, previewEnd: data.preview_end,
    gameplayStart: data.gameplay_start, gameplayEnd: data.gameplay_end,
    gameplayFadeIn: data.gameplay_fade_in, gameplayFadeOut: data.gameplay_fade_out, timing: data.timing, revision: data.revision };
}

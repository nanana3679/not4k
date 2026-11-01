import type { SongSharedData } from '../shared/songAssets/resolveSongChart';
import { supabase } from './client';

export interface LoadedSongSharedData extends SongSharedData {
  readonly audioUrl: string;
  readonly revision: number;
}

/** 신규 열이 없는 DB의 조회 오류는 폴백하지 않는다. PR1 마이그레이션을 앱보다 먼저 적용해야 한다. */
export async function fetchSongSharedData(songId: string): Promise<LoadedSongSharedData | null> {
  const { data, error } = await supabase.from('songs')
    .select('title,artist,jacket_url,audio_url,timing,revision')
    .eq('id', songId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load song: ${error.message}`);
  if (!data) return null;
  return { title: data.title, artist: data.artist, jacketUrl: data.jacket_url,
    audioUrl: data.audio_url, timing: data.timing, revision: data.revision };
}

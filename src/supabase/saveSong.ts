import { STORAGE_BUCKET, deserializeChartDocument } from '../shared';
import { toSongTiming } from '../shared/songAssets/toSongTiming';
import { fetchChartText } from './storage';
import { supabase } from './client';
import type { SongTiming } from '../shared/songAssets/songTiming';

/** save_song이 한 번에 확정하는 전체 값. 차트 내 사본은 편집·Undo의 기존 소유자를 유지한다. */
export interface SongValues {
  title: string; artist: string; jacketUrl: string | null; audioUrl: string;
  duration: number | null; previewUrl: string | null; previewStart: number | null; previewEnd: number | null;
  gameplayStart: number | null; gameplayEnd: number | null;
  gameplayFadeIn: number | null; gameplayFadeOut: number | null;
  timing: SongTiming;
}

/** 전체 곡 값을 열 때 본 리비전으로 교체한다. SQLSTATE는 호출자가 안내하도록 보존한다. */
export async function saveSong(songId: string, revision: number, values: SongValues): Promise<number> {
  const { data, error } = await supabase.rpc('save_song', {
    p_song_id: songId, p_expected_revision: revision,
    p_title: values.title, p_artist: values.artist, p_jacket_url: values.jacketUrl,
    p_audio_url: values.audioUrl, p_duration: values.duration, p_preview_url: values.previewUrl,
    p_preview_start: values.previewStart, p_preview_end: values.previewEnd,
    p_gameplay_start: values.gameplayStart, p_gameplay_end: values.gameplayEnd,
    p_gameplay_fade_in: values.gameplayFadeIn, p_gameplay_fade_out: values.gameplayFadeOut,
    p_timing: values.timing,
  });
  if (error) throw error;
  if (!Number.isSafeInteger(data) || data < 0) throw new Error('Invalid song revision');
  return data;
}

/** 기존 객체를 덮지 않는다. DB 실패 후 남는 새 객체 정리는 별도 작업이다(RFD 0107). */
export async function uploadSongMedia(songId: string, kind: 'jacket' | 'audio' | 'preview', blob: Blob, extension: string): Promise<string> {
  const path = `songs/${songId.toLowerCase()}/${kind}-${crypto.randomUUID()}.${extension.toLowerCase()}`;
  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, blob, { upsert: false });
  if (error) throw error;
  return path;
}

/** 곡 정본을 덮어씌우기 전 파일 타이밍끼리 비교한다. 읽기 실패는 조용히 동의로 처리하지 않는다. */
export async function findDifferingSongCharts(songId: string, openDifficulty: string, timing: SongTiming): Promise<string[]> {
  const { data, error } = await supabase.from('charts').select('difficulty_label,chart_path').eq('song_id', songId);
  if (error) throw error;
  const differing: string[] = [];
  for (const row of data ?? []) {
    if (row.difficulty_label.toLowerCase() === openDifficulty.toLowerCase()) continue;
    const chart = deserializeChartDocument(await fetchChartText(songId, row.difficulty_label, row.chart_path));
    if (JSON.stringify(toSongTiming(chart)) !== JSON.stringify(timing)) differing.push(row.difficulty_label);
  }
  return differing;
}

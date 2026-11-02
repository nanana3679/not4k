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

/** 공통 타이밍 변경의 영향 범위. 열린 차트는 대소문자와 관계없이 제외한다. */
export async function countOtherSongCharts(songId: string, openDifficulty: string): Promise<number> {
  const { data, error } = await supabase.from('charts').select('difficulty_label').eq('song_id', songId);
  if (error) throw error;
  return (data ?? []).filter(row => row.difficulty_label.toLowerCase() !== openDifficulty.toLowerCase()).length;
}

/** 이행 확인에 보일 다른 차트. 파일이 없거나 해석할 수 없는 차트는 비교하지 못한 차트로 따로 돌려준다. */
export interface SongChartTimingComparison {
  differing: string[];
  uncompared: string[];
}

/**
 * 이행 확인에서만 다른 차트 파일을 읽어 타이밍을 비교한다. 차트 목록 조회 실패는 던지지만, 차트 파일 하나를 읽거나
 * 해석하지 못한 것은 저장을 막지 않고 `uncompared`에 담아 관리자가 확인 창에서 판단하게 한다.
 */
export async function findDifferingSongCharts(songId: string, openDifficulty: string, timing: SongTiming): Promise<SongChartTimingComparison> {
  const { data, error } = await supabase.from('charts').select('difficulty_label,chart_path').eq('song_id', songId);
  if (error) throw error;
  const result: SongChartTimingComparison = { differing: [], uncompared: [] };
  for (const row of data ?? []) {
    if (row.difficulty_label.toLowerCase() === openDifficulty.toLowerCase()) continue;
    let otherTiming: SongTiming;
    try {
      otherTiming = toSongTiming(deserializeChartDocument(await fetchChartText(songId, row.difficulty_label, row.chart_path)));
    } catch {
      result.uncompared.push(row.difficulty_label);
      continue;
    }
    if (JSON.stringify(otherTiming) !== JSON.stringify(timing)) result.differing.push(row.difficulty_label);
  }
  return result;
}

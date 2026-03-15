/**
 * Supabase Storage 패치 유틸리티
 *
 * 곡 선택 → 로딩 화면에서 차트 JSON과 음원을 병렬로 가져온다.
 * tech-stack.md §로딩 흐름 기준.
 */

import { supabase } from "./client";
import {
  STORAGE_BUCKET,
  songAudioPath,
  songJacketPath,
  songChartPath,
} from "../shared";
import { deserializeChart } from "../shared";
import type { Chart } from "../shared";

/**
 * Storage에서 파일의 퍼블릭 URL을 반환한다.
 */
function getPublicUrl(path: string): string {
  const { data } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(path);
  return data.publicUrl;
}

/**
 * 차트 JSON을 로드하고 파싱한다.
 */
export async function fetchChart(
  songId: string,
  difficulty: string,
): Promise<Chart> {
  const url = getPublicUrl(songChartPath(songId, difficulty));
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`Failed to fetch chart: ${response.status}`);
  }
  const text = await response.text();
  return deserializeChart(text);
}

/**
 * 음원 파일을 로드하고 AudioBuffer로 디코딩한다.
 * audioUrl이 제공되면 해당 경로를 직접 사용하고,
 * 없으면 OGG → MP3 폴백을 시도한다.
 */
export async function fetchAudio(
  songId: string,
  audioCtx: AudioContext,
  audioUrl?: string,
): Promise<AudioBuffer> {
  let arrayBuffer: ArrayBuffer;
  if (audioUrl) {
    const url = getPublicUrl(audioUrl);
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Failed to fetch audio: ${res.status}`);
    arrayBuffer = await res.arrayBuffer();
  } else {
    arrayBuffer = await fetchWithFallback(
      songAudioPath(songId, 'ogg'),
      songAudioPath(songId, 'mp3'),
      'audio',
    );
  }
  return audioCtx.decodeAudioData(arrayBuffer);
}

/**
 * 첫 번째 경로로 fetch를 시도하고 실패 시 폴백 경로로 재시도한다.
 */
async function fetchWithFallback(
  primaryPath: string,
  fallbackPath: string,
  label: string,
): Promise<ArrayBuffer> {
  const primaryUrl = getPublicUrl(primaryPath);
  const res = await fetch(primaryUrl, { cache: 'no-cache' });
  if (res.ok) return res.arrayBuffer();

  const fallbackUrl = getPublicUrl(fallbackPath);
  const fallbackRes = await fetch(fallbackUrl, { cache: 'no-cache' });
  if (!fallbackRes.ok) {
    throw new Error(`Failed to fetch ${label}: ${fallbackRes.status}`);
  }
  return fallbackRes.arrayBuffer();
}

/**
 * 자켓 이미지 URL을 반환한다 (img src에 직접 사용).
 */
export function getJacketUrl(songId: string): string {
  return getPublicUrl(songJacketPath(songId));
}

/**
 * 차트 + 음원을 병렬로 로드한다.
 * 곡 선택 → 로딩 화면에서 사용.
 */
export async function loadSongData(
  songId: string,
  difficulty: string,
  audioCtx: AudioContext,
  audioUrl?: string,
): Promise<{ chart: Chart; audioBuffer: AudioBuffer }> {
  const [chart, audioBuffer] = await Promise.all([
    fetchChart(songId, difficulty),
    fetchAudio(songId, audioCtx, audioUrl),
  ]);
  return { chart, audioBuffer };
}

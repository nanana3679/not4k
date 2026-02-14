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
  songPreviewPath,
  songJacketPath,
  songChartPath,
} from "@not4k/shared";
import { deserializeChart } from "@not4k/shared";
import type { Chart } from "@not4k/shared";

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
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch chart: ${response.status}`);
  }
  const text = await response.text();
  return deserializeChart(text);
}

/**
 * 음원 파일을 로드하고 AudioBuffer로 디코딩한다.
 * OGG를 먼저 시도하고 실패 시 MP3로 폴백한다 (Safari 호환).
 */
export async function fetchAudio(
  songId: string,
  audioCtx: AudioContext,
): Promise<AudioBuffer> {
  const arrayBuffer = await fetchWithFallback(
    songAudioPath(songId, 'ogg'),
    songAudioPath(songId, 'mp3'),
    'audio',
  );
  return audioCtx.decodeAudioData(arrayBuffer);
}

/**
 * 프리뷰 음원을 로드하고 AudioBuffer로 디코딩한다.
 * OGG를 먼저 시도하고 실패 시 MP3로 폴백한다 (Safari 호환).
 */
export async function fetchPreviewAudio(
  songId: string,
  audioCtx: AudioContext,
): Promise<AudioBuffer> {
  const arrayBuffer = await fetchWithFallback(
    songPreviewPath(songId, 'ogg'),
    songPreviewPath(songId, 'mp3'),
    'preview audio',
  );
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
  const res = await fetch(primaryUrl);
  if (res.ok) return res.arrayBuffer();

  const fallbackUrl = getPublicUrl(fallbackPath);
  const fallbackRes = await fetch(fallbackUrl);
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
): Promise<{ chart: Chart; audioBuffer: AudioBuffer }> {
  const [chart, audioBuffer] = await Promise.all([
    fetchChart(songId, difficulty),
    fetchAudio(songId, audioCtx),
  ]);
  return { chart, audioBuffer };
}

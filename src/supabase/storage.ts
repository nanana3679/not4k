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
  songChartExtraPath,
} from "../shared";
import { ChartFormatError, deserializeChart, deserializeChartDocument, parseExtraNotesDocument, withAuxNotes } from "../shared";
import type { Chart, ChartDocument } from "../shared";

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
  return deserializeChart(await fetchChartText(songId, difficulty));
}

/** main/aux의 구형·명시 항목과 메타데이터를 보존하는 문서 읽기 경계. */
export async function fetchChartDocument(songId: string, difficulty: string): Promise<ChartDocument> {
  const [chartText, extraText] = await Promise.all([
    fetchChartText(songId, difficulty),
    fetchExtraChartText(songId, difficulty),
  ]);
  const chart = deserializeChartDocument(chartText);
  const extra = parseExtraNotesDocument(extraText === null ? JSON.parse(chartText) : parseAuxJson(extraText));
  if (extraText !== null || extra.extraNotes.length > 0 || extra.extraLaneCount > 0) {
    return { ...chart, notes: withAuxNotes(chart.notes, extra.extraNotes) };
  }
  return chart;
}

/** 손상된 aux JSON은 메인 JSON과 같이 차트 형식 오류로 알린다(네트워크 오류로 읽히지 않게). */
function parseAuxJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new ChartFormatError("보조 파일이 유효한 JSON이 아닙니다");
  }
}

async function fetchExtraChartText(songId: string, difficulty: string): Promise<string | null> {
  const response = await fetch(getPublicUrl(songChartExtraPath(songId, difficulty)), { cache: 'no-cache' });
  if (response.ok) return response.text();
  if (await isMissingObjectResponse(response)) return null;
  throw new Error(`Failed to fetch chart extras: ${response.status}`);
}

/**
 * aux가 없는 곡인지 판별한다. Supabase Storage는 없는 객체를 HTTP 404가 아니라
 * HTTP 400과 본문 `{"statusCode":"404","error":"not_found","code":"NoSuchKey"}`로 알린다.
 * 권한·버킷·서버 오류처럼 다른 본문의 400은 없는 파일로 보지 않는다.
 */
async function isMissingObjectResponse(response: Response): Promise<boolean> {
  if (response.status === 404) return true;
  if (response.status !== 400) return false;
  let body: unknown;
  try {
    body = JSON.parse(await response.text());
  } catch {
    return false;
  }
  if (!body || typeof body !== 'object') return false;
  const { statusCode, error, code } = body as Record<string, unknown>;
  return code === 'NoSuchKey' || (String(statusCode) === '404' && error === 'not_found');
}

async function fetchChartText(songId: string, difficulty: string): Promise<string> {
  const url = getPublicUrl(songChartPath(songId, difficulty));
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`Failed to fetch chart: ${response.status}`);
  }
  return response.text();
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
  const primaryStatus = res.status;

  const fallbackUrl = getPublicUrl(fallbackPath);
  const fallbackRes = await fetch(fallbackUrl, { cache: 'no-cache' });
  if (!fallbackRes.ok) {
    throw new Error(`Failed to fetch ${label}: primary=${primaryStatus}, fallback=${fallbackRes.status}`);
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

/** 일반 게임은 문서를 읽은 뒤 재생 요청 경계에서 전체 유효성을 검사한다. */
export async function loadSongDocumentData(
  songId: string,
  difficulty: string,
  audioCtx: AudioContext,
  audioUrl?: string,
): Promise<{ chart: ChartDocument; audioBuffer: AudioBuffer }> {
  const [chart, audioBuffer] = await Promise.all([
    fetchChartDocument(songId, difficulty),
    fetchAudio(songId, audioCtx, audioUrl),
  ]);
  return { chart, audioBuffer };
}

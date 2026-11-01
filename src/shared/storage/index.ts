/**
 * Supabase Storage 경로 유틸리티
 *
 * tech-stack.md §Storage 구조 설계 기준:
 *
 * storage/
 * ├── songs/{song_id}/audio.ogg
 * ├── songs/{song_id}/jacket.jpg
 * ├── songs/{song_id}/{difficulty}.json             (charts 행의 경로가 NULL일 때)
 * ├── songs/{song_id}/{difficulty}-{token}.json     (차트 저장이 올린 새 경로, RFD 0107)
 * └── tutorials/{phase}.ogg / {phase}.json
 */

export const STORAGE_BUCKET = "assets";

// ---------------------------------------------------------------------------
// 입력 검증
// ---------------------------------------------------------------------------

const SAFE_SEGMENT = /^[a-z0-9][a-z0-9._-]*$/;

function sanitize(segment: string, label: string): string {
  const s = segment.toLowerCase();
  if (!SAFE_SEGMENT.test(s)) {
    throw new Error(`유효하지 않은 ${label}: "${segment}"`);
  }
  return s;
}

// ---------------------------------------------------------------------------
// 경로 빌더
// ---------------------------------------------------------------------------

export function songAudioPath(songId: string, ext = 'ogg'): string {
  return `songs/${sanitize(songId, 'songId')}/audio.${sanitize(ext, 'ext')}`;
}

export function songJacketPath(songId: string, ext = 'jpg'): string {
  return `songs/${sanitize(songId, 'songId')}/jacket.${sanitize(ext, 'ext')}`;
}

export function songChartPath(songId: string, difficulty: string): string {
  return `songs/${sanitize(songId, 'songId')}/${sanitize(difficulty, 'difficulty')}.json`;
}

export function songChartExtraPath(songId: string, difficulty: string): string {
  return `songs/${sanitize(songId, 'songId')}/${sanitize(difficulty, 'difficulty')}.extra.json`;
}

/** `charts` 행의 메인·보조 JSON 경로 열. NULL이면 기존 결정적 경로를 쓴다(RFD 0107). */
export interface StoredChartAssetPaths {
  chartPath: string | null;
  chartExtraPath: string | null;
}

/** 읽을 메인·보조 JSON 경로. 행이 없거나 경로 열이 NULL이면 `songChartPath`·`songChartExtraPath`다. */
export function resolveChartAssetPaths(
  songId: string,
  difficulty: string,
  stored: StoredChartAssetPaths | null,
): { chartPath: string; extraPath: string } {
  return {
    chartPath: stored?.chartPath ?? songChartPath(songId, difficulty),
    extraPath: stored?.chartExtraPath ?? songChartExtraPath(songId, difficulty),
  };
}

/**
 * 차트 저장이 올릴 새 메인·보조 JSON 경로. 기존 객체를 덮지 않도록 저장마다 다른 토큰을 붙이며,
 * 두 파일이 같은 저장에서 왔음을 알 수 있게 같은 토큰을 쓴다. 곡 삭제가 `songs/{song_id}`의 파일 목록으로
 * 지우므로 하위 폴더를 만들지 않는다.
 */
export function newChartAssetPaths(
  songId: string,
  difficulty: string,
  token: string,
): { chartPath: string; extraPath: string } {
  const base = `songs/${sanitize(songId, 'songId')}/${sanitize(difficulty, 'difficulty')}-${sanitize(token, 'token')}`;
  return { chartPath: `${base}.json`, extraPath: `${base}.extra.json` };
}

export function songPreviewPath(songId: string, ext = 'wav'): string {
  return `songs/${sanitize(songId, 'songId')}/preview.${sanitize(ext, 'ext')}`;
}

export function tutorialAudioPath(phase: string): string {
  return `tutorials/${sanitize(phase, 'phase')}.ogg`;
}

export function tutorialChartPath(phase: string): string {
  return `tutorials/${sanitize(phase, 'phase')}.json`;
}

// ---------------------------------------------------------------------------
// 캐시 무효화
// ---------------------------------------------------------------------------

/**
 * 퍼블릭 URL에 캐시버스트 쿼리(`v=token`)를 붙인다.
 *
 * Storage는 같은 경로에 upsert로 덮어써도 URL이 동일해, 브라우저 HTTP 캐시가
 * 옛 파일을 계속 제공한다(특히 `<audio>` 엘리먼트는 fetch의 no-cache를 못 쓴다).
 * 곡의 `updated_at` 같은 "내용이 바뀔 때만 변하는" 값을 token으로 넘기면
 * 변경된 곡만 정확히 캐시가 무효화되고, 변화 없는 곡은 캐시를 그대로 재사용한다.
 *
 * token이 비어 있으면(null/undefined/'') URL을 그대로 반환한다.
 */
export function withCacheBust(url: string, token?: string | null): string {
  if (!token) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}v=${encodeURIComponent(token)}`;
}

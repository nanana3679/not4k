/**
 * Supabase Storage 경로 유틸리티
 *
 * tech-stack.md §Storage 구조 설계 기준:
 *
 * storage/
 * ├── songs/{song_id}/audio.ogg
 * ├── songs/{song_id}/jacket.jpg
 * ├── songs/{song_id}/{difficulty}.{revision}.json
 * ├── songs/{song_id}/{difficulty}.{revision}.extra.json
 * ├── songs/{song_id}/{difficulty}.manifest.json
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

export function songChartManifestPath(songId: string, difficulty: string): string {
  return `songs/${sanitize(songId, 'songId')}/${sanitize(difficulty, 'difficulty')}.manifest.json`;
}

export function songChartRevisionPath(
  songId: string,
  difficulty: string,
  revision: string,
): string {
  return `songs/${sanitize(songId, 'songId')}/${sanitize(difficulty, 'difficulty')}.${sanitize(revision, 'revision')}.json`;
}

export function songChartExtraRevisionPath(
  songId: string,
  difficulty: string,
  revision: string,
): string {
  return `songs/${sanitize(songId, 'songId')}/${sanitize(difficulty, 'difficulty')}.${sanitize(revision, 'revision')}.extra.json`;
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

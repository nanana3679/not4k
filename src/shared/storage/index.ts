/**
 * Supabase Storage 경로 유틸리티
 *
 * tech-stack.md §Storage 구조 설계 기준:
 *
 * storage/
 * ├── songs/{song_id}/audio.ogg
 * ├── songs/{song_id}/jacket.jpg
 * ├── songs/{song_id}/{difficulty}.json
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

export function songPreviewPath(songId: string, ext = 'wav'): string {
  return `songs/${sanitize(songId, 'songId')}/preview.${sanitize(ext, 'ext')}`;
}

export function tutorialAudioPath(phase: string): string {
  return `tutorials/${phase}.ogg`;
}

export function tutorialChartPath(phase: string): string {
  return `tutorials/${phase}.json`;
}

/**
 * Supabase Storage 경로 유틸리티
 *
 * tech-stack.md §Storage 구조 설계 기준:
 *
 * storage/
 * ├── songs/{song_id}/audio.ogg
 * ├── songs/{song_id}/preview.ogg
 * ├── songs/{song_id}/jacket.jpg
 * ├── songs/{song_id}/{difficulty}.json
 * └── tutorials/{phase}.ogg / {phase}.json
 */

export const STORAGE_BUCKET = "assets";

// ---------------------------------------------------------------------------
// 경로 빌더
// ---------------------------------------------------------------------------

export function songAudioPath(songId: string, ext = 'ogg'): string {
  return `songs/${songId}/audio.${ext}`;
}

export function songPreviewPath(songId: string, ext = 'ogg'): string {
  return `songs/${songId}/preview.${ext}`;
}

export function songJacketPath(songId: string, ext = 'jpg'): string {
  return `songs/${songId}/jacket.${ext}`;
}

export function songChartPath(songId: string, difficulty: string): string {
  return `songs/${songId}/${difficulty.toLowerCase()}.json`;
}

export function tutorialAudioPath(phase: string): string {
  return `tutorials/${phase}.ogg`;
}

export function tutorialChartPath(phase: string): string {
  return `tutorials/${phase}.json`;
}

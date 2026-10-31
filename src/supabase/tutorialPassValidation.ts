export const MAX_TUTORIAL_HANDOFF_IDS = 100;

/** DB CHECK와 같은 형식. 카탈로그 밖의 유효한 ID도 보존·동기화한다. */
export function isValidTutorialId(id: string): boolean {
  return id.length >= 1 && id.length <= 64 && !/[^a-z0-9-]/.test(id);
}

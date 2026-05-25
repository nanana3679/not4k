export type EditorAudioLoadingSurface = "page" | "overlay" | null;

export function getEditorAudioLoadingSurface(input: {
  audioLoading: boolean;
  initialAudioPending: boolean;
}): EditorAudioLoadingSurface {
  if (input.initialAudioPending) return "page";
  if (input.audioLoading) return "overlay";
  return null;
}

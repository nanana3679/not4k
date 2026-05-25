export type EditorAudioLoadingSurface = "transparentPage" | "overlay" | null;

export function getEditorAudioLoadingSurface(input: {
  audioLoading: boolean;
  initialAudioPending: boolean;
}): EditorAudioLoadingSurface {
  if (input.initialAudioPending) return "transparentPage";
  if (input.audioLoading) return "overlay";
  return null;
}

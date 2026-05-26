import { getOperationLoadingSurface } from "../shared/feedback/operationFeedback";
import type { OperationLoadingSurface } from "../shared/feedback/operationFeedback";

export type EditorAudioLoadingSurface = "transparentPage" | "overlay" | null;

export function getEditorAudioLoadingSurface(input: {
  audioLoading: boolean;
  initialAudioPending: boolean;
}): EditorAudioLoadingSurface {
  if (input.initialAudioPending) {
    return asEditorAudioSurface(getOperationLoadingSurface({
      operation: "editor.initialAudioLoad",
      running: true,
    }));
  }
  if (input.audioLoading) {
    return asEditorAudioSurface(getOperationLoadingSurface({
      operation: "editor.audioReload",
      running: true,
    }));
  }
  return asEditorAudioSurface(getOperationLoadingSurface({
    operation: "editor.audioReload",
    running: false,
  }));
}

function asEditorAudioSurface(surface: OperationLoadingSurface): EditorAudioLoadingSurface {
  if (surface === "transparentPage" || surface === "overlay") return surface;
  return null;
}

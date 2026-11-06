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

/**
 * store가 아는 음원 로드 대기. 드로어 음원을 읽는 중이거나 훅이 아직 받지 않은 URL이 남아 있으면 Save·Save As를 시작하지 않는다.
 * 훅이 URL을 받은 뒤의 로드는 훅의 로딩 상태가 맡는다.
 */
export function isStoreAudioLoading(state: { isLoadingSongAudio: boolean; pendingAudioUrl: string | null }): boolean {
  return state.isLoadingSongAudio || state.pendingAudioUrl !== null;
}

function asEditorAudioSurface(surface: OperationLoadingSurface): EditorAudioLoadingSurface {
  if (surface === "transparentPage" || surface === "overlay") return surface;
  return null;
}

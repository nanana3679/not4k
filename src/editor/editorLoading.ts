import { getOperationLoadingSurface } from "../shared/feedback/operationFeedback";
import type { OperationLoadingSurface } from "../shared/feedback/operationFeedback";
import { maxAuxLane, toAuxIndex } from "../shared/chart/laneAxis";
import type { TrillZone } from "../shared/types/chart";

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

/**
 * 로드한 차트의 보조 레인 trillZone이 모두 보이는 보조 레인 수 — `extraLaneCount`보다 줄이지 않는다.
 *
 * 보조 레인 trillZone은 의미 위반(`trillZoneMainOnly`)이라 저장·플레이를 막는데, 숨은 레인에
 * 있으면 박스로 선택·삭제할 수 없어 저장이 영영 막힌다(#102). 그래서 로드 병합은 보조 파일
 * 유무와 관계없이 이 값으로 보조 레인 수를 넓힌다. 툴바 선택지 상한(10)을 넘을 수 있다.
 */
export function extraLaneCountCoveringTrillZones(
  extraLaneCount: number,
  trillZones: readonly TrillZone[],
): number {
  return Math.max(extraLaneCount, toAuxIndex(maxAuxLane(trillZones)));
}

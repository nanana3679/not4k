import {
  isVisibleLane,
  toAuxIndex,
  type NoteEntity,
  type ValidationError,
} from "../shared";

export function hiddenAuxViolationMessage(
  errors: readonly ValidationError[],
  notes: readonly NoteEntity[],
  extraLaneCount: number,
): string | null {
  let requiredCount = 0;
  for (const error of errors) {
    for (const ref of error.refs ?? []) {
      if (ref.kind !== "note") continue;
      const note = notes[ref.index];
      if (!note || isVisibleLane(note.lane, extraLaneCount)) continue;
      const auxIndex = toAuxIndex(note.lane);
      if (auxIndex !== null) requiredCount = Math.max(requiredCount, auxIndex);
    }
  }
  if (requiredCount === 0) return null;
  return `숨겨진 보조 레인 ${requiredCount}에 수정할 노트가 있습니다. 보조 레인 수를 ${requiredCount} 이상으로 늘려 주세요.`;
}

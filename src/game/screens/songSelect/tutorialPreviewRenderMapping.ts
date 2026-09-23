import type { JudgmentBodyStateQuery, JudgmentBodyStateView } from '../../renderer/GameNoteRenderer';

/** Maps a rendered repeated-chart note back to the live preview session cycle. */
export function mapTutorialRenderBodyQuery(
  query: JudgmentBodyStateQuery,
  sourceNoteCount: number,
  loopMs: number,
  activeRenderCycle: number,
  renderNoteIndex: number,
  renderTimeMs: number,
): JudgmentBodyStateView | null {
  if (sourceNoteCount <= 0 || loopMs <= 0) return null;
  const renderCycle = Math.floor(renderNoteIndex / sourceNoteCount);
  if (renderCycle !== activeRenderCycle) return null;

  const sourceNoteIndex = renderNoteIndex % sourceNoteCount;
  const sourceTimeMs = renderTimeMs - activeRenderCycle * loopMs;
  const body = query(sourceNoteIndex, sourceTimeMs);
  if (!body) return null;

  return {
    ...body,
    successorIndex: body.successorIndex === undefined
      ? undefined
      : activeRenderCycle * sourceNoteCount + body.successorIndex,
  };
}

export function getTutorialRenderCycleIndex(renderTimeMs: number, loopMs: number): number {
  return loopMs > 0 ? Math.floor(renderTimeMs / loopMs) : 0;
}

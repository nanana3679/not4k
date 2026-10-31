import type { Beat } from './types/beat';
import type { DocumentNoteEntity } from './types/chart';
import { isMainLane } from './chart/laneAxis';
import { minimapColor as colors } from './theme';

/** 렌더러·store에 의존하지 않는 에디터 미니맵의 노트 도형. 시간축 방향은 호출자가 정한다. */
export function minimapNoteRect(
  note: DocumentNoteEntity, beatToY: (beat: Beat) => number, laneWidth: number, trackX = 0,
) {
  if (!isMainLane(note.lane)) return null;
  const y = beatToY(note.beat);
  const x = trackX + (note.lane - 1) * laneWidth;
  if ('endBeat' in note) {
    const endY = beatToY(note.endBeat);
    const color = note.type === 'body'
      ? note.trill ? colors.TRILL_LONG : note.holdCount === 2 ? colors.DOUBLE_LONG : colors.SINGLE_LONG
      : note.type === 'trillLong' ? colors.TRILL_LONG
        : note.type === 'doubleLong' ? colors.DOUBLE_LONG : colors.SINGLE_LONG;
    return { x, y: Math.min(y, endY), width: laneWidth, height: Math.max(1, Math.abs(endY - y)), color, alpha: 0.5 };
  }
  let color: number;
  switch (note.type) {
    case 'tap': color = note.kind === 'double' ? colors.DOUBLE_NOTE : note.kind === 'trill' ? colors.TRILL_NOTE : colors.SINGLE_NOTE; break;
    case 'release': color = note.count === 2 ? colors.DOUBLE_NOTE : colors.SINGLE_NOTE; break;
    case 'tick': color = note.count === 2 ? colors.DOUBLE_LONG : colors.SINGLE_LONG; break;
    case 'double': color = colors.DOUBLE_NOTE; break;
    case 'trill': color = colors.TRILL_NOTE; break;
    default: color = colors.SINGLE_NOTE;
  }
  return { x, y, width: laneWidth, height: 1, color, alpha: 1 };
}

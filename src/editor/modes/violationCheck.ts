import type { Chart, NoteEntity, RangeNote } from "../../shared";
import { beatEq, beatGt, beatLt, beatGte, beatLte } from "../../shared";

function isRangeNote(note: NoteEntity): note is RangeNote {
  return "endBeat" in note;
}

/**
 * 붙여넣기 미리보기 중 위반 노트 인덱스 집합을 계산한다.
 *
 * 위반 조건:
 * - 같은 레인에서 다른 노트와 겹치거나 동일 beat에 중복 배치
 * - trill/trillLong 노트가 trill zone 밖에 있음
 * - trill이 아닌 노트가 trill zone 안에 있음
 * - stop 이벤트 구간 안에 노트가 있음
 */
export function computePasteViolations(
  chart: Chart,
  pastedNoteIndices: ReadonlySet<number>,
): Set<number> {
  const violations = new Set<number>();
  const notes = chart.notes;
  const { trillZones, events } = chart;

  for (const pidx of pastedNoteIndices) {
    const p = notes[pidx];
    const pIsRange = isRangeNote(p);

    // 겹침 검사
    for (let i = 0; i < notes.length; i++) {
      if (i === pidx) continue;
      const other = notes[i];
      if (other.lane !== p.lane) continue;

      const otherIsRange = isRangeNote(other);

      if (!pIsRange && !otherIsRange && beatEq(p.beat, other.beat)) {
        violations.add(pidx);
      }
      if (pIsRange && otherIsRange && beatEq(p.beat, other.beat)) {
        violations.add(pidx);
      }

      if (otherIsRange) {
        const rn = other as RangeNote;
        const positions = pIsRange ? [p.beat, (p as RangeNote).endBeat] : [p.beat];
        for (const b of positions) {
          if (beatGt(b, rn.beat) && beatLt(b, rn.endBeat)) {
            violations.add(pidx);
          }
        }
      }
      if (pIsRange) {
        const rn = p as RangeNote;
        const positions = otherIsRange
          ? [other.beat, (other as RangeNote).endBeat]
          : [other.beat];
        for (const b of positions) {
          if (beatGt(b, rn.beat) && beatLt(b, rn.endBeat)) {
            violations.add(pidx);
          }
        }
      }
    }

    // trill zone 검사
    const isTrill = p.type === "trill" || p.type === "trillLong";
    let inZone: boolean;
    if (p.type === "trillLong" && pIsRange) {
      const rn = p as RangeNote;
      inZone = trillZones.some(
        (z) =>
          z.lane === p.lane &&
          beatGte(p.beat, z.beat) &&
          beatLte(p.beat, z.endBeat) &&
          beatGte(rn.endBeat, z.beat) &&
          beatLte(rn.endBeat, z.endBeat),
      );
    } else {
      inZone = trillZones.some(
        (z) =>
          z.lane === p.lane &&
          beatGte(p.beat, z.beat) &&
          beatLte(p.beat, z.endBeat),
      );
    }
    if (isTrill && !inZone) violations.add(pidx);
    if (!isTrill && inZone) violations.add(pidx);

    // stop 이벤트 검사
    for (const evt of events) {
      if (evt.type !== 'stop') continue;
      if (beatGte(p.beat, evt.beat) && beatLte(p.beat, evt.endBeat)) {
        violations.add(pidx);
      }
      if (pIsRange) {
        const rn = p as RangeNote;
        if (beatGte(rn.endBeat, evt.beat) && beatLte(rn.endBeat, evt.endBeat)) {
          violations.add(pidx);
        }
      }
    }
  }

  return violations;
}

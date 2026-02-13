/**
 * 배치 제약 검증 — chart-editor.md 기준
 *
 * 1. 동일 위치 중복 금지 — 같은 레인·같은 박자에 두 개 이상의 노트 불가
 * 2. 롱노트 구간 내 겹침 금지 — 바디 열린 구간 안에 다른 노트 불가
 * 3. 트릴 구간 전용 — 트릴 노트 ↔ 트릴 구간 상호 배타
 * 4. 메시지 겹침 금지 — 메시지 열린 구간 안에 다른 메시지 시작/끝 불가
 */

import type { Beat } from "../types/beat";
import type {
  NoteEntity,
  RangeNote,
  TrillZone,
  Message,
} from "../types/chart";
import { beatEq, beatLt, beatGt, beatLte, beatGte } from "../types/beat";

export interface ValidationError {
  rule: "duplicate" | "longOverlap" | "trillExclusive" | "messageOverlap";
  message: string;
}

// ---------------------------------------------------------------------------
// 헬퍼: 노트에서 beat 위치 추출
// ---------------------------------------------------------------------------

function isRangeNote(n: NoteEntity): n is RangeNote {
  return "endBeat" in n;
}

/** 노트가 차지하는 모든 beat 시작점을 반환 (포인트: [beat], 구간: [beat, endBeat]) */
function noteOccupiedBeats(n: NoteEntity): Beat[] {
  if (isRangeNote(n)) {
    return beatEq(n.beat, n.endBeat) ? [n.beat] : [n.beat, n.endBeat];
  }
  return [n.beat];
}

// ---------------------------------------------------------------------------
// 규칙 1: 동일 위치 중복 금지
// ---------------------------------------------------------------------------

/**
 * 같은 레인·같은 박자에 두 개 이상의 노트가 있는지 검사한다.
 * 롱노트의 시작점과 끝점 모두 체크 대상.
 */
export function validateNoDuplicates(notes: readonly NoteEntity[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const seen = new Map<string, number>(); // "lane:n/d" → index

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    for (const b of noteOccupiedBeats(note)) {
      const key = `${note.lane}:${b.n}/${b.d}`;
      if (seen.has(key)) {
        errors.push({
          rule: "duplicate",
          message: `Duplicate at lane ${note.lane}, beat ${b.n}/${b.d} (notes ${seen.get(key)}, ${i})`,
        });
      } else {
        seen.set(key, i);
      }
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// 규칙 2: 롱노트 구간 내 겹침 금지
// ---------------------------------------------------------------------------

/**
 * 롱노트 바디의 열린 구간 (beat, endBeat) 안에
 * 같은 레인의 다른 노트(시작점·끝점 포함)가 존재하는지 검사한다.
 */
export function validateNoLongOverlap(notes: readonly NoteEntity[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const rangeNotes = notes.filter(isRangeNote);

  for (const rn of rangeNotes) {
    for (let i = 0; i < notes.length; i++) {
      const other = notes[i];
      if (other === rn || other.lane !== rn.lane) continue;

      for (const b of noteOccupiedBeats(other)) {
        // 열린 구간: beat < b < endBeat (경계 제외)
        if (beatGt(b, rn.beat) && beatLt(b, rn.endBeat)) {
          errors.push({
            rule: "longOverlap",
            message: `Note at lane ${other.lane}, beat ${b.n}/${b.d} overlaps long note body (${rn.beat.n}/${rn.beat.d} ~ ${rn.endBeat.n}/${rn.endBeat.d})`,
          });
        }
      }
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// 규칙 3: 트릴 구간 전용
// ---------------------------------------------------------------------------

/**
 * 트릴 노트가 트릴 구간 안에만 존재하는지,
 * 트릴 구간 안에 비-트릴 노트가 없는지 검사한다.
 */
export function validateTrillExclusive(
  notes: readonly NoteEntity[],
  trillZones: readonly TrillZone[],
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const note of notes) {
    const isTrill = note.type === "trill" || note.type === "trillLongBody";

    // 트릴 노트인데 트릴 구간 안에 있지 않은 경우
    if (isTrill) {
      const inZone = trillZones.some(
        (z) =>
          z.lane === note.lane &&
          beatGte(note.beat, z.beat) &&
          beatLte(note.beat, z.endBeat),
      );
      if (!inZone) {
        errors.push({
          rule: "trillExclusive",
          message: `Trill note at lane ${note.lane}, beat ${note.beat.n}/${note.beat.d} is outside any trill zone`,
        });
      }
    }

    // 비-트릴 노트인데 트릴 구간 안에 있는 경우
    if (!isTrill) {
      const inZone = trillZones.some(
        (z) =>
          z.lane === note.lane &&
          beatGte(note.beat, z.beat) &&
          beatLte(note.beat, z.endBeat),
      );
      if (inZone) {
        errors.push({
          rule: "trillExclusive",
          message: `Non-trill note (${note.type}) at lane ${note.lane}, beat ${note.beat.n}/${note.beat.d} is inside a trill zone`,
        });
      }
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// 규칙 4: 메시지 겹침 금지
// ---------------------------------------------------------------------------

/**
 * 메시지 열린 구간 안에 다른 메시지의 시작/끝이 있는지 검사한다.
 * 끝-시작 인접(같은 박자)은 허용.
 */
export function validateNoMessageOverlap(messages: readonly Message[]): ValidationError[] {
  const errors: ValidationError[] = [];

  for (let i = 0; i < messages.length; i++) {
    for (let j = i + 1; j < messages.length; j++) {
      const a = messages[i];
      const b = messages[j];

      // b의 시작이 a의 열린 구간 안에 있는지
      const bStartInA = beatGt(b.beat, a.beat) && beatLt(b.beat, a.endBeat);
      // b의 끝이 a의 열린 구간 안에 있는지
      const bEndInA = beatGt(b.endBeat, a.beat) && beatLt(b.endBeat, a.endBeat);
      // a의 시작이 b의 열린 구간 안에 있는지
      const aStartInB = beatGt(a.beat, b.beat) && beatLt(a.beat, b.endBeat);
      // a의 끝이 b의 열린 구간 안에 있는지
      const aEndInB = beatGt(a.endBeat, b.beat) && beatLt(a.endBeat, b.endBeat);

      if (bStartInA || bEndInA || aStartInB || aEndInB) {
        errors.push({
          rule: "messageOverlap",
          message: `Messages overlap: (${a.beat.n}/${a.beat.d}~${a.endBeat.n}/${a.endBeat.d}) and (${b.beat.n}/${b.beat.d}~${b.endBeat.n}/${b.endBeat.d})`,
        });
      }
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// 전체 검증
// ---------------------------------------------------------------------------

export interface ChartValidationInput {
  notes: readonly NoteEntity[];
  trillZones: readonly TrillZone[];
  messages: readonly Message[];
}

/** 차트의 모든 배치 제약 조건을 한 번에 검증한다 */
export function validateChart(input: ChartValidationInput): ValidationError[] {
  return [
    ...validateNoDuplicates(input.notes),
    ...validateNoLongOverlap(input.notes),
    ...validateTrillExclusive(input.notes, input.trillZones),
    ...validateNoMessageOverlap(input.messages),
  ];
}

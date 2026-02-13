/**
 * 배치 제약 검증 — chart-editor.md 기준
 *
 * 1. 동일 위치 중복 금지 — 같은 레인·같은 박자·같은 슬롯에 두 개 이상 불가
 *    - 포인트 노트끼리 중복 불가
 *    - 구간 노트 시작끼리 중복 불가
 *    - 구간 노트 끝끼리 중복 불가
 *    - 포인트 노트 + 구간 시작/끝은 공존 가능 (롱노트 헤드)
 *    - 구간 끝 + 구간 시작은 공존 가능 (o-o- 패턴)
 * 2. 롱노트 구간 내 겹침 금지 — 바디 열린 구간 안에 다른 노트 불가
 * 3. 트릴 구간 전용 — 트릴 노트 ↔ 트릴 구간 상호 배타
 * 4. 트릴 구간 겹침 금지 — 트릴 구간끼리만 겹침 검사 (노트/롱노트와 독립)
 * 5. 메시지 겹침 금지 — 메시지 열린 구간 안에 다른 메시지 시작/끝 불가
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
  rule:
    | "duplicate"
    | "longOverlap"
    | "trillExclusive"
    | "trillZoneOverlap"
    | "messageOverlap";
  message: string;
}

// ---------------------------------------------------------------------------
// 헬퍼
// ---------------------------------------------------------------------------

function isRangeNote(n: NoteEntity): n is RangeNote {
  return "endBeat" in n;
}

function beatKey(lane: number, b: Beat): string {
  return `${lane}:${b.n}/${b.d}`;
}

// ---------------------------------------------------------------------------
// 규칙 1: 동일 위치 중복 금지 (슬롯 기반)
// ---------------------------------------------------------------------------

/**
 * 같은 레인·같은 박자에서 같은 슬롯 타입끼리만 중복을 검사한다.
 *
 * 슬롯:
 * - point: 포인트 노트 (single, double, trill)
 * - rangeStart: 구간 노트의 시작점
 * - rangeEnd: 구간 노트의 끝점
 *
 * point + rangeStart/rangeEnd 공존 허용 (롱노트 헤드).
 * rangeEnd + rangeStart 공존 허용 (o-o- 패턴).
 */
export function validateNoDuplicates(notes: readonly NoteEntity[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const pointSeen = new Map<string, number>();
  const rangeStartSeen = new Map<string, number>();
  const rangeEndSeen = new Map<string, number>();

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];

    if (isRangeNote(note)) {
      // 시작점 슬롯
      const startKey = beatKey(note.lane, note.beat);
      if (rangeStartSeen.has(startKey)) {
        errors.push({
          rule: "duplicate",
          message: `Duplicate range start at lane ${note.lane}, beat ${note.beat.n}/${note.beat.d} (notes ${rangeStartSeen.get(startKey)}, ${i})`,
        });
      } else {
        rangeStartSeen.set(startKey, i);
      }

      // 끝점 슬롯 (시작 ≠ 끝일 때만)
      if (!beatEq(note.beat, note.endBeat)) {
        const endKey = beatKey(note.lane, note.endBeat);
        if (rangeEndSeen.has(endKey)) {
          errors.push({
            rule: "duplicate",
            message: `Duplicate range end at lane ${note.lane}, beat ${note.endBeat.n}/${note.endBeat.d} (notes ${rangeEndSeen.get(endKey)}, ${i})`,
          });
        } else {
          rangeEndSeen.set(endKey, i);
        }
      }
    } else {
      // 포인트 노트 슬롯
      const key = beatKey(note.lane, note.beat);
      if (pointSeen.has(key)) {
        errors.push({
          rule: "duplicate",
          message: `Duplicate point note at lane ${note.lane}, beat ${note.beat.n}/${note.beat.d} (notes ${pointSeen.get(key)}, ${i})`,
        });
      } else {
        pointSeen.set(key, i);
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
 * 경계(beat, endBeat 자체)는 허용.
 */
export function validateNoLongOverlap(notes: readonly NoteEntity[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const rangeNotes = notes.filter(isRangeNote);

  for (const rn of rangeNotes) {
    for (const other of notes) {
      if (other === rn || other.lane !== rn.lane) continue;

      // other의 모든 위치를 체크
      const positions: Beat[] = isRangeNote(other)
        ? beatEq(other.beat, other.endBeat)
          ? [other.beat]
          : [other.beat, other.endBeat]
        : [other.beat];

      for (const b of positions) {
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
    const inZone = trillZones.some(
      (z) =>
        z.lane === note.lane &&
        beatGte(note.beat, z.beat) &&
        beatLte(note.beat, z.endBeat),
    );

    if (isTrill && !inZone) {
      errors.push({
        rule: "trillExclusive",
        message: `Trill note at lane ${note.lane}, beat ${note.beat.n}/${note.beat.d} is outside any trill zone`,
      });
    }

    if (!isTrill && inZone) {
      errors.push({
        rule: "trillExclusive",
        message: `Non-trill note (${note.type}) at lane ${note.lane}, beat ${note.beat.n}/${note.beat.d} is inside a trill zone`,
      });
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// 규칙 4: 트릴 구간 겹침 금지
// ---------------------------------------------------------------------------

/**
 * 같은 레인의 트릴 구간끼리 열린 구간이 겹치는지 검사한다.
 * 끝-시작 인접(같은 박자)은 허용.
 * 트릴 구간은 노트/롱노트와는 독립적으로 배치된다.
 */
export function validateNoTrillZoneOverlap(trillZones: readonly TrillZone[]): ValidationError[] {
  const errors: ValidationError[] = [];

  for (let i = 0; i < trillZones.length; i++) {
    for (let j = i + 1; j < trillZones.length; j++) {
      const a = trillZones[i];
      const b = trillZones[j];
      if (a.lane !== b.lane) continue;

      const bStartInA = beatGt(b.beat, a.beat) && beatLt(b.beat, a.endBeat);
      const bEndInA = beatGt(b.endBeat, a.beat) && beatLt(b.endBeat, a.endBeat);
      const aStartInB = beatGt(a.beat, b.beat) && beatLt(a.beat, b.endBeat);
      const aEndInB = beatGt(a.endBeat, b.beat) && beatLt(a.endBeat, b.endBeat);

      if (bStartInA || bEndInA || aStartInB || aEndInB) {
        errors.push({
          rule: "trillZoneOverlap",
          message: `Trill zones overlap on lane ${a.lane}: (${a.beat.n}/${a.beat.d}~${a.endBeat.n}/${a.endBeat.d}) and (${b.beat.n}/${b.beat.d}~${b.endBeat.n}/${b.endBeat.d})`,
        });
      }
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// 규칙 5: 메시지 겹침 금지
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

      const bStartInA = beatGt(b.beat, a.beat) && beatLt(b.beat, a.endBeat);
      const bEndInA = beatGt(b.endBeat, a.beat) && beatLt(b.endBeat, a.endBeat);
      const aStartInB = beatGt(a.beat, b.beat) && beatLt(a.beat, b.endBeat);
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
    ...validateNoTrillZoneOverlap(input.trillZones),
    ...validateNoMessageOverlap(input.messages),
  ];
}

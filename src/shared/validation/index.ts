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
  EventMarker,
  TimeSignatureMarker,
} from "../types/chart";
import { beatEq, beatLt, beatGt, beatLte, beatGte, beatToFloat } from "../types/beat";

export interface ValidationError {
  rule:
    | "duplicate"
    | "longOverlap"
    | "trillExclusive"
    | "trillZoneOverlap"
    | "eventOverlap"
    | "stopZone"
    | "timeSigNotNatural"
    | "timeSigNotAtMeasureStart";
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
    const isTrill = note.type === "trill" || note.type === "trillLong";

    // trillLong: both start and end must be in the SAME trill zone
    let inZone: boolean;
    if (note.type === "trillLong" && "endBeat" in note) {
      const rn = note as RangeNote;
      inZone = trillZones.some(
        (z) =>
          z.lane === note.lane &&
          beatGte(note.beat, z.beat) &&
          beatLte(note.beat, z.endBeat) &&
          beatGte(rn.endBeat, z.beat) &&
          beatLte(rn.endBeat, z.endBeat),
      );
    } else {
      inZone = trillZones.some(
        (z) =>
          z.lane === note.lane &&
          beatGte(note.beat, z.beat) &&
          beatLte(note.beat, z.endBeat),
      );
    }

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
// 규칙 5: 이벤트 마커 겹침 금지
// ---------------------------------------------------------------------------

/**
 * 이벤트 마커 열린 구간 안에 다른 이벤트 마커의 시작/끝이 있는지 검사한다.
 * 끝-시작 인접(같은 박자)은 허용.
 */
export function validateNoEventOverlap(events: readonly EventMarker[]): ValidationError[] {
  const errors: ValidationError[] = [];

  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const a = events[i];
      const b = events[j];

      const bStartInA = beatGt(b.beat, a.beat) && beatLt(b.beat, a.endBeat);
      const bEndInA = beatGt(b.endBeat, a.beat) && beatLt(b.endBeat, a.endBeat);
      const aStartInB = beatGt(a.beat, b.beat) && beatLt(a.beat, b.endBeat);
      const aEndInB = beatGt(a.endBeat, b.beat) && beatLt(a.endBeat, b.endBeat);

      if (bStartInA || bEndInA || aStartInB || aEndInB) {
        errors.push({
          rule: "eventOverlap",
          message: `Events overlap: (${a.beat.n}/${a.beat.d}~${a.endBeat.n}/${a.endBeat.d}) and (${b.beat.n}/${b.beat.d}~${b.endBeat.n}/${b.endBeat.d})`,
        });
      }
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// 규칙 6: stop 구간 내 싱글/더블/롱노트 금지
// ---------------------------------------------------------------------------

/**
 * stop이 설정된 이벤트 구간 [beat, endBeat] 내에
 * 포인트 노트(싱글/더블/트릴), 롱노트의 시작점·끝점이 존재하면 에러.
 * 롱노트 바디가 stop 구간을 관통하는 것(시작 < stop.beat, 끝 > stop.endBeat)은 허용.
 */
export function validateStopZones(
  notes: readonly NoteEntity[],
  events: readonly EventMarker[],
): ValidationError[] {
  const errors: ValidationError[] = [];
  const stopEvents = events.filter((e) => e.stop);
  if (stopEvents.length === 0) return errors;

  for (const stop of stopEvents) {
    for (const note of notes) {
      // 포인트 노트: beat가 stop 구간 내인지
      if (!isRangeNote(note)) {
        if (beatGte(note.beat, stop.beat) && beatLte(note.beat, stop.endBeat)) {
          errors.push({
            rule: "stopZone",
            message: `Note (${note.type}) at lane ${note.lane}, beat ${note.beat.n}/${note.beat.d} is inside stop zone (${stop.beat.n}/${stop.beat.d}~${stop.endBeat.n}/${stop.endBeat.d})`,
          });
        }
      } else {
        // 롱노트: 시작점 or 끝점이 stop 구간 내인지
        if (beatGte(note.beat, stop.beat) && beatLte(note.beat, stop.endBeat)) {
          errors.push({
            rule: "stopZone",
            message: `Long note start (${note.type}) at lane ${note.lane}, beat ${note.beat.n}/${note.beat.d} is inside stop zone (${stop.beat.n}/${stop.beat.d}~${stop.endBeat.n}/${stop.endBeat.d})`,
          });
        }
        if (beatGte(note.endBeat, stop.beat) && beatLte(note.endBeat, stop.endBeat)) {
          errors.push({
            rule: "stopZone",
            message: `Long note end (${note.type}) at lane ${note.lane}, beat ${note.endBeat.n}/${note.endBeat.d} is inside stop zone (${stop.beat.n}/${stop.beat.d}~${stop.endBeat.n}/${stop.endBeat.d})`,
          });
        }
      }
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// 규칙 7: 박자표 분자/분모는 자연수(양의 정수)여야 한다
// ---------------------------------------------------------------------------

/** 값이 자연수(양의 정수)인지 검사 */
export function isNaturalNumber(v: number): boolean {
  return Number.isInteger(v) && v > 0;
}

/**
 * 이벤트의 beatPerMeasure가 자연수 분자/분모를 가지는지 검증한다.
 * Beat는 약분되므로, 약분 전 원본이 아니라 약분 후 n/d를 검사한다.
 */
export function validateTimeSigNatural(events: readonly EventMarker[]): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const evt of events) {
    if (evt.beatPerMeasure === undefined) continue;
    const { n, d } = evt.beatPerMeasure;
    if (!isNaturalNumber(n) || !isNaturalNumber(d)) {
      errors.push({
        rule: "timeSigNotNatural",
        message: `Time signature numerator and denominator must be natural numbers, got ${n}/${d} at beat ${evt.beat.n}/${evt.beat.d}`,
      });
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// 규칙 8: 박자표는 마디의 시작 위치에만 존재해야 한다
// ---------------------------------------------------------------------------

/**
 * 주어진 beat 위치가 마디의 시작 위치인지 검사한다.
 * timeSignatures가 비어있으면 판단 불가이므로 false를 반환한다.
 */
export function isMeasureBoundary(
  targetBeat: Beat,
  timeSignatures: readonly TimeSignatureMarker[],
): boolean {
  if (timeSignatures.length === 0) return false;

  const sorted = [...timeSignatures].sort((a, b) => a.measure - b.measure);
  const targetFloat = beatToFloat(targetBeat);

  // 마디 0부터 순회하며 각 마디의 시작 beat를 계산
  let accBeat = 0;
  let currentBPM = sorted[0].beatPerMeasure;
  let sigIdx = 1;
  let measure = 0;

  // targetFloat 이전의 모든 마디 시작을 검사
  while (accBeat <= targetFloat + 1e-9) {
    if (Math.abs(accBeat - targetFloat) < 1e-9) return true;

    // 다음 timesig 변경 지점에 도달하면 업데이트
    if (sigIdx < sorted.length && measure === sorted[sigIdx].measure) {
      currentBPM = sorted[sigIdx].beatPerMeasure;
      sigIdx++;
    }

    const step = beatToFloat(currentBPM);
    if (step <= 0) return false; // 잘못된 beatPerMeasure — 무한루프 방지

    accBeat += step;
    measure++;
  }

  return false;
}

/**
 * beatPerMeasure를 가진 이벤트가 마디의 시작 위치에 있는지 검증한다.
 * 각 이벤트를 순차적으로 처리하면서, 이전까지의 timesig 정보를 기반으로
 * 해당 이벤트의 beat가 마디 경계인지 검사한다.
 */
export function validateTimeSigAtMeasureStart(events: readonly EventMarker[]): ValidationError[] {
  const errors: ValidationError[] = [];

  const tsEvents = events
    .filter((e): e is EventMarker & { beatPerMeasure: Beat } => e.beatPerMeasure !== undefined)
    .sort((a, b) => beatToFloat(a.beat) - beatToFloat(b.beat));

  if (tsEvents.length === 0) return errors;

  // 첫 번째 timesig 이벤트는 beat 0이어야 한다 (이미 다른 곳에서 강제됨)
  // 두 번째부터 마디 경계 검사
  let accBeatFloat = 0;
  let currentBPM = tsEvents[0].beatPerMeasure;

  for (let i = 1; i < tsEvents.length; i++) {
    const evt = tsEvents[i];
    const evtBeatFloat = beatToFloat(evt.beat);

    // 이전 timesig 기준으로 마디 경계를 찾는다
    const beatDiff = evtBeatFloat - accBeatFloat;
    const bpmFloat = beatToFloat(currentBPM);

    // beatDiff가 bpmFloat의 정수배인지 검사
    if (bpmFloat <= 0) {
      // 잘못된 beatPerMeasure — 자연수 검증에서 잡힘
      continue;
    }

    const measureCount = beatDiff / bpmFloat;
    const roundedMeasureCount = Math.round(measureCount);

    if (Math.abs(measureCount - roundedMeasureCount) > 1e-9 || roundedMeasureCount < 0) {
      errors.push({
        rule: "timeSigNotAtMeasureStart",
        message: `Time signature at beat ${evt.beat.n}/${evt.beat.d} is not at a measure boundary`,
      });
    }

    // 정수 마디일 때만 누적 업데이트 — 마디 경계가 아닌 이벤트는 무시하고
    // 이전 timesig 기준을 유지한다. 이후 이벤트 판정도 동일한 기준을 사용한다.
    if (Math.abs(measureCount - roundedMeasureCount) <= 1e-9 && roundedMeasureCount >= 0) {
      accBeatFloat += roundedMeasureCount * bpmFloat;
      currentBPM = evt.beatPerMeasure;
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
  events: readonly EventMarker[];
}

/** 차트의 모든 배치 제약 조건을 한 번에 검증한다 */
export function validateChart(input: ChartValidationInput): ValidationError[] {
  return [
    ...validateNoDuplicates(input.notes),
    ...validateNoLongOverlap(input.notes),
    ...validateTrillExclusive(input.notes, input.trillZones),
    ...validateNoTrillZoneOverlap(input.trillZones),
    ...validateNoEventOverlap(input.events),
    ...validateStopZones(input.notes, input.events),
    ...validateTimeSigNatural(input.events),
    ...validateTimeSigAtMeasureStart(input.events),
  ];
}

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
 * 3. trillZone 전용 — 트릴 노트 ↔ trillZone 상호 배타
 * 4. trillZone 겹침 금지 — trillZone끼리만 겹침 검사 (노트/롱노트와 독립)
 * 5. 메시지 겹침 금지 — 메시지 열린 구간 안에 다른 메시지 시작/끝 불가
 */

import type { Beat } from "../types/beat";
import type {
  NoteEntity,
  RangeNote,
  TrillZone,
  ChartEvent,
  RangeEvent,
  TutorialInputEvent,
  TimeSignatureMarker,
  TimeSignatureEvent,
  StopEvent,
} from "../types/chart";
import { beat, beatEq, beatLt, beatGt, beatLte, beatGte, beatToFloat } from "../types/beat";
import { isMainLane } from "../chart/laneAxis";

export interface ValidationError {
  rule:
    | "duplicate"
    | "longOverlap"
    | "trillExclusive"
    | "trillLongInvalid"
    | "trillZoneOverlap"
    | "eventOverlap"
    | "eventDuplicate"
    | "tutorialInputOverlap"
    | "stopZone"
    | "timeSigNotNatural"
    | "timeSigNotAtMeasureStart"
    | "rangeInverted"
    | "beatMalformed"
    | "laneMalformed";
  message: string;
  refs?: ValidationRef[];
}

/** RFD 0017 위반 시각화 — 위반에 연루된 엔티티를 원본 배열 인덱스로 가리킨다 */
export type ValidationRefKind = "note" | "trillZone" | "event";

export interface ValidationRef {
  kind: ValidationRefKind;
  index: number; // 각각 chart.notes / chart.trillZones / chart.events 배열의 인덱스
}

// ---------------------------------------------------------------------------
// 헬퍼
// ---------------------------------------------------------------------------

function isRangeNote(n: NoteEntity): n is RangeNote {
  return "endBeat" in n;
}

/**
 * 값(음악적 위치) 기준 "n/d" 키 — 표현이 달라도 같은 박이면 같은 키.
 * 스냅은 분모=스냅분할값 형태(예: 박2를 스냅4로 8/4)를, 이동은 약분형(2/1)을 만든다.
 * 약분하지 않으면 8/4와 2/1을 다른 위치로 오인해 중복/공존 검사가 실패한다.
 * malformed(d=0·비유한)는 약분 불가라 원본 표기로 fallback한다 — 여기서 throw하면
 * validateChart 전체가 죽는다. malformed 자체는 구조 검증(beatMalformed)이 잡는다.
 */
function beatValueKey(b: Beat): string {
  if (!Number.isFinite(b.n) || !Number.isFinite(b.d) || b.d === 0) return `${b.n}/${b.d}`;
  const r = beat(b.n, b.d);
  return `${r.n}/${r.d}`;
}

function beatKey(lane: number, b: Beat): string {
  return `${lane}:${beatValueKey(b)}`;
}

const noteRef = (index: number): ValidationRef => ({ kind: "note", index });
const zoneRef = (index: number): ValidationRef => ({ kind: "trillZone", index });
const eventRef = (index: number): ValidationRef => ({ kind: "event", index });

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
        const prevIdx = rangeStartSeen.get(startKey)!;
        errors.push({
          rule: "duplicate",
          message: `Duplicate range start at lane ${note.lane}, beat ${note.beat.n}/${note.beat.d} (notes ${prevIdx}, ${i})`,
          refs: [noteRef(prevIdx), noteRef(i)],
        });
      } else {
        rangeStartSeen.set(startKey, i);
      }

      // 끝점 슬롯 (시작 ≠ 끝일 때만)
      if (!beatEq(note.beat, note.endBeat)) {
        const endKey = beatKey(note.lane, note.endBeat);
        if (rangeEndSeen.has(endKey)) {
          const prevIdx = rangeEndSeen.get(endKey)!;
          errors.push({
            rule: "duplicate",
            message: `Duplicate range end at lane ${note.lane}, beat ${note.endBeat.n}/${note.endBeat.d} (notes ${prevIdx}, ${i})`,
            refs: [noteRef(prevIdx), noteRef(i)],
          });
        } else {
          rangeEndSeen.set(endKey, i);
        }
      }
    } else {
      // 포인트 노트 슬롯
      const key = beatKey(note.lane, note.beat);
      if (pointSeen.has(key)) {
        const prevIdx = pointSeen.get(key)!;
        errors.push({
          rule: "duplicate",
          message: `Duplicate point note at lane ${note.lane}, beat ${note.beat.n}/${note.beat.d} (notes ${prevIdx}, ${i})`,
          refs: [noteRef(prevIdx), noteRef(i)],
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

  // 레인별로 그룹화하여 비교 범위를 축소 (원본 인덱스도 함께 담는다)
  const byLane = new Map<number, { note: NoteEntity; index: number }[]>();
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    let arr = byLane.get(n.lane);
    if (!arr) { arr = []; byLane.set(n.lane, arr); }
    arr.push({ note: n, index: i });
  }

  for (const laneNotes of byLane.values()) {
    const rangeNotes = laneNotes.filter((e) => isRangeNote(e.note));
    for (const rn of rangeNotes) {
      const rnNote = rn.note as RangeNote;
      for (const other of laneNotes) {
        if (other === rn) continue;

        const positions: Beat[] = isRangeNote(other.note)
          ? beatEq(other.note.beat, (other.note as RangeNote).endBeat)
            ? [other.note.beat]
            : [other.note.beat, (other.note as RangeNote).endBeat]
          : [other.note.beat];

        for (const b of positions) {
          if (beatGt(b, rnNote.beat) && beatLt(b, rnNote.endBeat)) {
            errors.push({
              rule: "longOverlap",
              message: `Note at lane ${other.note.lane}, beat ${b.n}/${b.d} overlaps long note body (${rnNote.beat.n}/${rnNote.beat.d} ~ ${rnNote.endBeat.n}/${rnNote.endBeat.d})`,
              refs: [noteRef(rn.index), noteRef(other.index)],
            });
          }
        }
      }
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// 규칙 3: trillZone 전용
// ---------------------------------------------------------------------------

/**
 * 트릴 노트가 trillZone 안에만 존재하는지,
 * trillZone 안에 비-트릴 노트가 없는지 검사한다.
 */
export function validateTrillExclusive(
  notes: readonly NoteEntity[],
  trillZones: readonly TrillZone[],
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    // 트릴 계열 규칙은 메인 레인 한정 (RFD 0018 §3-2) — 보조 레인(5+)은 표시 전용이라
    // 존 배타가 적용되지 않고, trillZone 자체가 메인 레인에만 존재한다.
    if (!isMainLane(note.lane)) continue;
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
        refs: [noteRef(i)],
      });
    }

    if (!isTrill && inZone) {
      errors.push({
        rule: "trillExclusive",
        message: `Non-trill note (${note.type}) at lane ${note.lane}, beat ${note.beat.n}/${note.beat.d} is inside a trill zone`,
        refs: [noteRef(i)],
      });
    }
  }

  return errors;
}

/**
 * 트릴 롱노트는 헤드(트릴 포인트 노트) 필수 + hold-only 불가.
 * 트릴 교대 판정은 헤드 keydown 기반이라, 헤드가 없으면(교대 비교 대상 없음) 또는
 * hold-only면("잡고만 있어도 됨"이 "같은 키 유지=교대 위반"과 모순) 교대 규칙이 무너진다.
 * 결정 근거: docs/rfd/0009-hold-only-long-note.md, docs/spec/note-system.md "트릴 롱노트".
 */
export function validateTrillLong(notes: readonly NoteEntity[]): ValidationError[] {
  const errors: ValidationError[] = [];

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    if (note.type !== "trillLong") continue;
    // 보조 레인(5+)의 trillLong은 표시 전용 — 헤드·hold-only 규칙 미적용 (RFD 0018 §3-2)
    if (!isMainLane(note.lane)) continue;
    const rn = note as RangeNote;

    if (rn.holdOnly) {
      errors.push({
        rule: "trillLongInvalid",
        message: `trillLong cannot be hold-only (lane ${note.lane}, beat ${note.beat.n}/${note.beat.d})`,
        refs: [noteRef(i)],
      });
    }

    // 헤드 필수: 같은 레인·같은 시작 박에 trill 포인트 노트가 있어야 한다 (길이 무관)
    const hasHead = notes.some(
      (n) => n.type === "trill" && n.lane === note.lane && beatEq(n.beat, note.beat),
    );
    if (!hasHead) {
      errors.push({
        rule: "trillLongInvalid",
        message: `trillLong must have a trill head (lane ${note.lane}, beat ${note.beat.n}/${note.beat.d})`,
        refs: [noteRef(i)],
      });
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// 규칙 4: trillZone 겹침 금지
// ---------------------------------------------------------------------------

/**
 * 같은 레인의 trillZone끼리 열린 구간이 겹치는지 검사한다.
 * 끝-시작 인접(같은 박자)은 허용.
 * trillZone은 노트/롱노트와는 독립적으로 배치된다.
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
          refs: [zoneRef(i), zoneRef(j)],
        });
      }
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// 규칙 5: 같은 beat에 같은 타입의 시점 이벤트 중복 금지
// ---------------------------------------------------------------------------

/**
 * 같은 beat 위치에 같은 타입의 시점 이벤트(bpm, timeSignature)가
 * 두 개 이상 존재하면 모순이므로 에러.
 */
export function validateNoEventDuplicate(events: readonly ChartEvent[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const seen = new Map<string, number>(); // "type:beatN/beatD" → first index

  for (let i = 0; i < events.length; i++) {
    const evt = events[i];
    if (evt.type !== "bpm" && evt.type !== "timeSignature") continue;

    // 값 기준 비교 — 노트 쪽 beatKey와 동일한 이유(8/4 vs 2/1 표현 차이 무시)
    const key = `${evt.type}:${beatValueKey(evt.beat)}`;
    if (seen.has(key)) {
      const prevIdx = seen.get(key)!;
      errors.push({
        rule: "eventDuplicate",
        message: `Duplicate ${evt.type} event at beat ${evt.beat.n}/${evt.beat.d} (events ${prevIdx}, ${i})`,
        refs: [eventRef(prevIdx), eventRef(i)],
      });
    } else {
      seen.set(key, i);
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// 규칙 6: 이벤트 마커 겹침 금지
// ---------------------------------------------------------------------------

/**
 * 같은 타입의 구간 이벤트끼리 열린 구간이 겹치는지 검사한다.
 * 다른 타입 간(text + auto 등)은 독립적이므로 겹침을 허용한다.
 * 끝-시작 인접(같은 박자)은 허용.
 */
export function validateNoEventOverlap(events: readonly ChartEvent[]): ValidationError[] {
  const errors: ValidationError[] = [];

  // 원본 인덱스를 유지한 채 구간 이벤트만 추린다 (getRangeEvents는 인덱스를 잃으므로 별도 구성)
  const rangeEvents: { event: RangeEvent; index: number }[] = [];
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.type === "text" || e.type === "auto" || e.type === "stop") {
      rangeEvents.push({ event: e, index: i });
    }
  }

  for (let i = 0; i < rangeEvents.length; i++) {
    for (let j = i + 1; j < rangeEvents.length; j++) {
      const a = rangeEvents[i];
      const b = rangeEvents[j];

      // 다른 타입은 겹침 허용
      if (a.event.type !== b.event.type) continue;

      const bStartInA = beatGt(b.event.beat, a.event.beat) && beatLt(b.event.beat, a.event.endBeat);
      const bEndInA = beatGt(b.event.endBeat, a.event.beat) && beatLt(b.event.endBeat, a.event.endBeat);
      const aStartInB = beatGt(a.event.beat, b.event.beat) && beatLt(a.event.beat, b.event.endBeat);
      const aEndInB = beatGt(a.event.endBeat, b.event.beat) && beatLt(a.event.endBeat, b.event.endBeat);

      if (bStartInA || bEndInA || aStartInB || aEndInB) {
        errors.push({
          rule: "eventOverlap",
          message: `Events overlap: ${a.event.type} (${a.event.beat.n}/${a.event.beat.d}~${a.event.endBeat.n}/${a.event.endBeat.d}) and (${b.event.beat.n}/${b.event.beat.d}~${b.event.endBeat.n}/${b.event.endBeat.d})`,
          refs: [eventRef(a.index), eventRef(b.index)],
        });
      }
    }
  }

  return errors;
}

/**
 * 튜토리얼 입력 이벤트는 같은 lane+keyCode의 열린 구간만 겹침을 금지한다.
 * 다른 키나 다른 레인은 더블 입력, 롱 유지 중 탭 시연을 위해 겹침을 허용한다.
 */
export function validateNoTutorialInputOverlap(events: readonly ChartEvent[]): ValidationError[] {
  const errors: ValidationError[] = [];

  // 원본 인덱스를 유지한 채 tutorialInput 이벤트만 추린다
  const inputEvents: { event: TutorialInputEvent; index: number }[] = [];
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.type === "tutorialInput") {
      inputEvents.push({ event: e, index: i });
    }
  }

  for (let i = 0; i < inputEvents.length; i++) {
    for (let j = i + 1; j < inputEvents.length; j++) {
      const a = inputEvents[i];
      const b = inputEvents[j];
      if (a.event.lane !== b.event.lane || a.event.keyCode !== b.event.keyCode) continue;

      const overlaps = beatLt(a.event.beat, b.event.endBeat) && beatLt(b.event.beat, a.event.endBeat);
      if (overlaps) {
        errors.push({
          rule: "tutorialInputOverlap",
          message: `Tutorial input overlaps on lane ${a.event.lane}, key ${a.event.keyCode} (${a.event.beat.n}/${a.event.beat.d}~${a.event.endBeat.n}/${a.event.endBeat.d}) and (${b.event.beat.n}/${b.event.beat.d}~${b.event.endBeat.n}/${b.event.endBeat.d})`,
          refs: [eventRef(a.index), eventRef(b.index)],
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
  events: readonly ChartEvent[],
): ValidationError[] {
  const errors: ValidationError[] = [];

  // 원본 인덱스를 유지한 채 stop 이벤트만 추린다
  const stopEvents: { event: StopEvent; index: number }[] = [];
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.type === "stop") {
      stopEvents.push({ event: e, index: i });
    }
  }
  if (stopEvents.length === 0) return errors;

  for (const stop of stopEvents) {
    for (let noteIdx = 0; noteIdx < notes.length; noteIdx++) {
      const note = notes[noteIdx];
      // stop 구간 배치 금지는 게임 판정 전제 — 보조 레인(5+)은 미적용 (RFD 0018 §3-2)
      if (!isMainLane(note.lane)) continue;
      // 포인트 노트: beat가 stop 구간 내인지
      if (!isRangeNote(note)) {
        if (beatGte(note.beat, stop.event.beat) && beatLte(note.beat, stop.event.endBeat)) {
          errors.push({
            rule: "stopZone",
            message: `Note (${note.type}) at lane ${note.lane}, beat ${note.beat.n}/${note.beat.d} is inside stop zone (${stop.event.beat.n}/${stop.event.beat.d}~${stop.event.endBeat.n}/${stop.event.endBeat.d})`,
            refs: [noteRef(noteIdx), eventRef(stop.index)],
          });
        }
      } else {
        // 롱노트: 시작점 or 끝점이 stop 구간 내인지
        if (beatGte(note.beat, stop.event.beat) && beatLte(note.beat, stop.event.endBeat)) {
          errors.push({
            rule: "stopZone",
            message: `Long note start (${note.type}) at lane ${note.lane}, beat ${note.beat.n}/${note.beat.d} is inside stop zone (${stop.event.beat.n}/${stop.event.beat.d}~${stop.event.endBeat.n}/${stop.event.endBeat.d})`,
            refs: [noteRef(noteIdx), eventRef(stop.index)],
          });
        }
        if (beatGte(note.endBeat, stop.event.beat) && beatLte(note.endBeat, stop.event.endBeat)) {
          errors.push({
            rule: "stopZone",
            message: `Long note end (${note.type}) at lane ${note.lane}, beat ${note.endBeat.n}/${note.endBeat.d} is inside stop zone (${stop.event.beat.n}/${stop.event.beat.d}~${stop.event.endBeat.n}/${stop.event.endBeat.d})`,
            refs: [noteRef(noteIdx), eventRef(stop.index)],
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
export function validateTimeSigNatural(events: readonly ChartEvent[]): ValidationError[] {
  const errors: ValidationError[] = [];

  for (let i = 0; i < events.length; i++) {
    const evt = events[i];
    if (evt.type !== "timeSignature") continue;
    const { n, d } = evt.beatPerMeasure;
    if (!isNaturalNumber(n) || !isNaturalNumber(d)) {
      errors.push({
        rule: "timeSigNotNatural",
        message: `Time signature numerator and denominator must be natural numbers, got ${n}/${d} at beat ${evt.beat.n}/${evt.beat.d}`,
        refs: [eventRef(i)],
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
export function validateTimeSigAtMeasureStart(events: readonly ChartEvent[]): ValidationError[] {
  const errors: ValidationError[] = [];

  // 원본 인덱스를 유지한 채 timeSignature 이벤트만 추려 정렬한다
  const tsEventsRaw: { event: TimeSignatureEvent; index: number }[] = [];
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.type === "timeSignature") {
      tsEventsRaw.push({ event: e, index: i });
    }
  }
  const tsEvents = tsEventsRaw.sort((a, b) => beatToFloat(a.event.beat) - beatToFloat(b.event.beat));

  if (tsEvents.length === 0) return errors;

  // 첫 번째 timesig 이벤트는 beat 0이어야 한다 (이미 다른 곳에서 강제됨)
  // 두 번째부터 마디 경계 검사
  let accBeatFloat = 0;
  let currentBPM = tsEvents[0].event.beatPerMeasure;

  for (let i = 1; i < tsEvents.length; i++) {
    const evt = tsEvents[i].event;
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
        refs: [eventRef(tsEvents[i].index)],
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
// 구조 검증 (malformed 데이터 — 편집 중에도 절대 불가, RFD 0017 §3-1)
// ---------------------------------------------------------------------------

/**
 * 구간 엔티티의 끝이 시작보다 앞서면(endBeat < beat) malformed로 본다.
 *
 * 대상: 구간 노트(RangeNote)·트릴 존(TrillZone)·구간 이벤트(text/auto/stop/
 * tutorialInput/tutorialDiagram). 길이 0(endBeat == beat)은 허용(strict `<`).
 * 낙관적 편집에서도 사용자가 transient로 지날 이유가 없는 값이라 구조로 분류한다.
 */
export function validateNoRangeInversion(
  notes: readonly NoteEntity[],
  trillZones: readonly TrillZone[],
  events: readonly ChartEvent[],
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    if (isRangeNote(n) && beatLt(n.endBeat, n.beat)) {
      errors.push({
        rule: "rangeInverted",
        message: `구간 노트 끝(${beatToFloat(n.endBeat)})이 시작(${beatToFloat(n.beat)})보다 앞섭니다 (레인 ${n.lane})`,
        refs: [noteRef(i)],
      });
    }
  }

  for (let i = 0; i < trillZones.length; i++) {
    const z = trillZones[i];
    if (beatLt(z.endBeat, z.beat)) {
      errors.push({
        rule: "rangeInverted",
        message: `트릴 존 끝(${beatToFloat(z.endBeat)})이 시작(${beatToFloat(z.beat)})보다 앞섭니다 (레인 ${z.lane})`,
        refs: [zoneRef(i)],
      });
    }
  }

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if ("endBeat" in e && beatLt(e.endBeat, e.beat)) {
      errors.push({
        rule: "rangeInverted",
        message: `${e.type} 이벤트 끝(${beatToFloat(e.endBeat)})이 시작(${beatToFloat(e.beat)})보다 앞섭니다`,
        refs: [eventRef(i)],
      });
    }
  }

  return errors;
}

/**
 * Beat 자체가 성립하지 않는 값(분모 0·NaN·Infinity)이면 malformed로 본다.
 *
 * Beat 타입 계약(분모 항상 양수·유한 정수 쌍)이 깨진 데이터는 에디터가 만들 수 없고
 * 외부/레거시 파일 로드로만 들어온다. `beat()` 생성자는 d=0에 throw하므로 이 값이
 * 검증·약분 경로에 흘러들면 검증 함수 자체가 크래시한다 — "위반 목록 반환" 대신
 * 예외가 전파되므로 구조 버킷에서 잡아 보고한다(RFD 0017 §3-1 malformed).
 */
export function validateBeatWellFormed(
  notes: readonly NoteEntity[],
  trillZones: readonly TrillZone[],
  events: readonly ChartEvent[],
): ValidationError[] {
  const errors: ValidationError[] = [];
  const isMalformed = (b: Beat): boolean =>
    !Number.isFinite(b.n) || !Number.isFinite(b.d) || b.d === 0;

  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    if (isMalformed(n.beat) || (isRangeNote(n) && isMalformed(n.endBeat))) {
      errors.push({
        rule: "beatMalformed",
        message: `노트의 beat가 malformed입니다 (레인 ${n.lane}, ${n.beat.n}/${n.beat.d})`,
        refs: [noteRef(i)],
      });
    }
  }

  for (let i = 0; i < trillZones.length; i++) {
    const z = trillZones[i];
    if (isMalformed(z.beat) || isMalformed(z.endBeat)) {
      errors.push({
        rule: "beatMalformed",
        message: `트릴 존의 beat가 malformed입니다 (레인 ${z.lane}, ${z.beat.n}/${z.beat.d})`,
        refs: [zoneRef(i)],
      });
    }
  }

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (
      isMalformed(e.beat) ||
      ("endBeat" in e && isMalformed(e.endBeat)) ||
      (e.type === "timeSignature" && isMalformed(e.beatPerMeasure))
    ) {
      errors.push({
        rule: "beatMalformed",
        message: `${e.type} 이벤트의 beat가 malformed입니다 (${e.beat.n}/${e.beat.d})`,
        refs: [eventRef(i)],
      });
    }
  }

  return errors;
}

/**
 * 레인이 성립하지 않는 값(양의 정수가 아님 = 하한 이탈·비정수)이면 malformed로 본다.
 *
 * 유효 lane은 양의 정수다 — 메인(1..4)과 보조(5+)를 모두 포함하며 상한이 없다. 표시 상한은
 * extraLaneCount·숨김·자동 확장 정책이 담당하므로(RFD 0018), 구조 검증은 lane>4를 거부하지
 * 않고 데이터 자체가 성립하지 않는 하한 이탈·비정수만 잡는다 (RFD 0017 §3-1). 이벤트의
 * editorLane은 별도 배치 공간(laneAxis 관할 밖)이라 이 검증 대상이 아니다.
 */
export function validateLaneWellFormed(
  notes: readonly NoteEntity[],
  trillZones: readonly TrillZone[],
): ValidationError[] {
  const errors: ValidationError[] = [];
  const isMalformed = (lane: number): boolean => !Number.isInteger(lane) || lane < 1;

  for (let i = 0; i < notes.length; i++) {
    if (isMalformed(notes[i].lane)) {
      errors.push({
        rule: "laneMalformed",
        message: `노트의 레인이 malformed입니다 (lane ${notes[i].lane})`,
        refs: [noteRef(i)],
      });
    }
  }

  for (let i = 0; i < trillZones.length; i++) {
    if (isMalformed(trillZones[i].lane)) {
      errors.push({
        rule: "laneMalformed",
        message: `트릴 존의 레인이 malformed입니다 (lane ${trillZones[i].lane})`,
        refs: [zoneRef(i)],
      });
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
  events: readonly ChartEvent[];
}

/**
 * 구조 검증 — malformed 데이터(역전·불성립 Beat) + 크래시 유발(분자 0 박자표).
 * setChart가 항상 하드 거부하는 버킷(RFD 0017 §3-2·§3-4).
 */
export function validateChartStructural(input: ChartValidationInput): ValidationError[] {
  return [
    ...validateBeatWellFormed(input.notes, input.trillZones, input.events),
    ...validateLaneWellFormed(input.notes, input.trillZones),
    ...validateNoRangeInversion(input.notes, input.trillZones, input.events),
    ...validateTimeSigNatural(input.events),
  ];
}

/**
 * 의미 검증 — 게임 판정 전제 위반(겹침·중복·트릴 헤드·stop 구간·비경계 박자표 등).
 * 낙관적 편집에서 편집 중 잠깐 허용하고 저장·플레이 진입 게이트가 강제하는 버킷.
 */
export function validateChartSemantic(input: ChartValidationInput): ValidationError[] {
  return [
    ...validateNoDuplicates(input.notes),
    ...validateNoLongOverlap(input.notes),
    ...validateTrillExclusive(input.notes, input.trillZones),
    ...validateTrillLong(input.notes),
    ...validateNoTrillZoneOverlap(input.trillZones),
    ...validateNoEventDuplicate(input.events),
    ...validateNoEventOverlap(input.events),
    ...validateNoTutorialInputOverlap(input.events),
    ...validateStopZones(input.notes, input.events),
    ...validateTimeSigAtMeasureStart(input.events),
  ];
}

// 검증 memo — 편집 프리뷰가 매 pointer-move마다 "모드 사전검증 + 차트 변이 게이트"로
// 같은 입력을 두 번 검증하므로, 세 배열의 참조가 모두 같으면 결과를 재사용한다.
// 차트 데이터는 불변으로 다뤄진다(모든 변이가 새 배열을 만든다)는 전제에 의존한다.
const validationMemo = new WeakMap<
  readonly NoteEntity[],
  WeakMap<readonly TrillZone[], WeakMap<readonly ChartEvent[], ValidationError[]>>
>();

/** 차트의 모든 배치 제약 조건을 한 번에 검증한다 (동일 참조 입력은 memo 재사용) */
export function validateChart(input: ChartValidationInput): ValidationError[] {
  let byZones = validationMemo.get(input.notes);
  if (!byZones) {
    byZones = new WeakMap();
    validationMemo.set(input.notes, byZones);
  }
  let byEvents = byZones.get(input.trillZones);
  if (!byEvents) {
    byEvents = new WeakMap();
    byZones.set(input.trillZones, byEvents);
  }
  const cached = byEvents.get(input.events);
  if (cached) return cached;

  const errors = [
    ...validateChartStructural(input),
    ...validateChartSemantic(input),
  ];
  byEvents.set(input.events, errors);
  return errors;
}

export interface ChartViolationIndices {
  notes: Set<number>;
  trillZones: Set<number>;
  events: Set<number>;
}

/**
 * 위반에 연루된 엔티티 인덱스를 종류별로 validateChart refs에서 파생한다 (위반 시각화 단일 소스).
 *
 * 겹침·중복·트릴 등의 판정 로직을 별도로 재구현하지 않고 validateChart 결과의 refs만
 * 걸러낸다 — 캔버스 빨간 해칭이 게이트가 막는 위반과 정확히 일치하도록(RFD 0017 §3-3).
 */
export function chartViolationIndices(input: ChartValidationInput): ChartViolationIndices {
  const result: ChartViolationIndices = { notes: new Set(), trillZones: new Set(), events: new Set() };
  for (const err of validateChart(input)) {
    if (!err.refs) continue;
    for (const ref of err.refs) {
      if (ref.kind === "note") result.notes.add(ref.index);
      else if (ref.kind === "trillZone") result.trillZones.add(ref.index);
      else if (ref.kind === "event") result.events.add(ref.index);
    }
  }
  return result;
}

/** 위반에 연루된 노트 인덱스만 추린다(시각화 편의). */
export function chartViolatingNoteIndices(input: ChartValidationInput): Set<number> {
  return chartViolationIndices(input).notes;
}

/**
 * 주어진 엔티티 참조에 연루된 위반만 추린다 — 신규/변경 엔티티의 국소 판정용(RFD 0017).
 *
 * 낙관적 편집에서 라이브 차트에는 transient 의미 위반이 상주할 수 있다. 그래서
 * "전체 차트 검증 후 에러가 하나라도 있으면 차단"은 무관한 기존 위반 하나가
 * 모든 생성·변환을 전역 차단하는 회귀를 만든다 — 새 엔티티에 연루된 위반만
 * 걸러 판정해야 place-then-fix 도중에도 편집이 계속된다.
 * refs 없는 위반은 귀속을 알 수 없으므로 보수적으로 포함한다.
 */
export function violationsInvolving(
  errors: readonly ValidationError[],
  targets: readonly ValidationRef[],
): ValidationError[] {
  const targetKeys = new Set(targets.map((t) => `${t.kind}:${t.index}`));
  return errors.filter(
    (err) => !err.refs || err.refs.some((r) => targetKeys.has(`${r.kind}:${r.index}`)),
  );
}

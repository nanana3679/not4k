import type { Chart, NoteEntity, RangeNote, ExtraNoteEntity } from "../../shared";
import { beatEq, beatGt, beatLt, beatGte, beatLte } from "../../shared";
import { SNAP_POSITION_TOLERANCE } from "../timeline/hitTest";

/**
 * 층2 편집 배치 판정(시각 겹침 등 UX 정책)의 단일 소유자 — 층1(validateChart)과 구분.
 *
 * 층1(validateChart)은 모델 규칙(트릴 존 안/밖, stop 구간, 롱노트 head 필수 등)을 판정한다.
 * 이 모듈은 그 위에 얹히는 층2 시각 겹침 정책을 판정한다: 점-점 tolerance 근접,
 * 점의 range-body(열린 구간) 침범, range 시작점 중복 — head/end 캡 공존은 허용(D=·-o 통로).
 *
 * 메인 노트(lane 축)와 엑스트라 노트(extraLane 축)가 **같은 코어 함수**(collectPlacementViolations)를
 * 레인 축만 매개화해 공유한다. 엑스트라에는 층1(모델 규칙)이 없으므로 층2 코어만 돈다.
 *
 * NOTE: 포인터 기반 create 가드(isCreatePlacementBlocked)는 좌표 질의 형태가 달라 이번 통합에서
 * 제외한다 — 포인터 기반 create 가드와의 통합은 후속.
 */

function isRangeNote(note: NoteEntity | ExtraNoteEntity): boolean {
  return "endBeat" in note;
}

/** 노트의 레인 좌표를 뽑는 함수 축(메인=lane, 엑스트라=extraLane). */
type LaneOf<T> = (note: T) => number;

const mainLaneOf: LaneOf<NoteEntity> = (n) => n.lane;
const extraLaneOf: LaneOf<ExtraNoteEntity> = (n) => n.extraLane;

/**
 * 층2 배치 겹침 판정의 공통 코어 — 레인 축(laneOf)만 매개화하면 메인·엑스트라 양쪽에 쓸 수 있다.
 *
 * 검사 대상(targetIndices) 각각에 대해 같은 레인의 다른 노트들과의 겹침을 본다:
 * - 점-점: 같은 beat 중복 배치 → 위반
 * - range 시작점: range끼리 같은 시작 beat 중복 → 위반
 * - 점의 range-body 침범: 점(또는 range의 양 끝)이 다른 range의 (beat, endBeat) **열린 구간** 안 → 위반
 *   (head/end 캡, 즉 range 경계 beat와의 일치는 위반 아님 — 캡 공존 허용)
 *
 * @param notes 전체 노트 배열
 * @param targetIndices 판정할(=이동/붙여넣은) 노트 인덱스 집합
 * @param laneOf 레인 축 추출기
 * @param out 위반 인덱스를 누적할 집합(호출자 제공, 층1 결과와 합치기 위함)
 */
function collectPlacementViolations<T extends NoteEntity | ExtraNoteEntity>(
  notes: readonly T[],
  targetIndices: ReadonlySet<number>,
  laneOf: LaneOf<T>,
  out: Set<number>,
): Set<number> {
  for (const pidx of targetIndices) {
    const p = notes[pidx];
    if (!p) continue;
    const pIsRange = isRangeNote(p);
    const pLane = laneOf(p);

    for (let i = 0; i < notes.length; i++) {
      if (i === pidx) continue;
      const other = notes[i];
      if (laneOf(other) !== pLane) continue;

      const otherIsRange = isRangeNote(other);

      // 점-점 / range-range 시작점 중복
      if (!pIsRange && !otherIsRange && beatEq(p.beat, other.beat)) {
        out.add(pidx);
      }
      if (pIsRange && otherIsRange && beatEq(p.beat, other.beat)) {
        out.add(pidx);
      }

      // p의 위치가 other range의 열린 구간(body)을 침범
      if (otherIsRange) {
        const rn = other as unknown as RangeNote;
        const positions = pIsRange ? [p.beat, (p as unknown as RangeNote).endBeat] : [p.beat];
        for (const b of positions) {
          if (beatGt(b, rn.beat) && beatLt(b, rn.endBeat)) {
            out.add(pidx);
          }
        }
      }
      // other의 위치가 p range의 열린 구간(body)을 침범
      if (pIsRange) {
        const rn = p as unknown as RangeNote;
        const positions = otherIsRange
          ? [other.beat, (other as unknown as RangeNote).endBeat]
          : [other.beat];
        for (const b of positions) {
          if (beatGt(b, rn.beat) && beatLt(b, rn.endBeat)) {
            out.add(pidx);
          }
        }
      }
    }
  }
  return out;
}

/**
 * 점-점 tolerance 근접 판정의 공통 코어 — 겹침(collectPlacementViolations)이 잡지 못하는
 * "SNAP_POSITION_TOLERANCE 이내로 근접했지만 정확히 같은 beat는 아닌" 시각 겹침을 잡는다.
 * range 노트는 층1(body 침범)이 담당하므로 점노트끼리만 본다. 함께 이동하는 노트끼리는
 * 상대 간격이 불변이라(드래그 전 합법이었다면 드래그 후에도 합법) 검사에서 제외한다.
 */
function collectProximityViolations<T extends NoteEntity | ExtraNoteEntity>(
  notes: readonly T[],
  targetIndices: ReadonlySet<number>,
  laneOf: LaneOf<T>,
  out: Set<number>,
): Set<number> {
  for (const mi of targetIndices) {
    const m = notes[mi];
    if (!m || isRangeNote(m)) continue; // 점-점 근접만 — 범위 노트는 층1(body 침범)이 담당
    const mBeat = m.beat.n / m.beat.d;
    const mLane = laneOf(m);

    for (let i = 0; i < notes.length; i++) {
      if (i === mi || targetIndices.has(i)) continue;
      const other = notes[i];
      if (laneOf(other) !== mLane || isRangeNote(other)) continue;
      const oBeat = other.beat.n / other.beat.d;
      if (Math.abs(mBeat - oBeat) <= SNAP_POSITION_TOLERANCE) {
        out.add(mi);
        break;
      }
    }
  }
  return out;
}

/**
 * 붙여넣기 미리보기 중 위반 노트 인덱스 집합을 계산한다.
 *
 * 위반 조건(층2 겹침 코어 + 붙여넣기 전용 모델 규칙):
 * - 같은 레인에서 다른 노트와 겹치거나 동일 beat에 중복 배치 (collectPlacementViolations)
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

  // 층2 겹침(점-점·range-body·시작점 중복)은 공통 코어가 판정한다.
  collectPlacementViolations(notes, pastedNoteIndices, mainLaneOf, violations);

  for (const pidx of pastedNoteIndices) {
    const p = notes[pidx];
    if (!p) continue;
    const pIsRange = isRangeNote(p);

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

/**
 * 이동 프리뷰/커밋의 위반 노트 집합 (RFD 0016 후속) — 모델 위반(computePasteViolations)에
 * 층2 시각 겹침(점-점 tolerance 근접)을 더한다. create의 isCreatePlacementBlocked와 대칭이며,
 * 롱노트 head/end 캡 공존은 create처럼 허용한다(D=·-o 패턴 통로). 함께 이동하는 노트끼리는
 * 상대 간격이 불변이므로(드래그 전에 합법이었다면 드래그 후에도 합법) 검사하지 않는다.
 * 드래그 중 위반 "표시"와 커밋 "거부"가 이 한 판정을 공유한다 — 표시=거부 일치.
 */
export function computeMoveViolations(
  chart: Chart,
  movedNoteIndices: ReadonlySet<number>,
): Set<number> {
  const violations = computePasteViolations(chart, movedNoteIndices);
  collectProximityViolations(chart.notes, movedNoteIndices, mainLaneOf, violations);
  return violations;
}

/**
 * 엑스트라 이동의 위반 노트 집합 — 엑스트라에는 층1(모델 규칙: 트릴 존/stop 등)이 없으므로
 * 층2 겹침 코어(collectPlacementViolations + collectProximityViolations)만 extraLane 축으로 돈다.
 * computeMoveViolations(메인)와 대칭이며 같은 코어를 공유한다.
 */
export function computeExtraMoveViolations(
  extraNotes: readonly ExtraNoteEntity[],
  movedExtraIndices: ReadonlySet<number>,
): Set<number> {
  const violations = new Set<number>();
  collectPlacementViolations(extraNotes, movedExtraIndices, extraLaneOf, violations);
  collectProximityViolations(extraNotes, movedExtraIndices, extraLaneOf, violations);
  return violations;
}

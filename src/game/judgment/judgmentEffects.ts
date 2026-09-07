/**
 * 판정 효과(JudgmentEffects) — 판정 하나가 점수·화면에 일으키는 효과 전체의 순수 기술.
 *
 * PlayScreen.onJudgment의 인라인 캐스케이드(8개 호출·4중 분기)가 결정을 흩어 놓아,
 * 한 갈래를 빠뜨리면 silent 오류가 났고, 소비자마다(플레이 화면 / 튜토리얼 프리뷰)
 * 같은 분기를 다시 구현해야 했다. 이 모듈이 결정을 단독 소유한다:
 *
 * - `decideJudgmentEffects(result, note)` → `JudgmentEffects` (순수 함수, 렌더러·점수 의존 0)
 * - 소비자(적용자)는 반환된 효과 데이터만 해석한다. 플레이 화면은 전체를,
 *   튜토리얼 프리뷰는 부분(judgmentText·bomb)만 적용한다 — 소비 폭 차이가 적용자에 드러난다.
 * - 적용 순서(점수 기록 → accuracy 재조회 등)와 화면 좌표 계산은 적용자 몫이다(결정 아님).
 *
 * `NoteDisplayEffect`는 그 부분집합 — 판정 결과 → 노트 시각 표시 상태 전이.
 * 렌더러는 판정을 event로 한 번 받아 매 프레임 다시 그리므로 노트별 표시 상태를 캐시하는데
 * (일회성 판정 → 다중 프레임 렌더를 잇는 다리), "그 캐시에 무엇을 켤지"를 이 순수 함수가
 * 단독 결정하고 렌더러(`GameNoteRenderer.applyNoteDisplayEffect`)는 적용만 한다.
 */
import { JudgmentGrade, NoteType } from "../../shared/constants";
import type { Lane } from "../../shared/constants";
import type { JudgmentResult } from "./JudgmentEngine";
import type { NoteEntity } from "../../shared";

export interface NoteDisplayEffect {
  /** 롱노트 바디 표시: 실패(full) / 부분실패(방향) / 변화 없음 */
  body: "failed" | { partialFailed: "left" | "right" } | null;
  /** 노트 가시성 전이: 처리됨 / 미스 / 더블 첫 입력 부분 / 변화 없음 */
  visibility: "processed" | "missed" | "doublePartial" | "unchanged";
}

/** 판정 하나가 점수·화면에 일으키는 효과 전체. 적용자는 이 값만 해석한다(result 재조회 없음). */
export interface JudgmentEffects {
  /** 판정된 노트 인덱스 — noteDisplay·debug 적용 대상. */
  noteIndex: number;
  /** 점수 기록 — 바디 판정은 deltaMs를 점수에 반영하지 않는다(생략). */
  scoreRecord: { grade: JudgmentGrade; deltaMs?: number };
  /** 판정 텍스트/고도 표면 표시 — deltaMs는 무조건 전달(FAST/SLOW 표시용). */
  judgmentText: { grade: JudgmentGrade; deltaMs: number };
  /** 밤 이펙트를 띄울 레인 — miss면 없음. */
  bomb: Lane | null;
  /** 노트 시각 표시 상태 전이. */
  noteDisplay: NoteDisplayEffect;
  /**
   * 디버그 판정 기록 — 모든 판정(헤드/포인트 + 롱 바디 끝점: connection/termination)을 기록한다.
   * `isBody`로 구분해 적용자가 화면 좌표를 끝점(바디) vs 시작점(헤드)으로 나눠 계산하고,
   * DebugLogger가 캘리브레이션 통계(오프셋 등)를 헤드만으로 낸다(바디 connection은 deltaMs=0이라
   * 타이밍 신호를 오염시킨다). 화면 좌표 계산은 적용자 몫.
   */
  debug: {
    grade: JudgmentGrade;
    deltaMs: number;
    doubleSubIndex?: number;
    isBody: boolean;
  };
}

/**
 * @param result 판정 결과
 * @param note 판정된 노트 (바디 여부·더블 여부·레인 판별용)
 */
export function decideJudgmentEffects(result: JudgmentResult, note: NoteEntity): JudgmentEffects {
  const isBody = "endBeat" in note;
  const isDouble = note.type === NoteType.DOUBLE;
  const isMiss = result.grade === JudgmentGrade.MISS;

  return {
    noteIndex: result.noteIndex,
    scoreRecord: isBody
      ? { grade: result.grade } // 바디는 타이밍 점수 없음 — deltaMs 생략이 결정이다
      : { grade: result.grade, deltaMs: result.deltaMs },
    judgmentText: { grade: result.grade, deltaMs: result.deltaMs },
    // note.lane(number) → Lane: 게임에 들어오는 노트는 진입점에서 메인 레인(1..4)으로 필터됨 (RFD 0018 §3-3)
    bomb: isMiss ? null : (note.lane as Lane),
    noteDisplay: noteDisplayEffect(result, note),
    debug: {
      grade: result.grade,
      deltaMs: result.deltaMs,
      doubleSubIndex: isDouble ? result.subIndex : undefined,
      isBody,
    },
  };
}

/**
 * 판정 결과 → 노트 시각 표시 상태 전이 (JudgmentEffects의 부분집합, 순수 함수).
 *
 * @param result 판정 결과
 * @param note 판정된 노트 (바디 여부·더블 여부 판별용)
 */
export function noteDisplayEffect(result: JudgmentResult, note: NoteEntity): NoteDisplayEffect {
  const isMiss = result.grade === JudgmentGrade.MISS;
  const isBody = "endBeat" in note;
  const isDouble = note.type === NoteType.DOUBLE;

  const body: NoteDisplayEffect["body"] = !isMiss
    ? null // 비-miss는 바디 실패 표시 없음 (bomb 등 순간 효과는 JudgmentEffects.bomb)
    : result.isPartialBodyFail
      ? { partialFailed: result.failedSide! }
      : "failed";

  const visibility: NoteDisplayEffect["visibility"] = result.isPartialBodyFail
    ? "unchanged" // 부분 실패는 노트가 BODY_ACTIVE 유지 → 가시성 변화 없음
    : isMiss
      ? "missed"
      : isBody
        ? "processed"
        : isDouble && result.subIndex === 0
          ? "doublePartial" // 더블 첫 입력만 받은 상태
          : "processed";

  return { body, visibility };
}

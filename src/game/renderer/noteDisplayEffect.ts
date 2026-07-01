/**
 * 판정 결과 → 노트 시각 표시 상태 변환 (순수 함수).
 *
 * 렌더러는 판정을 event로 한 번 받아 매 프레임 다시 그리므로, 노트별 표시 상태를 캐시한다
 * (일회성 판정 → 다중 프레임 렌더를 잇는 다리). "그 캐시에 무엇을 켤지" 결정하는 로직을
 * 이 순수 함수가 단독으로 소유한다 — 이전엔 PlayScreen.onJudgment의 분기에 흩어져 있어
 * 한 갈래를 빠뜨리면 노트가 영구히 잘못 그려지는 silent 오류가 났다.
 *
 * 순수 함수라 렌더 없이 단위 테스트할 수 있고, 렌더러는 반환된 directive만 적용한다
 * (`GameNoteRenderer.applyNoteDisplayEffect`). bomb 같은 순간 효과는 표시 상태가 아니므로
 * 여기 포함하지 않는다(호출부에서 직접 처리).
 */
import { JudgmentGrade, NoteType } from "../../shared/constants";
import type { JudgmentResult } from "../judgment/JudgmentEngine";
import type { NoteEntity } from "../../shared";

export interface NoteDisplayEffect {
  /** 롱노트 바디 표시: 실패(full) / 부분실패(방향) / 변화 없음 */
  body: "failed" | { partialFailed: "left" | "right" } | null;
  /** 노트 가시성 전이: 처리됨 / 미스 / 더블 첫 입력 부분 / 변화 없음 */
  visibility: "processed" | "missed" | "doublePartial" | "unchanged";
}

/**
 * @param result 판정 결과
 * @param note 판정된 노트 (바디 여부·더블 여부 판별용)
 */
export function noteDisplayEffect(result: JudgmentResult, note: NoteEntity): NoteDisplayEffect {
  const isMiss = result.grade === JudgmentGrade.MISS;
  const isBody = "endBeat" in note;
  const isDouble = note.type === NoteType.DOUBLE;

  const body: NoteDisplayEffect["body"] = !isMiss
    ? null // 비-miss는 바디 실패 표시 없음 (호출부에서 bomb 등 순간 효과 처리)
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

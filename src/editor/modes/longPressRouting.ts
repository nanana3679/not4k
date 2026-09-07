/**
 * 롱프레스가 발화했을 때 "무엇을 할지"를 정하는 순수 결정 함수.
 *
 * 히트 테스트 결과(어떤 엔티티가 눌린 좌표에 있는가)만으로 액션을 고른다 — DOM·타이머·모드
 * 인스턴스에 의존하지 않아 입력→기대 액션을 그대로 단언할 수 있다. 훅은 이 액션을 실제 모드
 * 메서드 호출로 실행하기만 한다(얇은 글루). form A에서 모드가 받는 "의도"로 가는 첫 계단.
 */

export type LongPressAction =
  | { kind: 'resizeNoteEnd'; index: number }
  | { kind: 'moveNote'; index: number }
  | { kind: 'moveZone'; index: number }
  | { kind: 'none' };

/**
 * 롱프레스 발화 시 액션을 고른다.
 * 우선순위: 노트 끝(리사이즈) > 노트(이동) > trillZone 몸통(구간 유닛 이동, RFD 0016 §4.4).
 * 인덱스가 0이어도(falsy) 유효 히트이므로 `!== null`로 판정한다.
 *
 * RFD 0018 ④: 보조 노트가 chart.notes(lane 5+)로 통합돼 noteHit 하나가 메인·보조를 모두
 * 가리킨다 — 옛 moveExtra 분기는 moveNote로 흡수됐다.
 */
export function resolveLongPressAction(hits: {
  noteEndHit: number | null;
  noteHit: number | null;
  zoneHit?: number | null;
}): LongPressAction {
  if (hits.noteEndHit !== null) return { kind: 'resizeNoteEnd', index: hits.noteEndHit };
  if (hits.noteHit !== null) return { kind: 'moveNote', index: hits.noteHit };
  const zoneHit = hits.zoneHit ?? null;
  if (zoneHit !== null) return { kind: 'moveZone', index: zoneHit };
  return { kind: 'none' };
}

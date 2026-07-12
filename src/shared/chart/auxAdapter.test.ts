import { describe, it, expect } from "vitest";
import { beat } from "../types";
import type { NoteEntity, ExtraNoteEntity } from "../types";
import { extraToNote, noteToExtra, auxNotesAsExtra, withAuxNotes, auxIndexToUnifiedIndex } from "./auxAdapter";

const mainA: NoteEntity = { type: "single", lane: 1, beat: beat(0) };
const mainB: NoteEntity = { type: "long", lane: 4, beat: beat(1), endBeat: beat(2) };
const aux5: NoteEntity = { type: "single", lane: 5, beat: beat(0) };
const aux7: NoteEntity = { type: "doubleLong", lane: 7, beat: beat(2), endBeat: beat(4) };

const extraP: ExtraNoteEntity = { type: "single", extraLane: 1, beat: beat(0) };
const extraR: ExtraNoteEntity = { type: "doubleLong", extraLane: 3, beat: beat(2), endBeat: beat(4) };

describe("extraToNote", () => {
  it("extraLane 1 포인트 노트 → lane 5 NoteEntity, extraLane 필드는 남지 않음", () => {
    const converted = extraToNote(extraP);
    expect(converted).toEqual({ type: "single", lane: 5, beat: beat(0) });
    expect("extraLane" in converted).toBe(false);
  });

  it("extraLane 3 구간 노트 → lane 7, endBeat 보존", () => {
    expect(extraToNote(extraR)).toEqual({ type: "doubleLong", lane: 7, beat: beat(2), endBeat: beat(4) });
  });
});

describe("noteToExtra", () => {
  it("lane 5 노트 → extraLane 1, lane 필드는 남지 않음", () => {
    const converted = noteToExtra(aux5);
    expect(converted).toEqual({ type: "single", extraLane: 1, beat: beat(0) });
    expect("lane" in converted).toBe(false);
  });

  it("extraToNote와 noteToExtra는 서로 역이다 (extraLane 3 왕복 동일)", () => {
    expect(noteToExtra(extraToNote(extraR))).toEqual(extraR);
    expect(extraToNote(noteToExtra(aux7))).toEqual(aux7);
  });
});

describe("auxNotesAsExtra", () => {
  it("chart.notes에서 보조(lane 5+)만 뽑아 상대 순서 보존해 ExtraNoteEntity로 변환", () => {
    const notes = [mainA, aux7, mainB, aux5]; // 메인·보조 섞인 입력
    expect(auxNotesAsExtra(notes)).toEqual([
      { type: "doubleLong", extraLane: 3, beat: beat(2), endBeat: beat(4) },
      { type: "single", extraLane: 1, beat: beat(0) },
    ]);
  });

  it("보조 노트가 없으면 빈 배열", () => {
    expect(auxNotesAsExtra([mainA, mainB])).toEqual([]);
  });
});

describe("withAuxNotes", () => {
  it("메인은 유지하고 보조를 넘어온 배열로 교체해 [...main, ...aux] 정규형으로 만든다", () => {
    const notes = [mainA, aux5, mainB]; // 기존 보조(aux5)는 버려지고
    const result = withAuxNotes(notes, [extraR]); // 새 보조(extraR→lane7)로 교체
    expect(result).toEqual([mainA, mainB, { type: "doubleLong", lane: 7, beat: beat(2), endBeat: beat(4) }]);
  });

  it("보조가 비면 메인만 남는다", () => {
    expect(withAuxNotes([mainA, aux5], [])).toEqual([mainA]);
  });

  // 정규형 [...전체 메인, ...전체 보조] 불변 — selection·hover·§3-5 게이트의 mainCount+i 산술이
  // 전부 이 불변에 의존한다(어떤 편집이 main/aux를 뒤섞으면 세 곳이 함께 깨짐). withAuxNotes가
  // 모든 보조 편집이 통과하는 seam이므로 여기서 파티션을 못박는다 (codex 재리뷰 권장).
  it("입력이 뒤섞여 있어도 결과는 정규형 [...전체 메인(원순서), ...전체 보조] 파티션", () => {
    const messy = [aux7, mainA, aux5, mainB]; // 보조가 앞·중간에 낀 비정규 입력
    const result = withAuxNotes(messy, [extraP, extraR]);
    const firstAux = result.findIndex((n) => n.lane > 4);
    expect(result.slice(0, firstAux).every((n) => n.lane <= 4)).toBe(true); // 앞은 전부 메인
    expect(result.slice(firstAux).every((n) => n.lane > 4)).toBe(true); // 뒤는 전부 보조
    expect(result.filter((n) => n.lane <= 4)).toEqual([mainA, mainB]); // 메인 원순서 보존
  });
});

describe("auxIndexToUnifiedIndex", () => {
  it("메인 2개 앞에서 보조 인덱스 0→2, 1→3 (mainCount + auxIndex)", () => {
    const notes = [mainA, mainB, aux5, aux7];
    expect(auxIndexToUnifiedIndex(notes, 0)).toBe(2);
    expect(auxIndexToUnifiedIndex(notes, 1)).toBe(3);
  });

  it("메인이 없으면 보조 인덱스가 그대로 통합 인덱스 (0→0)", () => {
    expect(auxIndexToUnifiedIndex([aux5, aux7], 0)).toBe(0);
  });
});

describe("③ 왕복 순서 보존 (dirty 바이트 동일성 근거 — RFD 0018 §6-3a)", () => {
  it("로드 병합 → 재추출이 보조 상대 순서를 보존한다 (auxNotesAsExtra(withAuxNotes(main, extra)) === extra)", () => {
    const main = [mainA, mainB];
    const extra: ExtraNoteEntity[] = [
      { type: "single", extraLane: 2, beat: beat(0) },
      { type: "single", extraLane: 1, beat: beat(1) }, // 순서가 뒤섞여도
      { type: "long", extraLane: 2, beat: beat(2), endBeat: beat(3) },
    ];
    const merged = withAuxNotes(main, extra);
    expect(auxNotesAsExtra(merged)).toEqual(extra); // 그대로 복원돼야 재저장이 바이트 동일
  });
});

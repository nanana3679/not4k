/**
 * release 소비 — 한 keyup은 같은 레인의 가장 이른 release-대상 하나에 소비된다.
 *
 * RFD 0011의 소비를 RFD 0015가 R2(release-대상 전반)로 일반화·승계했다.
 * 소비된 keyup은 직후 release-대상(슬라이드 미리-떼기)으로 번지지 않고,
 * 소비되지 않은 놓기 keyup은 도장 없이 살아있는 이벤트로 남는다 (§7-3 관대).
 */
import { describe, it, expect, vi } from "vitest";
import { JudgmentEngine } from "./JudgmentEngine";
import type { JudgmentResult, JudgmentCallbacks } from "./JudgmentEngine";
import { JudgmentGrade, NoteType } from "../../shared/constants";
import { beat } from "../../shared/types/beat";
import type { Beat } from "../../shared/types/beat";
import type { NoteEntity } from "../../shared/types/chart";
import type { Lane } from "../../shared/constants/note";

function makeLong(lane: Lane, holdOnly = false): NoteEntity {
  return { type: NoteType.LONG, lane, beat: beat(0, 1), endBeat: beat(4, 1), ...(holdOnly ? { holdOnly: true } : {}) } as NoteEntity;
}
/** 길이 0 hold-only = 슬라이드 */
function makeSlide(lane: Lane, b: Beat): NoteEntity {
  return { type: NoteType.LONG, lane, beat: b, endBeat: b, holdOnly: true } as NoteEntity;
}

function setup(notes: NoteEntity[], noteTimesMs: Map<number, number>, noteEndTimesMs: Map<number, number>) {
  const judgments: JudgmentResult[] = [];
  const callbacks: JudgmentCallbacks = { onJudgment: (r) => judgments.push(r), onComboUpdate: vi.fn() };
  const engine = new JudgmentEngine(notes, noteTimesMs, noteEndTimesMs, callbacks);
  return { engine, judgments };
}

describe("RFD 0011 일반 롱노트 종결 release의 슬라이드 누설 차단", () => {
  const lane: Lane = 1;
  // A: 롱노트 [0, 1000], B: 슬라이드 @ 1050 (A 끝 +50ms — 180BPM 16비트 이내)
  const A_END = 1000;
  const B_TIME = 1050;
  const RELEASE = 1040; // [B_TIME-GOOD(120), B_TIME) = [930, 1050) 안

  it("일반 롱노트를 끝점 지나 유지하다 떼면 직후 슬라이드는 그 release로 Perfect를 받지 않는다", () => {
    const notes = [makeLong(lane, false), makeSlide(lane, beat(5, 1))];
    const { engine, judgments } = setup(notes, new Map([[0, 0], [1, B_TIME]]), new Map([[0, A_END], [1, B_TIME]]));

    engine.onLanePress(lane, 0, "KeyA");
    engine.update(0);
    engine.update(A_END); // BODY_AWAITING_RELEASE
    engine.onLaneRelease(lane, RELEASE, "KeyA"); // A 종결 — 이 release가 B로 새면 안 됨

    expect(judgments.find((j) => j.noteIndex === 0)?.grade).toBe(JudgmentGrade.PERFECT); // A 정상 종결
    expect(judgments.find((j) => j.noteIndex === 1)).toBeUndefined(); // B 미발화 (누설 차단)
  });

  it("누설 차단 후 슬라이드는 held되지 않았으므로 Miss로 처리된다", () => {
    const notes = [makeLong(lane, false), makeSlide(lane, beat(5, 1))];
    const { engine, judgments } = setup(notes, new Map([[0, 0], [1, B_TIME]]), new Map([[0, A_END], [1, B_TIME]]));

    engine.onLanePress(lane, 0, "KeyA");
    engine.update(0);
    engine.update(A_END);
    engine.onLaneRelease(lane, RELEASE, "KeyA");
    engine.update(B_TIME + 300); // B 윈도우 경과 → 자동 Miss

    expect(judgments.find((j) => j.noteIndex === 1)?.grade).toBe(JudgmentGrade.MISS);
  });

  it("[기대값 반전] hold-only 완료 후 놓기가 직후 슬라이드 윈도우 내면 슬라이드 Perfect (RFD 0015 §7-3 — 구 도장 차단)", () => {
    const notes = [makeLong(lane, true), makeSlide(lane, beat(5, 1))];
    const { engine, judgments } = setup(notes, new Map([[0, 0], [1, B_TIME]]), new Map([[0, A_END], [1, B_TIME]]));

    engine.onLanePress(lane, 0, "KeyA");
    engine.update(0);
    engine.update(A_END); // hold-only held 완료 Perfect — keyup 소비 없음(도장도 없음)
    engine.onLaneRelease(lane, RELEASE, "KeyA"); // 놓기 — B 윈도우 [930, 1050) 안 → B를 살린다

    expect(judgments.find((j) => j.noteIndex === 1)?.grade).toBe(JudgmentGrade.PERFECT);
  });

  it("보존: 선행 종결이 없는 고립 슬라이드의 미리-떼기는 그대로 Perfect", () => {
    const notes = [makeSlide(lane, beat(5, 1))];
    const { engine, judgments } = setup(notes, new Map([[0, B_TIME]]), new Map([[0, B_TIME]]));

    engine.onLanePress(lane, 900, "KeyA"); // 슬라이드 전부터 눌러 held
    engine.onLaneRelease(lane, RELEASE, "KeyA"); // 미리-떼기 (선행 종결 없음 → 소비 없음)

    expect(judgments.find((j) => j.noteIndex === 0)?.grade).toBe(JudgmentGrade.PERFECT);
  });
});

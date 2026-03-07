import { describe, it, expect, vi } from "vitest";
import { JudgmentEngine } from "./JudgmentEngine";
import type { JudgmentResult, JudgmentCallbacks } from "./JudgmentEngine";
import { JudgmentGrade, JUDGMENT_WINDOWS, NoteType, beat } from "../../shared";
import type { Lane, NoteEntity, Beat } from "../../shared";

/** 테스트 헬퍼: 롱노트 바디(RangeNote) 생성 */
function makeLongNote(lane: Lane, beat: Beat, endBeat: Beat): NoteEntity {
  return { type: NoteType.LONG, lane, beat, endBeat } as NoteEntity;
}

/** 테스트 헬퍼: 판정 엔진 + 콜백 셋업 */
function setup(
  notes: NoteEntity[],
  noteTimesMs: Map<number, number>,
  noteEndTimesMs: Map<number, number>,
) {
  const judgments: JudgmentResult[] = [];
  const callbacks: JudgmentCallbacks = {
    onJudgment: (r) => judgments.push(r),
    onComboUpdate: vi.fn(),
  };
  const engine = new JudgmentEngine(notes, noteTimesMs, noteEndTimesMs, callbacks);
  return { engine, judgments, callbacks };
}

describe("롱노트 종료 시점 릴리즈 판정", () => {
  /**
   * 시나리오: 레인1에 키 A, B 두 개가 바인딩.
   * 롱노트 바디 진행 중, 끝점 판정 윈도우 안에서 키 A만 릴리즈.
   * 키 B는 여전히 홀드 상태.
   * → 릴리즈 판정이 발생해야 한다.
   */
  it("끝점 윈도우 내 릴리즈 시 다른 키가 홀드 상태여도 종결 판정 발생", () => {
    const lane: Lane = 1;
    const b = beat(0, 1);
    const endB = beat(4, 1);

    const notes: NoteEntity[] = [makeLongNote(lane, b, endB)];
    const startMs = 0;
    const endMs = 2000;
    const noteTimesMs = new Map([[0, startMs]]);
    const noteEndTimesMs = new Map([[0, endMs]]);

    const { engine, judgments } = setup(notes, noteTimesMs, noteEndTimesMs);

    // 키 A, B로 홀드 시작
    engine.onLanePress(lane, startMs, "KeyA");
    engine.onLanePress(lane, startMs + 10, "KeyB");

    // 바디 활성화
    engine.update(startMs);

    // 바디 유지 중 (중간 시점)
    engine.update(startMs + 1000);

    // 끝점 도달
    engine.update(endMs);

    // 끝점 윈도우 내에서 키 A만 릴리즈 (키 B는 홀드 유지)
    const releaseTime = endMs + 30; // Good 윈도우 내
    engine.onLaneRelease(lane, releaseTime, "KeyA");

    expect(judgments.length).toBe(1);
    expect(judgments[0].noteIndex).toBe(0);
    // Good 이상이면 Perfect로 상향
    expect(judgments[0].grade).toBe(JudgmentGrade.PERFECT);
  });

  it("끝점 윈도우 밖 릴리즈는 판정을 트리거하지 않음", () => {
    const lane: Lane = 1;
    const b = beat(0, 1);
    const endB = beat(4, 1);

    const notes: NoteEntity[] = [makeLongNote(lane, b, endB)];
    const startMs = 0;
    const endMs = 2000;
    const noteTimesMs = new Map([[0, startMs]]);
    const noteEndTimesMs = new Map([[0, endMs]]);

    const { engine, judgments } = setup(notes, noteTimesMs, noteEndTimesMs);

    engine.onLanePress(lane, startMs, "KeyA");
    engine.onLanePress(lane, startMs + 10, "KeyB");

    engine.update(startMs);

    // 끝점 윈도우 훨씬 전에 릴리즈 (바디 중간)
    engine.onLaneRelease(lane, 500, "KeyA");

    // 끝점 도달 전이므로 판정 없음
    expect(judgments.length).toBe(0);
  });

  it("BODY_AWAITING_RELEASE 상태에서 다른 키 홀드 중 릴리즈해도 종결 판정 발생", () => {
    const lane: Lane = 1;
    const b = beat(0, 1);
    const endB = beat(4, 1);

    const notes: NoteEntity[] = [makeLongNote(lane, b, endB)];
    const startMs = 0;
    const endMs = 2000;
    const noteTimesMs = new Map([[0, startMs]]);
    const noteEndTimesMs = new Map([[0, endMs]]);

    const { engine, judgments } = setup(notes, noteTimesMs, noteEndTimesMs);

    // 키 A, B로 홀드 시작
    engine.onLanePress(lane, startMs, "KeyA");
    engine.onLanePress(lane, startMs + 10, "KeyB");

    // 바디 활성화 → 끝점 도달 (키 유지 중이므로 BODY_AWAITING_RELEASE)
    engine.update(startMs);
    engine.update(endMs);

    // 아직 판정 없음 (키 유지 중이므로 릴리즈 대기)
    expect(judgments.length).toBe(0);

    // 키 A만 릴리즈 (키 B 홀드 유지)
    engine.onLaneRelease(lane, endMs + 50, "KeyA");

    expect(judgments.length).toBe(1);
    expect(judgments[0].grade).toBe(JudgmentGrade.PERFECT);
  });

  it("BODY_ACTIVE 상태에서 끝점 Good 윈도우 내 단일 키 릴리즈로 종결 판정 발생", () => {
    const lane: Lane = 2;
    const b = beat(0, 1);
    const endB = beat(4, 1);

    const notes: NoteEntity[] = [makeLongNote(lane, b, endB)];
    const startMs = 0;
    const endMs = 2000;
    const noteTimesMs = new Map([[0, startMs]]);
    const noteEndTimesMs = new Map([[0, endMs]]);

    const { engine, judgments } = setup(notes, noteTimesMs, noteEndTimesMs);

    engine.onLanePress(lane, startMs, "KeyE");
    engine.onLanePress(lane, startMs + 5, "KeyC");

    engine.update(startMs);
    engine.update(startMs + 1000);

    // 끝점 Good 윈도우 진입 직후 (끝점 전) 키 하나 릴리즈
    const releaseTime = endMs - 50; // Good 윈도우 내
    engine.onLaneRelease(lane, releaseTime, "KeyE");

    expect(judgments.length).toBe(1);
    expect(judgments[0].grade).toBe(JudgmentGrade.PERFECT);
  });

  it("모든 키를 동시에 릴리즈해도 정상적으로 종결 판정 1회만 발생", () => {
    const lane: Lane = 1;
    const b = beat(0, 1);
    const endB = beat(4, 1);

    const notes: NoteEntity[] = [makeLongNote(lane, b, endB)];
    const startMs = 0;
    const endMs = 2000;
    const noteTimesMs = new Map([[0, startMs]]);
    const noteEndTimesMs = new Map([[0, endMs]]);

    const { engine, judgments } = setup(notes, noteTimesMs, noteEndTimesMs);

    engine.onLanePress(lane, startMs, "KeyA");
    engine.onLanePress(lane, startMs + 5, "KeyB");

    engine.update(startMs);
    engine.update(endMs);

    // 두 키 순차 릴리즈 (거의 동시)
    engine.onLaneRelease(lane, endMs + 20, "KeyA");
    engine.onLaneRelease(lane, endMs + 21, "KeyB");

    // 첫 릴리즈에서 판정 발생 → COMPLETE → 두 번째는 무시
    expect(judgments.length).toBe(1);
    expect(judgments[0].grade).toBe(JudgmentGrade.PERFECT);
  });
});

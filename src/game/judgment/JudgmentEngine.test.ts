import { describe, it, expect, vi } from "vitest";
import { JudgmentEngine } from "./JudgmentEngine";
import type { JudgmentResult, JudgmentCallbacks } from "./JudgmentEngine";
import { JudgmentGrade, JUDGMENT_WINDOWS_EASY, NoteType } from "../../shared/constants";
import { beat } from "../../shared/types/beat";
import type { Beat } from "../../shared/types/beat";
import type { Lane } from "../../shared/constants/note";
import type { NoteEntity } from "../../shared/types/chart";
import type { JudgmentWindows } from "../../shared/constants/judgment";

/** 테스트 헬퍼: 롱노트 바디(RangeNote) 생성 */
function makeLongNote(lane: Lane, beat: Beat, endBeat: Beat): NoteEntity {
  return { type: NoteType.LONG, lane, beat, endBeat } as NoteEntity;
}

/** 테스트 헬퍼: 더블 롱노트 바디(RangeNote) 생성 */
function makeDoubleLongNote(lane: Lane, b: Beat, endBeat: Beat): NoteEntity {
  return { type: NoteType.DOUBLE_LONG, lane, beat: b, endBeat } as NoteEntity;
}

/** 테스트 헬퍼: 싱글 노트 생성 */
function makeSingleNote(lane: Lane, b: Beat): NoteEntity {
  return { type: NoteType.SINGLE, lane, beat: b } as NoteEntity;
}

/** 테스트 헬퍼: Grace 싱글 노트 생성 */
function makeGraceSingleNote(lane: Lane, b: Beat): NoteEntity {
  return { type: NoteType.SINGLE, lane, beat: b, grace: true } as NoteEntity;
}

/** 테스트 헬퍼: Grace 더블 노트 생성 */
function makeGraceDoubleNote(lane: Lane, b: Beat): NoteEntity {
  return { type: NoteType.DOUBLE, lane, beat: b, grace: true } as NoteEntity;
}

/** 테스트 헬퍼: Grace 트릴 노트 생성 */
function makeGraceTrillNote(lane: Lane, b: Beat): NoteEntity {
  return { type: NoteType.TRILL, lane, beat: b, grace: true } as NoteEntity;
}

/** 테스트 헬퍼: 트릴 노트 생성 */
function makeTrillNote(lane: Lane, b: Beat): NoteEntity {
  return { type: NoteType.TRILL, lane, beat: b } as NoteEntity;
}

/** 테스트 헬퍼: 판정 엔진 + 콜백 셋업 */
function setup(
  notes: NoteEntity[],
  noteTimesMs: Map<number, number>,
  noteEndTimesMs: Map<number, number>,
  windows?: JudgmentWindows,
  trillZoneStartTimesMs?: Map<Lane, number[]>,
) {
  const judgments: JudgmentResult[] = [];
  const callbacks: JudgmentCallbacks = {
    onJudgment: (r) => judgments.push(r),
    onComboUpdate: vi.fn(),
  };
  const engine = new JudgmentEngine(notes, noteTimesMs, noteEndTimesMs, callbacks, windows, trillZoneStartTimesMs);
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

describe("쉬운 판정 모드 (maimai 윈도우)", () => {
  it("normal에서 Great인 45ms가 easy에서는 Perfect", () => {
    const lane: Lane = 1;
    const noteTime = 1000;
    const notes = [makeSingleNote(lane, beat(0, 1))];
    const noteTimesMs = new Map([[0, noteTime]]);
    const noteEndTimesMs = new Map<number, number>();

    const { engine, judgments } = setup(notes, noteTimesMs, noteEndTimesMs, JUDGMENT_WINDOWS_EASY);

    engine.onLanePress(lane, noteTime + 45, "KeyA");

    expect(judgments.length).toBe(1);
    expect(judgments[0].grade).toBe(JudgmentGrade.PERFECT);
  });

  it("normal에서 Good인 90ms가 easy에서는 Great", () => {
    const lane: Lane = 1;
    const noteTime = 1000;
    const notes = [makeSingleNote(lane, beat(0, 1))];
    const noteTimesMs = new Map([[0, noteTime]]);
    const noteEndTimesMs = new Map<number, number>();

    const { engine, judgments } = setup(notes, noteTimesMs, noteEndTimesMs, JUDGMENT_WINDOWS_EASY);

    engine.onLanePress(lane, noteTime + 90, "KeyA");

    expect(judgments.length).toBe(1);
    expect(judgments[0].grade).toBe(JudgmentGrade.GREAT);
  });

  it("normal에서 Bad인 130ms가 easy에서는 Good", () => {
    const lane: Lane = 1;
    const noteTime = 1000;
    const notes = [makeSingleNote(lane, beat(0, 1))];
    const noteTimesMs = new Map([[0, noteTime]]);
    const noteEndTimesMs = new Map<number, number>();

    const { engine, judgments } = setup(notes, noteTimesMs, noteEndTimesMs, JUDGMENT_WINDOWS_EASY);

    engine.onLanePress(lane, noteTime + 130, "KeyA");

    expect(judgments.length).toBe(1);
    expect(judgments[0].grade).toBe(JudgmentGrade.GOOD);
  });

  it("normal에서 Miss인 170ms가 easy에서는 Bad", () => {
    const lane: Lane = 1;
    const noteTime = 1000;
    const notes = [makeSingleNote(lane, beat(0, 1))];
    const noteTimesMs = new Map([[0, noteTime]]);
    const noteEndTimesMs = new Map<number, number>();

    const { engine, judgments } = setup(notes, noteTimesMs, noteEndTimesMs, JUDGMENT_WINDOWS_EASY);

    engine.onLanePress(lane, noteTime + 170, "KeyA");

    expect(judgments.length).toBe(1);
    expect(judgments[0].grade).toBe(JudgmentGrade.BAD);
  });

  it("easy에서도 200ms 초과는 Miss", () => {
    const lane: Lane = 1;
    const noteTime = 1000;
    const notes = [makeSingleNote(lane, beat(0, 1))];
    const noteTimesMs = new Map([[0, noteTime]]);
    const noteEndTimesMs = new Map<number, number>();

    const { engine, judgments } = setup(notes, noteTimesMs, noteEndTimesMs, JUDGMENT_WINDOWS_EASY);

    // BAD 윈도우(200ms) 초과 → 입력 무시, update로 자동 Miss
    engine.onLanePress(lane, noteTime + 210, "KeyA");
    engine.update(noteTime + 210);

    expect(judgments.length).toBe(1);
    expect(judgments[0].grade).toBe(JudgmentGrade.MISS);
  });

  it("windows 미전달 시 기본 normal 윈도우 사용", () => {
    const lane: Lane = 1;
    const noteTime = 1000;
    const notes = [makeSingleNote(lane, beat(0, 1))];
    const noteTimesMs = new Map([[0, noteTime]]);
    const noteEndTimesMs = new Map<number, number>();

    // windows 파라미터 없이 생성
    const { engine, judgments } = setup(notes, noteTimesMs, noteEndTimesMs);

    // 45ms: normal에서는 Great
    engine.onLanePress(lane, noteTime + 45, "KeyA");

    expect(judgments.length).toBe(1);
    expect(judgments[0].grade).toBe(JudgmentGrade.GREAT);
  });
});

describe("Grace 싱글 노트 판정", () => {
  const lane: Lane = 1;
  const noteTime = 1000;

  function graceSetup() {
    const notes = [makeGraceSingleNote(lane, beat(0, 1))];
    const noteTimesMs = new Map([[0, noteTime]]);
    const noteEndTimesMs = new Map<number, number>();
    return setup(notes, noteTimesMs, noteEndTimesMs);
  }

  it("Good 윈도우 내(±120ms) 입력 시 항상 Perfect", () => {
    const { engine, judgments } = graceSetup();
    engine.onLanePress(lane, noteTime + 100, "KeyA");
    expect(judgments[0].grade).toBe(JudgmentGrade.PERFECT);
  });

  it("정확한 타이밍(0ms) 입력 시 Perfect", () => {
    const { engine, judgments } = graceSetup();
    engine.onLanePress(lane, noteTime, "KeyA");
    expect(judgments[0].grade).toBe(JudgmentGrade.PERFECT);
  });

  it("Good 경계값(+120ms) 입력 시 Perfect", () => {
    const { engine, judgments } = graceSetup();
    engine.onLanePress(lane, noteTime + 120, "KeyA");
    expect(judgments[0].grade).toBe(JudgmentGrade.PERFECT);
  });

  it("Good 경계값(-120ms) 입력 시 Perfect", () => {
    const { engine, judgments } = graceSetup();
    engine.onLanePress(lane, noteTime - 120, "KeyA");
    expect(judgments[0].grade).toBe(JudgmentGrade.PERFECT);
  });

  it("Late Bad(+121~+160ms) 입력 시 Bad", () => {
    const { engine, judgments } = graceSetup();
    engine.onLanePress(lane, noteTime + 140, "KeyA");
    expect(judgments[0].grade).toBe(JudgmentGrade.BAD);
  });

  it("Late Bad 경계값(+160ms) 입력 시 Bad", () => {
    const { engine, judgments } = graceSetup();
    engine.onLanePress(lane, noteTime + 160, "KeyA");
    expect(judgments[0].grade).toBe(JudgmentGrade.BAD);
  });

  it("Early Bad 윈도우(-121~-160ms) 입력은 무시됨 — early Bad 없음", () => {
    const { engine, judgments } = graceSetup();
    engine.onLanePress(lane, noteTime - 140, "KeyA");
    // findEarliestUnprocessedNote에서 early는 Good까지만 매칭 → 입력 무시
    expect(judgments.length).toBe(0);
  });

  it("일반 노트에서 Great인 45ms가 Grace에서는 Perfect", () => {
    const { engine, judgments } = graceSetup();
    engine.onLanePress(lane, noteTime + 45, "KeyA");
    expect(judgments[0].grade).toBe(JudgmentGrade.PERFECT);
  });

  it("일반 노트에서 Good인 100ms가 Grace에서는 Perfect", () => {
    const { engine, judgments } = graceSetup();
    engine.onLanePress(lane, noteTime + 100, "KeyA");
    expect(judgments[0].grade).toBe(JudgmentGrade.PERFECT);
  });
});

describe("Grace 더블 노트 판정", () => {
  const lane: Lane = 1;
  const noteTime = 1000;

  function graceDoubleSetup() {
    const notes = [makeGraceDoubleNote(lane, beat(0, 1))];
    const noteTimesMs = new Map([[0, noteTime]]);
    const noteEndTimesMs = new Map<number, number>();
    return setup(notes, noteTimesMs, noteEndTimesMs);
  }

  it("두 키 모두 Good 윈도우 내 입력 시 둘 다 Perfect", () => {
    const { engine, judgments } = graceDoubleSetup();
    engine.onLanePress(lane, noteTime + 80, "KeyA");
    engine.onLanePress(lane, noteTime + 110, "KeyB");
    expect(judgments.length).toBe(2);
    expect(judgments[0].grade).toBe(JudgmentGrade.PERFECT);
    expect(judgments[1].grade).toBe(JudgmentGrade.PERFECT);
  });

  it("같은 키 두 번 입력 시 두 번째는 무시", () => {
    const { engine, judgments } = graceDoubleSetup();
    engine.onLanePress(lane, noteTime + 30, "KeyA");
    engine.onLanePress(lane, noteTime + 50, "KeyA");
    expect(judgments.length).toBe(1);
  });
});

describe("Grace 트릴 노트 판정", () => {
  const lane: Lane = 1;
  const noteTime1 = 1000;
  const noteTime2 = 1200;

  function graceTrillSetup() {
    const notes = [
      makeGraceTrillNote(lane, beat(0, 1)),
      makeGraceTrillNote(lane, beat(1, 1)),
    ];
    const noteTimesMs = new Map([[0, noteTime1], [1, noteTime2]]);
    const noteEndTimesMs = new Map<number, number>();
    return setup(notes, noteTimesMs, noteEndTimesMs);
  }

  it("교대 성공 시 Perfect", () => {
    const { engine, judgments } = graceTrillSetup();
    engine.onLanePress(lane, noteTime1, "KeyA");
    engine.onLanePress(lane, noteTime2, "KeyB");
    expect(judgments[0].grade).toBe(JudgmentGrade.PERFECT);
    expect(judgments[1].grade).toBe(JudgmentGrade.PERFECT);
  });

  it("교대 실패 시 Good◇ 유지 — Grace여도 교대 규칙은 적용", () => {
    const { engine, judgments } = graceTrillSetup();
    engine.onLanePress(lane, noteTime1, "KeyA");
    engine.onLanePress(lane, noteTime2, "KeyA"); // 같은 키 → 교대 실패
    expect(judgments[0].grade).toBe(JudgmentGrade.PERFECT);
    expect(judgments[1].grade).toBe(JudgmentGrade.GOOD_TRILL);
  });
});

describe("트릴 구간 경계의 교대 추적 초기화", () => {
  const lane: Lane = 1;

  it("다른 트릴 구간의 첫 노트에서 이전 구간과 같은 키를 사용해도 Good◇이 발생하지 않는다", () => {
    // 트릴 구간 1: 1000ms 시작, 노트 1000ms / 1200ms
    // 트릴 구간 2: 2000ms 시작, 노트 2000ms / 2200ms
    const notes = [
      makeTrillNote(lane, beat(0, 1)),   // 1000ms
      makeTrillNote(lane, beat(1, 1)),   // 1200ms
      makeTrillNote(lane, beat(2, 1)),   // 2000ms — 새 구간 첫 노트
      makeTrillNote(lane, beat(3, 1)),   // 2200ms
    ];
    const noteTimesMs = new Map([
      [0, 1000], [1, 1200], [2, 2000], [3, 2200],
    ]);
    const noteEndTimesMs = new Map<number, number>();
    const trillZoneStartTimesMs = new Map<Lane, number[]>([
      [lane, [1000, 2000]],
    ]);

    const { engine, judgments } = setup(notes, noteTimesMs, noteEndTimesMs, undefined, trillZoneStartTimesMs);

    // 구간 1 시작 → 교대 추적 리셋
    engine.update(1000);
    engine.onLanePress(lane, 1000, "KeyA");
    engine.onLanePress(lane, 1200, "KeyB");

    // 구간 2 시작 → 교대 추적 리셋
    engine.update(2000);
    // 이전 구간 마지막 키가 KeyB였으나, 새 구간이므로 KeyB로 시작해도 교대 성공
    engine.onLanePress(lane, 2000, "KeyB");
    engine.onLanePress(lane, 2200, "KeyA");

    expect(judgments).toHaveLength(4);
    expect(judgments[0].grade).toBe(JudgmentGrade.PERFECT); // 구간1 첫 노트
    expect(judgments[1].grade).toBe(JudgmentGrade.PERFECT); // 구간1 교대 성공
    expect(judgments[2].grade).toBe(JudgmentGrade.PERFECT); // 구간2 첫 노트 — Good◇ 아님
    expect(judgments[3].grade).toBe(JudgmentGrade.PERFECT); // 구간2 교대 성공
  });

  it("같은 트릴 구간 내에서 같은 키 연속 입력 시 Good◇ 발생", () => {
    const notes = [
      makeTrillNote(lane, beat(0, 1)),
      makeTrillNote(lane, beat(1, 1)),
    ];
    const noteTimesMs = new Map([[0, 1000], [1, 1200]]);
    const noteEndTimesMs = new Map<number, number>();
    const trillZoneStartTimesMs = new Map<Lane, number[]>([
      [lane, [1000]],
    ]);

    const { engine, judgments } = setup(notes, noteTimesMs, noteEndTimesMs, undefined, trillZoneStartTimesMs);

    engine.update(1000);
    engine.onLanePress(lane, 1000, "KeyA");
    engine.onLanePress(lane, 1200, "KeyA"); // 같은 키 → 교대 실패

    expect(judgments).toHaveLength(2);
    expect(judgments[0].grade).toBe(JudgmentGrade.PERFECT);
    expect(judgments[1].grade).toBe(JudgmentGrade.GOOD_TRILL);
  });

  it("트릴 구간 경계에서 교대 추적 상태가 초기화된다", () => {
    // 트릴 구간 1: 노트 1000ms에서 KeyA 입력
    // 트릴 구간 2: 노트 3000ms에서 KeyA 입력 — 리셋 후이므로 교대 성공
    const notes = [
      makeTrillNote(lane, beat(0, 1)),
      makeTrillNote(lane, beat(1, 1)),
    ];
    const noteTimesMs = new Map([[0, 1000], [1, 3000]]);
    const noteEndTimesMs = new Map<number, number>();
    const trillZoneStartTimesMs = new Map<Lane, number[]>([
      [lane, [1000, 3000]],
    ]);

    const { engine, judgments } = setup(notes, noteTimesMs, noteEndTimesMs, undefined, trillZoneStartTimesMs);

    engine.update(1000);
    engine.onLanePress(lane, 1000, "KeyA");

    engine.update(3000);
    engine.onLanePress(lane, 3000, "KeyA"); // 새 구간 → 리셋 → 교대 성공

    expect(judgments).toHaveLength(2);
    expect(judgments[0].grade).toBe(JudgmentGrade.PERFECT);
    expect(judgments[1].grade).toBe(JudgmentGrade.PERFECT); // Good◇ 아님
  });

  it("trillZoneStartTimesMs 미전달 시 기존 동작 유지 — 게임 시작 시 첫 트릴은 교대 성공", () => {
    const notes = [
      makeTrillNote(lane, beat(0, 1)),
      makeTrillNote(lane, beat(1, 1)),
    ];
    const noteTimesMs = new Map([[0, 1000], [1, 1200]]);
    const noteEndTimesMs = new Map<number, number>();

    // trillZoneStartTimesMs 전달 없이 생성
    const { engine, judgments } = setup(notes, noteTimesMs, noteEndTimesMs);

    engine.onLanePress(lane, 1000, "KeyA");
    engine.onLanePress(lane, 1200, "KeyA"); // 같은 키 → 교대 실패

    expect(judgments).toHaveLength(2);
    expect(judgments[0].grade).toBe(JudgmentGrade.PERFECT); // 첫 트릴은 null이므로 교대 성공
    expect(judgments[1].grade).toBe(JudgmentGrade.GOOD_TRILL); // 같은 키 연속
  });

  it("다른 레인의 트릴 구간 시작은 해당 레인의 교대 추적에만 영향", () => {
    const lane1: Lane = 1;
    const lane2: Lane = 2;

    const notes = [
      makeTrillNote(lane1, beat(0, 1)),  // 1000ms
      makeTrillNote(lane1, beat(1, 1)),  // 1200ms
      makeTrillNote(lane2, beat(2, 1)),  // 2000ms
    ];
    const noteTimesMs = new Map([[0, 1000], [1, 1200], [2, 2000]]);
    const noteEndTimesMs = new Map<number, number>();
    const trillZoneStartTimesMs = new Map<Lane, number[]>([
      [lane1, [1000]],
      [lane2, [2000]],
    ]);

    const { engine, judgments } = setup(notes, noteTimesMs, noteEndTimesMs, undefined, trillZoneStartTimesMs);

    engine.update(1000);
    engine.onLanePress(lane1, 1000, "KeyA");
    engine.onLanePress(lane1, 1200, "KeyA"); // lane1에서 같은 키 → Good◇

    engine.update(2000);
    // lane2의 구간 시작이 lane1의 상태를 리셋하지 않는다
    engine.onLanePress(lane2, 2000, "KeyC"); // lane2 첫 노트 → 교대 성공

    expect(judgments).toHaveLength(3);
    expect(judgments[0].grade).toBe(JudgmentGrade.PERFECT);
    expect(judgments[1].grade).toBe(JudgmentGrade.GOOD_TRILL);
    expect(judgments[2].grade).toBe(JudgmentGrade.PERFECT);
  });
});

describe("트릴 구간 경계 입력 추적 보호", () => {
  const lane: Lane = 1;

  it("트릴 구간 직전 노트를 늦게 쳐서 트릴 구간 안에서 처리해도 교대 추적에 기록되지 않는다", () => {
    // 이전 트릴 구간: 노트 1900ms (구간 1500ms 시작)
    // 새 트릴 구간: 2000ms 시작, 노트 2000ms / 2200ms
    // 1900ms 노트를 2010ms에 처리(delta=110ms, Bad 윈도우 내)
    // → 새 구간 시작 이후이지만 noteTime < 2000ms이므로 추적 제외
    const notes = [
      makeTrillNote(lane, beat(0, 1)),  // 1900ms — 이전 구간 마지막 노트
      makeTrillNote(lane, beat(1, 1)),  // 2000ms — 새 구간 첫 노트
      makeTrillNote(lane, beat(2, 1)),  // 2200ms — 새 구간 두 번째 노트
    ];
    const noteTimesMs = new Map([
      [0, 1900], [1, 2000], [2, 2200],
    ]);
    const noteEndTimesMs = new Map<number, number>();
    const trillZoneStartTimesMs = new Map<Lane, number[]>([
      [lane, [1500, 2000]],
    ]);

    const { engine, judgments } = setup(notes, noteTimesMs, noteEndTimesMs, undefined, trillZoneStartTimesMs);

    // 이전 구간 시작
    engine.update(1500);

    // 새 구간 시작 → 교대 추적 리셋
    engine.update(2000);

    // 1900ms 노트를 늦게(2010ms) 입력 — KeyA (delta=110ms, Bad 윈도우 내)
    // noteTime=1900 < currentZoneStart=2000 → 교대 추적에 기록되지 않음
    engine.onLanePress(lane, 2010, "KeyA");

    // 새 구간 첫 노트(2000ms)를 2020ms에 입력 — KeyA
    // 교대 추적이 null이므로(이전 입력이 기록되지 않음) 교대 성공
    engine.onLanePress(lane, 2020, "KeyA");

    // 새 구간 두 번째 노트(2200ms)를 입력 — KeyB
    engine.onLanePress(lane, 2200, "KeyB");

    expect(judgments).toHaveLength(3);
    // 이전 구간 노트는 정상 판정 — Good (delta=110ms, Good 윈도우 내)
    expect(judgments[0].grade).toBe(JudgmentGrade.GOOD);
    // 새 구간 첫 노트 — 이전의 KeyA가 기록되지 않았으므로 KeyA로 시작해도 교대 성공
    expect(judgments[1].grade).toBe(JudgmentGrade.PERFECT);
    // 새 구간 두 번째 노트 — KeyA → KeyB 교대 성공
    expect(judgments[2].grade).toBe(JudgmentGrade.PERFECT);
  });

  it("트릴 구간 시작과 동시에 등장한 트릴 노트를 일찍 쳐서 구간 밖에서 처리해도 교대 추적이 정상 동작한다", () => {
    // 트릴 구간: 2000ms 시작, 노트 2000ms / 2200ms
    // 2000ms 노트를 1960ms에 처리 → 구간 시작 전이지만 noteTime >= 2000ms이므로 추적 포함
    const notes = [
      makeTrillNote(lane, beat(0, 1)),  // 2000ms — 구간 첫 노트
      makeTrillNote(lane, beat(1, 1)),  // 2200ms — 구간 두 번째 노트
    ];
    const noteTimesMs = new Map([
      [0, 2000], [1, 2200],
    ]);
    const noteEndTimesMs = new Map<number, number>();
    const trillZoneStartTimesMs = new Map<Lane, number[]>([
      [lane, [2000]],
    ]);

    const { engine, judgments } = setup(notes, noteTimesMs, noteEndTimesMs, undefined, trillZoneStartTimesMs);

    // 아직 구간 시작 전 (update가 2000ms 이전)
    engine.update(1950);

    // 2000ms 노트를 일찍(1960ms) 입력 — KeyA
    // noteTime=2000 >= currentZoneStart(null이므로 조건 충족) → 교대 추적 기록
    engine.onLanePress(lane, 1960, "KeyA");

    // 구간 시작 (교대 추적 리셋되지만, 이미 위에서 기록됨)
    // 하지만! update(2000)이 호출되면 리셋된다.
    // 이 시나리오에서는 update(2000) 전에 입력이 들어왔으므로,
    // currentZoneStart는 아직 null → noteTime >= null은 true → 기록됨
    // 그리고 update(2000)에서 리셋 → trillAlternation이 null로 돌아감
    // 결과: 두 번째 노트에서 어떤 키든 교대 성공
    engine.update(2000);

    // 두 번째 노트(2200ms) — KeyA
    engine.onLanePress(lane, 2200, "KeyA");

    expect(judgments).toHaveLength(2);
    expect(judgments[0].grade).toBe(JudgmentGrade.PERFECT);
    // update(2000)에서 리셋되므로 KeyA 연속이어도 교대 성공
    expect(judgments[1].grade).toBe(JudgmentGrade.PERFECT);
  });

  it("트릴 노트를 일찍 쳐서 구간 밖에서 처리했을 때 교대 추적이 기록되어 같은 키 연속 시 Good◇ 발생", () => {
    // 트릴 구간: 2000ms 시작, 노트 2000ms / 2200ms
    // update(2000) 호출 후 → 리셋 완료 상태에서 첫 노트를 일찍 입력
    const notes = [
      makeTrillNote(lane, beat(0, 1)),  // 2000ms
      makeTrillNote(lane, beat(1, 1)),  // 2200ms
    ];
    const noteTimesMs = new Map([
      [0, 2000], [1, 2200],
    ]);
    const noteEndTimesMs = new Map<number, number>();
    const trillZoneStartTimesMs = new Map<Lane, number[]>([
      [lane, [2000]],
    ]);

    const { engine, judgments } = setup(notes, noteTimesMs, noteEndTimesMs, undefined, trillZoneStartTimesMs);

    // 구간 시작
    engine.update(2000);

    // 첫 노트를 정확히 입력 — KeyA
    // noteTime=2000 >= currentZoneStart=2000 → 교대 추적 기록
    engine.onLanePress(lane, 2000, "KeyA");

    // 두 번째 노트에서 같은 키 → 교대 실패
    engine.onLanePress(lane, 2200, "KeyA");

    expect(judgments).toHaveLength(2);
    expect(judgments[0].grade).toBe(JudgmentGrade.PERFECT);
    expect(judgments[1].grade).toBe(JudgmentGrade.GOOD_TRILL);
  });

  it("이전 구간 마지막 노트를 늦게 쳐도 판정 자체는 정상 수행된다 — 교대 추적만 제외", () => {
    // 교대 체크는 여전히 수행됨 (trillAlternation에서 읽기는 함)
    // trillAlternation.set만 스킵함
    const notes = [
      makeTrillNote(lane, beat(0, 1)),  // 1900ms — 이전 구간
      makeTrillNote(lane, beat(1, 1)),  // 2000ms — 새 구간
    ];
    const noteTimesMs = new Map([
      [0, 1900], [1, 2000],
    ]);
    const noteEndTimesMs = new Map<number, number>();
    const trillZoneStartTimesMs = new Map<Lane, number[]>([
      [lane, [1500, 2000]],
    ]);

    const { engine, judgments } = setup(notes, noteTimesMs, noteEndTimesMs, undefined, trillZoneStartTimesMs);

    engine.update(1500);
    engine.update(2000);

    // 이전 구간 노트를 늦게 입력 — 판정은 정상 (Bad, delta=110ms)
    engine.onLanePress(lane, 2010, "KeyA");

    expect(judgments).toHaveLength(1);
    // Good 윈도우 내이므로 판정이 발생 (delta=110ms)
    expect(judgments[0].noteIndex).toBe(0);
    expect(judgments[0].grade).toBe(JudgmentGrade.GOOD);
  });

  it("연속 트릴 구간에서 이전 구간 노트의 늦은 입력이 새 구간의 교대 판정을 오염시키지 않는다", () => {
    // 구간 1: 1000ms 시작, 마지막 노트 1900ms
    // 구간 2: 2000ms 시작, 노트 2000ms/2200ms
    // 구간 1의 마지막 노트(1900ms)를 2010ms에 KeyB로 입력 (delta=110ms, Bad 내)
    // → 새 구간의 교대 추적에 KeyB가 기록되지 않아야 함
    // → 새 구간 첫 노트(2000ms)를 KeyB로 입력해도 교대 성공
    const notes = [
      makeTrillNote(lane, beat(0, 1)),  // 1900ms — 구간 1 마지막
      makeTrillNote(lane, beat(1, 1)),  // 2000ms — 구간 2 첫 노트
      makeTrillNote(lane, beat(2, 1)),  // 2200ms — 구간 2 두 번째
    ];
    const noteTimesMs = new Map([
      [0, 1900], [1, 2000], [2, 2200],
    ]);
    const noteEndTimesMs = new Map<number, number>();
    const trillZoneStartTimesMs = new Map<Lane, number[]>([
      [lane, [1000, 2000]],
    ]);

    const { engine, judgments } = setup(notes, noteTimesMs, noteEndTimesMs, undefined, trillZoneStartTimesMs);

    engine.update(1000);
    engine.update(2000);

    // 이전 구간 마지막 노트를 늦게 입력 — KeyB (delta=110ms, Bad 내, 교대 추적 미기록)
    engine.onLanePress(lane, 2010, "KeyB");

    // 새 구간 첫 노트 — KeyB (이전 입력이 기록되지 않았으므로 교대 성공)
    engine.onLanePress(lane, 2020, "KeyB");

    // 새 구간 두 번째 — KeyA (교대 성공)
    engine.onLanePress(lane, 2200, "KeyA");

    expect(judgments).toHaveLength(3);
    expect(judgments[0].grade).toBe(JudgmentGrade.GOOD); // 이전 구간 노트 — 늦은 입력 (delta=110ms)
    expect(judgments[1].grade).toBe(JudgmentGrade.PERFECT); // Good◇ 아님
    expect(judgments[2].grade).toBe(JudgmentGrade.PERFECT); // 교대 성공
  });
});

describe("더블 롱노트 2키 독립 홀드 추적", () => {
  const lane: Lane = 1;

  it("2키 모두 유지하면 바디가 정상 활성 상태를 유지한다", () => {
    const notes = [makeDoubleLongNote(lane, beat(0, 1), beat(4, 1))];
    const startMs = 0;
    const endMs = 2000;
    const noteTimesMs = new Map([[0, startMs]]);
    const noteEndTimesMs = new Map([[0, endMs]]);

    const { engine, judgments } = setup(notes, noteTimesMs, noteEndTimesMs);

    // 2키 누르기
    engine.onLanePress(lane, startMs, "KeyA");
    engine.onLanePress(lane, startMs + 5, "KeyB");

    // 바디 활성화
    engine.update(startMs);

    // 중간 시점까지 유지
    engine.update(startMs + 1000);

    // 부분 실패 판정 없음
    expect(judgments.length).toBe(0);
  });

  it("1키 릴리즈 후 grace period(12ms) 초과 시 해당 키만 부분 실패", () => {
    const notes = [makeDoubleLongNote(lane, beat(0, 1), beat(4, 1))];
    const startMs = 0;
    const endMs = 2000;
    const noteTimesMs = new Map([[0, startMs]]);
    const noteEndTimesMs = new Map([[0, endMs]]);

    const { engine, judgments } = setup(notes, noteTimesMs, noteEndTimesMs);

    engine.onLanePress(lane, startMs, "KeyA");
    engine.onLanePress(lane, startMs + 5, "KeyB");

    engine.update(startMs);
    engine.update(startMs + 500);

    // KeyA 릴리즈
    engine.onLaneRelease(lane, startMs + 500, "KeyA");

    // grace period 내 — 아직 실패 아님
    engine.update(startMs + 510);
    expect(judgments.length).toBe(0);

    // grace period 초과 (12ms 이상)
    engine.update(startMs + 520);

    expect(judgments.length).toBe(1);
    expect(judgments[0].grade).toBe(JudgmentGrade.MISS);
    expect(judgments[0].isPartialBodyFail).toBe(true);
  });

  it("1키 실패 후 나머지 1키가 유지되면 노트는 BODY_ACTIVE 유지", () => {
    const notes = [makeDoubleLongNote(lane, beat(0, 1), beat(4, 1))];
    const startMs = 0;
    const endMs = 2000;
    const noteTimesMs = new Map([[0, startMs]]);
    const noteEndTimesMs = new Map([[0, endMs]]);

    const { engine, judgments } = setup(notes, noteTimesMs, noteEndTimesMs);

    engine.onLanePress(lane, startMs, "KeyA");
    engine.onLanePress(lane, startMs + 5, "KeyB");

    engine.update(startMs);
    engine.update(startMs + 500);

    // KeyA 릴리즈 → grace period 초과
    engine.onLaneRelease(lane, startMs + 500, "KeyA");
    engine.update(startMs + 520);

    // 부분 실패 1회
    expect(judgments.length).toBe(1);
    expect(judgments[0].isPartialBodyFail).toBe(true);

    // KeyB는 계속 유지 → 추가 실패 없음
    engine.update(startMs + 1000);
    expect(judgments.length).toBe(1);
  });

  it("양쪽 키 모두 릴리즈 시 전체 BODY_FAILED", () => {
    const notes = [makeDoubleLongNote(lane, beat(0, 1), beat(4, 1))];
    const startMs = 0;
    const endMs = 2000;
    const noteTimesMs = new Map([[0, startMs]]);
    const noteEndTimesMs = new Map([[0, endMs]]);

    const { engine, judgments } = setup(notes, noteTimesMs, noteEndTimesMs);

    engine.onLanePress(lane, startMs, "KeyA");
    engine.onLanePress(lane, startMs + 5, "KeyB");

    engine.update(startMs);
    engine.update(startMs + 500);

    // KeyA 릴리즈 → 부분 실패
    engine.onLaneRelease(lane, startMs + 500, "KeyA");
    engine.update(startMs + 520);

    expect(judgments.length).toBe(1);
    expect(judgments[0].isPartialBodyFail).toBe(true);

    // KeyB도 릴리즈 → 전체 실패
    engine.onLaneRelease(lane, startMs + 600, "KeyB");
    engine.update(startMs + 620);

    expect(judgments.length).toBe(2);
    expect(judgments[1].grade).toBe(JudgmentGrade.MISS);
    expect(judgments[1].isPartialBodyFail).toBeUndefined();
  });

  it("1키 릴리즈 후 grace period 내 재입력 시 실패하지 않는다", () => {
    const notes = [makeDoubleLongNote(lane, beat(0, 1), beat(4, 1))];
    const startMs = 0;
    const endMs = 2000;
    const noteTimesMs = new Map([[0, startMs]]);
    const noteEndTimesMs = new Map([[0, endMs]]);

    const { engine, judgments } = setup(notes, noteTimesMs, noteEndTimesMs);

    engine.onLanePress(lane, startMs, "KeyA");
    engine.onLanePress(lane, startMs + 5, "KeyB");

    engine.update(startMs);
    engine.update(startMs + 500);

    // KeyA 릴리즈
    engine.onLaneRelease(lane, startMs + 500, "KeyA");

    // grace period 내 재입력 (10ms < 12ms)
    engine.onLanePress(lane, startMs + 510, "KeyA");

    // grace period 이후 체크 — 재입력 되었으므로 실패 아님
    engine.update(startMs + 520);

    expect(judgments.length).toBe(0);
  });

  it("더블 롱노트에서 끝점 도달 시 키 유지 중이면 릴리즈 대기 후 정상 종결 판정", () => {
    const notes = [makeDoubleLongNote(lane, beat(0, 1), beat(4, 1))];
    const startMs = 0;
    const endMs = 2000;
    const noteTimesMs = new Map([[0, startMs]]);
    const noteEndTimesMs = new Map([[0, endMs]]);

    const { engine, judgments } = setup(notes, noteTimesMs, noteEndTimesMs);

    engine.onLanePress(lane, startMs, "KeyA");
    engine.onLanePress(lane, startMs + 5, "KeyB");

    engine.update(startMs);
    engine.update(endMs);

    // 끝점 도달 후 릴리즈
    engine.onLaneRelease(lane, endMs + 30, "KeyA");

    expect(judgments.length).toBe(1);
    expect(judgments[0].grade).toBe(JudgmentGrade.PERFECT);
  });
});

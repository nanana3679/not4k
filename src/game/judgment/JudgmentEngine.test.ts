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

  // o-o(롱 + 끝점 단노트) 종결 귀속 — 종결 트리거는 키 단위 release 이벤트다(레인 비움 아님).
  // 논쟁 판정(입장 B): L은 그것을 잡던 키(a)의 release로 종결되며, T를 친 b의 held 여부와 무관.
  it("o-o: b를 누른 채 a를 끝점 윈도우 내 release하면 L 종결 Perfect (키 단위 종결)", () => {
    const lane: Lane = 1;
    const endMs = 2000;
    const notes: NoteEntity[] = [makeLongNote(lane, beat(0, 1), beat(8, 1)), makeSingleNote(lane, beat(8, 1))];
    const { engine, judgments } = setup(notes, new Map([[0, 1000], [1, endMs]]), new Map([[0, endMs]]));
    engine.onLanePress(lane, 1000, "KeyA"); // L 유지
    engine.update(1000);
    engine.update(endMs);
    engine.onLanePress(lane, endMs, "KeyB"); // T 탭 (keydown)
    engine.onLaneRelease(lane, endMs + 10, "KeyA"); // a release (b 아직 눌림) → L 종결
    expect(judgments.find((j) => j.noteIndex === 0)?.grade).toBe(JudgmentGrade.PERFECT);
    expect(judgments.find((j) => j.noteIndex === 1)?.grade).toBe(JudgmentGrade.PERFECT); // T
  });

  it("o-o: a를 끝점에 release 후 b를 윈도우 밖까지 held → L은 a-release에 이미 종결(Miss 아님)", () => {
    const lane: Lane = 1;
    const endMs = 2000;
    const notes: NoteEntity[] = [makeLongNote(lane, beat(0, 1), beat(8, 1)), makeSingleNote(lane, beat(8, 1))];
    const { engine, judgments } = setup(notes, new Map([[0, 1000], [1, endMs]]), new Map([[0, endMs]]));
    engine.onLanePress(lane, 1000, "KeyA");
    engine.update(1000);
    engine.update(endMs);
    engine.onLanePress(lane, endMs, "KeyB"); // T 탭
    engine.onLaneRelease(lane, endMs, "KeyA"); // a를 끝점에 release → L 종결
    engine.update(endMs + 1000); // b를 안 뗀 채 시간 경과해도 추가 판정 없음
    const l = judgments.filter((j) => j.noteIndex === 0);
    expect(l.length).toBe(1);
    expect(l[0].grade).toBe(JudgmentGrade.PERFECT); // 타임아웃 Miss로 안 떨어짐
  });

  it("진짜 릴리즈탭(b를 press+release 탭) → L Perfect (게이트 없이도)", () => {
    const lane: Lane = 1;
    const endMs = 2000;
    const notes: NoteEntity[] = [makeLongNote(lane, beat(0, 1), beat(8, 1)), makeSingleNote(lane, beat(8, 1))];
    const { engine, judgments } = setup(notes, new Map([[0, 1000], [1, endMs]]), new Map([[0, endMs]]));
    engine.onLanePress(lane, 1000, "KeyA");
    engine.update(1000);
    engine.update(endMs);
    engine.onLanePress(lane, endMs, "KeyB"); // T 탭 press
    engine.onLaneRelease(lane, endMs + 5, "KeyB"); // T 탭 release
    engine.onLaneRelease(lane, endMs + 10, "KeyA"); // L 유지 키 release
    expect(judgments.find((j) => j.noteIndex === 0)?.grade).toBe(JudgmentGrade.PERFECT);
    expect(judgments.find((j) => j.noteIndex === 1)?.grade).toBe(JudgmentGrade.PERFECT);
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
    expect(judgments[0].failedSide).toBe('left');
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
    expect(judgments[0].failedSide).toBe('left');

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
    expect(judgments[0].failedSide).toBe('left');

    // KeyB도 릴리즈 → 나머지 키도 부분 Miss (키별 1회씩, 총 2판정)
    engine.onLaneRelease(lane, startMs + 600, "KeyB");
    engine.update(startMs + 620);

    expect(judgments.length).toBe(2);
    expect(judgments[1].grade).toBe(JudgmentGrade.MISS);
    expect(judgments[1].isPartialBodyFail).toBe(true);
    expect(judgments[1].failedSide).toBe('right');
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

describe("hold-only 싱글 롱노트 끝점 판정", () => {
  const lane: Lane = 1;
  const startMs = 0;
  const endMs = 2000;

  /** 테스트 헬퍼: hold-only 싱글 롱노트 생성 */
  function makeHoldOnlyLongNote(l: Lane, b: Beat, endBeat: Beat): NoteEntity {
    return { type: NoteType.LONG, lane: l, beat: b, endBeat, holdOnly: true } as NoteEntity;
  }

  function holdOnlySetup() {
    const notes = [makeHoldOnlyLongNote(lane, beat(0, 1), beat(4, 1))];
    const noteTimesMs = new Map([[0, startMs]]);
    const noteEndTimesMs = new Map([[0, endMs]]);
    return setup(notes, noteTimesMs, noteEndTimesMs);
  }

  it("끝점까지 홀드를 유지하면 떼지 않아도 끝점 시점에 Perfect", () => {
    const { engine, judgments } = holdOnlySetup();
    engine.onLanePress(lane, startMs, "KeyA");
    engine.update(startMs);
    engine.update(startMs + 1000);
    engine.update(endMs); // 끝점 도달, 키 유지 중 — 릴리즈 없이 즉시 판정

    expect(judgments.length).toBe(1);
    expect(judgments[0].grade).toBe(JudgmentGrade.PERFECT);
  });

  it("끝점을 지나 계속 눌러도 Perfect는 1회만 발생", () => {
    const { engine, judgments } = holdOnlySetup();
    engine.onLanePress(lane, startMs, "KeyA");
    engine.update(startMs);
    engine.update(endMs);
    engine.update(endMs + 500); // 안 떼고 계속 유지

    expect(judgments.length).toBe(1);
    expect(judgments[0].grade).toBe(JudgmentGrade.PERFECT);
  });

  it("끝점 전 Good 윈도우(-50ms)에 떼면 그 릴리즈 시점에 Perfect", () => {
    const { engine, judgments } = holdOnlySetup();
    engine.onLanePress(lane, startMs, "KeyA");
    engine.update(startMs);
    engine.update(startMs + 1000);
    engine.onLaneRelease(lane, endMs - 50, "KeyA"); // 끝점 전 Good 윈도우 내 릴리즈

    expect(judgments.length).toBe(1);
    expect(judgments[0].grade).toBe(JudgmentGrade.PERFECT);
  });

  it("바디 유예시간(12ms) 초과 릴리즈 시 끝점 Miss — 유지 판정은 면제되지 않음", () => {
    const { engine, judgments } = holdOnlySetup();
    engine.onLanePress(lane, startMs, "KeyA");
    engine.update(startMs);
    engine.update(startMs + 500);
    engine.onLaneRelease(lane, startMs + 500, "KeyA"); // 바디 중간 릴리즈
    engine.update(startMs + 520); // 유예 시간 초과

    expect(judgments.length).toBe(1);
    expect(judgments[0].grade).toBe(JudgmentGrade.MISS);
  });

  it("일반 롱노트는 끝점 유지 시 릴리즈를 기다리지만 hold-only는 즉시 Perfect", () => {
    const noteTimesMs = new Map([[0, startMs]]);
    const noteEndTimesMs = new Map([[0, endMs]]);

    // 대조군: 일반 롱노트 — 끝점에서 키 유지 중이면 릴리즈 대기(판정 없음)
    const normal = setup([makeLongNote(lane, beat(0, 1), beat(4, 1))], noteTimesMs, noteEndTimesMs);
    normal.engine.onLanePress(lane, startMs, "KeyA");
    normal.engine.update(startMs);
    normal.engine.update(endMs);
    expect(normal.judgments.length).toBe(0);

    // hold-only: 같은 상황에서 즉시 Perfect
    const ho = holdOnlySetup();
    ho.engine.onLanePress(lane, startMs, "KeyA");
    ho.engine.update(startMs);
    ho.engine.update(endMs);
    expect(ho.judgments.length).toBe(1);
    expect(ho.judgments[0].grade).toBe(JudgmentGrade.PERFECT);
  });
});

describe("hold-only 길이 0 (슬라이드형) 판정", () => {
  const lane: Lane = 1;
  const noteTime = 1000;

  /** 테스트 헬퍼: 길이 0 hold-only(슬라이드) 노트 생성 */
  function makeSlideNote(l: Lane, b: Beat): NoteEntity {
    return { type: NoteType.LONG, lane: l, beat: b, endBeat: b, holdOnly: true } as NoteEntity;
  }

  function slideSetup() {
    const notes = [makeSlideNote(lane, beat(0, 1))];
    const noteTimesMs = new Map([[0, noteTime]]);
    const noteEndTimesMs = new Map([[0, noteTime]]); // 길이 0: 시작 = 끝
    return setup(notes, noteTimesMs, noteEndTimesMs);
  }

  it("이전부터 눌러 노트 시점에 held이면 새 입력 없이 노트 시점에 Perfect", () => {
    const { engine, judgments } = slideSetup();
    engine.onLanePress(lane, 800, "KeyA"); // 윈도우 진입 전부터 누르고 유지
    engine.update(noteTime); // 노트 시점 — 여전히 held → keydown 소비 없이 통과
    expect(judgments.length).toBe(1);
    expect(judgments[0].grade).toBe(JudgmentGrade.PERFECT);
  });

  it("노트 시점 전 Good 윈도우(-50ms)에 떼면 떼는 시점에 Perfect", () => {
    const { engine, judgments } = slideSetup();
    engine.onLanePress(lane, noteTime - 100, "KeyA");
    engine.onLaneRelease(lane, noteTime - 50, "KeyA"); // 노트 시점 전, 윈도우 내 완전 릴리즈
    expect(judgments.length).toBe(1);
    expect(judgments[0].grade).toBe(JudgmentGrade.PERFECT);
  });

  it("노트 시점 이후 Good 윈도우(+50ms)에 처음 누르면 Perfect", () => {
    const { engine, judgments } = slideSetup();
    engine.update(noteTime); // 아직 안 눌림 — 판정 없음
    expect(judgments.length).toBe(0);
    engine.onLanePress(lane, noteTime + 50, "KeyA");
    engine.update(noteTime + 60);
    expect(judgments.length).toBe(1);
    expect(judgments[0].grade).toBe(JudgmentGrade.PERFECT);
  });

  it("Good 윈도우 내내 한 번도 누르지 않으면 Miss", () => {
    const { engine, judgments } = slideSetup();
    engine.update(noteTime);
    engine.update(noteTime + 130); // Good 윈도우(+120ms) 초과
    expect(judgments.length).toBe(1);
    expect(judgments[0].grade).toBe(JudgmentGrade.MISS);
  });

  it("Good 윈도우 밖(-150ms)에 떼면 통과로 인정되지 않아 Miss", () => {
    const { engine, judgments } = slideSetup();
    engine.onLanePress(lane, noteTime - 200, "KeyA");
    engine.onLaneRelease(lane, noteTime - 150, "KeyA"); // 윈도우(-120ms) 밖에서 릴리즈
    expect(judgments.length).toBe(0); // 릴리즈 시점 판정 없음
    engine.update(noteTime + 130);
    expect(judgments.length).toBe(1);
    expect(judgments[0].grade).toBe(JudgmentGrade.MISS);
  });
});

describe("헤드 없는 슬라이드 keydown 흡수 — 직후 포인트 보호 (RFD 0006)", () => {
  const lane: Lane = 1;
  const slideTime = 1000;
  const pointTime = 1100;

  function makeSlideNote(l: Lane, b: Beat): NoteEntity {
    return { type: NoteType.LONG, lane: l, beat: b, endBeat: b, holdOnly: true } as NoteEntity;
  }

  /** 슬라이드(idx0, 1000ms) + 직후 포인트(idx1, 1100ms) */
  function slideThenPointSetup() {
    const notes = [makeSlideNote(lane, beat(0, 1)), makeSingleNote(lane, beat(1, 1))];
    const noteTimesMs = new Map([[0, slideTime], [1, pointTime]]);
    const noteEndTimesMs = new Map([[0, slideTime]]); // 슬라이드만 끝시각(=시작) 보유
    return setup(notes, noteTimesMs, noteEndTimesMs);
  }

  it("슬라이드를 입력 1번으로 탭하면 그 keydown은 슬라이드만 흡수하고 직후 포인트는 판정되지 않음", () => {
    const { engine, judgments } = slideThenPointSetup();
    engine.onLanePress(lane, slideTime, "KeyA");
    engine.update(slideTime + 10);
    expect(judgments.length).toBe(1);
    expect(judgments[0].noteIndex).toBe(0);
    expect(judgments[0].grade).toBe(JudgmentGrade.PERFECT);
  });

  it("슬라이드만 탭하고 포인트를 안 치면 포인트는 자기 윈도우 종료 시 Miss", () => {
    const { engine, judgments } = slideThenPointSetup();
    engine.onLanePress(lane, slideTime, "KeyA");
    engine.update(pointTime + 170); // 포인트 1100 + Bad 160 초과
    const pointJ = judgments.find((j) => j.noteIndex === 1);
    expect(pointJ?.grade).toBe(JudgmentGrade.MISS);
  });

  it("슬라이드 시점에 서로 다른 두 키를 누르면 1번째는 슬라이드, 2번째는 직후 포인트로 early Good(-100)", () => {
    const { engine, judgments } = slideThenPointSetup();
    engine.onLanePress(lane, slideTime, "KeyA"); // 슬라이드 흡수
    engine.onLanePress(lane, slideTime, "KeyB"); // 슬라이드 흡수 종료됨 → 포인트로
    engine.update(slideTime + 10);
    const slideJ = judgments.find((j) => j.noteIndex === 0);
    expect(slideJ?.grade).toBe(JudgmentGrade.PERFECT);
    const pointJ = judgments.find((j) => j.noteIndex === 1);
    expect(pointJ?.grade).toBe(JudgmentGrade.GOOD);
    expect(pointJ?.deltaMs).toBe(-100);
  });

  it("a를 미리 눌러 슬라이드 시점에 held이면 슬라이드는 a로 충족되고 b 입력은 포인트 early Good(-100)", () => {
    const { engine, judgments } = slideThenPointSetup();
    engine.onLanePress(lane, 800, "KeyA"); // 윈도우 밖에서 미리 누름 → 흡수 안 됨, held만
    engine.update(slideTime); // 노트 시점 held → 슬라이드 Perfect + 흡수 종료
    engine.onLanePress(lane, slideTime, "KeyB"); // 슬라이드는 이미 종료 → 포인트로
    const slideJ = judgments.find((j) => j.noteIndex === 0);
    expect(slideJ?.grade).toBe(JudgmentGrade.PERFECT);
    const pointJ = judgments.find((j) => j.noteIndex === 1);
    expect(pointJ?.grade).toBe(JudgmentGrade.GOOD);
    expect(pointJ?.deltaMs).toBe(-100);
  });

  it("a를 슬라이드 윈도우 안에서 미리(980ms) 떼면 슬라이드는 뗀 시점에 Perfect, b는 포인트 정타 Perfect", () => {
    const { engine, judgments } = slideThenPointSetup();
    engine.onLanePress(lane, 900, "KeyA"); // 슬라이드 흡수
    engine.onLaneRelease(lane, 980, "KeyA"); // 노트 시점 직전 윈도우 내 완전 릴리즈
    engine.onLanePress(lane, pointTime, "KeyB"); // 포인트 정타
    const slideJ = judgments.find((j) => j.noteIndex === 0);
    expect(slideJ?.grade).toBe(JudgmentGrade.PERFECT);
    const pointJ = judgments.find((j) => j.noteIndex === 1);
    expect(pointJ?.grade).toBe(JudgmentGrade.PERFECT);
  });
});

describe("헤드 없는 길이>0 롱노트 흡수 — 직후 포인트 보호와 홀드 중 탭 (RFD 0006)", () => {
  const lane: Lane = 1;

  /** 헤드 없는 롱노트(idx0, 1000~2000) + 직후 포인트(idx1, 1100) */
  function headlessLongThenPointSetup() {
    const notes = [makeLongNote(lane, beat(0, 1), beat(8, 1)), makeSingleNote(lane, beat(1, 1))];
    const noteTimesMs = new Map([[0, 1000], [1, 1100]]);
    const noteEndTimesMs = new Map([[0, 2000]]);
    return setup(notes, noteTimesMs, noteEndTimesMs);
  }

  it("롱노트 시작 탭은 롱노트가 흡수해 직후 포인트로 새지 않고, 포인트는 자기 윈도우 종료 시 Miss", () => {
    const { engine, judgments } = headlessLongThenPointSetup();
    engine.onLanePress(lane, 1000, "KeyA"); // 롱노트 시작 (흡수)
    engine.update(1000);
    // 직후 포인트는 흡수 안 됨 — 아직 미판정 (early Good로 새지 않음)
    expect(judgments.some((j) => j.noteIndex === 1)).toBe(false);
    engine.update(1100 + 170); // 포인트 윈도우 종료 (롱노트는 계속 held)
    const pointJ = judgments.find((j) => j.noteIndex === 1);
    expect(pointJ?.grade).toBe(JudgmentGrade.MISS);
  });

  it("홀드 중(1500ms) 다른 키로 친 입력은 롱노트에 흡수되지 않고 같은 시점 포인트로 간다", () => {
    const notes = [makeLongNote(lane, beat(0, 1), beat(8, 1)), makeSingleNote(lane, beat(4, 1))];
    const noteTimesMs = new Map([[0, 1000], [1, 1500]]); // 포인트가 롱노트 홀드 구간 안
    const noteEndTimesMs = new Map([[0, 2000]]);
    const { engine, judgments } = setup(notes, noteTimesMs, noteEndTimesMs);
    engine.onLanePress(lane, 1000, "KeyA"); // 롱노트 시작
    engine.update(1000); // 롱노트 BODY_ACTIVE
    engine.onLanePress(lane, 1500, "KeyB"); // 홀드 중 탭 → 포인트로
    const pointJ = judgments.find((j) => j.noteIndex === 1);
    expect(pointJ?.grade).toBe(JudgmentGrade.PERFECT); // delta 0
  });
});

describe("헤드 있는 롱노트는 헤드만 흡수해 더블/직후 포인트 오흡수가 없다 (RFD 0006)", () => {
  const lane: Lane = 1;

  it("시작 시각에 헤드 포인트가 겹친 롱노트는 흡수 후보가 아니어서, keydown은 헤드만 판정하고 직후 포인트를 추가 흡수하지 않는다", () => {
    // idx0 = 롱노트(1000~3000), idx1 = 헤드 포인트(1000), idx2 = 직후 포인트(1100)
    const notes = [
      makeLongNote(lane, beat(0, 1), beat(8, 1)),
      makeSingleNote(lane, beat(0, 1)), // 헤드 (시작 시각 일치)
      makeSingleNote(lane, beat(1, 1)), // 직후 포인트
    ];
    const noteTimesMs = new Map([[0, 1000], [1, 1000], [2, 1100]]);
    const noteEndTimesMs = new Map([[0, 3000]]);
    const { engine, judgments } = setup(notes, noteTimesMs, noteEndTimesMs);
    engine.onLanePress(lane, 1000, "KeyA"); // 헤드(idx1) 판정
    engine.update(1000 + 10);
    // 헤드만 판정, 직후 포인트(idx2)는 미흡수
    expect(judgments.some((j) => j.noteIndex === 1)).toBe(true);
    expect(judgments.some((j) => j.noteIndex === 2)).toBe(false);
  });
});

describe("헤드 없는 더블 롱노트 2키 흡수 (RFD 0006)", () => {
  const lane: Lane = 1;

  /** 헤드 없는 더블 롱노트(idx0, 1000~2000) + 직후 포인트(idx1, 1100) */
  function headlessDoubleLongThenPointSetup() {
    const notes = [makeDoubleLongNote(lane, beat(0, 1), beat(8, 1)), makeSingleNote(lane, beat(1, 1))];
    const noteTimesMs = new Map([[0, 1000], [1, 1100]]);
    const noteEndTimesMs = new Map([[0, 2000]]);
    return setup(notes, noteTimesMs, noteEndTimesMs);
  }

  it("서로 다른 두 키를 시작 시각에 누르면 둘 다 흡수돼 직후 포인트는 보호되고, 셋째 입력이 포인트로 간다", () => {
    const { engine, judgments } = headlessDoubleLongThenPointSetup();
    engine.onLanePress(lane, 1000, "KeyA"); // 1키째 흡수 (미충족, 후보 유지)
    engine.onLanePress(lane, 1000, "KeyB"); // 2키째 흡수 (충족, 흡수 종료)
    engine.update(1000); // 더블 롱노트 BODY_ACTIVE (2키 추적)
    expect(judgments.some((j) => j.noteIndex === 1)).toBe(false); // 직후 포인트 보호
    engine.onLanePress(lane, 1100, "KeyC"); // 흡수 종료된 뒤 → 포인트로
    expect(judgments.find((j) => j.noteIndex === 1)?.grade).toBe(JudgmentGrade.PERFECT); // delta 0
  });

  it("첫 keydown 하나만으로는 흡수 종료되지 않아 둘째 keydown도 더블 롱노트가 흡수한다 (포인트로 안 샘)", () => {
    const { engine, judgments } = headlessDoubleLongThenPointSetup();
    engine.onLanePress(lane, 1000, "KeyA"); // 1키째 — 아직 미충족
    engine.onLanePress(lane, 1000, "KeyB"); // 더블 롱노트(1000)가 포인트(1100)보다 이르므로 둘째도 흡수
    engine.update(1010);
    // 만약 1키만으로 흡수 종료됐다면 둘째가 포인트로 새 early Good이 떴을 것 — 떠선 안 됨
    expect(judgments.some((j) => j.noteIndex === 1)).toBe(false);
  });

  it("같은 키를 두 번 누르면 흡수 키 수가 1로 유지되어 흡수 종료되지 않는다", () => {
    const { engine, judgments } = headlessDoubleLongThenPointSetup();
    engine.onLanePress(lane, 1000, "KeyA"); // 1키째
    engine.onLanePress(lane, 1000, "KeyA"); // 같은 키 — 집합 크기 1 유지(무효)
    engine.onLanePress(lane, 1000, "KeyB"); // 2키째(다른 키) → 흡수 종료
    engine.update(1000);
    expect(judgments.some((j) => j.noteIndex === 1)).toBe(false); // 포인트 보호 유지
    engine.onLanePress(lane, 1100, "KeyC"); // 흡수 종료 후 → 포인트
    expect(judgments.find((j) => j.noteIndex === 1)?.grade).toBe(JudgmentGrade.PERFECT);
  });

  it("비동시 2키 입력(A를 떼고 B)이어도 두 keydown을 흡수해 직후 포인트를 보호한다 (더블 홀드 자체는 비동시라 부분 실패)", () => {
    const { engine, judgments } = headlessDoubleLongThenPointSetup();
    engine.onLanePress(lane, 1000, "KeyA"); // 1키째 흡수
    engine.onLaneRelease(lane, 1005, "KeyA"); // A를 뗌 (비동시)
    engine.onLanePress(lane, 1008, "KeyB"); // 2키째 흡수 — 포인트로 새지 않음
    engine.update(1010); // 더블 롱노트 활성화 (동시 2키 아님)
    expect(judgments.some((j) => j.noteIndex === 1)).toBe(false); // 직후 포인트 보호
    engine.update(1100 + 170); // 포인트 윈도우 종료
    // 두 keydown이 모두 흡수돼 포인트는 early로 안 새고, 안 쳐서 Miss (보호 성립)
    expect(judgments.find((j) => j.noteIndex === 1)?.grade).toBe(JudgmentGrade.MISS);
  });

  it("더블 헤드(D)가 있는 더블 롱노트는 흡수 후보가 아니어서 헤드가 입력을 받고 직후 포인트는 미흡수", () => {
    // idx0 = 더블 롱노트(1000~2000), idx1 = 더블 헤드(1000), idx2 = 직후 포인트(1100)
    const notes = [
      makeDoubleLongNote(lane, beat(0, 1), beat(8, 1)),
      { type: NoteType.DOUBLE, lane, beat: beat(0, 1) } as NoteEntity, // 더블 헤드(시작 시각 일치)
      makeSingleNote(lane, beat(1, 1)),
    ];
    const noteTimesMs = new Map([[0, 1000], [1, 1000], [2, 1100]]);
    const noteEndTimesMs = new Map([[0, 2000]]);
    const { engine, judgments } = setup(notes, noteTimesMs, noteEndTimesMs);
    engine.onLanePress(lane, 1000, "KeyA"); // 더블 헤드(idx1) 첫 입력
    engine.update(1000 + 10);
    expect(judgments.some((j) => j.noteIndex === 1)).toBe(true); // 헤드가 받음
    expect(judgments.some((j) => j.noteIndex === 2)).toBe(false); // 직후 포인트 미흡수
  });
});

describe("릴리즈 노트(길이 0 일반) keydown 흡수 — 직후 포인트 보호 (RFD 0006)", () => {
  const lane: Lane = 1;

  /** 릴리즈 노트(idx0, 1000, 길이0 non-holdOnly) + 직후 포인트(idx1, 1100) */
  function releaseThenPointSetup() {
    const notes = [makeLongNote(lane, beat(0, 1), beat(0, 1)), makeSingleNote(lane, beat(1, 1))];
    const noteTimesMs = new Map([[0, 1000], [1, 1100]]);
    const noteEndTimesMs = new Map([[0, 1000]]); // 길이 0
    return setup(notes, noteTimesMs, noteEndTimesMs);
  }

  it("누르고 떼는 릴리즈 노트: keydown은 릴리즈 노트가 흡수하고 keyup으로 판정, 직후 포인트는 보호된다", () => {
    const { engine, judgments } = releaseThenPointSetup();
    engine.onLanePress(lane, 1000, "KeyA"); // keydown 흡수 (판정 emit 없음)
    engine.update(1000); // 길이0 일반 → BODY_AWAITING_RELEASE
    engine.onLaneRelease(lane, 1010, "KeyA"); // keyup → 종결 판정
    expect(judgments.find((j) => j.noteIndex === 0)?.grade).toBe(JudgmentGrade.PERFECT); // delta +10
    expect(judgments.some((j) => j.noteIndex === 1)).toBe(false); // 포인트 미흡수
    engine.onLanePress(lane, 1100, "KeyB"); // 흡수 종료 후 → 포인트 정타
    expect(judgments.find((j) => j.noteIndex === 1)?.grade).toBe(JudgmentGrade.PERFECT);
  });
});

describe("더블 hold-only 롱노트 (길이 > 0) 판정 — 병렬 (RFD 0005)", () => {
  const lane: Lane = 1;
  const startMs = 1000;
  const endMs = 2000;

  function makeDoubleHoldOnly(l: Lane, b: Beat, endBeat: Beat): NoteEntity {
    return { type: NoteType.DOUBLE_LONG, lane: l, beat: b, endBeat, holdOnly: true } as NoteEntity;
  }

  function doubleHoldOnlySetup() {
    const notes = [makeDoubleHoldOnly(lane, beat(0, 1), beat(8, 1))];
    const noteTimesMs = new Map([[0, startMs]]);
    const noteEndTimesMs = new Map([[0, endMs]]);
    return setup(notes, noteTimesMs, noteEndTimesMs);
  }

  it("2키를 끝까지 유지하면 끝점에 Perfect 2회 (키별, 떼는 판정 면제)", () => {
    const { engine, judgments } = doubleHoldOnlySetup();
    engine.onLanePress(lane, startMs, "KeyA");
    engine.onLanePress(lane, startMs + 5, "KeyB");
    engine.update(startMs + 10); // 2키 추적 활성화
    engine.update(endMs); // 끝점 — 2키 유지 중
    expect(judgments.length).toBe(2);
    expect(judgments.every((j) => j.grade === JudgmentGrade.PERFECT)).toBe(true);
  });

  it("1키만 누르면 미입력 쪽은 부분 Miss, 누른 키는 끝점에 Perfect (병렬)", () => {
    const { engine, judgments } = doubleHoldOnlySetup();
    engine.onLanePress(lane, startMs, "KeyA"); // KeyB 미입력
    engine.update(startMs + 10);
    engine.update(startMs + 130); // 시작 Good 윈도우 초과 → 미입력 쪽 부분 Miss
    expect(judgments.some((j) => j.isPartialBodyFail && j.failedSide === 'right')).toBe(true);
    engine.update(endMs); // 끝점 — KeyA 유지 중 → Perfect
    expect(judgments.some((j) => j.grade === JudgmentGrade.PERFECT)).toBe(true);
  });

  it("2키 유지 중 1키를 떼고 grace 초과하면 그 키만 부분 Miss, 나머지는 끝점 Perfect", () => {
    const { engine, judgments } = doubleHoldOnlySetup();
    engine.onLanePress(lane, startMs, "KeyA");
    engine.onLanePress(lane, startMs + 5, "KeyB");
    engine.update(startMs + 10);
    engine.onLaneRelease(lane, startMs + 500, "KeyA"); // A 뗌
    engine.update(startMs + 520); // grace 초과 → A 부분 Miss
    expect(judgments.some((j) => j.isPartialBodyFail && j.failedSide === 'left')).toBe(true);
    engine.update(endMs); // B 유지 → Perfect
    expect(judgments.some((j) => j.grade === JudgmentGrade.PERFECT)).toBe(true);
  });

  it("2키 모두 떼고 grace 초과하면 전체 Miss (Perfect 없음)", () => {
    const { engine, judgments } = doubleHoldOnlySetup();
    engine.onLanePress(lane, startMs, "KeyA");
    engine.onLanePress(lane, startMs + 5, "KeyB");
    engine.update(startMs + 10);
    engine.onLaneRelease(lane, startMs + 500, "KeyA");
    engine.onLaneRelease(lane, startMs + 502, "KeyB");
    engine.update(startMs + 520); // 둘 다 grace 초과
    engine.update(endMs);
    expect(judgments.length).toBeGreaterThan(0);
    expect(judgments.every((j) => j.grade === JudgmentGrade.MISS)).toBe(true);
  });
});

describe("더블롱(일반) 끝점 키별 2판정 (목표 — 스펙 §146 / 분할 릴리즈)", () => {
  const lane: Lane = 1;
  const startMs = 1000;
  const endMs = 2000;

  function makeDoubleLong(l: Lane, b: Beat, endBeat: Beat): NoteEntity {
    return { type: NoteType.DOUBLE_LONG, lane: l, beat: b, endBeat } as NoteEntity;
  }
  function setupDL() {
    return setup([makeDoubleLong(lane, beat(0, 1), beat(8, 1))], new Map([[0, startMs]]), new Map([[0, endMs]]));
  }
  const dlOf = (judgments: JudgmentResult[]) => judgments.filter((j) => j.noteIndex === 0);

  it("2키를 끝까지 유지하다 끝점에 둘 다 떼면 Perfect 2개", () => {
    const { engine, judgments } = setupDL();
    engine.onLanePress(lane, startMs, "KeyA");
    engine.onLanePress(lane, startMs + 5, "KeyB");
    engine.update(startMs + 10); // 2키 추적 활성화
    engine.update(endMs); // 끝점 도달, 2키 유지 중
    engine.onLaneRelease(lane, endMs, "KeyA"); // 끝점에 A 종결
    engine.onLaneRelease(lane, endMs + 5, "KeyB"); // 끝점에 B 종결
    const dl = dlOf(judgments);
    expect(dl.length).toBe(2);
    expect(dl.every((j) => j.grade === JudgmentGrade.PERFECT)).toBe(true);
  });

  it("한 키만 끝점에 떼고 다른 키는 안 떼면(끝까지 유지) 안 뗀 키는 Miss — 누락됐던 Miss", () => {
    const { engine, judgments } = setupDL();
    engine.onLanePress(lane, startMs, "KeyA");
    engine.onLanePress(lane, startMs + 5, "KeyB");
    engine.update(startMs + 10);
    engine.update(endMs);
    engine.onLaneRelease(lane, endMs, "KeyA"); // A만 정상 종결, B는 계속 유지(안 뗌)
    engine.update(endMs + 1000); // B는 end+BAD 타임아웃까지 안 뗌
    const dl = dlOf(judgments);
    expect(dl.length).toBe(2);
    expect(dl.some((j) => j.grade === JudgmentGrade.PERFECT)).toBe(true); // A
    expect(dl.some((j) => j.grade === JudgmentGrade.MISS)).toBe(true); // B (끝점 윈도우 내 미릴리즈)
  });

  it("바디에서 한 키 이탈(grace 초과) + 다른 키 끝점 종결 = 총 2판정 (Miss + Perfect)", () => {
    const { engine, judgments } = setupDL();
    engine.onLanePress(lane, startMs, "KeyA");
    engine.onLanePress(lane, startMs + 5, "KeyB");
    engine.update(startMs + 10);
    engine.onLaneRelease(lane, startMs + 500, "KeyA"); // A 바디 이탈
    engine.update(startMs + 520); // grace 초과 → A 부분 Miss
    engine.update(endMs);
    engine.onLaneRelease(lane, endMs, "KeyB"); // B 종결
    const dl = dlOf(judgments);
    expect(dl.length).toBe(2);
    expect(dl.some((j) => j.grade === JudgmentGrade.MISS)).toBe(true);
    expect(dl.some((j) => j.grade === JudgmentGrade.PERFECT)).toBe(true);
  });

  it("한 번도 안 누른 더블롱은 두 키 모두 Miss (키별 2판정, 채점 분모와 일치)", () => {
    const { engine, judgments } = setupDL();
    engine.update(startMs); // BODY_ACTIVE 승격(키 없음)
    engine.update(startMs + 200); // 시작 Good 윈도우 초과 → 미입력 실패
    const dl = dlOf(judgments);
    expect(dl.length).toBe(2);
    expect(dl.every((j) => j.grade === JudgmentGrade.MISS)).toBe(true);
  });
});

describe("더블 hold-only 슬라이드 (길이 0) — 2키 동시 필요", () => {
  const lane: Lane = 1;
  const noteTime = 1000;

  function makeDoubleSlide(l: Lane, b: Beat): NoteEntity {
    return { type: NoteType.DOUBLE_LONG, lane: l, beat: b, endBeat: b, holdOnly: true } as NoteEntity;
  }

  function doubleSlideSetup() {
    const notes = [makeDoubleSlide(lane, beat(0, 1))];
    const noteTimesMs = new Map([[0, noteTime]]);
    const noteEndTimesMs = new Map([[0, noteTime]]);
    return setup(notes, noteTimesMs, noteEndTimesMs);
  }

  it("2키가 동시에 눌려 있으면 노트 시점에 Perfect 2개 (키별)", () => {
    const { engine, judgments } = doubleSlideSetup();
    engine.onLanePress(lane, noteTime - 50, "KeyA");
    engine.onLanePress(lane, noteTime - 45, "KeyB");
    engine.update(noteTime);
    expect(judgments.length).toBe(2);
    expect(judgments.every((j) => j.grade === JudgmentGrade.PERFECT)).toBe(true);
  });

  it("1키만 눌려 있으면 그 키 Perfect + 나머지 Miss (키별 2판정)", () => {
    const { engine, judgments } = doubleSlideSetup();
    engine.onLanePress(lane, noteTime - 50, "KeyA"); // KeyB 없음
    engine.update(noteTime);
    expect(judgments.length).toBe(0); // 아직 Good 윈도우 내
    engine.update(noteTime + 130); // Good 윈도우 초과 → 타임아웃
    expect(judgments.length).toBe(2);
    expect(judgments.some((j) => j.grade === JudgmentGrade.PERFECT)).toBe(true);
    expect(judgments.some((j) => j.grade === JudgmentGrade.MISS)).toBe(true);
  });

  it("2키 눌렀다가 1키를 노트 시점 전에 떼면 남은 키 Perfect + 뗀 키 Miss (키별)", () => {
    const { engine, judgments } = doubleSlideSetup();
    engine.onLanePress(lane, noteTime - 80, "KeyA");
    engine.onLanePress(lane, noteTime - 75, "KeyB");
    engine.onLaneRelease(lane, noteTime - 30, "KeyA"); // A를 노트 시점 전에 뗌
    engine.update(noteTime); // B만 유지
    engine.update(noteTime + 130);
    expect(judgments.length).toBe(2);
    expect(judgments.some((j) => j.grade === JudgmentGrade.PERFECT)).toBe(true);
    expect(judgments.some((j) => j.grade === JudgmentGrade.MISS)).toBe(true);
  });

  it("1키 흡수 후 update가 끼어도 둘째 키는 더블 슬라이드가 흡수하고 직후 포인트로 새지 않는다", () => {
    // 더블 슬라이드(idx0, 1000) + 직후 포인트(idx1, 1100). held-marker가 1키만으로 흡수 종료시키면 누설.
    const notes = [makeDoubleSlide(lane, beat(0, 1)), makeSingleNote(lane, beat(1, 1))];
    const noteTimesMs = new Map([[0, noteTime], [1, 1100]]);
    const noteEndTimesMs = new Map([[0, noteTime]]);
    const { engine, judgments } = setup(notes, noteTimesMs, noteEndTimesMs);
    engine.onLanePress(lane, noteTime, "KeyA"); // 1키 흡수 (size 1 < 2)
    engine.update(noteTime - 10); // held-marker: 1키만이라 미충족 → 조기 흡수 종료 없음
    engine.onLanePress(lane, noteTime, "KeyB"); // 둘째 키 → 더블 슬라이드가 흡수
    engine.update(noteTime + 10); // 2키 동시 → Perfect
    expect(judgments.find((j) => j.noteIndex === 0)?.grade).toBe(JudgmentGrade.PERFECT);
    expect(judgments.some((j) => j.noteIndex === 1)).toBe(false); // 직후 포인트 보호
  });
});

describe("o-o- 연결 — 끝점 헤드/스트레이 릴리즈에 강건 (release 귀속)", () => {
  const lane: Lane = 1;
  const END = 2000;
  const Lng = (b: Beat, eb: Beat) => makeLongNote(lane, b, eb);
  const Sgl = (b: Beat) => makeSingleNote(lane, b);

  // 헤드 있음/없음 o-o-. KeyA가 L1→L2를 쭉 유지(3000에 뗌), KeyB를 kbReleaseMs에 탭. L1 등급 반환.
  function playL1(headed: boolean, kbReleaseMs: number): JudgmentGrade | undefined {
    const notes = headed
      ? [Sgl(beat(0, 1)), Lng(beat(0, 1), beat(8, 1)), Sgl(beat(8, 1)), Lng(beat(8, 1), beat(16, 1))]
      : [Lng(beat(0, 1), beat(8, 1)), Lng(beat(8, 1), beat(16, 1))];
    const t = headed
      ? new Map([[0, 1000], [1, 1000], [2, END], [3, END]])
      : new Map([[0, 1000], [1, END]]);
    const e = headed ? new Map([[1, END], [3, 3000]]) : new Map([[0, END], [1, 3000]]);
    const { engine, judgments } = setup(notes, t, e);
    const l1Idx = headed ? 1 : 0;
    engine.onLanePress(lane, 1000, "KeyA");
    let kb = false;
    let ka = false;
    for (let st = 1000; st <= 3200; st += 16) {
      if (!kb && st >= kbReleaseMs) {
        engine.onLanePress(lane, kbReleaseMs - 5, "KeyB");
        engine.onLaneRelease(lane, kbReleaseMs, "KeyB");
        kb = true;
      }
      engine.update(st);
      if (!ka && st >= 3000) {
        engine.onLaneRelease(lane, 3000, "KeyA");
        ka = true;
      }
    }
    return judgments.find((j) => j.noteIndex === l1Idx)?.grade;
  }

  it("헤드 있는 o-o-: KeyB 헤드 탭을 일찍(-100) 떼도 L1은 KeyA 유지로 Perfect", () => {
    expect(playL1(true, END - 100)).toBe(JudgmentGrade.PERFECT);
  });
  it("헤드 있는 o-o-: KeyB를 끝점에 떼도 Perfect", () => {
    expect(playL1(true, END)).toBe(JudgmentGrade.PERFECT);
  });
  it("헤드 있는 o-o-: KeyB를 늦게(+150) 떼도 Perfect (Bad로 안 떨어짐)", () => {
    expect(playL1(true, END + 150)).toBe(JudgmentGrade.PERFECT);
  });
  it("헤드 있는 o-o-: KeyB를 윈도우 밖(+300)에 떼도 Perfect (Miss로 안 떨어짐)", () => {
    expect(playL1(true, END + 300)).toBe(JudgmentGrade.PERFECT);
  });
  it("헤드 없는 o-o-: KeyB 스트레이 릴리즈가 연결 MISS를 유발하지 않음", () => {
    expect(playL1(false, END - 100)).toBe(JudgmentGrade.PERFECT);
  });

  it("연결 롱보다 앞 인덱스에 윈도우 밖 점 노트가 있어도 연결 감지 (배열 순서 무관)", () => {
    // L1 end 2000. 점 노트(idx1)가 2015(윈도우 밖)이고 연결 롱 L2(idx2, 2000)보다 앞 인덱스.
    const notes = [Lng(beat(0, 1), beat(8, 1)), Sgl(beat(9, 1)), Lng(beat(8, 1), beat(16, 1))];
    const t = new Map([[0, 1000], [1, END + 15], [2, END]]);
    const e = new Map([[0, END], [2, 3000]]);
    const { engine, judgments } = setup(notes, t, e);
    engine.onLanePress(lane, 1000, "KeyA"); // L1→L2 쭉 유지, 스트레이 릴리즈 없음
    for (let st = 1000; st <= 3200; st += 16) {
      engine.update(st);
      if (st >= 3000) {
        engine.onLaneRelease(lane, 3000, "KeyA");
        break;
      }
    }
    // L1(idx0)이 연결로 잡혀 KeyA 유지로 Perfect (종결 오판 시 KeyA가 3000까지 잡아 Miss)
    expect(judgments.find((j) => j.noteIndex === 0)?.grade).toBe(JudgmentGrade.PERFECT);
  });

  it("연결을 가로지르는 이어잡기: KeyA 떼고 KeyB로 이어받아도 L1 Perfect", () => {
    const notes = [Lng(beat(0, 1), beat(8, 1)), Lng(beat(8, 1), beat(16, 1))];
    const { engine, judgments } = setup(notes, new Map([[0, 1000], [1, END]]), new Map([[0, END], [1, 3000]]));
    engine.onLanePress(lane, 1000, "KeyA");
    engine.update(1000);
    engine.update(1990);
    engine.onLaneRelease(lane, 1995, "KeyA"); // 끝점 직전 KeyA 뗌
    engine.onLanePress(lane, 2000, "KeyB"); // KeyB로 이어받기
    engine.update(2000); // 연결 판정: KeyB held → Perfect
    engine.update(3000);
    engine.onLaneRelease(lane, 3000, "KeyB");
    expect(judgments.find((j) => j.noteIndex === 0)?.grade).toBe(JudgmentGrade.PERFECT);
  });

  it("연결에서 모두 떼고 다시 안 잡으면 L1 연결 MISS (정상 실패는 유지)", () => {
    const notes = [Lng(beat(0, 1), beat(8, 1)), Lng(beat(8, 1), beat(16, 1))];
    const { engine, judgments } = setup(notes, new Map([[0, 1000], [1, END]]), new Map([[0, END], [1, 3000]]));
    engine.onLanePress(lane, 1000, "KeyA");
    engine.update(1000);
    engine.onLaneRelease(lane, 1950, "KeyA"); // 끝점 전 떼고 안 잡음 (grace 초과)
    engine.update(2000);
    expect(judgments.find((j) => j.noteIndex === 0)?.grade).toBe(JudgmentGrade.MISS);
  });
});

describe("hold-only 완료 후 놓기의 관대 재분류 — 놓기 keyup도 정당한 R2 이벤트 (RFD 0015 §7-3, 구 RFD 0008 도장 반전)", () => {
  const lane: Lane = 1;

  function holdOnlyLong(b: Beat, endBeat: Beat): NoteEntity {
    return { type: NoteType.LONG, lane, beat: b, endBeat, holdOnly: true } as NoteEntity;
  }
  function slide(b: Beat): NoteEntity {
    return { type: NoteType.LONG, lane, beat: b, endBeat: b, holdOnly: true } as NoteEntity;
  }

  it("[기대값 반전] hold-only 완료 후 놓기 keyup이 직후 슬라이드 윈도우에 들어가면 슬라이드 Perfect (구: 도장 차단)", () => {
    // A: hold-only 롱 1000~2000, B: 슬라이드 2050
    const notes = [holdOnlyLong(beat(0, 1), beat(8, 1)), slide(beat(9, 1))];
    const t = new Map([[0, 1000], [1, 2050]]);
    const e = new Map([[0, 2000], [1, 2050]]);
    const { engine, judgments } = setup(notes, t, e);
    engine.onLanePress(lane, 1000, "KeyA");
    engine.update(1000);
    engine.update(2000); // A 끝점 held → Perfect (도장 없음)
    engine.onLaneRelease(lane, 2010, "KeyA"); // 놓기 — B 미리-떼기 윈도우 [1930, 2050) 안 → B를 살린다
    expect(judgments.find((j) => j.noteIndex === 0)?.grade).toBe(JudgmentGrade.PERFECT);
    expect(judgments.find((j) => j.noteIndex === 1)?.grade).toBe(JudgmentGrade.PERFECT); // §7-3 관대
  });

  it("놓기 keyup이 다음 슬라이드 윈도우 밖이면 무매칭 소멸 — 슬라이드는 자기 이벤트로 Perfect", () => {
    // A: hold-only 롱 1000~2000 (KeyA engage), C: 슬라이드 2300
    const notes = [holdOnlyLong(beat(0, 1), beat(8, 1)), slide(beat(12, 1))];
    const t = new Map([[0, 1000], [1, 2300]]);
    const e = new Map([[0, 2000], [1, 2300]]);
    const { engine, judgments } = setup(notes, t, e);
    engine.onLanePress(lane, 1000, "KeyA");
    engine.update(1000);
    engine.update(2000); // A held Perfect
    engine.onLaneRelease(lane, 2010, "KeyA"); // A 놓기 — C 윈도우[2180,2300) 밖 → 무매칭
    engine.onLanePress(lane, 2250, "KeyB"); // C를 fresh 키로 engage
    engine.onLaneRelease(lane, 2260, "KeyB"); // C 미리-떼기 윈도우 안 → Perfect
    expect(judgments.find((j) => j.noteIndex === 1)?.grade).toBe(JudgmentGrade.PERFECT);
  });

  it("[기대값 반전] hold-only → 릴리즈 노트를 한 손가락으로: 놓기 keyup이 릴리즈 노트 Perfect (0007 §7 차트 제한 해제)", () => {
    // A: hold-only 롱 1000~2000 (KeyA), R: 릴리즈 노트 2050 — 한 손가락 플레이가 합법 패턴
    const notes = [holdOnlyLong(beat(0, 1), beat(8, 1)), makeLongNote(lane, beat(9, 1), beat(9, 1))];
    const t = new Map([[0, 1000], [1, 2050]]);
    const e = new Map([[0, 2000], [1, 2050]]);
    const { engine, judgments } = setup(notes, t, e);
    engine.onLanePress(lane, 1000, "KeyA");
    engine.update(1000);
    engine.update(2000); // A held Perfect (도장 없음)
    engine.update(2055); // R → BODY_AWAITING_RELEASE
    engine.onLaneRelease(lane, 2060, "KeyA"); // 놓기 — R 윈도우 내 → R Perfect
    expect(judgments.find((j) => j.noteIndex === 1)?.grade).toBe(JudgmentGrade.PERFECT);
  });

  it("연결 체인(hold-only → 일반 롱)에서 끝까지 유지 후 끝점 뗌이 L2 종결 Perfect", () => {
    // L1: hold-only 롱 1000~2000, L2: 일반 롱 2000~3000 (연결: L1 끝=L2 시작). 한 키로 쭉 유지.
    const notes = [holdOnlyLong(beat(0, 1), beat(8, 1)), makeLongNote(lane, beat(8, 1), beat(16, 1))];
    const t = new Map([[0, 1000], [1, 2000]]);
    const e = new Map([[0, 2000], [1, 3000]]);
    const { engine, judgments } = setup(notes, t, e);
    engine.onLanePress(lane, 1000, "KeyA"); // L1 engage, 쭉 유지
    engine.update(1000);
    engine.update(2000); // L1 끝점 → L2와 연결(held Perfect)
    engine.onLaneRelease(lane, 3000, "KeyA"); // L2 끝에서 뗌 → R2 종결 Perfect
    expect(judgments.find((j) => j.noteIndex === 1)?.grade).toBe(JudgmentGrade.PERFECT);
  });

  it("[기대값 반전] pre-held hold-only 완료 후 놓기도 직후 슬라이드 윈도우 내면 슬라이드 Perfect (§7-3)", () => {
    // KeyA를 흡수 윈도우 밖(800ms)에 미리 누름 — 놓기 keyup은 의도 플레이와 물리적으로 동일한 이벤트
    const notes = [holdOnlyLong(beat(0, 1), beat(8, 1)), slide(beat(9, 1))];
    const t = new Map([[0, 1000], [1, 2050]]);
    const e = new Map([[0, 2000], [1, 2050]]);
    const { engine, judgments } = setup(notes, t, e);
    engine.onLanePress(lane, 800, "KeyA"); // pre-held (흡수 안 됨)
    engine.update(1000); // A BODY_ACTIVE (held로 진입)
    engine.update(2000); // A held Perfect (도장 없음)
    engine.onLaneRelease(lane, 2010, "KeyA"); // 놓기 — B 미리-떼기 윈도우 안 → B Perfect
    expect(judgments.find((j) => j.noteIndex === 1)?.grade).toBe(JudgmentGrade.PERFECT);
  });
});

describe("이진 릴리즈 §9 회귀 — 종결 Perfect/Miss 이원화, late-Bad 폴딩 (RFD 0015)", () => {
  const lane: Lane = 1;
  const Lng = (b: Beat, eb: Beat) => makeLongNote(lane, b, eb);
  const holdOnly = (b: Beat, eb: Beat) =>
    ({ type: NoteType.LONG, lane, beat: b, endBeat: eb, holdOnly: true }) as NoteEntity;
  const slide = (b: Beat) =>
    ({ type: NoteType.LONG, lane, beat: b, endBeat: b, holdOnly: true }) as NoteEntity;

  it("S1 변형: 끝점 +130ms까지 안 떼면 +120에 타임아웃 Miss (구: +130 뗌 = Bad)", () => {
    const { engine, judgments } = setup([Lng(beat(0, 1), beat(4, 1))], new Map([[0, 1000]]), new Map([[0, 2000]]));
    engine.onLanePress(lane, 1000, "KeyA");
    engine.update(1000);
    engine.update(2000); // AWAITING (held)
    engine.update(2125); // end+Good(2120) 초과 → 타임아웃 Miss
    engine.onLaneRelease(lane, 2130, "KeyA"); // 늦은 뗌 — 이미 죽은 노트, 무매칭
    expect(judgments.length).toBe(1);
    expect(judgments[0].grade).toBe(JudgmentGrade.MISS);
    expect(judgments.some((j) => j.grade === JudgmentGrade.BAD)).toBe(false);
  });

  it("늦은 keyup(+130)이 타임아웃 update보다 먼저 도착해도 Bad 없이 타임아웃 Miss (async keyup vs rAF)", () => {
    const { engine, judgments } = setup([Lng(beat(0, 1), beat(4, 1))], new Map([[0, 1000]]), new Map([[0, 2000]]));
    engine.onLanePress(lane, 1000, "KeyA");
    engine.update(1000);
    engine.update(2000); // AWAITING
    engine.onLaneRelease(lane, 2130, "KeyA"); // 윈도우(±120) 밖 keyup → 무매칭 소멸
    engine.update(2140); // 다음 프레임에서 타임아웃
    expect(judgments.length).toBe(1);
    expect(judgments[0].grade).toBe(JudgmentGrade.MISS);
  });

  it("끝점 절벽: -120ms 뗌 = Perfect (윈도우 경계 포함)", () => {
    const { engine, judgments } = setup([Lng(beat(0, 1), beat(4, 1))], new Map([[0, 1000]]), new Map([[0, 2000]]));
    engine.onLanePress(lane, 1000, "KeyA");
    engine.update(1000);
    engine.update(1500);
    engine.onLaneRelease(lane, 1880, "KeyA"); // end-Good 정확히
    expect(judgments[0]?.grade).toBe(JudgmentGrade.PERFECT);
  });

  it("끝점 절벽: -121ms 뗌 = Miss (유지 실패 — 현행 절벽 유지, 무악화)", () => {
    const { engine, judgments } = setup([Lng(beat(0, 1), beat(4, 1))], new Map([[0, 1000]]), new Map([[0, 2000]]));
    engine.onLanePress(lane, 1000, "KeyA");
    engine.update(1000);
    engine.update(1500);
    engine.onLaneRelease(lane, 1879, "KeyA"); // 윈도우 1ms 밖 → 무매칭
    engine.update(1885);
    engine.update(2000); // 끝점: 뗀 시점(-121) 기준 → Miss
    expect(judgments.length).toBe(1);
    expect(judgments[0].grade).toBe(JudgmentGrade.MISS);
  });

  it("S2 이어잡기: KeyA→KeyB 스왑 후 끝점에 KeyB로 떼도 Perfect (이동 제스처 불필요)", () => {
    const { engine, judgments } = setup([Lng(beat(0, 1), beat(4, 1))], new Map([[0, 1000]]), new Map([[0, 2000]]));
    engine.onLanePress(lane, 1000, "KeyA");
    engine.update(1000);
    engine.onLanePress(lane, 1495, "KeyB");
    engine.onLaneRelease(lane, 1500, "KeyA"); // 스왑 — 레인은 KeyB로 계속 held
    engine.update(1600);
    engine.update(2000); // AWAITING
    engine.onLaneRelease(lane, 2000, "KeyB");
    expect(judgments.length).toBe(1);
    expect(judgments[0].grade).toBe(JudgmentGrade.PERFECT);
  });

  it("o-o → 릴리즈 노트 R, 두 손가락: a↑로 롱 종결 + b↑로 R = 둘 다 Perfect (이벤트 2개 = 노트 2개)", () => {
    const notes = [Lng(beat(0, 1), beat(4, 1)), Lng(beat(5, 1), beat(5, 1))]; // 롱 [1000,2000] + 릴리즈 노트 2050
    const { engine, judgments } = setup(notes, new Map([[0, 1000], [1, 2050]]), new Map([[0, 2000], [1, 2050]]));
    engine.onLanePress(lane, 1000, "KeyA");
    engine.update(1000);
    engine.onLanePress(lane, 1500, "KeyB"); // 보조 손가락
    engine.update(1990);
    engine.onLaneRelease(lane, 2000, "KeyA"); // 롱 종결에 소비
    engine.update(2055); // R → 종결 대기
    engine.onLaneRelease(lane, 2060, "KeyB"); // R에 소비
    expect(judgments.find((j) => j.noteIndex === 0)?.grade).toBe(JudgmentGrade.PERFECT);
    expect(judgments.find((j) => j.noteIndex === 1)?.grade).toBe(JudgmentGrade.PERFECT);
  });

  it("RFD 0012 재현: hold-only → 안 떼고 헤드 없는 롱 이어 잡기 → 끝점 뗌 = 뒤 롱 Perfect (도장 잔류 문제 자체가 없음)", () => {
    const notes = [holdOnly(beat(0, 1), beat(4, 1)), Lng(beat(5, 1), beat(12, 1))]; // A [1000,2000], B [2050,3000]
    const { engine, judgments } = setup(notes, new Map([[0, 1000], [1, 2050]]), new Map([[0, 2000], [1, 3000]]));
    engine.onLanePress(lane, 1000, "KeyA");
    engine.update(1000);
    engine.update(2000); // A held 완료 Perfect — 안 떼고 계속 유지
    engine.update(2060); // B pre-held 진입
    engine.update(2990);
    engine.onLaneRelease(lane, 3000, "KeyA"); // 끝점 뗌
    expect(judgments.find((j) => j.noteIndex === 0)?.grade).toBe(JudgmentGrade.PERFECT);
    expect(judgments.find((j) => j.noteIndex === 1)?.grade).toBe(JudgmentGrade.PERFECT);
  });

  it("[기대값 반전] 타임아웃 Miss 후 놓기 → 직후 슬라이드 윈도우 내면 슬라이드 Perfect (죽은 롱은 Miss 그대로)", () => {
    const notes = [Lng(beat(0, 1), beat(4, 1)), slide(beat(9, 1))]; // A [1000,2000], B 슬라이드 2200
    const { engine, judgments } = setup(notes, new Map([[0, 1000], [1, 2200]]), new Map([[0, 2000], [1, 2200]]));
    engine.onLanePress(lane, 1000, "KeyA");
    engine.update(1000);
    engine.update(2000); // AWAITING
    engine.update(2125); // 타임아웃 Miss (안 뗌)
    engine.onLaneRelease(lane, 2150, "KeyA"); // 놓기 — B 윈도우 [2080, 2200) 안 → B Perfect
    expect(judgments.find((j) => j.noteIndex === 0)?.grade).toBe(JudgmentGrade.MISS);
    expect(judgments.find((j) => j.noteIndex === 1)?.grade).toBe(JudgmentGrade.PERFECT);
  });

  it("wrong-count: 2키로 싱글 롱을 시작해도 첫 윈도우 내 keyup으로 종결 Perfect (잉여 입력 패널티 없음)", () => {
    const { engine, judgments } = setup([Lng(beat(0, 1), beat(4, 1))], new Map([[0, 1000]]), new Map([[0, 2000]]));
    engine.onLanePress(lane, 1000, "KeyA");
    engine.onLanePress(lane, 1002, "KeyB"); // 잉여 키
    engine.update(1005);
    engine.update(1990);
    engine.onLaneRelease(lane, 1995, "KeyB"); // 첫 윈도우 내 keyup — 아무 키든 종결
    expect(judgments.length).toBe(1);
    expect(judgments[0].grade).toBe(JudgmentGrade.PERFECT);
    engine.onLaneRelease(lane, 2005, "KeyA"); // 남은 놓기 — 대상 없음, 무해
    expect(judgments.length).toBe(1);
  });

  it("더블 헤드 + 싱글 롱: lane-held 유지 + 윈도우 내 아무 keyup → 롱 Perfect (권리 출생 질문 소멸)", () => {
    const notes = [{ type: NoteType.DOUBLE, lane, beat: beat(0, 1) } as NoteEntity, Lng(beat(0, 1), beat(4, 1))];
    const { engine, judgments } = setup(notes, new Map([[0, 1000], [1, 1000]]), new Map([[1, 2000]]));
    engine.onLanePress(lane, 1000, "KeyA"); // 더블 헤드 1
    engine.onLanePress(lane, 1003, "KeyB"); // 더블 헤드 2
    engine.update(1005);
    engine.update(1990);
    engine.onLaneRelease(lane, 1995, "KeyB"); // 아무 keyup으로 종결
    expect(judgments.find((j) => j.noteIndex === 1)?.grade).toBe(JudgmentGrade.PERFECT);
  });

  it("슬립 복구: 윈도우 밖 뗌(-700) → grace 내 재잡기 → 끝점 뗌 = Perfect (우선순위 사다리 불필요)", () => {
    const { engine, judgments } = setup([Lng(beat(0, 1), beat(4, 1))], new Map([[0, 1000]]), new Map([[0, 2000]]));
    engine.onLanePress(lane, 1000, "KeyA");
    engine.update(1000);
    engine.onLaneRelease(lane, 1300, "KeyA"); // 슬립 — 끝점 윈도우 밖, 무매칭 소멸
    engine.onLanePress(lane, 1305, "KeyA"); // grace(12ms) 내 재잡기
    engine.update(1310);
    engine.update(2000); // AWAITING
    engine.onLaneRelease(lane, 2000, "KeyA");
    expect(judgments.length).toBe(1);
    expect(judgments[0].grade).toBe(JudgmentGrade.PERFECT);
  });

  it("탭 직후 릴리즈 노트 a-a, 윈도우 내(+80) 가로채기 = Perfect (무해 — 하향 경로 없음)", () => {
    const notes = [makeSingleNote(lane, beat(0, 1)), Lng(beat(1, 4), beat(1, 4))]; // 포인트 1000, 릴리즈 노트 1050
    const { engine, judgments } = setup(notes, new Map([[0, 1000], [1, 1050]]), new Map([[1, 1050]]));
    engine.onLanePress(lane, 1000, "KeyA"); // 포인트 Perfect
    engine.update(1055); // R → 종결 대기
    engine.onLaneRelease(lane, 1130, "KeyA"); // 같은 키 keyup이 R 윈도우 내 → Perfect
    expect(judgments.find((j) => j.noteIndex === 0)?.grade).toBe(JudgmentGrade.PERFECT);
    expect(judgments.find((j) => j.noteIndex === 1)?.grade).toBe(JudgmentGrade.PERFECT);
  });

  it("탭 직후 릴리즈 노트 a-a, 윈도우 밖(+130) keyup = 타임아웃 Miss (구 모델의 +130 BAD 가로채기 소멸)", () => {
    const notes = [makeSingleNote(lane, beat(0, 1)), Lng(beat(1, 4), beat(1, 4))];
    const { engine, judgments } = setup(notes, new Map([[0, 1000], [1, 1050]]), new Map([[1, 1050]]));
    engine.onLanePress(lane, 1000, "KeyA");
    engine.update(1055);
    engine.onLaneRelease(lane, 1180, "KeyA"); // R 윈도우(1050±120) 밖 → 무매칭
    engine.update(1185); // 타임아웃 Miss
    expect(judgments.find((j) => j.noteIndex === 1)?.grade).toBe(JudgmentGrade.MISS);
    expect(judgments.some((j) => j.grade === JudgmentGrade.BAD)).toBe(false);
  });

  it("슬라이드 미리-떼기: 부분 릴리즈(다른 키 유지 중)여도 keyup 시점에 Perfect (완전 릴리즈 게이트 폐지)", () => {
    const { engine, judgments } = setup([slide(beat(0, 1))], new Map([[0, 1000]]), new Map([[0, 1000]]));
    engine.onLanePress(lane, 900, "KeyA");
    engine.onLanePress(lane, 905, "KeyB");
    engine.onLaneRelease(lane, 950, "KeyA"); // KeyB는 아직 held — 구 게이트라면 미발화
    expect(judgments.length).toBe(1);
    expect(judgments[0].grade).toBe(JudgmentGrade.PERFECT);
    expect(judgments[0].deltaMs).toBe(-50);
    engine.update(1000); // 이미 COMPLETE — 중복 판정 없음
    expect(judgments.length).toBe(1);
  });

  it("keyup 1개가 두 슬라이드(1000, 1040) 윈도우에 걸리면 가장 이른 것 하나만 소비, 나머지는 굶어 Miss (이벤트 회계)", () => {
    const notes = [slide(beat(0, 1)), slide(beat(1, 8))]; // 1000, 1040
    const { engine, judgments } = setup(notes, new Map([[0, 1000], [1, 1040]]), new Map([[0, 1000], [1, 1040]]));
    engine.onLanePress(lane, 900, "KeyA");
    engine.onLaneRelease(lane, 950, "KeyA"); // 양 윈도우 [880,1000)·[920,1040)에 모두 걸림
    expect(judgments.length).toBe(1);
    expect(judgments[0].noteIndex).toBe(0);
    expect(judgments[0].grade).toBe(JudgmentGrade.PERFECT);
    engine.update(1170); // 둘째 슬라이드는 자기 이벤트 부재 → 타임아웃 Miss
    expect(judgments.find((j) => j.noteIndex === 1)?.grade).toBe(JudgmentGrade.MISS);
  });
});

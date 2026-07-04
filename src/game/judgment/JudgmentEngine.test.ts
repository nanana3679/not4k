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

  it("교대 성공 + delta=100ms(일반 노트면 Good일 타이밍)이어도 Grace라 Perfect — 타이밍 면제 확인", () => {
    // 스펙 §486: Grace는 타이밍 부담을 제거한다. calculateGraceGrade는 Good 윈도우(±120) 전체를 Perfect로 매핑.
    // delta=100은 일반 calculateGrade면 GOOD이지만, Grace 경로라 PERFECT여야 한다(교대 성공 전제).
    const { engine, judgments } = graceTrillSetup();
    engine.onLanePress(lane, noteTime1, "KeyA");
    engine.onLanePress(lane, noteTime2 + 100, "KeyB"); // delta=+100, 교대 성공
    expect(judgments[0].grade).toBe(JudgmentGrade.PERFECT);
    expect(judgments[1].grade).toBe(JudgmentGrade.PERFECT); // Grace 타이밍 면제 — Good 아님
  });

  it("교대 실패 + delta=100ms여도 Good◇ — Grace의 Perfect 위에 교대 override가 얹혀 타이밍과 무관", () => {
    // 교대 override는 grade 계산 뒤에 적용되므로, Grace가 delta=100을 Perfect로 올려도 실패면 Good◇로 덮인다.
    // 479(delta=0)와 달리 타이밍이 어긋난 상태에서도 override가 유지됨을 못박는다.
    const { engine, judgments } = graceTrillSetup();
    engine.onLanePress(lane, noteTime1, "KeyA");
    engine.onLanePress(lane, noteTime2 + 100, "KeyA"); // delta=+100, 같은 키 → 교대 실패
    expect(judgments[0].grade).toBe(JudgmentGrade.PERFECT);
    expect(judgments[1].grade).toBe(JudgmentGrade.GOOD_TRILL); // Perfect 아님
  });
});

describe("트릴 교대 실패의 판정 상한 — 미스타이밍을 Good◇로 보상하지 않음", () => {
  const lane: Lane = 1;

  it("Late Bad(delta=140) + 같은 키(교대 실패)는 Good◇가 아니라 Bad 유지 — 상한만 Good (RFD 0013)", () => {
    // 스펙 §276 "Good으로 고정"은 상한(good timing→Good)만 의미. 타이밍이 Good보다 나쁘면 그 판정을 유지한다.
    // 교대 실패가 미스타이밍(Bad)을 Good◇(1점)로 상향시키면 실패가 정타보다 유리해지는 역전이 생긴다.
    const notes = [makeTrillNote(lane, beat(0, 1)), makeTrillNote(lane, beat(1, 1))];
    const noteTimesMs = new Map([[0, 1000], [1, 1200]]);
    const noteEndTimesMs = new Map<number, number>();
    const { engine, judgments } = setup(notes, noteTimesMs, noteEndTimesMs);

    engine.onLanePress(lane, 1000, "KeyA");  // delta=0 → Perfect, KeyA 기록
    engine.onLanePress(lane, 1340, "KeyA");  // note 1200, delta=+140 → Bad, 같은 키 → 교대 실패

    expect(judgments[0].grade).toBe(JudgmentGrade.PERFECT);
    expect(judgments[1].grade).toBe(JudgmentGrade.BAD); // Good◇로 상향되지 않음
  });

  it("Good 윈도우 내(delta=100) + 교대 실패는 상한이 걸려 Good◇", () => {
    // 대비군: 타이밍이 Good 이상이면 교대 실패 상한 Good◇가 정상 적용된다.
    const notes = [makeTrillNote(lane, beat(0, 1)), makeTrillNote(lane, beat(1, 1))];
    const noteTimesMs = new Map([[0, 1000], [1, 1200]]);
    const noteEndTimesMs = new Map<number, number>();
    const { engine, judgments } = setup(notes, noteTimesMs, noteEndTimesMs);

    engine.onLanePress(lane, 1000, "KeyA");  // Perfect, KeyA 기록
    engine.onLanePress(lane, 1300, "KeyA");  // note 1200, delta=+100 → Good, 같은 키 → 교대 실패

    expect(judgments[1].grade).toBe(JudgmentGrade.GOOD_TRILL);
  });
});

describe("트릴 교대 '직전 키만 아니면 된다' 원칙 (3키 바인딩)", () => {
  const lane: Lane = 1;

  // 노트 4개, 한 트릴 구간(1000ms 시작). 모두 정시에 눌러 deltaMs=0(Perfect 후보).
  function setupFourNoteZone() {
    const notes = [
      makeTrillNote(lane, beat(0, 1)),
      makeTrillNote(lane, beat(1, 1)),
      makeTrillNote(lane, beat(2, 1)),
      makeTrillNote(lane, beat(3, 1)),
    ];
    const noteTimesMs = new Map([[0, 1000], [1, 1200], [2, 1400], [3, 1600]]);
    const noteEndTimesMs = new Map<number, number>();
    const trillZoneStartTimesMs = new Map<Lane, number[]>([[lane, [1000]]]);
    return setup(notes, noteTimesMs, noteEndTimesMs, undefined, trillZoneStartTimesMs);
  }

  it("A→B→A→C: 직전 키와만 다르면 전부 교대 성공 — 재등장한 두 번째 A도 Perfect", () => {
    // 스펙 note-system.md §226: 3키 바인딩에서 A→B→A→C는 모든 입력이 직전과 다르므로 교대 성공.
    // 두 번째 A는 "직전(B)"과 다르다 — 과거에 A를 이미 썼는지는 무관하다.
    // 만약 교대 추적이 "지금까지 쓴 모든 키"를 봤다면 이 A에서 Good◇로 깨진다(가드 케이스).
    const { engine, judgments } = setupFourNoteZone();

    engine.update(1000);
    engine.onLanePress(lane, 1000, "KeyA");
    engine.onLanePress(lane, 1200, "KeyB");
    engine.onLanePress(lane, 1400, "KeyA"); // 직전 B와 다름 → 성공 (재등장 A)
    engine.onLanePress(lane, 1600, "KeyC");

    expect(judgments).toHaveLength(4);
    expect(judgments[0].grade).toBe(JudgmentGrade.PERFECT);
    expect(judgments[1].grade).toBe(JudgmentGrade.PERFECT);
    expect(judgments[2].grade).toBe(JudgmentGrade.PERFECT); // 재등장 A — "직전 키만" 원칙의 핵심 가드
    expect(judgments[3].grade).toBe(JudgmentGrade.PERFECT);
  });

  it("A→B→B→C: 직전과 같은 두 번째 B만 Good◇, 그 다음 C는 다시 교대 성공", () => {
    // 스펙 note-system.md §227, §277: 두 번째 B가 직전 B와 동일 → 교대 실패(Good◇).
    // 실패 후에도 마지막 키는 B로 기록되므로, 이어지는 C(≠B)는 정상 교대 성공.
    const { engine, judgments } = setupFourNoteZone();

    engine.update(1000);
    engine.onLanePress(lane, 1000, "KeyA");
    engine.onLanePress(lane, 1200, "KeyB");
    engine.onLanePress(lane, 1400, "KeyB"); // 직전 B와 동일 → 교대 실패
    engine.onLanePress(lane, 1600, "KeyC"); // 직전 B와 다름 → 교대 성공

    expect(judgments).toHaveLength(4);
    expect(judgments[0].grade).toBe(JudgmentGrade.PERFECT);
    expect(judgments[1].grade).toBe(JudgmentGrade.PERFECT);
    expect(judgments[2].grade).toBe(JudgmentGrade.GOOD_TRILL);
    expect(judgments[3].grade).toBe(JudgmentGrade.PERFECT);
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

  it("두 레인 트릴을 같은 키로 인터리브해도 각 레인이 독립 교대 추적 — 전역 추적이면 Good◇날 배치가 전부 성공 (L1↔L4)", () => {
    // 스펙 note-system.md §283: 각 레인은 자체 '직전 입력 키' 상태를 가지며 L1 입력이 L4 교대 판정에 영향 없음.
    // 배치: L1 A → L4 A → L1 B → L4 B → L1 A. 만약 교대 추적이 전역이었다면 입력열 A,A,B,B,A가 되어
    // 두 번째 A(L4)·두 번째 B(L4)가 직전과 같아 Good◇가 나야 한다. per-lane이면 각 레인은 A→B→A / A→B라 전부 성공.
    const lane1: Lane = 1;
    const lane4: Lane = 4;
    const notes = [
      makeTrillNote(lane1, beat(0, 1)),  // 1000ms — L1
      makeTrillNote(lane4, beat(1, 1)),  // 1100ms — L4
      makeTrillNote(lane1, beat(2, 1)),  // 1200ms — L1
      makeTrillNote(lane4, beat(3, 1)),  // 1300ms — L4
      makeTrillNote(lane1, beat(4, 1)),  // 1400ms — L1
    ];
    const noteTimesMs = new Map([
      [0, 1000], [1, 1100], [2, 1200], [3, 1300], [4, 1400],
    ]);
    const noteEndTimesMs = new Map<number, number>();
    const trillZoneStartTimesMs = new Map<Lane, number[]>([
      [lane1, [1000]],
      [lane4, [1000]],
    ]);

    const { engine, judgments } = setup(notes, noteTimesMs, noteEndTimesMs, undefined, trillZoneStartTimesMs);

    engine.update(1000); // 두 레인 모두 구간 리셋
    engine.onLanePress(lane1, 1000, "KeyA"); // L1 첫 노트
    engine.onLanePress(lane4, 1100, "KeyA"); // L4 첫 노트 — 전역이면 직전 A와 같아 Good◇, per-lane이면 성공
    engine.onLanePress(lane1, 1200, "KeyB"); // L1: A→B 성공
    engine.onLanePress(lane4, 1300, "KeyB"); // L4: A→B 성공 (전역이면 직전 B와 같아 Good◇)
    engine.onLanePress(lane1, 1400, "KeyA"); // L1: B→A 성공

    expect(judgments).toHaveLength(5);
    expect(judgments[0].grade).toBe(JudgmentGrade.PERFECT); // L1 A
    expect(judgments[1].grade).toBe(JudgmentGrade.PERFECT); // L4 A — 레인 독립 핵심 가드
    expect(judgments[2].grade).toBe(JudgmentGrade.PERFECT); // L1 B
    expect(judgments[3].grade).toBe(JudgmentGrade.PERFECT); // L4 B — 레인 독립 핵심 가드
    expect(judgments[4].grade).toBe(JudgmentGrade.PERFECT); // L1 A
  });

  it("새 구간 첫 노트를 리셋 update 전에 일찍 쳐도 이전 구간 키와 무관하게 성공 (프레임 타이밍 독립)", () => {
    // 리셋은 update(프레임), 교대 체크는 async keydown. 구간2 첫 노트(2000)를 update(2000) 전에 1970에 치면
    // alternation이 아직 구간1 마지막 키(KeyB)라, 같은 KeyB면 잘못된 Good◇이 나던 버그. 입력 시점에도 구간 리셋 따라잡기.
    const notes = [
      makeTrillNote(lane, beat(0, 1)), // 1000 구간1
      makeTrillNote(lane, beat(1, 1)), // 1200 구간1
      makeTrillNote(lane, beat(2, 1)), // 2000 구간2 첫 노트
      makeTrillNote(lane, beat(3, 1)), // 2200 구간2
    ];
    const noteTimesMs = new Map([[0, 1000], [1, 1200], [2, 2000], [3, 2200]]);
    const trillZoneStartTimesMs = new Map<Lane, number[]>([[lane, [1000, 2000]]]);
    const { engine, judgments } = setup(notes, noteTimesMs, new Map(), undefined, trillZoneStartTimesMs);

    engine.update(1000);
    engine.onLanePress(lane, 1000, "KeyA");
    engine.onLanePress(lane, 1200, "KeyB");
    // ★ update(2000) 리셋 없이 ★ 구간2 첫 노트를 1970에 일찍 침 (Good 윈도우 내, -30ms)
    engine.onLanePress(lane, 1970, "KeyB"); // 구간2 첫 노트 — 새 구간이니 KeyB여도 성공이어야
    engine.update(2000);
    engine.onLanePress(lane, 2200, "KeyA");

    expect(judgments[2].grade).toBe(JudgmentGrade.PERFECT); // 구간2 첫 노트 — Good◇ 아님
    expect(judgments[3].grade).toBe(JudgmentGrade.PERFECT); // 구간2 교대 성공
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

    // 2000ms 노트를 일찍(1960ms) 입력 — KeyA. 입력 시점에 구간 리셋을 따라잡으므로(noteTime=2000이 구간
    // 시작 2000에 속함) idx0는 이 구간의 첫 노트로 KeyA를 정상 기록한다 (스펙 297 "교대 추적 정상 동작").
    engine.onLanePress(lane, 1960, "KeyA");

    // update(2000): 입력에서 이미 리셋을 따라잡아 nextIdx가 소진됐으므로 여기선 재리셋(기록 삭제)이 없다.
    // → idx0의 KeyA 기록이 유지된다 (타이밍 독립: idx0를 일찍 치든 제때 치든 idx1 판정이 같다).
    engine.update(2000);

    // 두 번째 노트(2200ms) — KeyA (idx0와 같은 키)
    engine.onLanePress(lane, 2200, "KeyA");

    expect(judgments).toHaveLength(2);
    expect(judgments[0].grade).toBe(JudgmentGrade.PERFECT); // 구간 첫 노트 — 항상 성공 (스펙 292)
    // idx0의 KeyA가 기록되어 있으므로 같은 KeyA는 교대 실패 → Good◇ (타이밍 독립, A 해석)
    expect(judgments[1].grade).toBe(JudgmentGrade.GOOD_TRILL);
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

  it("이전 구간에서 이미 기록된 키와 같은 키로 늦은 구간밖 노트를 쳐도 Good◇가 아니라 타이밍 판정 — 구간 리셋이 lastKey를 null로 밀기 때문", () => {
    // 스펙 note-system.md §296 "교대 체크도 기존 상태 기준으로 수행"의 실제 귀결을 못박는다.
    // earliest-match(가장 이른 noteTime 우선)상 구간2 노트는 pending 구간1 노트보다 먼저 소비될 수 없으므로,
    // belongsToCurrentZone=false(보호 발동)가 되는 순간 currentZoneStart를 새 구간으로 민 것은 update()뿐이고
    // update는 항상 lastKey=null로 리셋한다. 따라서 늦은 구간밖 노트는 이전 기록 키와 같아도 교대 실패가 될 수 없다.
    // 826 테스트는 앞서 기록된 키가 없어(첫 입력) 이 커플링(리셋→null)의 회귀를 잡지 못한다.
    const notes = [
      makeTrillNote(lane, beat(0, 1)),  // 1000ms — 구간1 첫 노트 (KeyA 기록)
      makeTrillNote(lane, beat(1, 1)),  // 1900ms — 구간1 마지막 노트 (늦게 침)
      makeTrillNote(lane, beat(2, 1)),  // 2000ms — 구간2 첫 노트
      makeTrillNote(lane, beat(3, 1)),  // 2200ms — 구간2 두 번째 노트
    ];
    const noteTimesMs = new Map([
      [0, 1000], [1, 1900], [2, 2000], [3, 2200],
    ]);
    const noteEndTimesMs = new Map<number, number>();
    const trillZoneStartTimesMs = new Map<Lane, number[]>([
      [lane, [1000, 2000]],
    ]);

    const { engine, judgments } = setup(notes, noteTimesMs, noteEndTimesMs, undefined, trillZoneStartTimesMs);

    // 구간1 시작 → 첫 노트 KeyA 정상 기록 (lastKey=KeyA)
    engine.update(1000);
    engine.onLanePress(lane, 1000, "KeyA");

    // 구간2 시작 → 리셋(lastKey=null, currentZoneStart=2000). idx1(1900)은 delta=100으로 아직 살아있음
    engine.update(2000);

    // 구간1 마지막 노트(1900)를 늦게(2010) KeyA로 침 — 이전 기록 키(KeyA)와 동일
    // → lastKey는 리셋으로 null이라 교대 체크 스킵, 순수 타이밍(GOOD). belongs=false라 기록도 안 함.
    engine.onLanePress(lane, 2010, "KeyA");

    // 구간2 첫 노트(2000)를 KeyA로 — 새 구간 첫 노트라 교대 성공(구간 독립, 스펙 §292)
    engine.onLanePress(lane, 2020, "KeyA");

    // 구간2 두 번째(2200)를 KeyA로 — 같은 키 연속 → Good◇ (구간2 추적은 정상 동작, 늦은 입력에 오염 안 됨)
    engine.onLanePress(lane, 2200, "KeyA");

    expect(judgments).toHaveLength(4);
    expect(judgments[0].grade).toBe(JudgmentGrade.PERFECT);   // 구간1 첫 노트
    expect(judgments[1].grade).toBe(JudgmentGrade.GOOD);      // 늦은 구간밖 노트 — Good◇ 아님(핵심 가드)
    expect(judgments[2].grade).toBe(JudgmentGrade.PERFECT);   // 구간2 첫 노트 — 구간 독립
    expect(judgments[3].grade).toBe(JudgmentGrade.GOOD_TRILL); // 구간2 같은 키 연속
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

  it("길이 < Good 윈도우인 짧은 더블롱을 1키만 유지해도 유지 키는 Perfect (미입력만 Miss)", () => {
    // 길이 50ms(<120) doubleLong. 끝점 −Good 구간이 시작과 겹쳐 checkDoubleLongKeyHold(__missing__ 생성)가
    // 스킵되지만, 끝점 판정이 실제 held 키로 추적을 재구성해야 한다 (스펙: 1키 유지 시 그 키 Perfect — 병렬 판정).
    const notes = [makeDoubleLong(lane, beat(0, 1), beat(1, 1))];
    const { engine, judgments } = setup(notes, new Map([[0, 1000]]), new Map([[0, 1050]]));
    engine.onLanePress(lane, 1000, "KeyA"); // KeyB 미입력
    engine.update(1000);
    engine.update(1050);
    engine.onLaneRelease(lane, 1050, "KeyA");
    engine.update(1100);
    const dl = dlOf(judgments);
    expect(dl.length).toBe(2); // count 불변
    expect(dl.some((j) => j.grade === JudgmentGrade.PERFECT)).toBe(true); // 유지한 KeyA
    expect(dl.some((j) => j.grade === JudgmentGrade.MISS)).toBe(true); // 미입력 KeyB
  });

  it("짧은 더블롱 1키 유지 — 유지 키를 끝점 update보다 먼저 놓아도 유지 키 Perfect (keyup primary 재구성)", () => {
    // P3는 재구성을 update 폴백에만 넣었다. 라이브 keyup은 rAF update와 비동기라, 유지 키의 release가
    // 끝점을 넘는 update 프레임보다 먼저 도착하면(짧은 더블롱은 dl 미생성) keyup 경로가 !dl로 빠지고,
    // 다음 update는 heldKeys가 이미 비어 두 키 모두 Miss로 샜다(P3의 거울상 빈틈). keyup에서도 재구성해야 한다.
    const notes = [makeDoubleLong(lane, beat(0, 1), beat(1, 1))]; // 길이 50ms(<120)
    const { engine, judgments } = setup(notes, new Map([[0, 1000]]), new Map([[0, 1050]]));
    engine.onLanePress(lane, 1000, "KeyA"); // KeyB 미입력
    engine.update(1000);
    // ★ 끝점(1050)을 넘는 update 없이 ★ 유지 키를 놓는다 → keyup이 primary로 종결해야 한다.
    engine.onLaneRelease(lane, 1050, "KeyA");
    const dl = dlOf(judgments);
    expect(dl.length).toBe(2); // 유지 키 Perfect + 미입력 키 Miss
    expect(dl.some((j) => j.grade === JudgmentGrade.PERFECT)).toBe(true); // 유지한 KeyA
    expect(dl.some((j) => j.grade === JudgmentGrade.MISS)).toBe(true); // 미입력 KeyB
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

describe("release 공릴리즈 키 누설 차단 — held 완료 직후 놓기 누설 방지 (RFD 0008)", () => {
  const lane: Lane = 1;

  function holdOnlyLong(b: Beat, endBeat: Beat): NoteEntity {
    return { type: NoteType.LONG, lane, beat: b, endBeat, holdOnly: true } as NoteEntity;
  }
  function slide(b: Beat): NoteEntity {
    return { type: NoteType.LONG, lane, beat: b, endBeat: b, holdOnly: true } as NoteEntity;
  }

  it("hold-only 롱노트를 유지 완료한 뒤 놓는 release가 직후 슬라이드로 누설되지 않는다", () => {
    // A: hold-only 롱 1000~2000, B: 슬라이드 2050
    const notes = [holdOnlyLong(beat(0, 1), beat(8, 1)), slide(beat(9, 1))];
    const t = new Map([[0, 1000], [1, 2050]]);
    const e = new Map([[0, 2000], [1, 2050]]);
    const { engine, judgments } = setup(notes, t, e);
    engine.onLanePress(lane, 1000, "KeyA");
    engine.update(1000);
    engine.update(2000); // A 끝점 held → Perfect + 락아웃(until 2120)
    engine.onLaneRelease(lane, 2010, "KeyA"); // 놓기 — B의 미리-떼기로 새면 안 됨
    expect(judgments.find((j) => j.noteIndex === 0)?.grade).toBe(JudgmentGrade.PERFECT);
    expect(judgments.some((j) => j.noteIndex === 1)).toBe(false); // 슬라이드 B 미판정(보호)
  });

  it("다른(fresh) 키로 슬라이드를 engage한 뒤 미리 떼면 정상 Perfect (공릴리즈 키와 무관)", () => {
    // A: hold-only 롱 1000~2000 (KeyA engage), C: 슬라이드 2300
    const notes = [holdOnlyLong(beat(0, 1), beat(8, 1)), slide(beat(12, 1))];
    const t = new Map([[0, 1000], [1, 2300]]);
    const e = new Map([[0, 2000], [1, 2300]]);
    const { engine, judgments } = setup(notes, t, e);
    engine.onLanePress(lane, 1000, "KeyA");
    engine.update(1000);
    engine.update(2000); // A held Perfect → KeyA 공릴리즈
    engine.onLaneRelease(lane, 2010, "KeyA"); // A 놓기(공릴리즈 키 해제)
    engine.onLanePress(lane, 2250, "KeyB"); // C를 fresh 키로 engage
    engine.onLaneRelease(lane, 2260, "KeyB"); // C 미리-떼기 윈도우[2180,2300) → 정상 Perfect
    expect(judgments.find((j) => j.noteIndex === 1)?.grade).toBe(JudgmentGrade.PERFECT);
  });

  it("hold-only 완료 후 놓기 release가 직후 릴리즈 노트(길이0 일반)로 누설되지 않는다", () => {
    // A: hold-only 롱 1000~2000 (KeyA), R: 릴리즈 노트 2050
    const notes = [holdOnlyLong(beat(0, 1), beat(8, 1)), makeLongNote(lane, beat(9, 1), beat(9, 1))];
    const t = new Map([[0, 1000], [1, 2050]]);
    const e = new Map([[0, 2000], [1, 2050]]);
    const { engine, judgments } = setup(notes, t, e);
    engine.onLanePress(lane, 1000, "KeyA");
    engine.update(1000);
    engine.update(2000); // A Perfect → KeyA 공릴리즈
    engine.update(2055); // R → BODY_AWAITING_RELEASE
    engine.onLaneRelease(lane, 2060, "KeyA"); // 놓기 — R로 새면 안 됨
    expect(judgments.some((j) => j.noteIndex === 1)).toBe(false);
  });

  it("연결 체인(hold-only → 일반 롱)에서 끝까지 유지 후 release-tap이 공릴리즈에 막히지 않는다", () => {
    // L1: hold-only 롱 1000~2000, L2: 일반 롱 2000~3000 (연결: L1 끝=L2 시작). 한 키로 쭉 유지.
    const notes = [holdOnlyLong(beat(0, 1), beat(8, 1)), makeLongNote(lane, beat(8, 1), beat(16, 1))];
    const t = new Map([[0, 1000], [1, 2000]]);
    const e = new Map([[0, 2000], [1, 3000]]);
    const { engine, judgments } = setup(notes, t, e);
    engine.onLanePress(lane, 1000, "KeyA"); // L1 engage, 쭉 유지
    engine.update(1000);
    engine.update(2000); // L1 끝점 → L2와 연결(held Perfect). 연결은 공릴리즈 안 함
    engine.onLaneRelease(lane, 3000, "KeyA"); // L2 끝에서 release-tap — 공릴리즈에 막히면 안 됨
    expect(judgments.find((j) => j.noteIndex === 1)?.grade).toBe(JudgmentGrade.PERFECT);
  });

  it("pre-held(흡수 윈도우 밖에서 미리 누른) hold-only 완료 후 놓기도 직후 슬라이드로 안 샌다", () => {
    // KeyA를 흡수 윈도우 밖(800ms, 노트 1000 gate [880,1120])에 미리 누름 → 흡수 기록 없음(pre-held)
    const notes = [holdOnlyLong(beat(0, 1), beat(8, 1)), slide(beat(9, 1))];
    const t = new Map([[0, 1000], [1, 2050]]);
    const e = new Map([[0, 2000], [1, 2050]]);
    const { engine, judgments } = setup(notes, t, e);
    engine.onLanePress(lane, 800, "KeyA"); // pre-held (흡수 안 됨)
    engine.update(1000); // A BODY_ACTIVE (held로 진입)
    engine.update(2000); // A held Perfect → 유지 키(KeyA) 공릴리즈
    engine.onLaneRelease(lane, 2010, "KeyA"); // 놓기 — B로 새면 안 됨
    expect(judgments.some((j) => j.noteIndex === 1)).toBe(false);
  });

  it("hold-only 완료 키를 안 떼고 이어서 .- 롱을 유지하면, 그 롱 끝 release로 정상 종결된다 (RFD 0012)", () => {
    // L1: hold-only A[1000~2000], 갭, 헤드없는 롱 B[2500~3000] (비연결). KeyA로 쭉 유지.
    const notes = [holdOnlyLong(beat(0, 1), beat(8, 1)), makeLongNote(lane, beat(10, 1), beat(12, 1))];
    const t = new Map([[0, 1000], [1, 2500]]);
    const e = new Map([[0, 2000], [1, 3000]]);
    const { engine, judgments } = setup(notes, t, e);
    engine.onLanePress(lane, 1000, "KeyA"); // KeyA로 A 잡기 — 이후 안 뗌
    engine.update(1000); // A BODY_ACTIVE
    engine.update(2000); // A held Perfect → KeyA 공릴리즈 도장
    engine.update(2500); // B BODY_ACTIVE (KeyA pre-held로 유지 시작) → 도장 회수돼야 함
    engine.update(3000); // B 끝점 → BODY_AWAITING_RELEASE
    engine.onLaneRelease(lane, 3005, "KeyA"); // B 종결 시도
    engine.update(3200); // 미종결이면 타임아웃 확정
    expect(judgments.find((j) => j.noteIndex === 1)?.grade).toBe(JudgmentGrade.PERFECT);
  });

  it("A 끝점과 B 바디 시작이 한 프레임에 겹쳐도 B는 정상 종결된다 (RFD 0012 프레임 독립성)", () => {
    // 좁은 갭: A[1000~2000], B[2016~3000]. [2000,2016) 사이에 프레임이 안 떨어지면
    // 한 프레임(2016)이 A 끝점 완료(부여)와 B 바디 시작(회수)을 함께 덮는다 — 30fps 흔들림급.
    const notes = [holdOnlyLong(beat(0, 1), beat(8, 1)), makeLongNote(lane, beat(10, 1), beat(12, 1))];
    const t = new Map([[0, 1000], [1, 2016]]);
    const e = new Map([[0, 2000], [1, 3000]]);
    const { engine, judgments } = setup(notes, t, e);
    engine.onLanePress(lane, 1000, "KeyA"); // KeyA로 A 잡기 — 이후 안 뗌
    engine.update(1000); // A 유지 시작 (시작 윈도우 내)
    engine.update(1983); // A 유지 중 (끝점 전 마지막 프레임)
    engine.update(2016); // ★한 프레임★: A 끝점 완료(부여) + B 바디 시작(회수) 동시
    engine.update(3000); // B 끝점 → AWAITING
    engine.onLaneRelease(lane, 3005, "KeyA"); // B 종결 시도
    engine.update(3200);
    expect(judgments.find((j) => j.noteIndex === 1)?.grade).toBe(JudgmentGrade.PERFECT);
  });

  it("AWAITING_RELEASE 롱을 같은 키로 유지 중 직후 슬라이드가 완료돼도 그 롱의 지각 종결이 막히지 않는다 (RFD 0012 거울상)", () => {
    // B: 일반 롱 [1000~2000], S: 슬라이드 2050. KeyA로 B 유지 → 2000 AWAITING → S pre-held Perfect → KeyA 2060에 뗌(B 지각 종결 +60)
    const notes = [makeLongNote(lane, beat(0, 1), beat(8, 1)), slide(beat(9, 1))];
    const t = new Map([[0, 1000], [1, 2050]]);
    const e = new Map([[0, 2000], [1, 2050]]);
    const { engine, judgments } = setup(notes, t, e);
    engine.onLanePress(lane, 1000, "KeyA");
    engine.update(1000); // B BODY_ACTIVE
    engine.update(2000); // B 끝점 → AWAITING (KeyA held)
    engine.update(2050); // S 슬라이드 held Perfect → markEmptyRelease (스캔이 AWAITING인 B를 봐야 함)
    engine.onLaneRelease(lane, 2060, "KeyA"); // B 지각 종결 (delta +60, 윈도우 내)
    engine.update(2200); // 미종결이면 타임아웃 확정
    expect(judgments.find((j) => j.noteIndex === 0)?.grade).toBe(JudgmentGrade.PERFECT); // B 종결(지각 상향)
    expect(judgments.find((j) => j.noteIndex === 1)?.grade).toBe(JudgmentGrade.PERFECT); // S도 Perfect
  });

  it("AWAITING 롱이 keyup이 아니라 타임아웃으로 죽은 뒤의 놓기 keyup은 직후 슬라이드로 새지 않는다 (RFD 0012 타임아웃 분기)", () => {
    // B 일반 롱[1000~2000], S1 슬라이드 2050(B AWAITING이라 도장 스킵), S2 슬라이드 2250.
    // B는 keyup 없이 타임아웃(2160)으로 Miss. 그 뒤 2200 놓기 keyup이 S2로 새면 안 됨.
    const notes = [
      makeLongNote(lane, beat(0, 1), beat(8, 1)),
      slide(beat(9, 1)),
      slide(beat(11, 1)),
    ];
    const t = new Map([[0, 1000], [1, 2050], [2, 2250]]);
    const e = new Map([[0, 2000], [1, 2050], [2, 2250]]);
    const { engine, judgments } = setup(notes, t, e);
    engine.onLanePress(lane, 1000, "KeyA");
    engine.update(1000); // B BODY_ACTIVE
    engine.update(2000); // B 끝점 → AWAITING
    engine.update(2050); // S1 슬라이드 완료 → 도장 스킵(B AWAITING이 load-bearing)
    engine.update(2170); // B 타임아웃(>2160) → Miss, COMPLETE (keyup 아님!)
    engine.onLaneRelease(lane, 2200, "KeyA"); // 놓기 keyup — S2로 새면 안 됨
    engine.update(2400);
    expect(judgments.find((j) => j.noteIndex === 0)?.grade).toBe(JudgmentGrade.MISS); // B는 타임아웃 Miss
    // 놓기가 막혀 S2는 미리-떼기 Perfect를 못 받고 타임아웃 Miss. 공짜 Perfect 누설이면 여기서 실패.
    expect(judgments.find((j) => j.noteIndex === 2)?.grade).toBe(JudgmentGrade.MISS);
  });

  it("hold-only 더블롱을 2키로 유지 완료 후 안 떼고 이어서 더블롱 B 유지, 분할 릴리즈로 B 양쪽 정상 종결 (RFD 0012 doubleLong)", () => {
    // A: hold-only 더블롱[1000~2000](KeyA+KeyB 유지), 갭, 일반 더블롱 B[2500~3000]. 2키 계속 유지 후 B 끝에서 분할 릴리즈.
    // doubleLong의 keyup 종결 분기(tryEndpointJudgmentOnRelease)는 isEmptyRelease 도장 가드 뒤에 있어
    // 도장에 막힐 수 있다. 그래도 등급이 보존되는 근거는 "이중화": updateDoubleLongKeyRelease가 가드보다
    // 앞에서 lastReleaseTimeMs를 무조건 기록하고, update 폴백(judgeDoubleLongEndpoint)이 그 시각으로 같은
    // 등급을 재판정한다(막힌 경우 emit만 끝점 이후 첫 update 프레임으로 지연). 회수/부여 조건화 유무와
    // 무관하게 등급 결과가 동일함(결과 면역)을 이 테스트가 잠근다 — 폴백의 released-키 재판정을 없애면 깨진다.
    const holdOnlyDL = { type: NoteType.DOUBLE_LONG, lane, beat: beat(0, 1), endBeat: beat(8, 1), holdOnly: true } as NoteEntity;
    const notes = [holdOnlyDL, makeDoubleLongNote(lane, beat(10, 1), beat(12, 1))];
    const t = new Map([[0, 1000], [1, 2500]]);
    const e = new Map([[0, 2000], [1, 3000]]);
    const { engine, judgments } = setup(notes, t, e);
    engine.onLanePress(lane, 1000, "KeyA");
    engine.onLanePress(lane, 1005, "KeyB");
    engine.update(1010); // A 2키 유지 시작
    engine.update(2000); // A held 완료
    engine.update(2500); // B BODY_ACTIVE, 2키 pre-held로 유지 시작
    engine.update(3000); // B 끝점
    engine.onLaneRelease(lane, 3000, "KeyA"); // 분할 릴리즈 1
    engine.onLaneRelease(lane, 3010, "KeyB"); // 분할 릴리즈 2
    engine.update(3200);
    const dl = judgments.filter((j) => j.noteIndex === 1);
    expect(dl.length).toBe(2); // 키별 2판정
    expect(dl.every((j) => j.grade === JudgmentGrade.PERFECT)).toBe(true); // 양쪽 다 정상 종결(keyup 즉시든 폴백이든 등급 동일)
  });

  it("doubleLong 종결이 keyup 시점에 즉시 emit된다 — 회수가 primary, 폴백으로 지연되면 회귀 (RFD 0012 doubleLong 타이밍)", () => {
    // 위 테스트와 같은 차트지만 추가 update 없이 keyup 직후 판정을 확인한다.
    // 회수 정상: keyup을 tryEndpoint가 즉시 판정 → 2판정. 회수 깨짐: 도장 잔류로 keyup 막힘 →
    // 폴백(judgeDoubleLongEndpoint)이 다음 update로 emit 지연 → 이 시점엔 0판정 → 단언 실패(silent→loud).
    // "결과 면역"의 primary 담지자(회수)를 못박아, 회수 회귀를 폴백이 조용히 가리는 것을 막는다.
    const holdOnlyDL = { type: NoteType.DOUBLE_LONG, lane, beat: beat(0, 1), endBeat: beat(8, 1), holdOnly: true } as NoteEntity;
    const notes = [holdOnlyDL, makeDoubleLongNote(lane, beat(10, 1), beat(12, 1))];
    const t = new Map([[0, 1000], [1, 2500]]);
    const e = new Map([[0, 2000], [1, 3000]]);
    const { engine, judgments } = setup(notes, t, e);
    engine.onLanePress(lane, 1000, "KeyA");
    engine.onLanePress(lane, 1005, "KeyB");
    engine.update(1010);
    engine.update(2000);
    engine.update(2500);
    engine.update(3000); // B 끝점 (2키 유지 중 → release 대기)
    engine.onLaneRelease(lane, 3000, "KeyA"); // 분할 릴리즈 1
    engine.onLaneRelease(lane, 3010, "KeyB"); // 분할 릴리즈 2
    // ★ 추가 update 없이 ★ keyup 직후 이미 2판정이어야 한다 (회수 primary). 폴백 지연이면 여기서 0.
    const dl = judgments.filter((j) => j.noteIndex === 1);
    expect(dl.length).toBe(2);
    expect(dl.every((j) => j.grade === JudgmentGrade.PERFECT)).toBe(true);
  });
});

describe("분할 릴리즈 D=- : 헤드 더블 + 바디 doubleLong 합성 = 총 4판정 (note-system §분할 릴리즈)", () => {
  const lane: Lane = 1;
  const DOUBLE = (b: Beat): NoteEntity => ({ type: NoteType.DOUBLE, lane, beat: b } as NoteEntity);
  const DLONG = (b: Beat, endBeat: Beat): NoteEntity =>
    ({ type: NoteType.DOUBLE_LONG, lane, beat: b, endBeat } as NoteEntity);

  it("헤드 DOUBLE(같은 beat) + 바디 DOUBLE_LONG을 2키로 치고 분할 릴리즈 → 헤드 2 + 바디 2 = 4판정", () => {
    // idx0 = 헤드 더블(1000), idx1 = 바디 더블롱[1000~2000]. 헤드는 keydown 흡수해 판정, 바디는 held 독립 추적.
    const notes = [DOUBLE(beat(0, 1)), DLONG(beat(0, 1), beat(8, 1))];
    const t = new Map([[0, 1000], [1, 1000]]);
    const e = new Map([[0, 1000], [1, 2000]]);
    const { engine, judgments } = setup(notes, t, e);
    engine.onLanePress(lane, 1000, "KeyA");
    engine.onLanePress(lane, 1005, "KeyB");
    engine.update(1010); // 바디 2키 추적
    engine.update(2000); // 끝점
    engine.onLaneRelease(lane, 2000, "KeyA"); // 분할 릴리즈 1
    engine.onLaneRelease(lane, 2010, "KeyB"); // 분할 릴리즈 2
    engine.update(2100);
    const head = judgments.filter((j) => j.noteIndex === 0);
    const body = judgments.filter((j) => j.noteIndex === 1);
    expect(head.length).toBe(2); // 헤드 더블: 독립 싱글 × 2
    expect(body.length).toBe(2); // 바디 더블롱: 키별 종결 × 2
    expect(judgments.length).toBe(4); // 총 4판정 (스펙 §분할 릴리즈)
    expect([...head, ...body].every((j) => j.grade === JudgmentGrade.PERFECT)).toBe(true);
  });
});

describe("연결 doubleLong 끝점 판정 (P2)", () => {
  const lane: Lane = 1;
  const DLONG = (b: Beat, endBeat: Beat): NoteEntity =>
    ({ type: NoteType.DOUBLE_LONG, lane, beat: b, endBeat } as NoteEntity);

  it("더블롱 A가 더블롱 B로 연결(끝=시작 맞닿음), 2키 계속 유지 → A 연결 Perfect×2", () => {
    // A[1000,2000] 끝 = B[2000,3000] 시작 → 자동 연결. 연결 끝점은 held/grace로만 판정하며
    // tryEndpoint의 도장 가드·lastReleaseTimeMs를 아예 타지 않아 도장 carryover에 구조적으로 완전 면역
    // (general doubleLong의 회수/폴백 이중화와 달리 회수 유무와 무관 — 토글로 실측). 이 테스트는 연결 등급을 잠근다.
    const notes = [DLONG(beat(0, 1), beat(8, 1)), DLONG(beat(8, 1), beat(16, 1))];
    const t = new Map([[0, 1000], [1, 2000]]);
    const e = new Map([[0, 2000], [1, 3000]]);
    const { engine, judgments } = setup(notes, t, e);
    engine.onLanePress(lane, 1000, "KeyA");
    engine.onLanePress(lane, 1005, "KeyB");
    engine.update(1010); // A 2키 추적
    engine.update(2000); // A 끝점=B 시작 → A 연결 판정 (held → Perfect×2)
    const a = judgments.filter((j) => j.noteIndex === 0);
    expect(a.length).toBe(2); // 키별 2판정
    expect(a.every((j) => j.grade === JudgmentGrade.PERFECT)).toBe(true);
  });
});

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

describe("롱노트 시작점 허용 — 프레임 경계 독립성 (RFD 0013와 별개, 시작조건 슬라이스 P1)", () => {
  it("시작 윈도우(+120) 내 +115ms에 눌렀고 관측 update가 +130ms에 떨어져도 정상 시작해 끝까지 Perfect", () => {
    // 시작 윈도우는 시간으로 정의된다([noteTime, noteTime+GOOD]). 수락을 프레임에서만 하면 윈도우 내
    // 유효 입력이라도 관측 프레임이 윈도우 밖에 떨어질 때 실패로 샌다(async keydown vs rAF update).
    // 입력(onLanePress) 시점에도 시작 수락을 평가해 이 경계 의존을 제거한다.
    const lane: Lane = 1;
    const notes: NoteEntity[] = [makeLongNote(lane, beat(0, 1), beat(8, 1))];
    const noteTimesMs = new Map([[0, 1000]]);
    const noteEndTimesMs = new Map([[0, 3000]]);
    const { engine, judgments } = setup(notes, noteTimesMs, noteEndTimesMs);

    engine.update(1000);                    // 바디 활성화, 아직 안 눌림
    engine.update(1050);                    // 윈도우 내, 아직 안 눌림 (대기)
    engine.onLanePress(lane, 1115, "KeyA"); // 윈도우 [1000,1120] 내 유효 입력
    engine.update(1130);                    // 관측 프레임이 윈도우(+120) 밖 — 여기서 실패하면 버그
    engine.update(3000);                    // 끝점 도달, 키 유지 중 → 릴리즈 대기
    engine.onLaneRelease(lane, 3010, "KeyA"); // 끝점 윈도우 내 릴리즈 → 종결

    expect(judgments.filter((j) => j.grade === JudgmentGrade.MISS)).toHaveLength(0);
    expect(judgments.at(-1)?.grade).toBe(JudgmentGrade.PERFECT);
  });

  it("doubleLong 2키를 시작 윈도우 내에 눌렀고 관측 update가 윈도우 밖에 떨어져도 두 키 모두 정상 시작", () => {
    // 헬퍼가 doubleLong 2키 추적 초기화를 입력 시점에도(멱등) 수행하는지 잠근다.
    const lane: Lane = 1;
    const notes: NoteEntity[] = [makeDoubleLongNote(lane, beat(0, 1), beat(8, 1))];
    const noteTimesMs = new Map([[0, 1000]]);
    const noteEndTimesMs = new Map([[0, 3000]]);
    const { engine, judgments } = setup(notes, noteTimesMs, noteEndTimesMs);

    engine.update(1000);                    // 활성화, 아직 안 눌림
    engine.onLanePress(lane, 1110, "KeyA"); // 윈도우 내 1키
    engine.onLanePress(lane, 1118, "KeyB"); // 윈도우 내 2키
    engine.update(1130);                    // 관측 프레임 윈도우 밖 — 시작 실패 나면 버그
    engine.update(3000);                    // 끝점 도달, 2키 유지 중
    engine.onLaneRelease(lane, 3010, "KeyA");
    engine.onLaneRelease(lane, 3010, "KeyB");

    // 두 키 모두 시작 실패(MISS) 없이 정상 종결되어야 한다 (doubleLong은 키별 2판정)
    expect(judgments.filter((j) => j.grade === JudgmentGrade.MISS)).toHaveLength(0);
    expect(judgments).toHaveLength(2);
  });

  it("시작 윈도우 경계: 정확히 +120ms 입력은 이내로 수락되어 정상 시작 (스펙 §127 '이내'=포함)", () => {
    const lane: Lane = 1;
    const notes: NoteEntity[] = [makeLongNote(lane, beat(0, 1), beat(8, 1))];
    const noteTimesMs = new Map([[0, 1000]]);
    const noteEndTimesMs = new Map([[0, 3000]]);
    const { engine, judgments } = setup(notes, noteTimesMs, noteEndTimesMs);

    engine.update(1000);
    engine.onLanePress(lane, 1120, "KeyA"); // 정확히 +120 — 윈도우 [1000,1120] 경계 포함
    engine.update(1130);
    engine.update(3000);
    engine.onLaneRelease(lane, 3010, "KeyA");

    expect(judgments.filter((j) => j.grade === JudgmentGrade.MISS)).toHaveLength(0);
    expect(judgments.at(-1)?.grade).toBe(JudgmentGrade.PERFECT);
  });

  it("시작 윈도우 경계: +121ms 입력은 윈도우 밖이라 시작 실패(Miss)", () => {
    const lane: Lane = 1;
    const notes: NoteEntity[] = [makeLongNote(lane, beat(0, 1), beat(8, 1))];
    const noteTimesMs = new Map([[0, 1000]]);
    const noteEndTimesMs = new Map([[0, 3000]]);
    const { engine, judgments } = setup(notes, noteTimesMs, noteEndTimesMs);

    engine.update(1000);
    engine.onLanePress(lane, 1121, "KeyA"); // +121 — 윈도우 밖
    engine.update(1130);                    // !hasBeenPressed + 윈도우 초과 → 실패

    expect(judgments).toHaveLength(1);
    expect(judgments[0].grade).toBe(JudgmentGrade.MISS);
  });

  it("early: noteTime 이전(-50)에 눌러 홀드 중이면 활성화 시 그 홀드로 바디 시작 — 활성화 후 새 입력 없이 완주", () => {
    // 시작 수락 기준은 '일찍 눌렀는지'가 아니라 '시작 윈도우 동안 홀드 중인지'다.
    const lane: Lane = 1;
    const notes: NoteEntity[] = [makeLongNote(lane, beat(0, 1), beat(8, 1))];
    const noteTimesMs = new Map([[0, 1000]]);
    const noteEndTimesMs = new Map([[0, 3000]]);
    const { engine, judgments } = setup(notes, noteTimesMs, noteEndTimesMs);

    engine.onLanePress(lane, 950, "KeyA"); // noteTime 이전 — consume 윈도우 내, 이후 계속 홀드
    engine.update(1000);                   // 활성화 — 홀드 중이므로 시작 수락(새 keydown 불필요)
    engine.update(3000);
    engine.onLaneRelease(lane, 3000, "KeyA");

    expect(judgments.filter((j) => j.grade === JudgmentGrade.MISS)).toHaveLength(0);
    expect(judgments.at(-1)?.grade).toBe(JudgmentGrade.PERFECT);
  });

  it("early 입력만으로는 불충분: 활성화 전에 떼고 다시 안 누르면 시작 윈도우 내 홀드 없어 Miss", () => {
    const lane: Lane = 1;
    const notes: NoteEntity[] = [makeLongNote(lane, beat(0, 1), beat(8, 1))];
    const noteTimesMs = new Map([[0, 1000]]);
    const noteEndTimesMs = new Map([[0, 3000]]);
    const { engine, judgments } = setup(notes, noteTimesMs, noteEndTimesMs);

    engine.onLanePress(lane, 950, "KeyA");   // 일찍 눌렀으나
    engine.onLaneRelease(lane, 980, "KeyA"); // 활성화(1000) 전에 뗌
    engine.update(1000);                     // 안 눌림 — 대기
    engine.update(1130);                     // 윈도우 초과, 홀드 없음 → 실패

    expect(judgments).toHaveLength(1);
    expect(judgments[0].grade).toBe(JudgmentGrade.MISS);
  });
});

describe("롱노트 종료 시점 릴리즈 판정", () => {
  /**
   * 시나리오: 레인1에 키 A, B 두 개가 바인딩.
   * 롱노트 바디 진행 중, 끝점 판정 윈도우 안에서 키 A만 릴리즈.
   * 키 B는 여전히 홀드 상태.
   * → 릴리즈 판정이 발생해야 한다.
   */
  it("끝점 윈도우 내 릴리즈 시 다른 키가 홀드 상태여도 termination 판정 발생", () => {
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

  it("BODY_AWAITING_RELEASE 상태에서 다른 키 홀드 중 릴리즈해도 termination 판정 발생", () => {
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

  it("BODY_ACTIVE 상태에서 끝점 Good 윈도우 내 단일 키 릴리즈로 termination 판정 발생", () => {
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

  it("모든 키를 동시에 릴리즈해도 정상적으로 termination 판정 1회만 발생", () => {
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

  it("교대 실패 시 goodTrill 유지 — Grace여도 교대 규칙은 적용", () => {
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

  // 노트 4개, 한 trillZone(1000ms 시작). 모두 정시에 눌러 deltaMs=0(Perfect 후보).
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

describe("trillZone 경계의 교대 추적 초기화", () => {
  const lane: Lane = 1;

  it("다른 trillZone의 첫 노트에서 이전 구간과 같은 키를 사용해도 goodTrill이 발생하지 않는다", () => {
    // trillZone 1: 1000ms 시작, 노트 1000ms / 1200ms
    // trillZone 2: 2000ms 시작, 노트 2000ms / 2200ms
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
    expect(judgments[2].grade).toBe(JudgmentGrade.PERFECT); // 구간2 첫 노트 — goodTrill 아님
    expect(judgments[3].grade).toBe(JudgmentGrade.PERFECT); // 구간2 교대 성공
  });

  it("같은 trillZone 내에서 같은 키 연속 입력 시 goodTrill 발생", () => {
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

  it("trillZone 경계에서 교대 추적 상태가 초기화된다", () => {
    // trillZone 1: 노트 1000ms에서 KeyA 입력
    // trillZone 2: 노트 3000ms에서 KeyA 입력 — 리셋 후이므로 교대 성공
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
    expect(judgments[1].grade).toBe(JudgmentGrade.PERFECT); // goodTrill 아님
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

  it("다른 레인의 trillZone 시작은 해당 레인의 교대 추적에만 영향", () => {
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
    engine.onLanePress(lane1, 1200, "KeyA"); // lane1에서 같은 키 → goodTrill

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

describe("trillZone 경계 입력 추적 보호", () => {
  const lane: Lane = 1;

  it("trillZone 직전 노트를 늦게 쳐서 trillZone 안에서 처리해도 교대 추적에 기록되지 않는다", () => {
    // 이전 trillZone: 노트 1900ms (구간 1500ms 시작)
    // 새 trillZone: 2000ms 시작, 노트 2000ms / 2200ms
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

  it("trillZone 시작과 동시에 등장한 트릴 노트를 일찍 쳐서 구간 밖에서 처리해도 교대 추적이 정상 동작한다", () => {
    // trillZone: 2000ms 시작, 노트 2000ms / 2200ms
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

  it("트릴 노트를 일찍 쳐서 구간 밖에서 처리했을 때 교대 추적이 기록되어 같은 키 연속 시 goodTrill 발생", () => {
    // trillZone: 2000ms 시작, 노트 2000ms / 2200ms
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

  it("연속 trillZone에서 이전 구간 노트의 늦은 입력이 새 구간의 교대 판정을 오염시키지 않는다", () => {
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
    expect(judgments[1].grade).toBe(JudgmentGrade.PERFECT); // goodTrill 아님
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

  it("더블 롱노트에서 끝점 도달 시 키 유지 중이면 릴리즈 대기 후 정상 termination 판정", () => {
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

  it("윈도우 내내 안 눌리고 +130에 처음 누르면 관측 프레임이 늦어도(+135) Miss — 윈도우 밖에서 시작한 홀드는 충족 아님", () => {
    // 슬라이드 전이는 입력 이벤트 경계(pre-mutation)에서도 평가된다. 늦은 keydown은 자신이
    // 홀드 상태를 바꾸기 전에 타임아웃이 먼저 닫아, 프레임이 밀려도 Perfect를 주장할 수 없다 (슬라이스6 P1).
    const { engine, judgments } = slideSetup();
    engine.update(noteTime);
    engine.update(noteTime + 115); // 윈도우 내 마지막 프레임 — 안 눌림
    engine.onLanePress(lane, noteTime + 130, "KeyA"); // 윈도우(+120) 밖 첫 홀드
    engine.update(noteTime + 135); // 타임아웃 프레임이 홀드보다 늦게 도착
    expect(judgments).toHaveLength(1);
    expect(judgments[0].grade).toBe(JudgmentGrade.MISS);
  });

  it("-10에 눌러 +10에 뗐으면 노트 시점에 held — 사이에 관측 프레임이 없어도 Perfect (release가 전이를 관측)", () => {
    // 뗌 직전 홀드 상태로 전이를 평가하므로, noteTime을 걸친 짧은 홀드가 프레임 스톨로 유실되지 않는다 (슬라이스6 P1).
    const { engine, judgments } = slideSetup();
    engine.update(900);
    engine.onLanePress(lane, noteTime - 10, "KeyA");
    engine.onLaneRelease(lane, noteTime + 10, "KeyA"); // noteTime 관측 프레임 없이 뗌
    engine.update(noteTime + 125);
    expect(judgments).toHaveLength(1);
    expect(judgments[0].grade).toBe(JudgmentGrade.PERFECT);
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

describe("헤드 없는 슬라이드 keydown consume — 직후 포인트 보호 (RFD 0006)", () => {
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

  it("슬라이드를 입력 1번으로 탭하면 그 keydown은 슬라이드만 consume하고 직후 포인트는 판정되지 않음", () => {
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
    engine.onLanePress(lane, slideTime, "KeyA"); // 슬라이드 consume
    engine.onLanePress(lane, slideTime, "KeyB"); // 슬라이드 consume 종료됨 → 포인트로
    engine.update(slideTime + 10);
    const slideJ = judgments.find((j) => j.noteIndex === 0);
    expect(slideJ?.grade).toBe(JudgmentGrade.PERFECT);
    const pointJ = judgments.find((j) => j.noteIndex === 1);
    expect(pointJ?.grade).toBe(JudgmentGrade.GOOD);
    expect(pointJ?.deltaMs).toBe(-100);
  });

  it("a를 미리 눌러 슬라이드 시점에 held이면 슬라이드는 a로 충족되고 b 입력은 포인트 early Good(-100)", () => {
    const { engine, judgments } = slideThenPointSetup();
    engine.onLanePress(lane, 800, "KeyA"); // 윈도우 밖에서 미리 누름 → consume 안 됨, held만
    engine.update(slideTime); // 노트 시점 held → 슬라이드 Perfect + consume 종료
    engine.onLanePress(lane, slideTime, "KeyB"); // 슬라이드는 이미 종료 → 포인트로
    const slideJ = judgments.find((j) => j.noteIndex === 0);
    expect(slideJ?.grade).toBe(JudgmentGrade.PERFECT);
    const pointJ = judgments.find((j) => j.noteIndex === 1);
    expect(pointJ?.grade).toBe(JudgmentGrade.GOOD);
    expect(pointJ?.deltaMs).toBe(-100);
  });

  it("+120 keydown은 소비 윈도우 경계 포함이라 슬라이드가 consume — 포인트(delta +20 Perfect)로 안 샘", () => {
    const { engine, judgments } = slideThenPointSetup();
    engine.update(slideTime);
    engine.onLanePress(lane, slideTime + 120, "KeyA"); // 정확히 +120 — [−Good,+Good] 경계 포함
    expect(judgments.some((j) => j.noteIndex === 1)).toBe(false); // 포인트로 안 샘
    engine.update(slideTime + 125);
    expect(judgments.find((j) => j.noteIndex === 0)?.grade).toBe(JudgmentGrade.PERFECT);
  });

  it("+121 keydown은 소비 윈도우 밖 — 포인트 Perfect(+21)로 가고 슬라이드는 Miss (이중 크레딧 없음)", () => {
    const { engine, judgments } = slideThenPointSetup();
    engine.update(slideTime);
    engine.update(slideTime + 115);
    engine.onLanePress(lane, slideTime + 121, "KeyA"); // 소비 윈도우 밖 → 포인트가 가져감
    const pointJ = judgments.find((j) => j.noteIndex === 1);
    expect(pointJ?.grade).toBe(JudgmentGrade.PERFECT);
    expect(pointJ?.deltaMs).toBe(21);
    engine.update(slideTime + 125); // 홀드 중이지만 홀드 시작이 윈도우 밖 → 슬라이드 Miss
    expect(judgments.find((j) => j.noteIndex === 0)?.grade).toBe(JudgmentGrade.MISS);
  });

  it("-120 keydown은 소비 윈도우 경계 포함이라 슬라이드가 consume — Bad 경계(-160)의 포인트(1040)로 안 샘", () => {
    const notes = [makeSlideNote(lane, beat(0, 1)), makeSingleNote(lane, beat(1, 1))];
    const { engine, judgments } = setup(notes, new Map([[0, slideTime], [1, 1040]]), new Map([[0, slideTime]]));
    engine.update(870);
    engine.onLanePress(lane, 880, "KeyA"); // 정확히 -120
    expect(judgments.some((j) => j.noteIndex === 1)).toBe(false); // 포인트로 안 샘
    engine.update(slideTime);
    expect(judgments.find((j) => j.noteIndex === 0)?.grade).toBe(JudgmentGrade.PERFECT);
  });

  it("a를 미리 눌러 held인데 윈도우 진입 후 update 프레임 없이 b(1000ms)를 쳐도 b는 포인트 early Good(-100) — held 충족은 keydown 시점 즉석 평가", () => {
    // held 충족 소비 표시(checkLengthZeroHoldOnly)는 update 프레임에서만 일어난다. 프레임 스톨로
    // 윈도우 진입(880)~keydown 사이에 프레임이 없으면 이미 충족된 슬라이드가 b를 삼킨다
    // (async keydown vs rAF update 클래스, 슬라이스6 P2). 충족은 keydown 도착 시점의
    // 실제 홀드 상태로 즉석 평가되어야 프레임 독립이다.
    const { engine, judgments } = slideThenPointSetup();
    engine.onLanePress(lane, 800, "KeyA"); // 윈도우 밖 미리 누름 — held만
    engine.update(870); // 마지막 프레임이 윈도우 진입(880) 직전 — 이후 프레임 스톨
    engine.onLanePress(lane, slideTime, "KeyB"); // 프레임 없이 도착 — a held로 슬라이드는 충족 상태
    engine.update(slideTime + 5);
    engine.update(1300); // 포인트 윈도우 종료
    const slideJ = judgments.find((j) => j.noteIndex === 0);
    expect(slideJ?.grade).toBe(JudgmentGrade.PERFECT);
    const pointJ = judgments.find((j) => j.noteIndex === 1);
    expect(pointJ?.grade).toBe(JudgmentGrade.GOOD);
    expect(pointJ?.deltaMs).toBe(-100);
  });

  it("a를 슬라이드 윈도우 안에서 미리(980ms) 떼면 슬라이드는 뗀 시점에 Perfect, b는 포인트 정타 Perfect", () => {
    const { engine, judgments } = slideThenPointSetup();
    engine.onLanePress(lane, 900, "KeyA"); // 슬라이드 consume
    engine.onLaneRelease(lane, 980, "KeyA"); // 노트 시점 직전 윈도우 내 완전 릴리즈
    engine.onLanePress(lane, pointTime, "KeyB"); // 포인트 정타
    const slideJ = judgments.find((j) => j.noteIndex === 0);
    expect(slideJ?.grade).toBe(JudgmentGrade.PERFECT);
    const pointJ = judgments.find((j) => j.noteIndex === 1);
    expect(pointJ?.grade).toBe(JudgmentGrade.PERFECT);
  });
});

describe("헤드 없는 길이>0 롱노트 consume — 직후 포인트 보호와 홀드 중 탭 (RFD 0006)", () => {
  const lane: Lane = 1;

  /** 헤드 없는 롱노트(idx0, 1000~2000) + 직후 포인트(idx1, 1100) */
  function headlessLongThenPointSetup() {
    const notes = [makeLongNote(lane, beat(0, 1), beat(8, 1)), makeSingleNote(lane, beat(1, 1))];
    const noteTimesMs = new Map([[0, 1000], [1, 1100]]);
    const noteEndTimesMs = new Map([[0, 2000]]);
    return setup(notes, noteTimesMs, noteEndTimesMs);
  }

  it("롱노트 시작 탭은 롱노트가 consume해 직후 포인트로 새지 않고, 포인트는 자기 윈도우 종료 시 Miss", () => {
    const { engine, judgments } = headlessLongThenPointSetup();
    engine.onLanePress(lane, 1000, "KeyA"); // 롱노트 시작 (consume)
    engine.update(1000);
    // 직후 포인트는 consume 안 됨 — 아직 미판정 (early Good로 새지 않음)
    expect(judgments.some((j) => j.noteIndex === 1)).toBe(false);
    engine.update(1100 + 170); // 포인트 윈도우 종료 (롱노트는 계속 held)
    const pointJ = judgments.find((j) => j.noteIndex === 1);
    expect(pointJ?.grade).toBe(JudgmentGrade.MISS);
  });

  it("a를 미리 홀드해 시작이 충족될 롱노트는 noteTime 전(990ms) b 입력을 삼키지 않고 포인트 early Good(-110)로 보낸다", () => {
    // 길이>0 헤드없는 롱은 활성화(update, noteTime) 전까지 소비 후보로 남는데, 이미 레인을
    // 홀드 중이면 필요 키 수(1)가 held로 충족된 상태다(RFD 0006 §3.1 "held로 충족하는 것 포함").
    // 충족 평가가 없으면 990ms 탭은 삼켜지고 1010ms 탭은 통과하는 시작경계 비일관이 생긴다 (슬라이스6 P2).
    const { engine, judgments } = headlessLongThenPointSetup();
    engine.onLanePress(lane, 800, "KeyA"); // 미리 홀드 — 활성화 시 이 홀드가 시작을 충족(시작조건 P4)
    engine.update(900); // 프레임 정상 순회 — 레이스가 아니라 규칙 부재임을 보인다
    engine.update(980);
    engine.onLanePress(lane, 990, "KeyB"); // noteTime 전 -10, 롱 소비 윈도우 내 + 포인트 윈도우 내(-110)
    engine.update(1000); // 활성화 — a(+b) held로 시작 충족
    const pointJ = judgments.find((j) => j.noteIndex === 1);
    expect(pointJ?.grade).toBe(JudgmentGrade.GOOD);
    expect(pointJ?.deltaMs).toBe(-110);
  });

  it("롱을 A(950)로 consume한 뒤 떼고 B(990)를 치면 소비 종료된 롱을 통과해 포인트 early Good(-110) — B의 홀드는 롱 시작도 충족", () => {
    // consume 종료(필요 키 수 충족)는 키를 떼도 유지된다 — 후속 keydown은 다음 노트로 (슬라이스6 P3).
    const { engine, judgments } = headlessLongThenPointSetup();
    engine.onLanePress(lane, 950, "KeyA"); // 롱 consume (필요 1 충족 → 종료)
    engine.onLaneRelease(lane, 970, "KeyA");
    engine.onLanePress(lane, 990, "KeyB"); // 종료된 롱 통과 → 포인트로
    const pointJ = judgments.find((j) => j.noteIndex === 1);
    expect(pointJ?.grade).toBe(JudgmentGrade.GOOD);
    expect(pointJ?.deltaMs).toBe(-110);
    engine.update(1000); // B 홀드로 롱 시작 충족 (헤드 있는 롱의 "헤드 판정 + 바디 홀드"와 같은 모양)
    engine.update(2000);
    engine.onLaneRelease(lane, 2000, "KeyB");
    expect(judgments.filter((j) => j.grade === JudgmentGrade.MISS)).toHaveLength(0);
  });

  it("롱을 A(950)로 consume한 뒤 떼고 같은 A(990)를 재탭해도 소비 종료된 롱은 재consume하지 않아 포인트 early Good(-110)", () => {
    const { engine, judgments } = headlessLongThenPointSetup();
    engine.onLanePress(lane, 950, "KeyA");
    engine.onLaneRelease(lane, 970, "KeyA");
    engine.onLanePress(lane, 990, "KeyA"); // 같은 키 재탭
    const pointJ = judgments.find((j) => j.noteIndex === 1);
    expect(pointJ?.grade).toBe(JudgmentGrade.GOOD);
    expect(pointJ?.deltaMs).toBe(-110);
  });

  it("홀드 중(1500ms) 다른 키로 친 입력은 롱노트에 consume되지 않고 같은 시점 포인트로 간다", () => {
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

describe("헤드 있는 롱노트는 헤드만 consume해 더블/직후 포인트 오consume가 없다 (RFD 0006)", () => {
  const lane: Lane = 1;

  it("시작 시각에 헤드 포인트가 겹친 롱노트는 consume 후보가 아니어서, keydown은 헤드만 판정하고 직후 포인트를 추가 consume하지 않는다", () => {
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
    // 헤드만 판정, 직후 포인트(idx2)는 미consume
    expect(judgments.some((j) => j.noteIndex === 1)).toBe(true);
    expect(judgments.some((j) => j.noteIndex === 2)).toBe(false);
  });

  it("헤드 keydown이 헤드를 판정하고 그 홀드로 바디가 시작돼 끝점까지 완주 — 헤드+끝 정확히 2판정", () => {
    // 헤드있는 롱의 전체 수명: 바디(idx0)는 입력 후보에서 빠지고 헤드(idx1) keydown이 판정을 대표하되,
    // 그 홀드가 바디 시작(hasBeenPressed)을 수락시켜 끝점 종결까지 이어져야 한다. 기존 1529는 시작 직후만 봄.
    const notes = [
      makeLongNote(lane, beat(0, 1), beat(8, 1)), // idx0 바디 1000~3000
      makeSingleNote(lane, beat(0, 1)),           // idx1 헤드 1000
    ];
    const noteTimesMs = new Map([[0, 1000], [1, 1000]]);
    const noteEndTimesMs = new Map([[0, 3000]]);
    const { engine, judgments } = setup(notes, noteTimesMs, noteEndTimesMs);

    engine.onLanePress(lane, 1000, "KeyA");   // 헤드 판정 + 홀드 시작
    engine.update(1000);                      // 바디 활성화 + 시작 수락(isHeld)
    engine.update(3000);                      // 끝점 도달, 키 유지 → 릴리즈 대기
    engine.onLaneRelease(lane, 3000, "KeyA"); // 끝점 종결

    expect(judgments.filter((j) => j.grade === JudgmentGrade.MISS)).toHaveLength(0);
    expect(judgments.find((j) => j.noteIndex === 1)?.grade).toBe(JudgmentGrade.PERFECT); // 헤드
    expect(judgments.find((j) => j.noteIndex === 0)?.grade).toBe(JudgmentGrade.PERFECT); // 바디/끝
    expect(judgments).toHaveLength(2); // 헤드 + 끝, 바디 keydown 중복 판정 없음
  });
});

describe("헤드 판정 캐시 경계 — ±1ms tolerance·레인·트릴 헤드 (슬라이스6 P4)", () => {
  const lane: Lane = 1;

  it("시작+1ms 포인트는 헤드로 인정(tolerance 포함) — keydown(1000)은 헤드 판정 Perfect로 가고 롱이 삼키지 않음", () => {
    const notes = [makeLongNote(lane, beat(0, 1), beat(4, 1)), makeSingleNote(lane, beat(0, 1))];
    const { engine, judgments } = setup(notes, new Map([[0, 1000], [1, 1001]]), new Map([[0, 2000]]));
    engine.onLanePress(lane, 1000, "KeyA");
    expect(judgments.find((j) => j.noteIndex === 1)?.grade).toBe(JudgmentGrade.PERFECT);
  });

  it("시작+2ms 포인트는 헤드가 아님(tolerance 밖) — keydown(1000)은 헤드 없는 롱이 consume해 무판정", () => {
    const notes = [makeLongNote(lane, beat(0, 1), beat(4, 1)), makeSingleNote(lane, beat(0, 1))];
    const { engine, judgments } = setup(notes, new Map([[0, 1000], [1, 1002]]), new Map([[0, 2000]]));
    engine.onLanePress(lane, 1000, "KeyA");
    // 헤드로 오인했다면 롱이 후보에서 빠져 포인트(delta -2 Perfect)가 떴을 것
    expect(judgments).toHaveLength(0);
  });

  it("다른 레인(L2) 동시각 포인트는 헤드가 아님 — L1 keydown(1000)은 롱이 consume해 L1 직후 포인트(1100)로 안 샘", () => {
    const lane2: Lane = 2;
    const notes = [
      makeLongNote(lane, beat(0, 1), beat(4, 1)), // L1 롱 1000~2000
      makeSingleNote(lane2, beat(0, 1)), // L2 포인트 1000 (헤드 아님)
      makeSingleNote(lane, beat(1, 1)), // L1 직후 포인트 1100
    ];
    const { engine, judgments } = setup(
      notes,
      new Map([[0, 1000], [1, 1000], [2, 1100]]),
      new Map([[0, 2000]]),
    );
    engine.onLanePress(lane, 1000, "KeyA");
    // 헤드로 오인해 롱이 빠지면 keydown이 L1 직후 포인트(delta -100 Good)로 샜을 것
    expect(judgments).toHaveLength(0);
  });

  it("같은 레인 동시각 트릴 포인트는 헤드로 인정 — keydown(1000)은 트릴 판정 Perfect로 가고 롱이 삼키지 않음 (trillLong 구조 정합)", () => {
    // 롱을 idx0에 앞세움 — 캐시가 트릴을 헤드로 못 보면 tie-break(인덱스 순)로 롱이 먼저 삼킨다
    const notes = [makeLongNote(lane, beat(0, 1), beat(4, 1)), makeTrillNote(lane, beat(0, 1))];
    const { engine, judgments } = setup(notes, new Map([[0, 1000], [1, 1000]]), new Map([[0, 2000]]));
    engine.onLanePress(lane, 1000, "KeyA");
    expect(judgments.find((j) => j.noteIndex === 1)?.grade).toBe(JudgmentGrade.PERFECT);
  });
});

describe("헤드 없는 더블 롱노트 2키 consume (RFD 0006)", () => {
  const lane: Lane = 1;

  /** 헤드 없는 더블 롱노트(idx0, 1000~2000) + 직후 포인트(idx1, 1100) */
  function headlessDoubleLongThenPointSetup() {
    const notes = [makeDoubleLongNote(lane, beat(0, 1), beat(8, 1)), makeSingleNote(lane, beat(1, 1))];
    const noteTimesMs = new Map([[0, 1000], [1, 1100]]);
    const noteEndTimesMs = new Map([[0, 2000]]);
    return setup(notes, noteTimesMs, noteEndTimesMs);
  }

  it("서로 다른 두 키를 시작 시각에 누르면 둘 다 consume돼 직후 포인트는 보호되고, 셋째 입력이 포인트로 간다", () => {
    const { engine, judgments } = headlessDoubleLongThenPointSetup();
    engine.onLanePress(lane, 1000, "KeyA"); // 1키째 consume (미충족, 후보 유지)
    engine.onLanePress(lane, 1000, "KeyB"); // 2키째 consume (충족, consume 종료)
    engine.update(1000); // 더블 롱노트 BODY_ACTIVE (2키 추적)
    expect(judgments.some((j) => j.noteIndex === 1)).toBe(false); // 직후 포인트 보호
    engine.onLanePress(lane, 1100, "KeyC"); // consume 종료된 뒤 → 포인트로
    expect(judgments.find((j) => j.noteIndex === 1)?.grade).toBe(JudgmentGrade.PERFECT); // delta 0
  });

  it("더블 롱을 a 홀드(800)+b 탭(1000) 혼합으로 채우면 c(1005)는 활성화 프레임 전이라도 포인트 early Good(-95)로 간다", () => {
    // 필요 키 수 2는 "consume한 키 ∪ 현재 홀드 키" 합집합으로 즉석 평가된다 (P2 규칙 × P3 통과).
    const { engine, judgments } = headlessDoubleLongThenPointSetup();
    engine.onLanePress(lane, 800, "KeyA"); // held — 필요 2 중 1을 홀드로
    engine.update(900);
    engine.onLanePress(lane, 1000, "KeyB"); // keydown consume — 2/2 충족, 종료
    engine.onLanePress(lane, 1005, "KeyC"); // 활성화 update 전 — 그래도 종료 평가로 통과
    const pointJ = judgments.find((j) => j.noteIndex === 1);
    expect(pointJ?.grade).toBe(JudgmentGrade.GOOD);
    expect(pointJ?.deltaMs).toBe(-95);
  });

  it("첫 keydown 하나만으로는 consume 종료되지 않아 둘째 keydown도 더블 롱노트가 consume한다 (포인트로 안 샘)", () => {
    const { engine, judgments } = headlessDoubleLongThenPointSetup();
    engine.onLanePress(lane, 1000, "KeyA"); // 1키째 — 아직 미충족
    engine.onLanePress(lane, 1000, "KeyB"); // 더블 롱노트(1000)가 포인트(1100)보다 이르므로 둘째도 consume
    engine.update(1010);
    // 만약 1키만으로 consume 종료됐다면 둘째가 포인트로 새 early Good이 떴을 것 — 떠선 안 됨
    expect(judgments.some((j) => j.noteIndex === 1)).toBe(false);
  });

  it("같은 키를 두 번 누르면 consume 키 수가 1로 유지되어 consume 종료되지 않는다", () => {
    const { engine, judgments } = headlessDoubleLongThenPointSetup();
    engine.onLanePress(lane, 1000, "KeyA"); // 1키째
    engine.onLanePress(lane, 1000, "KeyA"); // 같은 키 — 집합 크기 1 유지(무효)
    engine.onLanePress(lane, 1000, "KeyB"); // 2키째(다른 키) → consume 종료
    engine.update(1000);
    expect(judgments.some((j) => j.noteIndex === 1)).toBe(false); // 포인트 보호 유지
    engine.onLanePress(lane, 1100, "KeyC"); // consume 종료 후 → 포인트
    expect(judgments.find((j) => j.noteIndex === 1)?.grade).toBe(JudgmentGrade.PERFECT);
  });

  it("비동시 2키 입력(A를 떼고 B)이어도 두 keydown을 consume해 직후 포인트를 보호한다 (더블 홀드 자체는 비동시라 부분 실패)", () => {
    const { engine, judgments } = headlessDoubleLongThenPointSetup();
    engine.onLanePress(lane, 1000, "KeyA"); // 1키째 consume
    engine.onLaneRelease(lane, 1005, "KeyA"); // A를 뗌 (비동시)
    engine.onLanePress(lane, 1008, "KeyB"); // 2키째 consume — 포인트로 새지 않음
    engine.update(1010); // 더블 롱노트 활성화 (동시 2키 아님)
    expect(judgments.some((j) => j.noteIndex === 1)).toBe(false); // 직후 포인트 보호
    engine.update(1100 + 170); // 포인트 윈도우 종료
    // 두 keydown이 모두 consume돼 포인트는 early로 안 새고, 안 쳐서 Miss (보호 성립)
    expect(judgments.find((j) => j.noteIndex === 1)?.grade).toBe(JudgmentGrade.MISS);
  });

  it("더블 헤드(D)가 있는 더블 롱노트는 consume 후보가 아니어서 헤드가 입력을 받고 직후 포인트는 미consume", () => {
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
    expect(judgments.some((j) => j.noteIndex === 2)).toBe(false); // 직후 포인트 미consume
  });
});

describe("릴리즈 노트(길이 0 일반) keydown consume — 직후 포인트 보호 (RFD 0006)", () => {
  const lane: Lane = 1;

  /** 릴리즈 노트(idx0, 1000, 길이0 non-holdOnly) + 직후 포인트(idx1, 1100) */
  function releaseThenPointSetup() {
    const notes = [makeLongNote(lane, beat(0, 1), beat(0, 1)), makeSingleNote(lane, beat(1, 1))];
    const noteTimesMs = new Map([[0, 1000], [1, 1100]]);
    const noteEndTimesMs = new Map([[0, 1000]]); // 길이 0
    return setup(notes, noteTimesMs, noteEndTimesMs);
  }

  it("누르고 떼는 릴리즈 노트: keydown은 릴리즈 노트가 consume하고 keyup으로 판정, 직후 포인트는 보호된다", () => {
    const { engine, judgments } = releaseThenPointSetup();
    engine.onLanePress(lane, 1000, "KeyA"); // keydown consume (판정 emit 없음)
    engine.update(1000); // 길이0 일반 → BODY_AWAITING_RELEASE
    engine.onLaneRelease(lane, 1010, "KeyA"); // keyup → termination 판정
    expect(judgments.find((j) => j.noteIndex === 0)?.grade).toBe(JudgmentGrade.PERFECT); // delta +10
    expect(judgments.some((j) => j.noteIndex === 1)).toBe(false); // 포인트 미consume
    engine.onLanePress(lane, 1100, "KeyB"); // consume 종료 후 → 포인트 정타
    expect(judgments.find((j) => j.noteIndex === 1)?.grade).toBe(JudgmentGrade.PERFECT);
  });

  it("keydown(-50)은 소비돼 무판정으로 포인트를 보호하고, 800부터 홀드한 경우도 새 keydown 없이 keyup(+30)만으로 Perfect", () => {
    // 소비 윈도우 전 진입(held만)과 윈도우 내 keydown 소비 두 변형 모두 keyup이 판정 전담 (RFD 0006 §3.4)
    const { engine, judgments } = releaseThenPointSetup();
    engine.onLanePress(lane, 950, "KeyA"); // 소비 — 직후 포인트로 안 샘
    expect(judgments).toHaveLength(0);
    engine.update(1000);
    engine.onLaneRelease(lane, 1030, "KeyA");
    expect(judgments.find((j) => j.noteIndex === 0)?.grade).toBe(JudgmentGrade.PERFECT);
    expect(judgments.some((j) => j.noteIndex === 1)).toBe(false);
  });

  it("노트 시점 전 keyup(-30)도 끝점 ±Good 윈도우 내이므로 Perfect — 활성화 상태와 무관 (RFD 0015 §3, 슬라이스6 P5)", () => {
    const { engine, judgments } = releaseThenPointSetup();
    engine.update(900);
    engine.onLanePress(lane, 920, "KeyA"); // 소비
    engine.onLaneRelease(lane, 970, "KeyA"); // 끝점(1000) 기준 -30 — 활성화(1000) 전
    engine.update(1130);
    expect(judgments.find((j) => j.noteIndex === 0)?.grade).toBe(JudgmentGrade.PERFECT);
  });

  it("노트 시점 직후 keyup(+10)이 활성화 update 프레임보다 먼저 도착해도 Perfect (async keyup vs rAF, 슬라이스6 P5)", () => {
    const { engine, judgments } = releaseThenPointSetup();
    engine.update(940); // 마지막 프레임이 noteTime 전 — 이후 스톨
    engine.onLanePress(lane, 950, "KeyA");
    engine.onLaneRelease(lane, 1010, "KeyA"); // BODY_AWAITING_RELEASE 전환 전 도착
    engine.update(1130);
    expect(judgments.find((j) => j.noteIndex === 0)?.grade).toBe(JudgmentGrade.PERFECT);
  });

  it("A(950) 소비 후 B(990) 탭은 소비 종료된 릴리즈 노트를 통과해 포인트 early Good(-110), A keyup(+10)은 릴리즈 Perfect", () => {
    const { engine, judgments } = releaseThenPointSetup();
    engine.onLanePress(lane, 950, "KeyA"); // 소비 (1/1 충족)
    engine.onLanePress(lane, 990, "KeyB"); // 종료된 릴리즈 노트 통과 → 포인트
    const pointJ = judgments.find((j) => j.noteIndex === 1);
    expect(pointJ?.grade).toBe(JudgmentGrade.GOOD);
    expect(pointJ?.deltaMs).toBe(-110);
    engine.update(1000);
    engine.onLaneRelease(lane, 1010, "KeyA");
    expect(judgments.find((j) => j.noteIndex === 0)?.grade).toBe(JudgmentGrade.PERFECT);
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

  it("1키 consume 후 update가 끼어도 둘째 키는 더블 슬라이드가 consume하고 직후 포인트로 새지 않는다", () => {
    // 더블 슬라이드(idx0, 1000) + 직후 포인트(idx1, 1100). held-marker가 1키만으로 consume 종료시키면 누설.
    const notes = [makeDoubleSlide(lane, beat(0, 1)), makeSingleNote(lane, beat(1, 1))];
    const noteTimesMs = new Map([[0, noteTime], [1, 1100]]);
    const noteEndTimesMs = new Map([[0, noteTime]]);
    const { engine, judgments } = setup(notes, noteTimesMs, noteEndTimesMs);
    engine.onLanePress(lane, noteTime, "KeyA"); // 1키 consume (size 1 < 2)
    engine.update(noteTime - 10); // held-marker: 1키만이라 미충족 → 조기 consume 종료 없음
    engine.onLanePress(lane, noteTime, "KeyB"); // 둘째 키 → 더블 슬라이드가 consume
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
    engine.update(2000); // connection 판정: KeyB held → Perfect
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

describe("hold-only 완료 후 놓기의 관대 재분류 — 놓기 keyup도 정당한 keyup 소비 이벤트 (RFD 0015 §7-3, 구 RFD 0008 도장 반전)", () => {
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
    engine.onLaneRelease(lane, 3000, "KeyA"); // L2 끝에서 뗌 → keyup 소비로 termination Perfect
    expect(judgments.find((j) => j.noteIndex === 1)?.grade).toBe(JudgmentGrade.PERFECT);
  });

  it("[기대값 반전] pre-held hold-only 완료 후 놓기도 직후 슬라이드 윈도우 내면 슬라이드 Perfect (§7-3)", () => {
    // KeyA를 consume 윈도우 밖(800ms)에 미리 누름 — 놓기 keyup은 의도 플레이와 물리적으로 동일한 이벤트
    const notes = [holdOnlyLong(beat(0, 1), beat(8, 1)), slide(beat(9, 1))];
    const t = new Map([[0, 1000], [1, 2050]]);
    const e = new Map([[0, 2000], [1, 2050]]);
    const { engine, judgments } = setup(notes, t, e);
    engine.onLanePress(lane, 800, "KeyA"); // pre-held (consume 안 됨)
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

  it("hold-only 완료 키를 안 떼고 이어서 .- 롱을 유지하면, 그 롱 끝 release로 정상 종결된다 (RFD 0012)", () => {
    // L1: hold-only A[1000~2000], 갭, 헤드없는 롱 B[2500~3000] (비연결). KeyA로 쭉 유지.
    const notes = [holdOnly(beat(0, 1), beat(8, 1)), makeLongNote(lane, beat(10, 1), beat(12, 1))];
    const t = new Map([[0, 1000], [1, 2500]]);
    const e = new Map([[0, 2000], [1, 3000]]);
    const { engine, judgments } = setup(notes, t, e);
    engine.onLanePress(lane, 1000, "KeyA"); // KeyA로 A 잡기 — 이후 안 뗌
    engine.update(1000); // A BODY_ACTIVE
    engine.update(2000); // A held Perfect (도장 없음 — RFD 0015)
    engine.update(2500); // B BODY_ACTIVE (KeyA pre-held로 유지 시작)
    engine.update(3000); // B 끝점 → BODY_AWAITING_RELEASE
    engine.onLaneRelease(lane, 3005, "KeyA"); // B 종결 시도
    engine.update(3200); // 미종결이면 타임아웃 확정
    expect(judgments.find((j) => j.noteIndex === 1)?.grade).toBe(JudgmentGrade.PERFECT);
  });

  it("A 끝점과 B 바디 시작이 한 프레임에 겹쳐도 B는 정상 종결된다 (RFD 0012 프레임 독립성)", () => {
    // 좁은 갭: A[1000~2000], B[2016~3000]. [2000,2016) 사이에 프레임이 안 떨어지면
    // 한 프레임(2016)이 A 끝점 완료(부여)와 B 바디 시작(회수)을 함께 덮는다 — 30fps 흔들림급.
    const notes = [holdOnly(beat(0, 1), beat(8, 1)), makeLongNote(lane, beat(10, 1), beat(12, 1))];
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
    engine.update(2050); // S 슬라이드 held Perfect (keyup 소비 없음 — held 완료)
    engine.onLaneRelease(lane, 2060, "KeyA"); // B 지각 종결 (delta +60, 윈도우 내)
    engine.update(2200); // 미종결이면 타임아웃 확정
    expect(judgments.find((j) => j.noteIndex === 0)?.grade).toBe(JudgmentGrade.PERFECT); // B 종결(지각 상향)
    expect(judgments.find((j) => j.noteIndex === 1)?.grade).toBe(JudgmentGrade.PERFECT); // S도 Perfect
  });

  it("[기대값 반전] 중간 슬라이드가 held로 끼어도, 타임아웃 Miss 후 놓기 keyup은 다음 슬라이드 윈도우 내면 그 슬라이드를 살린다 (구 RFD 0012 도장 차단 반전)", () => {
    // B 일반 롱[1000~2000], S1 슬라이드 2050(held 완료 — keyup 소비 없음), S2 슬라이드 2250.
    // B는 keyup 없이 타임아웃(2120 초과)으로 Miss. 그 뒤 2200 놓기 keyup은 살아있는 이벤트 —
    // S2 윈도우 [2130, 2250) 안이므로 S2 Perfect (RFD 0015 §7-3 관대 재분류).
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
    engine.update(2050); // S1 슬라이드 held 완료 Perfect
    engine.update(2170); // B 타임아웃(>2120) → Miss, COMPLETE (keyup 아님!)
    engine.onLaneRelease(lane, 2200, "KeyA"); // 놓기 keyup — S2 윈도우 내
    engine.update(2400);
    expect(judgments.find((j) => j.noteIndex === 0)?.grade).toBe(JudgmentGrade.MISS); // B는 타임아웃 Miss 그대로
    expect(judgments.find((j) => j.noteIndex === 1)?.grade).toBe(JudgmentGrade.PERFECT); // S1 held
    expect(judgments.find((j) => j.noteIndex === 2)?.grade).toBe(JudgmentGrade.PERFECT); // S2는 놓기가 살림 (§7-3)
  });

  it("hold-only 더블롱을 2키로 유지 완료 후 안 떼고 이어서 더블롱 B 유지, 분할 릴리즈로 B 양쪽 정상 종결 (RFD 0012 doubleLong)", () => {
    // A: hold-only 더블롱[1000~2000](KeyA+KeyB 유지), 갭, 일반 더블롱 B[2500~3000]. 2키 계속 유지 후 B 끝에서 분할 릴리즈.
    // 도장 폐지(RFD 0015) 후 keyup은 keyup 소비(consumeReleaseTarget)로 즉시 키별 종결된다. 이중화는 유지:
    // updateDoubleLongKeyRelease가 lastReleaseTimeMs를 무조건 기록하고, update 폴백(judgeDoubleLongEndpoint)이
    // 같은 시각으로 같은 등급을 재판정할 수 있다. 이 테스트는 분할 릴리즈의 등급 결과를 잠근다.
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
    // keyup 소비(consumeReleaseTarget)가 keyup 시점에 즉시 키별 종결을 emit해야 한다(primary).
    // 폴백(judgeDoubleLongEndpoint)으로 emit이 다음 update 프레임까지 지연되면 이 단언이 잡는다(silent→loud).
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
    // idx0 = 헤드 더블(1000), idx1 = 바디 더블롱[1000~2000]. 헤드는 keydown을 consume해 판정, 바디는 held 독립 추적.
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
    // keyup 소비 매칭(consumeReleaseTarget)의 대상이 아예 아니다(connectionSources 제외). 이 테스트는 연결 등급을 잠근다.
    const notes = [DLONG(beat(0, 1), beat(8, 1)), DLONG(beat(8, 1), beat(16, 1))];
    const t = new Map([[0, 1000], [1, 2000]]);
    const e = new Map([[0, 2000], [1, 3000]]);
    const { engine, judgments } = setup(notes, t, e);
    engine.onLanePress(lane, 1000, "KeyA");
    engine.onLanePress(lane, 1005, "KeyB");
    engine.update(1010); // A 2키 추적
    engine.update(2000); // A 끝점=B 시작 → A connection 판정 (held → Perfect×2)
    const a = judgments.filter((j) => j.noteIndex === 0);
    expect(a.length).toBe(2); // 키별 2판정
    expect(a.every((j) => j.grade === JudgmentGrade.PERFECT)).toBe(true);
  });
});

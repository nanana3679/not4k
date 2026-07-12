/**
 * JudgmentEngine — 4키 리듬 게임 판정 엔진
 *
 * 플레이어 입력을 노트와 매칭하여 판정을 생성하고, 콤보를 추적한다.
 */

import type { NoteEntity, RangeNote } from "../../shared/types";
import { isGraceNote, isHoldOnlyNote } from "../../shared/types";
import {
  JudgmentGrade,
  JUDGMENT_WINDOWS,
  GRACE_PERIOD_MS,
  NoteType,
} from "../../shared/constants";
import type { JudgmentWindows } from "../../shared/constants";
import type { Lane } from "../../shared/constants";
import { computeConnectionSources } from "./longNoteConnection";

/**
 * 판정 결과
 */
export interface JudgmentResult {
  /** 노트 인덱스 (notes 배열 기준) */
  noteIndex: number;
  /** 판정 등급 */
  grade: JudgmentGrade;
  /** 더블 노트의 경우 서브 판정 (0 또는 1) */
  subIndex?: number;
  /** 타이밍 차이 (ms, 양수 = 늦음, 음수 = 빠름) */
  deltaMs: number;
  /** 더블 롱노트 부분 실패 — 한쪽 키만 실패한 경우 */
  isPartialBodyFail?: boolean;
  /** 부분 실패 시 실패한 쪽 (key1=left, key2=right) */
  failedSide?: 'left' | 'right';
}

/**
 * 판정 엔진 콜백
 */
export interface JudgmentCallbacks {
  /** 판정이 생성되었을 때 호출 */
  onJudgment: (result: JudgmentResult) => void;
  /** 콤보가 갱신되었을 때 호출 */
  onComboUpdate: (combo: number, maxCombo: number) => void;
}

/**
 * 노트 처리 상태
 */
enum NoteState {
  /** 아직 처리되지 않음 */
  UNPROCESSED = "unprocessed",
  /** 헤드 판정 완료 (포인트 노트는 여기서 종료) */
  HEAD_JUDGED = "headJudged",
  /** 바디 활성 중 (롱노트만) */
  BODY_ACTIVE = "bodyActive",
  /** 바디 실패 (홀드 끊김) */
  BODY_FAILED = "bodyFailed",
  /** 끝점 도달, 키 유지 중 — 릴리즈 대기 (termination 판정) */
  BODY_AWAITING_RELEASE = "bodyAwaitingRelease",
  /** 완전히 처리 완료 */
  COMPLETE = "complete",
}

/**
 * 더블 노트 처리 상태
 */
interface DoubleNoteState {
  /** 첫 번째 입력을 받았는지 */
  firstInputReceived: boolean;
  /** 첫 번째 입력에 사용된 키 */
  firstKeyCode?: string;
  /** 첫 번째 입력의 판정 */
  firstGrade?: JudgmentGrade;
  /** 첫 번째 입력의 타이밍 차이 */
  firstDeltaMs?: number;
}

/**
 * 롱노트 바디 추적 상태
 */
interface LongNoteBodyState {
  /** 시작점 허용 구간 내에서 키가 눌린 적 있는지 */
  hasBeenPressed: boolean;
  /** 시작점 시간 (ms) */
  bodyStartTimeMs: number;
}

/**
 * 더블 롱노트의 키별 홀드 상태
 */
interface DoubleLongKeyState {
  /** 키1 (먼저 눌린 키). judged = 그 키의 최종 서브판정(바디 실패 또는 끝점)이 emit됨 */
  key1: { keyCode: string; failed: boolean; judged: boolean; lastReleaseTimeMs: number | null };
  /** 키2 (나중에 눌린 키) */
  key2: { keyCode: string; failed: boolean; judged: boolean; lastReleaseTimeMs: number | null };
}

/**
 * 레인별 홀드 상태
 */
interface LaneHoldState {
  /** 현재 키가 눌린 상태인지 */
  isHeld: boolean;
  /** 마지막으로 모든 키가 떼어진 시간 (grace period 체크용) */
  lastReleaseTimeMs: number | null;
  /** 현재 눌린 키들 */
  heldKeys: Set<string>;
}

/**
 * 판정 엔진
 */
export class JudgmentEngine {
  private readonly notes: readonly NoteEntity[];
  private readonly noteTimesMs: ReadonlyMap<number, number>;
  private readonly noteEndTimesMs: ReadonlyMap<number, number>;
  private readonly callbacks: JudgmentCallbacks;
  private readonly windows: JudgmentWindows;

  /** 노트별 처리 상태 */
  private readonly noteStates: Map<number, NoteState> = new Map();
  /** 더블 노트별 처리 상태 */
  private readonly doubleNoteStates: Map<number, DoubleNoteState> = new Map();
  /** 레인별 트릴 교대 추적 (마지막으로 누른 키) */
  private readonly trillAlternation: Map<Lane, string | null> = new Map();
  /** 레인별 trillZone 시작 시간 목록 (정렬됨, 구간 시작 시 교대 상태 리셋용) */
  private readonly trillZoneStartTimesMs: ReadonlyMap<Lane, readonly number[]>;
  /** 레인별 다음으로 처리할 trillZone 시작 인덱스 */
  private readonly trillZoneNextIndex: Map<Lane, number> = new Map();
  /** 레인별 현재 활성 trillZone의 시작 시간 (경계 입력 추적 판단용) */
  private readonly trillZoneCurrentStartMs: Map<Lane, number | null> = new Map();
  /** 레인별 홀드 상태 */
  private readonly laneHoldStates: Map<Lane, LaneHoldState> = new Map();
  /** 롱노트별 바디 추적 상태 */
  private readonly longNoteBodyStates: Map<number, LongNoteBodyState> = new Map();
  /** 더블 롱노트의 키별 홀드 상태 */
  private readonly doubleLongKeyStates: Map<number, DoubleLongKeyState> = new Map();
  /**
   * 노트별 "헤드 없는 롱노트" 여부 (생성자에서 1회 계산).
   * 같은 lane에 시작 시각이 일치하는 PointNote(헤드)가 없으면 헤드 없음 = true.
   * consume 대상은 NoteType.LONG(싱글, 필요 키 수 1)과 NoteType.DOUBLE_LONG(필요 키 수 2).
   */
  private readonly headlessLongCache: Map<number, boolean> = new Map();
  /**
   * 헤드 없는 롱노트가 consume한 keydown 키 집합 (노트별, 재consume·후보 제외용).
   * 필요 키 수(LONG 1 / DOUBLE_LONG 2)를 채우면 consume 종료 = 후보에서 빠진다.
   * 길이>0은 BODY_ACTIVE 승격으로도 빠지지만, keydown과 다음 update 사이 프레임,
   * 그리고 BODY 상태가 없는 길이 0 슬라이드/릴리즈 노트를 위해 이 Map으로 추적한다.
   * 슬라이드가 keydown 없이 held로 진입한 경우는 충족 시 실제 held 키들을 등록한다.
   *
   * 수명 폐포 (슬라이스6 P6): 등록은 UNPROCESSED에서만(markLongConsumed), 판독도
   * UNPROCESSED 게이트 뒤에서만(isHeadlessConsumable). 정리는 UNPROCESSED를 벗어나는
   * 모든 전이에서 — 활성화(BODY_ACTIVE), 슬라이드 완료 4종, termination(릴리즈 노트),
   * 슬라이드 미리-떼기, AWAITING 타임아웃. UNPROCESSED로 되돌아가는 경로는 없다
   * (재시작 = 새 엔진 인스턴스).
   */
  private readonly consumedLongKeys: Map<number, Set<string>> = new Map();
  /**
   * 끝점이 다음 롱노트로 이어지는 노트(connection 판정 대상) 인덱스 집합.
   * connection 정의의 단일 소유자 `longNoteConnection`이 계산한다 — 생성자에서 주입받거나(맵 로드 시
   * 1회) 미주입 시 내부에서 파생한다. 렌더러의 held 전파 뷰와 같은 계산에서 나오므로 항상 일치한다.
   */
  private readonly connectionSources: ReadonlySet<number>;

  private currentCombo = 0;
  private maxComboValue = 0;


  constructor(
    notes: readonly NoteEntity[],
    noteTimesMs: ReadonlyMap<number, number>,
    noteEndTimesMs: ReadonlyMap<number, number>,
    callbacks: JudgmentCallbacks,
    windows: JudgmentWindows = JUDGMENT_WINDOWS,
    trillZoneStartTimesMs: ReadonlyMap<Lane, readonly number[]> = new Map(),
    connectionSources?: ReadonlySet<number>,
  ) {
    this.notes = notes;
    this.noteTimesMs = noteTimesMs;
    this.noteEndTimesMs = noteEndTimesMs;
    this.callbacks = callbacks;
    this.windows = windows;
    this.trillZoneStartTimesMs = trillZoneStartTimesMs;
    // connection 관계는 맵 로드 시 1회 계산해 주입받는다. 미주입(단위 테스트 등)이면 같은 소유자에서 파생.
    this.connectionSources = connectionSources ?? computeConnectionSources(notes, noteTimesMs, noteEndTimesMs);

    // 모든 노트를 UNPROCESSED로 초기화
    for (let i = 0; i < notes.length; i++) {
      this.noteStates.set(i, NoteState.UNPROCESSED);
    }

    // 헤드 없는 싱글 롱노트 캐시 계산 (consume 후보 판정용)
    this.computeHeadlessLongCache();

    // 레인 홀드 상태 초기화
    for (const lane of [1, 2, 3, 4] as Lane[]) {
      this.laneHoldStates.set(lane, {
        isHeld: false,
        lastReleaseTimeMs: null,
        heldKeys: new Set(),
      });
      this.trillAlternation.set(lane, null);
      this.trillZoneNextIndex.set(lane, 0);
      this.trillZoneCurrentStartMs.set(lane, null);
    }
  }

  /**
   * 헤드 없는 롱노트 캐시 계산 (생성자 1회).
   *
   * 같은 lane의 PointNote 중 시작 시각이 1ms 이내로 일치하는 것이 있으면
   * "헤드 있음"(false), 없으면 "헤드 없음"(true). 부동소수 동일성 위험을
   * 피하려고 ≤1ms tolerance를 쓴다. consume 대상은 LONG(싱글)·DOUBLE_LONG(더블).
   */
  private computeHeadlessLongCache(): void {
    const HEAD_TOLERANCE_MS = 1;
    for (let i = 0; i < this.notes.length; i++) {
      const note = this.notes[i];
      if (!("endBeat" in note) || (note.type !== NoteType.LONG && note.type !== NoteType.DOUBLE_LONG)) {
        this.headlessLongCache.set(i, false);
        continue;
      }
      const startTime = this.noteTimesMs.get(i);
      if (startTime === undefined) {
        this.headlessLongCache.set(i, false);
        continue;
      }
      let hasHead = false;
      for (let j = 0; j < this.notes.length; j++) {
        if (j === i) continue;
        const other = this.notes[j];
        if ("endBeat" in other) continue; // PointNote만 헤드 후보
        if (other.lane !== note.lane) continue;
        const otherTime = this.noteTimesMs.get(j);
        if (otherTime === undefined) continue;
        if (Math.abs(otherTime - startTime) <= HEAD_TOLERANCE_MS) {
          hasHead = true;
          break;
        }
      }
      this.headlessLongCache.set(i, !hasHead);
    }
  }

  /**
   * startTimeMs 이전의 노트를 모두 COMPLETE 처리 (에디터 테스트 플레이용)
   */
  skipNotesBefore(timeMs: number): void {
    for (let i = 0; i < this.notes.length; i++) {
      const noteTime = this.noteTimesMs.get(i);
      if (noteTime === undefined) continue;
      if (noteTime < timeMs) {
        this.noteStates.set(i, NoteState.COMPLETE);
      }
    }
  }

  get combo(): number {
    return this.currentCombo;
  }

  get maxCombo(): number {
    return this.maxComboValue;
  }

  /**
   * 노트의 lane으로 홀드 상태 조회 — note.lane(number) → Lane 캐스트의 단일 지점.
   * 엔진에 들어오는 노트는 게임 진입점에서 메인 레인(1..4)으로 필터된다 (RFD 0018 §3-3).
   */
  private noteHoldState(lane: number): LaneHoldState | undefined {
    return this.laneHoldStates.get(lane as Lane);
  }

  /**
   * 레인 키 프레스 처리
   */
  onLanePress(lane: Lane, timestampMs: number, keyCode: string): void {
    const holdState = this.laneHoldStates.get(lane);
    if (!holdState) return;

    // 슬라이드(길이 0 hold-only) 전이를 이 입력의 직전 홀드 상태로 먼저 평가한다.
    // 홀드 상태는 press/release 이벤트로만 바뀌므로, 매 이벤트 경계에서 pre-mutation
    // 상태로 평가하면 프레임 독립이 된다: 윈도우를 걸쳐 지속된 홀드는 여기서 Perfect로
    // 관측되고, 윈도우 밖(+Good 초과)에서 시작하는 이 keydown은 타임아웃이 먼저 닫아
    // Perfect를 주장할 수 없다 (슬라이스6 P1 — 늦은 홀드 상향/이중 크레딧 차단).
    this.checkLengthZeroHoldOnly(timestampMs);
    // 끝점이 지난 connection·hold-only도 이 입력의 직전 상태로 먼저 판정 — 유예 밖 뗌 후
    // 늦은 재잡기(이 keydown)가 connection을 부활시키지 못한다 (슬라이스3 P4·P5).
    this.evalEndpointsOnInputBoundary(timestampMs);

    // 홀드 상태 업데이트
    holdState.heldKeys.add(keyCode);
    holdState.isHeld = true;
    // Grace period 내 재입력 시 릴리즈 기록 클리어 (프레임 기반 오판 방지)
    if (
      holdState.lastReleaseTimeMs !== null &&
      timestampMs - holdState.lastReleaseTimeMs <= GRACE_PERIOD_MS
    ) {
      holdState.lastReleaseTimeMs = null;
    }

    // 더블 롱노트의 키별 재입력 시 릴리즈 기록 클리어
    for (const [noteIndex, dlState] of this.doubleLongKeyStates) {
      const note = this.notes[noteIndex] as RangeNote;
      if (note.lane !== lane) continue;
      const state = this.noteStates.get(noteIndex);
      if (state !== NoteState.BODY_ACTIVE) continue;

      for (const keyState of [dlState.key1, dlState.key2]) {
        if (keyState.keyCode === keyCode && !keyState.failed) {
          if (
            keyState.lastReleaseTimeMs !== null &&
            timestampMs - keyState.lastReleaseTimeMs <= GRACE_PERIOD_MS
          ) {
            keyState.lastReleaseTimeMs = null;
          }
        }
      }
    }

    // 롱노트 바디 시작점 허용을 입력 시점에도 평가 — 윈도우 내 유효 입력이 프레임 경계 때문에 실패로
    // 새는 것을 막는다 (트릴 P2와 동일 패턴). 한 레인에 진행 중 롱은 최대 하나(겹침 불가 불변).
    for (let i = 0; i < this.notes.length; i++) {
      if (this.noteStates.get(i) !== NoteState.BODY_ACTIVE) continue;
      const rn = this.notes[i];
      if (!("endBeat" in rn) || rn.lane !== lane) continue;
      this.tryAcceptLongBodyStart(i, holdState, timestampMs);
    }

    // 해당 레인에서 가장 빠른 미처리 노트 찾기
    const targetNoteIndex = this.findEarliestUnprocessedNote(lane, timestampMs, keyCode);

    if (targetNoteIndex === null) {
      // Bad 윈도우 내에 노트가 없으면 무시
      return;
    }

    const note = this.notes[targetNoteIndex];
    const noteTime = this.noteTimesMs.get(targetNoteIndex);
    if (noteTime === undefined) return;

    const deltaMs = timestampMs - noteTime;

    // 헤드 없는 롱노트: keydown을 consume만 하고 판정은 emit하지 않는다(held 경로가 전담).
    if ("endBeat" in note) {
      this.markLongConsumed(targetNoteIndex, keyCode);
      return;
    }

    // 노트 타입에 따른 처리 (헤드는 항상 PointNote)
    if (note.type === NoteType.SINGLE) {
      this.processSingleNoteInput(targetNoteIndex, deltaMs, keyCode);
    } else if (note.type === NoteType.DOUBLE) {
      this.processDoubleNoteInput(targetNoteIndex, deltaMs, keyCode);
    } else if (note.type === NoteType.TRILL) {
      this.processTrillNoteInput(targetNoteIndex, deltaMs, keyCode, lane);
    }
  }

  /**
   * 레인 키 릴리스 처리
   *
   * keyup 소비 — 약칭 R2 (RFD 0015): keyup은 익명 이벤트로, 같은 레인의 가장 이른 release-대상
   * 하나에 소비된 뒤 사라진다. keydown↔keyup 짝·출신 키는 추적하지 않는다.
   */
  onLaneRelease(lane: Lane, timestampMs: number, keyCode: string): void {
    const holdState = this.laneHoldStates.get(lane);
    if (!holdState) return;

    // 슬라이드(길이 0 hold-only) 전이를 뗌 직전 홀드 상태로 먼저 평가한다 — noteTime을
    // 걸쳐 홀드했는데 관측 프레임 전에 떼면 "held였던 사실"이 유실되어 Miss로 새는
    // 하향을 막는다 (슬라이스6 P1 release 거울상, 프레임 독립).
    this.checkLengthZeroHoldOnly(timestampMs);
    // 끝점을 걸쳐 홀드하다 떼는 경우, 뗌 직전 상태(held)로 connection·hold-only를 먼저
    // 판정 — 관측 프레임 전에 떼도 Perfect가 유실되지 않는다 (슬라이스3 P4·P5).
    this.evalEndpointsOnInputBoundary(timestampMs);

    // 특정 키만 제거
    holdState.heldKeys.delete(keyCode);

    // 더블 롱노트의 키별 릴리즈 시간 기록 (바디 유지 추적용 — 판정 아님)
    this.updateDoubleLongKeyRelease(lane, keyCode, timestampMs);

    // keyup 소비: 가장 이른 release-대상 매칭 (RFD 0015)
    this.consumeReleaseTarget(lane, timestampMs, keyCode);

    // 모든 키가 떼어졌을 때만 레인 릴리스 상태로 전환
    if (holdState.heldKeys.size === 0) {
      holdState.isHeld = false;
      holdState.lastReleaseTimeMs = timestampMs;
    }
  }

  /**
   * 더블 롱노트의 키별 릴리즈 시간 업데이트
   */
  private updateDoubleLongKeyRelease(lane: Lane, keyCode: string, timestampMs: number): void {
    for (const [noteIndex, dlState] of this.doubleLongKeyStates) {
      const note = this.notes[noteIndex] as RangeNote;
      if (note.lane !== lane) continue;

      const state = this.noteStates.get(noteIndex);
      if (state !== NoteState.BODY_ACTIVE) continue;

      if (dlState.key1.keyCode === keyCode && !dlState.key1.failed) {
        dlState.key1.lastReleaseTimeMs = timestampMs;
      }
      if (dlState.key2.keyCode === keyCode && !dlState.key2.failed) {
        dlState.key2.lastReleaseTimeMs = timestampMs;
      }
    }
  }

  /**
   * keyup 소비 (RFD 0015): keyup을 같은 레인의 가장 이른 release-대상 하나에 소비한다.
   *
   * release-대상 후보:
   *  (1) 종결 대기 끝점 (BODY_AWAITING_RELEASE — 릴리즈 노트 포함)
   *  (2) 끝점 Good 윈도우 내의 진행 중 롱 (BODY_ACTIVE — 연결 제외, 더블롱은 키별.
   *      싱글 hold-only는 끝점 Good 윈도우 완화(미리-떼기)로 포함 — 이 keyup도 소비되어야
   *      직후 노트로 이중 크레딧이 가지 않는다. 더블 hold-only는 키별 update 경로 전담)
   *  (3) 슬라이드 미리-떼기 (길이 0 hold-only, 노트 시점 전 Good 윈도우 — 완전 릴리즈 게이트 폐지)
   *
   * 판정은 이진: 윈도우 내 keyup = Perfect (RFD 0015 §3). 윈도우 밖 keyup은 어느 대상에도
   * 매칭되지 않고 소멸한다 — 굶은 대상은 update()의 타임아웃(+Good)으로 Miss.
   * 매칭된 keyup은 그 대상 하나에 소비되어 직후 release-대상으로 번지지 않는다(RFD 0011 승계).
   * 도장(공릴리즈, RFD 0008)은 폐지 — 소비는 이벤트와 함께 소멸하므로 수명 관리가 없다(§5).
   */
  private consumeReleaseTarget(lane: Lane, releaseTimeMs: number, keyCode: string): void {
    let bestIndex: number | null = null;
    let bestTargetTime = Infinity;

    for (let i = 0; i < this.notes.length; i++) {
      const note = this.notes[i];
      if (note.lane !== lane) continue;
      if (!("endBeat" in note)) continue;

      const state = this.noteStates.get(i);
      const noteTime = this.noteTimesMs.get(i);
      const noteEndTime = this.noteEndTimesMs.get(i);
      if (noteTime === undefined || noteEndTime === undefined) continue;

      let targetTime: number | null = null;

      if (state === NoteState.BODY_AWAITING_RELEASE) {
        // 종결 대기 (릴리즈 노트 포함). 더블롱은 키별 경로(BODY_ACTIVE)만 쓴다.
        if (
          note.type !== NoteType.DOUBLE_LONG &&
          Math.abs(releaseTimeMs - noteEndTime) <= this.windows.GOOD
        ) {
          targetTime = noteEndTime;
        }
      } else if (state === NoteState.BODY_ACTIVE) {
        // 연결은 스트레이 릴리즈로 판정하지 않고 끝점 update(held-or-grace)에 위임한다.
        // (연결 헤드를 친 다른 키의 릴리즈가 연결을 MISS시키거나, 연결을 가로지르는
        //  이어잡기 키 스왑을 깨지 않게)
        if (this.connectionSources.has(i)) continue;
        if (Math.abs(releaseTimeMs - noteEndTime) > this.windows.GOOD) continue;
        if (note.type === NoteType.DOUBLE_LONG) {
          // 더블 hold-only는 키별 update 경로(judgeDoubleLongEndpoint)가 전담
          if (isHoldOnlyNote(note)) continue;
          // 더블롱: 떼어진 키가 추적 중이고 미판정일 때만 후보 (키별 keyup 소비).
          // dl 미초기화(짧은 더블롱의 keyup이 끝점 update 프레임보다 먼저 도착)면
          // executeReleaseJudgment가 재구성하므로 후보로 남긴다 (P3 keyup 거울상).
          const dl = this.doubleLongKeyStates.get(i);
          if (dl) {
            const keyState =
              dl.key1.keyCode === keyCode ? dl.key1 : dl.key2.keyCode === keyCode ? dl.key2 : null;
            if (!keyState || keyState.judged) continue;
          }
        }
        targetTime = noteEndTime;
      } else if (state === NoteState.UNPROCESSED) {
        // 더블은 UNPROCESSED 단계 keyup 매칭 없음 (미리-떼기 미지원 / 키별 경로 전담)
        if (note.type === NoteType.DOUBLE_LONG) continue;
        if (noteEndTime !== noteTime) continue;
        if (isHoldOnlyNote(note)) {
          // 슬라이드 미리-떼기: 노트 시점 전 Good 윈도우 내 keyup → Perfect (RFD 0005 게이트 폐지)
          if (releaseTimeMs >= noteTime - this.windows.GOOD && releaseTimeMs < noteTime) {
            targetTime = noteTime;
          }
        } else if (Math.abs(releaseTimeMs - noteEndTime) <= this.windows.GOOD) {
          // 릴리즈 노트: 판정은 keyup 이벤트가 끝점 ±Good 내인지로 정의되며 활성화
          // (BODY_AWAITING_RELEASE, update 프레임) 여부와 무관하다. AWAITING에만 묶으면
          // early keyup(노트 시점 전)이 결정적으로 죽고, 노트 시점 직후 keyup도 활성화
          // 프레임보다 먼저 도착하면 유실된다 (슬라이스6 P5, RFD 0015 §3 이진 릴리즈).
          targetTime = noteEndTime;
        }
      }

      if (targetTime !== null && targetTime < bestTargetTime) {
        bestTargetTime = targetTime;
        bestIndex = i;
      }
    }

    if (bestIndex === null) return;
    this.executeReleaseJudgment(bestIndex, releaseTimeMs, keyCode);
  }

  /**
   * keyup 소비로 매칭된 release-대상의 판정 실행 (consumeReleaseTarget이 윈도우 검증을 마친 뒤 호출)
   */
  private executeReleaseJudgment(noteIndex: number, releaseTimeMs: number, keyCode: string): void {
    const note = this.notes[noteIndex];
    const state = this.noteStates.get(noteIndex);
    const noteTime = this.noteTimesMs.get(noteIndex);
    const noteEndTime = this.noteEndTimesMs.get(noteIndex);
    if (noteTime === undefined || noteEndTime === undefined) return;

    if (state === NoteState.UNPROCESSED) {
      // 슬라이드 미리-떼기 → Perfect (떼는 시점 표시)
      if (isHoldOnlyNote(note)) {
        this.emitJudgment(noteIndex, JudgmentGrade.PERFECT, undefined, releaseTimeMs - noteTime);
        this.noteStates.set(noteIndex, NoteState.COMPLETE);
        this.consumedLongKeys.delete(noteIndex);
        this.incrementCombo();
        return;
      }
      // 릴리즈 노트: 활성화 전 keyup — termination 판정 (이진, 매칭이 윈도우를 이미 검증)
      this.executeTerminationJudgment(noteIndex, releaseTimeMs, noteEndTime);
      return;
    }

    // 더블롱: 떼어진 키만 키별 termination 판정
    if (note.type === NoteType.DOUBLE_LONG) {
      let dl = this.doubleLongKeyStates.get(noteIndex);
      if (!dl) {
        // 짧은 더블롱: dl 추적이 없던 채 유지 키가 끝점 update 프레임보다 먼저 keyup으로 도착
        // (라이브 keyup은 rAF update와 비동기 — P3가 고친 update 폴백 경로의 거울상).
        // heldKeys엔 방금 뗀 keyCode가 이미 빠졌으므로 참여 키 맨 앞에 포함해 재구성한다.
        const holdState = this.noteHoldState((note as RangeNote).lane);
        const participants = [keyCode, ...(holdState ? holdState.heldKeys : [])];
        dl = this.reconstructShortDoubleLongKeyStates(noteIndex, participants);
      }
      const keyState =
        dl.key1.keyCode === keyCode ? dl.key1 : dl.key2.keyCode === keyCode ? dl.key2 : null;
      if (!keyState || keyState.judged) return;
      const deltaMs = releaseTimeMs - noteEndTime;
      this.judgeDoubleLongKey(noteIndex, dl, keyState, this.terminationGrade(deltaMs), deltaMs);
      return;
    }

    // 싱글 롱 종결
    this.executeTerminationJudgment(noteIndex, releaseTimeMs, noteEndTime);
  }

  /**
   * 프레임마다 호출 — 자동 Miss 체크, 바디 홀드 체크
   */
  update(songTimeMs: number): void {
    // 자동 Miss 체크 (노트 타임 + Bad 윈도우를 지나간 미처리 노트)
    for (let i = 0; i < this.notes.length; i++) {
      const state = this.noteStates.get(i);
      if (state !== NoteState.UNPROCESSED) continue;

      const noteTime = this.noteTimesMs.get(i);
      if (noteTime === undefined) continue;

      const note = this.notes[i];

      // 포인트 노트 자동 Miss
      if (
        note.type === NoteType.SINGLE ||
        note.type === NoteType.TRILL
      ) {
        if (songTimeMs > noteTime + this.windows.BAD) {
          this.emitJudgment(i, JudgmentGrade.MISS, 0, noteTime + this.windows.BAD - noteTime);
          this.noteStates.set(i, NoteState.COMPLETE);
          this.breakCombo();
        }
      } else if (note.type === NoteType.DOUBLE) {
        // 더블 노트 자동 Miss
        if (songTimeMs > noteTime + this.windows.BAD) {
          const doubleState = this.doubleNoteStates.get(i);
          if (doubleState?.firstInputReceived) {
            // 첫 번째만 받은 경우 두 번째는 Miss
            this.emitJudgment(i, JudgmentGrade.MISS, 1, noteTime + this.windows.BAD - noteTime);
          } else {
            // 아무 입력도 없으면 둘 다 Miss
            this.emitJudgment(i, JudgmentGrade.MISS, 0, noteTime + this.windows.BAD - noteTime);
            this.emitJudgment(i, JudgmentGrade.MISS, 1, noteTime + this.windows.BAD - noteTime);
          }
          this.noteStates.set(i, NoteState.COMPLETE);
          this.breakCombo();
        }
      }
    }

    // trillZone 시작 시 교대 추적 상태 리셋 (프레임 시각 기준)
    for (const lane of [1, 2, 3, 4] as Lane[]) {
      this.advanceTrillZoneReset(lane, songTimeMs);
    }

    // 바디 노트 자동 활성화 (시작 시간 도달 시)
    for (let i = 0; i < this.notes.length; i++) {
      if (this.noteStates.get(i) !== NoteState.UNPROCESSED) continue;
      const note = this.notes[i];
      if (!("endBeat" in note)) continue;
      const noteTime = this.noteTimesMs.get(i);
      if (noteTime === undefined) continue;
      if (songTimeMs >= noteTime) {
        // 길이 0인 롱노트는 바디 홀드 없이 바로 릴리즈 대기
        const noteEndTime = this.noteEndTimesMs.get(i);
        if (noteEndTime !== undefined && noteEndTime === noteTime) {
          // 길이 0 hold-only(슬라이드)는 checkLengthZeroHoldOnly가 held 기반으로 처리하므로 활성화 스킵
          if (!isHoldOnlyNote(note)) {
            this.noteStates.set(i, NoteState.BODY_AWAITING_RELEASE);
          }
        } else {
          this.noteStates.set(i, NoteState.BODY_ACTIVE);
          this.longNoteBodyStates.set(i, {
            hasBeenPressed: false,
            bodyStartTimeMs: noteTime,
          });
          // BODY_ACTIVE가 되면 state로 후보 제외되므로 consume 표시는 정리한다.
          this.consumedLongKeys.delete(i);

          // doubleLong: 현재 눌린 키들로 2키 독립 추적 초기화
          if (note.type === NoteType.DOUBLE_LONG) {
            const holdState = this.noteHoldState(note.lane);
            if (holdState) {
              const heldKeysArr = Array.from(holdState.heldKeys);
              if (heldKeysArr.length >= 2) {
                this.doubleLongKeyStates.set(i, {
                  key1: { keyCode: heldKeysArr[0], failed: false, judged: false, lastReleaseTimeMs: null },
                  key2: { keyCode: heldKeysArr[1], failed: false, judged: false, lastReleaseTimeMs: null },
                });
              }
              // 1키만 눌려있으면 허용 구간에서 2키 입력을 대기
            }
          }
        }
      }
    }

    // 바디 홀드 체크
    this.checkLongNoteBodyHold(songTimeMs);

    // 롱노트 바디 끝 판정
    this.checkLongNoteBodyEnd(songTimeMs);

    // 길이 0 hold-only(슬라이드) 판정
    this.checkLengthZeroHoldOnly(songTimeMs);
  }

  /**
   * 해당 레인에서 timestampMs의 Bad 윈도우 내에 있는 가장 빠른 미처리 노트 찾기
   */
  private findEarliestUnprocessedNote(lane: Lane, timestampMs: number, keyCode: string): number | null {
    let earliestIndex: number | null = null;
    let earliestTime = Infinity;

    for (let i = 0; i < this.notes.length; i++) {
      const note = this.notes[i];
      if (note.lane !== lane) continue;

      // 바디 노트(RangeNote)는 원칙적으로 입력 대상이 아니나, 헤드 없는 싱글 롱노트가
      // consume 종료 전이고 시작 시각 ±Good 윈도우 내이면 keydown consume 후보가 된다.
      if ("endBeat" in note) {
        if (!this.isHeadlessConsumable(i, timestampMs, keyCode)) continue;
      }

      const state = this.noteStates.get(i);
      const noteTime = this.noteTimesMs.get(i);
      if (noteTime === undefined) continue;

      // 더블 노트의 경우 첫 입력만 받은 상태도 체크
      const isDoublePartial =
        note.type === NoteType.DOUBLE &&
        state === NoteState.UNPROCESSED &&
        this.doubleNoteStates.get(i)?.firstInputReceived === true;

      if (state !== NoteState.UNPROCESSED && !isDoublePartial) {
        continue;
      }

      const deltaMs = timestampMs - noteTime;

      // Grace 노트: early는 Good 윈도우까지만 매칭 (early Bad 없음)
      const isGrace = isGraceNote(note);
      const earlyLimit = isGrace ? this.windows.GOOD : this.windows.BAD;

      if (deltaMs >= -earlyLimit && deltaMs <= this.windows.BAD) {
        if (noteTime < earliestTime) {
          earliestTime = noteTime;
          earliestIndex = i;
        }
      }
    }

    return earliestIndex;
  }

  /**
   * 해당 인덱스의 노트가 "헤드 없는 consume 가능 싱글 롱노트"인지.
   *
   * 조건: (1) 헤드 없음 캐시 true (NoteType.LONG 한정)
   *       (2) 아직 consume 종료 안 됨 — 필요 키 수를 "consume한 키 ∪ 지금 홀드 중인 키(방금
   *           눌린 키 제외)"로 keydown 도착 시점에 즉석 평가한다(RFD 0006 §3.1 "held로 충족하는
   *           것 포함"). update 프레임에서 표시된 것만 보면 프레임 스톨/시작경계(noteTime 전
   *           [-Good,0)의 미리 홀드)에서 이미 충족된 노트가 keydown을 삼킨다. 무상태 평가라
   *           홀드를 일찍 떼면 그 키는 즉시 카운트에서 빠진다(케이스 표 6행 보존).
   *       (3) 시작 시각 ±Good 윈도우 내 (너무 이른/늦은 입력 consume 방지)
   */
  private isHeadlessConsumable(noteIndex: number, timestampMs: number, keyCode: string): boolean {
    if (!this.headlessLongCache.get(noteIndex)) return false;
    if (this.noteStates.get(noteIndex) !== NoteState.UNPROCESSED) return false;
    // keydown 도착 시점 평가라 방금 눌린 키(keyCode)는 "이미 홀드로 충족"에서 제외한다.
    if (this.headlessFilledKeyCount(noteIndex, keyCode) >= this.requiredConsumeCount(noteIndex)) return false;
    const startTime = this.noteTimesMs.get(noteIndex);
    if (startTime === undefined) return false;
    // consume 윈도우 = 시작점 허용 구간과 동일한 [-Good, +Good].
    // early Bad/late Bad까지 열면 직후 노트를 과보호하거나 홀드 직전 탭을 삼킨다.
    const deltaMs = timestampMs - startTime;
    return deltaMs >= -this.windows.GOOD && deltaMs <= this.windows.GOOD;
  }

  /**
   * 헤드 없는 롱노트의 held 충족 키 집합 크기 = "consume한 키 ∪ 현재 레인 홀드 키".
   * isHeadlessConsumable(판정)과 headlessHeldFill(시각 피드백)이 이 한 계산을 공유해
   * 시각과 판정이 어긋나지 않는다(이슈 #85 단일 진실 조건).
   * excludeKey를 주면 그 키는 제외한다 — keydown 평가 시 방금 눌린 키를 빼기 위함.
   */
  private headlessFilledKeyCount(noteIndex: number, excludeKey: string | null): number {
    const filled = new Set(this.consumedLongKeys.get(noteIndex));
    const holdState = this.noteHoldState(this.notes[noteIndex].lane);
    if (holdState) {
      for (const held of holdState.heldKeys) {
        if (held !== excludeKey) filled.add(held);
      }
    }
    return filled.size;
  }

  /**
   * 헤드 없는 롱노트의 held 충족 카운트 조회 (렌더러 시각 피드백용 — 이슈 #85).
   *
   * 반환: 조회 대상이면 `{ filled, required }`, 아니면 `null`. 조회 대상(eligibility) 조건은
   * 판정 술어 `isHeadlessConsumable`과 같다 — 헤드없음 캐시 + UNPROCESSED + 시작 ±Good 윈도우
   * 내. 윈도우를 공유해야 "시각은 held라는데 판정 윈도우 밖"인 불일치가 안 생긴다.
   *
   * 단 `filled`는 판정과 달리 **현재 홀드 중인 키 수만** 센다(소비 이력 union 안 함). 판정의
   * `consumedLongKeys`는 한 번 소비되면 떼도 안 빠지는 영속 집합이라(비동시 2키 소비 보호 목적),
   * 그걸 시각에 쓰면 "두 키 다 뗐는데 소비된 키가 남아 부분 held로 켜져 있음" 유령이 생긴다.
   * 시각 피드백은 "지금 홀드하고 있나"라 live 홀드만 세는 게 옳다 — 그래야 다 떼면 즉시 꺼진다.
   * BODY_ACTIVE 승격·윈도우 이탈 시 null이 되어 렌더러는 기하 held 경로로 넘어간다.
   * @param timeMs 조회 시점(렌더러는 시각 시간을 넘긴다 — 그려지는 것과 동기)
   */
  headlessHeldFill(noteIndex: number, timeMs: number): { filled: number; required: number } | null {
    if (!this.headlessLongCache.get(noteIndex)) return null;
    if (this.noteStates.get(noteIndex) !== NoteState.UNPROCESSED) return null;
    const startTime = this.noteTimesMs.get(noteIndex);
    if (startTime === undefined) return null;
    const deltaMs = timeMs - startTime;
    if (deltaMs < -this.windows.GOOD || deltaMs > this.windows.GOOD) return null;
    const holdState = this.noteHoldState(this.notes[noteIndex].lane);
    return {
      filled: holdState ? holdState.heldKeys.size : 0,
      required: this.requiredConsumeCount(noteIndex),
    };
  }

  /** 헤드 없는 롱노트의 consume 필요 키 수 (싱글 LONG 1 / 더블 DOUBLE_LONG 2). */
  private requiredConsumeCount(noteIndex: number): number {
    return this.notes[noteIndex].type === NoteType.DOUBLE_LONG ? 2 : 1;
  }

  /**
   * 헤드 없는 롱노트의 keydown consume 표시 (판정 emit 없음).
   *
   * keydown(또는 held sentinel)을 소비만 한다. 실제 판정은 update()의 held 경로가 전담:
   *  - 길이>0: 자동활성화(BODY_ACTIVE) + checkLongNoteBodyHold / checkDoubleLongKeyHold
   *  - 길이0 슬라이드: checkLengthZeroHoldOnly (미리-떼기는 consumeReleaseTarget의 keyup 소비 매칭)
   *  - 릴리즈 노트(길이0 일반): BODY_AWAITING_RELEASE + keyup termination 판정
   * BODY_ACTIVE로 강제 승격하지 않는다 — 시작점 허용 윈도우를 우회하면 판정 타이밍이 왜곡된다.
   * 키 집합으로 추적해 같은 프레임/윈도우의 후속 keydown이 노트를 재consume해 다음 노트를 막는 것을
   * 방지하고, 더블 롱노트는 서로 다른 키 2개를 채워야 consume 종료된다(같은 키 재입력은 무효).
   * (holdState.heldKeys 는 onLanePress 진입부에서 이미 갱신됨 — 여기서 키를 만지지 않는다.)
   */
  private markLongConsumed(noteIndex: number, keyCode: string): void {
    let keys = this.consumedLongKeys.get(noteIndex);
    if (!keys) {
      keys = new Set();
      this.consumedLongKeys.set(noteIndex, keys);
    }
    keys.add(keyCode);
  }

  /**
   * 싱글 노트 입력 처리
   */
  private processSingleNoteInput(noteIndex: number, deltaMs: number, _keyCode: string): void {
    const note = this.notes[noteIndex];
    const isGrace = isGraceNote(note);
    const grade = isGrace ? this.calculateGraceGrade(deltaMs) : this.calculateGrade(deltaMs);
    this.emitJudgment(noteIndex, grade, 0, deltaMs);
    this.noteStates.set(noteIndex, NoteState.COMPLETE);

    if (this.isComboMaintaining(grade)) {
      this.incrementCombo();
    } else {
      this.breakCombo();
    }
  }

  /**
   * 더블 노트 입력 처리
   */
  private processDoubleNoteInput(noteIndex: number, deltaMs: number, keyCode: string): void {
    const note = this.notes[noteIndex];
    const isGrace = isGraceNote(note);

    let doubleState = this.doubleNoteStates.get(noteIndex);

    if (!doubleState) {
      doubleState = { firstInputReceived: false };
      this.doubleNoteStates.set(noteIndex, doubleState);
    }

    if (!doubleState.firstInputReceived) {
      // 첫 번째 입력
      const grade = isGrace ? this.calculateGraceGrade(deltaMs) : this.calculateGrade(deltaMs);
      doubleState.firstInputReceived = true;
      doubleState.firstKeyCode = keyCode;
      doubleState.firstGrade = grade;
      doubleState.firstDeltaMs = deltaMs;

      this.emitJudgment(noteIndex, grade, 0, deltaMs);

      if (this.isComboMaintaining(grade)) {
        this.incrementCombo();
      } else {
        this.breakCombo();
      }
    } else {
      // 두 번째 입력 — 다른 키여야 함
      if (keyCode === doubleState.firstKeyCode) {
        // 같은 키로 누르면 무시
        return;
      }

      const grade = isGrace ? this.calculateGraceGrade(deltaMs) : this.calculateGrade(deltaMs);
      this.emitJudgment(noteIndex, grade, 1, deltaMs);
      this.noteStates.set(noteIndex, NoteState.COMPLETE);

      if (this.isComboMaintaining(grade)) {
        this.incrementCombo();
      } else {
        this.breakCombo();
      }
    }
  }

  /**
   * 트릴 노트 입력 처리
   */
  /**
   * trillZone 리셋 따라잡기 — uptoMs까지 시작한 구간들에 대해 교대 추적(trillAlternation)을 리셋한다.
   * update(songTime)와 입력(processTrillNoteInput, noteTime) 양쪽이 공유한다: 리셋이 프레임에만 있으면
   * async keydown이 프레임보다 일찍 도착할 때 새 구간 첫 노트가 이전 구간 키와 비교돼 잘못된 Good◇을
   * 받는다. nextIdx는 단조 증가만 하므로 update·입력이 각자 시각으로 호출해도 이중 리셋되지 않는다.
   */
  private advanceTrillZoneReset(lane: Lane, uptoMs: number): void {
    const startTimes = this.trillZoneStartTimesMs.get(lane);
    if (!startTimes) return;
    let nextIdx = this.trillZoneNextIndex.get(lane) ?? 0;
    while (nextIdx < startTimes.length && uptoMs >= startTimes[nextIdx]) {
      this.trillAlternation.set(lane, null);
      this.trillZoneCurrentStartMs.set(lane, startTimes[nextIdx]);
      nextIdx++;
    }
    this.trillZoneNextIndex.set(lane, nextIdx);
  }

  private processTrillNoteInput(
    noteIndex: number,
    deltaMs: number,
    keyCode: string,
    lane: Lane,
  ): void {
    const note = this.notes[noteIndex];
    const isGrace = isGraceNote(note);
    // 입력 시점에도 구간 리셋 따라잡기: 노트의 원래 위치(noteTime)까지 시작한 구간을 리셋해,
    // 프레임(update)보다 일찍 친 새 구간 첫 노트가 이전 구간 키로 잘못된 Good◇을 받지 않게 한다.
    const noteTimeForReset = this.noteTimesMs.get(noteIndex);
    if (noteTimeForReset !== undefined) this.advanceTrillZoneReset(lane, noteTimeForReset);
    const lastKeyCode = this.trillAlternation.get(lane);
    let grade = isGrace ? this.calculateGraceGrade(deltaMs) : this.calculateGrade(deltaMs);

    // 교대 체크 (첫 트릴이 아닌 경우) — Grace여도 교대 실패는 goodTrill.
    // goodTrill은 상한일 뿐 하한이 아니다: 타이밍 등급이 Good 이상일 때만 goodTrill로 끌어내리고,
    // 타이밍이 그보다 나쁘면(Bad/Miss) 그 판정을 유지한다 — 미스타이밍을 교대 실패로 보상하지 않는다 (RFD 0013).
    const timingIsGoodOrBetter =
      grade === JudgmentGrade.PERFECT ||
      grade === JudgmentGrade.GREAT ||
      grade === JudgmentGrade.GOOD;
    if (lastKeyCode !== null && keyCode === lastKeyCode && timingIsGoodOrBetter) {
      grade = JudgmentGrade.GOOD_TRILL;
    }

    // 노트의 원래 위치가 현재 활성 trillZone에 속하는지 확인
    // - 속하면: 교대 추적에 키를 기록 (정상)
    // - 속하지 않으면: 교대 추적에 기록하지 않음 (경계 입력 보호)
    const noteTime = this.noteTimesMs.get(noteIndex);
    const currentZoneStart = this.trillZoneCurrentStartMs.get(lane);
    const belongsToCurrentZone =
      currentZoneStart === null ||
      currentZoneStart === undefined ||
      noteTime === undefined ||
      noteTime >= currentZoneStart;

    if (belongsToCurrentZone) {
      this.trillAlternation.set(lane, keyCode);
    }

    this.emitJudgment(noteIndex, grade, 0, deltaMs);
    this.noteStates.set(noteIndex, NoteState.COMPLETE);

    if (this.isComboMaintaining(grade)) {
      this.incrementCombo();
    } else {
      this.breakCombo();
    }
  }

  /**
   * 롱노트 바디 시작점 허용 — atTimeMs가 시작 윈도우(+GOOD) 내이고 레인이 홀드 중이면 시작을 수락한다.
   * update(프레임)와 onLanePress(입력) 양쪽이 공유한다: 수락이 프레임에서만 일어나면, 윈도우 내 유효 입력이라도
   * 그 held를 관측할 프레임이 윈도우 밖에 떨어질 때 실패로 샌다(트릴 P2와 동일한 "async keydown vs rAF update"
   * 버그 클래스). hasBeenPressed 플립은 1회, doubleLong 2키 초기화는 멱등하게 수행한다.
   */
  private tryAcceptLongBodyStart(noteIndex: number, holdState: LaneHoldState, atTimeMs: number): void {
    if (this.noteStates.get(noteIndex) !== NoteState.BODY_ACTIVE) return;
    const bodyState = this.longNoteBodyStates.get(noteIndex);
    if (!bodyState) return;
    if (atTimeMs > bodyState.bodyStartTimeMs + this.windows.GOOD) return; // 시작 윈도우 밖
    if (!holdState.isHeld) return;

    const note = this.notes[noteIndex] as RangeNote;

    if (!bodyState.hasBeenPressed) {
      bodyState.hasBeenPressed = true;
    }

    // doubleLong: 허용 구간 내 2키가 모이면 독립 추적 초기화 (멱등 — 이미 초기화됐으면 스킵)
    if (note.type === NoteType.DOUBLE_LONG && !this.doubleLongKeyStates.has(noteIndex)) {
      const heldKeysArr = Array.from(holdState.heldKeys);
      if (heldKeysArr.length >= 2) {
        this.doubleLongKeyStates.set(noteIndex, {
          key1: { keyCode: heldKeysArr[0], failed: false, judged: false, lastReleaseTimeMs: null },
          key2: { keyCode: heldKeysArr[1], failed: false, judged: false, lastReleaseTimeMs: null },
        });
      }
    }
  }

  /**
   * 롱노트 바디 홀드 체크
   *
   * 매 프레임 호출되어 BODY_ACTIVE 노트의 홀드 상태를 검증한다.
   * - 시작점 허용: 헤드 판정 후 Good 윈도우(120ms) 내에서 키 입력 대기
   * - 끝점 허용: 끝점 Good 윈도우(-120ms) 진입 시 끝점 판정에 위임
   * - Grace period: 12ms 이내 릴리즈는 허용
   */
  private checkLongNoteBodyHold(songTimeMs: number): void {
    for (let i = 0; i < this.notes.length; i++) {
      const state = this.noteStates.get(i);
      if (state !== NoteState.BODY_ACTIVE) continue;

      const note = this.notes[i] as RangeNote;
      const noteEndTime = this.noteEndTimesMs.get(i);
      if (noteEndTime === undefined) continue;

      const bodyState = this.longNoteBodyStates.get(i);
      if (!bodyState) continue;

      const holdState = this.noteHoldState(note.lane);
      if (!holdState) continue;

      // 1. 시작점 허용 구간 (+120ms) — update·입력 공유 헬퍼로 수락 (프레임 경계 독립)
      if (!bodyState.hasBeenPressed) {
        if (songTimeMs <= bodyState.bodyStartTimeMs + this.windows.GOOD) {
          this.tryAcceptLongBodyStart(i, holdState, songTimeMs);
          // 아직 허용 구간 내 — skip
          continue;
        } else {
          // 허용 구간 초과, 키 입력 없음 → 실패
          this.noteStates.set(i, NoteState.BODY_FAILED);
          if (note.type === NoteType.DOUBLE_LONG) {
            // 더블롱은 키별 2판정 불변 — 한 번도 안 눌려도 두 키 모두 Miss
            this.emitJudgment(i, JudgmentGrade.MISS, 0, 0);
            this.emitJudgment(i, JudgmentGrade.MISS, 1, 0);
          } else {
            this.emitJudgment(i, JudgmentGrade.MISS, undefined, 0);
          }
          this.breakCombo();
          continue;
        }
      }

      // 2. 끝점 허용 구간 (-120ms) — 끝점 판정에 위임
      if (songTimeMs >= noteEndTime - this.windows.GOOD) {
        continue;
      }

      // doubleLong: 2키 독립 홀드 체크
      if (note.type === NoteType.DOUBLE_LONG) {
        this.checkDoubleLongKeyHold(i, songTimeMs, holdState);
        continue;
      }

      // 3. Grace period (12ms)
      if (holdState.isHeld) {
        // 키 눌림 — OK
        continue;
      }

      // 키가 안 눌려있음 — grace period 체크
      if (
        holdState.lastReleaseTimeMs !== null &&
        songTimeMs - holdState.lastReleaseTimeMs > GRACE_PERIOD_MS
      ) {
        // Grace period 초과 → 실패
        this.noteStates.set(i, NoteState.BODY_FAILED);
        this.emitJudgment(i, JudgmentGrade.MISS, undefined, 0);
        this.breakCombo();
      }
      // grace period 이내 → 유예 중, skip
    }
  }

  /**
   * 더블롱 키별 서브판정 emit (subIndex 0=key1/1=key2) + judged 마킹 + 콤보 + 완료 체크.
   * 더블롱 range 노트는 키별로 정확히 1회씩, 총 2회 판정된다(스펙 §146 / 분할 릴리즈).
   */
  private judgeDoubleLongKey(
    noteIndex: number,
    dl: DoubleLongKeyState,
    keyState: DoubleLongKeyState["key1"],
    grade: JudgmentGrade,
    deltaMs: number,
    partialSide?: "left" | "right",
  ): void {
    if (keyState.judged) return;
    keyState.judged = true;
    if (grade === JudgmentGrade.MISS) keyState.failed = true;
    const subIndex = keyState === dl.key1 ? 0 : 1;
    if (partialSide) {
      this.emitJudgment(noteIndex, grade, subIndex, deltaMs, true, partialSide);
    } else {
      this.emitJudgment(noteIndex, grade, subIndex, deltaMs);
    }
    if (this.isComboMaintaining(grade)) this.incrementCombo();
    else this.breakCombo();
    this.completeDoubleLongIfDone(noteIndex);
  }

  /** 더블롱 두 키 모두 판정되면 COMPLETE + 상태 정리 */
  private completeDoubleLongIfDone(noteIndex: number): void {
    const dl = this.doubleLongKeyStates.get(noteIndex);
    if (!dl || !dl.key1.judged || !dl.key2.judged) return;
    this.noteStates.set(noteIndex, NoteState.COMPLETE);
    this.doubleLongKeyStates.delete(noteIndex);
  }

  /**
   * termination 판정 등급 — 이진 릴리즈 (RFD 0015 §3).
   * 끝점 Good 윈도우(±120ms) 내 keyup = Perfect, 아니면 Miss.
   * release는 "떼는 동작의 존재"를 판정하며, 정밀도는 판정하지 않는다 (late-Bad 폴딩).
   */
  private terminationGrade(deltaMs: number): JudgmentGrade {
    return Math.abs(deltaMs) <= this.windows.GOOD
      ? JudgmentGrade.PERFECT
      : JudgmentGrade.MISS;
  }

  /**
   * dl 추적이 없던 짧은 더블롱(길이<Good, checkDoubleLongKeyHold 스킵)을 끝점에서 재구성한다.
   * participants = 이 노트에 실제 참여한 키들(유지 중 + 방금 뗀 키). 반드시 1개 이상이어야 한다.
   * 1키뿐이면 나머지 슬롯을 __missing__으로 채우고 미입력 쪽 부분 Miss를 emit한다
   * (checkDoubleLongKeyHold 1키 분기 미러링 — 병렬 판정: 유지/뗀 키는 호출측이 판정).
   */
  private reconstructShortDoubleLongKeyStates(
    noteIndex: number,
    participants: string[],
  ): DoubleLongKeyState {
    const mk = (keyCode: string) => ({ keyCode, failed: false, judged: false, lastReleaseTimeMs: null });
    const dl: DoubleLongKeyState =
      participants.length >= 2
        ? { key1: mk(participants[0]), key2: mk(participants[1]) }
        : {
            key1: mk(participants[0]),
            key2: { keyCode: "__missing__", failed: true, judged: true, lastReleaseTimeMs: null },
          };
    this.doubleLongKeyStates.set(noteIndex, dl);
    if (participants.length < 2) {
      this.emitJudgment(noteIndex, JudgmentGrade.MISS, 1, 0, true, "right");
      this.breakCombo();
    }
    return dl;
  }

  /**
   * 더블롱 끝점 키별 판정 (BODY_ACTIVE, songTime>=noteEndTime).
   * 일반: 각 키의 release 타이밍으로 종결(미릴리즈는 end+BAD에 Miss).
   * hold-only: 유지/grace 키는 Perfect(떼는 판정 면제). 연결: 키별 held/grace → Perfect/Miss
   * (유예는 끝점 기준 — 연결 더블롱은 입력 이벤트 경계에서도 호출된다, 슬라이스3 P4 참조).
   * 두 키 모두 판정되면 COMPLETE (judgeDoubleLongKey 내부에서).
   */
  private judgeDoubleLongEndpoint(
    noteIndex: number,
    note: RangeNote,
    songTimeMs: number,
    noteEndTime: number,
    holdState: LaneHoldState,
  ): void {
    let dl = this.doubleLongKeyStates.get(noteIndex);
    if (!dl) {
      // 짧은 더블롱(길이<Good)은 checkDoubleLongKeyHold가 끝점−Good 구간에서 스킵돼 __missing__ 추적이
      // 안 생겼을 수 있다. 진짜 미입력과 "1키만 유지"를 구분해, 끝점에서 실제 held 키로 추적을 재구성한다
      // (병렬 판정 — 스펙 §더블 롱노트 바디: 1키 유지 시 그 키 Perfect).
      const held = Array.from(holdState.heldKeys);
      if (held.length === 0) {
        // 진짜 미입력 → 두 키 모두 Miss
        this.emitJudgment(noteIndex, JudgmentGrade.MISS, 0, 0);
        this.emitJudgment(noteIndex, JudgmentGrade.MISS, 1, 0);
        this.breakCombo();
        this.noteStates.set(noteIndex, NoteState.COMPLETE);
        return;
      }
      dl = this.reconstructShortDoubleLongKeyStates(noteIndex, held);
    }

    const isConnection = this.connectionSources.has(noteIndex);
    const holdOnly = isHoldOnlyNote(note);

    for (const keyState of [dl.key1, dl.key2]) {
      if (keyState.judged) continue;
      const held = holdState.heldKeys.has(keyState.keyCode);

      if (isConnection) {
        // 연결: 키별 held/grace → Perfect, 아님 → Miss.
        // 유예는 끝점 기준(싱글 connection과 동일 — 슬라이스3 P4)이다. 프레임 시각으로 재면
        // 관측이 밀릴수록 유예가 증발하고, 끝점 걸친 홀드의 뗌(음수 delta)도 유실된다.
        const grace =
          keyState.lastReleaseTimeMs !== null &&
          noteEndTime - keyState.lastReleaseTimeMs <= GRACE_PERIOD_MS;
        this.judgeDoubleLongKey(
          noteIndex,
          dl,
          keyState,
          held || grace ? JudgmentGrade.PERFECT : JudgmentGrade.MISS,
          0,
        );
      } else if (holdOnly) {
        // hold-only: 끝점에 유지 중이거나 바디에서 실패 안 한 키 → Perfect (떼는 판정 면제)
        const survived = held || keyState.lastReleaseTimeMs !== null;
        this.judgeDoubleLongKey(
          noteIndex,
          dl,
          keyState,
          survived ? JudgmentGrade.PERFECT : JudgmentGrade.MISS,
          0,
        );
      } else if (held) {
        // 일반, 아직 유지 중 — end+Good 초과면 타임아웃 Miss(RFD 0015 §3), 아니면 release까지 대기
        if (songTimeMs > noteEndTime + this.windows.GOOD) {
          this.judgeDoubleLongKey(noteIndex, dl, keyState, JudgmentGrade.MISS, songTimeMs - noteEndTime);
        }
      } else if (keyState.lastReleaseTimeMs !== null) {
        // 일반, 이미 뗌 — release 시점 기준 (윈도우 밖 조기 release면 큰 음수 delta → Miss)
        const deltaMs = keyState.lastReleaseTimeMs - noteEndTime;
        this.judgeDoubleLongKey(noteIndex, dl, keyState, this.terminationGrade(deltaMs), deltaMs);
      } else {
        // release 기록 없음 → Miss
        this.judgeDoubleLongKey(noteIndex, dl, keyState, JudgmentGrade.MISS, 0);
      }
    }
  }

  /**
   * 더블 롱노트의 2키 독립 홀드 체크 (바디 구간, 끝점 Good 윈도우 진입 전까지만 호출됨)
   *
   * 각 키가 독립적으로 추적되며, 한 키가 릴리즈되어 grace period를 초과하면
   * 해당 키만 부분 Miss로 판정된다(키별 1회). 두 키 모두 판정되면 노트 COMPLETE.
   */
  private checkDoubleLongKeyHold(
    noteIndex: number,
    songTimeMs: number,
    holdState: LaneHoldState,
  ): void {
    const dlState = this.doubleLongKeyStates.get(noteIndex);

    // 아직 2키 추적이 초기화되지 않은 경우 (1키만 눌려서 시작)
    if (!dlState) {
      // 2키가 됐으면 초기화
      if (holdState.heldKeys.size >= 2) {
        const heldKeysArr = Array.from(holdState.heldKeys);
        this.doubleLongKeyStates.set(noteIndex, {
          key1: { keyCode: heldKeysArr[0], failed: false, judged: false, lastReleaseTimeMs: null },
          key2: { keyCode: heldKeysArr[1], failed: false, judged: false, lastReleaseTimeMs: null },
        });
        return;
      }

      // 1키만 눌려있음 — Good 윈도우 초과 시 미입력 쪽만 부분 실패
      const bodyState = this.longNoteBodyStates.get(noteIndex);
      if (holdState.isHeld && holdState.heldKeys.size === 1) {
        if (bodyState && songTimeMs > bodyState.bodyStartTimeMs + this.windows.GOOD) {
          // 2번째 키 입력 없이 Good 윈도우 초과 → 1키로 초기화 + 미입력 쪽 부분 실패
          const heldKey = Array.from(holdState.heldKeys)[0];
          this.doubleLongKeyStates.set(noteIndex, {
            key1: { keyCode: heldKey, failed: false, judged: false, lastReleaseTimeMs: null },
            key2: { keyCode: '__missing__', failed: true, judged: true, lastReleaseTimeMs: null },
          });
          this.emitJudgment(noteIndex, JudgmentGrade.MISS, 1, 0, true, 'right');
          this.breakCombo();
        }
        return;
      }

      // 키가 전혀 안 눌려있음 → grace period 체크 (2키 추적 전 모두 떼고 grace 초과 → 두 키 모두 Miss)
      if (
        holdState.lastReleaseTimeMs !== null &&
        songTimeMs - holdState.lastReleaseTimeMs > GRACE_PERIOD_MS
      ) {
        this.noteStates.set(noteIndex, NoteState.BODY_FAILED);
        this.doubleLongKeyStates.delete(noteIndex);
        this.emitJudgment(noteIndex, JudgmentGrade.MISS, 0, 0);
        this.emitJudgment(noteIndex, JudgmentGrade.MISS, 1, 0);
        this.breakCombo();
      }
      return;
    }

    // 각 키 독립 체크 — 부분 실패는 키별 1회(subIndex), 두 키 판정되면 judgeDoubleLongKey가 COMPLETE
    for (const keyState of [dlState.key1, dlState.key2]) {
      if (keyState.judged) continue; // 이미 판정된 키는 스킵

      const isKeyHeld = holdState.heldKeys.has(keyState.keyCode);

      if (isKeyHeld) {
        // 키 유지 중 — OK, 릴리즈 기록 클리어
        keyState.lastReleaseTimeMs = null;
        continue;
      }

      // 키가 안 눌려있음
      if (keyState.lastReleaseTimeMs === null) {
        // 첫 릴리즈 감지 — 릴리즈 시간 기록
        keyState.lastReleaseTimeMs = songTimeMs;
        continue;
      }

      // grace period 초과 → 해당 키만 부분 Miss
      if (songTimeMs - keyState.lastReleaseTimeMs > GRACE_PERIOD_MS) {
        const side: 'left' | 'right' = keyState === dlState.key1 ? 'left' : 'right';
        this.judgeDoubleLongKey(noteIndex, dlState, keyState, JudgmentGrade.MISS, 0, side);
      }
    }
  }

  /**
   * 롱노트 바디 끝 판정
   */
  private checkLongNoteBodyEnd(songTimeMs: number): void {
    for (let i = 0; i < this.notes.length; i++) {
      const state = this.noteStates.get(i);
      if (
        state !== NoteState.BODY_ACTIVE &&
        state !== NoteState.BODY_FAILED &&
        state !== NoteState.BODY_AWAITING_RELEASE
      ) {
        continue;
      }

      const note = this.notes[i] as RangeNote;
      const noteEndTime = this.noteEndTimesMs.get(i);
      if (noteEndTime === undefined) continue;

      // --- BODY_FAILED: 끝점 도달 시 COMPLETE (판정은 이미 emit됨) ---
      if (state === NoteState.BODY_FAILED) {
        if (songTimeMs >= noteEndTime) {
          this.noteStates.set(i, NoteState.COMPLETE);
          this.doubleLongKeyStates.delete(i);
        }
        continue;
      }

      // --- BODY_AWAITING_RELEASE: 타임아웃 체크 ---
      if (state === NoteState.BODY_AWAITING_RELEASE) {
        if (songTimeMs > noteEndTime + this.windows.GOOD) {
          // 릴리즈 없이 Good 윈도우 초과 → Miss 타임아웃 (이진 릴리즈 — RFD 0015 §3, late-Bad 폴딩)
          this.emitJudgment(i, JudgmentGrade.MISS, undefined, songTimeMs - noteEndTime);
          this.noteStates.set(i, NoteState.COMPLETE);
          // 소비된 채 keyup 기아로 죽은 릴리즈 노트의 consume 표시 정리 (수명 폐포 — 유일하게
          // 남아 있던 미정리 전이. UNPROCESSED 게이트가 판독을 막아 행동 영향은 없는 위생 정리)
          this.consumedLongKeys.delete(i);
          this.breakCombo();
          // 타임아웃으로 죽은 롱을 잡고 있던 키의 놓기 keyup은 도장 없이 살아있는 이벤트로 남고,
          // 직후 노트 윈도우에 들어가면 그 노트를 살린다 (의도된 관대 — RFD 0015 §7-3).
        }
        continue;
      }

      // --- BODY_ACTIVE: 끝점 도달 체크 ---
      if (songTimeMs < noteEndTime) continue;

      const holdState = this.noteHoldState(note.lane);
      if (!holdState) {
        this.noteStates.set(i, NoteState.COMPLETE);
        continue;
      }

      // 더블롱: 키별 독립 끝점 판정 (스펙 §146 / 분할 릴리즈) — 싱글롱 경로와 분리
      if (note.type === NoteType.DOUBLE_LONG) {
        this.judgeDoubleLongEndpoint(i, note, songTimeMs, noteEndTime, holdState);
        continue;
      }

      if (this.connectionSources.has(i)) {
        // connection 판정: 홀드 중(또는 끝점 기준 grace 이내) → Perfect, 아님 → Miss
        this.judgeConnectionEndpoint(i, noteEndTime, holdState);
      } else {
        // termination 판정
        if (holdState.isHeld) {
          if (isHoldOnlyNote(note)) {
            // hold-only: 끝점 도달 시 유지 중이면 릴리즈를 기다리지 않고 즉시 Perfect.
            // 더블 hold-only는 키별 부분 실패(checkDoubleLongKeyHold)가 바디에서 이미 처리됐고,
            // 끝점에 유지 중인 키(들)에 대해 Perfect를 준다(병렬 — RFD 0005, 1키만 유지 시 그 키만 Perfect).
            this.emitJudgment(i, JudgmentGrade.PERFECT, undefined, 0);
            this.noteStates.set(i, NoteState.COMPLETE);
            this.doubleLongKeyStates.delete(i);
            this.incrementCombo();
          } else {
            // 키 유지 중 → 릴리즈 대기
            this.noteStates.set(i, NoteState.BODY_AWAITING_RELEASE);
          }
        } else if (holdState.lastReleaseTimeMs !== null) {
          // 이미 릴리즈됨 → 릴리즈 시점 기준 판정
          this.executeTerminationJudgment(i, holdState.lastReleaseTimeMs, noteEndTime);
        } else {
          // 릴리즈 기록 없음 → Miss
          this.emitJudgment(i, JudgmentGrade.MISS, undefined, 0);
          this.noteStates.set(i, NoteState.COMPLETE);
          this.breakCombo();
        }
      }
    }
  }

  /**
   * connection 판정 실행 — 끝점 기준 held-or-grace (프레임 독립, 슬라이스3 P4).
   *
   * 스펙 §76: 유예(12ms)는 "끝점 시점에 떼어진 지 얼마나 됐나"의 시간 정의다 — 프레임
   * 시각으로 재면 관측이 밀릴수록 유예가 증발한다(끝점 기준으로 잰다). isHeld는 "끝점 이후
   * 첫 평가 시점의 홀드"인데, 입력 이벤트 경계(pre-mutation)에서도 평가하므로 끝점~프레임
   * 사이에 홀드를 바꾸는 이벤트가 있으면 그 이벤트의 직전 상태가 먼저 판정한다 — 끝점을
   * 걸친 홀드는 뗌 이벤트가 Perfect로 관측하고, 유예 밖 뗌 후 늦은 재잡기는 재잡기 keydown이
   * 직전 상태(미유지)로 Miss를 먼저 확정해 connection을 부활시키지 못한다.
   */
  private judgeConnectionEndpoint(
    noteIndex: number,
    noteEndTimeMs: number,
    holdState: LaneHoldState,
  ): void {
    const heldOrGrace =
      holdState.isHeld ||
      (holdState.lastReleaseTimeMs !== null &&
        noteEndTimeMs - holdState.lastReleaseTimeMs <= GRACE_PERIOD_MS);
    const grade = heldOrGrace ? JudgmentGrade.PERFECT : JudgmentGrade.MISS;
    this.emitJudgment(noteIndex, grade, undefined, 0);
    this.noteStates.set(noteIndex, NoteState.COMPLETE);

    if (this.isComboMaintaining(grade)) {
      this.incrementCombo();
    } else {
      this.breakCombo();
    }
    // 연결은 "계속 잡는 것"이라 release 판정·keyup 소비가 없다 (keyup 소비 대상 아님 — RFD 0015).
  }

  /**
   * 끝점이 지난 BODY_ACTIVE 롱의 입력 이벤트 경계 판정 (홀드 상태 변경 전 호출 — 프레임 독립).
   *
   * connection(슬라이스3 P4)과 hold-only 즉시 Perfect(슬라이스3 P5)는 끝점 판정이 update
   * 프레임에서만 관측되면 끝점~프레임 사이의 홀드 변화가 결과를 왜곡한다. 이벤트 직전
   * 상태로 먼저 판정해 "이벤트 직전 상태 = 직전 이벤트부터 지속된 홀드" 불변을 쓴다.
   */
  private evalEndpointsOnInputBoundary(evalTimeMs: number): void {
    for (let i = 0; i < this.notes.length; i++) {
      if (this.noteStates.get(i) !== NoteState.BODY_ACTIVE) continue;
      const note = this.notes[i];
      const noteEndTime = this.noteEndTimesMs.get(i);
      if (noteEndTime === undefined || evalTimeMs < noteEndTime) continue;
      const holdState = this.noteHoldState(note.lane);
      if (!holdState) continue;
      if (note.type === NoteType.DOUBLE_LONG) {
        // 연결 더블롱만 이벤트 경계 판정 — 유예 밖 뗌 후 같은 키 재잡기가 지연 프레임의
        // held로 부활하는 것을 직전 상태 판정으로 차단한다. 일반/hold-only 더블롱 끝점은
        // 키별 keyup 소비·update 경로가 전담(프레임 무관 요소는 해당 경로가 보장).
        if (this.connectionSources.has(i)) {
          this.judgeDoubleLongEndpoint(i, note as RangeNote, evalTimeMs, noteEndTime, holdState);
        }
        continue;
      }
      if (this.connectionSources.has(i)) {
        this.judgeConnectionEndpoint(i, noteEndTime, holdState);
      } else if (isHoldOnlyNote(note) && holdState.isHeld) {
        // hold-only: 끝점 도달 시 유지 중이면 즉시 Perfect (떼는 타이밍 면제). update 프레임
        // 전용 관측이면 끝점 지나 잡고 있다가 윈도우 밖에서 뗄 때 keyup은 소멸하고 termination
        // 폴백이 Miss를 낸다 — 뗌 직전 상태(held)로 여기서 먼저 확정한다 (슬라이스3 P5).
        // 미유지(직전 상태)면 판정하지 않는다 — 미리-떼기 keyup 소비/termination 폴백 전담.
        this.emitJudgment(i, JudgmentGrade.PERFECT, undefined, 0);
        this.noteStates.set(i, NoteState.COMPLETE);
        this.incrementCombo();
      }
    }
  }

  /**
   * hold-only 슬라이드(길이 0)의 유지 충족 여부.
   * 싱글은 1키라도 눌려 있으면 충족, 더블(DOUBLE_LONG)은 2키가 동시에 눌려 있어야 충족.
   * (길이 0은 바디가 없어 키별 독립 추적을 하지 않으므로 더블은 "둘 다 필요"로 본다.)
   */
  private isHoldOnlySlideHeld(note: NoteEntity, holdState: LaneHoldState | undefined): boolean {
    if (!holdState?.isHeld) return false;
    if (note.type === NoteType.DOUBLE_LONG) return holdState.heldKeys.size >= 2;
    return true;
  }

  /**
   * 길이 0 hold-only(슬라이드) 판정 — 매 프레임 + 입력 이벤트 경계(pre-mutation)에서 호출
   *
   * 노트 시점 ±Good 윈도우 동안 해당 레인이 held이면 Perfect(connection 판정과 같은 Perfect/Miss 이분법).
   * - 노트 시점 도달 + held → 노트 시점에 Perfect (누르고 있는데 Good 경계에서 뜨는 어색함 방지)
   * - 노트 시점 + Good 윈도우 초과까지 held 없음 → Miss
   * 노트 시점 전 윈도우 내 미리-떼기는 onLaneRelease의 keyup 소비 매칭(consumeReleaseTarget)이 담당한다.
   *
   * 프레임 독립: onLanePress/onLaneRelease가 홀드 상태를 바꾸기 전에 이 함수를 이벤트
   * 타임스탬프로 호출한다. 홀드 상태는 이벤트로만 바뀌므로 "이벤트 직전 상태 = 직전
   * 이벤트부터 지속된 홀드"가 성립해, held-Perfect(타임아웃 분기보다 먼저 평가)와
   * 타임아웃-Miss가 프레임 사정과 무관하게 스펙 윈도우대로 갈린다 (슬라이스6 P1).
   */
  private checkLengthZeroHoldOnly(songTimeMs: number): void {
    for (let i = 0; i < this.notes.length; i++) {
      if (this.noteStates.get(i) !== NoteState.UNPROCESSED) continue;
      const note = this.notes[i];
      if (!("endBeat" in note) || !isHoldOnlyNote(note)) continue;

      const noteTime = this.noteTimesMs.get(i);
      const endTime = this.noteEndTimesMs.get(i);
      if (noteTime === undefined || endTime === undefined || endTime !== noteTime) continue;

      const holdState = this.noteHoldState((note as RangeNote).lane);

      // 시작 윈도우(-Good) 진입 + 충족(싱글 1키 / 더블 2키 동시) → consume 표시(후보 제외 조기화).
      // 충족된 슬라이드의 실제 held 키들을 등록해, 직후 노트가 그 입력을 가로채거나
      // 후속 keydown이 이미 충족된 슬라이드를 재consume하는 것을 막는다.
      if (songTimeMs >= noteTime - this.windows.GOOD && this.isHoldOnlySlideHeld(note, holdState)) {
        for (const key of holdState!.heldKeys) this.markLongConsumed(i, key);
      }

      // 더블 길이0 슬라이드: 키별 2판정 (subIndex 0/1)
      if (note.type === NoteType.DOUBLE_LONG) {
        const heldCount = holdState?.heldKeys.size ?? 0;
        if (songTimeMs >= noteTime && heldCount >= 2) {
          // 2키 동시 → Perfect × 2
          this.emitJudgment(i, JudgmentGrade.PERFECT, 0, 0);
          this.emitJudgment(i, JudgmentGrade.PERFECT, 1, 0);
          this.incrementCombo();
          this.incrementCombo();
          this.noteStates.set(i, NoteState.COMPLETE);
          this.consumedLongKeys.delete(i);
          continue;
        }
        if (songTimeMs > noteTime + this.windows.GOOD) {
          // 타임아웃 — 현재 held 키만큼 Perfect, 나머지 Miss (총 2)
          const perfects = Math.min(heldCount, 2);
          for (let s = 0; s < 2; s++) {
            const g = s < perfects ? JudgmentGrade.PERFECT : JudgmentGrade.MISS;
            this.emitJudgment(i, g, s, 0);
            if (this.isComboMaintaining(g)) this.incrementCombo();
            else this.breakCombo();
          }
          this.noteStates.set(i, NoteState.COMPLETE);
          this.consumedLongKeys.delete(i);
        }
        continue;
      }

      // 싱글 길이0 슬라이드: 노트 시점 도달 + held → Perfect (노트 시점에 표시)
      if (songTimeMs >= noteTime && this.isHoldOnlySlideHeld(note, holdState)) {
        this.emitJudgment(i, JudgmentGrade.PERFECT, undefined, 0);
        this.noteStates.set(i, NoteState.COMPLETE);
        this.consumedLongKeys.delete(i);
        this.incrementCombo();
        continue;
      }

      // 노트 시점 + Good 윈도우 초과까지 held 없음 → Miss
      if (songTimeMs > noteTime + this.windows.GOOD) {
        this.emitJudgment(i, JudgmentGrade.MISS, undefined, 0);
        this.noteStates.set(i, NoteState.COMPLETE);
        this.consumedLongKeys.delete(i);
        this.breakCombo();
      }
    }
  }

  /**
   * 타이밍 차이를 기반으로 판정 등급 계산
   */
  private calculateGrade(deltaMs: number): JudgmentGrade {
    const absDelta = Math.abs(deltaMs);

    if (absDelta <= this.windows.PERFECT) {
      return JudgmentGrade.PERFECT;
    } else if (absDelta <= this.windows.GREAT) {
      return JudgmentGrade.GREAT;
    } else if (absDelta <= this.windows.GOOD) {
      return JudgmentGrade.GOOD;
    } else if (absDelta <= this.windows.BAD) {
      return JudgmentGrade.BAD;
    } else {
      return JudgmentGrade.MISS;
    }
  }

  /**
   * Grace 노트 판정 등급 계산 (termination 판정과 동일 모델)
   *
   * Good 윈도우(±120ms) 내 → Perfect, Late Bad(+120~+160ms) → Bad.
   * Early Bad는 발생하지 않는다 (findEarliestUnprocessedNote에서 이미 필터링).
   */
  private calculateGraceGrade(deltaMs: number): JudgmentGrade {
    const absDelta = Math.abs(deltaMs);
    if (absDelta <= this.windows.GOOD) {
      return JudgmentGrade.PERFECT;
    } else if (deltaMs > 0 && deltaMs <= this.windows.BAD) {
      // Late Bad
      return JudgmentGrade.BAD;
    } else {
      return JudgmentGrade.MISS;
    }
  }

  /**
   * termination 판정 실행 (릴리즈 타이밍 기반)
   *
   * 이진 릴리즈 (RFD 0015): Good 윈도우 내 → Perfect, 밖 → Miss.
   * 콤보 처리 + COMPLETE 전환까지 수행.
   */
  private executeTerminationJudgment(
    noteIndex: number,
    releaseTimeMs: number,
    endTimeMs: number,
  ): void {
    const deltaMs = releaseTimeMs - endTimeMs;
    const grade = this.terminationGrade(deltaMs);

    this.emitJudgment(noteIndex, grade, undefined, deltaMs);
    this.noteStates.set(noteIndex, NoteState.COMPLETE);
    this.consumedLongKeys.delete(noteIndex); // 헤드 없는 롱노트 consume 표시 정리(릴리즈 노트 등)

    if (this.isComboMaintaining(grade)) {
      this.incrementCombo();
    } else {
      this.breakCombo();
    }
  }

  /**
   * 콤보 유지 여부 확인
   */
  private isComboMaintaining(grade: JudgmentGrade): boolean {
    return (
      grade === JudgmentGrade.PERFECT ||
      grade === JudgmentGrade.GREAT ||
      grade === JudgmentGrade.GOOD ||
      grade === JudgmentGrade.GOOD_TRILL
    );
  }

  /**
   * 콤보 증가
   */
  private incrementCombo(): void {
    this.currentCombo++;
    if (this.currentCombo > this.maxComboValue) {
      this.maxComboValue = this.currentCombo;
    }
    this.callbacks.onComboUpdate(this.currentCombo, this.maxComboValue);
  }

  /**
   * 콤보 깨짐
   */
  private breakCombo(): void {
    this.currentCombo = 0;
    this.callbacks.onComboUpdate(this.currentCombo, this.maxComboValue);
  }

  /**
   * 판정 결과 발행
   */
  private emitJudgment(
    noteIndex: number,
    grade: JudgmentGrade,
    subIndex: number | undefined,
    deltaMs: number,
    isPartialBodyFail?: boolean,
    failedSide?: 'left' | 'right',
  ): void {
    this.callbacks.onJudgment({
      noteIndex,
      grade,
      subIndex,
      deltaMs,
      ...(isPartialBodyFail ? { isPartialBodyFail: true } : {}),
      ...(failedSide ? { failedSide } : {}),
    });
  }

  /**
   * 더블 롱노트의 키별 홀드 상태 조회 (테스트용)
   */
  getDoubleLongKeyState(noteIndex: number): DoubleLongKeyState | undefined {
    return this.doubleLongKeyStates.get(noteIndex);
  }
}

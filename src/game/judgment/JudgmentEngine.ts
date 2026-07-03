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
  /** 끝점 도달, 키 유지 중 — 릴리즈 대기 (종결 판정) */
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
  /** 레인별 트릴 구간 시작 시간 목록 (정렬됨, 구간 시작 시 교대 상태 리셋용) */
  private readonly trillZoneStartTimesMs: ReadonlyMap<Lane, readonly number[]>;
  /** 레인별 다음으로 처리할 트릴 구간 시작 인덱스 */
  private readonly trillZoneNextIndex: Map<Lane, number> = new Map();
  /** 레인별 현재 활성 트릴 구간의 시작 시간 (경계 입력 추적 판단용) */
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
   * 흡수 대상은 NoteType.LONG(싱글, 필요 키 수 1)과 NoteType.DOUBLE_LONG(필요 키 수 2).
   */
  private readonly headlessLongCache: Map<number, boolean> = new Map();
  /**
   * 헤드 없는 롱노트가 흡수한 keydown 키 집합 (노트별, 재흡수·후보 제외용).
   * 필요 키 수(LONG 1 / DOUBLE_LONG 2)를 채우면 흡수 종료 = 후보에서 빠진다.
   * 길이>0은 BODY_ACTIVE 승격으로도 빠지지만, keydown과 다음 update 사이 프레임,
   * 그리고 BODY 상태가 없는 길이 0 슬라이드/릴리즈 노트를 위해 이 Map으로 추적한다.
   * 슬라이드가 keydown 없이 held로 진입한 경우는 충족 시 실제 held 키들을 등록한다.
   */
  private readonly consumedLongKeys: Map<number, Set<string>> = new Map();
  /**
   * 레인별 공릴리즈 키 (empty release keys) — terminal hold-only/슬라이드를 held로 완료시킨 키 (RFD 0008).
   * 이 키의 release는 "놓기"이므로 직후 노트의 release 판정(끝점 종결·슬라이드 미리-떼기·릴리즈 노트)을
   * 트리거하지 않는다. 키를 떼거나 다시 누르면 정리.
   * 롱노트는 한 레인에서 겹칠 수 없으므로(배치 제약 — 다중키 구간은 doubleLong 한 노트, 경계는 연결),
   * 공릴리즈 키가 다른 진행 중 롱의 키와 충돌하지 않는다 → 예외 없이 무조건 스킵한다.
   */
  private readonly emptyReleaseKeys: Map<Lane, Set<string>> = new Map();
  /**
   * 끝점이 다음 롱노트로 이어지는 노트(연결 판정 대상) 인덱스 집합.
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

    // 헤드 없는 싱글 롱노트 캐시 계산 (흡수 후보 판정용)
    this.computeHeadlessLongCache();

    // 레인 홀드 상태 초기화
    for (const lane of [1, 2, 3, 4] as Lane[]) {
      this.laneHoldStates.set(lane, {
        isHeld: false,
        lastReleaseTimeMs: null,
        heldKeys: new Set(),
      });
      this.emptyReleaseKeys.set(lane, new Set());
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
   * 피하려고 ≤1ms tolerance를 쓴다. 흡수 대상은 LONG(싱글)·DOUBLE_LONG(더블).
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
   * 레인 키 프레스 처리
   */
  onLanePress(lane: Lane, timestampMs: number, keyCode: string): void {
    const holdState = this.laneHoldStates.get(lane);
    if (!holdState) return;

    // 홀드 상태 업데이트
    holdState.heldKeys.add(keyCode);
    holdState.isHeld = true;
    this.emptyReleaseKeys.get(lane)?.delete(keyCode); // 다시 누르면 공릴리즈 해제 (RFD 0008)
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

    // 해당 레인에서 가장 빠른 미처리 노트 찾기
    const targetNoteIndex = this.findEarliestUnprocessedNote(lane, timestampMs);

    if (targetNoteIndex === null) {
      // Bad 윈도우 내에 노트가 없으면 무시
      return;
    }

    const note = this.notes[targetNoteIndex];
    const noteTime = this.noteTimesMs.get(targetNoteIndex);
    if (noteTime === undefined) return;

    const deltaMs = timestampMs - noteTime;

    // 헤드 없는 롱노트: keydown을 흡수만 하고 판정은 emit하지 않는다(held 경로가 전담).
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
   */
  onLaneRelease(lane: Lane, timestampMs: number, keyCode: string): void {
    const holdState = this.laneHoldStates.get(lane);
    if (!holdState) return;

    // 특정 키만 제거
    holdState.heldKeys.delete(keyCode);

    // 더블 롱노트의 키별 릴리즈 시간 기록
    this.updateDoubleLongKeyRelease(lane, keyCode, timestampMs);

    // 끝점 판정 윈도우 내 릴리즈면 다른 키 홀드 여부와 무관하게 판정 시도
    this.tryEndpointJudgmentOnRelease(lane, timestampMs, keyCode);

    // 모든 키가 떼어졌을 때만 레인 릴리스 상태로 전환
    if (holdState.heldKeys.size === 0) {
      holdState.isHeld = false;
      holdState.lastReleaseTimeMs = timestampMs;
      // 길이 0 hold-only(슬라이드): 노트 시점 전 윈도우 내 완전 릴리즈 시 그 시점에 판정
      this.checkSlideReleaseOnRelease(lane, timestampMs, keyCode);
    }

    // 놓기 release 처리 후 공릴리즈 키 해제 (RFD 0008)
    this.emptyReleaseKeys.get(lane)?.delete(keyCode);
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
   * 레인의 모든 키가 릴리즈되었을 때 끝점 판정 시도
   */
  private tryEndpointJudgmentOnRelease(lane: Lane, releaseTimeMs: number, keyCode: string): void {
    let didTerminate = false;
    for (let i = 0; i < this.notes.length; i++) {
      const state = this.noteStates.get(i);
      if (state !== NoteState.BODY_ACTIVE && state !== NoteState.BODY_AWAITING_RELEASE) {
        continue;
      }

      const note = this.notes[i] as RangeNote;
      if (note.lane !== lane) continue;
      // 다른 노트를 완료시킨 "놓기" 키는 끝점 종결을 트리거하지 않음 (RFD 0008)
      if (this.isEmptyRelease(lane, keyCode)) continue;

      const noteEndTime = this.noteEndTimesMs.get(i);
      if (noteEndTime === undefined) continue;

      // 더블롱: 떼어진 키만 키별 종결 판정 (hold-only/연결은 끝점 update가 처리)
      if (note.type === NoteType.DOUBLE_LONG) {
        if (state !== NoteState.BODY_ACTIVE) continue;
        if (isHoldOnlyNote(note)) continue;
        if (this.connectionSources.has(i)) continue;
        if (
          releaseTimeMs < noteEndTime - this.windows.GOOD ||
          releaseTimeMs > noteEndTime + this.windows.BAD
        ) {
          continue;
        }
        const dl = this.doubleLongKeyStates.get(i);
        if (!dl) continue;
        const keyState =
          dl.key1.keyCode === keyCode ? dl.key1 : dl.key2.keyCode === keyCode ? dl.key2 : null;
        if (!keyState || keyState.judged) continue;
        const deltaMs = releaseTimeMs - noteEndTime;
        this.judgeDoubleLongKey(i, dl, keyState, this.terminationGrade(deltaMs), deltaMs);
        didTerminate = true;
        continue;
      }

      if (state === NoteState.BODY_ACTIVE) {
        // 연결은 스트레이 릴리즈로 판정하지 않고 끝점 update(held-or-grace)에 위임한다.
        // (연결 헤드를 친 다른 키의 릴리즈가 연결을 MISS시키거나, 연결을 가로지르는
        //  이어잡기 키 스왑을 깨지 않게 — release 귀속)
        if (this.connectionSources.has(i)) {
          continue;
        }
        // 종결 대상: 끝점 판정 윈도우(Good 이전 ~ Bad 이후) 내 릴리즈 → 릴리즈 타이밍 기반 판정
        if (
          releaseTimeMs >= noteEndTime - this.windows.GOOD &&
          releaseTimeMs <= noteEndTime + this.windows.BAD
        ) {
          this.executeTerminationJudgment(i, releaseTimeMs, noteEndTime);
          didTerminate = true;
        }
      } else {
        // BODY_AWAITING_RELEASE: 끝점 도달 후 릴리즈 대기 중이던 노트
        this.executeTerminationJudgment(i, releaseTimeMs, noteEndTime);
        didTerminate = true;
      }
    }

    // RFD 0011: 종결에 소비된 키는 같은 keyup의 직후 release-대상(슬라이드 미리-떼기 등)으로
    // 번지지 않는다. 공릴리즈 가드를 재사용하며, onLaneRelease 끝에서 키와 함께 해제된다.
    if (didTerminate) this.emptyReleaseKeys.get(lane)?.add(keyCode);
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

    // 트릴 구간 시작 시 교대 추적 상태 리셋
    for (const lane of [1, 2, 3, 4] as Lane[]) {
      const startTimes = this.trillZoneStartTimesMs.get(lane);
      if (!startTimes) continue;
      let nextIdx = this.trillZoneNextIndex.get(lane)!;
      while (nextIdx < startTimes.length && songTimeMs >= startTimes[nextIdx]) {
        this.trillAlternation.set(lane, null);
        this.trillZoneCurrentStartMs.set(lane, startTimes[nextIdx]);
        nextIdx++;
      }
      this.trillZoneNextIndex.set(lane, nextIdx);
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
          // BODY_ACTIVE가 되면 state로 후보 제외되므로 흡수 표시는 정리한다.
          this.consumedLongKeys.delete(i);

          // doubleLong: 현재 눌린 키들로 2키 독립 추적 초기화
          if (note.type === NoteType.DOUBLE_LONG) {
            const holdState = this.laneHoldStates.get(note.lane);
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
  private findEarliestUnprocessedNote(lane: Lane, timestampMs: number): number | null {
    let earliestIndex: number | null = null;
    let earliestTime = Infinity;

    for (let i = 0; i < this.notes.length; i++) {
      const note = this.notes[i];
      if (note.lane !== lane) continue;

      // 바디 노트(RangeNote)는 원칙적으로 입력 대상이 아니나, 헤드 없는 싱글 롱노트가
      // 흡수 종료 전이고 시작 시각 ±Good 윈도우 내이면 keydown 흡수 후보가 된다.
      if ("endBeat" in note) {
        if (!this.isHeadlessConsumable(i, timestampMs)) continue;
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
   * 해당 인덱스의 노트가 "헤드 없는 흡수 가능 싱글 롱노트"인지.
   *
   * 조건: (1) 헤드 없음 캐시 true (NoteType.LONG 한정)
   *       (2) 아직 흡수 종료 안 됨 (UNPROCESSED + consumedLongKeys 미등록)
   *       (3) 시작 시각 ±Good 윈도우 내 (너무 이른/늦은 입력 흡수 방지)
   */
  private isHeadlessConsumable(noteIndex: number, timestampMs: number): boolean {
    if (!this.headlessLongCache.get(noteIndex)) return false;
    if (this.noteStates.get(noteIndex) !== NoteState.UNPROCESSED) return false;
    // 필요 키 수(싱글 1 / 더블 2)를 이미 채웠으면 흡수 종료 → 후보 아님
    const consumed = this.consumedLongKeys.get(noteIndex)?.size ?? 0;
    if (consumed >= this.requiredConsumeCount(noteIndex)) return false;
    const startTime = this.noteTimesMs.get(noteIndex);
    if (startTime === undefined) return false;
    // 흡수 윈도우 = 시작점 허용 구간과 동일한 [-Good, +Good].
    // early Bad/late Bad까지 열면 직후 노트를 과보호하거나 홀드 직전 탭을 삼킨다.
    const deltaMs = timestampMs - startTime;
    return deltaMs >= -this.windows.GOOD && deltaMs <= this.windows.GOOD;
  }

  /** 헤드 없는 롱노트의 흡수 필요 키 수 (싱글 LONG 1 / 더블 DOUBLE_LONG 2). */
  private requiredConsumeCount(noteIndex: number): number {
    return this.notes[noteIndex].type === NoteType.DOUBLE_LONG ? 2 : 1;
  }

  /**
   * 헤드 없는 롱노트의 keydown 흡수 표시 (판정 emit 없음).
   *
   * keydown(또는 held sentinel)을 소비만 한다. 실제 판정은 update()의 held 경로가 전담:
   *  - 길이>0: 자동활성화(BODY_ACTIVE) + checkLongNoteBodyHold / checkDoubleLongKeyHold
   *  - 길이0 슬라이드: checkLengthZeroHoldOnly / checkSlideReleaseOnRelease
   *  - 릴리즈 노트(길이0 일반): BODY_AWAITING_RELEASE + keyup 종결 판정
   * BODY_ACTIVE로 강제 승격하지 않는다 — 시작점 허용 윈도우를 우회하면 판정 타이밍이 왜곡된다.
   * 키 집합으로 추적해 같은 프레임/윈도우의 후속 keydown이 노트를 재흡수해 다음 노트를 막는 것을
   * 방지하고, 더블 롱노트는 서로 다른 키 2개를 채워야 흡수 종료된다(같은 키 재입력은 무효).
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
   * held로 완료된 노트를 유지하던 키(완료 시점의 실제 held 키)를 레인의 공릴리즈 집합에 추가 (RFD 0008).
   * 완료 시점의 held 키를 쓰므로, 흡수 없이 held로 진입한 pre-held 케이스도 닫힌다.
   */
  private markEmptyRelease(lane: Lane): void {
    const holdState = this.laneHoldStates.get(lane);
    const emptySet = this.emptyReleaseKeys.get(lane);
    if (!holdState || !emptySet) return;
    // RFD 0012: held 키가 이미 이 레인의 다른 롱노트 바디를 유지(load-bearing) 중이면
    // 놓기 도장을 찍지 않는다. 한 프레임이 이 노트의 held 완료(부여)와 다음 롱의 바디 시작(회수)을
    // 함께 덮을 때, update() pass 순서(Hold 회수 → End 부여)로 회수가 no-op이 되고 도장이 잔류하는
    // 것을 막는다. (checkLongNoteBodyHold의 회수는 부여가 먼저 일어나는 다중 프레임 케이스 담당 —
    // 둘이 상호보완이라 프레임 정렬과 무관하게 견고. 완료 노트는 이미 COMPLETE라 여기 안 걸린다.)
    // load-bearing = BODY_ACTIVE(유지 성립: hasBeenPressed) 또는 BODY_AWAITING_RELEASE
    // (끝점 지나 release 대기 중 — 그 키의 다음 release가 곧 종결이라 놓기가 아님. 도달 자체가 held 전제).
    for (let j = 0; j < this.notes.length; j++) {
      const st = this.noteStates.get(j);
      if (st !== NoteState.BODY_ACTIVE && st !== NoteState.BODY_AWAITING_RELEASE) continue;
      if ((this.notes[j] as RangeNote).lane !== lane) continue;
      if (st === NoteState.BODY_AWAITING_RELEASE || this.longNoteBodyStates.get(j)?.hasBeenPressed === true) return;
    }
    for (const k of holdState.heldKeys) emptySet.add(k);
  }

  /** 그 키의 release가 "놓기"(공릴리즈)인지 — 직후 노트의 release 판정을 막는다 (RFD 0008) */
  private isEmptyRelease(lane: Lane, keyCode: string): boolean {
    return this.emptyReleaseKeys.get(lane)?.has(keyCode) === true;
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
  private processTrillNoteInput(
    noteIndex: number,
    deltaMs: number,
    keyCode: string,
    lane: Lane,
  ): void {
    const note = this.notes[noteIndex];
    const isGrace = isGraceNote(note);
    const lastKeyCode = this.trillAlternation.get(lane);
    let grade = isGrace ? this.calculateGraceGrade(deltaMs) : this.calculateGrade(deltaMs);

    // 교대 체크 (첫 트릴이 아닌 경우) — Grace여도 교대 실패는 Good◇
    if (lastKeyCode !== null && keyCode === lastKeyCode) {
      grade = JudgmentGrade.GOOD_TRILL;
    }

    // 노트의 원래 위치가 현재 활성 트릴 구간에 속하는지 확인
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

      const holdState = this.laneHoldStates.get(note.lane);
      if (!holdState) continue;

      // 1. 시작점 허용 구간 (+120ms)
      if (!bodyState.hasBeenPressed) {
        if (songTimeMs <= bodyState.bodyStartTimeMs + this.windows.GOOD) {
          if (holdState.isHeld) {
            bodyState.hasBeenPressed = true;

            // RFD 0012: 이 바디를 유지하기 시작한 held 키는 이제 load-bearing이므로,
            // 이전 hold-only 완료로 남은 공릴리즈 도장이 있으면 회수한다(놓기 대상 → 종결 유지 키).
            // 안 그러면 안 떼고 이어잡은 키의 낡은 도장이 이 노트의 정당한 종결 release를 막는다.
            const emptySet = this.emptyReleaseKeys.get(note.lane);
            if (emptySet) for (const k of holdState.heldKeys) emptySet.delete(k);

            // doubleLong: 허용 구간 내 키 입력 시 2키 추적 초기화/업데이트
            if (note.type === NoteType.DOUBLE_LONG && !this.doubleLongKeyStates.has(i)) {
              const heldKeysArr = Array.from(holdState.heldKeys);
              if (heldKeysArr.length >= 2) {
                this.doubleLongKeyStates.set(i, {
                  key1: { keyCode: heldKeysArr[0], failed: false, judged: false, lastReleaseTimeMs: null },
                  key2: { keyCode: heldKeysArr[1], failed: false, judged: false, lastReleaseTimeMs: null },
                });
              }
              // 1키만 눌려있으면 아직 대기 — 허용 구간 내에서 2번째 키 입력을 기다림
            }
          }
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

  /** 종결 판정 등급: Good 이상은 Perfect로 상향, 그 외(Bad/Miss)는 그대로 */
  private terminationGrade(deltaMs: number): JudgmentGrade {
    const grade = this.calculateGrade(deltaMs);
    if (
      grade === JudgmentGrade.GOOD ||
      grade === JudgmentGrade.GREAT ||
      grade === JudgmentGrade.PERFECT
    ) {
      return JudgmentGrade.PERFECT;
    }
    return grade;
  }

  /**
   * 더블롱 끝점 키별 판정 (BODY_ACTIVE, songTime>=noteEndTime).
   * 일반: 각 키의 release 타이밍으로 종결(미릴리즈는 end+BAD에 Miss).
   * hold-only: 유지/grace 키는 Perfect(떼는 판정 면제). 연결: 키별 held/grace → Perfect/Miss.
   * 두 키 모두 판정되면 COMPLETE (judgeDoubleLongKey 내부에서).
   */
  private judgeDoubleLongEndpoint(
    noteIndex: number,
    note: RangeNote,
    songTimeMs: number,
    noteEndTime: number,
    holdState: LaneHoldState,
  ): void {
    const dl = this.doubleLongKeyStates.get(noteIndex);
    if (!dl) {
      // 2키 추적이 한 번도 없었음(2키 입력 없음) → 두 키 모두 Miss
      this.emitJudgment(noteIndex, JudgmentGrade.MISS, 0, 0);
      this.emitJudgment(noteIndex, JudgmentGrade.MISS, 1, 0);
      this.breakCombo();
      this.noteStates.set(noteIndex, NoteState.COMPLETE);
      return;
    }

    const isConnection = this.connectionSources.has(noteIndex);
    const holdOnly = isHoldOnlyNote(note);

    for (const keyState of [dl.key1, dl.key2]) {
      if (keyState.judged) continue;
      const held = holdState.heldKeys.has(keyState.keyCode);

      if (isConnection) {
        // 연결: 키별 held/grace → Perfect, 아님 → Miss (공릴리즈로 표시 안 함)
        const grace =
          keyState.lastReleaseTimeMs !== null &&
          songTimeMs - keyState.lastReleaseTimeMs <= GRACE_PERIOD_MS;
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
        // 일반, 아직 유지 중 — end+BAD 초과면 타임아웃 Miss, 아니면 release까지 대기
        if (songTimeMs > noteEndTime + this.windows.BAD) {
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

    // hold-only는 held로 완료 시 유지 키를 공릴리즈로 표시 (직후 "놓기" release 차단, RFD 0008)
    if (holdOnly) this.markEmptyRelease(note.lane);
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
        if (songTimeMs > noteEndTime + this.windows.BAD) {
          // 릴리즈 없이 BAD 윈도우 초과 → Miss 타임아웃
          this.emitJudgment(i, JudgmentGrade.MISS, undefined, songTimeMs - noteEndTime);
          this.noteStates.set(i, NoteState.COMPLETE);
          this.breakCombo();
          // RFD 0012: keyup 종결이면 0011의 didTerminate 도장이 놓기 누설을 막지만, 타임아웃으로
          // 죽은 롱은 그 도장을 못 남긴다. 죽은 롱을 아직 잡고 있는 키의 다음 release는 "놓기"이므로
          // 여기서 공릴리즈 표시 → keyup/타임아웃 어느 경로로 죽든 프레임 정렬과 무관하게 닫힌다.
          // (markEmptyRelease의 load-bearing 스캔이, 그 사이 새 롱 유지가 시작된 경우는 걸러낸다.)
          this.markEmptyRelease(note.lane);
        }
        continue;
      }

      // --- BODY_ACTIVE: 끝점 도달 체크 ---
      if (songTimeMs < noteEndTime) continue;

      const holdState = this.laneHoldStates.get(note.lane);
      if (!holdState) {
        this.noteStates.set(i, NoteState.COMPLETE);
        continue;
      }

      // 더블롱: 키별 독립 끝점 판정 (스펙 §146 / 분할 릴리즈) — 싱글롱 경로와 분리
      if (note.type === NoteType.DOUBLE_LONG) {
        this.judgeDoubleLongEndpoint(i, note, songTimeMs, noteEndTime, holdState);
        continue;
      }

      const isConnection = this.connectionSources.has(i);
      const isHeldOrGrace =
        holdState.isHeld ||
        (holdState.lastReleaseTimeMs !== null &&
          songTimeMs - holdState.lastReleaseTimeMs <= GRACE_PERIOD_MS);

      if (isConnection) {
        // 연결 판정: 홀드 중(또는 grace 이내) → Perfect, 아님 → Miss
        const grade = isHeldOrGrace ? JudgmentGrade.PERFECT : JudgmentGrade.MISS;
        this.emitJudgment(i, grade, undefined, 0);
        this.noteStates.set(i, NoteState.COMPLETE);

        if (this.isComboMaintaining(grade)) {
          this.incrementCombo();
        } else {
          this.breakCombo();
        }
        // 연결은 "계속 잡는 것"이라 공릴리즈로 표시하지 않는다(놓기가 아님). 공릴리즈는 terminal hold-only/슬라이드만.
      } else {
        // 종결 판정
        if (holdState.isHeld) {
          if (isHoldOnlyNote(note)) {
            // hold-only: 끝점 도달 시 유지 중이면 릴리즈를 기다리지 않고 즉시 Perfect.
            // 더블 hold-only는 키별 부분 실패(checkDoubleLongKeyHold)가 바디에서 이미 처리됐고,
            // 끝점에 유지 중인 키(들)에 대해 Perfect를 준다(병렬 — RFD 0005, 1키만 유지 시 그 키만 Perfect).
            this.emitJudgment(i, JudgmentGrade.PERFECT, undefined, 0);
            this.noteStates.set(i, NoteState.COMPLETE);
            this.doubleLongKeyStates.delete(i);
            this.incrementCombo();
            // held로 완료 → 유지 키를 공릴리즈로 표시 (직후 "놓기" release 차단, RFD 0008)
            this.markEmptyRelease(note.lane);
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
   * 길이 0 hold-only(슬라이드) 판정 — 매 프레임 호출
   *
   * 노트 시점 ±Good 윈도우 동안 해당 레인이 held이면 Perfect(연결 판정과 같은 Perfect/Miss 이분법).
   * - 노트 시점 도달 + held → 노트 시점에 Perfect (누르고 있는데 Good 경계에서 뜨는 어색함 방지)
   * - 노트 시점 + Good 윈도우 초과까지 held 없음 → Miss
   * 노트 시점 전 윈도우 내 릴리즈 시점 판정은 onLaneRelease의 checkSlideReleaseOnRelease가 담당한다.
   */
  private checkLengthZeroHoldOnly(songTimeMs: number): void {
    for (let i = 0; i < this.notes.length; i++) {
      if (this.noteStates.get(i) !== NoteState.UNPROCESSED) continue;
      const note = this.notes[i];
      if (!("endBeat" in note) || !isHoldOnlyNote(note)) continue;

      const noteTime = this.noteTimesMs.get(i);
      const endTime = this.noteEndTimesMs.get(i);
      if (noteTime === undefined || endTime === undefined || endTime !== noteTime) continue;

      const holdState = this.laneHoldStates.get((note as RangeNote).lane);

      // 시작 윈도우(-Good) 진입 + 충족(싱글 1키 / 더블 2키 동시) → 흡수 표시(후보 제외 조기화).
      // 충족된 슬라이드의 실제 held 키들을 등록해, 직후 노트가 그 입력을 가로채거나
      // 후속 keydown이 이미 충족된 슬라이드를 재흡수하는 것을 막는다.
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
          this.markEmptyRelease((note as RangeNote).lane);
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
          if (perfects > 0) this.markEmptyRelease((note as RangeNote).lane);
        }
        continue;
      }

      // 싱글 길이0 슬라이드: 노트 시점 도달 + held → Perfect (노트 시점에 표시)
      if (songTimeMs >= noteTime && this.isHoldOnlySlideHeld(note, holdState)) {
        this.emitJudgment(i, JudgmentGrade.PERFECT, undefined, 0);
        this.noteStates.set(i, NoteState.COMPLETE);
        this.consumedLongKeys.delete(i);
        this.incrementCombo();
        // held로 완료 → 유지 키를 공릴리즈로 표시 (RFD 0008)
        this.markEmptyRelease((note as RangeNote).lane);
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
   * 길이 0 hold-only(슬라이드) 릴리즈 시점 판정 — 레인의 모든 키가 떼어졌을 때 호출
   *
   * 노트 시점 전 Good 윈도우 내에서 완전히 떼면, 그 직전까지 눌려 있었으므로
   * 떼는 시점에 Perfect를 부여한다(미리 떼는 케이스의 표시 시점).
   */
  private checkSlideReleaseOnRelease(lane: Lane, releaseTimeMs: number, keyCode: string): void {
    for (let i = 0; i < this.notes.length; i++) {
      if (this.noteStates.get(i) !== NoteState.UNPROCESSED) continue;
      const note = this.notes[i];
      if (!("endBeat" in note) || !isHoldOnlyNote(note)) continue;
      if ((note as RangeNote).lane !== lane) continue;
      // 다른 노트를 완료시킨 "놓기" 키는 슬라이드 미리-떼기를 트리거하지 않음 (RFD 0008)
      if (this.isEmptyRelease(lane, keyCode)) continue;
      // 더블 hold-only 슬라이드는 노트 시점의 2키 동시 held만 인정(미리 떼기 Perfect 미지원).
      if (note.type === NoteType.DOUBLE_LONG) continue;

      const noteTime = this.noteTimesMs.get(i);
      const endTime = this.noteEndTimesMs.get(i);
      if (noteTime === undefined || endTime === undefined || endTime !== noteTime) continue;

      // 노트 시점 전 Good 윈도우 내 완전 릴리즈 → Perfect (떼는 시점)
      if (releaseTimeMs >= noteTime - this.windows.GOOD && releaseTimeMs < noteTime) {
        this.emitJudgment(i, JudgmentGrade.PERFECT, undefined, releaseTimeMs - noteTime);
        this.noteStates.set(i, NoteState.COMPLETE);
        this.consumedLongKeys.delete(i);
        this.incrementCombo();
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
   * Grace 노트 판정 등급 계산 (종결 판정과 동일 모델)
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
   * 종결 판정 실행 (릴리즈 타이밍 기반)
   *
   * Good 이상 → Perfect로 상향, Bad → Bad, Miss → Miss.
   * 콤보 처리 + COMPLETE 전환까지 수행.
   */
  private executeTerminationJudgment(
    noteIndex: number,
    releaseTimeMs: number,
    endTimeMs: number,
  ): void {
    const deltaMs = releaseTimeMs - endTimeMs;
    let grade = this.calculateGrade(deltaMs);

    if (
      grade === JudgmentGrade.GOOD ||
      grade === JudgmentGrade.GREAT ||
      grade === JudgmentGrade.PERFECT
    ) {
      grade = JudgmentGrade.PERFECT;
    }

    this.emitJudgment(noteIndex, grade, undefined, deltaMs);
    this.noteStates.set(noteIndex, NoteState.COMPLETE);
    this.consumedLongKeys.delete(noteIndex); // 헤드 없는 롱노트 흡수 표시 정리(릴리즈 노트 등)

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
